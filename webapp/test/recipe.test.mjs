// The default recipe, its stage lines and the cost estimate before a run.
// Run from the repository root:  node --test webapp/test/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { RECIPE, MEASURED_PAGE_COST, pageCost, dollars, perPageText, recipeLine, runEstimate, costBasis } from "../js/recipe.js";
import { finderById, FINDERS } from "../js/pipeline/finders.js";
import { readerById, structurerById, readerOptions } from "../js/pipeline/readers.js";

test("the recipe names Terra regions, Argon low transcription and Argon high completion, and is the default", () => {
  assert.equal(finderById(RECIPE.finder).method, "042+063");
  assert.equal(readerById(RECIPE.reader).label, "Gemini 4 Argon · low thinking");
  assert.equal(structurerById(RECIPE.structurer).label, "Gemini 4 Argon · high thinking");
  const defaults = readerOptions({}, { languages: ["sa"] });
  assert.equal(defaults.reader, RECIPE.reader);
  assert.equal(defaults.structurer, RECIPE.structurer);
  assert.equal(finderById().id, RECIPE.finder);
  assert.deepEqual(readerOptions(RECIPE, {}), { ...RECIPE, ocr_languages: "eng" }, "the recipe saves as reader options");
});

test("each stage has one line with its model and cost a page", () => {
  const terra = finderById(RECIPE.finder), argonLow = readerById(RECIPE.reader), argonHigh = structurerById(RECIPE.structurer);
  assert.equal(recipeLine("regions", terra, pageCost(terra)), "Regions with GPT-6.1 Terra · reasoning off · about $0.01 a page");
  assert.equal(recipeLine("text", argonLow, pageCost(argonLow)), "Text with Gemini 4 Argon · low thinking · about $0.038 a page");
  assert.equal(recipeLine("read", argonHigh, pageCost(argonHigh)), "Units and links with Gemini 4 Argon · high thinking · about $0.032 a page");
  assert.equal(recipeLine("regions", null, pageCost(null)), "Regions drawn by hand");
  const blocks = FINDERS.find(finder => finder.id === "local-blocks");
  assert.equal(perPageText(pageCost(blocks)), "free");
  assert.equal(recipeLine("regions", blocks, pageCost(blocks)), "Regions with Line blocks · free on this device");
  assert.equal(recipeLine("text", readerById("tesseract"), pageCost(readerById("tesseract"))), "Text with Tesseract · local OCR · free");
});

test("the estimate uses the book's own completed calls, else the measured figure, and never says unavailable", () => {
  const argonLow = readerById("argon-low");
  const measured = pageCost(argonLow);
  assert.deepEqual(measured, { usd: MEASURED_PAGE_COST["argon-low"], source: "measured", samples: 0 });
  assert.equal(runEstimate(267, measured), "267 pages to process · estimated new work $10.15 at $0.038 a page (measured on a 267-page scanned book). Cached results may reduce it.");
  const calls = [
    { profile: "argon-low", status: "completed", cost_usd: 0.05 }, { profile: "argon-low", status: "completed", cost_usd: 0.03 },
    { profile: "argon-low", status: "completed", cost_usd: 0.01, partial: true }, { profile: "argon-low", status: "failed", cost_usd: 0.02 },
    { profile: "argon-high", status: "completed", cost_usd: 0.4 }, { profile: "argon-low", status: "completed", cost_usd: null }];
  const own = pageCost(argonLow, calls);
  assert.deepEqual(own, { usd: 0.04, source: "book", samples: 2 }, "only whole completed calls with a cost, of this model");
  assert.match(runEstimate(1, own), /^1 page to process · estimated new work \$0\.04 at \$0\.04 a page \(the mean of this book's 2 completed calls\)/);
  const other = pageCost(readerById("flash-low"));
  assert.equal(other.source, "none");
  assert.equal(perPageText(other), "no cost measured yet");
  assert.doesNotMatch(runEstimate(5, other), /unavailable/);
  assert.match(costBasis(other), /process a few pages, or compare models/);
  assert.equal(runEstimate(3, pageCost(readerById("tesseract"))), "3 pages to process · free, on this device.");
});

test("dollars are written with as few digits as say them", () => {
  assert.deepEqual([0, 0.0037, 0.01, 0.038, 0.06, 0.1234, 10.146].map(dollars), ["$0", "$0.0037", "$0.01", "$0.038", "$0.06", "$0.12", "$10.15"]);
});
