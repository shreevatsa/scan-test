import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { samplePages, discoverySchema, proposalTypes } from "../js/pipeline/type-discovery.js";
import { makeValidator } from "../js/schema.js";

const schema = JSON.parse(readFileSync(new URL("../schema.json", import.meta.url)));
const proposal = {
  description: "A book of articles.", languages: ["kn-Knda"], flows: [{ name: "main", description: "Articles in reading order." }],
  types: [
    { name: "article", description: "An article.", region: "container", contains: ["heading", "paragraph"], flow: "main", lang: "", role: "text", numbered: false, sample_pages: [3], evidence: "Article opening." },
    { name: "heading", description: "An article title.", region: "heading", contains: [], flow: "", lang: "", role: "text", numbered: false, sample_pages: [3], evidence: "Larger title above the prose." },
    { name: "paragraph", description: "A paragraph.", region: "paragraph", contains: [], flow: "", lang: "kn", role: "text", numbered: false, sample_pages: [3], evidence: "Body prose." },
    { name: "page_number", description: "Printed page number.", region: "page_number", contains: [], flow: "", lang: "", role: "furniture", numbered: false, sample_pages: [3], evidence: "Number at the bottom." },
  ], relations: [], inline: [], conventions: ["Unicode NFC, preserving the printed spelling."], questions: ["Check whether later articles contain verse."],
};
const context = { id: "test-book", title: "Test book", source: {}, schema, pages: [1, 3] };

test("proposal schemas accept the saved whole-list proposals", () => {
  assert.deepEqual(makeValidator(discoverySchema(schema))(proposal), []);
});

test("type discovery samples span short and long PDFs with a neighboring middle page", () => {
  assert.deepEqual(samplePages(1), [1]);
  assert.deepEqual(samplePages(4), [1, 2, 3, 4]);
  assert.deepEqual(samplePages(267), [1, 2, 3, 40, 134, 135, 214, 267]);
});

test("proposals become valid book types and reject broken grouping, duplicate names and unsupported evidence", () => {
  const types = proposalTypes(proposal, context);
  assert.deepEqual(makeValidator(schema)(types), []);
  assert.equal(types.types.article.region, undefined);
  assert.equal(types.types.page_number.role, "furniture");
  assert.equal(types.types.heading.flow, undefined);
  for (const change of [
    p => p.types.push(structuredClone(p.types[0])),
    p => { p.types[0].contains = ["missing"]; },
    p => { p.types[0].sample_pages = [267]; },
    p => { p.types[0].flow = "missing"; },
    p => { p.types[3].flow = "main"; },
    p => { p.flows.push({ name: "notes", description: "Notes." }); },
    p => { p.types = []; },
  ]) {
    const changed = structuredClone(proposal);
    change(changed);
    assert.throws(() => proposalTypes(changed, context));
  }
});

