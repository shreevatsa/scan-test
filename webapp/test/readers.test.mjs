import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Maker, post } from "../js/pipeline/run.js";
import { Book, idb } from "../js/store.js";
import { makeValidator, checkPage } from "../js/schema.js";
import { readerOptions, readerById, usageCost, projectBookCost, STRUCTURER, structurePath } from "../js/pipeline/readers.js";
import { openaiCost } from "../js/pipeline/steps.js";
import { visionRequest, visionReading, visionCost } from "../js/pipeline/vision.js";
import { selectPageRegions, checkReading, combineReading, structureSchema, markedText, plainReading } from "../js/pipeline/split.js";
import { compareReadings, characterEdits, compareRegions } from "../js/pipeline/compare.js";
import { tesseractWords, wordsToReading } from "../js/pipeline/ocr.js";
import { layerState } from "../js/layers.js";

const types = { format: "types", schema_version: "0.1", book_id: "trial", title: "Trial", languages: ["en"],
  types: { paragraph: { description: "A paragraph", region: "paragraph", flow: "main" },
    figure: { description: "A picture", region: "figure", flow: "main" },
    page_number: { description: "Page number", region: "page_number", role: "furniture" } }, flows: { main: "Main text" } };
const polygon = (y = 0) => [[[0, y], [100, y], [100, y + 20], [0, y + 20]]];
const region = (id = 1, y = 0) => ({ region_id: id, type: "paragraph", keep: true, region_class: "paragraph", reading_order: id,
  status: "ok", polygons: polygon(y), model_box: [0, y, 101, y + 21], bounds: [0, y, 101, y + 21],
  lines: [{ line_id: id * 10, polygons: polygon(y) }] });
const records = { width: 110, height: 100, char_h: 15, local_method: "test", regions: [region()] };
const sent = selectPageRegions(records.regions).sent;
const reading = text => ({ regions: [{ id: "r1", lines: [{ n: 1, text }], uncertain: false, note: null }] });
const structure = { regions: [{ id: "r1", type: "paragraph", ends: ["line"], uncertain: false, note: null }],
  units: [{ id: "u1", type: "paragraph", number: null, label: null, open_start: false, open_end: false, children: ["r1"] }],
  flows: [{ flow: "main", units: ["u1"] }] };
const usage = { total_input_tokens: 100, total_output_tokens: 20, total_thought_tokens: 10, total_cached_tokens: 0 };
const validate = makeValidator(JSON.parse(readFileSync(new URL("../schema.json", import.meta.url))));

function fixture() {
  const files = new Map(), calls = [], costs = [];
  const manifest = { format: "book-folder", book_id: "trial", title: "Trial", types: "types.json", pages: [
    { id: "p1", pdf_page: 1, document: "pages/p1.json" }, { id: "p2", pdf_page: 2, document: "pages/p2.json" } ] };
  const book = new Book("folder", { name: "test" }, manifest, structuredClone(types));
  book.readJson = async path => files.has(path) ? JSON.parse(files.get(path)) : null;
  book.writeFile = async (path, data) => { files.set(path, data); };
  book.removeFile = async path => { files.delete(path); };
  book.draft = async () => null;
  book.clearDraft = async () => {};
  book.model = async pid => book.models.get(pid) || null;
  book.imageBlob = async () => new Blob(["image"], { type: "image/png" });
  book.work.set("work/p1.regions.json", structuredClone(records));
  book.work.set("work/p2.regions.json", structuredClone(records));
  const request = async (provider, payload) => {
    calls.push({ provider, payload });
    const parsed = payload.response_format.schema.properties.regions.items.properties.ends ? structure : reading("<b>Print</b>[1]");
    return { body: { status: "completed", usage, outputs: [{ type: "text", text: JSON.stringify(parsed) }] }, seconds: 2 };
  };
  globalThis.createImageBitmap = async () => ({ width: 110, height: 100, close() {} });
  const maker = new Maker(book, { keys: { gemini: "test-key" }, request, onCost: cost => costs.push(cost),
    check: doc => checkPage(validate, doc, book.types),
    images: { overview: async () => "data:image/png;base64,AA==", cutout: async () => "data:image/png;base64,AA==" },
    recognize: async () => ({ reading: reading("Print"), words: 1, confidence: 99 }) });
  return { book, maker, calls, costs, files };
}

