import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Maker, post } from "../js/pipeline/run.js";
import { Book, idb } from "../js/store.js";
import { makeValidator, checkPage } from "../js/schema.js";
import { readerOptions, readerById, usageCost, projectBookCost, bookCostEstimate, wholePageReading, DEFAULT_TRANSCRIPTION_REFERENCE, STRUCTURER, structurePath } from "../js/pipeline/readers.js";
import { openaiCost } from "../js/pipeline/steps.js";
import { visionRequest, visionReading, visionCost } from "../js/pipeline/vision.js";
import { selectPageRegions, checkReading, combineReading, structureSchema, markedText, plainReading } from "../js/pipeline/split.js";
import { compareReadings, characterEdits, compareRegions, comparePages } from "../js/pipeline/compare.js";
import { tesseractWords, wordsToReading } from "../js/pipeline/ocr.js";
import { layerState } from "../js/layers.js";
import { reviewCandidate, saveReview } from "../js/review.js";

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

function repairFixture() {
  const state = fixture(), texts = { r1: "Original one[1]", r2: "Original two", r3: "Added three" }, images = [];
  for (const pid of ["p1", "p2"]) state.book.work.set(`work/${pid}.regions.json`, { ...structuredClone(records), regions: [region(1), region(2, 40)] });
  state.maker.images = {
    overview: async (bitmap, sources) => { images.push(sources.map(([id]) => id)); return "data:image/png;base64,AA=="; },
    cutout: async () => "data:image/png;base64,AA==",
  };
  state.maker.request = async (provider, payload) => {
    state.calls.push({ provider, payload });
    const format = payload.response_format.schema;
    let parsed;
    if (format.properties.regions.items.properties.ends) {
      const input = JSON.parse(payload.input[1].text);
      parsed = { regions: input.regions.map(source => ({ id: source.id, type: source.type, ends: source.lines.map(() => "line"), uncertain: false, note: null })),
        units: input.regions.map((source, index) => ({ id: `u${index + 1}`, type: source.type, number: null, label: null,
          open_start: false, open_end: false, children: [source.id] })), flows: [{ flow: "main", units: input.regions.map((source, index) => `u${index + 1}`) }] };
    } else {
      const captions = payload.input.filter(item => item.type === "text").flatMap(item => [...item.text.matchAll(/(r\d+): ([^,\n]+), (\d+) lines?/g)]);
      parsed = { regions: captions.map(match => ({ id: match[1], uncertain: false, note: null,
        lines: Array.from({ length: Number(match[3]) }, (_, index) => ({ n: index + 1, text: texts[match[1]] || match[1] })) })) };
    }
    return { seconds: 2, body: { status: "completed", usage, outputs: [{ type: "text", text: JSON.stringify(parsed) }] } };
  };
  return { ...state, texts, images };
}

async function moveSecondRegion(book) {
  const current = await book.current("p1");
  if (!current) {
    const source = book.work.get("work/p1.regions.json").regions[1];
    source.polygons[0][0][0] = 2;
    source.lines[0].polygons[0][0][0] = 2;
    source.model_box[0] = 2;
    return;
  }
  const doc = structuredClone(current), second = doc.page.regions[1];
  second.polygons[0][0][0] = 2;
  second.lines[0].polygons[0][0][0] = 2;
  second.box[0] = 2;
  await book.saveEdit("p1", doc, { focus: "regions" });
}

test("a changed region gets one cut-out and combines with unchanged model text", async () => {
  const { maker, book, calls, texts, images, costs } = repairFixture();
  const first = await maker.read("p1");
  await moveSecondRegion(book);
  texts.r2 = "Repaired ಕನ್ನಡ[2]";
  const repaired = await maker.read("p1", null, { save: true });
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1].payload.response_format.schema.properties.regions.items.properties.id.enum, ["r2"]);
  assert.deepEqual(images, [["r1", "r2"], ["r2"]]);
  assert.deepEqual(repaired.parsed.regions.map(region => region.lines[0].text), [texts.r1, texts.r2]);
  assert.equal(repaired.partial, true);
  assert.deepEqual(repaired.region_ids, ["r2"]);
  assert.deepEqual(repaired.reused_regions, ["r1"]);
  assert.equal(repaired.parts.length, 2);
  assert.ok(Math.abs(repaired.cost_usd - costs[0] - costs[1]) < 1e-12);
  assert.deepEqual(await book.readWork(repaired.previous_reading), first);
  const call = await book.readWork(repaired.path);
  assert.equal(call.partial, true);
  assert.deepEqual(call.parsed.regions.map(region => region.id), ["r2"]);
  const doc = await book.current("p1");
  assert.equal(doc.page.regions[0].lines[0].text, "Original one");
  assert.equal(doc.page.regions[1].lines[0].text, "Repaired ಕನ್ನಡ");
  assert.equal((await maker.read("p1")).cached, true);
  assert.equal(calls.length, 2);
  const completed = await maker.complete("p1");
  assert.deepEqual(calls[2].payload.input[1].text.includes("Repaired ಕನ್ನಡ"), true);
  assert.equal(completed.doc.page.regions.length, 2);
  assert.deepEqual(checkPage(validate, completed.doc, book.types)[0], []);
});

