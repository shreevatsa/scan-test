import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { inkComponents, segmentLines } from "../js/local/ink.js";
import { LINES, LEGACY_LINES } from "../js/local/config.js";
import { applyGeometry, clone } from "../js/ops.js";

test("fragment-band settings match method 063", () => {
  const path = new URL("../../methods/063-fragment-band-lines/line-config.json", import.meta.url);
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

const rings = [[[0, 0], [100, 0], [100, 20], [0, 20]]];
const geometry = [{ rings, lines: [
  { line_id: 0, previous_line_ids: [0, 1], rings },
  { line_id: 2, previous_line_ids: [2], rings },
] }];

test("existing text and spans follow a parent line and recomputation is repeatable", () => {
  const doc = { page: { id: "p", regions: [{ id: "r1", lines: [
    { line: 0, polygons: rings, text: "Kannada", spans: [{ kind: "bold", start: 0, end: 7 }], style: { size: 1.2 } },
    { line: 1, polygons: rings, text: "" },
    { line: 2, polygons: rings, text: "Next line", end: "line" },
  ] }] } };
  applyGeometry(doc, geometry);
  assert.deepEqual(doc.page.regions[0].lines.map(L => L.text), ["Kannada", "Next line"]);
  assert.deepEqual(doc.page.regions[0].lines[0].spans, [{ kind: "bold", start: 0, end: 7 }]);
  assert.deepEqual(doc.page.regions[0].lines[0].style, { size: 1.2 });
  const once = clone(doc);
  applyGeometry(doc, geometry);
  assert.deepEqual(doc, once);
});

test("text placed on a former fragment survives and its line reference follows it", () => {
  const doc = { page: { id: "p", regions: [{ id: "r1", lines: [
    { line: 0, polygons: rings, text: "" },
    { line: 1, polygons: rings, text: "Edited text", end: "line" },
    { line: 2, polygons: rings, text: "Next line" },
  ] }] }, relations: [{ type: "note", from: { region: "p#r1", line: 1, start: 0, end: 2 }, to: { unit: "u" } }] };
  applyGeometry(doc, geometry);
  assert.equal(doc.page.regions[0].lines[0].text, "Edited text");
  assert.equal(doc.relations[0].from.line, 0);
});

test("additional edited text on a merged band remains recoverable", () => {
  const doc = { page: { id: "p", regions: [{ id: "r1", lines: [
    { line: 0, polygons: rings, text: "Parent text" },
    { line: 1, polygons: rings, text: "Additional edit" },
    { line: 2, polygons: rings, text: "Next line" },
  ] }] } };
  applyGeometry(doc, geometry);
  assert.deepEqual(doc.page.regions[0].lines.map(L => L.text), ["Parent text", "Additional edit", "Next line"]);
  assert.equal(doc.page.regions[0].lines[1].polygons, undefined);
});
