import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Maker } from "../js/pipeline/run.js";
import { revisedTypeList } from "../js/type-revisions.js";
import { PAGE_REVIEW_MODELS, pageReviewSchema, pageReviewPrompt, checkPageReview, typeAdditions, pendingTypeAdditions, requestPageReview, latestPageReview, pageReviewRegions } from "../js/pipeline/page-review.js";
import { pageReviewSchema as frozenSchema, pageReviewPrompt as frozenPrompt } from "../../methods/087-terra-page-region-review/snapshot/js/pipeline/page-review.js";

const types = { format: "types", schema_version: "0.3", book_id: "review", title: "Review fixture", languages: ["en"],
  types: { reference_entry: { region: "paragraph", description: "A reference", flow: "main" } }, flows: { main: "Main text" } };
const proposal = { explanation: "The heading and page-number entries identify a contents page. Use toc_entry for its entries.",
  new_types: [{ name: "toc_entry", description: "An entry in the table of contents, with its destination page number.", region: "paragraph", furniture: false, parent: "", flow: "main" }],
  regions: [{ type: "toc_entry", box_1000: [100, 100, 900, 300], keep: true, reading_order: 1, uncertain: false,
    continues_from_earlier: false, continues_later: false }] };
const realFetch = globalThis.fetch;
globalThis.fetch = async url => new Response(readFileSync(url));
after(() => { globalThis.fetch = realFetch; });

function fixture() {
  const files = new Map(), calls = [], costs = [];
  const book = { types: structuredClone(types), work: new Map(), pages: [{ id: "p1", pdf_page: 7 }], index: { p1: 0 },
    page: () => ({ id: "p1", pdf_page: 7 }), current: async () => null, draft: async () => null,
    readWork: async path => structuredClone(files.get(path) || null),
    writeWork: async (path, value) => { files.set(path, structuredClone(value)); },
    updateWork: async (path, update) => { const next = await update(structuredClone(files.get(path) || null)); files.set(path, structuredClone(next)); return next; },
    imageBlob: async () => new Blob(["scan"], { type: "image/png" }), imageUrl: async () => "blob:fixture",
  };
  files.set("work/p1.regions.json", { width: 100, height: 100, regions: [{ region_id: 1, type: "reference_entry", model_box: [5, 5, 90, 20], reading_order: 1 }] });
  const maker = new Maker(book, { keys: { openai: "fixture", gemini: "fixture" }, onCost: cost => costs.push(cost),
    request: async (provider, payload) => { calls.push({ provider, payload }); return { seconds: 1,
      body: { status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(proposal) }] }],
        outputs: [{ type: "text", text: JSON.stringify(proposal) }], usage: { input_tokens: 100, output_tokens: 100, total_tokens: 200,
          total_input_tokens: 100, total_output_tokens: 100, total_thought_tokens: 0, total_cached_tokens: 0 } } }; },
    outlines: async () => ({ charH: 10, angle: 0, method: "fixture", geometry: [{ rings: [[[10, 10], [90, 10], [90, 30], [10, 30]]],
      lines: [{ line_id: 1, rings: [[[10, 10], [90, 10], [90, 30], [10, 30]]] }] }], uncovered: [] }),
  });
  return { book, maker, files, calls, costs };
}

test("page review validates new types, ownership and complete region geometry", () => {
  const input = { types, page: 7, width: 100, height: 100, regions: [], instruction: "Propose a more specific type" };
  assert.deepEqual(pageReviewSchema(types), frozenSchema(types));
  assert.equal(pageReviewPrompt(input), frozenPrompt(input));
  assert.deepEqual(checkPageReview(proposal, types, 100, 100), proposal);
  assert.throws(() => checkPageReview(proposal, types, undefined, 100), /image dimensions/);
  const duplicate = structuredClone(proposal); duplicate.new_types[0].name = "reference_entry";
  assert.throws(() => checkPageReview(duplicate, types, 100, 100), /already/);
  const unknown = structuredClone(proposal); unknown.regions[0].type = "invented";
  assert.throws(() => checkPageReview(unknown, types, 100, 100), /type/);
  const invalid = structuredClone(proposal); invalid.regions[0].box_1000 = [900, 0, 100, 100];
  assert.throws(() => checkPageReview(invalid, types, 100, 100), /rectangle/);
  const orphan = structuredClone(proposal); orphan.new_types[0].flow = "";
  assert.throws(() => checkPageReview(orphan, types, 100, 100), /parent or flow/);
  const furniture = structuredClone(proposal); furniture.new_types[0].furniture = true;
  assert.throws(() => checkPageReview(furniture, types, 100, 100), /neither for furniture/);
});

