// Edits on real page documents keep them valid, and inverse edits restore them.
// Run from the repository root:  node --test webapp/test/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { makeValidator, checkPage } from "../js/schema.js";
import * as ops from "../js/ops.js";
import { toggleKind, shiftSpans, segments, cp } from "../js/inline.js";

const ROOT = new URL("../..", import.meta.url).pathname;
const validate = makeValidator(JSON.parse(readFileSync(join(ROOT, "webapp/schema.json"), "utf8")));
const KALE = join(ROOT, "outputs/books/kale-1913-book-002");
const TELANG = join(ROOT, "outputs/books/telang-dli-book-001");
const have = existsSync(join(KALE, "book.json")) && existsSync(join(TELANG, "book.json"));
const read = (folder, name) => JSON.parse(readFileSync(join(folder, name), "utf8"));
const page = (folder, id) => read(folder, `pages/${id}.json`);
const KT = have ? read(KALE, "types.json") : null, TT = have ? read(TELANG, "types.json") : null;
const valid = (doc, tl, what) => assert.deepEqual(checkPage(validate, doc, tl)[0], [], what);
const structure = d => ops.clone({ units: d.units, flows: d.flows, relations: d.relations || [], regions: d.page.regions });

test("split and join", { skip: !have }, () => {
  const doc = page(KALE, "kale-1913-page-166"), orig = ops.clone(doc);
  const nid = ops.splitUnit(doc, "u3", 1);
  valid(doc, KT, "after split");
  assert.equal(ops.unitById(doc, nid).children[0].region, "kale-1913-page-166#r3");
  assert.ok(ops.unitById(doc, nid).open.end && !ops.unitById(doc, "u3").open);
  ops.joinWithNext(doc, "u3");
  valid(doc, KT, "after join");
  assert.deepEqual(structure(doc), structure(orig));
});

test("retype a unit and its regions", { skip: !have }, () => {
  const doc = page(KALE, "kale-1913-page-166");
  assert.ok(ops.retypeChoices(doc, KT, "u3").includes("paragraph"));
  ops.retypeUnit(doc, KT, "u3", "paragraph");
  valid(doc, KT, "notes may contain a paragraph");
  assert.equal(ops.regionById(doc, "r2").type, "paragraph");
  assert.throws(() => ops.retypeUnit(doc, KT, "u3", "notes"), /container/);
});

test("wrap and unwrap", { skip: !have }, () => {
  const doc = page(KALE, "kale-1913-page-106"), orig = ops.clone(doc);
  const top = doc.flows.main[0];
  const first = ops.unitById(doc, top).children.find(c => c.unit);
  const kid = ops.unitById(doc, first.unit);
  const wrapper = ops.containersFor(KT, kid.type)[0];
  const w = ops.wrapUnit(doc, KT, kid.id, wrapper);
  assert.equal(ops.placeOf(doc, kid.id).parent.id, w);
  ops.unwrapUnit(doc, w);
  assert.deepEqual(structure(doc), structure(orig));
});

test("add, move and delete regions", { skip: !have }, () => {
  const doc = page(KALE, "kale-1913-page-166"), orig = ops.clone(doc);
  const rid = ops.addRegion(doc, KT, "paragraph", [100, 1000, 1200, 1100], "u1");
  valid(doc, KT, "paragraph added inside the notes");
  ops.setLine(doc, rid, 0, "An added line.", [{ start: 3, end: 8, kind: "italic" }]);
  valid(doc, KT, "with text");
  ops.moveRegionToUnit(doc, KT, rid, "u3");
  valid(doc, KT, "moved into the stanza note");
  assert.equal(ops.regionById(doc, rid).type, "stanza_note");
  ops.deleteRegion(doc, rid);
  assert.deepEqual(structure(doc), structure(orig));
  assert.throws(() => ops.addRegion(doc, KT, "stanza_note", [0, 0, 50, 50]), /top level/);
  const fid = ops.addRegion(doc, KT, "page_number", [600, 2000, 700, 2050]);
  valid(doc, KT, "furniture needs no unit");
  ops.deleteRegion(doc, fid);
  assert.deepEqual(structure(doc), structure(orig));
});

