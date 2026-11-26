import { test } from "node:test";
import assert from "node:assert/strict";
import { hasTextInk, ruleStroke } from "../js/local/ink-checks.js";

test("shallow marks and thin print rules are left out while small print remains", () => {
  const ink = (box, stroke, vertical) => hasTextInk(box, 20, 700, 1050, stroke, vertical);
  assert.equal(ink([80, 50, 92, 55]), false);
  assert.equal(ink([80, 50, 225, 58]), false);
  assert.equal(ink([80, 50, 225, 65], 4), false);
  assert.equal(ink([80, 50, 225, 75], 4), true);
  assert.equal(ink([80, 50, 92, 60]), true);
  assert.equal(ink([80, 50, 225, 62]), true);
  assert.equal(ink([6, 50, 21, 90], undefined, 3), false);
  assert.equal(ink([6, 50, 21, 90]), true);
  assert.equal(ink([6, 50, 23, 70]), true);
});

test("the measured ink stroke stays thin despite tilt, and ignores a detached mark", () => {
  const W = 20, labels = new Uint16Array(W * 12);
  for (let x = 0; x < W; x++) {
    const y = Math.floor(x / 3);
    labels[y * W + x] = labels[(y + 1) * W + x] = 1;
  }
  labels[11 * W] = 2;
  const comp = { W, labels, x0: [0, 0, 0], x1: [0, 20, 1], y0: [0, 0, 11], y1: [0, 8, 12] };
  assert.equal(ruleStroke(comp, [1, 2], [0, 0, 20, 12]), 2);
  assert.equal(ruleStroke(comp, [2], [0, 0, 20, 12]), Infinity);
});
