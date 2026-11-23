// The whole-page reader (method 100): its request, applying its answer, reuse and cost. No model is called.
// Fixtures: fixtures/method-100-pages.json holds three pages of the Rāmāyaṇa-mañjarī (PDF 25, 60, 150) as method 100 read them:
// the regions as the book had them after the reading (polygons shrunk to rectangles), the saved call's request and answer.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Maker } from "../js/pipeline/run.js";
import { Book } from "../js/store.js";
import { readerById, READERS, usageCost, readerOptions } from "../js/pipeline/readers.js";
import { RECIPE, MEASURED_PAGE_COST, pageCost, runEstimate } from "../js/recipe.js";
import { selectPageRegions, wholePageList, wholePagePrompt, wholePageSchema, checkWholePage, checkReading, UNFIT_NOTE } from "../js/pipeline/split.js";
import { mergeText } from "../js/pipeline/apply.js";
import { textFlags } from "../js/flags.js";

const fixture = JSON.parse(readFileSync(new URL("fixtures/method-100-pages.json", import.meta.url)));
const types = { format: "types", schema_version: "0.1", book_id: "r", ...fixture.types, languages: ["sa"], flows: { main: "Main" },
  types: Object.fromEntries([...new Set(fixture.pages.flatMap(p => p.regions.map(r => r.type)))].map(t => [t, { description: t, region: t, flow: "main" }])) };
const noCheck = () => [[], []];
const hydrogen = readerById("hydrogen-low-page");

// The page as the book had it before reading: regions and line pieces, no text.
function blankDocument(page) {
  return { format: "page", schema_version: "0.2", book_id: "r", units: [], flows: {}, relations: [], source: {},
    page: { id: page.id, width: page.width, height: page.height, regions: page.regions.map(r => ({ id: r.id, type: r.type, box: r.box, order: r.order,
      polygons: r.polygons, lines: r.lines.map(l => ({ line: l.line, polygons: l.polygons })) })) } };
}
function records(page) {   // the page's regions record, as the app keeps it
  return { width: page.width, height: page.height, char_h: 30, local_method: "test", regions: page.regions.map((r, i) => ({ region_id: i + 1, document_region_id: r.id,
    type: r.type, keep: true, region_class: r.type, reading_order: r.order, status: "ok", polygons: r.polygons, model_box: r.box, bounds: r.box,
    lines: r.lines.map(l => ({ line_id: l.line, polygons: l.polygons })) })) };
}
const sentOf = page => selectPageRegions(records(page).regions).sent;
const markers = line => (line.spans || []).filter(s => s.kind === "note_marker").map(s => [s.start, s.marker]);

test("Settings lists the whole-page reader first and new books get it; saved choices are not changed", () => {
  assert.equal(READERS[0].id, "hydrogen-low-page");
  assert.equal(RECIPE.reader, "hydrogen-low-page");
  assert.equal(hydrogen.model, "gemini-4-hydrogen");
  assert.equal(hydrogen.thinking, "low");
  assert.equal(hydrogen.method, "100-hydrogen-low-whole-page-reading");
  assert.equal(readerOptions({ reader: "argon-low" }, {}).reader, "argon-low");
  assert.equal(readerOptions({}, {}).reader, "argon-low", "a book that saved no reader keeps what it had");
  assert.ok(READERS.some(r => r.id === "carbon-low") && READERS.some(r => r.id === "flash-lite"), "the others stay");
});

