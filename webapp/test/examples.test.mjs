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
    assert.match(example.file, /^(samples\/)?[\w.-]+\.chaya\.pdf$/);
    if (example.url) assert.match(example.url, /^https:\/\/.+\.chaya\.pdf$/);
    assert.ok(example.title && example.blurb && Number.isInteger(example.pages));
  }
});

test("an example is offered at the first place its file is found, and left out when it is found nowhere", async () => {
  // Off line from R2 (its urls not found), the files of a checkout or a published site.
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

test("an example's own url, where it has one, comes first", async () => {
  const one = [{ file: "kale-1913.chaya.pdf", url: "https://files.example.net/books/kale-1913.chaya.pdf", title: "Kale", blurb: "x", pages: 252 }];
  const fetchImpl = async url => String(url).endsWith("examples.json") ? new Response(JSON.stringify(one))
    : new Response(null, { status: 200, headers: { "content-length": "100" } });
  const [found] = await loadExamples(base, fetchImpl);
  assert.equal(found.url, "https://files.example.net/books/kale-1913.chaya.pdf");
});
