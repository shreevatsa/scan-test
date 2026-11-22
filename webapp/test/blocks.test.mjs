import { test } from "node:test";
import assert from "node:assert/strict";
import { blockContext, pageBlocks, projectBlocks, readingProjection } from "../js/blocks.js";
import { workflowAddress, workflowRoute } from "../js/workflow.js";

test("the blocks address opens directly regardless of the current workflow stage", () => {
  const page = workflowAddress("blocks", "page 1", { region: "r1" });
  assert.equal(page, "#blocks&p=page%201&r=r1");
  assert.deepEqual(workflowRoute(page), { stage: "page", mode: "page", pid: "page 1",
    view: "", region: "r1", unit: null });
  assert.equal(workflowRoute("#blocks").mode, "read");
});

test("blocks build episode brackets and link notes without using saved units or rewriting the page", () => {
  const types = { book_id: "example", flows: { main: "Text", notes: "Notes" }, types: {
    section: { flow: "main", contains: ["section", "verse", "section_closing"] },
    verse: { flow: "main", region: "verse" },
    section_closing: { flow: "main", region: "heading" },
    footnote: { flow: "notes", region: "note" },
    page_number: { role: "furniture", region: "page_number" },
  } };
  const make = (id, type, order, ...lines) => ({ id, type, order, lines: lines.map(text => ({ text })) });
  const doc = { page: { id: "p1", pdf_page: 1, regions: [
    make("page", "page_number", null, "१"),
    make("verse", "verse", 1, "पाठः¹", "पाठः² ॥ १ ॥"),
    make("note", "footnote", 3, "१. टिप्पणी"),
    make("closing", "section_closing", 2, "इति कथा ॥ १ ॥"),
  ] }, units: [], flows: { main: [], notes: [] }, relations: [] };
  const before = structuredClone(doc);
  const { docs: [view], report } = projectBlocks([doc.page], [doc], types);
  const context = blockContext(view);
  assert.equal(context.get("verse").unit.number, "१");
  assert.deepEqual(context.get("verse").containers.map(unit => unit.label), [undefined, "कथा"]);
  assert.equal(view.page.label, "1");
  assert.equal(view.relations[0].to.unit, context.get("note").unit.id);
  assert.equal(report.links, 1);
  assert.match(view.page.regions.find(region => region.id === "verse").lines[1].text, /²/);
  assert.deepEqual(pageBlocks(doc, types).map(region => region.id), ["verse", "closing", "note", "page"]);
  assert.deepEqual(doc, before);
});

test("the reader keeps saved grouping and applies rules only to ungrouped pages", () => {
  const types = { flows: { main: "Text" }, types: { title: { flow: "main", contains: ["heading"] }, heading: { region: "heading", flow: "main" } } };
  const page = id => ({ format: "page", page: { id, regions: [{ id: "heading", type: "heading", order: 1, lines: [{ text: "Title" }] }] },
    source: { layers: { units: { state: "provisional" } } }, units: [], flows: { main: [] } });
  const saved = page("p1"), fresh = page("p2");
  saved.units = [{ id: "h", type: "heading", number: "i", children: [{ region: "p1#heading" }] },
    { id: "title", type: "title", label: "Printed title", children: [{ unit: "h" }] }];
  saved.flows.main = ["title"];
  saved.page.label = "iv";
  saved.page.regions[0].lines[0].end = "line";
  const before = structuredClone([saved, fresh]);
  const view = readingProjection([saved.page, fresh.page], [saved, fresh], types);
  assert.deepEqual(view.docs[0], saved);
  assert.deepEqual(view.docs[1].flows.main, ["u1"]);
  assert.deepEqual(view.docs[1].units[0].children, [{ region: "p2#heading" }]);
  assert.deepEqual([saved, fresh], before);
});
