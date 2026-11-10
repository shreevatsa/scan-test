import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { makeValidator, checkPage } from "../js/schema.js";
import { provisionalDocument, rebuildProvisional } from "../js/pipeline/provisional.js";
import { addBookType, initialBookTypes, REGION_CLASSES } from "../js/book-types.js";
import { layerState, noteEdit } from "../js/layers.js";
import * as ops from "../js/ops.js";
import { Book } from "../js/store.js";

const schema = JSON.parse(readFileSync(new URL("../schema.json", import.meta.url))), validate = makeValidator(schema);
const types = { format: "types", schema_version: "0.2", book_id: "regions", title: "Regions", flows: { main: "Main", notes: "Notes" },
  types: { article: { contains: ["heading", "paragraph", "verse"], flow: "main" }, heading: { region: "heading" }, paragraph: { region: "paragraph" },
    verse: { region: "verse" }, note: { region: "note", flow: "notes" }, footer: { region: "running_header", role: "furniture" } }, relations: { note: "Notes" } };
for (const [name, type] of Object.entries(types.types)) type.description = name;
const polygon = box => [ops.boxRing(box)];
const empty = () => provisionalDocument("p1", { image: "p1.png", image_sha256: "a".repeat(64), width: 240, height: 180 }, types, { regions: [], char_h: 12 });
const valid = (doc, tl = types) => assert.deepEqual(checkPage(validate, doc, tl)[0], []);

test("manual regions build reachable provisional containers without creating a transcription layer", () => {
  const base = empty(), doc = ops.clone(base);
  const heading = ops.addRegion(doc, types, "heading", [1, 1, 80, 20]);
  const body = ops.addRegion(doc, types, "paragraph", [1, 30, 80, 60]);
  ops.applyGeometry(doc, doc.page.regions.map((region, index) => ({ rings: region.polygons, lines: [{ line_id: index + 1, rings: region.polygons }] })));
  valid(doc);
  const edited = noteEdit(base, doc, { focus: "regions" });
  assert.equal(layerState(edited, "text"), null);
  assert.equal(layerState(edited, "units").state, "provisional");
  assert.equal(edited.page.regions[1].lines[0].text, undefined);
  ops.setRegionType(edited, types, heading, "verse");
  ops.setRegionType(edited, types, body, "footer");
  valid(edited);
  assert.equal(layerState(edited, "units").state, "provisional");
  assert.equal(ops.regionById(edited, body).order, null);
});

test("reading-order movement renumbers text regions and keeps furniture outside the order", () => {
  const doc = empty();
  const first = ops.addRegion(doc, types, "paragraph", [1, 1, 80, 20]);
  const last = ops.addRegion(doc, types, "verse", [1, 30, 80, 60]);
  const footer = ops.addRegion(doc, types, "footer", [1, 100, 80, 120]);
  ops.moveRegionOrder(doc, types, last, -1);
  assert.equal(ops.regionById(doc, last).order, 1);
  assert.equal(ops.regionById(doc, first).order, 2);
  assert.equal(ops.regionById(doc, footer).order, null);
  valid(doc);
  assert.throws(() => ops.moveRegionOrder(doc, types, footer, -1), /furniture/);
});

test("splitting preserves reading order and the outer continuation flags", () => {
  const doc = empty();
  const first = ops.addRegion(doc, types, "paragraph", [1, 1, 80, 60]);
  const later = ops.addRegion(doc, types, "paragraph", [1, 80, 80, 100]);
  doc.page.regions[0].lines = [
    { line: 1, polygons: polygon([1, 1, 80, 20]) },
    { line: 2, polygons: polygon([1, 40, 80, 60]) }
  ];
  doc.page.regions[0].source = { continues_from_earlier: true, continues_later: true };
  const second = ops.splitRegionAt(doc, first, 1);
  rebuildProvisional(doc, types);
  assert.equal(ops.regionById(doc, second).order, 2);
  assert.equal(ops.regionById(doc, later).order, 3);
  assert.equal(ops.regionById(doc, first).source.continues_from_earlier, true);
  assert.equal(ops.regionById(doc, first).source.continues_later, undefined);
  assert.equal(ops.regionById(doc, second).source.continues_later, true);
  valid(doc);
});

