import { test } from "node:test";
import assert from "node:assert/strict";
import { pageRange } from "../js/pipeline/pdf.js";
import { pageSelectionText } from "../js/page-browser.js";

test("the page-range forms accept all pages and preserve explicit ranges", () => {
  const pages = Array.from({ length: 267 }, (_, index) => index + 1);
  for (const input of ["", "all", " ALL "]) assert.deepEqual(pageRange(input, 267), pages);
  assert.deepEqual(pageRange("1-3,5", 267), [1, 2, 3, 5]);
  assert.deepEqual(pageRange("1-50", 267), pages.slice(0, 50));
  assert.deepEqual(pageRange("266-", 267), [266, 267]);
  assert.deepEqual(pageRange("-2", 267), [1, 2]);
  assert.throws(() => pageRange("everything", 267), /not a page or a range/);
});

test("thumbnail choices round-trip through the sample page field, including all and empty selections", () => {
  assert.equal(pageSelectionText([], 267), "");
  assert.equal(pageSelectionText([7, 3, 2, 1, 7, 43, 44, 267], 267), "1-3, 7, 43-44, 267");
  const all = pageRange("all", 267);
  assert.equal(pageSelectionText(all, 267), "all");
  const selected = all.filter(page => page !== 25);
  assert.equal(pageSelectionText(selected, 267), "1-24, 26-267");
  assert.deepEqual(pageRange(pageSelectionText(selected, 267), 267), selected);
});
