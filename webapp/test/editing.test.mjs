import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { makeValidator, checkPage } from "../js/schema.js";
import { editorFocus, assertFocusEdit, assertJoinMetadata, joinPageUnits, nextPageUnit, unitSnapshot, mergeTextEdit, applyUnitAction, applyUnitChanges } from "../js/editing.js";
import { layerState, noteEdit } from "../js/layers.js";
import { prepare, bookHtml, bookText } from "../js/reader.js";
import { readingIssues } from "../js/read-panel.js";
import { joinFollowingUnit } from "../js/reading-edit.js";
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
    source: { layers: Object.fromEntries(["regions", "text", "units"].map(layer => [layer, { state: "model", types_revision: 1, accepted_at_utc: "reviewed" }])) } };
}

test("focus locks geometry and grouping under Text and transcription under Read", () => {
  assert.equal(editorFocus("text"), "text"); assert.equal(editorFocus("read"), "units");
  const base = page(), text = ops.clone(base); text.page.regions[0].lines[0].text = "ಕನ್ನಡ";
  assert.doesNotThrow(() => assertFocusEdit("text", base, text));
  assert.throws(() => assertFocusEdit("units", base, text), /transcription/);
  const end = ops.clone(base); ops.setLineEnd(end, "r1", 0, "join");
  assert.doesNotThrow(() => assertFocusEdit("units", base, end));
  assert.throws(() => assertFocusEdit("text", base, end), /line joins/);
  const moved = ops.clone(base); ops.setBox(moved, "r1", [5, 5, 95, 45]);
  for (const focus of ["text", "units"]) assert.throws(() => assertFocusEdit(focus, base, moved));
});

test("Text edits retain provisional units while Read actions protect them", () => {
  const base = page(); base.source.layers.units = { state: "provisional", types_revision: 1 };
  const changed = ops.clone(base); changed.relations = [{ type: "note", from: { anchor: "p1#m1" }, to: { unit: "u3" } }];
  assert.equal(layerState(noteEdit(base, changed, { focus: "text" }), "units").state, "provisional");
  assert.equal(layerState(noteEdit(base, changed, { focus: "units" }), "units").state, "edited");
});

test("cross-page joins open matching ancestor paths and assemble to one unit without warnings", () => {
  const left = page(), right = page("p2"), original = ops.clone([left, right]);
  const [a, b] = joinPageUnits(left, right, types, "u3", check);
  assert.deepEqual(check(a), []); assert.deepEqual(check(b), []);
  const P = prepare([a, b], types);
  assert.deepEqual(P.warnings, []); assert.equal(P.book.units.length, 4);
  assert.deepEqual(P.unitFragments["p1#u3"], [{ page: "p1", unit: "u3" }, { page: "p2", unit: "u2" }]);
  assert.equal(P.unitCanonical["p2#u2"], "p1#u3");
  assert.ok(bookHtml(P).includes('data-ref="p2#r1"')); assert.deepEqual([left, right], original);
});

test("joining rejects a non-final unit, incompatible continuation and conflicting labels", () => {
  const a = page(), b = page("p2");
  assert.throws(() => nextPageUnit(a, b, "u2"), /this page first/);
  b.units[1].type = "verse"; b.page.regions[0].type = "verse";
  assert.throws(() => joinPageUnits(a, b, types, "u3", check), /does not continue/);
  b.units[1].type = "paragraph"; b.page.regions[0].type = "paragraph";
  a.units[2].label = "A"; b.units[1].label = "B";
  assert.throws(() => joinPageUnits(a, b, types, "u3", check), /different label/);
});

test("provisional verse transcriptions read with spaces until units are completed", () => {
  const doc = page(); doc.units[1].type = doc.page.regions[0].type = "verse";
  doc.source.layers.units = { state: "provisional", types_revision: 1 };
  const provisional = prepare([doc], types);
  assert.match(bookText(provisional), /continued text/);
  assert.ok(!bookHtml(provisional).includes("continued<br>text"));
  doc.source.layers.units.state = "model";
  assert.match(bookHtml(prepare([doc], types)), /continued<br>text/);
});

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

test("unit editing keeps newer transcription and rejects stale grouping", () => {
  const base = page(), latest = ops.clone(base), desired = ops.clone(base);
  latest.page.regions[0].lines[0].text = "New transcription"; applyUnitAction(desired, types, "u2", "label", "A label");
  const result = applyUnitChanges(base, desired, latest);
  assert.equal(result.page.regions[0].lines[0].text, "New transcription"); assert.equal(result.units[1].label, "A label");
  latest.units[1].label = "Other label";
  assert.throws(() => applyUnitChanges(base, desired, latest), /units changed/);
});

