// The pipeline's prompts and schemas against methods 042 and 055, for every type list in schema/types/.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import * as P from "../js/pipeline/prompts.js";

const ROOT = new URL("../..", import.meta.url).pathname;
const read = p => readFileSync(join(ROOT, p), "utf8");

test("the templates are the methods' files", () => {
  assert.equal(read("webapp/pipeline/regions-prompt-template.txt"), read("methods/042-gpt-6.1-terra-none-book-types-continuations/prompt-template.txt"));
  assert.equal(read("webapp/pipeline/regions-schema-template.json"), read("methods/042-gpt-6.1-terra-none-book-types-continuations/response-schema-template.json"));
  assert.equal(read("webapp/pipeline/transcription-prompt-template.txt"), read("methods/055-gemini-4-argon-low-region-transcription-formatting/prompt-template.txt"));
});

for (const f of readdirSync(join(ROOT, "schema/types")).filter(f => f.endsWith(".json"))) {
  test(`prompts and schemas: ${f}`, () => {
    const tl = JSON.parse(read(`schema/types/${f}`));
    const ids = ["r1", "r2", "r5"];
    const want = JSON.parse(execFileSync("uv", ["run", "--offline", "python", "webapp/test/py_reference.py", "prompts", `schema/types/${f}`, ids.join(",")], { cwd: ROOT, encoding: "utf8" }));
    assert.equal(P.regionPrompt(tl, read("webapp/pipeline/regions-prompt-template.txt")), want.region_prompt);
    assert.deepEqual(P.regionSchema(tl, JSON.parse(read("webapp/pipeline/regions-schema-template.json"))), want.region_schema);
    assert.equal(P.transcriptionPrompt(tl, read("webapp/pipeline/transcription-prompt-template.txt")), want.transcription_prompt);
    assert.deepEqual(P.transcriptionSchema(tl, ids), want.transcription_schema);
    assert.equal(P.regionCaption("r2", "verse", 1), want.caption);
  });
}

test("the bundled type lists are schema/types/'s", () => {
  for (const f of readdirSync(join(ROOT, "schema/types")).filter(f => f.endsWith(".json"))) assert.equal(read(`webapp/types/${f}`), read(`schema/types/${f}`), f);
});
