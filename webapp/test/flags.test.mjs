import { test } from "node:test";
import assert from "node:assert/strict";
import { regionFlags, textFlags, readFlags, layoutSignature, layoutCounts } from "../js/flags.js";
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
test("Regions exposes schema errors and provisional or geometry failures", () => {
  const page = doc(); page.source.geometry_error = "Failed outline calculation";
  page.source.provisional_problems = ["A type has no flow"];
  assert.deepEqual(codes(page, { errors: ["Invalid page"] }), ["provisional", "geometry", "invalid"]);
});
test("continuation flags compare each flow with both neighbors and tolerate missing documents", () => {
  const current = doc(), previous = doc(), next = doc();
  current.page.regions[0].source.continues_from_earlier = true;
  current.page.regions[0].source.continues_later = true;
  assert.deepEqual(codes(current, { previous, next }), ["continuation", "continuation"]);
  previous.page.regions[0].source.continues_later = true;
  next.page.regions[0].source.continues_from_earlier = true;
  assert.deepEqual(codes(current, { previous, next }), []);
  assert.deepEqual(codes(current), []);
  assert.deepEqual(codes(current, { next: doc([region("n1", "note")]) }), ["continuation"]);
});
test("layout signatures collapse repeated types, respect order and count rare layouts", () => {
  const page = doc([region("r3", "paragraph", 3), region("r1", "heading", 1), region("r2", "paragraph", 2)]);
  assert.equal(layoutSignature(page, types), "heading → paragraph");
  assert.equal(layoutCounts([page, page, null], types).get("heading → paragraph"), 2);
  assert.deepEqual(codes(doc(), { frequency: 2 }), ["rare-layout"]);
  assert.deepEqual(codes(doc(), { frequency: 3 }), []);
  assert.equal(layoutSignature(doc([]), types), "Blank page");
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
