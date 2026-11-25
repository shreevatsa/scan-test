import { typeRevision } from "../schema.js?v=20261125-contents-5";
import { mappedTypeNames } from "../type-revisions.js?v=20261125-contents-5";
// Fixed region detection and local outlines, a selectable reader, then a fixed text-only structurer.
// Save each stage independently so retries can reuse completed work.

import * as P from "./prompts.js";
import * as S from "./steps.js?v=20261125-contents-5";
import * as I from "./images.js?v=20261125-contents-5";
import { readerById, readerOptions, structurerById, structurePath, structureRequest, usageCost, geminiReadingRequest } from "./readers.js?v=20261125-contents-5";
import * as Split from "./split.js";
import { markersFromQuotes } from "../note-links.js?v=20261125-contents-5";
import { localReading, localLayout, localLines } from "./ocr.js?v=20261125-contents-5";
import { classifyBlocks } from "../local/blocks.js?v=20261125-contents-5";
import { finderById, finderPath } from "./finders.js?v=20261125-contents-5";
import { finderRequest } from "./finder-requests.js?v=20261125-contents-5";
import { planReading, combineReading, retainedParts, partTotals, partialTextScope, readingFits, readingGeometry, sameReadingSource } from "./partial-reading.js?v=20261125-contents-5";
import { visionRequest, visionReading, visionCost, VISION_PARSE } from "./vision.js?v=20261125-contents-5";
import { bbox } from "../render.js";
import { pdfFollows } from "./pdf.js?v=20261125-contents-5";
import { canonical } from "../ops.js?v=20261125-contents-5";
import { layerState, noteEdit } from "../layers.js?v=20261125-contents-5";
import { provisionalDocument } from "./provisional.js?v=20261125-contents-5";
import { mergeRegions, mergeText } from "./apply.js?v=20261125-contents-5";
import { proposingPrompt, proposingSchema, scaleProposingRegions } from "./proposing-finder.js?v=20261125-contents-5";
import { readPendingProposals, recordFinderProposals, proposalAssignments, normalizeTypeName } from "../type-additions.js?v=20261125-contents-5";
import { isProtected, LAYERS } from "../layers.js?v=20261125-contents-5";

export const REQUEST_TIMEOUT_MS = 75000;

// A finder record with each region of a proposed type that has since been added (or assigned to an existing type)
// given that type. Others keep type other and their proposed_type, and the page keeps them unassigned.
export function assignedRecord(record, assignments, types) {
  if (!assignments?.size || !record.regions.some(region => region.proposed_type)) return record;
  const out = structuredClone(record);
  for (const region of out.regions) {
    const type = region.proposed_type && assignments.get(normalizeTypeName(region.proposed_type));
    if (type && types.types[type]) { region.type = type; region.region_class = types.types[type].region || region.region_class; }
  }
  return out;
}

