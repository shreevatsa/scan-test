import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { proposalTypes } from "../js/pipeline/type-discovery.js";
import { proposalPackage, checkProposalPackage, keepProposalPackage } from "../js/type-proposal.js";

const schema = JSON.parse(readFileSync(new URL("../schema.json", import.meta.url)));
const pdfSha = "a".repeat(64);
const method = "077-gpt-6-1-terra-unit-types";
const path = "work/reader-calls/setup/unit-types-fixture-call.json";
const proposal = { description: "Prose book", languages: ["en"], flows: [{ name: "main", description: "Running text" }],
  types: [{ name: "paragraph", description: "A paragraph", region: "paragraph", contains: [], flow: "main", lang: "en",
    role: "text", numbered: false, sample_pages: [1], evidence: "Body prose" }], relations: [], inline: [], conventions: [], questions: [] };
const types = proposalTypes(proposal, { id: "book", title: "Book", schema, pages: [1], source: { discovery: {
  method, model: "Terra", pdf_sha256: pdfSha, sample_pages: [1], call: path, response_id: "response-1", reviewed: true } } });
const record = { id: "fixture-call", page: "setup", stage: "unit-types", status: "completed", profile: { id: "terra-types", method },
  response: { id: "response-1" }, cost_usd: 0.02, seconds: 1 };
const result = { types, proposal, call: { path, cost_usd: 0.02, seconds: 1 } };
const context = { pdfSha, pageCount: 267, schema };

test("saved proposals are bound to the source PDF and validated before review", () => {
  const packet = proposalPackage(result, record);
  const loaded = checkProposalPackage(packet, context);
  assert.equal(loaded.types.source.discovery.reviewed, false);
  assert.equal(packet.types.source.discovery.reviewed, true);
  assert.deepEqual(loaded.proposal, proposal);
  const allPages = proposalPackage(result, record);
  allPages.types.source.discovery.sample_pages = Array.from({ length: 267 }, (_, index) => index + 1);
  assert.equal(checkProposalPackage(allPages, context).types.source.discovery.sample_pages.length, 267);
  const configured = proposalPackage(result, record);
  configured.reader_options = { reader: "argon-low", structurer: "terra-structure", ocr_languages: "eng" };
  assert.deepEqual(checkProposalPackage(configured, context).reader_options, configured.reader_options);
  configured.reader_options.reader = "missing-model";
  assert.throws(() => checkProposalPackage(configured, context), /Unknown transcription model/);
  assert.throws(() => checkProposalPackage(packet, { ...context, pdfSha: "b".repeat(64) }), /different PDF/);
  for (const corrupt of [
    p => { p.version = 2; },
    p => { p.types.types.paragraph.contains = ["missing"]; },
    p => { p.types.source.discovery.sample_pages = [268]; },
    p => { p.types.source.discovery.sample_pages = [1, 1]; },
    p => { p.proposal.types[0].sample_pages = [2]; },
    p => { p.call.cost_usd = -1; },
    p => { p.call_record.cost_usd = 3; },
    p => { p.call.path = p.types.source.discovery.call = "../types.json"; },
    p => { p.call_record.id = "../bad"; },
  ]) {
    const changed = structuredClone(packet);
    corrupt(changed);
    assert.throws(() => checkProposalPackage(changed, context));
  }
});

test("importing a proposal preserves its API record and ledger through retries without credentials", async () => {
  const files = new Map();
  let interrupt = true;
  const store = { writeWork: async (path, value) => files.set(path, structuredClone(value)),
    updateWork: async (path, update) => {
      if (interrupt) throw new Error("Storage interruption");
      files.set(path, update(files.get(path)));
    } };
  const packet = proposalPackage(result, record);
  await assert.rejects(keepProposalPackage(store, packet, context), /Storage interruption/);
  assert.equal(files.has("work/type-discovery/selection.json"), false);
  interrupt = false;
  await keepProposalPackage(store, packet, context);
  await keepProposalPackage(store, packet, context);
  assert.deepEqual(files.get(path), record);
  assert.equal(files.get("work/reader-lab/ledger.json").calls.length, 1);
  assert.equal(files.get("work/reader-lab/ledger.json").calls[0].cost_usd, 0.02);
  assert.equal(files.get("work/type-discovery/selection.json").types.source.discovery.reviewed, false);
});
