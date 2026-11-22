import { test } from "node:test";
import assert from "node:assert/strict";
import { blockContext, pageBlocks, projectBlocks } from "../js/blocks.js";
import { workflowAddress, workflowRoute } from "../js/workflow.js";

test("the blocks address opens directly regardless of the current workflow stage", () => {
  const page = workflowAddress("blocks", "page 1", { region: "r1" });
  assert.equal(page, "#blocks&p=page%201&r=r1");
  assert.deepEqual(workflowRoute(page), { stage: "page", mode: "page", pid: "page 1",
    view: "blocks", region: "r1", unit: null });
  assert.equal(workflowRoute("#blocks").mode, "blocks-read");
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