test("a partial suggestion keeps human corrections and marker identities outside the repaired region", async () => {
  const { maker, book, texts, calls } = repairFixture();
  await maker.read("p1", null, { save: true });
  const human = structuredClone(await book.current("p1"));
  human.page.regions[0].lines[0].text = "Reviewed ಕನ್ನಡ";
  human.page.regions[0].lines[0].spans = [{ kind: "italic", start: 0, end: 3 },
    { kind: "note_marker", id: "m1", marker: "1", start: 3, end: 3 }];
  await book.saveEdit("p1", human, { focus: "text" });
  await moveSecondRegion(book);
  texts.r2 = "Repaired two[2]";
  const repaired = await maker.read("p1", null, { save: true });
  const base = structuredClone(await book.current("p1"));
  const suggestion = reviewCandidate(base, repaired, "text", book.types, null, { suggestion: true });
  const comparison = reviewCandidate(base, repaired, "text", book.types);
  assert.equal(base.page.regions[1].lines[0].text, "Original two");
  assert.deepEqual(suggestion.page.regions[0].lines, base.page.regions[0].lines);
  assert.equal(comparison.page.regions[0].lines[0].text, "Original one");
  assert.equal(suggestion.page.regions[1].lines[0].spans[0].id, "m2");
  await saveReview(book, "p1", { base, types: structuredClone(book.types), candidate: suggestion, layer: "text", scope: {},
    record: repaired, path: "work/readings/p1/argon-low.json", profile: "argon-low" });
  const saved = await book.current("p1");
  assert.equal(saved.page.regions[0].lines[0].text, "Reviewed ಕನ್ನಡ");
  assert.equal(saved.page.regions[1].lines[0].text, "Repaired two");
  assert.deepEqual(checkPage(validate, saved, book.types)[0], []);
  assert.equal(calls.length, 2);
});

test("failed or invalid partial responses retain the complete previous reading", async () => {
  const { maker, book, calls } = repairFixture();
  const first = await maker.read("p1");
  await moveSecondRegion(book);
  const request = maker.request;
  maker.request = async (...args) => {
    const value = await request(...args);
    value.body.outputs[0].text = '{"regions":[]}';
    return value;
  };
  await assert.rejects(maker.read("p1"), /returned 0 regions/);
  assert.deepEqual(await book.readWork("work/readings/p1/argon-low.json"), first);
  maker.request = request;
  const repaired = await maker.read("p1");
  assert.equal(repaired.parsed.regions.length, 2);
  assert.equal(calls.length, 3);
  assert.equal((await book.readWork("work/reader-lab/ledger.json")).calls.length, 3);
});

test("a failed combined save reuses the persisted partial response on retry", async () => {
  const { maker, book, calls, files, texts } = repairFixture();
  const first = await maker.read("p1");
  await moveSecondRegion(book);
  texts.r2 = "Recovered partial";
  const write = book.writeFile;
  book.writeFile = async (path, value) => { if (path === "work/readings/p1/argon-low.json") throw Error("Disk full"); await write(path, value); };
  await assert.rejects(maker.read("p1"), /Disk full/);
  assert.deepEqual(JSON.parse(files.get("work/readings/p1/argon-low.json")), first);
  book.writeFile = write;
  const repaired = await maker.read("p1");
  assert.equal(repaired.cached, true);
  assert.equal(repaired.parsed.regions[1].lines[0].text, "Recovered partial");
  assert.equal(calls.length, 2);
  assert.equal((await book.readWork("work/reader-lab/ledger.json")).calls.length, 2);
});

