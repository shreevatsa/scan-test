// Sections from headings (heading-rules.js, rules.headings): a heading starts a section that runs to the next heading
// of the same or a higher level, across pages, and assembly joins its pieces.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readThroughBlocks } from "../js/reading.js";
import { assemble } from "../js/assemble.js";
import { bookRules, ruleProblems, headingDefaults } from "../js/rules.js";

const generic = JSON.parse(readFileSync(new URL("../types/generic.json", import.meta.url)));
const types = structuredClone(generic);
types.types.chapter_heading = { region: "heading", flow: "main", description: "A chapter's title" };
types.types.chapter = { flow: "main", contains: ["chapter_heading", "section", "heading", "paragraph"], description: "A chapter" };

// A page of blocks: [type, text] in reading order, each one line.
let n = 0;
const page = blocks => {
  const id = `book-page-${String(++n).padStart(3, "0")}`;
  return { format: "page", schema_version: "0.4", book_id: "book", overrides: {}, source: {},
    page: { id, width: 1000, height: 1400, regions: blocks.map(([type, text], i) => ({ id: `r${i + 1}`, type, order: i + 1,
      polygons: [[[100, 100 + i * 60], [900, 100 + i * 60], [900, 150 + i * 60], [100, 150 + i * 60]]], box: [100, 100 + i * 60, 900, 150 + i * 60],
      lines: [{ line: 1, text, polygons: [[[100, 100 + i * 60], [900, 100 + i * 60], [900, 150 + i * 60], [100, 150 + i * 60]]] }] })) } };
};
const read = (docs, rules) => {
  const derived = readThroughBlocks(docs, types, rules);
  const [book, warnings] = assemble(derived, types);
  const unit = id => book.units.find(value => value.id === id);
  const tree = id => { const u = unit(id); return u.children.some(c => c.unit) ? { [`${u.type}${u.label ? ` “${u.label}”` : ""}`]: u.children.map(c => c.unit ? tree(c.unit) : null).filter(Boolean) } : u.type; };
  return { tree: book.flows.main.map(tree), warnings };
};

test("a heading starts a section that runs across pages to the next heading", () => {
  const docs = [page([["paragraph", "Before any heading."], ["heading", "One"], ["paragraph", "a"]]),
    page([["paragraph", "b"], ["paragraph", "c"]]),
    page([["paragraph", "d"], ["heading", "Two"], ["paragraph", "e"]])];
  const { tree, warnings } = read(docs, { headings: [{ heading: "heading", container: "section" }] });
  assert.deepEqual(warnings, []);
  assert.deepEqual(tree, ["paragraph", { "section “One”": ["heading", "paragraph", "paragraph", "paragraph", "paragraph"] }, { "section “Two”": ["heading", "paragraph"] }]);
});

test("two levels: a chapter holds its sections, and a new chapter ends the open section", () => {
  const docs = [page([["chapter_heading", "I"], ["paragraph", "intro"], ["heading", "1.1"], ["paragraph", "a"]]),
    page([["paragraph", "b"], ["heading", "1.2"], ["paragraph", "c"]]),
    page([["chapter_heading", "II"], ["paragraph", "d"]])];
  const { tree, warnings } = read(docs, { headings: [{ heading: "chapter_heading", container: "chapter" }, { heading: "heading", container: "section" }] });
  assert.deepEqual(warnings, []);
  assert.deepEqual(tree, [{ "chapter “I”": ["chapter_heading", "paragraph", { "section “1.1”": ["heading", "paragraph", "paragraph"] }, { "section “1.2”": ["heading", "paragraph"] }] },
    { "chapter “II”": ["chapter_heading", "paragraph"] }]);
});

test("a page that is not there ends every open section; without the rule nothing is grouped", () => {
  const docs = [page([["heading", "One"], ["paragraph", "a"]]), null, page([["paragraph", "b"]])];
  assert.deepEqual(read(docs, { headings: [{ heading: "heading", container: "section" }] }).tree, [{ "section “One”": ["heading", "paragraph"] }, "paragraph"]);
  assert.deepEqual(read(docs, null).tree, ["heading", "paragraph", "paragraph"]);
});

test("the rule's settings: none by default, checked names, a default for a new book", () => {
  assert.deepEqual(bookRules(null).headings, []);
  assert.deepEqual(bookRules({ headings: [{ heading: " heading ", container: "section" }] }).headings, [{ heading: "heading", container: "section" }]);
  assert.equal(ruleProblems({ headings: [{ heading: "Heading!", container: "section" }] }).length, 1);
  assert.deepEqual(headingDefaults(generic), [{ heading: "heading", container: "section" }]);
  assert.deepEqual(headingDefaults({ types: { paragraph: { region: "paragraph" } } }), []);
});

test("a heading straight after its section's heading is a subtitle of that section", () => {
  const docs = [page([["heading", "Canto VI"], ["heading", "Peace is a reward"], ["paragraph", "a"], ["heading", "Canto VII"], ["paragraph", "b"]])];
  assert.deepEqual(read(docs, { headings: [{ heading: "heading", container: "section" }] }).tree,
    [{ "section “Canto VI”": ["heading", "heading", "paragraph"] }, { "section “Canto VII”": ["heading", "paragraph"] }]);
  const blankFirst = [page([["heading", ""], ["heading", "DRONA PARVA"], ["paragraph", "a"]])];
  assert.deepEqual(read(blankFirst, { headings: [{ heading: "heading", container: "section" }] }).tree, [{ "section “DRONA PARVA”": ["heading", "heading", "paragraph"] }],
    "a first heading with no text leaves the name to the next");
  const nested = [page([["chapter_heading", "I"], ["heading", "1.1"], ["paragraph", "a"]])];
  assert.deepEqual(read(nested, { headings: [{ heading: "chapter_heading", container: "chapter" }, { heading: "heading", container: "section" }] }).tree,
    [{ "chapter “I”": ["chapter_heading", { "section “1.1”": ["heading", "paragraph"] }] }], "a section opening a chapter is its own");
});
