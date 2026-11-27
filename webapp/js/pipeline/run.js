// Region finding and reading retain their work records so retries can reuse them.

import * as P from "./prompts.js?v=20261127-close-contents";
import * as S from "./steps.js?v=20261127-close-contents";
import * as I from "./images.js?v=20261127-close-contents";
import { readerById, readerOptions, usageCost, geminiReadingRequest } from "./readers.js?v=20261127-close-contents";
import * as Split from "./split.js?v=20261127-close-contents";
import { markersFromQuotes } from "../note-links.js?v=20261127-close-contents";
import { localReading, localLayout, localLines } from "./ocr.js?v=20261127-close-contents";
import { classifyBlocks } from "../local/blocks.js?v=20261127-close-contents";
import { finderById, finderPath } from "./finders.js?v=20261127-close-contents";
import { finderRequest } from "./finder-requests.js?v=20261127-close-contents";
import { planReading, combineReading, retainedParts, partTotals, readingFits, readingGeometry, sameReadingSource } from "./partial-reading.js?v=20261127-close-contents";
import { visionRequest, visionReading, visionCost, VISION_PARSE } from "./vision.js?v=20261127-close-contents";
import { bbox } from "../render.js?v=20261127-close-contents";
import { canonical } from "../ops.js?v=20261127-close-contents";
import { proposingPrompt, proposingSchema, scaleProposingRegions } from "./proposing-finder.js?v=20261127-close-contents";

export const REQUEST_TIMEOUT_MS = 75000;

let TEMPLATES = null;
export async function templates() {
  if (!TEMPLATES) {
    const get = async (name, json) => { const r = await fetch(new URL(`../../pipeline/${name}`, import.meta.url)); return json ? r.json() : r.text(); };
    TEMPLATES = { regionPrompt: await get("regions-prompt-template.txt"), regionSchema: await get("regions-schema-template.json", true),
                  proposingPrompt: await get("regions-proposals-prompt-template.txt"), proposingSchema: await get("regions-proposals-schema-template.json", true),
                  regionPricing: await get("regions-pricing.json", true) };
  }
  return TEMPLATES;
}

