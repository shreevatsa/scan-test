// Fixed region detection and local outlines, a selectable reader, then a fixed text-only structurer.
// Save each stage independently so retries can reuse completed work.

import * as P from "./prompts.js";
import * as S from "./steps.js";
import * as I from "./images.js";
import { readerById, readerOptions, structurerById, structurePath, structureRequest, usageCost, geminiReadingRequest } from "./readers.js";
import * as Split from "./split.js";
import { localReading } from "./ocr.js";
import { visionRequest, visionReading, visionCost } from "./vision.js";
import { bbox } from "../render.js";

let TEMPLATES = null;
export async function templates() {
  if (!TEMPLATES) {
    const get = async (name, json) => { const r = await fetch(new URL(`../../pipeline/${name}`, import.meta.url)); return json ? r.json() : r.text(); };
    TEMPLATES = { regionPrompt: await get("regions-prompt-template.txt"), regionSchema: await get("regions-schema-template.json", true),
                  transcriptionPrompt: await get("transcription-prompt-template.txt"),
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

async function sha256(blob) {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()));
  return [...d].map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function post(provider, payload, key) {
  if (!key) throw new Error(`Add the ${provider} API key under API keys.`);
  const headers = provider === "openai" ? { Authorization: `Bearer ${key}`, "Content-Type": "application/json" } : { "x-goog-api-key": key, "Content-Type": "application/json" };
  const t0 = performance.now();
  const r = await fetch(S.ENDPOINTS[provider], { method: "POST", headers, body: JSON.stringify(payload), signal: AbortSignal.timeout(300000) });
  const raw = await r.json().catch(() => null);
  const body = raw?.interaction || raw;
  if (!r.ok) throw new Error(`${provider} HTTP ${r.status}${body?.error?.message ? ": " + body.error.message : ""}`);
  if (provider === "openai" && body.status && body.status !== "completed") throw new Error(`the response is ${body.status}${body.incomplete_details ? ": " + JSON.stringify(body.incomplete_details) : ""}`);
  return { body, seconds: (performance.now() - t0) / 1000 };
}

export class Maker {
  // outlines(pid, url, boxes) runs the local step (the app's worker); check(doc) runs the schema checks.
  constructor(book, { outlines, keys, check, request = post, images = I, recognize = localReading, onCost = () => {} }) {
    this.book = book;
    this.outlines = outlines;
    this.keys = keys;
    this.check = check;
    this.request = request;
    this.images = images;
    this.recognize = recognize;
    this.onCost = onCost;
    this.jobs = new Map();
    this.previewCache = new Map();
  }

  workPath(pid) { return `work/${pid}.regions.json`; }
  regions(pid) { return this.book.readWork(this.workPath(pid)); }
  image(pid) { return this.book.imageBlob(pid); }

  async findRegions(pid) {
    const t = await templates(), tl = this.book.types;
    const file = await this.image(pid);
    const bitmap = await createImageBitmap(file);
    const W = bitmap.width, H = bitmap.height;
    bitmap.close?.();
    const payload = S.regionRequest(P.regionPrompt(tl, t.regionPrompt), P.regionSchema(tl, t.regionSchema), await dataUrlOf(file));
    const call = await this.callJSON(pid, "regions", { id: "terra-regions", provider: "openai", model: payload.model }, payload,
      parsed => S.scaleRegions(parsed, W, H, tl), (usage, body) => S.openaiCost(usage, t.regionPricing, body.service_tier));
    const body = call.response, { regions, warnings } = call.parsed;
    const res = regions.length ? await this.outlines(pid, await this.book.imageUrl(pid), regions.map(r => r.box))
      : { geometry: [], charH: 0, angle: 0, method: "063-fragment-band-lines" };
    if (res.error) throw new Error(res.error);
    const out = { format: "page-regions", page: pid, width: W, height: H, char_h: res.charH, page_angle_deg: res.angle, local_method: res.method,
      regions: S.regionRecords(regions, res.geometry),
      warnings, region_call: { model: body.model, response_id: body.id, usage: body.usage, cost_usd: call.cost_usd, seconds: call.seconds,
      output: S.openaiText(body) }, made_at_utc: new Date().toISOString() };
    await this.book.writeWork(this.workPath(pid), out);
    return out;
  }

  async options() {
    return readerOptions(await this.book.getReaderOptions(), this.book.types);
  }

  async sourceRegions(pid) {
    const saved = await this.regions(pid);
    if (saved) return saved;
    const doc = await this.book.current(pid);
    if (!doc) throw new Error("Find the page's regions first.");
    const classes = P.regionClasses(this.book.types);
    const regions = doc.page.regions.map((r, index) => {
      const b = bbox(r.polygons || []);
      const bounds = Number.isFinite(b[0]) ? [b[0], b[1], b[2] + 1, b[3] + 1] : null;
      return {
        region_id: r.source?.region_id || index + 1, document_region_id: r.id, type: r.type, keep: this.book.types.types[r.type]?.role !== "furniture",
        reading_order: r.order ?? null, uncertain: r.source?.uncertain || false,
        continues_from_earlier: r.source?.continues_from_earlier || false, continues_later: r.source?.continues_later || false,
        region_class: classes[r.type] || "other", model_box: r.source?.model_box || r.box || bounds,
        status: bounds ? "ok" : "no_ink", polygons: r.polygons, bounds,
        lines: (r.lines || []).filter(L => L.polygons?.length).map(L => ({ line_id: L.line, polygons: L.polygons })),
      };
    });
    return { format: "page-regions", page: pid, width: doc.page.width, height: doc.page.height,
      char_h: Math.max(8, doc.page.height / 70), regions, local_method: doc.source?.geometry_update?.method || doc.source?.regions_method || "existing page geometry",
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

  async callJSON(pid, stage, profile, payload, validate, cost = null, parse = null) {
    if (this.persistenceFailure) throw new Error(this.persistenceFailure);
    const provider = profile.provider, key = this.keys[provider];
    if (!key) throw new Error(`Add a ${provider === "vision" ? "Cloud Vision" : provider === "openai" ? "OpenAI" : "Gemini"} API key for ${stage}.`);
    const id = crypto.randomUUID(), started = new Date().toISOString();
    const path = `work/reader-calls/${pid}/${stage}-${id}.json`;
    const record = { format: "reader-call", version: 1, id, page: pid, stage, profile, started_at_utc: started,
      request_sha256: await jsonHash(payload), request: JSON.parse(JSON.stringify(payload, (key, value) =>
        key === "data" || key === "image_url" || provider === "vision" && key === "content" ? "<image rebuilt from the book's source>" : value)), status: "requesting" };
    await this.book.writeWork(path, record);
    try {
      const { body, seconds } = await this.request(provider, payload, key);
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
      await this.book.writeWork(path, record);
      await this.book.updateWork("work/reader-lab/ledger.json", old => ({ format: "reader-ledger", version: 1,
        calls: [...(old?.calls || []), { id, path, page: pid, stage, profile: profile.id, status: record.status, cost_usd: record.cost_usd ?? null, seconds: record.seconds ?? null }] }));
    } catch (error) {
      this.persistenceFailure = `Could not save the ${stage} call record. Further API calls are stopped. ${error.message}`;
      throw new Error(this.persistenceFailure);
    }
    if (record.status === "failed") {
      const error = new Error(record.error);
      error.record = record;
      throw error;
    }
    return { ...record, path, cached: false };
  }

  async read(pid, options = null, { force = false, progress } = {}) {
    const all = readerOptions(options || await this.book.getReaderOptions(), this.book.types);
    const chosen = { reader: all.reader, ocr_languages: all.ocr_languages };
    const profile = readerById(chosen.reader), key = `read:${pid}:${JSON.stringify(chosen)}`;
    if (this.jobs.has(key)) return this.jobs.get(key);
    const job = this.readPage(pid, chosen, profile, { force, progress });
    this.jobs.set(key, job);
    try { return await job; } finally { this.jobs.delete(key); }
  }

  async readPage(pid, chosen, profile, { force, progress }) {
    const rec = await this.sourceRegions(pid), { sent, skipped } = Split.selectPageRegions(rec.regions);
    const file = await this.image(pid), imageHash = await sha256(file);
    const fingerprint = await jsonHash({ version: Split.SPLIT_VERSION, chosen, profile, imageHash, regions: rec.regions, prompt: Split.readingPrompt(this.book.types) });
    const path = `work/readings/${pid}/${profile.id}.json`, cached = await this.book.readWork(path);
    if (!force && cached?.fingerprint === fingerprint && cached.status === "completed") return { ...cached, cached: true };
    let result;
    if (!sent.some(s => s.line_ids.length)) result = { status: "completed", parsed: { regions: [] }, cost_usd: 0, seconds: 0 };
    else if (profile.provider === "local") {
      const started = performance.now();
      const local = await this.recognize(file, sent, chosen.ocr_languages, progress);
      result = { status: "completed", parsed: Split.checkReading(local.reading, sent), cost_usd: 0,
        seconds: (performance.now() - started) / 1000, local: { words: local.words, confidence: local.confidence } };
    } else if (profile.provider === "vision") {
      const payload = visionRequest(profile, await dataUrlOf(file));
      result = await this.callJSON(pid, "reading", profile, payload, parsed => Split.checkReading(parsed, sent),
        (usage, body) => visionCost(body, profile), body => visionReading(body, sent));
    } else {
      const images = await this.imageSet(pid, file, rec, sent, fingerprint);
      const payload = geminiReadingRequest(profile, Split.readingContent(this.book.types, sent, images), Split.readingSchema(sent));
      result = await this.callJSON(pid, "reading", profile, payload, parsed => Split.checkReading(parsed, sent));
    }
    const reading = { ...result, format: "page-reading", version: 1, page: pid, profile, options: chosen, fingerprint,
      image_sha256: imageHash, regions_record: rec, skipped };
    await this.book.writeWork(path, reading);
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
      if (sourcePage.pdf_page && page.pdf_page && page.pdf_page !== sourcePage.pdf_page + step) continue;
      const saved = await this.book.readWork(`work/readings/${page.id}/${options.reader}.json`);
      const doc = saved ? null : await this.book.current(page.id);
      if (!saved && !doc) continue;
      const regions = saved ? saved.parsed.regions.filter(r => {
        const source = saved.regions_record.regions.find(s => (s.document_region_id || `r${s.region_id}`) === r.id);
        return source?.keep;
      }) : doc.page.regions.filter(r => Number.isFinite(r.order)).map(r => ({ id: r.id,
        lines: r.lines.map((L, i) => ({ n: i + 1, text: Split.markedText(L) })) }));
      const edge = side === "previous" ? regions.slice(-2) : regions.slice(0, 2);
      out.push({ side, page: page.id, regions: edge.map(r => ({ id: r.id, lines: side === "previous" ? r.lines.slice(-3) : r.lines.slice(0, 3) })) });
    }
    return out;
  }

  async structure(pid, reading, { force = false, structurer = null } = {}) {
    const profile = structurerById(structurer || (await this.options()).structurer);
    const { sent, skipped } = Split.selectPageRegions(reading.regions_record.regions);
    const context = await this.context(pid, reading.options);
    const prompt = Split.structurePrompt(this.book.types), input = Split.structureInput(reading.parsed, sent, context);
    const fingerprint = await jsonHash({ version: Split.SPLIT_VERSION, reading: reading.fingerprint, text: reading.parsed, prompt, input, profile });
    const path = structurePath(pid, reading.profile.id, profile.id), cached = await this.book.readWork(path);
    if (!force && cached?.fingerprint === fingerprint && cached.status === "completed") return { ...cached, cached: true };
    const key = `structure:${pid}:${fingerprint}`;
    if (this.jobs.has(key)) return this.jobs.get(key);
    const job = (async () => {
      const pricing = profile.provider === "openai" ? (await templates()).regionPricing : null;
      const result = sent.length ? await this.callJSON(pid, "structure", profile,
        structureRequest(profile, prompt, input, Split.structureSchema(this.book.types, sent)),
        parsed => { Split.combineReading(reading.parsed, parsed, sent, this.book.types); return parsed; },
        pricing ? (usage, body) => S.openaiCost(usage, pricing, body.service_tier) : null)
        : { status: "completed", parsed: { regions: [], units: [], flows: Object.keys(this.book.types.flows).map(flow => ({ flow, units: [] })) }, cost_usd: 0, seconds: 0 };
      const parsed = Split.combineReading(reading.parsed, result.parsed, sent, this.book.types);
      const p = this.book.page(pid), rec = reading.regions_record;
      const page = { image: (p.image || `${pid}.png`).split("/").pop(), image_sha256: reading.image_sha256, width: rec.width, height: rec.height };
      const source = { method: Split.SPLIT_VERSION, regions_method: rec.local_method || "existing page geometry", model: reading.profile.model,
        reader: reading.profile, structurer: profile, created_at_utc: new Date().toISOString(), regions_skipped: skipped,
        calls: { regions: rec.region_call || null, reading: { cost_usd: reading.cost_usd, seconds: reading.seconds },
          structure: { cost_usd: result.cost_usd, seconds: result.seconds } } };
      const [doc, problems] = S.buildPageDocument(pid, page, this.book.types, sent, parsed, source);
      const [errors, warnings] = this.check(doc);
      const structured = { ...result, format: "page-structure", version: 1, page: pid, profile, fingerprint,
        reading_fingerprint: reading.fingerprint, doc, problems, errors, warnings };
      await this.book.writeWork(path, structured);
      return structured;
    })();
    this.jobs.set(key, job);
    try { return await job; } finally { this.jobs.delete(key); }
  }

  async transcribe(pid, { options = null, force = false, save = this.book.writable } = {}) {
    const chosen = readerOptions(options || await this.book.getReaderOptions(), this.book.types);
    const reading = await this.read(pid, chosen, { force });
    const structure = await this.structure(pid, reading, { force, structurer: chosen.structurer });
    if (save) await this.book.saveModel(pid, structure.doc, !structure.errors.length);
    const cost = reading.cost_usd !== null && structure.cost_usd !== null ? reading.cost_usd + structure.cost_usd : null;
    return { ...structure, reading, structure, cost, seconds: reading.seconds + structure.seconds };
  }
}

export async function jsonHash(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return [...digest].map(v => v.toString(16).padStart(2, "0")).join("");
}
