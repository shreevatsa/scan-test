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
test("an outline preview summary stays out of the page flags, and transcribing a missed box clears its own flag", () => {
  const box = region("r16");
  box.source.no_ink = true;
  const page = doc([box]);
  const summary = "The outline step found ink in 20 of 21 proposed regions. Review the proposed boxes before applying this layout.";
  page.source.warnings = [summary, "Furniture region 0 is marked keep=true."];
  assert.deepEqual(codes(page), ["no-ink", "region-warning"]);
  box.lines = [{ text: "  " }];
  assert.deepEqual(codes(page), ["no-ink", "region-warning"], "a blank line still needs review");
  box.lines[0].text = "Printed";
  assert.deepEqual(codes(page), ["region-warning"]);
  box.lines[0].text = "";
  assert.deepEqual(codes(page), ["no-ink", "region-warning"], "removing the text reopens the issue");
  assert.equal(box.source.no_ink, true);
  assert.equal(page.source.warnings[0], summary);
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
test("Text flags content issues regardless of the type list revision used for transcription", () => {
  const page = doc(); page.source.layers = { text: { state: "model", types_revision: 1 } };
  page.source.problems = ["Line count mismatch"];
  page.page.regions[0].lines = [{ polygons: [[[0, 0], [1, 0], [1, 1]]] }];
  page.page.regions[0].source.transcription = { uncertain: true };
  assert.deepEqual(textFlags(page, { ...types, source: { revision: 2 } }).map(flag => flag.code), ["missing-text", "uncertain-text", "line-count"]);
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
test("A line outside all regions that a whole-page reader read as an ornament or a rule raises no flag; one with text says it", () => {
  const page = doc(); page.page.width = 1000; page.page.height = 1500; page.source.char_h = 20;
  const line = (line_id, text) => ({ line_id, box: [400, 100 * line_id, 600, 100 * line_id + 25], ...(text === undefined ? {} : { text }) });
  page.source.uncovered_lines = [line(1, "-- * --"), line(2, "00000"), line(3, ""), line(4, "* * * *"), line(5, "ಹಿಂದಿನ ಪುಟದಿಂದ"), line(6), line(7, "12")];
  assert.deepEqual(regionFlags(page, types).filter(flag => flag.code === "uncovered").map(flag => flag.line_id), [5, 6, 7]);
  assert.match(regionFlags(page, types).find(flag => flag.line_id === 5).message, /, reading “ಹಿಂದಿನ ಪುಟದಿಂದ”$/);
});
test("A hairline outside all regions (the scan's edge, a fold) raises no flag, wherever it is", () => {
  const page = doc(); page.page.width = 2480; page.page.height = 3508; page.source.char_h = 54;
  page.source.uncovered_lines = [{ line_id: 1, box: [2340, 1076, 2346, 1247] }, { line_id: 2, box: [2160, 970, 2177, 1072] }, { line_id: 3, box: [1131, 3357, 1164, 3405] }];
  assert.deepEqual(regionFlags(page, types).filter(flag => flag.code === "uncovered").map(flag => flag.line_id), [3]);
});
test("Ignored lines raise no flag, restoring brings it back, and ignoring counts as a regions edit", () => {
  const model = doc(); model.source.uncovered_lines = [{ line_id: 5, box: [4, 5, 70, 15] }, { line_id: 6, box: [4, 200, 70, 215] }];
  const edited = structuredClone(model); ops.ignoreLine(edited, { line_id: 5, box: [4, 5, 70, 15] });
  assert.deepEqual(regionFlags(edited, types).map(flag => flag.line_id), [6]);
  assert.notEqual(layerView(model, "regions"), layerView(edited, "regions"));
  assert.equal(noteEdit(model, edited, { focus: "regions" }).source.layers.regions.state, "edited");
  const back = structuredClone(edited); ops.restoreLine(back, { line_id: 5, box: [4, 5, 70, 15] });
  assert.deepEqual(regionFlags(back, types).map(flag => flag.line_id), [5, 6]);
  assert.equal(layerView(model, "regions"), layerView(back, "regions"));
});
test("An ignored line stays ignored when a later analysis numbers the lines differently", () => {
  const model = doc(); model.source.uncovered_lines = [{ line_id: 5, box: [4, 5, 70, 15] }];
  const edited = structuredClone(model); ops.ignoreLine(edited, { line_id: 5, box: [4, 5, 70, 15] });
  const again = structuredClone(edited); again.source.uncovered_lines = [{ line_id: 9, box: [5, 6, 72, 16] }, { line_id: 10, box: [4, 200, 70, 215] }];
  assert.deepEqual(regionFlags(again, types).map(flag => flag.line_id), [10], "the same place, a new id: still ignored");
  const old = structuredClone(model); old.source.ignored_lines = [5];
  assert.deepEqual(regionFlags(old, types).map(flag => flag.line_id), [], "a plain id still works");
});
test("A region left out for want of ink says where the model drew it, when that is known", () => {
  const page = doc(); page.page.width = 100; page.page.height = 300; page.page.regions = [];
  page.source.regions_skipped = [{ region_id: 1, type: "verse", status: "no_ink", model_box: [5, 10, 60, 30] }, { region_id: 2, type: "verse", status: "no_ink" }];
  const flags = regionFlags(page, types).filter(flag => flag.code === "no-ink");
  assert.equal(flags[0].message, "Region 1 (verse) was left out: no ink was found inside its box");
  assert.deepEqual(flags[0].box, [5, 10, 60, 30]);
  assert.equal(flags[1].box, null, "a record made before the box was kept has none");
  const drawn = structuredClone(page); drawn.page.regions = [{ id: "r17", type: "verse", box: [4, 8, 62, 33], polygons: [], lines: [] }];
  assert.deepEqual(regionFlags(drawn, types).filter(flag => flag.code === "no-ink" && flag.message.startsWith("Region 1 ")), [],
    "a region drawn over the same place replaces the left-out one");
});

test("a page where the region finder kept nothing has one check for all its marks", () => {
  const types = { types: { paragraph: { region: "paragraph" } } };
  const marks = Array.from({ length: 170 }, (_, i) => ({ line_id: i + 1, box: [100, 10 * i, 900, 10 * i + 6] }));
  const empty = { page: { id: "p", width: 1000, height: 1800, regions: [] }, source: { layers: { regions: { state: "model" } }, uncovered_lines: marks } };
  const flags = regionFlags(empty, types);
  assert.deepEqual(flags.map(flag => flag.code), ["marks-only"]);
  assert.match(flags[0].message, /kept nothing on this page, though the scan has 170 marks/);
  const withText = { ...empty, page: { ...empty.page, regions: [{ id: "r1", type: "paragraph", order: 1, box: [0, 0, 10, 10], polygons: [], lines: [] }] }, source: { ...empty.source, uncovered_lines: marks.slice(0, 2) } };
  assert.deepEqual(regionFlags(withText, types).filter(flag => flag.code === "uncovered").length, 2, "a page with blocks lists each missed line");
});

test("a mark narrower than a character at the very edge of the scan is no missed line", () => {
  const types = { types: { paragraph: { region: "paragraph" } } };
  const region = { id: "r1", type: "paragraph", order: 1, box: [100, 100, 900, 200], polygons: [], lines: [] };
  const doc = { page: { id: "p", width: 1000, height: 1600, regions: [region] }, source: { char_h: 30, uncovered_lines: [
    { line_id: 1, box: [990, 1400, 998, 1440] },   // a speck at the right edge
    { line_id: 2, box: [500, 1400, 515, 1440] },   // a narrow mark in the page (a numeral, perhaps)
    { line_id: 3, box: [100, 1500, 900, 1540] } ] } };
  assert.deepEqual(regionFlags(doc, types).filter(flag => flag.code === "uncovered").map(flag => flag.line_id), [2, 3]);
});
