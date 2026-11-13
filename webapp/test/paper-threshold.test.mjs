import { test } from "node:test";
import assert from "node:assert/strict";
import { inkComponents, segmentLines, paperLevel, analyzePage } from "../js/local/ink.js";
import { LINES as LINES_094, LEGACY_LINES } from "../js/local/config.js";

// Method 093's settings: the current ones without method 094's illumination flattening.
const LINES = Object.fromEntries(Object.entries(LINES_094).filter(([k]) => !k.startsWith("flatten_")));

// Rows of glyph-like rectangles on a flat paper level.
function page(paper, ink) {
  const W = 200, H = 600, gray = new Uint8Array(W * H).fill(paper);
  for (const y of [20, 70, 120, 170, 220, 270]) for (let i = 0; i < 8; i++)
    for (let r = y; r < y + 22; r++) gray.fill(ink, r * W + 20 + i * 22, r * W + 36 + i * 22);
  return { W, H, gray };
}

test("on grey paper the old weak threshold leaks and the new one finds the lines", () => {
  const { W, H, gray } = page(170, 110);
  const old = inkComponents(gray, W, H, { ...LINES, paper_percentile: undefined });
  const oldAsLegacy = inkComponents(gray, W, H, LEGACY_LINES);
  assert.equal(old.weakThreshold, oldAsLegacy.weakThreshold);
  assert.ok(old.weakThreshold > 170, "old threshold lies inside the paper");
  assert.equal(analyzePage(gray, W, H, LEGACY_LINES).status, "too_little_text");
  assert.equal(analyzePage(gray, W, H, LINES).status, "ok");
  assert.equal(analyzePage(gray, W, H, LINES).seg.lines.length, 6);
  const comp = inkComponents(gray, W, H, LINES);
  assert.equal(comp.weakThreshold, (110 + 170) / 2);
  assert.equal(segmentLines(comp, 0, LINES).lines.length, 6);
});

test("on white paper both rules give identical components and lines", () => {
  const { W, H, gray } = page(255, 0);
  const a = inkComponents(gray, W, H, LEGACY_LINES), b = inkComponents(gray, W, H, LINES);
  assert.equal(a.weakThreshold, b.weakThreshold);
  assert.deepEqual([...a.labels], [...b.labels]);
  assert.deepEqual([...a.role], [...b.role]);
  assert.equal(segmentLines(a, 0, LEGACY_LINES).lines.length, segmentLines(b, 0, LINES).lines.length);
});

test("the paper level is the smallest value with at least the fraction of pixels at or below it", () => {
  const gray = Uint8Array.from([10, 10, 50, 50, 50, 200, 200, 200, 230, 255]);
  const python = (arr, f) => { const c = new Array(256).fill(0); arr.forEach(v => c[v]++); let s = 0; return c.findIndex(n => (s += n) >= f * arr.length); };
  for (const f of [0.1, 0.5, 0.9, 1]) assert.equal(paperLevel(gray, f), python([...gray], f));
  assert.equal(paperLevel(gray, 0.9), 230);
});