test("partial-call ledger recovery retains one charge and unknown calls wait for an explicit fresh result", async () => {
  const { maker, book, calls } = repairFixture();
  await maker.read("p1");
  await moveSecondRegion(book);
  const write = book.writeFile;
  let ledgerWrites = 0;
  book.writeFile = async (path, value) => {
    if (path === "work/reader-lab/ledger.json" && ++ledgerWrites === 2) throw Error("Ledger unavailable");
    await write(path, value);
  };
  await assert.rejects(maker.read("p1"), /Further API calls are stopped/);
  assert.equal(calls.length, 2);
  book.writeFile = write;
  await maker.read("p1");
  assert.equal(maker.persistenceFailure, null);
  assert.equal(calls.length, 2);
  assert.equal((await book.readWork("work/reader-lab/ledger.json")).calls.length, 2);

  const next = repairFixture();
  await next.maker.read("p1");
  await moveSecondRegion(next.book);
  const request = next.maker.request;
  next.maker.request = async () => { throw Error("signal timed out"); };
  await assert.rejects(next.maker.read("p1"), /timed out/);
  next.maker.request = request;
  await assert.rejects(next.maker.read("p1"), /unresolved call/);
  const fresh = await next.maker.read("p1", null, { force: true });
  assert.equal(fresh.partial, undefined);
  assert.deepEqual(next.calls.at(-1).payload.response_format.schema.properties.regions.items.properties.id.enum, ["r1", "r2"]);
});

test("a newer cached transcription survives a partial call that finishes later", async () => {
  const { maker, book, calls } = repairFixture();
  const first = await maker.read("p1");
  await moveSecondRegion(book);
  const newer = structuredClone(first);
  newer.parsed.regions[0].lines[0].text = "Newer saved result";
  const request = maker.request;
  maker.request = async (...args) => { await book.writeWork("work/readings/p1/argon-low.json", newer); return request(...args); };
  await assert.rejects(maker.read("p1"), /Another transcription was saved/);
  assert.deepEqual(await book.readWork("work/readings/p1/argon-low.json"), newer);
  maker.request = request;
  const repaired = await maker.read("p1");
  assert.equal(repaired.parsed.regions[0].lines[0].text, "Newer saved result");
  assert.equal(calls.length, 2);
});

test("added, removed and figure regions reuse only compatible text", async () => {
  const state = repairFixture();
  await state.maker.read("p1");
  state.book.work.get("work/p1.regions.json").regions.push(region(3, 70));
  const added = await state.maker.read("p1");
  assert.deepEqual(added.region_ids, ["r3"]);
  state.book.work.get("work/p1.regions.json").regions = state.book.work.get("work/p1.regions.json").regions.filter(region => region.region_id !== 2);
  const removed = await state.maker.read("p1");
  assert.deepEqual(removed.parsed.regions.map(region => region.id), ["r1", "r3"]);
  assert.equal(removed.cached, true);
  assert.equal(state.calls.length, 2);

  const figures = repairFixture();
  const second = figures.book.work.get("work/p1.regions.json").regions[1];
  second.type = "figure"; second.region_class = "figure";
  await figures.maker.read("p1");
  second.type = "paragraph"; second.region_class = "paragraph";
  const converted = await figures.maker.read("p1");
  assert.deepEqual(converted.region_ids, ["r2"]);
  assert.equal(converted.parsed.regions.length, 2);
});

test("a changed scan or explicit fresh request transcribes the whole page", async () => {
  const { maker, book, calls } = repairFixture();
  await maker.read("p1");
  book.imageBlob = async () => new Blob(["new scan"], { type: "image/png" });
  const replaced = await maker.read("p1");
  assert.equal(replaced.partial, undefined);
  await moveSecondRegion(book);
  const fresh = await maker.read("p1", null, { force: true });
  assert.equal(fresh.partial, undefined);
  assert.equal(calls.length, 3);
  assert.deepEqual(calls.at(-1).payload.response_format.schema.properties.regions.items.properties.id.enum, ["r1", "r2"]);
});

test("whole-book projections use whole-page samples and omit region repairs", () => {
  const full = { regions: { cost_usd: .01 }, reading: { cost_usd: .02 }, structure: { cost_usd: .03 } };
  const partial = { regions: { cost_usd: .01 }, reading: { cost_usd: 1, partial: true }, structure: { cost_usd: .03 } };
  assert.equal(projectBookCost([partial], 1000), null);
  assert.equal(projectBookCost([full, partial], 1000), 60);
});

test("price estimates retain measured stages when sample coverage differs or a stage has no price yet", () => {
  const samples = [{ reading: { cost_usd: .02 } }, { regions: { cost_usd: .01 } }, { structure: { cost_usd: .03 } }];
  const estimate = bookCostEstimate(samples, 1000);
  assert.equal(estimate.total, 60);
  assert.deepEqual(estimate.counts, { regions: 1, reading: 1, structure: 1 });
  samples.pop();
  const partial = bookCostEstimate(samples, 1000);
  assert.equal(partial.total, null);
  assert.equal(partial.known_total, 30);
  assert.deepEqual(partial.missing, ["structure"]);
});

