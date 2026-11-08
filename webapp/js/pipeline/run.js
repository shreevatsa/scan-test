// Making a book's page documents in the browser, with the user's own API keys, as methods 042 + 043 + 055 do:
// 1. regions: the region call (OpenAI, method 042's prompt) on the page image, then method 043's local step (in the
//    outline worker), saved as work/<page id>.regions.json;
// 2. transcription: the transcription call (Gemini, method 055's prompt) with the page overview, the region
//    cut-outs and the neighboring pages' edge lines, then the page document, saved in pages/.
// Step 2 uses the neighbors' region records for context, so run step 1 on the neighbors first.

import * as P from "./prompts.js";
import * as S from "./steps.js";
import * as I from "./images.js";

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

async function post(provider, payload, key) {
  if (!key) throw new Error(`no ${provider === "openai" ? "OpenAI" : "Gemini"} API key: add it under "API keys"`);
  const headers = provider === "openai" ? { Authorization: `Bearer ${key}`, "Content-Type": "application/json" } : { "x-goog-api-key": key, "Content-Type": "application/json" };
  const t0 = performance.now();
  const r = await fetch(S.ENDPOINTS[provider], { method: "POST", headers, body: JSON.stringify(payload) });
  const body = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`${provider} HTTP ${r.status}${body?.error?.message ? ": " + body.error.message : ""}`);
  if (provider === "openai" && body.status && body.status !== "completed") throw new Error(`the response is ${body.status}${body.incomplete_details ? ": " + JSON.stringify(body.incomplete_details) : ""}`);
  return { body, seconds: (performance.now() - t0) / 1000 };
}

export class Maker {
  // outlines(pid, url, boxes) runs the local step (the app's worker); check(doc) runs the schema checks.
  constructor(book, { outlines, keys, check }) {
    this.book = book;
    this.outlines = outlines;
    this.keys = keys;
    this.check = check;
  }

  workPath(pid) { return `work/${pid}.regions.json`; }
  regions(pid) { return this.book.readJson(this.workPath(pid)); }
  image(pid) { return this.book.imageBlob(pid); }

  async findRegions(pid) {
    const t = await templates(), tl = this.book.types;
    const file = await this.image(pid);
    const bitmap = await createImageBitmap(file);
    const W = bitmap.width, H = bitmap.height;
    const payload = S.regionRequest(P.regionPrompt(tl, t.regionPrompt), P.regionSchema(tl, t.regionSchema), await dataUrlOf(file));
    const { body, seconds } = await post("openai", payload, this.keys.openai);
    const text = S.openaiText(body);
    if (!text) throw new Error("the region call returned no text");
    const { regions, warnings } = S.scaleRegions(JSON.parse(text), W, H, tl);
    const res = await this.outlines(pid, await this.book.imageUrl(pid), regions.map(r => r.box));
    if (res.error) throw new Error(res.error);
    const out = { format: "page-regions", page: pid, width: W, height: H, char_h: res.charH, page_angle_deg: res.angle, regions: S.regionRecords(regions, res.geometry),
      warnings, region_call: { model: body.model, response_id: body.id, usage: body.usage, cost_usd: S.openaiCost(body.usage, t.regionPricing), seconds,
      output: text }, made_at_utc: new Date().toISOString() };
    await this.book.writeFile(this.workPath(pid), JSON.stringify(out) + "\n");
    return out;
  }

  async transcribe(pid) {
    const t = await templates(), tl = this.book.types, cfg = S.SETTINGS.transcription;
    const rec = await this.regions(pid);
    if (!rec) throw new Error("find the page's regions first");
    const file = await this.image(pid);
    const bitmap = await createImageBitmap(file);
    const { sent, skipped } = S.selectRegions(rec.regions);
    if (!sent.length) throw new Error("the page has no regions with text lines");
    const images = { overview: await I.overview(bitmap, sent.map(s => [s.rid, s.region]), rec.char_h, cfg), cutouts: {}, context: [], missing: {} };
    for (const s of sent) images.cutouts[s.rid] = await I.cutout(bitmap, s.region, rec.char_h, cfg);
    for (const [side, which, step] of [["previous", "last", -1], ["next", "first", 1]]) {
      const np = this.book.pages[this.book.index[pid] + step];
      const nrec = np ? await this.regions(np.id) : null;
      if (!nrec) { images.missing[side] = `No ${side} page is available.`; continue; }
      const edges = S.edgeRegions(nrec.regions, tl, which);
      if (!Object.keys(edges).length) { images.missing[side] = `The ${side} page has no text regions.`; continue; }
      const nb = await createImageBitmap(await this.image(np.id));
      for (const [stream, r] of Object.entries(edges)) {
        const url = await I.context(nb, r, nrec.char_h, cfg, which, cfg.context_lines);
        if (url) images.context.push({ side, stream, type: r.type, dataUrl: url });
      }
    }
    const content = S.transcriptionContent(P.transcriptionPrompt(tl, t.transcriptionPrompt), sent, images);
    const { body, seconds } = await post("gemini", S.geminiRequest(content, P.transcriptionSchema(tl, sent.map(s => s.rid))), this.keys.gemini);
    const text = S.geminiText(body);
    if (!text) throw new Error("the transcription call returned no text");
    const page = { image: (this.book.page(pid).image || `${pid}.png`).split("/").pop(), image_sha256: await sha256(file), width: bitmap.width, height: bitmap.height };
    const cost = S.geminiCost(body.usage, t.transcriptionPricing);
    const source = { method: "web app: method 042's region call, method 043's local step (browser port), method 055's transcription call",
      regions_method: "043 (browser port)", regions_path: this.workPath(pid), regions_sha256: null, response_id: body.id ?? null, model: body.model ?? S.SETTINGS.transcription.model,
      created_at_utc: new Date().toISOString(),
      calls: { regions: { cost_usd: rec.region_call?.cost_usd ?? null, seconds: rec.region_call?.seconds ?? null }, transcription: { cost_usd: cost, seconds, usage: body.usage ?? null } },
      regions_skipped: skipped };
    const [doc, problems] = S.buildPageDocument(pid, page, tl, sent, JSON.parse(text), source);
    const [errors] = this.check(doc);
    await this.book.saveModel(pid, doc, !errors.length);
    await this.book.writeFile(`work/${pid}.transcription.txt`, text + "\n");
    return { doc, errors, problems, cost, seconds };
  }
}
