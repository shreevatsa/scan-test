import assert from "node:assert/strict";
import { test } from "node:test";
import { fromSimple, toSimple } from "../js/simple-format.js";
import { bookReading } from "../js/reading.js";
import { prepare, bookText } from "../js/reader.js";
import { boxRing } from "../js/ops.js";

const ring = box => [boxRing(box)];
const box = [10, 20, 310, 120];
const line = (id, text, extra = {}) => ({ line: id, text, polygons: ring(box), ...extra });
const block = (id, type, order, lines, source) => ({ id, type, order, box, polygons: ring(box), lines, ...(source ? { source } : {}) });
const page = (id, regions, overrides = {}, source = {}) => ({
  format: "page", schema_version: "0.4", book_id: "example",
  page: { id, width: 500, height: 1000, image: id + ".png", regions },
  overrides, source,
});
const types = {
  format: "types", schema_version: "0.3", title: "An example", book_id: "example",
  flows: { main: "Main text", notes: "Notes" }, relations: { note: "Note link" },
  types: {
    prose: { flow: "main", region: "paragraph" },
    stanza: { flow: "main", region: "verse" },
    note: { flow: "notes", region: "note" },
    header: { role: "furniture", region: "running_header" },
  },
};

test("simple JSON keeps reading order, Unicode spans, line joins, notes and continuations", () => {
  const front = page("a", [
    block("head", "header", null, [line(2, "Heading")]),
    block("body", "prose", 5, [
      line(13, "𝒜br-", { end: "hyphen", spans: [{ kind: "italic", start: 1, end: 3 }] }),
      line(19, "idge", { end: "join", spans: [{ kind: "note_marker", start: 4, end: 4, id: "m1", marker: "1" }] }),
    ], { continues_later: true }),
    block("poem", "stanza", 2, [line(10, "First verse"), line(11, "Second verse", { end: "line" })]),
    block("fn", "note", 7, [line(21, "1. A note")]),
  ], { links: [{ from: { anchor: "a#m1", region: "a#body", line: 19, marker: "1" }, to: "note@fn" }] },
  { omitted_regions: [{ region: "unknown", box, proposed_type: "caption" }], ignored_regions: [{ region: "omitted", box }] });
  const back = page("b", [block("more", "prose", 7, [line(2, "and beyond.")], { continues_from_earlier: true })]);
  const manifest = { book_id: "example", title: "An example", pdf: { name: "source.pdf", sha256: "a".repeat(64) },
    skipped: ["dim"], pages: ["a", "b", "dim", "pending"].map((id, index) => ({ id, pdf_page: index + 1, width: 500, height: 1000 })) };
  const files = { "book.json": manifest, "types.json": types, "pages/a.json": page("a", []), "edits/a.json": front, "pages/b.json": back };
  const copy = structuredClone(files), simple = toSimple(files);
  assert.deepEqual(files, copy);
  assert.deepEqual(simple.pages[0].size, [500, 1000]);
  assert.deepEqual(simple.pages[0].regions.map(region => region.type), ["stanza", "prose", "note", "header", "?", "?"]);
  const prose = simple.pages[0].regions[1];
  assert.equal(prose.text, "𝒜br-\nidge");
  assert.deepEqual(prose.marks, [{ kind: "italic", start: 1, end: 3 }, { kind: "note_marker", at: 9, id: "m1", marker: "1" }]);
  assert.deepEqual(prose.box, [0.02, 0.02, 0.62, 0.12]);
  assert.deepEqual(prose.ends, { 1: "join" });
  assert.deepEqual(prose.default_ends, [0]);
  assert.deepEqual(prose.line_ids, [13, 19]);
  assert.deepEqual(simple.pages[0].regions.slice(-2), [
    { type: "?", box: prose.box, proposed: "caption" }, { type: "?", box: prose.box, left_out: true },
  ]);
  const imported = fromSimple(JSON.parse(JSON.stringify(simple)));
  const document = imported["pages/a.json"], region = document.page.regions[1];
  assert.deepEqual(region.lines[0].spans, front.page.regions[1].lines[0].spans);
  assert.deepEqual(region.lines[1].spans, front.page.regions[1].lines[1].spans);
  assert.deepEqual(region.lines.map(({ line, end }) => [line, end]), [[13, "hyphen"], [19, "join"]]);
  assert.deepEqual(document.page.regions.map(({ order }) => order), [1, 2, 3, null]);
  assert.deepEqual(document.overrides, front.overrides);
  assert.deepEqual(imported["book.json"].skipped, ["dim"]);
  assert.equal(imported["pages/dim.json"], undefined);
  assert.equal(imported["pages/pending.json"], undefined);
  const render = data => {
    const m = data["book.json"], t = data["types.json"], docs = [data["edits/a.json"] || data["pages/a.json"], data["pages/b.json"]];
    const view = bookReading(m.pages, docs, t, new Set(m.skipped), m.rules);
    return prepare(view.docs, view.types);
  };
  const before = render(files), after = render(imported);
  assert.equal(bookText(before), bookText(after));
  assert.match(bookText(after), /𝒜bridge/);
  assert.match(bookText(after), /First verse\nSecond verse/);
  assert.equal(Object.keys(after.noteOf).length, 1);
  assert.deepEqual(before.warnings, after.warnings);
});

test("unread pieces, empty pieces and embedded newlines remain distinct", () => {
  const region = block("r", "prose", 1, [
    line(1, "first\nlast"),
    { line: 2, polygons: ring(box) },
    line(3, ""),
    line(4, "word-"),
  ]);
  const files = { "book.json": { book_id: "example", pages: [{ id: "a", pdf_page: 1 }], rules: { settleBreaks: true } },
    "types.json": types, "pages/a.json": page("a", [region, block("no-lines", "header", null, [])]) };
  const simple = toSimple(files), [withLines, noLines] = simple.pages[0].regions;
  assert.deepEqual(withLines.line_breaks, [10, 11, 12]);
  assert.deepEqual(withLines.unread, [1]);
  assert.equal(noLines.text, undefined);
  const data = fromSimple(simple), [rebuilt, empty] = data["pages/a.json"].page.regions;
  assert.deepEqual(rebuilt.lines, region.lines);
  assert.deepEqual(empty.lines, []);
  assert.deepEqual(data["book.json"].rules, files["book.json"].rules);
});