test("semantic fields can be applied to every fragment of an assembled unit", () => {
  const joined = joinPageUnits(page(), page("p2"), types, "u3", check), P = prepare(joined, types);
  for (const fragment of P.unitFragments["p1#u3"]) applyUnitAction(joined.find(doc => doc.page.id === fragment.page), types, fragment.unit, "label", "Continued paragraph");
  assert.equal(prepare(joined, types).units["p1#u3"].label, "Continued paragraph");
  assert.equal(joined[1].units[1].label, "Continued paragraph");
});

test("logical-unit language edits are protected and conflicting metadata prevents a join", async () => {
  const before = page(), changed = ops.clone(before);
  applyUnitAction(changed, types, "u2", "lang", "sa");
  assert.notEqual(unitSnapshot(before), unitSnapshot(changed));
  assert.equal(layerState(noteEdit(before, changed, { focus: "units" }), "units").state, "edited");
  assert.throws(() => assertJoinMetadata({ label: "First" }, { label: "Second" }), /different label/);
  const { book, files } = stored();
  files.get("pages/p1.json").units[1].label = "First";
  files.get("pages/p1.json").units[2].label = "Second";
  await assert.rejects(joinFollowingUnit({ book, validate }, "p1", "u2"), /different label/);
  assert.equal(files.has("edits/p1.json"), false);
});

test("reading problems identify page-unit targets for inline review", () => {
  const a = page(), b = page("p2"); a.units[0].open = { end: true };
  const P = prepare([a, b], types), issues = readingIssues([a, b], types, validate, P.warnings, P.unitCanonical);
  assert.equal(issues.length, 1); assert.ok(issues[0].targets.some(target => target.page === "p2" && target.unit === "u1"));
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

test("two-page saves recover after each write and reopen with one assembled continuation", async () => {
  for (let boundary = 1; boundary <= 5; boundary++) {
    const { book, files, create } = stored(), write = book.writeFile, remove = book.removeFile;
    let writes = 0;
    const interrupt = () => { if (++writes === boundary) throw Error("Interrupted"); };
    book.writeFile = async (...args) => { await write(...args); interrupt(); };
    book.removeFile = async (...args) => { await remove(...args); interrupt(); };
    await assert.rejects(joinFollowingUnit({ book, validate }, "p1", "u3"), /Interrupted/);
    const reopened = create(); await reopened.recoverStages();
    const P = prepare([await reopened.current("p1"), await reopened.current("p2")], types);
    assert.deepEqual(P.warnings, []); assert.equal(P.book.units.length, 4); assert.equal(files.has("work/pending-pages.json"), false);
  }
});

test("cross-page saves reject physical gaps and unaccepted text", async () => {
  const { book, files } = stored(); book.pages[1].pdf_page = 3;
  await assert.rejects(joinFollowingUnit({ book, validate }, "p1", "u3"), /consecutive/);
  book.pages[1].pdf_page = 2; delete files.get("pages/p2.json").source.layers.text.accepted_at_utc;
  await assert.rejects(joinFollowingUnit({ book, validate }, "p1", "u3"), /both pages/);
});

test("a Text save after a cross-page join keeps the joined unit flags", async () => {
  const { book, files } = stored(), base = page(), edited = ops.clone(base);
  await joinFollowingUnit({ book, validate }, "p1", "u3");
  edited.page.regions[0].lines[0].text = "Corrected transcription";
  await book.saveEdit("p1", edited, { focus: "text", base });
  const saved = files.get("edits/p1.json"); assert.equal(saved.units[2].open.end, true);
  assert.equal(saved.page.regions[0].lines[0].text, "Corrected transcription");
  assert.equal(layerState(saved, "units").state, "edited");
  assert.deepEqual(prepare([saved, await book.current("p2")], types).warnings, []);
});

test("book exports keep both joined pages and reject stale unit snapshots", async () => {
  const { book } = stored(), expected = new Map([["p1", unitSnapshot(page())]]);
  await joinFollowingUnit({ book, validate }, "p1", "u3");
  const files = await book.chayaFiles(), P = prepare([files["edits/p1.json"], files["edits/p2.json"]], files["types.json"]);
  assert.deepEqual(P.warnings, []);
  await assert.rejects(book.editPages(["p1"], docs => docs, { check, expected }), /units changed/);
});