test("provisional figure retyping retains and restores any existing transcription", () => {
  const tl = addBookType(types, { name: "picture", region: "figure", flow: "main" });
  const doc = empty(), rid = ops.addRegion(doc, tl, "paragraph", [1, 1, 80, 20]);
  ops.regionById(doc, rid).lines = [{ line: 1, text: "ಕನ್ನಡ", polygons: polygon([1, 1, 80, 20]) }];
  ops.setRegionType(doc, tl, rid, "picture");
  assert.deepEqual(ops.regionById(doc, rid).lines, []);
  ops.setRegionType(doc, tl, rid, "paragraph");
  assert.equal(ops.regionById(doc, rid).lines[0].text, "ಕನ್ನಡ");
  valid(doc, tl);
});

test("saving a focused Regions edit keeps text pending and units provisional", async () => {
  const base = empty(), doc = ops.clone(base);
  ops.addRegion(doc, types, "paragraph", [1, 1, 80, 20]);
  ops.applyGeometry(doc, [{ rings: polygon([1, 1, 80, 20]), lines: [{ line_id: 1, rings: polygon([1, 1, 80, 20]) }] }]);
  const book = new Book("folder", { name: "focused-edit" }, { book_id: "focused-edit", types: "types.json", pages: [{ id: "p1", document: "pages/p1.json" }] }, types);
  const files = new Map([["pages/p1.json", base]]);
  book.readJson = async path => files.get(path) || null;
  book.writeFile = async (path, value) => { files.set(path, JSON.parse(value)); };
  book.clearDraft = async () => {};
  await book.saveEdit("p1", doc, { focus: "regions" });
  const saved = files.get("edits/p1.json");
  valid(saved);
  assert.equal(layerState(saved, "text"), null);
  assert.equal(layerState(saved, "units").state, "provisional");
  assert.equal(layerState(saved, "regions").state, "edited");
});

function completed() {
  const tl = { ...types, types: { ...types.types, paragraph: { description: "Paragraph", region: "paragraph", flow: "main" } } };
  const doc = empty();
  const first = ops.addRegion(doc, tl, "paragraph", [1, 1, 45, 20]);
  const second = ops.addRegion(doc, tl, "paragraph", [50, 1, 100, 20]);
  const note = ops.addRegion(doc, tl, "note", [1, 80, 100, 110]);
  doc.page.regions[0].lines = [{ line: 7, polygons: polygon([1, 1, 45, 20]), text: "ಕ", end: "join", spans: [{ kind: "bold", start: 0, end: 1 }] }];
  doc.page.regions[1].lines = [{ line: 7, polygons: polygon([50, 1, 100, 20]), text: "ನ್ನಡ", spans: [{ kind: "note_marker", id: "m1", marker: "1", start: 1, end: 1 }] }];
  doc.page.regions[2].lines = [{ line: 9, polygons: polygon([1, 80, 100, 110]), text: "A note" }];
  doc.source.layers.units.state = "model";
  doc.source.layers.text = { state: "model", types_revision: 1 };
  doc.relations = [{ type: "note", from: { anchor: "p1#m1", region: `p1#${second}`, line: 7 }, to: { unit: ops.ownerOf(doc, note).id } }];
  return { doc, tl, first, second };
}

