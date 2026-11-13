import test from "node:test";
import assert from "node:assert/strict";
import { typeForest } from "../js/type-tree.js";

const shape = nodes => nodes.map(n => n.children.length ? [n.name, shape(n.children)] : n.name);
const all = nodes => nodes.flatMap(n => [n.name, ...all(n.children)]);

const draft = {
  flows: { main: "The book's running text.", notes: "Footnotes." },
  types: {
    section: { contains: ["section", "heading", "verse", "list_item"], flow: "main" },
    heading: { region: "heading", flow: "main" },
    verse: { region: "verse", flow: "main" },
    list_item: { region: "list_item" },
    section_closing: { region: "heading", flow: "main" },
    footnote: { region: "note", flow: "notes" },
    running_header: { region: "running_header", role: "furniture" },
  },
};
const counts = { n: { section: 0, heading: 6, verse: 70, section_closing: 1, footnote: 17, running_header: 5 },
  at: { "flow:main>heading": 6, "flow:main>verse": 70, "flow:main>section_closing": 1, "flow:notes>footnote": 17 } };

test("a draft list: section holds the others, each type once, with notes and counts", () => {
  const { flows, furniture, unplaced } = typeForest(draft, counts);
  assert.deepEqual(shape(flows[0].nodes), [["section", ["heading", "verse", "list_item"]], "section_closing"]);
  assert.deepEqual(shape(flows[1].nodes), ["footnote"]);
  assert.deepEqual(unplaced, []);
  assert.deepEqual(all([...flows.flatMap(f => f.nodes), ...furniture]).sort(), Object.keys(draft.types).sort());
  const [section] = flows[0].nodes;
  assert.equal(section.kind, "container");
  assert.deepEqual(section.notes, ["may contain itself"]);
  assert.equal(section.count, "0");
  const [heading, verse, item] = section.children;
  assert.deepEqual(verse.notes, ["also at top level"]);
  assert.equal(verse.count, "70 at top level · 0 in sections");
  assert.equal(heading.printedAs, "");
  assert.deepEqual(item.notes, []);
  assert.equal(item.count, "0");
  const closing = flows[0].nodes[1];
  assert.equal(closing.printedAs, "heading");
  assert.deepEqual(closing.notes, []);
  assert.equal(closing.count, "1");
  assert.equal(flows[1].nodes[0].printedAs, "note");
  assert.deepEqual(furniture.map(n => [n.name, n.kind, n.count]), [["running_header", "furniture", "5 on the pages"]]);
});

test("counts read … before they are known", () => {
  const { flows } = typeForest(draft, null);
  assert.equal(flows[0].nodes[0].children[1].count, "… at top level · … in sections");
});

test("nested containers and a type held by two containers appears once, under the first", () => {
  const tl = { flows: { main: "" }, types: {
    chapter: { contains: ["section", "verse"], flow: "main" },
    section: { contains: ["verse", "paragraph"] },
    paragraph: { region: "paragraph" },
    verse: { region: "verse" },
    preface: { region: "paragraph", flow: "main" } } };
  const { flows } = typeForest(tl, { n: {}, at: { "chapter>verse": 3, "section>verse": 2 } });
  assert.deepEqual(shape(flows[0].nodes), [["chapter", [["section", ["paragraph"]], "verse"]], "preface"]);
  const verse = flows[0].nodes[0].children[1];
  assert.deepEqual(verse.notes, ["also in a section"]);
  assert.equal(verse.count, "3 in chapters · 2 in sections");
  assert.equal(all(flows[0].nodes).length, 5);
});

test("containers that hold each other: the first in the list is the parent", () => {
  const tl = { flows: { main: "" }, types: {
    a: { contains: ["b", "x"], flow: "main" }, b: { contains: ["a", "x"] }, x: { region: "paragraph" } } };
  const { flows, unplaced } = typeForest(tl);
  assert.deepEqual(shape(flows[0].nodes), [["a", ["b", "x"]]]);
  assert.deepEqual(unplaced, []);
});

test("furniture and unplaced types; a type with no holder sits under its flow", () => {
  const tl = { flows: { main: "" }, types: { page_number: { region: "page_number", role: "furniture" }, loose: { region: "paragraph" }, para: { region: "paragraph", flow: "main" } } };
  const { flows, furniture, unplaced } = typeForest(tl);
  assert.deepEqual(shape(flows[0].nodes), ["para"]);
  assert.deepEqual(shape(furniture), ["page_number"]);
  assert.deepEqual(shape(unplaced), ["loose"]);
});

test("needs a class is carried on the node", () => {
  const { flows } = typeForest({ flows: { main: "" }, types: { odd: { region: "other", flow: "main" } } });
  assert.equal(flows[0].nodes[0].needsClass, true);
});
