// Units join across pages that have no unit of their type: a unit open at the end of one page joins the unit of its
// type open at the start of a later page when every page between has no unit of that type in that flow and no open end
// of its own (a blank page, a plate with its caption and furniture). Assembly (Read, Problems, the exports, the Read
// flags) and the Regions continuation flags follow the same rule. Run from the repository root:
//   node --test webapp/test/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { assemble } from "../js/assemble.js";
import { prepare, bookHtml } from "../js/reader.js";
import { pageStages, reviewPageStates, readingDocuments, readingGaps, stageFlags, pageWalker } from "../js/workflow.js";
import { regionFlags } from "../js/flags.js";
import { accept } from "../js/layers.js";
import { makeValidator, checkPage } from "../js/schema.js";
import { provisionalDocument } from "../js/pipeline/provisional.js";

const validate = makeValidator(JSON.parse(readFileSync(new URL("../schema.json", import.meta.url))));
const kinds = {
  paragraph: { description: "Prose", region: "paragraph" }, verse: { description: "A verse", region: "verse" },
  figure: { description: "An illustration", region: "figure" }, caption: { description: "A caption", region: "caption" },
  running_header: { description: "Running header", region: "running_header", role: "furniture" },
  page_number: { description: "Printed page number", region: "page_number", role: "furniture" },
};
const head = { format: "types", schema_version: "0.2", book_id: "joins", title: "Joins", flows: { main: "Main" } };
// Every kind of unit at the top of the flow, and the same kinds inside chapters (a plate's figure is then a chapter's child).
const FLAT = { ...head, types: Object.fromEntries(Object.entries(kinds).map(([name, type]) => [name, type.role ? type : { ...type, flow: "main" }])) };
const NESTED = { ...head, types: { chapter: { description: "A chapter", contains: ["paragraph", "verse", "figure", "caption"], flow: "main" }, ...kinds } };

const box = k => [10, 10 + 20 * k, 90, 25 + 20 * k];
const ring = k => { const [x1, y1, x2, y2] = box(k); return [[[x1, y1], [x2, y1], [x2, y2], [x1, y2]]]; };

// A page as region finding leaves it, its text read and moved on to Read, its units the provisional ones from its
// regions: each region [type, {from, later}] (continues from earlier, continues later), in reading order.
function page(types, n, regions) {
  const pid = `joins-page-00${n}`;
  const doc = provisionalDocument(pid, { image: `${pid}.png`, image_sha256: "a".repeat(64), width: 100, height: 200 }, types, {
    regions: regions.map(([type, flags = {}], k) => {
      const furniture = types.types[type].role === "furniture", figure = types.types[type].region === "figure";
      return { region_id: k + 1, type, region_class: types.types[type].region, keep: true, reading_order: furniture ? null : k + 1,
        status: "ok", polygons: ring(k), model_box: box(k), bounds: box(k), continues_from_earlier: !!flags.from,
        continues_later: !!flags.later, lines: figure ? [] : [{ line_id: k + 1, polygons: ring(k) }] };
    }) });
  for (const region of doc.page.regions) for (const line of region.lines) line.text = `${type(region)} on page ${n}`;
  doc.source.layers.text = { state: "model", types_revision: 1 };
  assert.deepEqual(checkPage(validate, doc, types)[0], [], `${pid} passes the checks`);
  return accept(accept(doc, "regions"), "text");
}
const type = region => region.type;
// Every list of pages assembled here, for the parity test with schema/book.py at the end.
const scenarios = [];
const record = (types, docs) => { scenarios.push({ types, docs: structuredClone(docs) }); return docs; };
const book = (types, specs) => record(types, specs.map((regions, k) => page(types, k + 1, regions)));
const pagesOf = docs => docs.map((doc, k) => ({ id: doc.page.id, pdf_page: k + 1 }));
// The pages of the book each of its units has regions on, by type.
const spans = assembled => assembled.units.filter(unit => unit.children.some(child => child.region))
  .map(unit => `${unit.type} ${[...new Set(unit.children.filter(child => child.region).map(child => child.region.split("#")[0].slice(-1)))].join("+")}`);
