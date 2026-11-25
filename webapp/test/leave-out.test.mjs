// Leaving blocks out of the book (the × on the scan, a box dragged across it, the Delete key) and bringing them back (↺),
// and the areas of an older book waiting for a proposed type kept in the book as it opens.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as ops from "../js/ops.js";
import { regionFlags } from "../js/flags.js";
import { keptType } from "../js/pipeline/provisional.js";
import { keepWaiting } from "../js/type-additions.js";
import { restoredText } from "../js/pipeline/apply.js";

const types = JSON.parse(readFileSync(new URL("../types/generic.json", import.meta.url)));
const ring = (x1, y1, x2, y2) => [[[x1, y1], [x2, y1], [x2, y2], [x1, y2]]];
const block = (n, text) => ({ id: `r${n}`, type: "paragraph", order: n, box: [100, 100 * n, 900, 100 * n + 40], polygons: ring(100, 100 * n, 900, 100 * n + 40),
  lines: [{ line: n, polygons: ring(100, 100 * n, 900, 100 * n + 40), text }] });
const page = () => ({ format: "page", schema_version: "0.4", book_id: "b", overrides: {},
  page: { id: "b-page-001", width: 1000, height: 1400, regions: [block(1, "One."), block(2, "Two."), block(3, "Three.")] }, source: {} });
const byId = doc => [...doc.page.regions].sort((a, b) => a.id.localeCompare(b.id));

test("a block left out is kept whole among the areas left out, and ↺ brings it back as it was", () => {
  const original = page(), doc = ops.clone(original);
  ops.leaveOutRegion(doc, "r2");
  assert.deepEqual(doc.page.regions.map(region => [region.id, region.order]), [["r1", 1], ["r3", 2]]);
  assert.equal(doc.source.ignored_regions.length, 1);
  assert.deepEqual(doc.source.ignored_regions[0].box, [100, 200, 900, 240]);
  assert.equal(doc.source.ignored_regions[0].block.lines[0].text, "Two.");
  ops.restoreOmittedRegion(doc, 0);
  assert.deepEqual(byId(doc), byId(original));
  assert.equal(doc.source.ignored_regions, undefined);
  assert.equal(doc.source.omitted_regions, undefined);
});

test("several blocks left out in any order come back in their places", () => {
  const original = page(), doc = ops.clone(original);
  for (const rid of ["r3", "r1"]) ops.leaveOutRegion(doc, rid);
  assert.deepEqual(doc.page.regions.map(region => [region.id, region.order]), [["r2", 1]]);
  ops.restoreOmittedRegion(doc, 1);   // r1 first, then r3
  ops.restoreOmittedRegion(doc, 0);
  assert.deepEqual(byId(doc), byId(original));
});

test("a printed line under an area left out is no line to check", () => {
  const doc = page();
  doc.source.uncovered_lines = [{ line_id: 9, box: [120, 210, 880, 230], text: "Two." }, { line_id: 10, box: [120, 900, 880, 920], text: "Elsewhere." }];
  const uncovered = d => regionFlags(d, types).filter(flag => flag.code === "uncovered").map(flag => flag.line_id);
  ops.leaveOutRegion(doc, "r2");
  assert.deepEqual(uncovered(doc), [10]);
});

test("an area of a kind the book has no type for is kept as a paragraph; a figure, an unknown mark, is not", () => {
  assert.equal(keptType({ proposed_type: "byline", region_class: "lead_in" }, types), types.types.lead_in ? "lead_in" : "paragraph");
  assert.equal(keptType({ proposed_type: "dateline", region_class: "paragraph" }, types), "paragraph");
  assert.equal(keptType({ proposed_type: "stamp", region_class: "other" }, types), null);
  const noFigures = { ...types, types: Object.fromEntries(Object.entries(types.types).filter(([, type]) => type.region !== "figure")) };
  assert.equal(keptType({ proposed_type: "plate", region_class: "figure" }, noFigures), null);
});

test("an older book's areas waiting for a proposed type become blocks of their kind, with their text, still proposed", () => {
  const finder = (id, y, extra = {}) => ({ region_id: id, type: "paragraph", keep: true, reading_order: id, status: "ok", region_class: "paragraph",
    model_box: [100, y, 900, y + 40], bounds: [100, y, 900, y + 40], polygons: ring(100, y, 900, y + 40), lines: [{ line_id: id * 10, polygons: ring(100, y, 900, y + 40) }], ...extra });
  const record = { width: 1000, height: 1400, regions: [finder(1, 100), finder(2, 200, { type: "other", proposed_type: "dateline" }),
    finder(3, 300, { type: "other", proposed_type: "squiggle", region_class: "other" })] };
  const doc = page();
  doc.page.regions = [block(1, "One.")];
  doc.source.omitted_regions = [{ region: "r2", type: "other", box: [100, 200, 900, 240], proposed_type: "dateline" },
    { region: "r3", type: "other", box: [100, 300, 900, 340], proposed_type: "squiggle" }];
  const reading = { profile: { id: "hydrogen-low-page" }, regions_record: record,
    parsed: { regions: [["r1", "One."], ["r2", "A college, July 1903."], ["r3", "~~"]].map(([id, text]) => ({ id, uncertain: false, note: null, lines: [{ n: 1, text }] })) } };
  const out = keepWaiting(doc, record, reading, types, restoredText, keptType);
  assert.deepEqual(out.kept, ["r2"]);
  assert.deepEqual(out.withText, ["r2"]);
  const r2 = out.doc.page.regions.find(region => region.id === "r2");
  assert.equal(r2.type, "paragraph");
  assert.equal(r2.source.kept_as, "paragraph");
  assert.equal(r2.source.proposed_type, "dateline");
  assert.equal(r2.lines[0].text, "A college, July 1903.");
  assert.deepEqual(out.doc.source.omitted_regions.map(area => area.region), ["r3"]);
  // Nothing left to keep: the page as it is.
  assert.deepEqual(keepWaiting(out.doc, record, reading, types, restoredText, keptType).kept, []);
});
