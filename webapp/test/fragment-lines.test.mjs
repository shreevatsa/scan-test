import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { inkComponents, segmentLines } from "../js/local/ink.js";
import { LINES, LEGACY_LINES } from "../js/local/config.js";

test("fragment-band settings match method 094", () => {
  const path = new URL("../../methods/094-illumination-flattened-ink/line-config.json", import.meta.url);
  assert.deepEqual(LINES, JSON.parse(readFileSync(path, "utf8")));
});

test("detached parts join their parent while a short printed line stays separate", () => {
  const W = 180, H = 600, gray = new Uint8Array(W * H).fill(255);
  const rectangle = (x, y, width, height) => {
    for (let row = y; row < y + height; row++) gray.fill(0, row * W + x, row * W + x + width);
  };
  for (const y of [20, 90]) for (let i = 0; i < 6; i++) rectangle(20 + i * 22, y, 10, 22);
  rectangle(33, 40, 7, 14);
  rectangle(77, 40, 7, 14);
  rectangle(20, 125, 10, 22);
  const comp = inkComponents(gray, W, H, LINES);
  const before = segmentLines(comp, 0, LEGACY_LINES);
  const after = segmentLines(comp, 0, LINES);
  assert.equal(before.lines.length, 4);
  assert.equal(after.lines.length, 3);
  assert.deepEqual(after.lines[0].previous_line_ids, [0, 1]);
  assert.equal(after.lines[0].anchor_line_id, 0);
  assert.equal(after.lineOf[comp.labels[45 * W + 35]], after.lineOf[comp.labels[25 * W + 25]]);
  assert.notEqual(after.lineOf[comp.labels[130 * W + 25]], after.lineOf[comp.labels[95 * W + 25]]);
});
