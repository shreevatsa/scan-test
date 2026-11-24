// Two-page spreads (a scan of an open book): where the app cuts one into its pages (pdf.js foldOf), and which pages
// follow each other in the PDF for joining text across them (pdfFollows).
import { test } from "node:test";
import assert from "node:assert/strict";
import { foldOf, pdfFollows } from "../js/pipeline/pdf.js";

// An image W × H, white, with "text" (alternating dark and light rows) in the given column ranges, and a grey shadow.
function image(W, H, textColumns, shadow = []) {
  const data = new Uint8ClampedArray(W * H * 4).fill(255);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    let v = 255;
    if (textColumns.some(([a, b]) => x >= a && x < b) && y % 4 < 2 && y > 10 && y < H - 10) v = 20;
    else if (shadow.some(([a, b]) => x >= a && x < b)) v = 150 + ((x + y) % 3);
    data[i] = data[i + 1] = data[i + 2] = v;
  }
  return { width: W, height: H, data };
}

test("a spread is cut at the middle when that is clear of text, else in the clear band nearest it", () => {
  assert.equal(foldOf(image(200, 120, [[20, 90], [110, 180]], [[98, 102]])), 0.5);
  const offCentre = foldOf(image(200, 120, [[10, 108], [122, 190]]));
  assert.ok(offCentre > 0.54 && offCentre < 0.61, `cut in the band 108–122, not through text: ${offCentre}`);
});

test("a page with text across its middle is no spread; a blank page has nothing to cut by", () => {
  assert.equal(foldOf(image(200, 120, [[20, 180]])), null);
  assert.equal(foldOf(image(200, 120, [])), null);
});

test("pages follow each other in the PDF: one apart, or the two sides of a spread", () => {
  const page = (pdf_page, pdf_part) => ({ pdf_page, ...(pdf_part ? { pdf_part } : {}) });
  assert.equal(pdfFollows(page(4), page(5), 1), true);
  assert.equal(pdfFollows(page(4), page(6), 1), false, "a gap in the PDF");
  assert.equal(pdfFollows(page(4, [0, 0.5]), page(4, [0.5, 1]), 1), true, "left side, then right");
  assert.equal(pdfFollows(page(4, [0.5, 1]), page(5, [0, 0.48]), 1), true, "right side, then the next spread's left");
  assert.equal(pdfFollows(page(5, [0, 0.48]), page(4, [0.5, 1]), -1), true, "and back");
  assert.equal(pdfFollows(page(4, [0.5, 1]), page(4, [0, 0.5]), 1), false, "not backwards");
  assert.equal(pdfFollows({}, page(9), 1), true, "a page with no PDF page");
});
