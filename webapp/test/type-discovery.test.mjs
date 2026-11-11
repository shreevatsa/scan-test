import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { TYPE_MODELS, samplePages, discoverySchema, discoveryRequest, proposalTypes, discoverTypes } from "../js/pipeline/type-discovery.js";
import { makeValidator } from "../js/schema.js";
import { OVERVIEW_MODELS, contactSheetPlan, overviewBatches, overviewSchema, overviewRequest, validateOverview, discoverOverview } from "../js/pipeline/type-overview.js";

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

test("contact sheets cover every page once and bound images and payload in each request", () => {
  const plan = contactSheetPlan(267);
  assert.equal(plan.length, 14);
  assert.deepEqual(plan.flatMap(sheet => sheet.pages), Array.from({ length: 267 }, (_, index) => index + 1));
  assert.equal(plan.at(-1).pages.at(-1), 267);
  assert.ok(plan.every(sheet => sheet.width <= 2048 && sheet.height <= 2048));
  const largeBook = contactSheetPlan(700).map(sheet => ({ ...sheet, dataUrl: "a".repeat(800000) }));
  const batches = overviewBatches(largeBook);
  assert.ok(batches.length > 1);
  assert.ok(batches.every(batch => batch.length <= 16 && batch.reduce((sum, sheet) => sum + sheet.dataUrl.length, 0) < 12000000));
  assert.deepEqual(batches.flat().flatMap(sheet => sheet.pages), Array.from({ length: 700 }, (_, index) => index + 1));
});

test("overview inventory validates page coverage and type identities before deriving counts", () => {
  const value = { proposal, page_inventory: [{ page: 1, types: [], uncertain: false }, { page: 3, types: ["paragraph", "heading"], uncertain: true }] };
  assert.equal(validateOverview(value, context), value);
  for (const change of [
    p => p.page_inventory.pop(),
    p => { p.page_inventory[0].page = 3; },
    p => { p.page_inventory[0].page = 267; },
    p => { p.page_inventory[1].types.push("invented"); },
    p => { p.page_inventory[1].types.push("paragraph"); },
  ]) {
    const bad = structuredClone(value); change(bad);
    assert.throws(() => validateOverview(bad, context));
  }
  for (const profile of OVERVIEW_MODELS) {
    const request = overviewRequest(profile, "Survey the book", [{ ...contactSheetPlan(3)[0], dataUrl: "data:image/jpeg;base64,aW1hZ2U=" }], overviewSchema(schema));
    const content = profile.provider === "openai" ? request.input[0].content : request.input;
    assert.match(content[1].text, /PDF pages 1, 2, 3/);
    assert.equal(profile.request_timeout_ms, 300000);
    assert.equal(profile.provider === "openai" ? content[2].detail : content[2].mime_type, profile.provider === "openai" ? "original" : "image/jpeg");
  }
});

function overviewFixture() {
  const records = new Map();
  const store = { readWork: async path => structuredClone(records.get(path) || null),
    writeWork: async (path, value) => records.set(path, structuredClone(value)),
    updateWork: async (path, update) => records.set(path, update(records.get(path))) };
  const value = { proposal, page_inventory: [1, 2, 3].map(page => ({ page, types: ["paragraph"], uncertain: false })) };
  const calls = [];
  const args = { store, profile: OVERVIEW_MODELS[1], keys: { gemini: "fixture-secret" },
    sheets: [{ ...contactSheetPlan(3)[0], sha256: "a".repeat(64), dataUrl: "data:image/jpeg;base64,aW1hZ2U=" }],
    title: "Test", description: "", pageCount: 3, id: "test", pdfSha: "b".repeat(64), schema,
    request: async (provider, payload, key, auth) => {
      calls.push({ provider, payload, auth });
      return { body: { id: "overview-fixture", status: "completed", usage: { total_input_tokens: 100, total_output_tokens: 30, total_thought_tokens: 0 },
        outputs: [{ type: "text", text: JSON.stringify(value) }] }, seconds: 2 };
    } };
  return { records, store, calls, args };
}

test("whole-book proposals retain inventory, five-minute scope, charges and reusable batches", async () => {
  const { records, calls, args } = overviewFixture();
  const result = await discoverOverview(args);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].auth.timeout_ms, 300000);
  assert.equal(result.types.source.discovery.overviews[0].inventory.length, 3);
  assert.ok(result.call.cost_usd > 0);
  assert.equal(records.get(result.call.path).contact_sheets[0].sha256, "a".repeat(64));
  assert.ok(!JSON.stringify([...records]).includes("aW1hZ2U="));
  await discoverOverview(args);
  assert.equal(calls.length, 1);
  const changed = structuredClone(args.sheets);
  changed[0].sha256 = "c".repeat(64);
  // A changed image needs a new request even when its cell map is identical.
  changed[0].dataUrl = "data:image/jpeg;base64,bmV3";
  await discoverOverview({ ...args, sheets: changed });
  assert.equal(calls.length, 2);
});

test("overview recovers a paid response after its batch pointer failed to save", async () => {
  const { store, calls, args } = overviewFixture();
  const write = store.writeWork;
  let fail = true;
  store.writeWork = async (path, value) => {
    if (path.startsWith("work/type-discovery/overview/") && fail) { fail = false; throw Error("Interrupted pointer save"); }
    return write(path, value);
  };
  await assert.rejects(discoverOverview(args), /Interrupted pointer save/);
  const recovered = await discoverOverview(args);
  assert.ok(recovered.call.cost_usd > 0);
  assert.equal(calls.length, 1);
});

