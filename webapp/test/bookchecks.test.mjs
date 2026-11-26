import { test } from "node:test";
import assert from "node:assert/strict";
import { areaTitle, checksFor, existingProposedType, pageCaption } from "../js/bookchecks.js";

test("checks resolve against the live book while skipped and ignored regions stay out", () => {
  const book = { types: { paragraph: {}, footnote: { flow: "notes" }, stamp: { ignored: true } }, pages: [
    { regions: [
      { id: "a", type: "?", proposed: "caption" },
      { id: "b", type: "paragraph", uncertain: true, lines: [{}, { text: "", spans: [
        { kind: "note_marker", marker: "1", to: "2/n" },
        { kind: "note_marker", marker: "2", to: "3/n" },
      ] }] },
      { id: "c", type: "stamp", lines: [{}] },
      { id: "d", type: "?", ignored: true },
    ] },
    { regions: [{ id: "n", type: "footnote", lines: [{ text: "A note" }] }, { id: "u", type: "footnote" }] },
    { skip: true, regions: [{ id: "n", type: "footnote" }] },
  ] };
  const results = checksFor(book);
  assert.deepEqual(results[0].map(({ kind, address, line }) => [kind, address, line]),
    [["type", "1/a", undefined], ["uncertain", "1/b", undefined], ["unread", "1/b", 0], ["marker", "1/b", 1]]);
  assert.deepEqual(results[1].map(({ kind, address }) => [kind, address]), [["note", "2/u"]]);
  assert.deepEqual(results[2], []);
});

test("book view labels use printed page numbers and plain type decisions", () => {
  assert.equal(pageCaption({ label: "137", pdf_page: 139 }), "p. 137 · PDF page 139");
  assert.equal(pageCaption({ pdf_page: 8 }), "PDF page 8");
  assert.equal(areaTitle({}), "Needs a type");
  assert.equal(areaTitle({ proposed: "ownership_stamp" }), "May be a new type: ownership stamp");
});

test("a repeated proposal suggests the type as soon as it exists in the book", () => {
  const region = { id: "b", type: "?", proposed: "byline" };
  const pages = [{ regions: [region] }];
  assert.equal(checksFor({ types: {}, pages })[0][0].title, "May be a new type: byline");
  const types = { byline: {} };
  assert.equal(existingProposedType(region, types), "byline");
  assert.equal(checksFor({ types, pages })[0][0].title, "Suggested type: Byline");
  assert.equal(region.type, "?");
  assert.equal(existingProposedType({ proposed: "Byline" }, types), "byline");
  assert.equal(existingProposedType({ proposed: "BYLINE" }, { Byline: {}, byline: {} }), undefined);
});
