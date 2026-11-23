import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { makeValidator, checkPage } from "../js/schema.js";
import { editorFocus, mergeTextEdit } from "../js/editing.js";
import { layerState, noteEdit } from "../js/layers.js";
import { prepare, bookHtml, bookText } from "../js/reader.js";
import { Book, idb } from "../js/store.js";
import * as ops from "../js/ops.js";

const validate = makeValidator(JSON.parse(readFileSync(new URL("../schema.json", import.meta.url))));
const types = { format: "types", schema_version: "0.2", book_id: "focused", title: "Focused editing", flows: { main: "Main" },
  types: { chapter: { description: "Chapter", contains: ["paragraph", "verse"], flow: "main" }, paragraph: { description: "Prose", region: "paragraph" }, verse: { description: "Verse", region: "verse" }, footer: { description: "Furniture", region: "running_header", role: "furniture" } } };
const check = (doc, tl = types) => checkPage(validate, doc, tl)[0];
const poly = y => [[[10, y], [90, y], [90, y + 10], [10, y + 10]]];
function page(pid = "p1") {
  return { format: "page", schema_version: "0.2", book_id: types.book_id,
    page: { id: pid, image: `${pid}.png`, image_sha256: "a".repeat(64), width: 100, height: 100, regions: [
      { id: "r1", type: "paragraph", box: [10, 10, 90, 40], order: 1, polygons: poly(10), lines: [{ line: 1, polygons: poly(10), text: "continued" }, { line: 2, polygons: poly(30), text: "text" }] },
      { id: "r2", type: "paragraph", box: [10, 60, 90, 70], order: 2, polygons: poly(60), lines: [{ line: 3, polygons: poly(60), text: "next" }] }] },
    units: [{ id: "u1", type: "chapter", children: [{ unit: "u2" }, { unit: "u3" }] }, { id: "u2", type: "paragraph", children: [{ region: `${pid}#r1` }] }, { id: "u3", type: "paragraph", children: [{ region: `${pid}#r2` }] }], flows: { main: ["u1"] },
    source: { layers: Object.fromEntries(["regions", "text"].map(layer => [layer, { state: "model", types_revision: 1, accepted_at_utc: "reviewed" }])) } };
}

test("focused text saves preserve newer grouping and independent text corrections", () => {
  const base = page(), latest = ops.clone(base), incoming = ops.clone(base);
  latest.units[2].open = { end: true }; latest.units[0].open = { end: true };
  latest.page.regions[1].lines[0].text = "A newer correction";
  incoming.page.regions[0].lines[0].text = "ಕನ್ನಡ";
  const merged = mergeTextEdit(latest, incoming, base);
  assert.deepEqual(merged.units, latest.units); assert.equal(merged.page.regions[1].lines[0].text, "A newer correction");
  assert.equal(merged.page.regions[0].lines[0].text, "ಕನ್ನಡ"); assert.deepEqual(check(merged), []);
  latest.page.regions[0].lines[0].text = "Different correction";
  assert.throws(() => mergeTextEdit(latest, incoming, base), /another edit/);
});

test("leaving out an unassigned area is a protected, reversible page edit", () => {
  const original = page();
  const area = { region: "r3", type: "other", box: [0, 5, 25, 10] };
  original.source.omitted_regions = [area];
  const edited = ops.clone(original);
  ops.ignoreOmittedRegion(edited, 0);
  assert.deepEqual(edited.source.omitted_regions, []);
  assert.deepEqual(edited.source.ignored_regions, [area]);
  assert.equal(layerState(noteEdit(original, edited), "regions").state, "edited");
  ops.restoreOmittedRegion(edited, 0);
  assert.deepEqual(edited.source.omitted_regions, [area]);
  assert.equal(edited.source.ignored_regions, undefined);
});

function stored() {
  const manifest = { format: "book-folder", version: 1, book_id: types.book_id, title: types.title, types: "types.json",
    pages: [1, 2].map(n => ({ id: `p${n}`, pdf_page: n, document: `pages/p${n}.json` })) };
  const files = new Map(Object.entries({ "book.json": manifest, "types.json": types, "pages/p1.json": page(), "pages/p2.json": page("p2") }));
  const create = () => {
    const book = new Book("folder", { name: "focused", async getDirectoryHandle() { throw new DOMException("Missing", "NotFoundError"); } }, ops.clone(files.get("book.json")), ops.clone(files.get("types.json")), { browser: true });
    book.readJson = async path => structuredClone(files.get(path) || null);
    book.writeFile = async (path, value) => { files.set(path, JSON.parse(value)); };
    book.removeFile = async path => { files.delete(path); };
    book.draft = async () => null; book.clearDraft = async () => {};
    for (const page of manifest.pages) {
      book.models.set(page.id, ops.clone(files.get(page.document)));
      if (files.has(`edits/${page.id}.json`)) book.edits.set(page.id, ops.clone(files.get(`edits/${page.id}.json`)));
    }
    return book;
  };
  return { book: create(), files, create };
}

test("a region with no line piece gets one over its outline, so its text can be typed", () => {
  const doc = page(); const r = doc.page.regions[0]; const others = doc.page.regions.flatMap(x => (x.lines || []).map(L => L.line));
  r.lines = []; r.box = [10, 20, 110, 60];
  const piece = ops.addLinePiece(doc, r.id);
  assert.equal(piece.line, Math.max(...others) + 1);
  assert.deepEqual(piece.polygons, [[[10, 20], [110, 20], [110, 60], [10, 60]]]);
  assert.equal(piece.text, "");
  assert.throws(() => ops.addLinePiece(doc, r.id), /already/);
});
