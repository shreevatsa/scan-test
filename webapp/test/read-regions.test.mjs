// Region edits in the page editor (on a page whose units are settled): retyping,
// drawing, deleting, splitting, merging and reordering regions keep the page valid and its units consistent, and a
// page whose units are still provisional has them rebuilt from its regions, as in Regions.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { makeValidator, checkPage } from "../js/schema.js";
import { rebuildProvisional } from "../js/pipeline/provisional.js";
import { layerState, noteEdit } from "../js/layers.js";
import { editorFocus, assertFocusEdit } from "../js/editing.js";
import * as ops from "../js/ops.js";

const validate = makeValidator(JSON.parse(readFileSync(new URL("../schema.json", import.meta.url))));
const types = { format: "types", schema_version: "0.2", book_id: "read-regions", title: "Regions in Read", flows: { main: "Main", notes: "Notes" },
  types: { section: { contains: ["section", "heading", "verse", "paragraph"], flow: "main" }, heading: { region: "heading" }, verse: { region: "verse" },
    paragraph: { region: "paragraph" }, note: { region: "note", flow: "notes" }, footer: { region: "running_header", role: "furniture" } },
  relations: { note: "Notes" } };
for (const [name, type] of Object.entries(types.types)) type.description = name;
const ring = (y, h = 8) => [ops.boxRing([10, y, 190, y + h])];
const line = (id, y, text, extra = {}) => ({ line: id, polygons: ring(y), text, ...extra });
const region = (id, type, y, h, order, lines) => ({ id, type, box: [10, y, 190, y + h], polygons: ring(y, h), order, lines });

// A section (open at the page's end) with a heading, two verses and a paragraph of two regions (open at the end);
// a note in the notes flow linked from a marker in the first verse; a running footer.
function page() {
  return { format: "page", schema_version: "0.2", book_id: types.book_id,
    page: { id: "p1", image: "p1.png", image_sha256: "a".repeat(64), width: 200, height: 300, regions: [
      region("r1", "heading", 10, 10, 1, [line(1, 10, "ಅಧ್ಯಾಯ")]),
      region("r2", "verse", 30, 30, 2, [line(2, 30, "first line", { spans: [{ kind: "note_marker", id: "m1", marker: "1", start: 5, end: 5 }] }), line(3, 50, "second line")]),
      region("r3", "verse", 70, 20, 3, [line(4, 70, "another verse")]),
      region("r4", "paragraph", 100, 20, 4, [line(5, 100, "prose")]),
      region("r5", "paragraph", 130, 20, 5, [line(6, 130, "goes on")]),
      region("r7", "note", 200, 20, 6, [line(7, 200, "the note")]),
      region("r6", "footer", 280, 10, null, [line(8, 280, "12")])] },
    units: [{ id: "u1", type: "section", open: { end: true }, children: [{ unit: "u2" }, { unit: "u3" }, { unit: "u4" }, { unit: "u5" }] },
      { id: "u2", type: "heading", children: [{ region: "p1#r1" }] }, { id: "u3", type: "verse", number: "1", children: [{ region: "p1#r2" }] },
      { id: "u4", type: "verse", number: "2", children: [{ region: "p1#r3" }] },
      { id: "u5", type: "paragraph", open: { end: true }, children: [{ region: "p1#r4" }, { region: "p1#r5" }] },
      { id: "n1", type: "note", children: [{ region: "p1#r7" }] }],
    flows: { main: ["u1"], notes: ["n1"] },
    relations: [{ type: "note", from: { anchor: "p1#m1" }, to: { unit: "n1" } }],
    source: { layers: Object.fromEntries(["regions", "text", "units"].map(layer => [layer, { state: "model", types_revision: 1 }])) } };
}
const valid = doc => { const [errors, warnings] = checkPage(validate, doc, types); assert.deepEqual(errors, []); assert.deepEqual(warnings.filter(w => /order/.test(w)), []); };
const kids = (doc, uid) => ops.unitById(doc, uid).children.map(c => c.unit || c.region);
const texts = doc => doc.page.regions.flatMap(r => (r.lines || []).map(L => L.text)).filter(Boolean).sort();

// As the editor does: Read's focus allows any edit, and the person's changes are noted as edits.
function readEdit(doc, fn) {
  const next = ops.clone(doc);
  fn(next);
  assertFocusEdit(editorFocus("read"), doc, next);
  if (layerState(next, "units").state === "provisional") rebuildProvisional(next, types);
  return noteEdit(doc, next, { focus: editorFocus("read") });
}

