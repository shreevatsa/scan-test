import { test } from "node:test";
import assert from "node:assert/strict";
import { pageRange, scanImage } from "../js/pipeline/pdf.js";

test("the page-range forms accept all pages and preserve explicit ranges", () => {
  const pages = Array.from({ length: 267 }, (_, index) => index + 1);
  for (const input of ["", "all", " ALL "]) assert.deepEqual(pageRange(input, 267), pages);
  assert.deepEqual(pageRange("1-3,5", 267), [1, 2, 3, 5]);
  assert.deepEqual(pageRange("1-50", 267), pages.slice(0, 50));
  assert.deepEqual(pageRange("266-", 267), [266, 267]);
  assert.deepEqual(pageRange("-2", 267), [1, 2]);
  assert.throws(() => pageRange("everything", 267), /not a page or a range/);
});

test("the scan is the sharpest image covering the page, not the first: an archive.org page's text layer, not its background", () => {
  const background = { pixels: [617, 1048], coverage: 1, dpi: 133.3 }, text = { pixels: [1852, 3146], coverage: 1, dpi: 400.1 };
  assert.equal(scanImage([background, text]), text);
  assert.equal(scanImage([text, background]), text);
  assert.equal(scanImage([{ pixels: [3000, 600], coverage: 0.2, dpi: 900 }, background]), background, "a small picture is not the scan");
  assert.equal(scanImage([{ pixels: [300, 300], coverage: 0.1, dpi: 300 }]), null);
});