test("reader defaults cover legacy books and script subtags", () => {
  assert.deepEqual(readerOptions(), { reader: "argon-low", ocr_languages: "eng", structurer: "argon-structure" });
  assert.equal(readerOptions({}, { languages: ["kn-Knda"] }).ocr_languages, "kan+eng");
  assert.equal(readerOptions({}, { languages: ["sa-Deva"] }).ocr_languages, "san+eng");
  assert.throws(() => readerOptions({ reader: "missing" }), /Unknown transcription model/);
  assert.throws(() => readerOptions({ ocr_languages: "missing" }), /language packs/);
  assert.throws(() => readerOptions({ structurer: "missing" }), /schema assignment model/);
});

test("changing the schema model preserves transcription caches and earlier schema trials", async () => {
  const { book, maker, calls } = fixture();
  const first = await maker.transcribe("p1");
  const second = await maker.transcribe("p1", { options: { reader: "argon-low", structurer: "flash-structure" } });
  assert.equal(calls.length, 3);
  assert.equal(second.reading.fingerprint, first.reading.fingerprint);
  assert.equal(second.doc.source.structurer.model, "gemini-3.8-flash");
  assert.equal(second.doc.page.regions[0].lines[0].text, first.doc.page.regions[0].lines[0].text);
  assert.equal((await book.readWork(structurePath("p1", "argon-low"))).profile.id, "argon-structure");
  assert.equal((await book.readWork(structurePath("p1", "argon-low", "flash-structure"))).profile.id, "flash-structure");
  await maker.transcribe("p1");
  assert.equal(calls.length, 3);
});

test("stage integration preserves the historical requests and completion cache on an unedited page", async () => {
  const { maker, book, calls } = fixture();
  const raw = await maker.read("p1");
  const old = await maker.structure("p1", raw);
  const requests = structuredClone(calls);
  const out = await maker.transcribe("p1");
  assert.deepEqual(calls, requests);
  assert.equal(out.structure.fingerprint, old.fingerprint);
  assert.equal(out.reading.fingerprint, raw.fingerprint);
  assert.equal(layerState(await book.current("p1"), "units").state, "model");
  // Force the new path, then compare payloads with the historical builders.
  await maker.transcribe("p1", { force: true });
  assert.deepEqual(calls.slice(2), requests);
});

test("legacy transcription caches gain a geometry key and survive type and convention changes", async () => {
  const { maker, book, calls } = fixture();
  const first = await maker.read("p1");
  const old = { ...first };
  delete old.geometry_key;
  await book.writeWork("work/readings/p1/argon-low.json", old);
  book.types.conventions = ["A revised convention"];
  const record = book.work.get("work/p1.regions.json");
  record.regions[0].type = "changed_paragraph";
  book.types.types.changed_paragraph = book.types.types.paragraph;
  const reused = await maker.read("p1");
  assert.equal(calls.length, 1);
  assert.equal(reused.fingerprint, first.fingerprint);
  assert.equal(reused.prior_revision, true);
  assert.ok((await book.readWork("work/readings/p1/argon-low.json")).geometry_key);
  await maker.read("p1", { reader: "flash-low" });
  assert.equal(calls.length, 2);
});

test("current edited geometry and box replace the work record and are retained through transcription", async () => {
  const { maker, book } = fixture();
  const first = await maker.read("p1");
  const doc = maker.provisional("p1", records, first.image_sha256);
  await book.saveStage("p1", doc, true);
  const edited = structuredClone(doc);
  edited.page.regions[0].box = [1, 0, 101, 21];
  edited.page.regions[0].polygons[0][0][0] = 1;
  edited.page.regions[0].lines[0].polygons[0][0][0] = 1;
  await book.saveEdit("p1", edited);
  const rec = await maker.sourceRegions("p1");
  assert.equal(rec.model_box, undefined);
  assert.equal(rec.regions[0].model_box[0], 1);
  assert.equal(rec.regions[0].lines[0].polygons[0][0][0], 1);
  assert.equal(rec.char_h, 15);
  await maker.read("p1", null, { save: true });
  const saved = await book.current("p1");
  assert.equal(saved.page.regions[0].box[0], 1);
  assert.equal(layerState(saved, "regions").state, "edited");
  assert.equal(layerState(saved, "text").state, "model");
});

