import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { makeValidator, checkPage } from "../js/schema.js";
import { layerView, layerState, isProtected, noteEdit, accept, sendBack } from "../js/layers.js";
import { provisionalDocument, provisionalUnits } from "../js/pipeline/provisional.js";
import { mergeRegions, mergeText } from "../js/pipeline/apply.js";

const root = new URL("../../", import.meta.url);
const read = path => JSON.parse(readFileSync(new URL(path, root), "utf8"));
const validate = makeValidator(read("webapp/schema.json"));
const types = { format: "types", schema_version: "0.2", book_id: "stages", title: "Stages", languages: ["en"],
  flows: { main: "Main text", notes: "Notes" }, relations: { note: "A marker and its note" },
  types: { article: { description: "Article", contains: ["heading", "paragraph", "quotation", "verse", "figure"], flow: "main" },
    heading: { description: "Heading", region: "heading" }, paragraph: { description: "Prose", region: "paragraph", contains: ["verse"] },
    quotation: { description: "Quoted prose", region: "paragraph" }, verse: { description: "Verse", region: "verse" },
    figure: { description: "Figure", region: "figure" }, footnote: { description: "Note", region: "note", flow: "notes" },
    page_number: { description: "Page number", region: "page_number", role: "furniture" } }, source: { revision: 3 } };
const pid = "p1", page = { image: "p1.png", image_sha256: "a".repeat(64), width: 1000, height: 1400 };
const polygon = y => [[[10, y], [110, y], [110, y + 20], [10, y + 20]]];
const region = (id, type, extra = {}) => ({ region_id: id, type, region_class: types.types[type]?.region || "other",
  keep: types.types[type]?.role !== "furniture", status: "ok", reading_order: id, uncertain: false,
  model_box: [10, id * 40, 111, id * 40 + 21], polygons: polygon(id * 40),
  lines: type === "figure" ? [] : [{ line_id: id * 10, polygons: polygon(id * 40) }], ...extra });
const record = () => ({ width: page.width, height: page.height, char_h: 18, page_angle_deg: 0,
  region_call: { cost_usd: 0.01, response_id: "fixture" }, regions: [region(1, "heading"), region(2, "paragraph"), region(3, "footnote")] });
const check = doc => checkPage(validate, doc, types);
const valid = (doc, label) => assert.deepEqual(check(doc)[0], [], label);
const provisional = () => provisionalDocument(pid, page, types, record(), { firstPage: true, lastPage: true });
function completed() {
  const doc = provisional();
  for (const r of doc.page.regions) for (const line of r.lines) line.text = `Text ${r.id}`;
  doc.source.layers.text = { state: "model", made_by: "argon-low", types_revision: 3 };
  return doc;
}
function reading(doc, text = "New text") {
  return { profile: { id: "argon-low" }, image_sha256: page.image_sha256, regions_record: record(), parsed: {
    regions: doc.page.regions.filter(r => r.lines.length).map(r => ({ id: r.id, uncertain: false, note: null,
      lines: r.lines.map((line, index) => ({ n: index + 1, text })) })) } };
}
function renamedIds(doc) {
  const next = structuredClone(doc), names = new Map(next.units.map((unit, i) => [unit.id, `other${i + 1}`]));
  for (const unit of next.units) {
    unit.id = names.get(unit.id);
    for (const child of unit.children) if (child.unit) child.unit = names.get(child.unit);
  }
  for (const flow in next.flows) next.flows[flow] = next.flows[flow].map(id => names.get(id));
  for (const relation of next.relations) for (const side of ["from", "to"]) if (relation[side].unit) relation[side].unit = names.get(relation[side].unit);
  return next;
}

