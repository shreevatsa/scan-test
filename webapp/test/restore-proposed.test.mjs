// Areas waiting for a proposed type: adding the type makes them blocks with the finder's outline and lines and the text
// the page's saved reading has for them (restoreWaiting, restoredText), even on a page whose text a person has edited.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { restoreWaiting } from "../js/type-additions.js";
import { restoredText } from "../js/pipeline/apply.js";

const types = JSON.parse(readFileSync(new URL("../types/generic.json", import.meta.url)));
types.types.formula = { region: "paragraph", flow: "main", description: "A displayed formula" };
const ring = (x1, y1, x2, y2) => [[[x1, y1], [x2, y1], [x2, y2], [x1, y2]]];
const finderRegion = (id, type, y, extra = {}) => ({ region_id: id, type, keep: true, reading_order: id, status: "ok", region_class: "paragraph",
  model_box: [100, y, 900, y + 40], bounds: [100, y, 900, y + 40], polygons: ring(100, y, 900, y + 40),
  lines: [{ line_id: id * 10, polygons: ring(100, y, 900, y + 40) }], ...extra });
const record = { width: 1000, height: 1400, regions: [finderRegion(1, "paragraph", 100), finderRegion(2, "other", 200, { proposed_type: "formula", region_class: "formula" }), finderRegion(3, "paragraph", 300)] };
const page = () => ({ format: "page", schema_version: "0.4", book_id: "b", overrides: {},
  page: { id: "b-page-001", width: 1000, height: 1400, regions: [1, 3].map(id => { const r = record.regions[id - 1]; return { id: `r${id}`, type: "paragraph", order: id,
    polygons: r.polygons, box: r.model_box, lines: [{ line: id * 10, polygons: r.lines[0].polygons, text: id === 1 ? "Edited by a person." : "Three." }] }; }) },
  source: { omitted_regions: [{ region: "r2", type: "other", box: [100, 200, 900, 240], proposed_type: "formula" }],
    layers: { regions: { state: "model" }, text: { state: "edited" } } } });
const reading = { profile: { id: "hydrogen-low-page" }, regions_record: record,
  parsed: { regions: [["r1", "One."], ["r2", "x² − y² = (x + y)(x − y)"], ["r3", "Three."]].map(([id, text]) => ({ id, uncertain: false, note: null, lines: [{ n: 1, text }] })) } };

test("adding the proposed type makes the waiting area a block with the finder's geometry and the saved text", () => {
  const { doc, restored, withText } = restoreWaiting(page(), record, reading, "formula", "formula", types, restoredText);
  assert.deepEqual(restored, ["r2"]);
  assert.deepEqual(withText, ["r2"]);
  const r2 = doc.page.regions.find(region => region.id === "r2");
  assert.equal(r2.type, "formula");
  assert.deepEqual(r2.polygons, record.regions[1].polygons);
  assert.deepEqual(r2.lines.map(line => [line.line, line.text]), [[20, "x² − y² = (x + y)(x − y)"]]);
  assert.equal(doc.source.omitted_regions, undefined, "nothing is left waiting");
  assert.equal(doc.page.regions[0].lines[0].text, "Edited by a person.", "the person's text elsewhere is untouched");
});

test("an area with no saved text, or another proposed type, is handled as it should be", () => {
  const unread = restoreWaiting(page(), record, { ...reading, parsed: { regions: reading.parsed.regions.filter(r => r.id !== "r2") } }, "formula", "formula", types, restoredText);
  assert.deepEqual([unread.restored, unread.withText], [["r2"], []]);
  assert.equal(unread.doc.page.regions.find(region => region.id === "r2").lines[0].text, undefined, "made a block, to be read");
  const other = restoreWaiting(page(), record, reading, "dateline", "paragraph", types, restoredText);
  assert.deepEqual(other.restored, []);
  assert.equal(other.doc.source.omitted_regions.length, 1);
});

test("a reading that does not fit a region's line pieces fills an empty region with its text spread over them", async () => {
  const { spreadLines } = await import("../js/pipeline/apply.js");
  assert.deepEqual(spreadLines(["one two three four", "five six"], 3), ["one two", "three four", "five six"]);
  assert.deepEqual(spreadLines(["x² + y²"], 3), ["x²", "+", "y²"]);
  assert.equal(spreadLines(["a b c d e f g h"], 2).join(" "), "a b c d e f g h", "no word is lost");
  assert.deepEqual(spreadLines(["I am the taste in water; sound", "In ether; none the less"], 3, { whole: true }), ["I am the taste in water; sound", "In ether; none the less", ""], "a verse keeps its printed lines");
  assert.deepEqual(spreadLines(["one", "two", "three"], 2, { whole: true }), ["one", "two three"]);
});
