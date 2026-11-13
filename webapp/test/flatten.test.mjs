import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { flattenGray, analyzePage, ROLE } from "../js/local/ink.js";
import { LINES } from "../js/local/config.js";

const { paper_percentile, weak_minimum_gap, flatten_percentile, flatten_floor, flatten_block_divisor, flatten_minimum_block, flatten_sample_step, ...rest } = LINES;
const LINES_093 = { ...rest, paper_percentile, weak_minimum_gap };

test("flattenGray equals the Python result on the shared fixture (methods/094-.../flatten-fixture.json)", () => {
  const f = JSON.parse(readFileSync(new URL("../../methods/094-illumination-flattened-ink/flatten-fixture.json", import.meta.url), "utf8"));
  const flat = flattenGray(Uint8Array.from(f.gray), f.width, f.height, LINES);
  assert.deepEqual([...flat], f.flat);
});

// Rows of glyph-like rectangles; `right` is the x where the last glyph of each row ends.
function page(paper, ink, { W = 600, H = 600, glyphs = 8, band = 0, bandGray = 90 } = {}) {
  const gray = new Uint8Array(W * H).fill(paper);
  if (band) for (let y = 0; y < H; y++) gray.fill(bandGray, y * W + W - band, (y + 1) * W);
  for (const y of [20, 70, 120, 170, 220, 270, 320, 370, 420, 470])
    for (let i = 0; i < glyphs; i++) for (let r = y; r < y + 22; r++) gray.fill(ink, r * W + 20 + i * 22, r * W + 36 + i * 22);
  return { W, H, gray };
}

function textPixels(a, x0) {
  let n = 0;
  for (let y = 0; y < a.comp.H; y++) for (let x = x0; x < a.comp.W; x++) { const k = a.comp.labels[y * a.comp.W + x]; if (k && a.comp.role[k] === ROLE.text) n++; }
  return n;
}

test("white paper without shading comes out unchanged and gives the same lines", () => {
  const { W, H, gray } = page(255, 0);
  const flat = flattenGray(gray, W, H, LINES);
  assert.deepEqual([...flat], [...gray]);   // measured: largest absolute difference is 0 on pure white paper
  const a = analyzePage(gray, W, H, LINES_093), b = analyzePage(gray, W, H, LINES);
  assert.equal(a.status, "ok"); assert.equal(b.status, "ok");
  assert.equal(b.seg.lines.length, a.seg.lines.length);
  assert.deepEqual([...b.comp.labels], [...a.comp.labels]);
});

test("near-white paper with mild noise moves by at most 1 gray level", () => {
  const { W, H, gray } = page(250, 20);
  for (let i = 0; i < gray.length; i++) if (gray[i] === 250) gray[i] = 250 + ((i * 7919) % 6);   // 250..255, 255 is the 90th percentile
  const flat = flattenGray(gray, W, H, LINES);
  let worst = 0;
  for (let i = 0; i < gray.length; i++) worst = Math.max(worst, Math.abs(flat[i] - gray[i]));
  assert.ok(worst <= 1, `largest difference ${worst}`);
});

test("a dark band along the right edge no longer swallows the line ends", () => {
  // paper 215, text 40, a 150-column band of gray 110 along the right edge; the glyphs of each line run into the band.
  // (A band of gray 90 flattens only to 194 because the background estimate is floored at 0.55 of the paper level, 118,
  // and stays below the weak threshold 203, so the rule does not rescue such a band: see the NOTEBOOK entry.)
  const { W, H, gray } = page(215, 40, { glyphs: 26, band: 150, bandGray: 110 });
  const a = analyzePage(gray, W, H, LINES_093), b = analyzePage(gray, W, H, LINES);
  assert.equal(a.status, "ok"); assert.equal(b.status, "ok");
  const x0 = W - 150;
  // Under 093 the band joins the line ends into one large component, which is dropped (not text); under 094 they stay text.
  assert.equal(textPixels(a, x0), 0, "093 keeps no text in the band columns");
  assert.ok(textPixels(b, x0) > 0, "094 keeps the line ends as text");
  assert.ok(textPixels(b, 0) > textPixels(a, 0), "094 keeps more text overall");
});