test("provisional documents validate on all nine public region references without transcribing", () => {
  const examples = ["cole-1903-page-003", "dutt-mahabharata-17f-chapter-001-page-002", "gopinath-1896-page-123",
    "gopinath-1914-page-258", "hertel-panchatantra-page-152", "kale-1913-page-106", "ryder-ten-princes-1927-page-030",
    "telang-dli-page-108", "vavilla-page-034"];
  for (const id of examples) {
    const input = read(`inputs/${id}.json`), saved = read(`outputs/${id}/063-fragment-band-lines/regression-001/regions.json`);
    const tl = read(`schema/types/${input.book_id}.json`), before = structuredClone(saved);
    const doc = provisionalDocument(id, { image: `${id}.png`, image_sha256: saved.input.sha256,
      width: saved.input.width, height: saved.input.height }, tl, saved);
    assert.deepEqual(checkPage(validate, doc, tl)[0], [], id);
    assert.equal(doc.source.char_h, saved.line_analysis.char_h);
    assert.equal(layerState(doc, "text"), null);
    assert.ok(doc.page.regions.every(r => r.lines.every(line => !Object.hasOwn(line, "text"))));
    assert.deepEqual(saved, before, "source record retained");
  }
});

test("what a whole-page reader read in the lines outside all regions is kept with each line, with its confidence", () => {
  const doc = provisionalDocument(pid, page, types, { ...record(), regions: [] });
  doc.source.uncovered_lines = [{ line_id: 1, box: [10, 10, 500, 40] }, { line_id: 2, box: [10, 60, 500, 90], text: "old", confidence: 0.4 }, { line_id: 3, box: [10, 110, 500, 140] }];
  const parsed = { profile: { id: "vision-document" }, parsed: { regions: [], uncovered: [{ line_id: 1, text: "NANANA FYFY", confidence: 0.52 }, { line_id: 2, text: "a printed line" }] } };
  const merged = mergeText(doc, parsed, types).doc;
  valid(merged);
  assert.deepEqual(merged.source.uncovered_lines, [{ line_id: 1, box: [10, 10, 500, 40], text: "NANANA FYFY", confidence: 0.52 },
    { line_id: 2, box: [10, 60, 500, 90], text: "a printed line" }, { line_id: 3, box: [10, 110, 500, 140] }]);
});

test("empty pages, figures, omitted types and missing ink retain their stage and review evidence", () => {
  for (const regions of [[], [region(1, "figure")]]) {
    const doc = provisionalDocument(pid, page, types, { ...record(), regions });
    valid(doc);
    const parsed = { profile: { id: "tesseract" }, parsed: { regions: [] } };
    const transcribed = mergeText(doc, parsed, types).doc;
    valid(transcribed);
    assert.equal(layerState(transcribed, "text").state, "model");
    assert.equal(layerState(accept(transcribed, "text", "2026-11-09T00:00:00Z"), "text").accepted, true);
    const legacy = structuredClone(transcribed);
    delete legacy.source.layers;
    assert.equal(layerState(legacy, "text").accepted, true, "legacy pages without text lines are ready");
  }
  const doc = provisionalDocument(pid, page, types, { ...record(), regions: [region(1, "other"), region(2, "paragraph", { status: "no_ink", polygons: [] })] });
  valid(doc);
  assert.equal(doc.source.omitted_regions[0].type, "other");
  assert.deepEqual(doc.source.omitted_regions[0].box, [10, 40, 111, 61]);
  // A region with no ink is kept, outlined by its box and marked, not dropped: the person sees it and decides.
  const kept = doc.page.regions.find(value => value.source.region_id === 2);
  assert.ok(kept, "the region with no ink stays on the page");
  assert.equal(kept.source.no_ink, true);
  assert.deepEqual(kept.lines, []);
  assert.equal(kept.polygons.length, 1);
  assert.deepEqual(doc.source.regions_skipped, []);
});

