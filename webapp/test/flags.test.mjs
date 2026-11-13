import { test } from "node:test";
import assert from "node:assert/strict";
import { regionFlags, textFlags, readFlags, layoutSignature, layoutCounts, regionOverlap, RARE_LAYOUT } from "../js/flags.js";
import { uncoveredLines } from "../js/local/regions.js";

const types = { flows: { main: "Main", notes: "Notes" }, types: {
  article: { contains: ["heading", "paragraph"], flow: "main" }, heading: { region: "heading" }, paragraph: { region: "paragraph" },
  note: { region: "note", flow: "notes" }, footer: { region: "running_header", role: "furniture" } } };
const region = (id = "r1", type = "paragraph", order = 1) => ({ id, type, order, box: [0, 0, 100, 20], lines: [], source: {} });
const doc = regions => ({ page: { id: "p1", regions: regions || [region()] }, source: {} });
const codes = (page, options) => regionFlags(page, types, options).map(flag => flag.code);

test("Regions flags uncertain model assignments", () => {
  const page = doc(); page.page.regions[0].source.uncertain = true;
  assert.deepEqual(codes(page), ["uncertain"]);
});
test("Regions flags unknown types and omitted regions with recoverable boxes", () => {
  const page = doc([region("r1", "other")]);
  page.source.omitted_regions = [{ region: "r2", type: "other", box: [1, 2, 3, 4] }];
  assert.deepEqual(codes(page), ["unknown-type", "omitted"]);
  assert.deepEqual(regionFlags(page, types)[1].box, [1, 2, 3, 4]);
});
test("Regions flags missing order and the warnings from box scaling", () => {
  const page = doc([region("r1", "paragraph", null)]);
  page.source.warnings = ["Furniture region 0 is marked keep=true."];
  assert.deepEqual(codes(page), ["missing-order", "region-warning"]);
  assert.deepEqual(codes(doc([region("r1", "footer", null)])), []);
});
test("Regions flags skipped ink and edited boxes that found no ink", () => {
  const page = doc(); page.source.regions_skipped = [{ region_id: 2, status: "no_ink" }];
  page.page.regions[0].source.no_ink = true;
  assert.deepEqual(codes(page), ["no-ink", "no-ink"]);
});
test("Regions flags completely uncovered printed lines and keeps their bounds", () => {
  const page = doc(); page.source.uncovered_lines = [{ line_id: 5, box: [4, 5, 70, 15] }];
  assert.deepEqual(codes(page), ["uncovered"]);
  assert.deepEqual(regionFlags(page, types)[0].box, [4, 5, 70, 15]);
});
test("Regions flags overlap strictly above a fifth of the smaller box", () => {
  const page = doc([region(), { ...region("r2", "paragraph", 2), box: [80, 0, 180, 20] }]);
  assert.deepEqual(codes(page), []);
  page.page.regions[1].box[0] = 79;
  assert.deepEqual(codes(page), ["overlap"]);
});
test("overlap is judged by outlines where both regions have them, so a region wrapping around its neighbor is not flagged", () => {
  // Footnotes on one printed line, the last running on to a second line: its box covers the others, its outline does not.
  const one = { ...region("r1", "paragraph", 1), box: [0, 0, 100, 20], polygons: [[[0, 0], [100, 0], [100, 20], [0, 20]]] };
  const wrapped = { ...region("r2", "paragraph", 2), box: [0, 0, 300, 40],
    polygons: [[[120, 0], [300, 0], [300, 40], [0, 40], [0, 22], [120, 22]]] };
  assert.deepEqual(codes(doc([one, wrapped])), []);
  assert.ok(regionOverlap(one, wrapped) < 0.01);
  const covering = { ...wrapped, polygons: [[[0, 0], [300, 0], [300, 40], [0, 40]]] };
  assert.deepEqual(codes(doc([one, covering])), ["overlap"]);
  assert.ok(regionOverlap(one, covering) > 0.95);
  assert.deepEqual(codes(doc([{ ...one, polygons: [] }, wrapped])), ["overlap"], "without both outlines the boxes decide");
});
test("Regions exposes schema errors and provisional or geometry failures", () => {
  const page = doc(); page.source.geometry_error = "Failed outline calculation";
  page.source.provisional_problems = ["A type has no flow"];
  assert.deepEqual(codes(page, { errors: ["Invalid page"] }), ["provisional", "geometry", "invalid"]);
});
test("continuation flags compare each flow with both neighbors and tolerate missing documents", () => {
  const provisional = page => { page.source.layers = { units: { state: "provisional" } }; return page; };
  const current = provisional(doc()), previous = provisional(doc()), next = provisional(doc());
  current.page.regions[0].source.continues_from_earlier = true;
  current.page.regions[0].source.continues_later = true;
  assert.deepEqual(codes(current, { previous, next }), ["continuation", "continuation"]);
  previous.page.regions[0].source.continues_later = true;
  next.page.regions[0].source.continues_from_earlier = true;
  assert.deepEqual(codes(current, { previous, next }), []);
  assert.deepEqual(codes(current), []);
  assert.deepEqual(codes(current, { next: provisional(doc([region("n1", "note")])) }), ["continuation"]);
});
test("once both pages' units are settled, Read checks the page break and Regions does not", () => {
  const settled = page => { page.source.layers = { units: { state: "model" } }; return page; };
  const current = settled(doc()), next = settled(doc([region("n1", "note")]));
  current.page.regions[0].source.continues_later = true;
  assert.deepEqual(codes(current, { next }), []);
  next.source.layers.units.state = "provisional";
  assert.deepEqual(codes(current, { next }), ["continuation"], "a provisional neighbor still depends on the regions' flags");
  delete current.source.layers; delete next.source.layers;
  assert.deepEqual(codes(current, { next }), [], "a legacy page's units are complete");
});
test("a layout is the kinds of content on a page, not their counts, order or furniture, and rarity is not a flag", () => {
  const page = doc([region("r3", "paragraph", 3), region("r1", "heading", 1), region("r2", "paragraph", 2), region("r4", "footer", null)]);
  assert.equal(layoutSignature(page, types), "heading · paragraph");
  const alternating = doc([region("r1", "paragraph", 1), region("r2", "heading", 2), region("r3", "paragraph", 3), region("r4", "heading", 4)]);
  assert.equal(layoutSignature(alternating, types), "heading · paragraph", "the same kinds in another order and number");
  assert.equal(layoutCounts([page, alternating, null], types).get("heading · paragraph"), 2);
  assert.equal(layoutSignature(doc([region("r1", "footer", null)]), types), "Page furniture only");
  assert.equal(layoutSignature(doc([]), types), "Blank page");
  assert.equal(RARE_LAYOUT, 3);
  assert.deepEqual(codes(doc(), { frequency: 1 }), []);
});
test("Text flags missing text, uncertainty, line mismatches and an earlier type revision", () => {
  const page = doc(); page.source.layers = { text: { state: "model", types_revision: 1 } };
  page.source.problems = ["Line count mismatch"];
  page.page.regions[0].lines = [{ polygons: [[[0, 0], [1, 0], [1, 1]]] }];
  page.page.regions[0].source.transcription = { uncertain: true };
  assert.deepEqual(textFlags(page, { ...types, source: { revision: 2 } }).map(flag => flag.code), ["missing-text", "uncertain-text", "line-count", "earlier-text"]);
  assert.deepEqual(textFlags(doc(), types), []);
});
test("Read flags checks, assembly, uncertain completion and waiting suggestions", () => {
  const page = doc(); page.page.regions[0].source.completion = { uncertain: true };
  page.source.suggestions = { units: "work/candidate.json" };
  assert.deepEqual(readFlags(page, ["Error"], ["Warning"], ["Join warning"]).map(flag => flag.code),
    ["structure", "structure", "structure", "uncertain-units", "suggestion"]);
  assert.deepEqual(regionFlags(null, types), []);
  assert.deepEqual(readFlags(null), []);
});
test("the worker reports only whole unclaimed lines after final ownership", () => {
  const comp = { count: 4, x0: [0, 1, 30, 10], y0: [0, 2, 20, 2], x1: [0, 5, 40, 15], y1: [0, 10, 30, 10] };
  const prep = { lineOf: [-1, 0, 1, 0] }, owner = [-1, -1, 0, -1];
  const decisions = [{ line_id: 0, mode: "uncovered" }, { line_id: 1, mode: "whole" }];
  assert.deepEqual(uncoveredLines(comp, prep, decisions, owner, [{ anchor_line_id: 7 }]), [{ line_id: 7, box: [1, 2, 15, 10] }]);
  owner[1] = 0;
  assert.deepEqual(uncoveredLines(comp, prep, decisions, owner), []);
});

