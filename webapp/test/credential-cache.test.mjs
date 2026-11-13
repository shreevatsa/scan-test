// A successful key check is kept across reloads as a digest of the key, and applies only while the key is the same.
// Run from the repository root:  node --test webapp/test/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { CredentialChecks } from "../js/key-check.js";

const terra = { provider: "openai", model: "gpt-6.1-terra", reasoning: "none", label: "Terra" };
const argon = { provider: "gemini", model: "gemini-4-argon", thinking: "low", label: "Argon" };
const okOpenAI = async () => ({ body: { output: [{ type: "message", content: [{ type: "output_text", text: "OK" }] }] } });
const memory = () => { let records = []; return { load: async () => structuredClone(records), save: async next => { records = structuredClone(next); }, get records() { return records; } }; };

test("a successful check is remembered for the same key and model, never storing the key", async () => {
  const cache = memory();
  const first = new CredentialChecks({ openai: "sk-secret" }, okOpenAI, cache);
  await first.ready;
  assert.equal(first.status(terra), undefined, "nothing yet");
  const result = await first.check(terra);
  assert.equal(result.valid, true);
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(cache.records.length, 1);
  assert.ok(!JSON.stringify(cache.records).includes("sk-secret"), "only a digest is stored");

  const later = new CredentialChecks({ openai: "sk-secret" }, async () => { throw new Error("no request expected"); }, cache);
  await later.ready;
  assert.equal(later.status(terra)?.valid, true, "valid after a reload, with no request");
  assert.match(later.status(terra).message, /checked/);
  assert.equal(later.status(argon), undefined, "another provider's key is not covered");
});

test("a different key, or a changed model, is not covered by the saved check", async () => {
  const cache = memory();
  const first = new CredentialChecks({ openai: "sk-one" }, okOpenAI, cache);
  await first.ready; await first.check(terra);
  await new Promise(resolve => setTimeout(resolve, 20));
  const other = new CredentialChecks({ openai: "sk-two" }, okOpenAI, cache); await other.ready;
  assert.equal(other.status(terra), undefined);
  const same = new CredentialChecks({ openai: "sk-one" }, okOpenAI, cache); await same.ready;
  assert.equal(same.status({ ...terra, model: "gpt-other" }), undefined);
});

test("a failed check removes the saved success; without a cache nothing is kept", async () => {
  const cache = memory();
  const first = new CredentialChecks({ openai: "sk-one" }, okOpenAI, cache);
  await first.ready; await first.check(terra);
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(cache.records.length, 1);
  const again = new CredentialChecks({ openai: "sk-one" }, async () => { throw new Error("401"); }, cache);
  await again.ready;
  assert.equal(again.status(terra)?.valid, true, "loaded from the cache");
  const failed = await again.check(terra);
  assert.equal(failed.valid, false);
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(cache.records.length, 0, "the stale success is gone");
  const plain = new CredentialChecks({ openai: "sk-one" }, okOpenAI);
  await plain.ready; await plain.check(terra);
  assert.equal(plain.cache, null);
});