test("region type changes split a unit", { skip: !have }, () => {
  const doc = page(KALE, "kale-1913-page-166");
  ops.setRegionType(doc, KT, "r3", "paragraph");
  valid(doc, KT, "r3 as a paragraph of its own");
  const owner = ops.ownerOf(doc, "r3");
  assert.equal(owner.type, "paragraph");
  assert.equal(owner.children.length, 1);
  assert.equal(ops.ownerOf(doc, "r2").id, "u3");
  ops.setRegionType(doc, KT, "r1", "running_header" in KT.types ? "running_header" : Object.keys(KT.types).find(t => KT.types[t].role === "furniture"));
  valid(doc, KT, "the heading as furniture");
});

test("markers and note relations", { skip: !have }, () => {
  const doc = page(KALE, "kale-1913-page-166");
  // The model's relation has no anchor here (its marker sign was missing).
  const i = doc.relations.findIndex(r => !r.from.anchor);
  ops.anchorRelation(doc, i, "m1");
  valid(doc, KT, "anchored");
  assert.equal(doc.relations[i].from.anchor, "kale-1913-page-166#m1");
  const sid = ops.insertMarker(doc, "r3", 0, 4, "†");
  assert.equal(sid, "m2");
  ops.linkMarker(doc, KT, sid, "u4");
  valid(doc, KT, "a second marker linked to the footnote");
  ops.deleteMarker(doc, "m1");
  valid(doc, KT, "first marker deleted");
  assert.equal(doc.relations.length, 1);
  // Text edits that drop a marker drop its relation.
  const L = ops.regionById(doc, "r3").lines[0];
  ops.setLine(doc, "r3", 0, L.text, []);
  assert.equal(doc.relations, undefined);
  valid(doc, KT, "marker removed by a text edit");
});

test("line pieces and kept text", { skip: !have }, () => {
  const doc = page(TELANG, "telang-dli-book-page-007");
  const r = doc.page.regions.find(x => x.source?.transcription?.lines);
  if (!r) return;
  ops.useKeptText(doc, r.id);
  valid(doc, TT, "kept text placed on line pieces");
  assert.ok(r.lines.every(L => typeof L.text === "string"));
  ops.addLine(doc, r.id, 0);
  ops.setLineEnd(doc, r.id, 0, "hyphen");
  ops.deleteLine(doc, r.id, 1);
  valid(doc, TT, "line pieces added and deleted");
});

test("box edits", { skip: !have }, () => {
  const doc = page(TELANG, "telang-dli-book-page-108");
  const r = doc.page.regions[0];
  assert.equal(r.box.length, 4);
  ops.setBox(doc, r.id, [r.box[2], r.box[3], r.box[0] - 10, r.box[1] - 10]);
  valid(doc, TT, "box set");
  assert.deepEqual(r.polygons[0][0], [r.box[0], r.box[1]]);
  assert.throws(() => ops.setBox(doc, r.id, [5, 5, 6, 6]), /small/);
});

test("span editing", () => {
  let s = toggleKind([], "bold", 2, 5);
  assert.deepEqual(s, [{ start: 2, end: 5, kind: "bold" }]);
  s = toggleKind(s, "bold", 3, 4);
  assert.deepEqual(s, [{ start: 2, end: 3, kind: "bold" }, { start: 4, end: 5, kind: "bold" }]);
  s = toggleKind(s, "bold", 2, 5);
  assert.deepEqual(s, [{ start: 2, end: 5, kind: "bold" }]);
  const m = { start: 4, end: 4, kind: "note_marker", id: "m1", marker: "1" };
  assert.deepEqual(shiftSpans([m], cp("abcdef"), cp("abXXcdef")), [{ ...m, start: 6, end: 6 }]);
  assert.deepEqual(segments("ab", [m]).map(x => x.marker ? "M" : x.text), ["ab", "M"]);
  assert.deepEqual(segments("दिक्काला", [{ ...m, start: 6, end: 6 }]).map(x => x.marker ? "M" : x.text), ["दिक्का", "M", "ला"]);
});