test("completion uses corrected formatting and markers without paying for another transcription", async () => {
  const { maker, book, calls } = fixture();
  const first = await maker.transcribe("p1");
  const edited = structuredClone(first.doc);
  edited.page.regions[0].lines[0].text = "Fixed";
  edited.page.regions[0].lines[0].spans = [{ kind: "italic", start: 0, end: 5 },
    { kind: "note_marker", id: "m1", marker: "2", start: 5, end: 5 }];
  await book.saveEdit("p1", edited);
  const before = JSON.stringify(await book.current("p1"));
  const prepared = await maker.completionInput("p1");
  assert.equal(calls.length, 2);
  assert.equal(prepared.input.parsed.regions[0].lines[0].text, "<i>Fixed</i>[2]");
  assert.equal(JSON.stringify(await book.current("p1")), before);
  const out = await maker.transcribe("p1");
  assert.equal(calls.length, 3);
  assert.ok(JSON.stringify(calls[2].payload).includes("<i>Fixed</i>[2]"));
  assert.equal(out.doc.page.regions[0].lines[0].text, "Fixed");
  assert.equal(out.doc.source.suggestions.text, "work/readings/p1/argon-low.json");
  assert.equal(layerState(out.doc, "text").state, "edited");
});

test("a correction saved during a model call becomes protected and the model result becomes a suggestion", async () => {
  const { maker, book } = fixture();
  await maker.read("p1", null, { save: true });
  const request = maker.request;
  maker.request = async (...args) => {
    const latest = structuredClone(await book.current("p1"));
    latest.page.regions[0].lines[0].text = "Corrected while waiting";
    latest.page.regions[0].lines[0].spans = [];
    await book.saveEdit("p1", latest);
    return request(...args);
  };
  await maker.read("p1", { reader: "flash-low" }, { save: true });
  const saved = await book.current("p1");
  assert.equal(saved.page.regions[0].lines[0].text, "Corrected while waiting");
  assert.equal(saved.source.suggestions.text, "work/readings/p1/flash-low.json");
  assert.equal(book.edits.has("p1"), false);
  const next = fixture();
  const initial = await next.maker.read("p1");
  await next.book.saveStage("p1", next.maker.provisional("p1", records, initial.image_sha256), true);
  const laterRequest = next.maker.request;
  next.maker.request = async (...args) => {
    const moved = structuredClone(await next.book.current("p1"));
    moved.page.regions[0].polygons[0][0][0] += 1;
    moved.page.regions[0].lines[0].polygons[0][0][0] += 1;
    await next.book.saveEdit("p1", moved);
    return laterRequest(...args);
  };
  await assert.rejects(next.maker.transcribe("p1", { force: true }), /current line pieces have no transcription/);
  assert.equal(next.calls.length, 2, "completion waits for text matching the changed geometry");
});