test("overview retains unresolved attempts and requires an explicit retry", async () => {
  const { args, records, calls } = overviewFixture();
  await assert.rejects(discoverOverview({ ...args, request: async () => { throw Error("Timed out"); } }), /Timed out/);
  await assert.rejects(discoverOverview(args), /unresolved charge/);
  assert.equal(calls.length, 0);
  await discoverOverview({ ...args, retryUnresolved: true });
  assert.equal(calls.length, 1);
  assert.equal(records.get("work/reader-lab/ledger.json").calls.length, 2);
});

test("type discovery samples span short and long PDFs with a neighboring middle page", () => {
  assert.deepEqual(samplePages(1), [1]);
  assert.deepEqual(samplePages(4), [1, 2, 3, 4]);
  assert.deepEqual(samplePages(267), [1, 2, 3, 40, 134, 135, 214, 267]);
});

test("both discovery models receive labeled page images and a strict bounded response schema", () => {
  const format = discoverySchema(schema);
  const images = [{ page: 3, dataUrl: "data:image/png;base64,aW1hZ2U=" }];
  assert.deepEqual(makeValidator(format)(proposal), []);
  for (const profile of TYPE_MODELS) {
    const request = discoveryRequest(profile, "Inspect these pages", images, format);
    assert.equal(request.store, false);
    assert.equal(request.max_output_tokens || request.generation_config.max_output_tokens, 16384);
    if (profile.provider === "openai") {
      assert.equal(request.text.format.strict, true);
      assert.equal(request.input[0].content[1].text, "PDF page 3");
      assert.equal(request.input[0].content[2].detail, "original");
    } else {
      assert.equal(request.input[1].text, "PDF page 3");
      assert.equal(request.input[2].data, "aW1hZ2U=");
      assert.equal(request.generation_config.thinking_level, "high");
    }
    const wholeBook = discoveryRequest(profile, "Inspect all pages", Array.from({ length: 267 }, (_, index) => ({ ...images[0], page: index + 1 })), format);
    const content = profile.provider === "openai" ? wholeBook.input[0].content : wholeBook.input;
    assert.equal(content.length, 535);
    assert.equal(content[533].text, "PDF page 267");
  }
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

test("discovery uses the call ledger, retains costs and redacts source images and credentials", async () => {
  const records = new Map();
  const store = { writeWork: async (path, value) => records.set(path, structuredClone(value)),
    updateWork: async (path, update) => records.set(path, update(records.get(path))) };
  const response = { id: "fixture-response", status: "completed", usage: { total_input_tokens: 100, total_output_tokens: 30, total_thought_tokens: 20 },
    outputs: [{ type: "text", text: JSON.stringify(proposal) }] };
  const args = { store, profile: TYPE_MODELS[1], keys: { gemini: "fixture-secret" }, images: [{ page: 3, dataUrl: "data:image/png;base64,aW1hZ2U=" }],
    title: "Test", description: "", pageCount: 267, id: "test", pdfSha: "a".repeat(64), schema,
    request: async () => ({ body: response, seconds: 2 }) };
  const result = await discoverTypes(args);
  assert.ok(result.call.cost_usd > 0);
  assert.equal(result.types.source.discovery.reviewed, false);
  assert.equal(result.types.source.discovery.call, result.call.path);
  assert.equal(records.get(result.call.path).status, "completed");
  const saved = JSON.stringify([...records]);
  assert.ok(!saved.includes("aW1hZ2U="));
  assert.ok(!saved.includes("fixture-secret"));
  await assert.rejects(discoverTypes({ ...args, request: async () => { throw new Error("Network failure"); } }), /Network failure/);
  const ledger = records.get("work/reader-lab/ledger.json");
  assert.equal(ledger.calls.length, 2);
  assert.equal(ledger.calls[1].status, "failed");
  assert.equal(ledger.calls[1].cost_usd, null);
});

test("the default Terra path prices cached input and preserves an invalid proposal's response and charge", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => new Response(readFileSync(url));
  try {
    const records = new Map();
    const store = { writeWork: async (path, value) => records.set(path, structuredClone(value)),
      updateWork: async (path, update) => records.set(path, update(records.get(path))) };
    const body = parsed => ({ id: "terra-fixture", status: "completed", service_tier: "standard",
      usage: { input_tokens: 100, output_tokens: 30, total_tokens: 130, input_tokens_details: { cached_tokens: 20, cache_write_tokens: 5 } },
      output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(parsed) }] }] });
    const args = { store, profile: TYPE_MODELS[0], keys: { openai: "fixture-secret" }, images: [{ page: 3, dataUrl: "data:image/png;base64,aW1hZ2U=" }],
      title: "Test", description: "", pageCount: 267, id: "test", pdfSha: "b".repeat(64), schema,
      request: async () => ({ body: body(proposal), seconds: 1 }) };
    const result = await discoverTypes(args);
    assert.equal(result.types.source.discovery.method, "077-gpt-6-1-terra-unit-types");
    assert.ok(result.call.cost_usd > 0);
    const invalid = structuredClone(proposal);
    invalid.types[0].contains = ["missing"];
    await assert.rejects(discoverTypes({ ...args, request: async () => ({ body: body(invalid), seconds: 1 }) }), /missing/);
    const failed = records.get("work/reader-lab/ledger.json").calls[1];
    assert.equal(failed.status, "failed");
    assert.ok(failed.cost_usd > 0);
    assert.deepEqual(records.get(failed.path).response, body(invalid));
  } finally { globalThis.fetch = originalFetch; }
});
