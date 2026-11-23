import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Book } from "../js/store.js";
import { clone, canonical } from "../js/ops.js";
import { layerState, layerView } from "../js/layers.js";
import { makeValidator, checkPage } from "../js/schema.js";
import { reviewCandidate, settle, settledChecks, saveReview } from "../js/review.js";
const validate = makeValidator(JSON.parse(readFileSync(new URL("../schema.json", import.meta.url))));
const types = { format: "types", schema_version: "0.2", book_id: "review", title: "Review", source: { revision: 2 },
  flows: { main: "Main", notes: "Notes" }, relations: { note: "A printed note" }, types: {
    chapter: { contains: ["paragraph", "verse"], flow: "main", description: "Chapter" }, paragraph: { region: "paragraph", description: "Prose" },
    verse: { region: "verse", description: "Verse" }, footnote: { region: "note", flow: "notes", description: "Note" } } };
const poly = y => [[[10, y], [90, y], [90, y + 9], [10, y + 9]]];
function page() {
  return { format: "page", schema_version: "0.2", book_id: "review", page: { id: "p1", image: "p1.png", image_sha256: "a".repeat(64), width: 100, height: 100,
    regions: [{ id: "r1", type: "paragraph", order: 1, polygons: poly(10), lines: [{ line: 1, polygons: poly(10), text: "first" }, { line: 2, polygons: poly(25), text: "second", end: "line" }] },
      { id: "r2", type: "paragraph", order: 2, polygons: poly(50), lines: [{ line: 3, polygons: poly(50), text: "third" }] }] },
    units: [{ id: "u1", type: "chapter", children: [{ unit: "u2" }, { unit: "u3" }] }, { id: "u2", type: "paragraph", children: [{ region: "p1#r1" }] }, { id: "u3", type: "paragraph", children: [{ region: "p1#r2" }], label: "Keep this label" }],
    flows: { main: ["u1"], notes: [] }, relations: [], source: { layers: Object.fromEntries(["regions", "text"].map(layer => [layer, { state: "edited", types_revision: 2, accepted_at_utc: "reviewed" }])) } };
}
const reading = () => ({ profile: { id: "test" }, parsed: { regions: [
  { id: "r1", lines: [{ n: 1, text: "new [*] text" }, { n: 2, text: "<b>second</b>" }], uncertain: false, note: null },
  { id: "r2", lines: [{ n: 1, text: "other" }], uncertain: false, note: null }] } });
const sent = doc => doc.page.regions.map(region => ({ rid: region.id, line_ids: region.lines.map(line => line.line) }));
const check = doc => checkPage(validate, doc, types)[0];

test("blank pages can be reviewed while missing line selections are rejected", () => {
  const doc = page(); doc.page.regions = []; doc.units = []; doc.flows.main = [];
  assert.deepEqual(settle(doc, clone(doc), types, "text").keys, []);
  assert.throws(() => settle(page(), page(), types, "text", { region: "r1", line: 99 }), /existing text/);
});

test("reviewed text scores expire after a text or ink change", () => {
  const doc = page(), out = settle(doc, reviewCandidate(doc, reading(), "text", types), types, "text").doc;
  assert.equal(Object.keys(settledChecks(out, sent(out))).length, 3);
  out.page.regions[0].lines[0].text = "Later correction";
  assert.equal(settledChecks(out, sent(out))["r1:1"], undefined);
  out.page.regions[0].lines[1].polygons = poly(26);
  assert.equal(settledChecks(out, sent(out))["r1:2"], undefined);
});

function notedPage() {
  const doc = page();
  doc.page.regions[0].lines[0].spans = [{ kind: "note_marker", id: "m7", start: 5, end: 5, marker: "*" }];
  doc.page.regions.push({ id: "r3", type: "footnote", order: 3, polygons: poly(80), lines: [{ line: 4, polygons: poly(80), text: "note" }] });
  doc.units.push({ id: "un", type: "footnote", children: [{ region: "p1#r3" }] }); doc.flows.notes = ["un"];
  doc.relations = [{ type: "note", from: { anchor: "p1#m7" }, to: { unit: "un" } }];
  return doc;
}