test("invalid drafts stop before a model call and valid drafts feed completion as edited text", async () => {
  const { maker, book, calls } = fixture();
  const out = await maker.transcribe("p1");
  const draft = structuredClone(out.doc);
  draft.flows.main = ["p1#missing"];
  book.draft = async () => ({ doc: draft });
  await assert.rejects(maker.transcribe("p1"), /Fix this page's draft/);
  assert.equal(calls.length, 2);
  draft.flows = out.doc.flows;
  draft.page.regions[0].lines[0].text = "Draft correction";
  draft.page.regions[0].lines[0].spans = [];
  book.clearDraft = async () => { book.draft = async () => null; };
  const completed = await maker.transcribe("p1");
  assert.equal(calls.length, 3);
  assert.equal(completed.doc.page.regions[0].lines[0].text, "Draft correction");
  book.draft = async pid => pid === "p2" ? { doc: { ...draft, flows: { main: ["p2#missing"] } } } : null;
  await assert.doesNotReject(maker.context("p1", { reader: "argon-low" }));
});

test("comparison trials and read-only runs save work records without writing page documents", async () => {
  const { maker, book, files } = fixture();
  const reading = await maker.read("p1");
  await maker.structure("p1", reading);
  assert.equal(files.has("pages/p1.json"), false);
  assert.equal(await book.current("p1"), null);
  book.kind = "chaya";
  book.writeWork = async (path, value) => { book.work.set(path, value); };
  await maker.transcribe("p1");
  assert.equal(files.has("pages/p1.json"), false);
  await assert.rejects(book.saveStage("p1", {}, true), /writable copy/);
});

test("completion is independent of transcription and cached region trials can become provisional pages", async () => {
  const { maker, book, calls } = fixture();
  const regions = await maker.findRegions("p1", { force: false });
  assert.equal(regions.cached, true);
  assert.equal(calls.length, 0);
  assert.equal(layerState(await book.current("p1"), "units").state, "provisional");
  await maker.read("p1", null, { save: true });
  const before = calls.length;
  await maker.complete("p1");
  assert.equal(calls.length, before + 1);
  assert.ok(calls.at(-1).payload.response_format.schema.properties.regions.items.properties.ends);
  // Existing page documents can be completed even without any saved OCR trial.
  await book.writeWork("work/readings/p1/argon-low.json", null);
  await maker.complete("p1");
  assert.equal(calls.length, before + 2);
});

test("local finder trials retain independent results and preserve current page work", async () => {
  const { maker, book, calls, costs } = fixture();
  let analyses = 0;
  maker.outlines = async (pid, url, boxes) => {
    analyses++;
    assert.equal(boxes, null);
    return { blocks: [{ box: [0, 0, 101, 21], column: 0, line_count: 1, text_height: 20 }],
      geometry: [{ rings: polygon(), lines: [{ line_id: 10, rings: polygon() }] }], charH: 15, angle: 0, method: "063-fragment-band-lines" };
  };
  const original = JSON.stringify(await maker.regions("p1"));
  const trial = await maker.findRegions("p1", { finder: "local-blocks", save: false, trial: true, force: false });
  assert.equal(await book.current("p1"), null);
  assert.equal(JSON.stringify(await maker.regions("p1")), original);
  assert.equal(trial.region_call.cost_usd, 0);
  assert.equal(calls.length, 0);
  const selected = await maker.findRegions("p1", { finder: "local-blocks", force: false });
  assert.equal(selected.cached, true);
  assert.equal(analyses, 1);
  assert.equal((await book.current("p1")).source.layers.regions.made_by, "079-local-line-block-regions");
  assert.equal(JSON.stringify(await maker.finderResult("p1", "terra-regions")), original);
  assert.deepEqual(costs, [0]);
  const edited = structuredClone(await book.current("p1"));
  edited.page.regions[0].source.uncertain = false;
  edited.page.regions[0].box[2] = 100;
  await book.saveEdit("p1", edited, { focus: "regions" });
  await maker.findRegions("p1", { finder: "local-blocks", force: true });
  assert.equal((await book.current("p1")).page.regions[0].source.uncertain, false);
  assert.equal((await book.current("p1")).source.suggestions.regions, "work/region-finders/p1/local-blocks.json");
});

test("Tesseract finder caches depend on language and type definitions", async () => {
  const { maker, book, calls } = fixture();
  let recognitions = 0;
  maker.layout = async () => { recognitions++; return { blocks: [] }; };
  maker.outlines = async () => ({ geometry: [], charH: 15, angle: 0, method: "063-fragment-band-lines" });
  await book.saveReaderOptions({ finder: "tesseract-regions", ocr_languages: "eng" });
  await maker.findRegions("p1", { force: false, save: false, trial: true });
  await maker.findRegions("p1", { force: false, save: false, trial: true });
  assert.equal(recognitions, 1);
  await book.saveReaderOptions({ finder: "tesseract-regions", ocr_languages: "san+eng" });
  await maker.findRegions("p1", { force: false, save: false, trial: true });
  assert.equal(recognitions, 2);
  book.types.types.paragraph.description = "Changed definition";
  await maker.findRegions("p1", { force: false, save: false, trial: true });
  assert.equal(recognitions, 3);
  assert.equal(calls.length, 0);
});

const visionResponse = { responses: [{ fullTextAnnotation: { pages: [{ blocks: [{ paragraphs: [{ words: [
  { symbols: [{ text: "P" }, { text: "rint" }], boundingBox: { vertices: [{}, { x: 40 }, { x: 40, y: 15 }, { y: 15 }] } },
] }] }] }] } }] };

test("Cloud Vision maps full-page word geometry and records per-page cost without image payloads", async () => {
  const profile = readerById("vision-document");
  assert.equal(visionRequest(profile, "data:image/png;base64,AA==").requests[0].features[0].type, "DOCUMENT_TEXT_DETECTION");
  assert.equal(visionReading(visionResponse, sent).regions[0].lines[0].text, "Print");
  assert.equal(visionCost(visionResponse, profile), 0.0015);
  assert.equal(visionCost({ responses: [{ error: { code: 7 } }] }, profile), null);
  assert.throws(() => visionReading({ responses: [{ error: { message: "API disabled" } }] }, sent), /API disabled/);
  assert.throws(() => visionReading({ responses: [{}] }, sent), /word geometry/);
  const { book, maker, costs } = fixture();
  maker.keys.vision = "vision-test-key";
  let count = 0;
  maker.request = async provider => { assert.equal(provider, "vision"); count++; return { body: visionResponse, seconds: 1 }; };
  const result = await maker.read("p1", { reader: "vision-document" });
  assert.equal(result.cost_usd, 0.0015);
  assert.equal(result.parsed.regions[0].lines[0].text, "Print");
  const call = await book.readWork(result.path);
  assert.equal(call.request.requests[0].image.content, "<image rebuilt from the book's source>");
  await maker.read("p1", { reader: "vision-document", structurer: "flash-structure" });
  assert.equal(count, 1);
  assert.deepEqual(costs, [0.0015]);
});

test("Cloud Vision supports separate API-key and OAuth authentication", async () => {
  const originalFetch = globalThis.fetch, requests = [];
  globalThis.fetch = async (url, options) => { requests.push({ url, options }); return { ok: true, json: async () => visionResponse }; };
  try {
    await post("vision", {}, "api-key");
    await post("vision", {}, "access-token", { mode: "oauth", project: "quota-project" });
    assert.equal(requests[0].options.headers["x-goog-api-key"], "api-key");
    assert.equal(requests[1].options.headers.Authorization, "Bearer access-token");
    assert.equal(requests[1].options.headers["x-goog-user-project"], "quota-project");
    assert.equal(requests[1].options.headers["x-goog-api-key"], undefined);
    assert.ok(requests.every(request => !request.url.includes("key=")));
  } finally { globalThis.fetch = originalFetch; }
});

test("costs include thinking, cached input and scheduled rates", () => {
  const profile = readerById("argon-high");
  assert.equal(usageCost(usage, profile, "2026-11-08"), 0.0005);
  assert.equal(usageCost(usage, profile, "2026-12-01"), 0.001);
  assert.equal(usageCost({ ...usage, total_cached_tokens: 50 }, profile, "2026-11-08"), 0.000405);
  assert.equal(usageCost(null, profile, "2026-11-08"), null);
  assert.equal(usageCost({ total_input_tokens: 100 }, profile, "2026-11-08"), null);
  assert.equal(usageCost(null, readerById("tesseract")), 0);
});

test("region costs include cache writes and reject unsupported usage", () => {
  const pricing = { input_per_million_usd: 1, cached_input_per_million_usd: 0.05,
    cache_write_30m_per_million_usd: 1.25, output_per_million_usd: 5 };
  const usage = { input_tokens: 1000, output_tokens: 100, total_tokens: 1100,
    input_tokens_details: { cached_tokens: 200, cache_write_tokens: 600 } };
  assert.equal(openaiCost(usage, pricing), 0.00146);
  assert.equal(openaiCost({ input_tokens: 1000, output_tokens: 100, total_tokens: 1100 }, pricing), 0.0015);
  assert.equal(openaiCost(null, pricing), null);
  assert.equal(openaiCost({ ...usage, total_tokens: 0 }, pricing), null);
  assert.equal(openaiCost({ ...usage, input_tokens: -1 }, pricing), null);
  assert.equal(openaiCost({ ...usage, input_tokens_details: { cache_write_tokens: 1001 } }, pricing), null);
  assert.equal(openaiCost({ input_tokens: 300000, output_tokens: 100, total_tokens: 300100 }, pricing), null);
  assert.equal(openaiCost(usage, pricing, "fast"), null);
  assert.equal(openaiCost({ ...usage, output_tokens_details: { reasoning_tokens: 101 } }, pricing), null);
});

test("whole-book projections include every stage and preserve zero-cost local OCR", () => {
  const samples = [
    { regions: { cost_usd: 0.01 }, reading: { cost_usd: 0.02 }, structure: { cost_usd: 0.03 } },
    { regions: { cost_usd: 0.02 }, reading: { cost_usd: 0 }, structure: { cost_usd: 0.04 } },
  ];
  assert.ok(Math.abs(projectBookCost(samples, 267) - 16.02) < 1e-10);
  assert.equal(projectBookCost(samples, 1000), 60);
  const old = structuredClone(samples);
  delete old[0].regions;
  assert.equal(projectBookCost(old, 267), null);
  old[0].regions = { cost_usd: null };
  assert.equal(projectBookCost(old, 267), null);
  old[0].regions = { cost_usd: 0.01 };
  delete old[0].structure;
  assert.equal(projectBookCost(old, 267), null);
  assert.equal(projectBookCost([], 267), null);
  for (const count of [0, -1, 2.5, NaN, Infinity]) assert.equal(projectBookCost(samples, count), null);
});

test("page-region detection saves the complete estimated charge through its normal entry point", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => ({ json: async () => JSON.parse(readFileSync(url)), text: async () => readFileSync(url, "utf8") });
  try {
    const { book, maker, costs } = fixture();
    maker.keys.openai = "test-key";
    maker.request = async () => ({ seconds: 2, body: { model: "gpt-6.1-terra", id: "regions-test", status: "completed", service_tier: "default",
      usage: { input_tokens: 1000, output_tokens: 100, total_tokens: 1100,
        input_tokens_details: { cached_tokens: 200, cache_write_tokens: 600 } },
      output: [{ type: "message", content: [{ type: "output_text", text: '{"regions":[]}' }] }] } });
    const regions = await maker.findRegions("p1");
    assert.equal(regions.region_call.cost_usd, 0.00146);
    assert.equal((await book.readWork("work/p1.regions.json")).region_call.cost_usd, 0.00146);
    assert.equal((await book.readWork("work/reader-lab/ledger.json")).calls[0].cost_usd, 0.00146);
    assert.deepEqual(costs, [0.00146]);
    assert.equal(layerState(await book.current("p1"), "regions").state, "model");
    assert.equal(layerState(await book.current("p1"), "units").state, "provisional");
    assert.equal(layerState(await book.current("p1"), "text"), null);
  } finally { globalThis.fetch = originalFetch; }
});