const continuation = (docs, types) => {
  const states = new Map(docs.map(doc => [doc.page.id, { ...pageStages(doc, types, ...checkPage(validate, doc, types)), runErrors: {} }]));
  const [, warnings] = assemble(docs, types);
  reviewPageStates(pagesOf(docs), states, types, warnings);
  return docs.map(doc => states.get(doc.page.id).regionFlags.filter(flag => flag.code === "continuation").map(flag => flag.message));
};

const PARA_ENDS = ["paragraph", { later: true }], PARA_GOES_ON = ["paragraph", { from: true }];
const PLATE = [["running_header"], ["figure"], ["caption"], ["page_number"]];

for (const [name, types] of [["flat", FLAT], ["in chapters", NESTED]]) {
  test(`${name}: a paragraph split by a blank page is one unit, with no warning or flag`, () => {
    const docs = book(types, [[PARA_ENDS], [], [PARA_GOES_ON]]);
    const [assembled, warnings] = assemble(docs, types);
    assert.deepEqual(warnings, []);
    assert.deepEqual(spans(assembled), ["paragraph 1+3"]);
    assert.deepEqual(continuation(docs, types), [[], [], []]);
  });

  test(`${name}: a paragraph split by a plate is one unit, and the plate's figure and caption follow it`, () => {
    for (const plate of [[["figure"]], PLATE]) {
      const docs = book(types, [[PARA_ENDS], plate, [PARA_GOES_ON]]);
      const [assembled, warnings] = assemble(docs, types);
      assert.deepEqual(warnings, []);
      assert.deepEqual(spans(assembled), ["paragraph 1+3", "figure 2", ...(plate.length > 1 ? ["caption 2"] : [])]);
      const order = types === FLAT ? assembled.flows.main : assembled.units.find(unit => unit.type === "chapter").children.map(child => child.unit);
      assert.deepEqual(order.map(uid => assembled.units.find(unit => unit.id === uid).type), ["paragraph", "figure", ...(plate.length > 1 ? ["caption"] : [])],
        "the figure stays in the flow, after the paragraph it interrupts");
      assert.deepEqual(continuation(docs, types), [[], [], []], "no continuation flag on the plate or either side of it");
    }
  });

  test(`${name}: a paragraph on three pages joins across a plate and a blank page`, () => {
    const docs = book(types, [[PARA_ENDS], [["paragraph", { from: true, later: true }]], PLATE, [], [PARA_GOES_ON]]);
    const [assembled, warnings] = assemble(docs, types);
    assert.deepEqual(warnings, []);
    assert.deepEqual(spans(assembled), ["paragraph 1+2+5", "figure 3", "caption 3"]);
    assert.deepEqual(continuation(docs, types), [[], [], [], [], []]);
  });
}

test("a page between with a paragraph of its own: nothing joins across it and the page breaks are reported", () => {
  const docs = book(FLAT, [[PARA_ENDS], [["figure"], ["paragraph"]], [PARA_GOES_ON]]);
  const [assembled, warnings] = assemble(docs, FLAT);
  assert.deepEqual(spans(assembled), ["paragraph 1", "figure 2", "paragraph 2", "paragraph 3"]);
  assert.deepEqual(warnings, [
    "page joins-page-002, flow main: open ends do not match (joins-page-001#u1, [])",
    "page joins-page-003, flow main: open ends do not match (joins-page-002#u2, [joins-page-003#u1])"]);
  assert.deepEqual(continuation(docs, FLAT), [
    ["main continuation does not match the next page"],
    ["main continuation does not match the previous page", "main continuation does not match the next page"],
    ["main continuation does not match the previous page"]]);
});

test("a plate between edges that do not match: the pages either side are flagged, the plate is not", () => {
  // The paragraph is marked as going on, but the page after the plate does not take it up.
  let docs = book(FLAT, [[PARA_ENDS], PLATE, [["paragraph"]]]);
  assert.equal(assemble(docs, FLAT)[1].length, 1, "one page break where units do not join");
  assert.deepEqual(continuation(docs, FLAT), [["main continuation does not match the next page"], [], ["main continuation does not match the previous page"]]);
  // The page after the plate goes on from earlier, but nothing before the plate goes on.
  docs = book(FLAT, [[["paragraph"]], PLATE, [PARA_GOES_ON]]);
  assert.equal(assemble(docs, FLAT)[1].length, 1);
  assert.deepEqual(continuation(docs, FLAT), [["main continuation does not match the next page"], [], ["main continuation does not match the previous page"]]);
  // Across a blank page the same.
  docs = book(FLAT, [[PARA_ENDS], [], [["paragraph"]]]);
  assert.deepEqual(continuation(docs, FLAT), [["main continuation does not match the next page"], [], ["main continuation does not match the previous page"]]);
});

