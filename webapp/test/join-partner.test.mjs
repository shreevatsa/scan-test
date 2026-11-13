// Joining by hand across a page break finds the page that continues the unit, past pages with none of its kind of
// unit (a blank page, a plate), as assemble.js does. Run from the repository root:  node --test webapp/test/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { joinPartnerId } from "../js/editing.js";

const doc = (id, units, extra = {}) => ({ page: { id, regions: [] }, units, flows: { main: units.filter(u => u.top !== false).map(u => u.id) }, source: {}, ...extra });
const unit = (id, type, open = null) => ({ id, type, children: [{ region: `${id}-r` }], ...(open ? { open } : {}) });
const pages = ids => ids.map((id, i) => ({ id, pdf_page: i + 1 }));

test("the partner is the next page, or the first later page with a unit of the same kind", async () => {
  const docs = {
    a: doc("a", [unit("u1", "paragraph", { end: true })]),
    blank: doc("blank", []),
    plate: doc("plate", [unit("f", "figure"), unit("c", "caption")]),
    b: doc("b", [unit("u2", "paragraph", { start: true })]),
  };
  const docOf = id => docs[id];
  assert.equal(await joinPartnerId(pages(["a", "b"]), 0, docs.a, "u1", docOf), "b");
  assert.equal(await joinPartnerId(pages(["a", "blank", "b"]), 0, docs.a, "u1", docOf), "b", "past a blank page");
  assert.equal(await joinPartnerId(pages(["a", "plate", "b"]), 0, docs.a, "u1", docOf), "b", "past a plate with its caption");
  assert.equal(await joinPartnerId(pages(["a", "blank", "plate", "b"]), 0, docs.a, "u1", docOf), "b", "past several");
});

test("a page with its own unit of the kind, or an open end, is where the search stops", async () => {
  const docs = {
    a: doc("a", [unit("u1", "paragraph", { end: true })]),
    prose: doc("prose", [unit("p", "paragraph")]),
    open: doc("open", [unit("v", "verse", { end: true })]),
    b: doc("b", [unit("u2", "paragraph", { start: true })]),
  };
  const docOf = id => docs[id];
  assert.equal(await joinPartnerId(pages(["a", "prose", "b"]), 0, docs.a, "u1", docOf), "prose", "the page's own paragraph is the partner (and will not match)");
  assert.equal(await joinPartnerId(pages(["a", "open", "b"]), 0, docs.a, "u1", docOf), "open", "a page with an open end of its own is not looked past");
});

test("it stops at the end of the book, a gap in the PDF's pages, a sample break, and says when a page has no document", async () => {
  const docs = { a: doc("a", [unit("u1", "paragraph", { end: true })]), blank: doc("blank", []), b: doc("b", [unit("u2", "paragraph", { start: true })]) };
  const docOf = id => docs[id];
  assert.equal(await joinPartnerId(pages(["a"]), 0, docs.a, "u1", docOf), null, "the last page");
  const gap = [{ id: "a", pdf_page: 1 }, { id: "blank", pdf_page: 2 }, { id: "b", pdf_page: 4 }];
  assert.equal(await joinPartnerId(gap, 0, docs.a, "u1", docOf), null, "a PDF page is missing between");
  const broken = { ...docs.a, source: { sample: { consecutive_next: false } } };
  assert.equal(await joinPartnerId(pages(["a", "b"]), 0, broken, "u1", docOf), null, "a break between sample pages");
  assert.equal(await joinPartnerId(pages(["a", "unprocessed", "b"]), 0, docs.a, "u1", id => docs[id]), "missing");
  assert.equal(await joinPartnerId(pages(["a", "blank", "b"]), 0, docs.a, "u1", async id => docs[id]), "b", "a promise-returning docOf works too");
});
