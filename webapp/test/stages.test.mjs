import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { makeValidator, checkPage } from "../js/schema.js";
import { layerView, layerState, isProtected, noteEdit, accept, sendBack } from "../js/layers.js";
import { provisionalDocument, provisionalUnits } from "../js/pipeline/provisional.js";
import { mergeRegions, mergeText, mergeCompletion } from "../js/pipeline/apply.js";

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
  doc.source.layers.units = { state: "model", made_by: "terra-structure", types_revision: 3 };
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
    assert.equal(layerState(doc, "units").state, "provisional");
    assert.ok(doc.page.regions.every(r => r.lines.every(line => !Object.hasOwn(line, "text"))));
    assert.deepEqual(saved, before, "source record retained");
  }
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

test("provisional grouping uses reachable containers, starts sections at headings and joins interrupted units", () => {
  const doc = provisional();
  const regions = [
    { ...doc.page.regions[0], id: "r1", order: 1 },
    { ...doc.page.regions[1], id: "r2", order: 2, source: { continues_later: true } },
    { ...doc.page.regions[1], id: "r3", type: "verse", order: 3 },
    { ...doc.page.regions[1], id: "r4", order: 4, source: { continues_from_earlier: true } },
    { ...doc.page.regions[0], id: "r5", order: 5 },
  ];
  const result = provisionalUnits(pid, regions, types, { firstPage: true, lastPage: true });
  const out = { ...doc, page: { ...doc.page, regions }, ...result };
  delete out.problems;
  valid(out);
  assert.equal(result.flows.main.length, 2);
  const paragraph = result.units.find(unit => unit.children.some(child => child.region === "p1#r2"));
  assert.deepEqual(paragraph.children, [{ region: "p1#r2" }, { region: "p1#r4" }]);
  assert.deepEqual(result.problems, []);
  const unreachable = structuredClone(types);
  delete unreachable.types.article.contains;
  const missing = provisionalUnits(pid, [doc.page.regions[1]], unreachable);
  assert.deepEqual(missing.problems, ["type paragraph has no place in any flow"]);
});

test("open ends obey page boundaries and parent chains, and ignored flags become problems", () => {
  const doc = provisional(), r = { ...doc.page.regions[1], source: { continues_from_earlier: true, continues_later: true } };
  const middle = provisionalUnits(pid, [r], types);
  for (const unit of middle.units) assert.deepEqual(unit.open, { start: true, end: true });
  const boundary = provisionalUnits(pid, [r], types, { firstPage: true, lastPage: true });
  assert.ok(boundary.units.every(unit => !unit.open));
  assert.equal(boundary.problems.length, 2);
});

test("layer comparison includes markers and formatting while excluding provenance", () => {
  const doc = completed(), changed = structuredClone(doc);
  changed.source.extra = "different provenance";
  changed.page.regions[0].source.changed = true;
  for (const layer of ["regions", "text", "units"]) assert.equal(layerView(doc, layer), layerView(changed, layer));
  changed.page.regions[1].lines[0].spans = [{ start: 0, end: 1, kind: "bold" }];
  assert.notEqual(layerView(doc, "text"), layerView(changed, "text"));
  const edited = noteEdit(doc, changed);
  assert.equal(layerState(edited, "text").state, "edited");
  assert.equal(layerState(edited, "regions").state, "model");
  assert.equal(layerState(edited, "units").state, "model");
  assert.equal(layerState(noteEdit(doc, doc), "text").state, "model");
});

test("layer edits classify region geometry, line joins and presentation separately", () => {
  for (const [layer, edit] of [
    ["regions", doc => { doc.page.regions[1].box[0] += 2; }],
    ["regions", doc => { doc.page.regions[1].source.continues_later = true; }],
    ["text", doc => { doc.page.label = "14"; }],
    ["units", doc => { doc.page.regions[1].lines[0].end = "hyphen"; }],
    ["units", doc => { doc.units[0].style = { align: "center" }; }],
    ["units", doc => { doc.page.regions[0].lines[0].style = { weight: "bold" }; }],
  ]) {
    const doc = completed(), changed = structuredClone(doc);
    edit(changed);
    const result = noteEdit(doc, changed);
    for (const name of ["regions", "text", "units"]) assert.equal(layerState(result, name).state, name === layer ? "edited" : "model");
  }
});

