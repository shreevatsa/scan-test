// The front page's example books: listed only where their file is found, and linked through ?book=.
// Run from the repository root:  node --test webapp/test/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadExamples, exampleHref, exampleSize } from "../js/examples.js";

const manifest = JSON.parse(readFileSync(new URL("../examples.json", import.meta.url), "utf8"));
const base = "https://example.org/scan-test/webapp/js/main.js";

test("every example in the manifest names a title, a blurb, a file and a page count", () => {
  assert.ok(manifest.length >= 3);
  for (const example of manifest) {
    assert.match(example.file, /^[\w.-]+\.chaya\.pdf$/);
    assert.ok(example.title && example.blurb && Number.isInteger(example.pages));
  }
});

test("an example is offered at the first place its file is found, and left out when it is found nowhere", async () => {
  const have = new Set(["https://example.org/scan-test/webapp/examples/kale-1913.chaya.pdf", "https://example.org/scan-test/outputs/books/telang-dli.chaya.pdf"]);
  const fetchImpl = async (url, options) => {
    const href = String(url);
    if (href.endsWith("examples.json")) return new Response(JSON.stringify(manifest));
    assert.equal(options?.method, "HEAD");
    return have.has(href) ? new Response(null, { status: 200, headers: { "content-length": "15598212" } }) : new Response(null, { status: 404 });
  };
  const found = await loadExamples(base, fetchImpl);
  assert.deepEqual(found.map(example => example.file), ["kale-1913.chaya.pdf", "telang-dli.chaya.pdf"]);
  assert.equal(found[0].url, "https://example.org/scan-test/webapp/examples/kale-1913.chaya.pdf");
  assert.equal(found[1].url, "https://example.org/scan-test/outputs/books/telang-dli.chaya.pdf");
  assert.equal(exampleHref(found[0]), `?book=${encodeURIComponent(found[0].url)}`);
  assert.equal(exampleSize(found[0]), "16 MB");
});

test("a missing manifest or a failing network gives no examples and no error", async () => {
  assert.deepEqual(await loadExamples(base, async () => { throw new Error("offline"); }), []);
});