test("type additions are reviewed individually and matching applied types are reusable", () => {
  const record = { parsed: proposal, input_types: types };
  const additions = pendingTypeAdditions(record, types);
  assert.equal(additions.length, 1);
  const revised = revisedTypeList(types, additions);
  assert.deepEqual(revised.types.reference_entry, types.types.reference_entry);
  assert.deepEqual(pendingTypeAdditions(record, revised), []);
  revised.types.toc_entry.description = "A different interpretation";
  assert.throws(() => pendingTypeAdditions(record, revised), /differs/);
  assert.equal(types.types.toc_entry, undefined);
});

test("both page review models retain their instruction, response and one-page cost without editing the book", async () => {
  for (const profile of PAGE_REVIEW_MODELS) {
    const { book, maker, files, calls, costs } = fixture();
    const original = structuredClone(book.types);
    const record = await requestPageReview(maker, "p1", profile, "Can you propose something more specific than reference_entry?");
    assert.deepEqual(book.types, original);
    assert.equal(calls.length, 1);
    assert.equal(costs.length, 1);
    assert.ok(costs[0] > 0);
    assert.equal(record.profile.method, profile.method);
    assert.match(JSON.stringify(calls[0].payload), /Can you propose something more specific/);
    assert.match(JSON.stringify(calls[0].payload), /PDF page 7/);
    assert.match(JSON.stringify(calls[0].payload), /reference_entry/);
    assert.equal(record.parsed.new_types[0].name, "toc_entry");
    assert.equal((await latestPageReview(book, "p1")).id, record.id);
    assert.equal(files.get("work/reader-lab/ledger.json").calls[0].stage, "page-review");
    assert.equal([...files.keys()].some(path => path.startsWith("pages/")), false);
  }
});

test("a saved response recovers when its latest pointer cannot be written", async () => {
  const { book, maker, calls } = fixture();
  const write = book.writeWork;
  book.writeWork = async (path, value) => { if (path.endsWith("/latest.json")) throw Error("Disk full"); await write(path, value); };
  await assert.rejects(requestPageReview(maker, "p1", PAGE_REVIEW_MODELS[0], "Review this page"), /Disk full/);
  const record = await latestPageReview(book, "p1");
  assert.equal(record.parsed.explanation, proposal.explanation);
  assert.equal(calls.length, 1);
});

test("invalid source dimensions stop before a paid page review", async () => {
  const { maker, files, calls } = fixture();
  delete files.get("work/p1.regions.json").width;
  await assert.rejects(requestPageReview(maker, "p1", PAGE_REVIEW_MODELS[0], "Review the page"), /image dimensions/);
  assert.equal(calls.length, 0);
});

test("region previews require reviewed types, preserve work and reject a changed scan", async () => {
  const { book, maker, files, calls } = fixture();
  const record = await requestPageReview(maker, "p1", PAGE_REVIEW_MODELS[0], "Propose a table of contents type");
  await assert.rejects(pageReviewRegions(maker, "p1", record), /type additions/);
  book.types = revisedTypeList(book.types, typeAdditions(proposal));
  const path = await pageReviewRegions(maker, "p1", record);
  const regions = files.get(path);
  assert.equal(regions.regions[0].type, "toc_entry");
  assert.equal(regions.region_call.path, record.path);
  assert.equal(files.get("work/p1.regions.json").regions[0].type, "reference_entry");
  assert.equal(await pageReviewRegions(maker, "p1", record), path);
  assert.equal(calls.length, 1);
  maker.outlines = async () => ({ charH: 10, angle: 0, method: "fixture", geometry: [{ rings: [], lines: [] }] });
  const emptyPath = await pageReviewRegions(maker, "p1", { ...record, id: "empty-layout" });
  assert.match(files.get(emptyPath).warnings[0], /found ink in 0 of 1/);
  book.imageBlob = async () => new Blob(["different scan"], { type: "image/png" });
  await assert.rejects(pageReviewRegions(maker, "p1", record), /scan has changed/);
});
