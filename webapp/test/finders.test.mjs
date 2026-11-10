import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyBlocks, lineBlocks, tesseractBlocks } from "../js/local/blocks.js";
import { finderById, finderPath, regionLayout, reviewedRegionLayout } from "../js/pipeline/finders.js";
import { readerOptions } from "../js/pipeline/readers.js";
import { FINDERS } from "../js/pipeline/finders.js";
import { finderRequest } from "../js/pipeline/finder-requests.js";
import { regionRequest } from "../js/pipeline/steps.js";
import { finderRequest as frozenFinderRequest } from "../../methods/081-gpt-6-astra-low-book-regions/snapshot/js/pipeline/finder-requests.js";

test("local block guesses require one matching book type and retain ambiguous blocks for review", () => {
  const blocks = [{ box: [200, 20, 400, 40], column: 0, line_count: 1, text_height: 20 },
    { box: [100, 180, 900, 600], column: 0, line_count: 12, text_height: 24 },
    { box: [100, 800, 900, 870], column: 0, line_count: 4, text_height: 12 }];
  const types = { types: { header: { region: "running_header", role: "furniture" },
    paragraph: { region: "paragraph" }, translation: { region: "paragraph" }, footnote: { region: "note" } } };
  const result = classifyBlocks(blocks, 1000, 1000, types);
  assert.deepEqual(result.map(region => region.type), ["header", "other", "footnote"]);
  assert.deepEqual(result.map(region => region.reading_order), [null, 1, 2]);
  assert.ok(result.every(region => region.uncertain));
  assert.equal(result[1].keep, true);
  assert.equal(result[0].keep, false);
  assert.equal(blocks[0].box[0], 200);
});

test("line blocks use spacing, indentation, size and columns without joining detached empty bands", () => {
  const boxes = [[10, 20, 100, 30], [10, 36, 100, 46], [30, 52, 100, 62], [10, 100, 100, 110], [150, 20, 240, 30]];
  const comp = { count: 6, role: [0, 1, 1, 1, 1, 1],
    x0: [0, ...boxes.map(box => box[0])], y0: [0, ...boxes.map(box => box[1])],
    x1: [0, ...boxes.map(box => box[2])], y1: [0, ...boxes.map(box => box[3])] };
  const seg = { lineOf: [-1, 0, 1, 2, 3, 4], lines: boxes.map((box, index) => ({
    line_id: index, column: index === 4 ? 1 : 0, center: box[1] + 5,
    core_top: box[1], core_bottom: box[3], rx0: box[0], rx1: box[2] })) };
  const result = lineBlocks({ status: "ok", comp, seg, charH: 10 });
  assert.deepEqual(result.map(block => block.line_count), [2, 1, 1, 1]);
  assert.deepEqual(result[0].box, [10, 20, 100, 46]);
  assert.deepEqual(lineBlocks({ status: "too_little_text" }), []);
});

test("Tesseract layout retains paragraph order and drops invalid or empty boxes", () => {
  const result = tesseractBlocks({ blocks: [{ paragraphs: [
    { bbox: { x0: 20, y0: 30, x1: 100, y1: 90 }, lines: [{ bbox: { y0: 30, y1: 50 } }, { bbox: { y0: 60, y1: 90 } }] },
    { bbox: { x0: 1, y0: 1, x1: 0, y1: 10 }, lines: [{}] },
    { bbox: { x0: 0, y0: 1, x1: 10, y1: 10 }, lines: [] },
  ] }] });
  assert.deepEqual(result, [{ box: [20, 30, 100, 90], column: 0, line_count: 2, text_height: 25 }]);
  assert.deepEqual(tesseractBlocks({}), []);
});

test("region finder choices preserve legacy defaults and the other stage choices", () => {
  assert.equal(finderById().id, "terra-regions");
  assert.equal(finderPath("p1", "local-blocks"), "work/region-finders/p1/local-blocks.json");
  assert.equal(readerOptions({ finder: "local-blocks", reader: "flash-low" }).finder, "local-blocks");
  assert.equal(readerOptions({ finder: "local-blocks", reader: "flash-low" }).reader, "flash-low");
  assert.throws(() => readerOptions({ finder: "missing" }), /Unknown region finder/);
});

test("reviewed layout matches ignore local IDs and expire after geometry or type changes", () => {
  const current = { page: { image_sha256: "image", width: 100, height: 100, regions: [
    { id: "r1", type: "paragraph", order: 1, polygons: [[[0, 0], [50, 0], [50, 50]]],
      lines: [{ line: 4, polygons: [[[0, 0], [50, 0], [50, 10]]], text: "Current transcription" }] },
  ] }, source: {} };
  const candidate = structuredClone(current);
  candidate.page.regions[0].id = "r99";
  candidate.page.regions[0].lines[0].line = 88;
  candidate.page.regions[0].lines[0].text = "Different transcription";
  assert.deepEqual(reviewedRegionLayout(current, candidate), { reviewed: 0, matches: 0 });
  current.source.review = { regions_page: { layout: regionLayout(current) } };
  assert.deepEqual(reviewedRegionLayout(current, candidate), { reviewed: 1, matches: 1 });
  candidate.page.regions[0].type = "verse";
  assert.deepEqual(reviewedRegionLayout(current, candidate), { reviewed: 1, matches: 0 });
  current.page.regions[0].polygons[0][0][0]++;
  assert.deepEqual(reviewedRegionLayout(current, candidate), { reviewed: 0, matches: 0 });
});

test("the Terra request stays compatible and each provider uses its evaluated model settings", () => {
  const image = "data:image/png;base64,YQ==", schema = { type: "object" };
  assert.deepEqual(finderRequest(finderById(), "prompt", schema, image), regionRequest("prompt", schema, image));
  for (const profile of FINDERS.filter(profile => profile.provider !== "local")) {
    const request = finderRequest(profile, "prompt", schema, image);
    assert.deepEqual(request, frozenFinderRequest(profile, "prompt", schema, image));
    assert.equal(request.model, profile.model);
    assert.equal(request.max_output_tokens || request.generation_config.max_output_tokens, 16384);
    assert.equal(request.store, false);
    if (profile.provider === "openai") assert.equal(request.reasoning.effort, profile.reasoning);
    else {
      assert.equal(request.generation_config.thinking_level, profile.thinking);
      assert.equal(request.input[1].data, "YQ==");
    }
  }
});
