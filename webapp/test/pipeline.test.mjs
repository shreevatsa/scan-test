// Finder prompt templates and new type proposals.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { proposingPrompt, proposingSchema, scaleProposingRegions } from "../js/pipeline/proposing-finder.js";

const ROOT = new URL("../..", import.meta.url).pathname;
const read = p => readFileSync(join(ROOT, p), "utf8");

test("the templates are the methods' files", () => {
  assert.equal(read("webapp/pipeline/regions-prompt-template.txt"), read("methods/042-gpt-6.1-terra-none-book-types-continuations/prompt-template.txt"));
  assert.equal(read("webapp/pipeline/regions-schema-template.json"), read("methods/042-gpt-6.1-terra-none-book-types-continuations/response-schema-template.json"));
});

test("the finder accepts a proposed type and keeps its box available for review", () => {
  const tl = { title: "A book", types: { paragraph: { region: "paragraph", description: "Prose" } } };
  const template = read("webapp/pipeline/regions-proposals-prompt-template.txt");
  assert.match(proposingPrompt(tl, template), /Prose/);
  assert.doesNotMatch(proposingPrompt(tl, template), /<<PENDING/);
  const schema = proposingSchema(tl, JSON.parse(read("webapp/pipeline/regions-proposals-schema-template.json")));
  assert.deepEqual(schema.properties.regions.items.properties.type.enum, ["paragraph", "other"]);
  const { regions } = scaleProposingRegions({ new_types: [{ name: "A dedication", definition: "A dedication.", region_class: "paragraph" }], regions: [
    { type: "other", box_1000: [100, 100, 500, 800], keep: true, reading_order: 1, uncertain: false,
      continues_from_earlier: false, continues_later: false, proposed_type: "A dedication" },
  ] }, 1000, 1000, tl);
  assert.equal(regions[0].proposed_type, "A_dedication");
  assert.equal(regions[0].region_class, "paragraph");
});
