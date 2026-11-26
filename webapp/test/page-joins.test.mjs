import { test } from "node:test";
import assert from "node:assert/strict";
import { assemble, setContinues } from "../js/book.js";
import { findStructure } from "../js/book-structure.js";

const types = { paragraph: {}, verse: { lines: true }, figure: { figure: true },
  caption: {}, chapter: { contains: ["paragraph", "verse", "figure", "caption"] },
  page_number: { ignored: true } };
const box = [0.12, 0.15, 0.8, 0.2];
const r = (id, type, text, extras = {}) => ({ id, type, box, lines: text == null ? [] : [{ text }], ...extras });
const page = (pdf_page, regions) => ({ pdf_page, size: [1000, 1400], ...(regions ? { regions } : {}) });
const draft = pages => ({ chaya: 1, title: "A book", types, rules: { captions: ["caption"] }, pages });
const itemsOf = book => assemble(book).book.units.filter(u => u.type === "paragraph").map(u => u.children.map(c => c.region));

for (const nested of [false, true]) {
  const inside = nested ? { in: ["chapter"] } : {};
  const book = pages => ({ ...draft(pages), ...(nested ? { containers: { chapter: { type: "chapter" } } } : {}) });
  const start = page(1, [r("a", "paragraph", "A start", { ...inside, continues: true })]);
  const end = n => page(n, [r("b", "paragraph", "Its end.", inside)]);
  const plate = n => page(n, [r("plate", "figure", null, inside), r("caption", "caption", "Plate A", inside)]);
  for (const [name, between] of [
    ["a blank page", [page(2, [])]],
    ["a plate and its caption", [plate(2)]],
    ["a blank, a suppressed duplicate and a plate", [page(2, []), { ...page(3, []), skip: true }, plate(4)]],
    ["a page of quoted verse", [page(2, [r("quote", "verse", "A quotation.", inside)])]],
  ]) {
    test(`${nested ? "In a chapter" : "In the main flow"}, a continuation passes ${name}`, () => {
      const last = between.length + 2;
      assert.deepEqual(itemsOf(book([start, ...between, end(last)])), [[`1#a`, `${last}#b`]]);
    });
  }

  test(`${nested ? "In a chapter" : "In the main flow"}, an unprocessed page breaks the join`, () => {
    assert.deepEqual(itemsOf(book([start, page(2), end(3)])), [["1#a"], ["3#b"]]);
  });

  test(`${nested ? "In a chapter" : "In the main flow"}, an unmatched start cannot consume an earlier continuation`, () => {
    const later = page(3, [r("b", "paragraph", "Its own start.", { ...inside, from_previous: true })]);
    assert.deepEqual(itemsOf(book([start, plate(2), later])), [["1#a"], ["3#b"]]);
    assert.equal(assemble(book([start, plate(2), later])).book.units.find(u => u.type === "paragraph").open.end, true);
  });
}

test("a continuation label is stored once and stops joining when an editor turns it off", () => {
  const book = draft([page(1, [r("a", "paragraph", "Start")]), page(2, [r("b", "paragraph", "End.")])]);
  const joined = setContinues(book, "1/a", true);
  assert.equal(joined.pages[1].regions[0].from_previous, undefined);
  assert.deepEqual(itemsOf(joined), [["1#a", "2#b"]]);
  assert.deepEqual(itemsOf(setContinues(joined, "1/a", false)), [["1#a"], ["2#b"]]);
});

test("structure rules settle a one-sided continuation across a suppressed duplicate", () => {
  const book = draft([page(1, [r("a", "paragraph", "A sentence")]), { ...page(2, []), skip: true }, page(3, [
    r("b", "paragraph", "that is completed here."),
  ])]);
  const hints = new Map([["1", { a: { to: true } }]]);
  const made = findStructure(book, hints);
  assert.deepEqual(itemsOf(made), [["1#a", "3#b"]]);
  assert.equal(made.pages[0].regions[0].continues, true);
  assert.equal(made.pages[2].regions[0].from_previous, undefined);
});