test("text choices preserve matching marker IDs and links and remove links to replaced markers", () => {
  const doc = notedPage(), candidate = clone(doc); candidate.page.regions[0].lines[0].spans[0].id = "m1";
  let out = settle(doc, candidate, types, "text", { region: "r1" }).doc;
  assert.equal(out.page.regions[0].lines[0].spans[0].id, "m7"); assert.equal(out.relations.length, 1);
  const moved = clone(candidate); moved.page.regions[0].lines[0].text = "first!";
  moved.page.regions[0].lines[0].spans[0].start = moved.page.regions[0].lines[0].spans[0].end = 6;
  assert.equal(settle(doc, moved, types, "text", { region: "r1" }).doc.relations.length, 1);
  const repeated = clone(doc), repeatedCandidate = clone(candidate);
  repeated.page.regions[0].lines[0].spans.push({ ...repeated.page.regions[0].lines[0].spans[0], id: "m8" });
  repeatedCandidate.page.regions[0].lines[0].spans.push({ ...repeatedCandidate.page.regions[0].lines[0].spans[0], id: "m2" });
  const repeatedResult = settle(repeated, repeatedCandidate, types, "text", { region: "r1" }).doc;
  assert.deepEqual(repeatedResult.page.regions[0].lines[0].spans.map(span => span.id), ["m7", "m8"]);
  candidate.page.regions[0].lines[0].spans[0].marker = "2";
  out = settle(doc, candidate, types, "text", { region: "r1" }).doc;
  assert.notEqual(out.page.regions[0].lines[0].spans[0].id, "m7"); assert.equal(out.relations?.length || 0, 0); assert.deepEqual(check(out), []);
});

test("a single region geometry choice preserves other regions and keeps compatible lines", () => {
  const doc = page(), candidate = clone(doc); candidate.page.regions[0].polygons = poly(11); candidate.page.regions[0].lines[0] = { line: 1, polygons: poly(11) };
  delete candidate.page.regions[0].lines[1].text;
  const out = settle(doc, candidate, types, "regions", { region: "r1" }).doc;
  assert.equal(out.page.regions[0].lines[0].text, undefined); assert.equal(out.page.regions[0].lines[1].text, "second");
  assert.deepEqual(out.page.regions[1], doc.page.regions[1]); assert.deepEqual(check(out), []);
});

function stored() {
  const manifest = { format: "book-folder", version: 1, book_id: "review", title: "Review", types: "types.json", pages: [{ id: "p1", document: "pages/p1.json" }] };
  const doc = page(); doc.source.suggestions = { text: "work/reading.json" };
  const files = new Map(Object.entries({ "book.json": manifest, "types.json": types, "pages/p1.json": doc, "work/reading.json": reading() }));
  const create = () => {
    const book = new Book("folder", { name: "review", async getDirectoryHandle() { throw new DOMException("Missing", "NotFoundError"); } }, clone(files.get("book.json")), clone(types), { browser: true });
    book.readJson = async path => clone(files.get(path) || null);
    book.writeFile = async (path, value) => { files.set(path, JSON.parse(value)); };
    book.removeFile = async path => { files.delete(path); };
    book.draft = async () => null; book.clearDraft = async () => {};
    book.models.set("p1", clone(files.get("pages/p1.json"))); if (files.has("edits/p1.json")) book.edits.set("p1", clone(files.get("edits/p1.json")));
    return book;
  };
  const book = create();
  const choice = () => ({ base: clone(files.get("edits/p1.json") || files.get("pages/p1.json")), types: clone(types),
    candidate: reviewCandidate(doc, files.get("work/reading.json"), "text", types), layer: "text", scope: {}, path: "work/reading.json", record: clone(files.get("work/reading.json")) });
  return { book, files, create, choice };
}

test("taking or retaining a suggestion protects the reviewed layer and keeps the original work", async () => {
  for (const keep of [false, true]) {
    const { book, files, choice } = stored(), previous = clone(files.get("pages/p1.json")), raw = canonical(files.get("work/reading.json"));
    await saveReview(book, "p1", { ...choice(), keep });
    const saved = await book.current("p1"); assert.equal(layerState(saved, "text").state, "edited");
    assert.equal(saved.source.suggestions.text, undefined); assert.equal(Object.keys(saved.source.review.text).length, 3);
    assert.equal(canonical(files.get("work/reading.json")), raw); assert.deepEqual(files.get("work/history/p1.json"), previous);
  }
});

