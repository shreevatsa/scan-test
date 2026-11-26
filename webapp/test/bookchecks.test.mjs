import { test } from "node:test";
import assert from "node:assert/strict";
import { checksFor } from "../js/bookchecks.js";

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