test("retyping a region alone in its unit retypes the unit where the type list allows it, or moves it where it may stand", () => {
  const base = page();
  const para = readEdit(base, d => ops.setRegionType(d, types, "r3", "paragraph"));
  valid(para);
  assert.equal(ops.unitById(para, "u4").type, "paragraph"); assert.equal(ops.unitById(para, "u4").number, "2");
  assert.deepEqual(kids(para, "u1"), ["u2", "u3", "u4", "u5"]);
  assert.equal(layerState(para, "units").state, "edited"); assert.equal(layerState(para, "regions").state, "edited");
  // A note may not stand in a section: the verse's unit leaves it and the region gets a note unit in the notes flow.
  const note = readEdit(base, d => ops.setRegionType(d, types, "r2", "note"));
  valid(note);
  assert.deepEqual(kids(note, "u1"), ["u2", "u4", "u5"]);
  assert.equal(note.flows.notes.length, 2);
  assert.equal(ops.ownerOf(note, "r2").type, "note");
  assert.deepEqual(texts(note), texts(base));
  assert.equal(note.relations.length, 1);   // the marker's link to the other note stays
});

test("retyping one region of several splits it out; furniture leaves its unit and comes back into the section", () => {
  const base = page();
  const verse = readEdit(base, d => ops.setRegionType(d, types, "r4", "verse"));
  valid(verse);
  assert.equal(ops.ownerOf(verse, "r4").type, "verse");
  const rest = ops.ownerOf(verse, "r5");
  assert.equal(rest.type, "paragraph"); assert.deepEqual(rest.open, { end: true }); assert.equal(kids(verse, "u1").at(-1), rest.id);
  const footer = readEdit(base, d => ops.setRegionType(d, types, "r3", "footer"));
  valid(footer);
  assert.equal(footer.units.some(u => u.id === "u4"), false); assert.equal(ops.regionById(footer, "r3").order, null);
  // The footer made a verse: into the section (the verse has no flow of its own), before its paragraph open at the end.
  const back = readEdit(base, d => ops.setRegionType(d, types, "r6", "verse"));
  valid(back);
  assert.equal(ops.placeOf(back, ops.ownerOf(back, "r6").id).parent.id, "u1");
  assert.equal(kids(back, "u1").at(-1), "u5");
  assert.deepEqual(texts(back), texts(base));
});

test("a drawn region gets a unit of its type where it is drawn, or joins the unit chosen", () => {
  const base = page();
  let rid;
  const drawn = readEdit(base, d => { rid = ops.addRegion(d, types, "verse", [10, 92, 190, 98]); });
  valid(drawn);
  const owner = ops.ownerOf(drawn, rid);
  assert.equal(owner.type, "verse"); assert.deepEqual(kids(drawn, "u1"), ["u2", "u3", "u4", owner.id, "u5"]);
  assert.deepEqual(ops.regionById(drawn, rid).lines, []);
  assert.equal(layerState(drawn, "units").state, "edited");
  const into = readEdit(base, d => { rid = ops.addRegion(d, types, "paragraph", [10, 160, 190, 170], "u5"); });
  valid(into);
  assert.deepEqual(kids(into, "u5"), ["p1#r4", "p1#r5", `p1#${rid}`]);
  // A heading drawn with a verse chosen (which cannot hold it) goes where it is drawn: first in the section.
  const heading = readEdit(base, d => { rid = ops.addRegion(d, types, "heading", [10, 2, 190, 8], "u3"); });
  valid(heading);
  assert.equal(kids(heading, "u1")[0], ops.ownerOf(heading, rid).id);
  const note = readEdit(base, d => { rid = ops.addRegion(d, types, "note", [10, 240, 190, 250]); });
  valid(note);
  assert.deepEqual(note.flows.notes, ["n1", ops.ownerOf(note, rid).id]);
});

test("a drawn region is placed where it is drawn unless the selected unit is chosen in the menu", () => {
  const base = page();
  // With the first verse's region selected, the menu offers its unit; the drawing alone does not use it.
  assert.equal(ops.drawnInto(base, { region: "r2" }), "u3");
  assert.equal(ops.drawnInto(base, { unit: "u5" }), "u5");
  assert.equal(ops.drawnInto(base, { region: "r6" }), null);   // furniture has no unit
  assert.equal(ops.drawnInto(base, {}), null);
  let rid;
  const placed = readEdit(base, d => { rid = ops.addRegion(d, types, "verse", [10, 92, 190, 98], null); });
  valid(placed);
  assert.deepEqual(kids(placed, "u1"), ["u2", "u3", "u4", ops.ownerOf(placed, rid).id, "u5"]);
  assert.deepEqual(kids(placed, "u3"), ["p1#r2"]);
  const chosen = readEdit(base, d => { rid = ops.addRegion(d, types, "verse", [10, 92, 190, 98], ops.drawnInto(base, { region: "r2" })); });
  valid(chosen);
  assert.deepEqual(kids(chosen, "u3"), ["p1#r2", `p1#${rid}`]);
});