test("replace in a line", () => {
  const doc = { page: { id: "p", regions: [{ id: "r1", type: "x", polygons: [], lines: [{ text: "abcdef",
    spans: [{ start: 0, end: 6, kind: "bold" }, { start: 1, end: 3, kind: "italic" }, { start: 2, end: 2, kind: "note_marker", id: "m1", marker: "1" },
            { start: 5, end: 5, kind: "note_marker", id: "m2", marker: "2" }] }] }] },
    relations: [{ type: "note", from: { anchor: "p#m1" }, to: { unit: "u" } }] };
  ops.replaceInLine(doc, "r1", 0, 1, 4, "XY");
  const L = doc.page.regions[0].lines[0];
  assert.equal(L.text, "aXYef");
  assert.deepEqual(L.spans.filter(s => s.kind === "bold"), [{ start: 0, end: 5, kind: "bold" }]);
  assert.deepEqual(L.spans.filter(s => s.kind === "italic"), []);
  assert.deepEqual(L.spans.filter(s => s.kind === "note_marker").map(s => [s.id, s.start]), [["m2", 4]]);
  assert.equal(doc.relations, undefined);
});

test("linking a marker replaces the model's anchorless relation", { skip: !have }, () => {
  const doc = page(KALE, "kale-1913-page-166");
  ops.linkMarker(doc, KT, "m1", "u4");
  assert.deepEqual(doc.relations, [{ type: "note", from: { anchor: "kale-1913-page-166#m1" }, to: { unit: "u4" } }]);
  valid(doc, KT, "linked");
});

// Made-up pages and a made-up type list (with a figure type and an ornament furniture type), for the edits added on
// 2026-11-06 and 2026-11-07: splitting at a line piece, moving text to a column, figures and ornaments, styles and
// rows. (They were first tested on a private book's pages; these fixtures test the same and need no private data.)
const TL = { format: "types", schema_version: "0.2", book_id: "test", title: "A made-up book", flows: { main: "The text." },
  types: {
    chapter: { description: "A chapter.", contains: ["heading", "paragraph", "figure"], flow: "main" },
    heading: { description: "A heading.", region: "heading" },
    paragraph: { description: "A paragraph, or a block of lines set apart.", region: "paragraph" },
    figure: { description: "A picture in the text.", region: "figure" },
    ornament: { description: "A picture that belongs to the page.", role: "furniture", region: "figure" },
  },
  relations: { note: "A marker to its note." } };

// One page: a chapter with a heading and a paragraph of the given lines (1000 px wide, 50 px apart), and with
// `figure`, a figure at the chapter's end.
function madeUpPage(lines, { figure = false } = {}) {
  const pid = "test-page-001";
  const rect = (x0, y0, x1, y1) => [[[x0, y0], [x1, y0], [x1, y1], [x0, y1]]];
  const bottom = 240 + 50 * (lines.length - 1);
  const regions = [
    { id: "r1", type: "heading", polygons: rect(100, 100, 1100, 140), box: [100, 100, 1101, 141], lines: [{ line: 0, polygons: rect(100, 100, 1100, 140), text: "A heading" }] },
    { id: "r2", type: "paragraph", polygons: rect(100, 200, 1100, bottom), box: [100, 200, 1101, bottom + 1],
      lines: lines.map((text, i) => ({ line: i + 1, polygons: rect(100, 200 + 50 * i, 1100, 240 + 50 * i), text })) },
  ];
  const units = [{ id: "u1", type: "chapter", children: [{ unit: "u2" }, { unit: "u3" }] },
                 { id: "u2", type: "heading", children: [{ region: `${pid}#r1` }] },
                 { id: "u3", type: "paragraph", children: [{ region: `${pid}#r2` }] }];
  if (figure) {
    regions.push({ id: "r3", type: "figure", polygons: rect(400, bottom + 40, 800, bottom + 240), box: [400, bottom + 40, 801, bottom + 241] });
    units[0].children.push({ unit: "u4" });
    units.push({ id: "u4", type: "figure", children: [{ region: `${pid}#r3` }] });
  }
  return { format: "page", schema_version: "0.2", book_id: "test", page: { id: pid, image: `${pid}.png`, width: 1200, height: 1600, regions }, units, flows: { main: ["u1"] } };
}