test("repaired readings recover their whole-page price without including repair charges", async () => {
  const source = { image_sha256: "scan", profile: { id: "argon-low" }, cost_usd: .02 };
  const first = { ...source, partial: true, previous_reading: "original", cost_usd: .04 };
  const current = { ...first, previous_reading: "repair", cost_usd: .08 };
  const records = new Map([["original", source], ["repair", first]]);
  const book = { readWork: async path => records.get(path) };
  assert.equal((await wholePageReading(book, current)).cost_usd, .02);
  records.set("original", { ...source, image_sha256: "different scan" });
  assert.equal(await wholePageReading(book, current), null);
  records.set("original", { ...first, previous_reading: "repair" });
  assert.equal(await wholePageReading(book, current), null);
  records.clear();
  assert.equal(await wholePageReading(book, current), null);
});

test("local OCR maps the whole page and retains an immutable base for a region repair", async () => {
  const { maker, book, calls } = repairFixture();
  const recognized = [];
  maker.recognize = async (file, sources) => {
    recognized.push(sources.map(source => source.rid));
    return { reading: { regions: sources.filter(source => source.line_ids.length).map(source => ({ id: source.rid,
      lines: source.line_ids.map((id, index) => ({ n: index + 1, text: `OCR ${source.rid}` })), uncertain: false, note: null })) }, words: 2, confidence: 99 };
  };
  const first = await maker.read("p1", { reader: "tesseract" });
  await moveSecondRegion(book);
  const repaired = await maker.read("p1", { reader: "tesseract" });
  assert.equal(repaired.cost_usd, 0);
  assert.deepEqual(recognized, [["r1", "r2"], ["r1", "r2"]]);
  assert.deepEqual(repaired.region_ids, ["r2"]);
  assert.equal(repaired.parts.length, 2);
  assert.deepEqual(await book.readWork(repaired.parts[0].path), first);
  assert.equal((await book.readWork(repaired.parts[1].path)).format, "reading-part");
  assert.equal(calls.length, 0);
});

test("Cloud Vision reuses saved full-page word geometry for repairs and charges fresh recognition per image", async () => {
  const { maker, book, calls, costs } = repairFixture();
  maker.keys.vision = "fixture";
  const body = { responses: [{ fullTextAnnotation: { pages: [{ blocks: [{ paragraphs: [{ words: [
    { symbols: [{ text: "One" }], boundingBox: { vertices: [{ x: 10, y: 2 }, { x: 50, y: 2 }, { x: 50, y: 15 }, { x: 10, y: 15 }] } },
    { symbols: [{ text: "Two" }], boundingBox: { vertices: [{ x: 10, y: 42 }, { x: 50, y: 42 }, { x: 50, y: 55 }, { x: 10, y: 55 }] } },
  ] }] }] }] } }] };
  maker.request = async (provider, payload) => { calls.push({ provider, payload }); return { body, seconds: 1 }; };
  const first = await maker.read("p1", { reader: "vision-document" });
  await moveSecondRegion(book);
  const repaired = await maker.read("p1", { reader: "vision-document" });
  assert.equal(repaired.partial, true);
  assert.equal(repaired.ocr_reused, true);
  assert.equal(repaired.cost_usd, .0015);
  assert.deepEqual(repaired.parsed.regions.map(region => region.lines[0].text), ["One", "Two"]);
  assert.equal(calls.length, 1);
  assert.deepEqual(costs, [.0015]);
  assert.equal(repaired.parts[0].path, first.path);
  assert.equal(repaired.parts[1].path, first.path);
  const fresh = await maker.read("p1", { reader: "vision-document" }, { force: true });
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0].payload, calls[1].payload);

  // Older caches may lack the full response. Recover a paid repair even if the box moved again.
  delete fresh.response;
  await book.writeWork("work/readings/p1/vision-document.json", fresh);
  const source = book.work.get("work/p1.regions.json").regions[1];
  source.polygons = polygon(70); source.lines[0].polygons = polygon(70);
  const write = book.writeFile;
  book.writeFile = async (path, value) => { if (path === "work/readings/p1/vision-document.json") throw Error("Disk full"); await write(path, value); };
  await assert.rejects(maker.read("p1", { reader: "vision-document" }), /Disk full/);
  book.writeFile = write;
  source.polygons = polygon(45); source.lines[0].polygons = polygon(45);
  const recovered = await maker.read("p1", { reader: "vision-document" });
  assert.equal(recovered.parsed.regions[1].lines[0].text, "Two");
  assert.equal(calls.length, 3);
  assert.equal((await book.readWork(recovered.parts[1].path)).parsed.regions[0].lines[0].text, "");
});

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
  assert.ok(Math.abs(projectBookCost(old, 267) - 17.355) < 1e-10);
  old[0].regions = { cost_usd: null };
  assert.ok(Math.abs(projectBookCost(old, 267) - 17.355) < 1e-10);
  old[0].regions = { cost_usd: 0.01 };
  delete old[0].structure;
  assert.ok(Math.abs(projectBookCost(old, 267) - 17.355) < 1e-10);
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