import { linePosition, uncoveredMessage } from "../js/flags.js";
import * as ops from "../js/ops.js";
import { layerView, noteEdit } from "../js/layers.js";

test("An uncovered line is described by where it is, not by its number", () => {
  const page = { width: 1000, height: 1500 };
  assert.equal(uncoveredMessage([100, 50, 900, 100], page), "A printed line outside all regions, near the top of the page");
  assert.equal(uncoveredMessage([100, 700, 300, 740], page), "A printed line outside all regions, near the middle of the page, on the left");
  assert.equal(linePosition([650, 1300, 900, 1340], page), "near the bottom of the page, on the right");
  assert.equal(uncoveredMessage([0, 0, 1, 1], null), "A printed line outside all regions");
  const flagged = doc(); flagged.page.width = 100; flagged.page.height = 300; flagged.source.uncovered_lines = [{ line_id: 5, box: [4, 5, 90, 15] }];
  assert.equal(regionFlags(flagged, types)[0].message, "A printed line outside all regions, near the top of the page");
});
test("Ignored lines raise no flag, restoring brings it back, and ignoring counts as a regions edit", () => {
  const model = doc(); model.source.uncovered_lines = [{ line_id: 5, box: [4, 5, 70, 15] }, { line_id: 6, box: [4, 200, 70, 215] }];
  const edited = structuredClone(model); ops.ignoreLine(edited, 5);
  assert.deepEqual(regionFlags(edited, types).map(flag => flag.line_id), [6]);
  assert.notEqual(layerView(model, "regions"), layerView(edited, "regions"));
  assert.equal(noteEdit(model, edited, { focus: "regions" }).source.layers.regions.state, "edited");
  const back = structuredClone(edited); ops.restoreLine(back, 5);
  assert.deepEqual(regionFlags(back, types).map(flag => flag.line_id), [5, 6]);
  assert.equal(layerView(model, "regions"), layerView(back, "regions"));
});
test("A region added over the line removes its flag; a continuation flag names the neighbouring page", () => {
  const page = doc(); page.source.uncovered_lines = [{ line_id: 5, box: [4, 500, 70, 515] }];
  assert.deepEqual(codes(page), ["uncovered"]);
  page.source.layers = { units: { state: "provisional" } }; page.units = []; page.flows = {};
  const rid = ops.coverLine(page, types, 5, "paragraph");
  assert.deepEqual(codes(page), []);
  assert.deepEqual(page.page.regions.find(value => value.id === rid).box, [4, 500, 70, 515]);
  const provisional = (id, marks) => { const value = doc(); value.page.id = id; value.source.layers = { units: { state: "provisional" } }; Object.assign(value.page.regions[0].source, marks); return value; };
  const here = provisional("p1", { continues_later: true }), other = provisional("p2", {});
  assert.equal(regionFlags(here, types, { next: other }).find(flag => flag.code === "continuation").page, "p2");
});