async function dataUrlOf(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${blob.type || "image/png"};base64,${btoa(s)}`;
}

// A page image for a request with a size limit (Cloud Vision's 10 MB of JSON): as it is if it fits, else the same pixels
// as JPEG, at the same size so that the coordinates read from it are the page's. A colour scan rendered as PNG can be
// too large.
async function compactDataUrl(blob, limit = 9500000) {
  const url = await dataUrlOf(blob);
  if (url.length - url.indexOf(",") - 1 <= limit) return url;
  const bitmap = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  canvas.getContext("2d").drawImage(bitmap, 0, 0);
  bitmap.close?.();
  for (const quality of [0.92, 0.85, 0.75]) {
    const jpeg = await dataUrlOf(await canvas.convertToBlob({ type: "image/jpeg", quality }));
    if (jpeg.length - jpeg.indexOf(",") - 1 <= limit) return jpeg;
  }
  return url;
}

const normalMarker = token => [...token].map(c => "೦೧೨೩೪೫೬೭೮೯".includes(c) ? String("೦೧೨೩೪೫೬೭೮೯".indexOf(c)) : "०१२३४५६७८९".includes(c) ? String("०१२३४५६७८९".indexOf(c)) : c).join("").replace(/^0+(?=\d)/, "");

// The Tesseract language for a text by its main script (the bundled kan, san and eng), or null for no letters.
function scriptLanguage(text) {
  const counts = { kan: 0, san: 0, eng: 0 };
  for (const ch of text || "") {
    if (/\p{Script=Kannada}/u.test(ch)) counts.kan++;
    else if (/\p{Script=Devanagari}/u.test(ch)) counts.san++;
    else if (/\p{Script=Latin}/u.test(ch)) counts.eng++;
  }
  const [best, count] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return count ? best : null;
}

async function sha256(blob) {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()));
  return [...d].map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function post(provider, payload, key, auth = {}) {
  if (!key) throw new Error(`Add the ${provider} API key under API keys.`);
  const headers = provider === "openai" ? { Authorization: `Bearer ${key}`, "Content-Type": "application/json" } : { "x-goog-api-key": key, "Content-Type": "application/json" };
  if (provider === "vision" && auth.mode === "oauth") {
    delete headers["x-goog-api-key"];
    headers.Authorization = `Bearer ${key}`;
    if (auth.project) headers["x-goog-user-project"] = auth.project;
  }
  const t0 = performance.now();
  const timeout = AbortSignal.timeout(auth.timeout_ms || REQUEST_TIMEOUT_MS);
  const signal = auth.signal ? AbortSignal.any([auth.signal, timeout]) : timeout;
  const r = await fetch(S.ENDPOINTS[provider], { method: "POST", headers, body: JSON.stringify(payload), signal });
  const raw = await r.json().catch(() => null);
  const body = raw?.interaction || raw;
  if (!r.ok) throw new Error(`${provider} HTTP ${r.status}${body?.error?.message ? ": " + body.error.message : ""}`);
  if (provider === "openai" && body.status && body.status !== "completed") throw new Error(`the response is ${body.status}${body.incomplete_details ? ": " + JSON.stringify(body.incomplete_details) : ""}`);
  return { body, seconds: (performance.now() - t0) / 1000 };
}

export class Maker {
  constructor(book, { outlines, keys = {}, request = post, images = I, recognize = localReading, layout = localLayout, readLines = localLines, onCost = () => {} }) {
    this.book = book;
    this.outlines = outlines;
    this.keys = keys;
    this.request = request;
    this.images = images;
    this.recognize = recognize;
    this.readLines = readLines;
    this.layout = layout;
    this.onCost = onCost;
    this.jobs = new Map();
    this.previewCache = new Map();
  }

  image(pid) { return this.book.imageBlob(pid); }

  regionFingerprint(profile, imageHash, options) {
    return jsonHash({ image: imageHash, method: profile.method, types: this.book.types,
      ...(profile.id === "tesseract-regions" ? { languages: options.ocr_languages } : {}) });
  }

  async findRegions(pid, { force = false, finder } = {}) {
    const options = await this.options(), profile = finderById(finder || options.finder), tl = this.book.types;
    const file = await this.image(pid), imageHash = await sha256(file);
    const fingerprint = await this.regionFingerprint(profile, imageHash, options);
    const path = finderPath(pid, profile.id);
    if (!force) {
      const cached = await this.book.readWork(path);
      if (cached?.image_sha256 === imageHash && cached.fingerprint === fingerprint) {
        return { ...cached, cached: true };
      }
    }
    const bitmap = await createImageBitmap(file);
    const W = bitmap.width, H = bitmap.height;
    bitmap.close?.();
    const started = performance.now();
    let regions, warnings, res, regionCall, typeProposals = null;
    if (profile.provider === "local") {
      if (!this.outlines) throw new Error("Local region finding needs the page's line analysis.");
      let blocks;
      if (profile.id === "tesseract-regions") {
        const recognized = await this.layout(await this.book.imageUrl(pid), options.ocr_languages);
        blocks = recognized.blocks;
        res = await this.outlines(pid, await this.book.imageUrl(pid), blocks.map(block => block.box));
      } else {
        res = await this.outlines(pid, await this.book.imageUrl(pid), null);
        blocks = res.blocks;
      }
      if (res.error) throw new Error(res.error);
      regions = classifyBlocks(blocks, W, H, tl);
      warnings = ["Coarse local blocks need review of their grouping, types and reading order.", ...(res.warnings || [])];
      regionCall = { model: profile.model, cost_usd: 0, seconds: (performance.now() - started) / 1000,
        ...(profile.id === "tesseract-regions" ? { languages: options.ocr_languages } : {}) };
      this.onCost(0);
    } else {
      const t = await templates();
      const payload = profile.proposals
        ? finderRequest(profile, proposingPrompt(tl, t.proposingPrompt), proposingSchema(tl, t.proposingSchema), await dataUrlOf(file))
        : finderRequest(profile, P.regionPrompt(tl, t.regionPrompt), P.regionSchema(tl, t.regionSchema), await dataUrlOf(file));
      const call = await this.callJSON(pid, "regions", profile, payload,
        parsed => profile.proposals ? scaleProposingRegions(parsed, W, H, tl) : S.scaleRegions(parsed, W, H, tl), profile.provider === "openai"
          ? (usage, body) => S.openaiCost(usage, profile.pricing || t.regionPricing, body.service_tier) : null);
      ({ regions, warnings } = call.parsed);
      if (profile.proposals) typeProposals = call.parsed.proposals;
      const empty = { geometry: [], charH: 0, angle: 0, method: "094-illumination-flattened-ink" };
      res = this.outlines ? await this.outlines(pid, await this.book.imageUrl(pid), regions.map(region => region.box)) : empty;
      if (!regions.length && res.error) res = empty;
      if (res.error) throw new Error(res.error);
      regionCall = { model: call.response.model, response_id: call.response.id, usage: call.response.usage,
        cost_usd: call.cost_usd, seconds: call.seconds, output: profile.provider === "openai" ? S.openaiText(call.response) : S.geminiText(call.response), path: call.path };
    }
    const out = { format: "page-regions", page: pid, profile, fingerprint,
      width: W, height: H, image_sha256: imageHash, char_h: res.charH, page_angle_deg: res.angle, local_method: res.method,
      regions: S.regionRecords(regions, res.geometry), uncovered_lines: res.uncovered || [], warnings,
      region_call: regionCall, made_at_utc: new Date().toISOString(), ...(typeProposals ? { type_proposals: typeProposals } : {}) };
    await this.book.writeWork(path, out);
    return out;
  }

  async options() {
    return readerOptions(await this.book.getReaderOptions(), this.book.types);
  }

  async imageSet(pid, file, rec, sent, fingerprint) {
    if (!this.previewCache.has(fingerprint)) {
      const job = (async () => {
        const bitmap = await createImageBitmap(file);
        try {
          const cfg = S.SETTINGS.transcription;
          const images = { overview: await this.images.overview(bitmap, sent.map(s => [s.rid, s.region]), rec.char_h, cfg), cutouts: {} };
          for (const s of sent.filter(s => s.line_ids.length)) images.cutouts[s.rid] = await this.images.cutout(bitmap, s.region, rec.char_h, cfg);
          return images;
        } finally { bitmap.close?.(); }
      })();
      this.previewCache.set(fingerprint, job);
      while (this.previewCache.size > 3) this.previewCache.delete(this.previewCache.keys().next().value);
      job.catch(() => this.previewCache.delete(fingerprint));
    }
    return this.previewCache.get(fingerprint);
  }

  async saveCall(record, path) {
    await this.book.writeWork(path, record);
    await this.book.updateWork("work/reader-lab/ledger.json", old => ({ format: "reader-ledger", version: 1,
      calls: [...(old?.calls || []).filter(call => call.id !== record.id), { id: record.id, path, page: record.page,
        stage: record.stage, profile: record.profile.id, status: record.status, cost_usd: record.cost_usd ?? null,
        seconds: record.seconds ?? null, ...(record.partial ? { partial: true, region_ids: record.region_ids } : {}) }] }));
  }

  async callJSON(pid, stage, profile, payload, validate, cost = null, parse = null, scope = {}) {
    const provider = profile.provider, key = this.keys[provider];
    const requestHash = await jsonHash(payload);
    const partKey = scope.partial && await jsonHash({ requestHash, regions: scope.region_ids });
    const partPath = scope.partial ? `work/reading-parts/${pid}/${profile.id}/${partKey}.json` : null;
    if (partPath) {
      const saved = await this.book.readWork(partPath);
      if (saved?.path) {
        const record = await this.book.readWork(saved.path);
        if (record?.status === "completed" && record.request_sha256 === requestHash) {
          const parsed = parse ? parse(record.response) : record.parsed;
          validate(parsed);
          await this.saveCall(record, saved.path);
          if (this.failedCallPath === saved.path) { this.persistenceFailure = null; this.failedCallPath = null; }
          return { ...record, parsed, path: saved.path, cached: true };
        }
        if (record?.status === "requesting" || record?.status === "failed" && record.cost_usd == null)
          throw new Error("An earlier partial transcription has an unresolved call. Review its saved attempt before requesting a fresh whole-page result.");
      }
    }
    if (!key) throw new Error(`Add a ${provider === "vision" ? "Cloud Vision credential" : provider === "openai" ? "OpenAI API key" : "Gemini API key"} for ${stage}.`);
    if (this.persistenceFailure) throw new Error(this.persistenceFailure);
    const id = crypto.randomUUID(), started = new Date().toISOString();
    const path = `work/reader-calls/${pid}/${stage}-${id}.json`;
    const record = { format: "reader-call", version: 1, id, page: pid, stage, profile, started_at_utc: started,
      request_sha256: requestHash, request: JSON.parse(JSON.stringify(payload, (key, value) =>
        key === "data" || key === "image_url" || provider === "vision" && key === "content" ? "<image rebuilt from the book's source>" : value)),
      status: partPath ? "prepared" : "requesting", ...scope };
    await this.book.writeWork(path, record);
    if (partPath) {
      await this.book.writeWork(partPath, { format: "reading-part-call", version: 1, path, request_sha256: requestHash });
      record.status = "requesting";
    }
    await this.saveCall(record, path);
    try {
      const { body, seconds } = await this.request(provider, payload, key, { mode: this.keys.vision_auth, project: this.keys.vision_project,
        timeout_ms: profile.request_timeout_ms });
      Object.assign(record, { response: body, seconds, usage: body.usage || null,
        cost_usd: cost ? cost(body.usage, body) : usageCost(body.usage, profile, started) });
      if (body.status && body.status !== "completed") throw new Error(`The ${stage} response is ${body.status}.`);
      if (parse) record.parsed = validate(parse(body));
      else {
        const text = provider === "openai" ? S.openaiText(body) : S.geminiText(body);
        if (!text) throw new Error(`The ${stage} response has no text.`);
        record.parsed = validate(JSON.parse(text));
      }
      record.status = "completed";
    } catch (error) {
      record.status = "failed";
      record.error = String(error.message).replaceAll(key, "[redacted]");
    }
    this.onCost(record.cost_usd ?? null);
    try {
      await this.saveCall(record, path);
    } catch (error) {
      this.persistenceFailure = `Could not save the ${stage} call record. Further API calls are stopped. ${error.message}`;
      this.failedCallPath = path;
      throw new Error(this.persistenceFailure);
    }
    if (record.status === "failed") {
      const error = new Error(record.error);
      error.record = record;
      throw error;
    }
    return { ...record, path, cached: false };
  }

  async read(pid, record, options = null, { force = false, progress } = {}) {
    const all = readerOptions(options || await this.book.getReaderOptions(), this.book.types);
    const chosen = { reader: all.reader, ocr_languages: all.ocr_languages };
    const profile = readerById(chosen.reader), key = `read:${pid}:${JSON.stringify(chosen)}`;
    const job = this.jobs.get(key) || this.readPage(pid, record, chosen, profile, { force, progress });
    this.jobs.set(key, job);
    try { return await job; } finally { if (this.jobs.get(key) === job) this.jobs.delete(key); }
  }

  // Lines a whole-page reader left empty that are lines, not fragments (wordsToReading `missed`), are read alone by the
  // local OCR, in the language of the block's script. The block stays uncertain, its note naming the lines so read.
  async fillMissed(file, parsed, sent) {
    const wanted = [];
    for (const region of parsed.regions) for (const n of region.missed || []) {
      const source = sent.find(value => value.rid === region.id), id = source?.line_ids[n - 1];
      const polygons = source?.region.lines.find(line => line.line_id === id)?.polygons;
      if (!polygons?.length) continue;
      const [x0, y0, x1, y1] = bbox(polygons), pad = 0.2 * (y1 - y0);
      wanted.push({ key: `${region.id}#${n}`, box: [Math.max(0, x0 - 2 * pad), Math.max(0, y0 - pad), x1 + 2 * pad, y1 + pad], region, n });
    }
    if (!wanted.length) return parsed;
    const page = parsed.regions.flatMap(region => region.lines.map(line => line.text)).join(" ");
    const byLanguage = new Map();
    for (const item of wanted) {
      const language = scriptLanguage(item.region.lines.map(line => line.text).join(" ")) || scriptLanguage(page) || "eng";
      byLanguage.set(language, [...(byLanguage.get(language) || []), item]);
    }
    for (const [language, items] of byLanguage) {
      let read;
      try { read = await this.readLines(file, items, language); } catch (error) { console.warn("Reading missed lines failed", error); continue; }
      for (const { key, region, n } of items) {
        const text = read.get(key)?.trim();
        if (!text) continue;
        region.lines[n - 1].text = text;
        region.filled = [...(region.filled || []), n];
      }
    }
    for (const region of parsed.regions) if (region.filled) region.note = `${region.note || ""} Line ${region.filled.join(", ")} was read by Tesseract (${[...byLanguage.keys()].join(", ")}), as Cloud Vision found no words there: check it.`.trim();
    return parsed;
  }

  // Cloud Vision reads a note marker as an ordinary number or sign standing apart ("... it was so. 2 Then ..."), or not at
  // all. A number or sign standing alone in the text (not beside a danda or a dash: a verse's number, a range) that a
  // note on the page begins with is written as a marker, [2], in the notes' order: the reading's lines make it a marker
  // span, which the book's note rule links to the note with that number.
  markNoteNumbers(parsed, sent) {
    const types = this.book.types.types, typeOf = new Map(sent.map(source => [source.rid, source.region.type]));
    const isNote = id => types[typeOf.get(id)]?.region === "note";
    const keys = [];
    for (const region of parsed.regions) if (isNote(region.id)) {
      const found = /^\s*([0-9೦-೯०-९]{1,3}|[*†]{1,3})\s*[.)]?\s/u.exec(region.lines[0]?.text || "");
      if (found) keys.push(normalMarker(found[1]));
    }
    if (!keys.length) return parsed;
    const order = new Map(sent.map((source, index) => [source.rid, source.region.reading_order ?? 1e6 + index]));
    let last = 0;
    for (const region of parsed.regions.filter(value => !isNote(value.id) && types[typeOf.get(value.id)]?.role !== "furniture").sort((a, b) => order.get(a.id) - order.get(b.id)))
      // Standing apart ("… so. 2 Then"), or fused to the start of the next word ("15ಹರಿಗಡಿ"), as Vision reads a raised number.
      for (const line of region.lines) line.text = line.text.replace(/(\S)\s([0-9೦-೯०-९]{1,3}|[*†]{1,3})(?=\s|$)|(^|\s)([0-9೦-೯०-९]{1,3})(?=[\p{L}\p{M}])/gu, (whole, before, token, start, fused, offset, text) => {
        const key = normalMarker(token ?? fused), after = text.slice(offset + whole.length).trimStart()[0] || "";
        if (token !== undefined && (/[।॥|=\-–—]/u.test(before) || /[।॥|=\-–—]/u.test(after))) return whole;
        if (!keys.includes(key) || /\d/.test(key) && Number(key) < last) return whole;
        keys.splice(keys.indexOf(key), 1);
        if (/\d/.test(key)) last = Number(key);
        return token !== undefined ? `${before}[${key}]` : `${start}[${key}]`;
      });
    // Notes whose marker Vision dropped altogether: by the words they quote (note-links.js markersFromQuotes).
    if (keys.length) {
      const running = parsed.regions.filter(value => !isNote(value.id) && types[typeOf.get(value.id)]?.role !== "furniture")
        .sort((a, b) => order.get(a.id) - order.get(b.id)).flatMap(region => region.lines);
      const notes = parsed.regions.filter(value => isNote(value.id)).sort((a, b) => order.get(a.id) - order.get(b.id))
        .map(region => ({ first: region.lines[0]?.text || "", key: normalMarker(/^\s*([0-9೦-೯०-९]{1,2}|[*†]{1,3})/u.exec(region.lines[0]?.text || "")?.[1] || "") }))
        .filter(note => note.key && keys.includes(note.key));
      markersFromQuotes(running, notes);
    }
    return parsed;
  }

  async readPage(pid, record, chosen, profile, { force, progress }) {
    const rec = structuredClone(record), { sent, skipped } = Split.selectPageRegions(rec.regions);
    const file = await this.image(pid), imageHash = await sha256(file);
    // A whole-page reader (method 100) sends the page's regions as a list in its prompt; the list is part of the request.
    const list = profile.whole_page ? Split.wholePageList(rec, sent) : null;
    const prompt = list ? Split.wholePagePrompt(this.book.types, list) : Split.readingPrompt(this.book.types);
    const fingerprint = await jsonHash({ version: Split.SPLIT_VERSION, chosen, profile, imageHash, regions: rec.regions, prompt });
    const path = `work/readings/${pid}/${profile.id}.json`;
    const cached = await this.book.readWork(path), baseline = canonical(cached);
    const geometry_key = await geometryKey(rec, chosen, profile, imageHash);
    const previousKey = cached?.geometry_key || (cached?.regions_record && await geometryKey(cached.regions_record,
      cached.options, cached.profile, cached.image_sha256));
    // A Cloud Vision reading parsed by an earlier version of visionReading is parsed again from the response its call
    // saved (no new call): the reading's own call, else its parts' (the latest first).
    // Vision's words are placed on the page's line pieces by position, so only the image must be the same.
    if (!force && profile.provider === "vision" && cached && (cached.vision_parse || 1) !== VISION_PARSE && cached.image_sha256 === imageHash) {
      for (const callPath of [cached.path, ...(cached.parts || []).map(part => part.path).reverse()].filter(Boolean)) {
        const call = await this.book.readWork(callPath);
        if (!call?.response?.responses) continue;
        const parsed = Split.checkReading(this.markNoteNumbers(await this.fillMissed(file, visionReading(call.response, sent, rec.uncovered_lines), sent), sent), sent.filter(source => source.line_ids.length));
        const reading = { ...cached, parsed, vision_parse: VISION_PARSE, reparsed_from: callPath, regions_record: rec, geometry_key, fingerprint };
        delete reading.partial; delete reading.region_ids; delete reading.reused_regions; delete reading.base_fingerprint;
        await this.book.updateWork(path, () => reading);
        return { ...reading, geometry_key, cached: true };
      }
    }
    if (!force && readingFits(cached, rec, imageHash) && (cached.fingerprint === fingerprint || previousKey === geometry_key)) {
      if (!cached.geometry_key) await this.book.writeWork(path, { ...cached, geometry_key: previousKey });
      return { ...cached, geometry_key, cached: true, ...(cached.fingerprint === fingerprint ? {} : { prior_revision: true, requested_fingerprint: fingerprint }) };
    }
    const plan = planReading(cached, rec, chosen, profile, imageHash, force || Boolean(list)), targets = plan.request;
    const scope = plan.partial ? { partial: true, region_ids: targets.map(source => source.rid),
      base_fingerprint: cached.fingerprint, reused_regions: plan.reused.map(region => region.id) } : {};
    const targetIds = new Set(targets.map(source => source.rid));
    const selectTargets = parsed => ({ ...(parsed.uncovered ? { uncovered: parsed.uncovered } : {}), regions: parsed.regions.filter(region => targetIds.has(region.id)) });
    let result;
    if (!targets.some(s => s.line_ids.length)) result = { status: "completed", parsed: { regions: [] }, cost_usd: 0, seconds: 0, cached: true };
    else if (profile.provider === "local") {
      const started = performance.now();
      const local = await this.recognize(file, sent, chosen.ocr_languages, progress);
      Split.checkReading(local.reading, sent);
      result = { status: "completed", parsed: Split.checkReading(selectTargets(local.reading), targets), cost_usd: 0,
        seconds: (performance.now() - started) / 1000, local: { words: local.words, confidence: local.confidence } };
    } else if (profile.provider === "vision") {
      // The same page image read before: its words are placed on the new regions, no new call. The response is in the
      // reading's call record (a reading saved before 2026-11-24 holds it too).
      const earlier = !force && sameReadingSource(cached, rec, chosen, profile, imageHash) &&
        (cached.response || (cached.path && (await this.book.readWork(cached.path))?.response));
      if (earlier?.responses) {
        result = { status: "completed", parsed: Split.checkReading(selectTargets(visionReading(earlier, sent, plan.partial ? [] : rec.uncovered_lines)), targets),
          cost_usd: cached.cost_usd, seconds: cached.seconds, path: cached.path, cached: true, ocr_reused: true };
      } else {
        const payload = visionRequest(profile, await compactDataUrl(file));
        result = await this.callJSON(pid, "reading", profile, payload, parsed => Split.checkReading(parsed, targets),
          (usage, body) => visionCost(body, profile), body => selectTargets(visionReading(body, sent, plan.partial ? [] : rec.uncovered_lines)), scope);
      }
      if (result.parsed) result.parsed = this.markNoteNumbers(await this.fillMissed(file, result.parsed, sent), sent);
    } else if (list) {
      // One call for the whole page: the page image as the app draws it, the regions in the prompt. A region whose answer
      // does not fit its line pieces holds the page's current text (checkWholePage) and is flagged when applied.
      const payload = geminiReadingRequest(profile, Split.wholePageContent(prompt, (await dataUrlOf(file)).split(",")[1], file.type || "image/png"), Split.wholePageSchema(list));
      result = await this.callJSON(pid, "reading", profile, payload, parsed => Split.checkWholePage(parsed, list), null, null, scope);
    } else {
      const imageKey = plan.partial ? await jsonHash({ fingerprint, regions: scope.region_ids, char_h: rec.char_h }) : fingerprint;
      const images = await this.imageSet(pid, file, rec, targets, imageKey);
      const payload = geminiReadingRequest(profile, Split.readingContent(this.book.types, targets, images), Split.readingSchema(targets));
      result = await this.callJSON(pid, "reading", profile, payload, parsed => Split.checkReading(parsed, targets), null, null, scope);
    }
    const reading = { ...result, ...(profile.provider === "vision" && !plan.partial ? { vision_parse: VISION_PARSE } : {}), format: "page-reading", version: 1, page: pid, profile, options: chosen, fingerprint,
      image_sha256: imageHash, geometry_key, regions_record: rec, skipped };
    // Cloud Vision's response (some 200 kB a page) stays in its call record only.
    if (profile.provider === "vision" && reading.path) delete reading.response;
    if (plan.partial) {
      const archive = `work/reading-history/${pid}/${profile.id}/${await jsonHash(cached)}.json`;
      if (!await this.book.readWork(archive)) await this.book.writeWork(archive, cached);
      const parts = retainedParts(cached, plan.reused, archive);
      if (targets.length) {
        let partPath = result.path;
        if (!partPath) {
          partPath = `work/reading-parts/${pid}/${profile.id}/local-${crypto.randomUUID()}.json`;
          await this.book.writeWork(partPath, { ...reading, ...scope, format: "reading-part", regions_record: { ...rec, regions: targets.map(source => source.region) } });
        }
        parts.push({ path: partPath, region_ids: targets.map(source => source.rid), cost_usd: result.cost_usd, seconds: result.seconds });
      }
      Object.assign(reading, scope, { parsed: combineReading(plan, result.parsed, sent), parts, previous_reading: archive,
        cost_usd: partTotals(parts, "cost_usd"), seconds: partTotals(parts, "seconds") });
    }
    await this.book.updateWork(path, latest => {
      if (canonical(latest) !== baseline) throw new Error("Another transcription was saved while this call was running. Retry using the newer saved reading.");
      return reading;
    });
    return reading;
  }

}

// What a saved reading depends on: the page image, the model, the regions' outlines and line pieces and, for a
// whole-page reader, the regions' boxes and line counts (as its prompt lists them). A changed type or order alone does not
// make a reading stale.
async function geometryKey(record, chosen, profile, imageHash) {
  const key = { version: Split.SPLIT_VERSION, profile, chosen, imageHash, regions: readingGeometry(record) };
  if (profile.whole_page) key.boxes = Split.wholePageList(record, Split.selectPageRegions(record.regions).sent).map(({ id, lines, box }) => ({ id, lines, box }));
  return jsonHash(key);
}

export async function jsonHash(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return [...digest].map(v => v.toString(16).padStart(2, "0")).join("");
}