test("layer comparison includes markers and formatting while excluding provenance", () => {
  const doc = completed(), changed = structuredClone(doc);
  changed.source.extra = "different provenance";
  changed.page.regions[0].source.changed = true;
  for (const layer of ["regions", "text"]) assert.equal(layerView(doc, layer), layerView(changed, layer));
  changed.page.regions[1].lines[0].spans = [{ start: 0, end: 1, kind: "bold" }];
  assert.notEqual(layerView(doc, "text"), layerView(changed, "text"));
  const edited = noteEdit(doc, changed);
  assert.equal(layerState(edited, "text").state, "edited");
  assert.equal(layerState(edited, "regions").state, "model");
  assert.equal(layerState(noteEdit(doc, doc), "text").state, "model");
});

test("legacy edits stay protected and accepting or sending back affects only its chosen layer", () => {
  for (const edited of [false, true]) {
    const legacy = completed();
    delete legacy.source.layers;
    if (edited) legacy.source.edited = "2026-11-08T00:00:00Z";
    const before = structuredClone(legacy);
    for (const layer of ["regions", "text"]) {
      assert.equal(layerState(legacy, layer).state, edited ? "edited" : "model");
      assert.equal(isProtected(legacy, layer), true);
    }
    const back = sendBack(legacy, "text");
    assert.equal(layerState(back, "text").accepted, false);
    assert.equal(isProtected(back, "text"), edited);
    assert.equal(isProtected(back, "regions"), true);
    const accepted = accept(back, "text", "2026-11-09T00:00:00Z");
    assert.equal(layerState(accepted, "text").accepted_at_utc, "2026-11-09T00:00:00Z");
    assert.deepEqual(legacy, before);
  }
  assert.throws(() => accept(provisional(), "text"), /not available/);
});

test("older readings retain omitted escape regions without applying them to the page", () => {
  const saved = record();
  saved.regions.push(region(4, "other"));
  const doc = provisionalDocument(pid, page, types, saved, { firstPage: true, lastPage: true });
  const incoming = reading(doc);
  incoming.regions_record = saved;
  incoming.parsed.regions.push({ id: "r4", uncertain: false, note: null, lines: [{ n: 1, text: "Unclassified text" }] });
  const before = structuredClone(incoming), merged = mergeText(doc, incoming, types);
  valid(merged.doc);
  assert.deepEqual(merged.taken, ["text"]);
  assert.equal(merged.doc.source.omitted_regions.length, 1);
  assert.deepEqual(incoming, before);
  const removed = structuredClone(doc);
  removed.page.regions.splice(1, 1);
  assert.equal(mergeText(removed, incoming, types).suggestion, true, "a removed known region is a geometry change");
});

test("a kept region with no ink passes the stages: nothing is read from it, and it is flagged", async () => {
  const { regionFlags } = await import("../js/flags.js");
  const { pageStages } = await import("../js/workflow.js");
  const withBlank = { ...record(), regions: [region(1, "heading"), region(2, "page_number", { status: "no_ink", polygons: [], lines: [] }), region(3, "footnote")] };
  const doc = provisionalDocument(pid, page, types, withBlank, { firstPage: true, lastPage: true });
  valid(doc);
  assert.equal(doc.page.regions.map(r => r.id).join(), "r1,r2,r3", "kept in the finder's order");
  assert.ok(regionFlags(doc, types).some(flag => flag.code === "no-ink" && flag.region === "r2"), "the person is told");
  const transcribed = mergeText(doc, { profile: { id: "argon-low" }, image_sha256: page.image_sha256, regions_record: withBlank, parsed: { regions: doc.page.regions.filter(r => r.lines.length).map(r => ({
    id: r.id, uncertain: false, note: null, lines: r.lines.map((line, index) => ({ n: index + 1, text: "Text" })) })) } }, types).doc;
  valid(transcribed);
  assert.equal(pageStages(transcribed, types).missing, 0, "no lines are missing text");
  assert.deepEqual(transcribed.page.regions.map(r => r.lines.map(line => line.text)), [["Text"], [], ["Text"]], "the others were read; the empty one was not");
});