test("verse across a page of prose: joined when that page has no open end of its own, not when it has one", () => {
  // The rule looks at the open unit's type only: a page of prose has no verse, so a verse goes on past it, and the
  // prose stays in the flow after the joined verse.
  let docs = book(FLAT, [[["paragraph"], ["verse", { later: true }]], [["paragraph"]], [["verse", { from: true }], ["paragraph"]]]);
  let [assembled, warnings] = assemble(docs, FLAT);
  assert.deepEqual(warnings, []);
  assert.deepEqual(spans(assembled), ["paragraph 1", "verse 1+3", "paragraph 2", "paragraph 3"]);
  assert.deepEqual(assembled.flows.main.map(uid => assembled.units.find(unit => unit.id === uid).type), ["paragraph", "verse", "paragraph", "paragraph"]);
  assert.deepEqual(continuation(docs, FLAT), [[], [], []]);
  // When the prose on the page between goes on to the next page itself, it is that page's open end: the verse is not
  // joined, and its page break is reported.
  docs = book(FLAT, [[["verse", { later: true }]], [["paragraph", { later: true }]], [["paragraph", { from: true }]]]);
  [assembled, warnings] = assemble(docs, FLAT);
  assert.deepEqual(spans(assembled), ["verse 1", "paragraph 2+3"]);
  assert.deepEqual(warnings, ["page joins-page-002, flow main: open ends do not match (joins-page-001#u1, [])"]);
  // A page between with a verse of its own stops it too.
  docs = book(FLAT, [[["verse", { later: true }]], [["verse"]], [["verse", { from: true }]]]);
  [assembled, warnings] = assemble(docs, FLAT);
  assert.deepEqual(spans(assembled), ["verse 1", "verse 2", "verse 3"]);
  assert.equal(warnings.length, 2);
});

test("Read joins across blank pages and plates moved on to it, never across a page not moved on yet", () => {
  const docs = book(FLAT, [[PARA_ENDS], PLATE, [], [PARA_GOES_ON], [PARA_ENDS], [["figure"]], [PARA_GOES_ON]]);
  const pages = pagesOf(docs);
  // Every page moved on: two paragraphs, each across the pages between.
  let P = prepare(readingDocuments(pages, docs), FLAT);
  assert.deepEqual(P.warnings, []);
  assert.deepEqual(spans(P.book), ["paragraph 1+4", "figure 2", "caption 2", "paragraph 5+7", "figure 6"]);
  const html = bookHtml(P);
  assert.equal(html.match(/<p class="r-para r-paragraph"/g).length, 2, "each paragraph is one passage");
  assert.match(html, /paragraph on page 1.*paragraph on page 4.*caption on page 2/s, "the plate's caption follows the paragraph");
  // The blank page (3) and the plate (6) not moved on: they are gaps, and nothing joins across a gap.
  const accepted = docs.filter((doc, k) => k !== 2 && k !== 5);
  assert.deepEqual(readingGaps(pages, new Set(accepted.map(doc => doc.page.id))), ["Page 3", "Page 6"]);
  P = prepare(record(FLAT, readingDocuments(pages, accepted)), FLAT);
  assert.deepEqual(P.warnings, [], "a gap is like the end of the book on one side and its start on the other");
  assert.deepEqual(spans(P.book), ["paragraph 1", "figure 2", "caption 2", "paragraph 4", "paragraph 5", "paragraph 7"]);
});

test("the Read flags and Problems report a page break only where units do not join", () => {
  const docs = book(FLAT, [[PARA_ENDS], PLATE, [PARA_GOES_ON], [["figure"], ["paragraph"]], [PARA_GOES_ON]]);
  const states = new Map(docs.map(doc => [doc.page.id, { ...pageStages(doc, FLAT), runErrors: {} }]));
  const P = prepare(docs, FLAT);
  assert.deepEqual(P.warnings, ["page joins-page-005, flow main: open ends do not match (joins-page-004#u2, [joins-page-005#u1])"]);
  reviewPageStates(pagesOf(docs), states, FLAT, P.warnings);
  assert.deepEqual(docs.map(doc => stageFlags(states.get(doc.page.id), "read").length), [0, 0, 0, 1, 1]);
});

