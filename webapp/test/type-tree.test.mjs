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

const pairs = nodes => nodes.map(n => [n.name, n.count, ...(n.children.length ? [pairs(n.children)] : [])]);

test("a draft list with usage: used only at the top level appears once, as a child of the flow", () => {
  const { flows, furniture, unplaced } = typeForest(draft, counts);
  assert.deepEqual(pairs(flows[0].nodes), [["section", "0", [["list_item", "0"]]], ["heading", "6"], ["verse", "70"], ["section_closing", "1"]]);
  assert.deepEqual(pairs(flows[1].nodes), [["footnote", "17"]]);
  assert.deepEqual(unplaced, []);
  const [section, , verse] = flows[0].nodes;
  assert.equal(section.kind, "container");
  assert.deepEqual(section.notes, ["may contain itself"]);
  assert.equal(verse.multi, false);
  assert.equal(verse.zero, false);
  assert.equal(section.children[0].zero, true);
  assert.equal(flows[0].nodes[3].printedAs, "heading");
  assert.equal(flows[1].nodes[0].printedAs, "note");
  assert.deepEqual(furniture.map(n => [n.name, n.kind, n.count]), [["running_header", "furniture", "5 on the pages"]]);
});

test("a type used in two places appears twice, each with its own number", () => {
  const c = { n: counts.n, at: { ...counts.at, "section>heading": 4, "flow:main>heading": 6 } };
  const { flows } = typeForest(draft, c);
  assert.deepEqual(pairs(flows[0].nodes), [["section", "0", [["heading", "4"], ["list_item", "0"]]], ["heading", "6"], ["verse", "70"], ["section_closing", "1"]]);
  const [section, heading] = [flows[0].nodes[0], flows[0].nodes[1]];
  assert.equal(section.children[0].multi, true);
  assert.equal(heading.multi, true);
  assert.equal(flows[0].nodes[2].multi, false);
});

test("a type used only inside a container is not at the top level", () => {
  const { flows } = typeForest(draft, { n: {}, at: { "section>verse": 3 } });
  assert.deepEqual(pairs(flows[0].nodes), [["section", "0", [["heading", "0"], ["verse", "3"], ["list_item", "0"]]], ["section_closing", "0"]]);
});

test("a type used nowhere appears once, muted, at its first allowed place", () => {
  const { flows } = typeForest(draft, { n: {}, at: {} });
  assert.deepEqual(pairs(flows[0].nodes), [["section", "0", [["heading", "0"], ["verse", "0"], ["list_item", "0"]]], ["section_closing", "0"]]);
  assert.ok(flows[0].nodes[0].children.every(n => n.zero && !n.multi));
});

test("counts read … before they are known: the first allowed place only", () => {
  const { flows } = typeForest(draft, null);
  assert.deepEqual(pairs(flows[0].nodes), [["section", "…", [["heading", "…"], ["verse", "…"], ["list_item", "…"]]], ["section_closing", "…"]]);
});

test("nested containers: a type used inside a container inside a container", () => {
  const tl = { flows: { main: "" }, types: {
    chapter: { contains: ["section", "verse"], flow: "main" },
    section: { contains: ["verse", "paragraph"] },
    paragraph: { region: "paragraph" },
    verse: { region: "verse" },
    preface: { region: "paragraph", flow: "main" } } };
  const { flows } = typeForest(tl, { n: {}, at: { "chapter>verse": 3, "section>verse": 2, "section>paragraph": 5, "flow:main>preface": 1 } });
  assert.deepEqual(pairs(flows[0].nodes), [["chapter", "0", [["section", "0", [["paragraph", "5"], ["verse", "2"]]], ["verse", "3"]]], ["preface", "1"]]);
  assert.equal(flows[0].nodes[0].children[1].multi, true);
});

test("a container used inside itself is not expanded again; a used container stays at its own place with count 0", () => {
  const { flows } = typeForest(draft, { n: {}, at: { "section>section": 2, "section>verse": 1 } });
  const section = flows[0].nodes[0];
  assert.equal(section.count, "0");
  assert.deepEqual(pairs(section.children), [["section", "2"], ["heading", "0"], ["verse", "1"], ["list_item", "0"]]);
  assert.equal(section.children[0].children.length, 0);
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
