import test from "node:test";
import assert from "node:assert/strict";
import { typeTreeRows } from "../js/type-tree.js";

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

test("each type once per flow, containers first, with where and counts", () => {
  const { flows, furniture } = typeTreeRows(draft, counts);
  const main = flows[0].rows;
  assert.deepEqual(main.map(r => r.name), ["section", "heading", "verse", "list_item", "section_closing"]);
  assert.equal(main[0].kind, "container");
  assert.deepEqual(main[0].holdsShown, ["section", "heading", "verse", "list_item"]);
  assert.equal(main[0].count, "0");
  const verse = main[2];
  assert.equal(verse.printedAs, "");
  assert.equal(verse.where, "at top level or in a section");
  assert.equal(verse.count, "70 at top level · 0 in sections");
  assert.equal(main[3].where, "in a section");
  assert.equal(main[3].count, "0");
  assert.equal(main[4].printedAs, "heading");
  assert.equal(main[4].where, "");
  assert.equal(main[4].count, "1");
  assert.equal(flows[1].rows[0].printedAs, "note");
  assert.equal(flows[1].rows[0].count, "17");
  assert.deepEqual(furniture.map(r => [r.name, r.count]), [["running_header", "5 on the pages"]]);
});

test("a self-containing container is not repeated; counts read … before they are known", () => {
  const { flows } = typeTreeRows(draft, null);
  assert.equal(flows[0].rows.filter(r => r.name === "section").length, 1);
  assert.equal(flows[0].rows[1].count, "… at top level · … in sections");
});

test("a type that sits in two containers names both", () => {
  const tl = { flows: { main: "" }, types: { chapter: { contains: ["verse"], flow: "main" }, section: { contains: ["verse"] }, verse: { region: "verse" } } };
  const { flows } = typeTreeRows(tl, { n: {}, at: { "chapter>verse": 3, "section>verse": 2 } });
  const verse = flows[0].rows.find(r => r.name === "verse");
  assert.equal(verse.where, "in a chapter or section");
  assert.equal(verse.count, "3 in chapters · 2 in sections");
});
