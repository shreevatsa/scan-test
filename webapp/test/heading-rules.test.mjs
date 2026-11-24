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

test("with one heading level and a printed contents, the headings it names are chapters and the others their sections", () => {
  const contents = page([["heading", "Contents"], ["list_item", "1. Preface vii"], ["list_item", "2. Yoga 1-31"], ["list_item", "3. Naadi 32-68"], ["list_item", "4. Appendix 69-70"]]);
  const docs = [contents, page([["heading", "Preface"], ["paragraph", "p"], ["heading", "Yoga"], ["paragraph", "a"], ["heading", "Asana"], ["paragraph", "b"]]),
    page([["paragraph", "c"], ["heading", "Pranayama"], ["paragraph", "d"], ["heading", "Naadi - 2"], ["heading", "Naadi vishaya"], ["paragraph", "e"]])];
  const { tree } = read(docs, { headings: [{ heading: "heading", container: "section" }] });
  assert.deepEqual(tree, [{ "section “Contents”": ["heading", "list_item", "list_item", "list_item", "list_item"] },
    { "section “Preface”": ["heading", "paragraph"] },
    { "section “Yoga”": ["heading", "paragraph", { "section “Asana”": ["heading", "paragraph", "paragraph"] }, { "section “Pranayama”": ["heading", "paragraph"] }] },
    { "section “Naadi - 2”": ["heading", { "section “Naadi vishaya”": ["heading", "paragraph"] }] }]);
});

test("contents that group their entries under headings: those name the chapters, the entries their sections", () => {
  const contents = page([["heading", "Contents"], ["heading", "CANTO 1"], ["list_item", "Arjuna hesitates . . . 1–47"], ["list_item", "Krishna replies . . . 48–60"],
    ["heading", "CANTO 2"], ["list_item", "Why work at all? . . . 1, 2"], ["list_item", "Necessity of sacrifice . . . 8–16"]]);
  const docs = [contents, page([["heading", "CANTO I"], ["heading", "Arjuna hesitates"], ["paragraph", "a"], ["heading", "Krishna replies"], ["paragraph", "b"]]),
    page([["heading", "CANTO II"], ["paragraph", "c"]])];
  const { tree } = read(docs, { headings: [{ heading: "heading", container: "section" }] });
  assert.deepEqual(tree, [{ "section “Contents”": ["heading", "heading", "list_item", "list_item", "heading", "list_item", "list_item"] },
    { "section “CANTO I”": ["heading", { "section “Arjuna hesitates”": ["heading", "paragraph"] }, { "section “Krishna replies”": ["heading", "paragraph"] }] },
    { "section “CANTO II”": ["heading", "paragraph"] }], "the contents' own headings start no section; a canto holds its sections");
});

test("a contents' column header typed as a heading groups nothing: the entries name the chapters", () => {
  const contents = page([["heading", "Contents"], ["heading", "Page"], ["list_item", "The river . . . 1"], ["list_item", "The hill . . . 3"],
    ["list_item", "The town . . . 5"], ["heading", "Appendix"], ["list_item", "Notes . . . 7"]]);
  const docs = [contents, page([["heading", "The river"], ["paragraph", "a"], ["heading", "Its source"], ["paragraph", "b"]]),
    page([["heading", "The hill"], ["paragraph", "c"], ["heading", "The climb"], ["paragraph", "d"]])];
  const { tree } = read(docs, { headings: [{ heading: "heading", container: "section" }] });
  assert.deepEqual(tree.slice(1), [{ "section “The river”": ["heading", "paragraph", { "section “Its source”": ["heading", "paragraph"] }] },
    { "section “The hill”": ["heading", "paragraph", { "section “The climb”": ["heading", "paragraph"] }] }]);
});

test("a heading whose text recurs (a label before each verse's explanation) starts no section", () => {
  const docs = [page([["heading", "Canto I"], ["verse", "a"], ["heading", "Purport."], ["paragraph", "b"]]),
    page([["verse", "c"], ["heading", "Purport"], ["paragraph", "d"]]), page([["heading", "Canto II"], ["verse", "e"], ["heading", "PURPORT."], ["paragraph", "f"]])];
  const { tree } = read(docs, { headings: [{ heading: "heading", container: "section" }] });
  assert.deepEqual(tree, [{ "section “Canto I”": ["heading", "verse", "heading", "paragraph", "verse", "heading", "paragraph"] },
    { "section “Canto II”": ["heading", "verse", "heading", "paragraph"] }]);
});

test("a section's title printed again while it is open (a running header typed as a heading) starts no new section", () => {
  const docs = [page([["heading", "Pulse"], ["paragraph", "a"]]), page([["heading", "Pulse"], ["paragraph", "b"], ["heading", "Diet"], ["paragraph", "c"]])];
  const { tree } = read(docs, { headings: [{ heading: "heading", container: "section" }] });
  assert.deepEqual(tree, [{ "section “Pulse”": ["heading", "paragraph", "heading", "paragraph"] }, { "section “Diet”": ["heading", "paragraph"] }]);
});

