import { test } from "node:test";
import assert from "node:assert/strict";
import { assemble } from "../js/assemble.js";
import { effectiveEnd, toPageDocs } from "../js/chaya-book.js";
import { boxRing } from "../js/ops.js";
import { bookText, prepare } from "../js/reader.js";
import { migrateFiles } from "../tools/migrate.mjs";

const box = [15, 20, 150, 60];
const types = { types: {
  section: { contains: ["group"], flow: "main" },
  group: { contains: ["verse"], numbered: true },
  paragraph: { region: "paragraph", flow: "main" },
  verse: { region: "verse", lang: "sa" },
  footnote: { region: "note", flow: "notes" },
}, flows: { main: {}, notes: {} }, relations: { note: {} } };
const region = (id, type, order, lines) => ({ id, type, order, box, polygons: [boxRing(box)],
  lines: lines.map((line, index) => ({ line: index + 1, ...line })) });
const ref = (page, id) => ({ region: `${page}#${id}` });
const unit = (id, type, children, attrs) => ({ id, type, children, ...attrs });
const page = (id, regions, units, flows, source, relations) => ({
  schema_version: "0.3", page: { id, label: id === "first" ? "4" : "5", width: 300, height: 400, regions },
  units, flows, source, relations,
});

test("the migration preserves joined prose, numbered groups, linked footnotes and areas", () => {
  const excluded = region("r2", "paragraph", 2, [{ text: "Library stamp" }]);
  const anchor = { kind: "note_marker", start: 5, end: 5, marker: "*", id: "m4" };
  const files = {
    "book.json": { title: "Invented book", pages: [{ id: "first", pdf_page: 1 }, { id: "second", pdf_page: 2 }] },
    "types.json": types,
    "pages/first.json": page("first", [
      region("r1", "paragraph", 1, [{ text: "A co-", end: "space" }, { text: "author" }]),
    ], [unit("p", "paragraph", [ref("first", "r1")], { open: { end: true } })], { main: ["p"], notes: [] }, {
      ignored_regions: [{ region: excluded.id, box, block: excluded }],
      omitted_regions: [{ region: "r3", box, proposed_type: "ownership_mark" }],
    }, []),
    "pages/second.json": page("second", [
      region("r1", "paragraph", 1, [{ text: "kept writing." }]),
      region("r2", "verse", 2, [{ text: "Verse", spans: [anchor] }, { text: "another line" }]),
      region("r3", "footnote", 3, [{ text: "A small note." }]),
    ], [
      unit("p", "paragraph", [ref("second", "r1")], { open: { start: true } }),
      unit("s", "section", [{ unit: "g" }], { label: "Opening" }),
      unit("g", "group", [{ unit: "v" }], { number: "7" }),
      unit("v", "verse", [ref("second", "r2")], { lang: "sa" }),
      unit("n", "footnote", [ref("second", "r3")]),
    ], { main: ["p", "s"], notes: ["n"] }, {}, [
      { type: "note", from: { anchor: "second#m4", marker: "*", region: "second#r2", line: 1 }, to: { unit: "n" } },
    ]),
  };
  const { book, report } = migrateFiles(files);
  assert.equal(report.passed, true, JSON.stringify(report.comparisons));
  assert.equal(book.pages[0].regions.find(r => r.id === "r1").continues, true);
  assert.equal(book.pages[0].regions.find(r => r.id === "r1").lines[0].end, "space");
  assert.equal(book.pages[0].regions.find(r => r.id === "r2").out, true);
  assert.equal(book.pages[0].regions.find(r => r.id === "r2").lines[0].text, "Library stamp");
  assert.equal(book.pages[0].regions.find(r => r.id === "r3").proposed, "ownership_mark");
  assert.equal(book.pages[1].regions.find(r => r.id === "r2").lines[0].spans[0].to, "2/r3");
  const next = toPageDocs(book);
  const [assembled] = assemble(next.docs, next.types);
  assert.equal(assembled.units.find(u => u.type === "group").number, "7");
  assert.deepEqual(assembled.units.find(u => u.type === "paragraph").children, [ref("first", "r1"), ref("second", "r1")]);
  assert.match(bookText(prepare(next.docs, next.types)), /A co- author/);
});

test("v1 uses stored paths and allows a different kind of unit between continued blocks", () => {
  const fraction = [0.1, 0.2, 0.5, 0.7];
  const stored = { chaya: 1, title: "A book",
    types: { paragraph: { kind: "paragraph" }, verse: { kind: "verse" }, section: { contains: ["verse", "paragraph"] } },
    containers: { c1: { type: "section" } }, pages: [{ id: "page", regions: [
      { id: "a", type: "paragraph", box: fraction, in: ["c1"], continues: true, lines: [{ text: "inter‐" }] },
      { id: "b", type: "verse", box: fraction, in: ["c1"], lines: [{ text: "A verse." }] },
      { id: "c", type: "paragraph", box: fraction, in: ["c1"], lines: [{ text: "rupted." }, {}] },
    ] }],
  };
  const next = toPageDocs(stored), [book] = assemble(next.docs, next.types);
  const p = book.units.find(u => u.type === "paragraph");
  assert.deepEqual(p.children, [ref("page", "a"), ref("page", "c")]);
  assert.deepEqual(next.docs[0].page.regions.map(r => r.lines[0].end), ["hyphen", "line", "space"]);
  assert.equal(Object.hasOwn(next.docs[0].page.regions[2].lines[1], "text"), false);
  assert.equal(effectiveEnd({ text: "word-", end: "space" }, "paragraph"), "space");
  assert.equal(effectiveEnd({ text: "cell-" }, "table"), "line");
});