test("choosing replacement page regions leaves transcription pending and units provisional", async () => {
  const { book, choice } = stored(), selected = choice(), candidate = clone(selected.base);
  for (const region of candidate.page.regions) for (const line of region.lines) delete line.text;
  delete candidate.source.layers.text; candidate.source.layers.units = { state: "provisional", types_revision: 2 };
  await saveReview(book, "p1", { ...selected, candidate, layer: "regions", path: null, record: null });
  const saved = await book.current("p1");
  assert.equal(layerState(saved, "regions").state, "edited"); assert.equal(layerState(saved, "text"), null);
  const exported = await book.chayaFiles(); assert.ok(exported["edits/p1.json"].source.review.regions.r1);
});

test("dismissing a suggestion preserves content and rejects a stale review", async () => {
  const { book, files, choice } = stored(), selected = choice(), before = layerView(selected.base, "text");
  await saveReview(book, "p1", { ...selected, dismiss: true });
  const saved = await book.current("p1"); assert.equal(layerView(saved, "text"), before); assert.equal(saved.source.suggestions.text, undefined);
  await assert.rejects(saveReview(book, "p1", selected), /changed/);
  const latest = choice(); files.get("work/reading.json").parsed.regions[0].lines[0].text = "A new model run";
  await assert.rejects(saveReview(book, "p1", latest), /newer model/);
});

test("review saves recover page edits, evidence and history at every file boundary", async () => {
  for (let boundary = 1; boundary <= 5; boundary++) {
    const { book, files, create, choice } = stored(), write = book.writeFile, remove = book.removeFile;
    let writes = 0; const interrupt = () => { if (++writes === boundary) throw Error("Interrupted"); };
    book.writeFile = async (...args) => { await write(...args); interrupt(); }; book.removeFile = async (...args) => { await remove(...args); interrupt(); };
    await assert.rejects(saveReview(book, "p1", choice()), /Interrupted/);
    const reopened = create(); await reopened.recoverStages();
    const saved = await reopened.current("p1"); assert.ok(saved.source.review.text["r1:1"]); assert.ok(files.get("work/history/p1.json"));
    assert.equal(saved.source.suggestions.text, undefined); assert.equal(files.has("work/pending-pages.json"), false);
  }
});

// Pages are stored in the blocks form (0.4): a review changes regions or text only, and keeps or drops the page's overrides.
test("reviewing a blocks-form page: a region choice keeps its overrides, new page regions drop them and say so", async () => {
  const { toBlocks, blocksContext } = await import("../js/blocks-format.js");
  const fixtures = JSON.parse(readFileSync(new URL("./fixtures/blocks-pages.json", import.meta.url)));
  const run = fixtures.runs.find(value => value.pages.some(doc => doc.units.length)), tl = fixtures.types[run.book];
  const context = blocksContext(run.pages, fixtures.rules[run.book]);
  const current = run.pages.map(doc => toBlocks(doc, tl, context)).find(doc => Object.keys(doc.overrides).length) ||
    { ...toBlocks(run.pages[0], tl, context), overrides: { units: { [`${run.pages[0].page.regions[0].type}@${run.pages[0].page.regions[0].id}`]: { number: "9" } } } };
  assert.ok(Object.keys(current.overrides).length, "the page has overrides to keep or drop");
  const candidate = clone(current), rid = current.page.regions[0].id;
  const one = settle(current, candidate, tl, "regions", { region: rid }).doc;
  assert.equal(one.schema_version, "0.4");
  assert.ok(!("units" in one) && !("relations" in one) && !("flows" in one));
  assert.deepEqual(one.overrides, current.overrides);
  assert.deepEqual(one.source.review.regions[rid].value, { type: current.page.regions[0].type });
  const whole = settle(current, candidate, tl, "regions", {}).doc;
  assert.deepEqual(whole.overrides, {});
  assert.equal(whole.source.dropped_overrides, true);
  const kept = settle(current, candidate, tl, "regions", {}, { keep: true }).doc;
  assert.deepEqual(kept.overrides, current.overrides);
  assert.throws(() => settle(current, candidate, tl, "units", {}), /Unknown review layer/);
});