test("merging shared printed lines preserves Indic text, spans, markers, links and unit open ends", () => {
  const { doc, tl, first, second } = completed();
  ops.ownerOf(doc, first).open = { start: true };
  ops.ownerOf(doc, second).open = { end: true };
  ops.mergeRegions(doc, tl, first, second);
  valid(doc, tl);
  const region = ops.regionById(doc, first);
  assert.equal(region.lines[0].text, "ಕನ್ನಡ");
  assert.equal(region.lines[0].spans.find(span => span.id === "m1").start, 2);
  assert.equal(doc.relations[0].from.region, `p1#${first}`);
  assert.deepEqual(ops.ownerOf(doc, first).open, { start: true, end: true });
  assert.equal(region.source.merged_from[0].id, second);
});

test("unsafe merges and invalid box coordinates leave their inputs intact", () => {
  const { doc, tl, first, second } = completed();
  delete doc.page.regions[1].lines[0].text;
  const original = ops.clone(doc);
  assert.throws(() => ops.mergeRegions(doc, tl, first, second), /partially transcribed/);
  assert.deepEqual(doc, original);
  assert.throws(() => ops.setBox(doc, first, [NaN, 1, 50, 20]), /finite/);
  assert.deepEqual(doc, original);
});

test("adding a type extends its parent, records a revision and preserves the previous list", () => {
  const original = ops.clone(types);
  const next = addBookType(types, { name: "verse_translation", description: "Translation", region: "paragraph", parent: "article" }, "now");
  assert.deepEqual(validate(next), []);
  assert.deepEqual(types, original);
  assert.equal(next.source.revision, 2);
  assert.ok(next.types.article.contains.includes("verse_translation"));
  assert.equal(next.source.revisions[0].operations[0].name, "verse_translation");
  assert.throws(() => addBookType(next, { name: "verse_translation", description: "", region: "paragraph", flow: "main" }), /already exists/);
  assert.equal(addBookType(types, { name: "ವಚನ", description: "", region: "verse", flow: "main" }).types["ವಚನ"].flow, "main");
  assert.equal(REGION_CLASSES.includes("figure"), true);
});

test("initial proposals preserve book identity and require new region discovery", () => {
  const next = initialBookTypes(types, { ...types, book_id: "other", title: "Other", source: { draft: true } }, "same-book", "Same title", "now");
  assert.equal(next.book_id, "same-book");
  assert.equal(next.title, "Same title");
  assert.equal(next.source.draft, undefined);
  assert.equal(next.source.region_reset_revision, 2);
});

test("historical prose revisions remain available while new records use numeric revisions", () => {
  const legacy = { ...types, source: { revision: "A historical revision note" } };
  const next = addBookType(legacy, { name: "caption", region: "caption", flow: "main" });
  assert.equal(next.source.revision, 2);
  assert.equal(next.source.legacy_revision, legacy.source.revision);
  const doc = provisionalDocument("p1", empty().page, legacy, { regions: [], types_revision: legacy.source.revision });
  assert.equal(doc.source.layers.regions.types_revision, 1);
  assert.equal(doc.source.layers.units.types_revision, 1);
  doc.source.layers.units.types_revision = legacy.source.revision;
  assert.equal(layerState(doc, "units").types_revision, 1);
});

test("type writes are atomic and an initial list cannot replace existing page work", async () => {
  const files = new Map([["types.json", types]]);
  const book = new Book("folder", { name: "test" }, { book_id: "regions", title: "Regions", types: "types.json", pages: [{ id: "p1", document: "pages/p1.json" }] }, types);
  book.readJson = async path => files.get(path) || null;
  book.writeFile = async (path, value) => { files.set(path, JSON.parse(value)); };
  book.draft = async () => null;
  await book.addType({ name: "caption", description: "", region: "caption", flow: "main" }, validate);
  assert.ok(files.get("types.json").types.caption);
  const previous = book.types;
  book.writeFile = async () => { throw Error("Disk full"); };
  await assert.rejects(book.addType({ name: "formula", description: "", region: "formula", flow: "main" }, validate), /Disk full/);
  assert.equal(book.types, previous);
  files.set("pages/p1.json", empty());
  await assert.rejects(book.initializeTypes(types, validate), /before making page/);
});
