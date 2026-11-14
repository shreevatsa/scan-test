import test from "node:test";
import assert from "node:assert/strict";
import { sectionKeys, groupPage } from "../tools/chaya_sections.mjs";

const page = (id, types) => ({ page: { id, regions: [] }, units: types.map((type, index) => ({ id: `u${index + 1}`, type, children: [] })), flows: { main: types.map((_, index) => `u${index + 1}`) } });
const textOf = (doc, unit) => unit.text || "";
const part = /कथासारे/;
const run = pages => {
  const items = sectionKeys(pages, { closing: "section_closing", partClosing: part, textOf });
  return pages.map((doc, index) => {
    const mine = items.filter(item => item.pageIndex === index);
    const previous = [...items.slice(0, items.indexOf(mine[0]))].reverse().find(item => item.pageIndex < index) || null;
    const after = items[items.indexOf(mine.at(-1)) + 1] || null;
    groupPage(doc, mine, previous, after);
    return doc;
  });
};
const tree = (doc, id) => { const unit = doc.units.find(value => value.id === id); return unit.type === "section" ? [unit.type, unit.open || null, unit.children.map(child => tree(doc, child.unit))] : unit.type; };

test("episodes end at closing lines and a part-closing line ends the part around them", () => {
  const a = page("a", ["heading", "verse", "verse", "section_closing", "verse"]);
  const b = page("b", ["verse", "section_closing", "verse", "section_closing", "section_closing"]);
  a.units.find(unit => unit.id === "u4").text = "इति रामः॥"; b.units.find(unit => unit.id === "u5").text = "कथासारे समाप्ता";
  run([a, b]);
  assert.equal(a.flows.main.length, 1, "from the top of the page where the verses begin, a heading there joins the first episode");
  const partA = tree(a, a.flows.main[0]);
  assert.deepEqual(partA[1], { start: false, end: true });
  const [first, second] = partA[2];
  assert.equal(first[0], "section"); assert.equal(first[1], null);
  assert.deepEqual(first[2], ["heading", "verse", "verse", "section_closing"]);
  assert.deepEqual(second[1], { start: false, end: true });   // the verse after the closing starts an episode that goes on to page b
  const partB = tree(b, b.flows.main[0]);
  assert.deepEqual(partB[1], { start: true, end: false });
  assert.deepEqual(partB[2][0][1], { start: true, end: false });
  assert.equal(partB[2].at(-1), "section_closing", "the part-closing line stays in the part, outside the episodes");
});

test("nothing before the first verse or after the last closing is grouped", () => {
  const a = page("a", ["heading", "paragraph"]);
  const b = page("b", ["verse", "section_closing", "toc_item"]);
  run([a, b]);
  assert.equal(a.flows.main.length, 2);
  assert.equal(a.units.filter(unit => unit.type === "section").length, 0);
  assert.equal(b.flows.main.length, 2);
  assert.equal(b.flows.main.at(-1), "u3");
});