test("the continuation flags look past pages only up to a gap in the PDF's pages, a sample break or a page with no document", () => {
  // The paragraph is marked as going on, and the page after the plate does not take it up.
  const docs = book(FLAT, [[PARA_ENDS], PLATE, [["paragraph"]]]);
  const flagsOf = (pages, docOf = id => docs.find(doc => doc.page.id === id) || null) => docs.map((doc, index) =>
    regionFlags(doc, FLAT, { previous: pageWalker(pages, index, docOf, -1), next: pageWalker(pages, index, docOf, 1) })
      .filter(flag => flag.code === "continuation").length);
  assert.deepEqual(flagsOf(pagesOf(docs)), [1, 0, 1]);
  // PDF pages 1, 2 and 5: past the plate is a gap, and nothing is known there.
  assert.deepEqual(flagsOf(pagesOf(docs).map((page, k) => ({ ...page, pdf_page: k < 2 ? k + 1 : 5 }))), [0, 0, 0]);
  // The plate has no document yet.
  assert.deepEqual(flagsOf(pagesOf(docs), id => (id === docs[1].page.id ? null : docs.find(doc => doc.page.id === id))), [0, 0, 0]);
  // Sample pages: the plate and the page after it are not consecutive in the source book.
  const sampled = structuredClone(docs);
  sampled[1].source.sample = { consecutive_next: false };
  sampled[2].source.sample = { consecutive_previous: false };
  assert.deepEqual(flagsOf(pagesOf(docs), id => sampled.find(doc => doc.page.id === id)), [0, 0, 0]);
  // A walker gives the nearest page that fails the test, past the ones that pass it.
  const walk = pageWalker(pagesOf(docs), 0, id => docs.find(doc => doc.page.id === id), 1);
  assert.equal(walk(), docs[1]);
  assert.equal(walk(doc => !doc.page.regions.some(region => region.type === "paragraph")), docs[2]);
  assert.equal(walk(() => true), null);
});

test("a paragraph open at its end and a verse open at its start across a plate do not join, and both sides are flagged", () => {
  // The plate has no paragraph, so the paragraph's open end reaches the next page; the unit open there is a verse, so
  // nothing joins (the rule joins units of one type only), and the break is reported between the pages either side.
  const docs = book(FLAT, [[PARA_ENDS], PLATE, [["verse", { from: true }]]]);
  const [assembled, warnings] = assemble(docs, FLAT);
  assert.deepEqual(spans(assembled), ["paragraph 1", "figure 2", "caption 2", "verse 3"]);
  assert.deepEqual(warnings, ["page joins-page-003, flow main: open ends do not match (joins-page-001#u1, [joins-page-003#u1])"]);
  assert.deepEqual(continuation(docs, FLAT), [["main continuation does not match the next page"], [], ["main continuation does not match the previous page"]]);
});

