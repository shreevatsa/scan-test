import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzePage } from "../js/local/ink.js";
import { regionsFromBoxes } from "../js/local/regions.js";
import { LINES, OWNERSHIP } from "../js/local/config.js";

// An invented page: thirty lines of body text (letters 20 px high), and a title of letters four to five times that,
// tall and short ones and the dot of an i, as a large heading is printed.
function page() {
  const W = 1200, H = 1700, gray = new Uint8Array(W * H).fill(255);
  const ink = (x0, y0, w, h) => { for (let y = y0; y < y0 + h; y++) gray.fill(0, y * W + x0, y * W + x0 + w); };
  let x = 100;
  for (let i = 0; i < 18; i++) {
    const tall = i % 3 !== 1;
    ink(x, tall ? 100 : 130, 28, tall ? 90 : 60);
    if (i === 10) ink(x + 9, 104, 10, 10);
    x += i % 6 === 5 ? 70 : 42;
  }
  for (let line = 0; line < 30; line++)
    for (let x = 100; x < 1100; x += 16) if ((x - 100) % 96 < 80) ink(x, 400 + line * 40, 11, 20);
  return { gray, W, H, title: [90, 95, x + 10, 200], body: [90, 390, 1110, 1610] };
}

test("a title in display type is one line piece holding all its letters, and body text is unchanged", () => {
  const { gray, W, H, title, body } = page();
  const analysis = analyzePage(gray, W, H, LINES);
  assert.equal(analysis.status, "ok");
  const { geometry, display } = regionsFromBoxes(analysis, [title, body], OWNERSHIP);
  assert.deepEqual(display, [0]);
  assert.equal(geometry[0].lines.length, 1);
  const points = geometry[0].lines[0].rings.flat(), xs = points.map(p => p[0]), ys = points.map(p => p[1]);
  assert.ok(Math.min(...xs) <= 102 && Math.max(...xs) >= title[2] - 60, `the line piece spans the title: ${Math.min(...xs)}–${Math.max(...xs)}`);
  assert.ok(Math.min(...ys) <= 106 && Math.max(...ys) >= 188, `and its height, the i's dot included: ${Math.min(...ys)}–${Math.max(...ys)}`);
  assert.equal(geometry[1].lines.length, 30);
});