test("split a region at a line piece, into a new unit or the same unit", () => {
  const doc = madeUpPage(["one", "two", "three", "four", "five", "six"]);
  valid(doc, TL, "the made-up page");
  const r = ops.regionById(doc, "r2"), owner = ops.ownerOf(doc, "r2");
  const nid = ops.splitRegionAt(doc, "r2", 3, true);
  valid(doc, TL, "after a split into a new unit");
  assert.equal(r.lines.length, 3);
  assert.equal(ops.regionById(doc, nid).lines[0].text, "four");
  const place = ops.placeOf(doc, owner.id);
  const next = ops.unitById(doc, place.list[place.index + 1].unit);
  assert.equal(next.type, owner.type);
  assert.deepEqual(next.children, [{ region: ops.regionRef(doc, nid) }]);
  assert.ok(r.box[3] < ops.regionById(doc, nid).box[1], "the boxes are cut between the pieces");
  const n2 = ops.splitRegionAt(doc, nid, 2, false);
  valid(doc, TL, "after a split within the unit");
  assert.deepEqual(next.children.map(c => c.region), [ops.regionRef(doc, nid), ops.regionRef(doc, n2)]);
  assert.throws(() => ops.splitRegionAt(doc, nid, 0), /caret/);
});

test("move the text after the caret to a column on the right", () => {
  const lefts = ["Left one", "Left two", "Left three", "Left four", "Left five"];
  const rights = ["Right one", "Right two", "Right three", "Right four", "Right five"];
  const doc = madeUpPage(lefts.map((l, i) => `${l}   ${rights[i]}`));
  const R = ops.regionById(doc, "r2");
  // A bold span over a whole line, and a note marker in its right part with a relation, move with the text.
  R.lines[1].spans = [{ start: 0, end: cp(R.lines[1].text).length, kind: "bold" }, { start: 15, end: 15, kind: "note_marker", id: "m9", marker: "1" }];
  doc.relations = [{ type: "note", from: { anchor: `${doc.page.id}#m9` }, to: { unit: "u3" } }];
  valid(doc, TL, "with a span and a marker");
  let col = null;
  R.lines.slice().forEach((L, i) => { col = ops.moveRestToColumn(doc, "r2", i, L.text.indexOf(rights[i])); });
  valid(doc, TL, "after the column moves");
  const C = ops.regionById(doc, col);
  assert.deepEqual(C.lines.map(L => L.text), rights);
  assert.deepEqual(R.lines.map(L => L.text), lefts);
  assert.equal(C.source.column_of, "r2");
  assert.deepEqual(C.lines.map(L => L.line), R.lines.map(L => L.line), "each piece keeps its line id");
  assert.deepEqual(R.lines[1].spans, [{ start: 0, end: 8, kind: "bold" }]);
  assert.deepEqual(C.lines[1].spans, [{ start: 0, end: 9, kind: "bold" }, { start: 4, end: 4, kind: "note_marker", id: "m9", marker: "1" }]);
  assert.equal(doc.relations.length, 1, "the marker's relation stays");
  const left = ops.ownerOf(doc, "r2"), right = ops.ownerOf(doc, col);
  const place = ops.placeOf(doc, left.id);
  assert.equal(ops.unitById(doc, place.list[place.index + 1].unit), right, "the column's unit comes right after");
  assert.ok(C.box[0] > R.lines[0].polygons[0][0][0], "the column is to the right");
  assert.ok(left.style?.row && left.style.row === right.style?.row, "the two columns share a row");
  assert.equal(doc.schema_version, "0.3");
  assert.throws(() => ops.moveRestToColumn(doc, "r2", 0, 99), /no text after the caret/);
});