for (const page of fixture.pages) {
  test(`PDF ${page.pdf_page}: the request lists the regions as method 100 did`, () => {
    const list = wholePageList(records(page), sentOf(page));
    const saved = page.call.request.prompt;
    const same = { title: fixture.types.title, description: fixture.types.description };
    assert.equal(wholePagePrompt(same, list), saved, "the same text when the book has no conventions");
    for (const r of list) assert.ok(saved.includes(`- ${r.id}: ${r.type}, ${r.lines} line${r.lines === 1 ? "" : "s"}, box [${r.box.join(", ")}]`), r.id);
    assert.match(saved, /\[ymin, xmin, ymax, xmax\] in thousandths/);
    assert.match(wholePagePrompt(same, list), /square brackets where it is printed, for example तीर\[१\]स्य/);
    assert.deepEqual(wholePageSchema(list).properties.regions.items.properties.id.enum, list.map(r => r.id));
    const withConventions = wholePagePrompt(fixture.types, list);
    assert.ok(fixture.types.conventions.length);
    for (const line of fixture.types.conventions) assert.ok(withConventions.includes(`- ${line}`));
  });

  test(`PDF ${page.pdf_page}: the saved answer puts method 100's text and note markers on the line pieces`, () => {
    const list = wholePageList(records(page), sentOf(page));
    const parsed = checkWholePage(page.call.parsed, list);
    assert.ok(!parsed.regions.some(r => r.kept));
    checkReading(parsed, sentOf(page));
    const out = mergeText(blankDocument(page), { parsed, profile: hydrogen }, types, noCheck);
    assert.deepEqual(out.taken, ["text"]);
    const ids = new Set();
    let count = 0;
    for (const expected of page.regions) {
      const got = out.doc.page.regions.find(r => r.id === expected.id);
      got.lines.forEach((line, i) => {
        assert.equal(line.text, expected.lines[i].text, `${expected.id} line ${i + 1}`);
        assert.deepEqual(markers(line), markers(expected.lines[i]), `${expected.id} line ${i + 1} markers`);
        for (const span of line.spans || []) if (span.kind === "note_marker") {
          assert.equal(span.start, span.end);
          assert.ok(!ids.has(span.id), "marker ids are unique on the page");
          ids.add(span.id); count++;
        }
      });
    }
    assert.equal(out.doc.source.layers.text.state, "model");
    if (page.pdf_page === 25 || page.pdf_page === 60) assert.ok(count >= 2, `${count} markers`);
    // Where the finished book kept the reading (the rule tools changed only verse numbers and labels), it agrees.
    let agree = 0;
    // The verse-number, closing and page-label tools rewrite verse, section_closing and page_number regions; the rest is untouched.
    const untouched = page.regions.filter(r => !["verse", "section_closing", "page_number"].includes(r.type));
    for (const { id } of untouched) {
      const lines = page.finished[id], got = out.doc.page.regions.find(r => r.id === id);
      if (lines.length === got.lines.length && lines.every((l, i) => l.text === got.lines[i].text && JSON.stringify(l.spans.map(s => [s.start, s.marker])) === JSON.stringify(markers(got.lines[i])))) agree++;
    }
    assert.ok(untouched.length >= 2 && agree === untouched.length, `${agree} of ${untouched.length} untouched regions as in the finished book`);
  });
}

test("a region answered with another number of lines keeps its text and is flagged", () => {
  const page = fixture.pages[0], list = wholePageList(records(page), sentOf(page));
  const current = blankDocument(page), target = page.regions.find(r => r.lines.length > 1 && r.type === "verse") || page.regions.find(r => r.lines.length > 1);
  const region = current.page.regions.find(r => r.id === target.id);
  region.lines.forEach((line, i) => { line.text = `old ${i}`; if (i === 0) line.spans = [{ kind: "note_marker", id: "m1", marker: "१", start: 1, end: 1 }]; });
  current.source.layers = { text: { state: "model" } };   // text a model wrote; not a person's
  const answer = structuredClone(page.call.parsed);
  answer.regions.find(r => r.id === target.id).lines.pop();
  const lastRegion = answer.regions.at(-1).id === target.id ? answer.regions.at(-2) : answer.regions.at(-1);
  const parsed = checkWholePage(answer, list, { [target.id]: region.lines.map(line => line.text) });
  const entry = parsed.regions.find(r => r.id === target.id);
  assert.equal(entry.kept, true);
  assert.equal(entry.returned_lines.length, target.lines.length - 1);
  checkReading(parsed, sentOf(page));
  const out = mergeText(current, { parsed, profile: hydrogen }, types, noCheck);
  const after = out.doc.page.regions.find(r => r.id === target.id);
  assert.deepEqual(after.lines.map(l => l.text), region.lines.map(l => l.text), "the old text stays");
  assert.deepEqual(after.lines[0].spans, region.lines[0].spans, "with its marker");
  assert.equal(after.source.transcription.uncertain, true);
  assert.equal(after.source.transcription.note, UNFIT_NOTE);
  const flags = textFlags(out.doc, types).filter(f => f.region === target.id);
  assert.deepEqual(flags.map(f => f.message), [`${target.id}: the reading of this area did not fit its lines`]);
  // the others were read, and marker ids stay unique where the kept region's old ids were m1
  const used = out.doc.page.regions.flatMap(r => r.lines.flatMap(l => (l.spans || []).filter(s => s.kind === "note_marker").map(s => s.id)));
  assert.equal(new Set(used).size, used.length);
  const other = out.doc.page.regions.find(r => r.id === lastRegion.id);
  assert.equal(other.lines[0].text, page.regions.find(r => r.id === lastRegion.id).lines[0].text);
  // a region missing from the answer is treated the same way; an answer that fits nothing, or names an unlisted region, is invalid
  const missing = checkWholePage({ regions: answer.regions.filter(r => r.id !== target.id) }, list);
  assert.equal(missing.regions.find(r => r.id === target.id).kept, true);
  assert.throws(() => checkWholePage({ regions: [] }, list), /fits none/);
  assert.throws(() => checkWholePage({ regions: [{ id: "zz", lines: [] }] }, list), /Unexpected/);
  assert.throws(() => checkWholePage({ regions: [answer.regions[0], answer.regions[0]] }, list), /repeated/);
  assert.throws(() => checkWholePage({ regions: [{ id: answer.regions[0].id, lines: [1] }] }, list), /no list of lines/);
  assert.throws(() => checkWholePage("{}", list), /no region list/);
});