test("an open start with nothing open to join names the nearest page with a unit of its type, not a plate between", () => {
  const readFlagged = (docs, types, warnings) => {
    const states = new Map(docs.map(doc => [doc.page.id, { ...pageStages(doc, types), runErrors: {} }]));
    reviewPageStates(pagesOf(docs), states, types, warnings);
    return docs.map(doc => stageFlags(states.get(doc.page.id), "read").length);
  };
  // Page 3 goes on from earlier, page 1's paragraph does not go on, and the plate between has no paragraph.
  let docs = book(FLAT, [[["paragraph"]], PLATE, [PARA_GOES_ON]]);
  let [, warnings] = assemble(docs, FLAT);
  assert.deepEqual(warnings, ["page joins-page-003, flow main: open ends do not match (joins-page-001#u1, [joins-page-003#u1])"]);
  assert.deepEqual(readFlagged(docs, FLAT, warnings), [1, 0, 1], "Read flags the pages either side of the plate, as Regions does");
  // With no unit of its type before it, the page before is its earlier side, as before the rule.
  docs = book(FLAT, [[["verse"]], [PARA_GOES_ON]]);
  [, warnings] = assemble(docs, FLAT);
  assert.deepEqual(warnings, ["page joins-page-002, flow main: open ends do not match (joins-page-001#u1, [joins-page-002#u1])"]);
  assert.deepEqual(continuation(docs, FLAT), [["main continuation does not match the next page"], ["main continuation does not match the previous page"]]);
  // A page whose own unit goes on from earlier or later is nearer than an older page with the type.
  docs = book(FLAT, [[["paragraph"]], [["verse", { later: true }]], [["verse", { from: true }]], [PARA_GOES_ON]]);
  [, warnings] = assemble(docs, FLAT);
  assert.deepEqual(warnings, ["page joins-page-004, flow main: open ends do not match (joins-page-003#u1, [joins-page-004#u1])"],
    "page 3's own verse, joined to page 2's");
  assert.deepEqual(continuation(docs, FLAT), [[], [], ["main continuation does not match the next page"], ["main continuation does not match the previous page"]]);
  // At the start of the book, or after a gap, an open start reports nothing: what it continues is not there.
  docs = book(FLAT, [PLATE, [PARA_GOES_ON]]);
  assert.deepEqual(assemble(docs, FLAT)[1], ["page joins-page-002, flow main: open ends do not match (joins-page-001#u2, [joins-page-002#u1])"],
    "a plate before it is still content of the flow");
  assert.deepEqual(assemble(record(FLAT, [null, ...docs.slice(1)]), FLAT)[1], []);
});

test("in chapters: a paragraph going on from earlier with nothing open before a plate names that page's paragraph", () => {
  // The chapter goes on across every page; inside it, page 1's paragraph does not go on, so page 3's open start has
  // nothing to join. The warning names page 1's paragraph (the nearest unit of its type), not the plate's caption.
  const docs = book(NESTED, [[["paragraph"]], PLATE, [PARA_GOES_ON]]);
  const [assembled, warnings] = assemble(docs, NESTED);
  const chapters = assembled.units.filter(unit => unit.type === "chapter");
  assert.equal(chapters.length, 1, "the chapter goes on across the plate");
  assert.deepEqual(chapters[0].children.map(child => assembled.units.find(unit => unit.id === child.unit).type), ["paragraph", "figure", "caption", "paragraph"]);
  const [warning] = warnings;
  assert.equal(warnings.length, 1);
  const named = /inner open ends do not match \(([^,]+), ([^)]+)\)/.exec(warning).slice(1).map(uid => assembled.units.find(unit => unit.id === uid));
  assert.deepEqual(named.map(unit => [unit.type, unit.children[0].region.split("#")[0]]), [["paragraph", "joins-page-001"], ["paragraph", "joins-page-003"]]);
  assert.ok(!warning.includes("joins-page-002"), "the plate is not named");
});

test("a region continued on its own page is not an open end: only a page's first and last regions in a flow are", () => {
  // As Kale's footnotes: on page 2 a paragraph goes on in the next region of the same page, which is joined there.
  const docs = book(FLAT, [[["paragraph"]], [["paragraph", { later: true }], ["paragraph", { from: true }], ["paragraph"]], [["paragraph"]]]);
  const [assembled, warnings] = assemble(docs, FLAT);
  assert.deepEqual(warnings, []);
  assert.deepEqual(spans(assembled), ["paragraph 1", "paragraph 2", "paragraph 2", "paragraph 3"], "page 2's first two regions are one paragraph");
  assert.equal(assembled.units.find(unit => unit.children.length === 2).children[1].region, "joins-page-002#r2");
  assert.deepEqual(continuation(docs, FLAT), [[], [], []]);
});

test("schema/book.py assembles every case here the same way", () => {
  const want = JSON.parse(execFileSync("uv", ["run", "--offline", "python", "webapp/test/py_reference.py", "assemble-cases"],
    { cwd: new URL("../..", import.meta.url).pathname, input: JSON.stringify(scenarios), maxBuffer: 1 << 28, encoding: "utf8" }));
  assert.equal(want.length, scenarios.length);
  assert.ok(scenarios.length >= 20);
  scenarios.forEach(({ types, docs }, k) => {
    const [assembled, warnings] = assemble(docs, types);
    assert.deepEqual({ units: assembled.units, flows: assembled.flows, warnings }, want[k], `case ${k}`);
  });
});
