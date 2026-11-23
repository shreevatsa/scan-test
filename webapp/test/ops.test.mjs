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