test("reading contracts reject missing, duplicate and misnumbered text", () => {
  assert.equal(checkReading(reading("Text"), sent).regions[0].lines[0].text, "Text");
  assert.throws(() => checkReading({ regions: [] }, sent), /regions/);
  const broken = reading("Text"); broken.regions[0].lines[0].n = 2;
  assert.throws(() => checkReading(broken, sent), /invalid line/);
  const two = selectPageRegions([region(1), region(2, 30)]).sent;
  assert.throws(() => checkReading({ regions: [...reading("Text").regions, ...reading("Text").regions] }, two), /repeated/);
});

test("the structurer cannot rewrite reader text or supply different line counts", () => {
  const injected = structuredClone(structure);
  injected.regions[0].lines = [{ n: 1, text: "Rewritten" }];
  assert.equal(combineReading(reading("<i>Original</i>[1]"), injected, sent).regions[0].lines[0].text, "<i>Original</i>[1]");
  assert.equal(structureSchema(types, sent).properties.regions.items.properties.lines, undefined);
  injected.regions[0].ends = [];
  assert.throws(() => combineReading(reading("Original"), injected, sent), /line-end/);
});

test("figures retain geometry while their legacy empty line is excluded", () => {
  const figure = { ...region(2), region_class: "figure", type: "figure" };
  const selected = selectPageRegions([figure]).sent;
  assert.deepEqual(selected[0].line_ids, []);
  assert.deepEqual(checkReading({ regions: [] }, selected), { regions: [] });
});