test("cross-page comparisons retain repeated region IDs and skip missing references and unprocessed models", () => {
  const page = (id, reference, candidate) => ({ id, referenceId: "reference", reference, sent,
    models: [{ id: "reference", transcription: reference }, { id: "candidate", transcription: candidate }] });
  const regions = comparePages([
    page("p1", reading("same"), reading("different")),
    page("p2", null, reading("waiting for reference")),
    page("p3", reading("agree"), reading("agree")),
    page("p4", reading("reference only"), null),
    page("p5", reading("word"), reading("<b>word</b>")),
    page("p6", null, null),
  ], types);
  assert.deepEqual(regions.map(region => [region.page, region.id, region.differs]), [
    ["p1", "r1", true], ["p3", "r1", false], ["p5", "r1", true],
  ]);
  assert.deepEqual(regions.filter(region => region.differs).map(region => region.page), ["p1", "p5"]);
});

test("Carbon low and high use distinct settings and caches with dated token prices", async () => {
  const { maker, book, calls } = fixture();
  assert.equal(readerById(DEFAULT_TRANSCRIPTION_REFERENCE).thinking, "high");
  for (const level of ["low", "high"]) {
    const carbon = readerById(`carbon-${level}`);
    const config = JSON.parse(readFileSync(new URL(`../../methods/${carbon.method}/config.json`, import.meta.url)));
    assert.deepEqual(config.profile, carbon);
    assert.equal(usageCost(usage, carbon, "2026-11-09"), null);
    assert.equal(usageCost(usage, carbon, "2026-11-11"), .0005);
    assert.equal(usageCost(usage, carbon, "2026-12-01"), .001);
    const result = await maker.read("p1", { reader: carbon.id });
    const payload = calls.at(-1).payload;
    assert.equal(payload.model, "gemini-4-carbon");
    assert.equal(payload.generation_config.thinking_level, level);
    assert.equal(payload.generation_config.max_output_tokens, config.max_output_tokens);
    assert.equal(payload.store, false);
    assert.equal(result.profile.method, config.method);
    assert.equal((await book.readWork(`work/readings/p1/${carbon.id}.json`)).profile.id, carbon.id);
    assert.equal((await maker.read("p1", { reader: carbon.id })).cached, true);
  }
  await maker.read("p1", { reader: "argon-low" });
  assert.equal(calls.length, 3);
  assert.equal(calls[2].payload.model, "gemini-4-argon");
});

test("provider requests use a 75-second deadline", async () => {
  const originalFetch = globalThis.fetch, originalTimeout = AbortSignal.timeout, timeouts = [];
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ outputs: [{ type: "text", text: "OK" }] }) });
  AbortSignal.timeout = milliseconds => { timeouts.push(milliseconds); return new AbortController().signal; };
  try {
    await post("gemini", { model: "gemini-4-carbon", generation_config: { thinking_level: "high" } }, "fixture");
    await post("gemini", { model: "gemini-4-carbon", generation_config: { thinking_level: "low" } }, "fixture");
    await post("gemini", { model: "gemini-4-argon", generation_config: { thinking_level: "high" } }, "fixture");
    await post("vision", {}, "fixture");
    await post("openai", { model: "gpt-6.1-terra" }, "fixture");
    assert.deepEqual(timeouts, [75000, 75000, 75000, 75000, 75000]);
  } finally { globalThis.fetch = originalFetch; AbortSignal.timeout = originalTimeout; }
});

test("whole-page attempts enter the ledger before the provider request begins", async () => {
  const { maker, book } = fixture();
  maker.request = async () => {
    const pending = await book.readWork("work/reader-lab/ledger.json");
    assert.equal(pending.calls.length, 1);
    assert.equal(pending.calls[0].status, "requesting");
    assert.equal(pending.calls[0].cost_usd, null);
    throw Error("Request cancelled");
  };
  await assert.rejects(maker.read("p1"), /Request cancelled/);
  const saved = await book.readWork("work/reader-lab/ledger.json");
  assert.equal(saved.calls.length, 1);
  assert.equal(saved.calls[0].status, "failed");
  assert.equal(saved.calls[0].cost_usd, null);
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