test("deleting regions removes emptied units from their containers and flows, with relations to them", () => {
  const base = page();
  const one = readEdit(base, d => ops.deleteRegion(d, "r3"));
  valid(one);
  assert.deepEqual(kids(one, "u1"), ["u2", "u3", "u5"]);
  const note = readEdit(base, d => ops.deleteRegion(d, "r7"));
  valid(note);
  assert.deepEqual(note.flows.notes, []); assert.equal(note.relations, undefined);
  const all = readEdit(base, d => { for (const rid of ["r1", "r2", "r3", "r4", "r5"]) ops.deleteRegion(d, rid); });
  valid(all);
  assert.deepEqual(all.flows.main, []); assert.equal(all.units.some(u => u.id === "u1"), false);
  // The note marker went with its region, and so did its link.
  assert.equal(all.relations, undefined);
});

test("splitting and merging keep regions in their units, their text and their links", () => {
  const base = page();
  base.relations.push({ type: "note", from: { region: "p1#r2", line: 3 }, to: { unit: "n1" } });
  let nid;
  const split = readEdit(base, d => { nid = ops.splitRegionAt(d, "r2", 1); });
  valid(split);
  const second = ops.ownerOf(split, nid);
  assert.equal(second.type, "verse"); assert.deepEqual(kids(split, "u1"), ["u2", "u3", second.id, "u4", "u5"]);
  assert.equal(split.relations[1].from.region, `p1#${nid}`);
  assert.deepEqual(texts(split), texts(base));
  const same = readEdit(base, d => { nid = ops.splitRegionAt(d, "r2", 1, false); });
  valid(same);
  assert.deepEqual(kids(same, "u3"), ["p1#r2", `p1#${nid}`]);
  assert.throws(() => readEdit(base, d => ops.mergeRegions(d, types, "r2", "r3")), /different number/);
  delete base.units.find(u => u.id === "u4").number;
  const merged = readEdit(base, d => ops.mergeRegions(d, types, "r2", "r3"));
  valid(merged);
  assert.deepEqual(kids(merged, "u1"), ["u2", "u3", "u5"]); assert.equal(ops.regionById(merged, "r2").lines.length, 3);
  assert.deepEqual(texts(merged), texts(base));
  const paragraph = readEdit(base, d => ops.mergeRegions(d, types, "r4", "r5"));
  valid(paragraph);
  assert.deepEqual(ops.unitById(paragraph, "u5").open, { end: true });
  assert.throws(() => readEdit(base, d => ops.mergeRegions(d, types, "r2", "r6")), /same type/);
});

test("reading order moves a region among its unit's regions or its unit among its siblings", () => {
  const base = page();
  const earlier = readEdit(base, d => ops.moveRegionOrder(d, types, "r3", -1));
  valid(earlier);
  assert.deepEqual(kids(earlier, "u1"), ["u2", "u4", "u3", "u5"]);
  assert.equal(ops.regionById(earlier, "r3").order, 2);
  const within = readEdit(base, d => ops.moveRegionOrder(d, types, "r5", -1));
  valid(within);
  assert.deepEqual(kids(within, "u5"), ["p1#r5", "p1#r4"]);
  // The paragraph goes on to the next page, so it stays last; the heading is first in its section.
  assert.throws(() => readEdit(base, d => ops.moveRegionOrder(d, types, "r4", -1)), /stays last/);
  assert.throws(() => readEdit(base, d => ops.moveRegionOrder(d, types, "r1", -1)), /first in its section/);
});

test("a page whose units are still provisional has them rebuilt after a region edit", () => {
  const base = page();
  base.source.layers.units.state = "provisional";
  base.relations = [];   // provisional units have no links yet
  delete base.relations;
  const retyped = readEdit(base, d => ops.setRegionType(d, types, "r3", "paragraph"));
  assert.equal(layerState(retyped, "units").state, "provisional");
  assert.deepEqual(checkPage(validate, retyped, types)[0], []);
  assert.equal(ops.ownerOf(retyped, "r3").type, "paragraph");
  const deleted = readEdit(base, d => ops.deleteRegion(d, "r1"));
  assert.equal(layerState(deleted, "units").state, "provisional");
  assert.deepEqual(checkPage(validate, deleted, types)[0], []);
  let rid;
  const drawn = readEdit(base, d => { rid = ops.addRegion(d, types, "verse", [10, 92, 190, 98]); });
  assert.equal(layerState(drawn, "units").state, "provisional");
  assert.ok(ops.ownerOf(drawn, rid));
  assert.deepEqual(checkPage(validate, drawn, types)[0], []);
});

test("a region drawn inside nested sections open at both ends goes into the innermost", () => {
  const base = page();
  base.units.find(u => u.id === "u1").open = { start: true, end: true };
  base.units.push({ id: "s0", type: "section", open: { start: true, end: true }, children: [{ unit: "u1" }] });
  base.flows.main = ["s0"];
  valid(base);
  let rid;
  const drawn = readEdit(base, d => { rid = ops.addRegion(d, types, "verse", [10, 92, 190, 98]); });
  valid(drawn);
  assert.equal(ops.placeOf(drawn, ops.ownerOf(drawn, rid).id).parent.id, "u1");
  assert.deepEqual(kids(drawn, "s0"), ["u1"]);
});
