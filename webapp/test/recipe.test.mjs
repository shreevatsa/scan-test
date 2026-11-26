// The default recipe, its stage lines and the cost estimate before a run.
// Run from the repository root:  node --test webapp/test/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { RECIPE, MEASURED_PAGE_COST, pageCost, dollars } from "../js/recipe.js";
import { finderById } from "../js/pipeline/finders.js";
import { readerById, readerOptions } from "../js/pipeline/readers.js";

test("the recipe names Terra regions proposing types, Hydrogen low whole-page transcription and new books get it", () => {
  assert.equal(finderById(RECIPE.finder).method, "097-terra-regions-proposing-types");
  assert.equal(readerById(RECIPE.reader).label, "Gemini 4 Hydrogen · low thinking · whole page");
  const defaults = readerOptions({}, { languages: ["sa"] });
  assert.equal(defaults.reader, "argon-low", "a book that saved no reader keeps the one it had");
  assert.equal(finderById().id, "terra-regions", "a book that saved no finder keeps 042");
  assert.deepEqual(readerOptions(RECIPE, {}), { ...RECIPE, ocr_languages: "eng" }, "the recipe saves as reader options");
});

test("the estimate uses completed whole-page calls or the measured rate", () => {
  const argonLow = readerById("argon-low");
  const measured = pageCost(argonLow);
  assert.deepEqual(measured, { usd: MEASURED_PAGE_COST["argon-low"], source: "measured", samples: 0 });
  const calls = [
    { profile: "argon-low", status: "completed", cost_usd: 0.05 }, { profile: "argon-low", status: "completed", cost_usd: 0.03 },
    { profile: "argon-low", status: "completed", cost_usd: 0.01, partial: true }, { profile: "argon-low", status: "failed", cost_usd: 0.02 },
    { profile: "argon-high", status: "completed", cost_usd: 0.4 }, { profile: "argon-low", status: "completed", cost_usd: null }];
  const own = pageCost(argonLow, calls);
  assert.deepEqual(own, { usd: 0.04, source: "book", samples: 2 }, "only whole completed calls with a cost, of this model");
  assert.equal(pageCost(readerById("tesseract")).usd, 0);
  const other = pageCost(readerById("flash-low"));
  assert.equal(other.source, "none");
});

test("dollars are written with as few digits as say them", () => {
  assert.deepEqual([0, 0.0037, 0.01, 0.038, 0.06, 0.1234, 10.146].map(dollars), ["$0", "$0.0037", "$0.01", "$0.038", "$0.06", "$0.12", "$10.15"]);
});