test("saved inline formatting and note markers round-trip", () => {
  const text = markedText({ text: "A😀B", spans: [
    { kind: "bold", start: 1, end: 2 }, { kind: "note_marker", start: 2, end: 2, marker: "†" } ] });
  assert.equal(text, "A<b>😀</b>[†]B");
  assert.equal(plainReading(text), "A😀B");
});

test("agreement scores use Unicode characters and only checked lines count as truth", () => {
  assert.equal(characterEdits("😀a", "😀b"), 1);
  assert.equal(characterEdits("", "abc"), 3);
  assert.equal(characterEdits("abc", ""), 3);
  assert.equal(characterEdits("cafe\u0301".normalize("NFC"), "café"), 0);
  const score = compareReadings(reading("<b>cat</b>"), reading("car"), sent, types,
    { "r1:10": { text: "cat", checked: true } });
  assert.equal(score.edits, 1);
  assert.equal(score.characters, 3);
  assert.equal(score.formatting_differences, 1);
  assert.equal(score.checked_edits, 0);
  assert.equal(score.checked_characters, 3);
  assert.equal(compareReadings(reading("cat"), reading("car"), sent, types).checked_errors_per_1000, null);
  assert.equal(compareReadings(reading(""), reading(""), sent, types).differences_per_1000, null);
  const furniture = selectPageRegions([{ ...region(), type: "page_number" }]).sent;
  assert.equal(compareReadings(reading("9"), reading("8"), furniture, types).characters, 0);
});