let TEMPLATES = null;
export async function templates() {
  if (!TEMPLATES) {
    const get = async (name, json) => { const r = await fetch(new URL(`../../pipeline/${name}`, import.meta.url)); return json ? r.json() : r.text(); };
    TEMPLATES = { regionPrompt: await get("regions-prompt-template.txt"), regionSchema: await get("regions-schema-template.json", true),
                  transcriptionPrompt: await get("transcription-prompt-template.txt"),
                  proposingPrompt: await get("regions-proposals-prompt-template.txt"), proposingSchema: await get("regions-proposals-schema-template.json", true),
                  regionPricing: await get("regions-pricing.json", true), transcriptionPricing: await get("transcription-pricing.json", true) };
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
  const r = await fetch(S.ENDPOINTS[provider], { method: "POST", headers, body: JSON.stringify(payload), signal: AbortSignal.timeout(auth.timeout_ms || REQUEST_TIMEOUT_MS) });
  const raw = await r.json().catch(() => null);
  const body = raw?.interaction || raw;
  if (!r.ok) throw new Error(`${provider} HTTP ${r.status}${body?.error?.message ? ": " + body.error.message : ""}`);
  if (provider === "openai" && body.status && body.status !== "completed") throw new Error(`the response is ${body.status}${body.incomplete_details ? ": " + JSON.stringify(body.incomplete_details) : ""}`);
  return { body, seconds: (performance.now() - t0) / 1000 };
}

export class Maker {
  // outlines(pid, url, boxes) runs the local step (the app's worker); check(doc) runs the schema checks.
  constructor(book, { outlines, keys, check, request = post, images = I, recognize = localReading, layout = localLayout, readLines = localLines, onCost = () => {}, onSaved = () => {} }) {
    this.book = book;
    this.outlines = outlines;
    this.keys = keys;
    this.check = check;
    this.request = request;
    this.images = images;
    this.recognize = recognize;
    this.readLines = readLines;
    this.layout = layout;
    this.onCost = onCost;
    this.onSaved = onSaved;
    this.jobs = new Map();
    this.previewCache = new Map();
  }

  workPath(pid) { return `work/${pid}.regions.json`; }
  regions(pid) { return this.book.readWork(this.workPath(pid)); }
  image(pid) { return this.book.imageBlob(pid); }

  async stageCurrent(pid, { ignoreInvalidDraft = false } = {}) {
    const current = await this.book.current(pid, { refresh: true }), draft = await this.book.draft(pid);
    if (!draft) return current;
    if (this.check(draft.doc)[0].length) {
      if (ignoreInvalidDraft) return current;
      throw new Error("Fix this page's draft before running a model step.");
    }
    return noteEdit(current, draft.doc);
  }

  async saveMerged(pid, layer, path, merge, provenance = {}) {
    const out = await this.book.updateStage(pid, (current, draft) => {
      if (draft && this.check(draft)[0].length) throw new Error("Fix this page's draft before saving a model result.");
      const latest = draft ? noteEdit(current, draft) : current;
      const result = merge(latest);
      result.doc.source ||= {};
      if (result.taken.includes(layer)) {
        const { calls, ...source } = provenance;
        Object.assign(result.doc.source, source);
        if (calls) result.doc.source.calls = { ...result.doc.source.calls, ...calls };
        if (result.doc.source.type_review) {
          delete result.doc.source.type_review[layer];
          if (!Object.keys(result.doc.source.type_review).some(key => key !== "errors")) delete result.doc.source.type_review;
        }
      }
      if (result.suggestion) result.doc.source.suggestions = { ...result.doc.source.suggestions, [layer]: path };
      else if (result.doc.source.suggestions) delete result.doc.source.suggestions[layer];
      result.valid = !this.check(result.doc)[0].length;
      return result;
    });
    await this.onSaved(pid);
    return out;
  }

  // assignments: normalized proposed type names to the types they became (type-additions.js proposalAssignments).
  provisional(pid, record, imageHash, assignments = null) {
    const p = this.book.page(pid);
    return provisionalDocument(pid, { image: (p.image || `${pid}.png`).split("/").pop(), image_sha256: imageHash,
      width: record.width, height: record.height }, this.book.types, assignedRecord(record, assignments, this.book.types),
      { firstPage: this.book.index[pid] === 0, lastPage: this.book.index[pid] === this.book.pages.length - 1 });
  }

  regionFingerprint(profile, imageHash, options) {
    return jsonHash({ image: imageHash, method: profile.method, types: this.book.types,
      ...(profile.id === "tesseract-regions" ? { languages: options.ocr_languages } : {}) });
  }

  async finderResult(pid, id, { compatible = false } = {}) {
    let saved = await this.book.readWork(finderPath(pid, id));
    if (!saved) {
      const legacy = await this.regions(pid);
      if (legacy && (legacy.profile?.id || "terra-regions") === id) saved = legacy;
    }
    if (!saved || !compatible) return saved;
    const imageHash = await sha256(await this.image(pid));
    const fingerprint = await this.regionFingerprint(finderById(id), imageHash, await this.options());
    const current = await this.book.current(pid, { refresh: true });
    const reset = Math.max(this.book.types.source?.region_reset_revision || 1, current?.source?.type_review?.regions || 1);
    return (!saved.image_sha256 || saved.image_sha256 === imageHash) && typeRevision(saved.types_revision) >= reset &&
      (!saved.fingerprint || saved.fingerprint === fingerprint) ? saved : null;
  }

  async retainRegions(pid, record, { save, trial, imageHash }) {
    const path = finderPath(pid, record.profile?.id || "terra-regions");
    await this.book.writeWork(path, record);
    if (trial) return;
    const previous = await this.regions(pid);
    if (previous) {
      const previousPath = finderPath(pid, previous.profile?.id || "terra-regions");
      if (previousPath !== path && !await this.book.readWork(previousPath)) await this.book.writeWork(previousPath, previous);
    }
    await this.book.writeWork(this.workPath(pid), record);
    let assignments = null;
    if (record.type_proposals?.length || record.regions.some(region => region.proposed_type)) {
      await recordFinderProposals(this.book, record, { pdfPage: this.book.page(pid)?.pdf_page ?? null });
      assignments = proposalAssignments(await readPendingProposals(this.book), this.book.types);
    }
    if (save) await this.saveMerged(pid, "regions", path, current => mergeRegions(current,
      mappedTypeNames(this.provisional(pid, record, imageHash, assignments), this.book.types), this.check));
  }

  // After a proposed type is added (or found to be an existing type): the page's unassigned regions that carry the
  // proposed name get the type, by rebuilding the page from its finder record, unless a person's work protects the
  // page. Returns "assigned", "protected" or "none".
  async assignProposedRegions(pid, assignments) {
    const current = await this.book.current(pid, { refresh: true });
    const waiting = (current?.source?.omitted_regions || []).filter(region => region.proposed_type && assignments.has(normalizeTypeName(region.proposed_type)));
    if (!waiting.length) return "none";
    if (LAYERS.some(layer => isProtected(current, layer)) || await this.book.draft(pid)) return "protected";
    const record = await this.regions(pid);
    if (!record?.regions.some(region => region.proposed_type && assignments.has(normalizeTypeName(region.proposed_type)))) return "none";
    const imageHash = record.image_sha256 || current.page.image_sha256;
    const out = await this.saveMerged(pid, "regions", finderPath(pid, record.profile?.id || "terra-regions"), latest => {
      if (LAYERS.some(layer => isProtected(latest, layer))) return { doc: latest, taken: [], suggestion: false };
      return mergeRegions(latest, mappedTypeNames(this.provisional(pid, record, imageHash, assignments), this.book.types), this.check);
    });
    return out?.taken?.includes("regions") ? "assigned" : "protected";
  }

  async findRegions(pid, { save = this.book.writable, force = true, finder, trial = false } = {}) {
    if (save) await this.stageCurrent(pid);
    const options = await this.options(), profile = finderById(finder || options.finder), tl = this.book.types;
    const file = await this.image(pid), imageHash = await sha256(file);
    const fingerprint = await this.regionFingerprint(profile, imageHash, options);
    if (!force) {
      const cached = await this.finderResult(pid, profile.id);
      const current = await this.book.current(pid, { refresh: true });
      const reset = Math.max(tl.source?.region_reset_revision || 1, current?.source?.type_review?.regions || 1);
      if (cached && (!cached.image_sha256 || cached.image_sha256 === imageHash) &&
          typeRevision(cached.types_revision) >= reset && (!cached.fingerprint || cached.fingerprint === fingerprint)) {
        await this.retainRegions(pid, cached, { save, trial, imageHash });
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
      // Method 097 reads the pending proposals now, at request time, so a page sees what earlier pages proposed.
      const pending = profile.proposals ? await readPendingProposals(this.book) : null;
      const payload = profile.proposals
        ? finderRequest(profile, proposingPrompt(tl, t.proposingPrompt, pending), proposingSchema(tl, t.proposingSchema, pending), await dataUrlOf(file))
        : finderRequest(profile, P.regionPrompt(tl, t.regionPrompt), P.regionSchema(tl, t.regionSchema), await dataUrlOf(file));
      const call = await this.callJSON(pid, "regions", profile, payload,
        parsed => profile.proposals ? scaleProposingRegions(parsed, W, H, tl, pending) : S.scaleRegions(parsed, W, H, tl), profile.provider === "openai"
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
    const out = { format: "page-regions", page: pid, profile, fingerprint, types_revision: typeRevision(tl.source?.revision),
      width: W, height: H, image_sha256: imageHash, char_h: res.charH, page_angle_deg: res.angle, local_method: res.method,
      regions: S.regionRecords(regions, res.geometry), uncovered_lines: res.uncovered || [], warnings,
      region_call: regionCall, made_at_utc: new Date().toISOString(), ...(typeProposals ? { type_proposals: typeProposals } : {}) };
    await this.retainRegions(pid, out, { save, trial, imageHash });
    return out;
  }

  async options() {
    return readerOptions(await this.book.getReaderOptions(), this.book.types);
  }

  async sourceRegions(pid) {
    const saved = await this.regions(pid);
    const doc = await this.stageCurrent(pid);
    if (!doc && saved) return saved;
    if (!doc) throw new Error("Find the page's regions first.");
    const classes = P.regionClasses(this.book.types);
    const regions = doc.page.regions.map((r, index) => {
      const original = saved?.regions.find(value => (value.document_region_id || `r${value.region_id}`) === r.id);
      const b = bbox(r.polygons || []);
      const bounds = Number.isFinite(b[0]) ? [b[0], b[1], b[2] + 1, b[3] + 1] : null;
      const region = {
        region_id: r.source?.region_id || index + 1, document_region_id: r.id, type: r.type, keep: this.book.types.types[r.type]?.role !== "furniture",
        reading_order: r.order ?? null, uncertain: r.source?.uncertain || false,
        continues_from_earlier: r.source?.continues_from_earlier || false, continues_later: r.source?.continues_later || false,
        region_class: classes[r.type] || "other", model_box: r.box || bounds,
        // A region kept with no ink found (outlined by its box, nothing to read) is no_ink here as on the page, where it
        // takes no part in reading (apply.js geometry); "ok" made every reading of the page fail to apply, unreported.
        status: bounds && !(r.source?.no_ink && !(r.lines || []).some(L => L.polygons?.length)) ? "ok" : "no_ink", polygons: r.polygons, bounds,
        lines: (r.lines || []).filter(L => L.polygons?.length).map(L => ({ line_id: L.line, polygons: L.polygons })),
      };
      // Keep the original precision and request metadata when the current page agrees.
      if (original) {
        const unchanged = r.type === original.type && (r.order ?? null) === original.reading_order &&
          region.region_class === original.region_class && region.keep === original.keep &&
          canonical(r.polygons) === canonical(original.polygons) &&
          canonical(region.lines) === canonical(original.lines) &&
          canonical(r.box) === canonical(original.model_box.map(Math.round)) &&
          region.continues_from_earlier === Boolean(original.continues_from_earlier) &&
          region.continues_later === Boolean(original.continues_later);
        if (unchanged) return structuredClone(original);
        if (canonical(r.box) === canonical(original.model_box.map(Math.round))) region.model_box = original.model_box;
      }
      return region;
    });
    // An area the finder gave a type the book does not have yet (a proposed type, waiting for the person's decision) is
    // not on the page, but it is read with the page, so that its text is there when the type is added (restoreWaiting).
    const onPage = new Set(regions.map(region => region.document_region_id));
    for (const area of doc.source?.omitted_regions || []) {
      const original = saved?.regions.find(value => (value.document_region_id || `r${value.region_id}`) === area.region);
      if (original && !onPage.has(area.region)) regions.push(structuredClone(original));
    }
    if (saved && canonical(regions) === canonical(saved.regions)) return saved;
    return { ...saved, format: "page-regions", page: pid, width: doc.page.width, height: doc.page.height,
      char_h: doc.source?.char_h ?? saved?.char_h ?? Math.max(8, doc.page.height / 70), regions,
      page_angle_deg: doc.source?.page_angle_deg ?? saved?.page_angle_deg ?? 0,
      local_method: doc.source?.geometry_update?.method || doc.source?.regions_method || saved?.local_method || "existing page geometry",
      region_call: doc.source?.calls?.regions || null };
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
      this.book.work.delete(partPath);
      const saved = await this.book.readWork(partPath);
      if (saved?.path) {
        this.book.work.delete(saved.path);
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

  async read(pid, options = null, { force = false, progress, save = false } = {}) {
    if (save) await this.stageCurrent(pid);
    const all = readerOptions(options || await this.book.getReaderOptions(), this.book.types);
    const chosen = { reader: all.reader, ocr_languages: all.ocr_languages };
    const profile = readerById(chosen.reader), key = `read:${pid}:${JSON.stringify(chosen)}`;
    const job = this.jobs.get(key) || this.readPage(pid, chosen, profile, { force, progress });
    this.jobs.set(key, job);
    let reading;
    try { reading = await job; } finally { if (this.jobs.get(key) === job) this.jobs.delete(key); }
    if (save) {
      await this.saveMerged(pid, "text", `work/readings/${pid}/${profile.id}.json`, current =>
        mergeText(current || this.provisional(pid, reading.regions_record, reading.image_sha256), reading, this.book.types, this.check,
          { regionIds: partialTextScope(current, reading) }),
        { reader: profile, model: profile.model, calls: { reading: { cost_usd: reading.cost_usd, seconds: reading.seconds,
          ...(reading.partial ? { partial: true, parts: reading.parts } : {}) } } });
    }
    return reading;
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

  async readPage(pid, chosen, profile, { force, progress }) {
    const rec = structuredClone(await this.sourceRegions(pid)), { sent, skipped } = Split.selectPageRegions(rec.regions);
    const file = await this.image(pid), imageHash = await sha256(file);
    // A whole-page reader (method 100) sends the page's regions as a list in its prompt; the list is part of the request.
    const list = profile.whole_page ? Split.wholePageList(rec, sent) : null;
    const prompt = list ? Split.wholePagePrompt(this.book.types, list) : Split.readingPrompt(this.book.types);
    const fingerprint = await jsonHash({ version: Split.SPLIT_VERSION, chosen, profile, imageHash, regions: rec.regions, prompt });
    const path = `work/readings/${pid}/${profile.id}.json`;
    this.book.work.delete(path);
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
      const current = await this.book.current(pid);
      const currentLines = Object.fromEntries((current?.page.regions || []).map(region => [region.id,
        (region.lines || []).filter(line => line.polygons?.length).map(line => Split.markedText(line))]));
      const payload = geminiReadingRequest(profile, Split.wholePageContent(prompt, (await dataUrlOf(file)).split(",")[1], file.type || "image/png"), Split.wholePageSchema(list));
      result = await this.callJSON(pid, "reading", profile, payload, parsed => Split.checkWholePage(parsed, list, currentLines), null, null, scope);
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

  async context(pid, options) {
    const out = [];
    const current = await this.book.current(pid);
    for (const [side, step] of [["previous", -1], ["next", 1]]) {
      if (current?.source?.sample?.[`consecutive_${side}`] === false) continue;
      const page = this.book.pages[this.book.index[pid] + step];
      if (!page) continue;
      const sourcePage = this.book.page(pid);
      if (!pdfFollows(sourcePage, page, step)) continue;
      const saved = await this.book.readWork(`work/readings/${page.id}/${options.reader}.json`);
      const neighbor = await this.stageCurrent(page.id, { ignoreInvalidDraft: true });
      const doc = neighbor && layerState(neighbor, "text") ? neighbor : null;
      if (!saved && !doc) continue;
      // Preserve the saved request when the document has the same marked text.
      const useSaved = saved && (!doc || sameReading(Split.readingFromDocument(doc,
        Split.selectPageRegions(saved.regions_record.regions).sent), saved.parsed));
      const regions = useSaved ? saved.parsed.regions.filter(r => {
        const source = saved.regions_record.regions.find(s => (s.document_region_id || `r${s.region_id}`) === r.id);
        return source?.keep;
      }) : doc.page.regions.filter(r => Number.isFinite(r.order)).map(r => ({ id: r.id,
        lines: r.lines.map((L, i) => ({ n: i + 1, text: Split.markedText(L) })) }));
      const edge = side === "previous" ? regions.slice(-2) : regions.slice(0, 2);
      out.push({ side, page: page.id, regions: edge.map(r => ({ id: r.id, lines: side === "previous" ? r.lines.slice(-3) : r.lines.slice(0, 3) })) });
    }
    return out;
  }
}

function sameReading(a, b) {
  const content = value => value.regions.map(region => ({ id: region.id,
    lines: region.lines.map(line => ({ n: line.n,
      text: Split.markedText(S.transcribedLines([line.n], { [line.n]: [] }, [line]).lines[0]) })) }))
    .sort((left, right) => left.id.localeCompare(right.id));
  return canonical(content(a)) === canonical(content(b));
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