test("legacy edits stay protected and accepting or sending back affects only its chosen layer", () => {
  for (const edited of [false, true]) {
    const legacy = completed();
    delete legacy.source.layers;
    if (edited) legacy.source.edited = "2026-11-08T00:00:00Z";
    const before = structuredClone(legacy);
    for (const layer of ["regions", "text", "units"]) {
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

test("rebuilding provisional units after a region edit leaves them replaceable", () => {
  const doc = provisional(), changed = structuredClone(doc);
  changed.page.regions[1].type = "quotation";
  Object.assign(changed, provisionalUnits(pid, changed.page.regions, types));
  delete changed.problems;
  const edited = noteEdit(doc, changed);
  assert.equal(layerState(edited, "regions").state, "edited");
  assert.equal(layerState(edited, "units").state, "provisional");
  assert.equal(isProtected(edited, "units"), false);
  valid(edited);
});

test("new regions protect all accepted or edited layers and reuse text only on matching shapes", () => {
  const current = completed(), candidate = provisional(), before = structuredClone(current);
  const merged = mergeRegions(current, candidate, check);
  valid(merged.doc);
  assert.equal(layerView(merged.doc, "text"), layerView(current, "text"));
  assert.equal(layerState(merged.doc, "units").state, "provisional");
  const moved = provisional();
  moved.page.regions[1].polygons = polygon(300);
  const replacement = mergeRegions(current, moved, check);
  assert.equal(layerState(replacement.doc, "text"), null);
  for (const layer of ["regions", "text", "units"]) {
    const protectedDoc = accept(current, layer, "2026-11-09T00:00:00Z");
    const held = mergeRegions(protectedDoc, moved, check);
    assert.deepEqual(held.doc, protectedDoc);
    assert.equal(held.suggestion, true);
    assert.deepEqual(held.taken, []);
  }
  const invalid = provisional();
  invalid.units[0].type = "footnote";
  assert.equal(mergeRegions(current, invalid, check).suggestion, true);
  assert.deepEqual(current, before);
});

test("transcription parses formatting and page-wide markers and preserves geometry and joins", () => {
  const doc = provisional();
  doc.page.regions[1].lines[0].end = "line";
  const incoming = reading(doc, "<b>Word</b>[*]");
  const before = structuredClone(incoming), merged = mergeText(doc, incoming, types);
  valid(merged.doc);
  assert.equal(layerView(doc, "regions"), layerView(merged.doc, "regions"));
  assert.equal(layerView(doc, "units"), layerView(merged.doc, "units"));
  assert.equal(merged.doc.page.regions[1].lines[0].end, "line");
  const spans = merged.doc.page.regions[1].lines[0].spans;
  assert.deepEqual(spans, [{ start: 0, end: 4, kind: "bold" }, { start: 4, end: 4, kind: "note_marker", id: "m2", marker: "*" }]);
  assert.deepEqual(incoming, before);
  const protectedDoc = accept(merged.doc, "text", "2026-11-09T00:00:00Z");
  assert.deepEqual(mergeText(protectedDoc, reading(doc), types).doc, protectedDoc);
  assert.equal(mergeText(protectedDoc, incoming, types).suggestion, false);
  const moved = structuredClone(doc);
  moved.page.regions[1].polygons = polygon(300);
  assert.equal(mergeText(moved, incoming, types).suggestion, true);
});

test("transcribing a legacy page with missing text preserves the protection of its other layers", () => {
  const legacy = provisional();
  delete legacy.source.layers;
  assert.equal(layerState(legacy, "text"), null);
  const merged = mergeText(legacy, reading(legacy), types).doc;
  valid(merged);
  assert.equal(isProtected(merged, "regions"), true);
  assert.equal(isProtected(merged, "units"), true);
  assert.equal(isProtected(merged, "text"), false);
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

test("new OCR cannot silently redirect protected note links by renumbering or changing markers", () => {
  const doc = completed();
  doc.source.layers.units.state = "edited";
  doc.page.regions[1].lines[0].spans = [{ start: 4, end: 4, kind: "note_marker", id: "m1", marker: "*" }];
  doc.relations = [{ type: "note", from: { region: "p1#r2", line: 20, anchor: "p1#m1", marker: "*" },
    to: { unit: doc.units.find(unit => unit.type === "footnote").id } }];
  valid(doc);
  const incoming = reading(doc);
  incoming.parsed.regions[1].lines[0].text = "Text[†] r2";
  const held = mergeText(doc, incoming, types);
  assert.equal(held.suggestion, true);
  assert.deepEqual(held.doc, doc);
});

test("completion can retype unprotected regions and preserves accepted region types", () => {
  const current = completed(), candidate = structuredClone(current);
  candidate.page.regions[1].type = "quotation";
  candidate.units.find(unit => unit.children.some(child => child.region === "p1#r2")).type = "quotation";
  const free = mergeCompletion(current, candidate, types, check);
  valid(free.doc);
  assert.equal(free.doc.page.regions[1].type, "quotation");
  const protectedDoc = accept(current, "regions", "2026-11-09T00:00:00Z");
  const kept = mergeCompletion(protectedDoc, candidate, types, check);
  valid(kept.doc);
  assert.equal(kept.doc.page.regions[1].type, "paragraph");
  assert.equal(kept.doc.units.find(unit => unit.children.some(child => child.region === "p1#r2")).type, "paragraph");
  assert.equal(kept.suggestion, true);
  assert.equal(layerState(kept.doc, "regions").accepted, true);
});

test("completion holds invalid grouping, stale geometry and stale marker or formatting inputs", () => {
  const current = completed(), candidate = structuredClone(current);
  candidate.units[0].type = "verse";
  assert.deepEqual(mergeCompletion(current, candidate, types, check).doc, current);
  for (const change of [doc => { doc.page.regions[0].polygons = polygon(400); },
    doc => { doc.page.regions[1].lines[0].text = "Changed"; },
    doc => { doc.page.regions[1].lines[0].spans = [{ start: 0, end: 1, kind: "bold" }]; }]) {
    const changed = structuredClone(current);
    change(changed);
    assert.equal(mergeCompletion(current, changed, types, check).suggestion, true);
    assert.deepEqual(mergeCompletion(current, changed, types, check).taken, []);
  }
});

test("protected region types reject a candidate that mixes them in one leaf unit", () => {
  const current = accept(completed(), "regions", "2026-11-09T00:00:00Z"), candidate = structuredClone(current);
  candidate.page.regions[0].type = "paragraph";
  const heading = candidate.units.find(unit => unit.type === "heading");
  const paragraph = candidate.units.find(unit => unit.type === "paragraph");
  paragraph.children.unshift(...heading.children);
  for (const unit of candidate.units) unit.children = unit.children.filter(child => child.unit !== heading.id);
  candidate.units = candidate.units.filter(unit => unit.id !== heading.id);
  valid(candidate);
  const held = mergeCompletion(current, candidate, types, check);
  assert.deepEqual(held.doc, current);
  assert.equal(held.suggestion, true);
});

test("protected units retain their IDs and edits while empty metadata and matched note links can be filled", () => {
  const current = completed();
  current.source.layers.units.state = "edited";
  const line = current.page.regions[1].lines[0];
  line.spans = [{ start: 4, end: 4, kind: "note_marker", id: "personal_marker", marker: "*" }];
  current.units[0].label = "My title";
  const candidate = renamedIds(current);
  candidate.units[0].label = "Model title";
  candidate.units.find(unit => unit.children.some(child => child.region === "p1#r2")).number = "7";
  candidate.page.regions[1].lines[0].spans[0].id = "m1";
  candidate.relations = [{ type: "note", from: { region: "p1#r2", line: 20, anchor: "p1#m1", marker: "*" },
    to: { unit: candidate.units.find(unit => unit.type === "footnote").id } }];
  valid(candidate);
  const before = structuredClone(current), merged = mergeCompletion(current, candidate, types, check);
  valid(merged.doc);
  assert.deepEqual(merged.doc.units.map(unit => unit.id), current.units.map(unit => unit.id));
  assert.equal(merged.doc.units[0].label, "My title");
  assert.equal(merged.doc.units.find(unit => unit.type === "paragraph").number, "7");
  assert.equal(merged.doc.relations[0].from.anchor, "p1#personal_marker");
  assert.equal(merged.doc.relations[0].to.unit, current.units.find(unit => unit.type === "footnote").id);
  assert.equal(merged.suggestion, true);
  assert.equal(layerState(merged.doc, "units").state, "edited");
  assert.deepEqual(current, before);
  assert.equal(mergeCompletion(current, renamedIds(current), types, check).suggestion, false, "model-local IDs alone are immaterial");
});

test("completion fills empty note links while retaining a person's existing destination", () => {
  const current = completed();
  current.source.layers.units.state = "edited";
  current.page.regions[1].lines[0].spans = [{ start: 4, end: 4, kind: "note_marker", id: "m1", marker: "*" }];
  const target = current.units.find(unit => unit.type === "footnote").id;
  current.relations = [{ type: "note", from: { region: "p1#r2", line: 20, anchor: "p1#m1", marker: "*" }, to: { unit: target } }];
  const candidate = structuredClone(current);
  delete candidate.relations[0].from.marker;
  candidate.relations[0].to.unit = current.units.find(unit => unit.type === "paragraph").id;
  valid(candidate);
  const merged = mergeCompletion(current, candidate, types, check);
  valid(merged.doc);
  assert.deepEqual(merged.doc.relations, current.relations);
  assert.equal(merged.suggestion, true);
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