test("a figure region has no line pieces", () => {
  const doc = madeUpPage(["one", "two"]);
  const rid = ops.addRegion(doc, TL, "figure", [700, 1000, 1000, 1300], "u1");
  valid(doc, TL, "with a figure");
  assert.equal(ops.regionById(doc, rid).lines, undefined);
  ops.setUnitField(doc, ops.ownerOf(doc, rid).id, "label", "an emblem");
  valid(doc, TL, "with its label");
});

test("a figure becomes page furniture and goes back into its chapter", () => {
  const doc = madeUpPage(["one", "two", "three"], { figure: true });
  const units = doc.units.length;
  ops.setRegionType(doc, TL, "r3", "ornament");
  valid(doc, TL, "as an ornament");
  assert.equal(ops.ownerOf(doc, "r3"), null);
  assert.equal(doc.units.length, units - 1, "its empty figure unit goes");
  ops.setRegionType(doc, TL, "r3", "figure");
  valid(doc, TL, "a figure again");
  const back = doc.page.regions.find(r => r.type === "figure");
  const owner = ops.ownerOf(doc, back.id);
  const chapter = ops.unitById(doc, "u1");
  assert.equal(ops.placeOf(doc, owner.id).parent.id, "u1", "back in the chapter it stands in");
  assert.equal(chapter.children[chapter.children.length - 1].unit, owner.id, "at its place in reading order (the chapter's end)");
  assert.equal(back.lines, undefined);
});

test("unit styles and rows", () => {
  const doc = madeUpPage(["one", "two", "three", "four", "five", "six"]);
  const owner = ops.ownerOf(doc, "r2");
  const second = ops.ownerOf(doc, ops.splitRegionAt(doc, "r2", 3, true));
  ops.setUnitStyle(doc, owner.id, "align", "center");
  ops.setUnitStyle(doc, owner.id, "size_pt", 9);
  valid(doc, TL, "with a style");
  assert.deepEqual(owner.style, { align: "center", size_pt: 9 });
  assert.throws(() => ops.setUnitStyle(doc, owner.id, "colour", "red"), /no style property/);
  ops.setRowWithNext(doc, owner.id, true);
  valid(doc, TL, "in a row");
  assert.equal(owner.style.row, second.style.row);
  ops.setRowWithNext(doc, second.id, false);
  assert.equal(owner.style.row, undefined, "a row of one is dissolved");
  ops.setUnitStyle(doc, owner.id, "align", "");
  ops.setUnitStyle(doc, owner.id, "size_pt", null);
  assert.equal(owner.style, undefined, "an empty style goes");
  assert.throws(() => ops.setRowWithNext(doc, second.id, true), /no next unit/);
});

test("a figure unit made page furniture from the unit", () => {
  const doc = madeUpPage(["one", "two"], { figure: true });
  const rids = ops.unitToFurniture(doc, TL, "u4", "ornament");
  valid(doc, TL, "as an ornament");
  assert.deepEqual(rids, ["r3"]);
  assert.equal(ops.regionById(doc, "r3").type, "ornament");
  assert.equal(doc.units.some(u => u.id === "u4"), false, "the empty unit goes");
  assert.throws(() => ops.unitToFurniture(doc, TL, "u1", "ornament"), /holds other units/);
  assert.throws(() => ops.unitToFurniture(doc, TL, "u3", "paragraph"), /not page furniture/);
});
