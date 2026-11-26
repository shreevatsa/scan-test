import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { makeValidator, checkPage } from "../js/schema.js";
import { provisionalDocument } from "../js/pipeline/provisional.js";
const rebuildProvisional = doc => doc;
import { addBookType, initialBookTypes, REGION_CLASSES } from "../js/book-types.js";
import { layerState, noteEdit } from "../js/layers.js";
import * as ops from "../js/ops.js";
import { Book } from "../js/store-0.4.js";

const schema = JSON.parse(readFileSync(new URL("../schema.json", import.meta.url))), validate = makeValidator(schema);
const types = { format: "types", schema_version: "0.2", book_id: "regions", title: "Regions", flows: { main: "Main", notes: "Notes" },
  types: { article: { contains: ["heading", "paragraph", "verse"], flow: "main" }, heading: { region: "heading" }, paragraph: { region: "paragraph" },
    verse: { region: "verse" }, note: { region: "note", flow: "notes" }, footer: { region: "running_header", role: "furniture" } }, relations: { note: "Notes" } };
for (const [name, type] of Object.entries(types.types)) type.description = name;
const polygon = box => [ops.boxRing(box)];
const empty = () => provisionalDocument("p1", { image: "p1.png", image_sha256: "a".repeat(64), width: 240, height: 180 }, types, { regions: [], char_h: 12 });
const valid = (doc, tl = types) => assert.deepEqual(checkPage(validate, doc, tl)[0], []);

function completed() {
  const tl = { ...types, types: { ...types.types, paragraph: { description: "Paragraph", region: "paragraph", flow: "main" } } };
  const doc = empty();
  const first = ops.addRegion(doc, tl, "paragraph", [1, 1, 45, 20]);
  const second = ops.addRegion(doc, tl, "paragraph", [50, 1, 100, 20]);
  const note = ops.addRegion(doc, tl, "note", [1, 80, 100, 110]);
  doc.page.regions[0].lines = [{ line: 7, polygons: polygon([1, 1, 45, 20]), text: "ಕ", end: "join", spans: [{ kind: "bold", start: 0, end: 1 }] }];
  doc.page.regions[1].lines = [{ line: 7, polygons: polygon([50, 1, 100, 20]), text: "ನ್ನಡ", spans: [{ kind: "note_marker", id: "m1", marker: "1", start: 1, end: 1 }] }];
  doc.page.regions[2].lines = [{ line: 9, polygons: polygon([1, 80, 100, 110]), text: "A note" }];
  doc.source.layers.text = { state: "model", types_revision: 1 };
  doc.relations = [{ type: "note", from: { anchor: "p1#m1", region: `p1#${second}`, line: 7 }, to: { unit: ops.ownerOf(doc, note).id } }];
  return { doc, tl, first, second };
}

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