test("differing regions show all models and retain agreeing lines for context", () => {
  const first = region();
  first.lines.push({ line_id: 11, polygons: polygon(22) });
  const selected = selectPageRegions([first, region(2, 50), { ...region(3, 75), type: "page_number" }]).sent;
  const reference = { regions: [
    { id: "r1", lines: [{ n: 1, text: "same" }, { n: 2, text: "context" }] },
    { id: "r2", lines: [{ n: 1, text: "agree" }] },
    { id: "r3", lines: [{ n: 1, text: "3" }] },
  ] };
  const candidate = structuredClone(reference);
  candidate.regions[0].lines[0].text = "different";
  const models = [
    { id: "reference", transcription: reference },
    { id: "matching", transcription: reference },
    { id: "different", transcription: candidate },
    { id: "pending", transcription: null },
  ];
  const regions = compareRegions(reference, models, selected, types);
  assert.deepEqual(regions.map(region => [region.id, region.differs]), [["r1", true], ["r2", false]]);
  assert.deepEqual(regions[0].models.map(model => model.id), models.map(model => model.id));
  assert.deepEqual(regions[0].models[2].lines.map(line => line.candidate), ["different", "context"]);
  assert.equal(regions[0].models[3].lines, null);
  candidate.regions[0].lines[0].text = "<b>same</b>";
  const formatted = compareRegions(reference, models, selected, types);
  assert.equal(formatted[0].differs, true);
  assert.equal(formatted[0].models[2].edits, 0);
  assert.equal(formatted[0].models[2].formatting_differences, 1);
  candidate.regions[0].lines[0].text = "same";
  assert.ok(compareRegions(reference, models, selected, types).every(region => !region.differs));
});

test("Tesseract word boxes map to source lines and ignore outside text", () => {
  const selected = selectPageRegions([region(1), region(2, 30)]).sent;
  const word = (text, x, y) => ({ text, bbox: { x0: x, y0: y, x1: x + 20, y1: y + 10 }, confidence: 90 });
  const words = [word("second", 40, 2), word("first", 1, 2), word("next", 2, 33), word("outside", 200, 200)];
  const data = { blocks: [{ paragraphs: [{ lines: [{ words }] }] }] };
  assert.equal(tesseractWords(data).length, 4);
  assert.deepEqual(wordsToReading(words, selected).regions.map(r => r.lines[0].text), ["first second", "next"]);
});

test("normal transcription caches both stages, fixes the structurer, and saves the result", async () => {
  const { maker, book, calls, costs } = fixture();
  const result = await maker.transcribe("p1", { options: { reader: "flash-low" } });
  assert.deepEqual(result.errors, []);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].payload.model, "gemini-3.8-flash");
  assert.equal(calls[1].payload.model, STRUCTURER.model);
  assert.equal(calls[1].payload.generation_config.thinking_level, "high");
  assert.ok(calls[1].payload.input.every(item => item.type === "text"));
  assert.equal((await book.model("p1")).page.regions[0].lines[0].text, "Print");
  assert.equal(costs.length, 2);
  await maker.transcribe("p1", { options: { reader: "flash-low" } });
  assert.equal(calls.length, 2);
  assert.equal(costs.length, 2);
  assert.equal((await book.readWork("work/reader-lab/ledger.json")).calls.length, 2);
});

test("failed paid structuring is recorded and retries reuse the reading", async () => {
  const { maker, calls, book, costs } = fixture();
  const request = maker.request;
  let failed = false;
  maker.request = async (...args) => {
    const result = await request(...args);
    if (calls.length === 2) { failed = true; result.body.outputs[0].text = "{"; }
    return result;
  };
  await assert.rejects(maker.transcribe("p1"));
  assert.equal(failed, true);
  const ledger = await book.readWork("work/reader-lab/ledger.json");
  assert.equal(ledger.calls[1].status, "failed");
  assert.ok(ledger.calls[1].cost_usd > 0);
  await maker.transcribe("p1");
  assert.equal(calls.length, 3);
  assert.equal(costs.length, 3);
  assert.ok(calls[2].payload.response_format.schema.properties.regions.items.properties.ends);
});

