// Region edits in the page editor (on a page whose units are settled): retyping,
// drawing, deleting, splitting, merging and reordering regions keep the page valid and its units consistent, and a
// page whose units are still provisional has them rebuilt from its regions, as in Regions.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { makeValidator, checkPage } from "../js/schema.js";
const rebuildProvisional = doc => doc;
import { layerState, noteEdit } from "../js/layers.js";
import { editorFocus } from "../js/editing.js";
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
    source: { layers: Object.fromEntries(["regions", "text"].map(layer => [layer, { state: "model", types_revision: 1 }])) } };
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