test("a page its heading calls the contents is the contents, though its numbers were not read; a broken title still names its heading", () => {
  // Entries without their page numbers; the first chapter's title printed on two lines of which the heading has the
  // first ("The Old Grey -"), the second's the second ("High Hill Fort", "The" lost).
  const contents = page([["heading", "CONTENTS"], ["list_item", "The Old Grey River"], ["list_item", "The High Hill Fort"], ["list_item", "The Town"]]);
  const docs = [contents, page([["heading", "The Old Grey -"], ["paragraph", "a"], ["heading", "Its source"], ["paragraph", "b"]]),
    page([["heading", "High Hill Fort"], ["paragraph", "c"], ["heading", "The climb"], ["paragraph", "d"]]), page([["heading", "The Town"], ["paragraph", "e"]])];
  const { tree } = read(docs, { headings: [{ heading: "heading", container: "section" }] });
  assert.deepEqual(tree.slice(1).map(entry => Object.keys(entry)[0]), ["section “The Old Grey -”", "section “High Hill Fort”", "section “The Town”"]);
  assert.deepEqual(tree[1]["section “The Old Grey -”"].at(-1), { "section “Its source”": ["heading", "paragraph"] });
});

test("contents that name few of the book's headings (in another language) are not used; a list at the back is not the contents", () => {
  const english = page([["heading", "CONTENTS."], ["list_item", "Preface . . 1"], ["list_item", "The Text . . 5"], ["list_item", "Notes . . 9"], ["list_item", "Index . . 12"]]);
  const docs = [english, page([["heading", "Preface"], ["paragraph", "a"]]), page([["heading", "अथ ग्रन्थः"], ["paragraph", "b"], ["heading", "प्रथमः"], ["paragraph", "c"]])];
  const { tree } = read(docs, { headings: [{ heading: "heading", container: "section" }] });
  assert.deepEqual(tree.slice(1).map(entry => Object.keys(entry)[0]), ["section “Preface”", "section “अथ ग्रन्थः”", "section “प्रथमः”"], "each heading its own section");
  // Contents at the front, and at the back a list of every subheading with its page: the subheadings stay sections.
  const front = page([["heading", "Contents"], ["list_item", "First talk . . 2"], ["list_item", "Second talk . . 4"], ["list_item", "Third talk . . 6"], ["list_item", "Fourth talk . . 8"]]);
  const body = [["First talk", "On rivers"], ["Second talk", "On hills"], ["Third talk", "On towns"], ["Fourth talk", "On roads"]]
    .flatMap(([talk, part]) => [page([["heading", talk], ["paragraph", "x"]]), page([["heading", part], ["paragraph", "y"]])]);
  const back = page([["heading", "Subheadings"], ["list_item", "On rivers . . 3"], ["list_item", "On hills . . 5"], ["list_item", "On towns . . 7"], ["list_item", "On roads . . 9"]]);
  const more = read([front, ...body, back], { headings: [{ heading: "heading", container: "section" }] }).tree;
  assert.deepEqual(more.slice(1, 5).map(entry => Object.keys(entry)[0]), ["section “First talk”", "section “Second talk”", "section “Third talk”", "section “Fourth talk”"]);
  assert.deepEqual(more[1]["section “First talk”"].at(-1), { "section “On rivers”": ["heading", "paragraph"] });
});

test("chapters come in the contents' order: an appendix repeating the chapters' titles holds them as its sections", () => {
  // The contents: three chapters, then a heading grouping the appendix's entry; the appendix lists the chapters' titles.
  const contents = page([["heading", "Contents"], ["list_item", "The River . . 2"], ["list_item", "The Hill . . 3"], ["list_item", "The Town . . 4"],
    ["heading", "Appendix"], ["list_item", "Verses quoted . . 5"]]);
  const docs = [contents, page([["heading", "The River"], ["paragraph", "a"]]), page([["heading", "The Hill"], ["paragraph", "b"]]),
    page([["heading", "The Town"], ["paragraph", "c"]]), page([["heading", "Appendix"], ["heading", "The River"], ["list_item", "x"], ["heading", "The Hill"], ["list_item", "y"]])];
  const { tree } = read(docs, { headings: [{ heading: "heading", container: "section" }] });
  assert.deepEqual(tree.slice(1).map(entry => Object.keys(entry)[0]), ["section “The River”", "section “The Hill”", "section “The Town”", "section “Appendix”"]);
  assert.deepEqual(tree[4]["section “Appendix”"].slice(1).map(entry => Object.keys(entry)[0]), ["section “The River”", "section “The Hill”"]);
});