test("a storage failure after a paid response still counts cost and blocks further API calls", async () => {
  const { maker, book, calls, costs } = fixture();
  const write = book.writeWork.bind(book);
  book.writeWork = async (path, value) => {
    if (value.format === "reader-call" && value.status === "completed") throw new Error("Storage is full");
    await write(path, value);
  };
  await assert.rejects(maker.read("p1"), /Further API calls are stopped/);
  assert.equal(costs.length, 1);
  assert.ok(costs[0] > 0);
  await assert.rejects(maker.read("p2"), /Further API calls are stopped/);
  assert.equal(calls.length, 1);
});

test("concurrent requests share work and only changed ink geometry invalidates transcription caches", async () => {
  const { maker, calls, book } = fixture();
  await Promise.all([maker.read("p1"), maker.read("p1")]);
  assert.equal(calls.length, 1);
  await maker.read("p1", null, { force: true });
  assert.equal(calls.length, 2);
  book.types.title = "Changed book conventions";
  await maker.read("p1");
  assert.equal(calls.length, 2);
  book.work.get("work/p1.regions.json").regions[0].lines[0].polygons[0][0][0] = 1;
  await maker.read("p1");
  assert.equal(calls.length, 3);
});

test("local reading has zero API calls and saved neighbor readings reach structuring", async () => {
  const { maker, calls } = fixture();
  const options = { reader: "tesseract" };
  const local = await maker.read("p1", options);
  assert.equal(local.cost_usd, 0);
  assert.equal(calls.length, 0);
  await maker.read("p2", options);
  await maker.structure("p1", local);
  assert.equal(calls.length, 1);
  const input = JSON.parse(calls[0].payload.input[1].text);
  assert.equal(input.neighbors[0].page, "p2");
  assert.equal(input.neighbors[0].regions[0].lines[0].text, "Print");
});

test("saving a new document retains composite-page gap metadata for future context", async () => {
  const { maker, book } = fixture();
  const result = await maker.transcribe("p1");
  result.doc.source.sample = { consecutive_next: false, source_pdf_page: 43 };
  await book.saveStage("p1", result.doc, true);
  const replacement = structuredClone(result.doc);
  delete replacement.source.sample;
  replacement.units[0].open = { end: true };
  await book.saveModel("p1", replacement, true);
  assert.equal((await book.model("p1")).source.sample.consecutive_next, false);
  assert.equal((await book.model("p1")).units[0].open, undefined);
  assert.deepEqual((await book.model("p1")).source.sample.original_open_ends.u1, { end: true });
  await maker.read("p2");
  assert.deepEqual(await maker.context("p1", { reader: "argon-low" }), []);
});

test("read-only books persist reader settings and trial records in their exported overlay", async () => {
  const originals = { ...idb }, data = new Map();
  const key = (store, k) => JSON.stringify([store, k]);
  idb.get = async (store, k) => data.get(key(store, k));
  idb.put = async (store, k, value) => { data.set(key(store, k), structuredClone(value)); };
  idb.keys = async store => [...data.keys()].map(k => JSON.parse(k)).filter(k => k[0] === store).map(k => k[1]);
  try {
    const manifest = { book_id: "trial", title: "Trial", types: "types.json", pages: [] };
    const open = () => new Book("chaya", "test-url", structuredClone(manifest), types, { files: { "work/original.json": { original: true } } });
    const book = open();
    await book.saveReaderOptions({ reader: "tesseract", ocr_languages: "eng" });
    await Promise.all(Array.from({ length: 10 }, () => book.updateWork("work/count.json", old => ({ count: (old?.count || 0) + 1 }))));
    const reopened = open();
    assert.equal((await reopened.getReaderOptions()).reader, "tesseract");
    assert.equal((await reopened.readWork("work/count.json")).count, 10);
    const exported = await reopened.chayaFiles();
    assert.equal(exported["work/count.json"].count, 10);
    assert.equal(exported["work/original.json"].original, true);
    assert.equal(exported["book.json"].reader_options.reader, "tesseract");
    assert.ok(!JSON.stringify(exported).includes("test-key"));
  } finally { Object.assign(idb, originals); }
});