test("a person's text is not overwritten: the result becomes a suggestion", () => {
  const page = fixture.pages[1], list = wholePageList(records(page), sentOf(page));
  const current = blankDocument(page);
  current.page.regions[0].lines[0].text = "व्यक्तिना शोधितम्";
  current.source.layers = { text: { state: "edited" } };
  const out = mergeText(current, { parsed: checkWholePage(page.call.parsed, list), profile: hydrogen }, types, noCheck);
  assert.deepEqual(out.taken, []);
  assert.equal(out.suggestion, true);
  assert.deepEqual(out.doc.page.regions, current.page.regions);
});

test("a result that would make the page invalid is not applied", () => {
  const page = fixture.pages[1], list = wholePageList(records(page), sentOf(page));
  const current = blankDocument(page);
  const out = mergeText(current, { parsed: checkWholePage(page.call.parsed, list), profile: hydrogen }, types, doc => [doc.source.layers ? ["bad"] : [], []]);
  assert.deepEqual(out.taken, []);
  assert.deepEqual(out.doc, current);
});

test("Hydrogen's rates give the saved call's cost, and the estimate before a run is 1.9 cents a page", () => {
  for (const page of fixture.pages) {
    const u = page.call.usage;
    const usage = { total_input_tokens: u.promptTokenCount, total_output_tokens: u.candidatesTokenCount, total_thought_tokens: u.thoughtsTokenCount, total_cached_tokens: 0 };
    assert.ok(Math.abs(usageCost(usage, hydrogen, "2026-11-22T00:00:00Z") - page.call.cost_usd) < 1e-9, `PDF ${page.pdf_page}`);
  }
  assert.deepEqual(pageCost(hydrogen), { usd: 0.019, source: "measured", samples: 0, basis: "method 100's run on a 519-page book" });
  assert.equal(MEASURED_PAGE_COST["hydrogen-low-page"], 0.019);
  assert.match(runEstimate(519, pageCost(hydrogen)), /^519 pages to process · estimated new work \$9\.86 at \$0\.019 a page \(method 100's run on a 519-page book\)/);
  const own = pageCost(hydrogen, [{ profile: "hydrogen-low-page", status: "completed", cost_usd: 0.02 }, { profile: "hydrogen-low-page", status: "completed", cost_usd: 0.03 }]);
  assert.deepEqual(own, { usd: 0.025, source: "book", samples: 2 }, "the book's own calls replace the figure");
});

// The reading run itself, with the transport stubbed: one request, a ledger entry first, a saved call record, reuse.
async function runner(page) {
  const files = new Map(), calls = [], costs = [];
  const manifest = { format: "book-folder", book_id: "r", title: "R", types: "types.json", pages: [{ id: "p1", pdf_page: 1, document: "pages/p1.json" }] };
  const book = new Book("folder", { name: "test" }, manifest, structuredClone(types));
  book.readJson = async path => files.has(path) ? JSON.parse(files.get(path)) : null;
  book.writeFile = async (path, data) => { files.set(path, data); };
  book.removeFile = async path => { files.delete(path); };
  book.draft = async () => null;
  book.clearDraft = async () => {};
  book.model = async pid => book.models.get(pid) || null;
  book.imageBlob = async () => new Blob(["image"], { type: "image/png" });
  book.work.set("work/p1.regions.json", records(page));
  const u = page.call.usage;
  const usage = { total_input_tokens: u.promptTokenCount, total_output_tokens: u.candidatesTokenCount, total_thought_tokens: u.thoughtsTokenCount, total_cached_tokens: 0 };
  let ledgerBefore = null;
  const request = async (provider, payload, key) => {
    calls.push({ provider, payload, key });
    ledgerBefore = JSON.parse(files.get("work/reader-lab/ledger.json"));
    return { seconds: 3, body: { status: "completed", usage, outputs: [{ type: "text", text: JSON.stringify(page.call.parsed) }] } };
  };
  const maker = new Maker(book, { keys: { gemini: "test-key" }, request, onCost: cost => costs.push(cost), check: noCheck });
  await book.saveReaderOptions({ reader: "hydrogen-low-page" });
  return { book, maker, calls, costs, files, ledgerBefore: () => ledgerBefore };
}

test("a page is read with one request holding one image; the call is entered in the ledger before it is sent and saved after", async () => {
  const page = fixture.pages[0], { maker, calls, costs, book, ledgerBefore } = await runner(page);
  const reading = await maker.read("p1");
  assert.equal(calls.length, 1);
  const { payload } = calls[0];
  assert.equal(calls[0].provider, "gemini");
  assert.equal(calls[0].key, "test-key");
  assert.equal(payload.model, "gemini-4-hydrogen");
  assert.equal(payload.generation_config.thinking_level, "low");
  assert.equal(payload.input.filter(x => x.type === "image").length, 1);
  assert.equal(payload.input.length, 2);
  assert.equal(payload.input[1].resolution, "high");
  assert.ok(payload.input[0].text.includes("- r3: verse") || payload.input[0].text.includes(`- ${page.regions[0].id}: `));
  assert.deepEqual(payload.response_format.schema.properties.regions.items.required, ["id", "lines"]);
  const before = ledgerBefore().calls;
  assert.equal(before.length, 1);
  assert.equal(before[0].status, "requesting", "entered before sending");
  assert.equal(before[0].profile, "hydrogen-low-page");
  const ledger = await book.readWork("work/reader-lab/ledger.json");
  assert.equal(ledger.calls.length, 1);
  assert.equal(ledger.calls[0].status, "completed");
  assert.ok(Math.abs(ledger.calls[0].cost_usd - page.call.cost_usd) < 1e-9, "at Hydrogen's rates");
  assert.ok(Math.abs(costs[0] - page.call.cost_usd) < 1e-9);
  const record = await book.readWork(ledger.calls[0].path);
  assert.equal(record.request.input[1].data, "<image rebuilt from the book's source>");
  assert.equal(record.profile.model, "gemini-4-hydrogen");
  assert.equal(reading.parsed.regions.length, page.regions.length);
  // the same page, image, boxes and model: the saved reading is reused
  assert.equal((await maker.read("p1")).cached, true);
  assert.equal(calls.length, 1);
  // a type or order change alone does not make it stale; a moved box does
  const moved = records(page); moved.regions[0].type = "other_type";
  book.work.set("work/p1.regions.json", moved);
  assert.equal((await maker.read("p1")).cached, true);
  const box = records(page); box.regions[0].model_box = box.regions[0].model_box.map((v, i) => v + (i === 0 ? 5 : 0));
  book.work.set("work/p1.regions.json", box);
  await maker.read("p1");
  assert.equal(calls.length, 2, "a moved box is read again");
  assert.match(calls[1].payload.input[0].text, new RegExp(`${page.regions[0].id}: ${page.regions[0].type}, \\d+ lines?, box \\[`));
});
