// Pages marked "not interesting" (dimmed): saved in book.json, a default for runs only.
// Run from the repository root:  node --test webapp/test/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { Book } from "../js/store.js";

function folder(files, prefix = "") {
  return {
    name: "book",
    async getDirectoryHandle(n, { create = false } = {}) {
      const path = `${prefix}${n}/`;
      if (!create && ![...files.keys()].some(key => key.startsWith(path))) throw new DOMException("Missing directory", "NotFoundError");
      return folder(files, path);
    },
    async getFileHandle(n, { create = false } = {}) {
      const path = prefix + n;
      if (!create && !files.has(path)) throw new DOMException("Missing file", "NotFoundError");
      return {
        async createWritable() { let buf = ""; return { async write(d) { buf += d; }, async close() { files.set(path, buf); } }; },
        async getFile() { return { text: async () => files.get(path) }; },
      };
    },
  };
}

function fixture() {
  const manifest = { format: "book-folder", version: 1, book_id: "b", title: "B", types: "types.json",
    pages: ["p1", "p2", "p3", "p4"].map(id => ({ id, document: `pages/${id}.json` })) };
  const files = new Map([["book.json", JSON.stringify(manifest)], ["types.json", JSON.stringify({ types: {} })]]);
  const book = new Book("folder", folder(files), structuredClone(manifest), { types: {} }, { browser: true });
  return { book, files };
}

test("dimming pages is saved in book.json in page order, announced as a change, and undone by bringing them back", async () => {
  const { book, files } = fixture();
  const changes = [];
  book.onChange = path => changes.push(path);
  assert.equal(book.skipped.size, 0);
  await book.setSkipped(["p3", "p1", "nope"], true);
  assert.deepEqual(JSON.parse(files.get("book.json")).skipped, ["p1", "p3"], "in page order, unknown ids ignored");
  assert.equal(book.isSkipped("p1"), true);
  assert.equal(book.isSkipped("p2"), false);
  assert.ok(changes.includes("book.json"), "the copy on disk is told");
  await book.setSkipped(["p1"], false);
  assert.deepEqual(JSON.parse(files.get("book.json")).skipped, ["p3"]);
  await book.setSkipped(["p3"], false);
  assert.equal("skipped" in JSON.parse(files.get("book.json")), false, "the field goes when nothing is dimmed");
  assert.equal(book.pages.length, 4, "the page list is never changed");
});

test("a read-only book cannot dim pages", async () => {
  const manifest = { format: "book-folder", version: 1, book_id: "b", title: "B", types: "types.json", pages: [{ id: "p1", document: "pages/p1.json" }] };
  const book = new Book("chaya", "x.chaya.pdf", manifest, { types: {} }, { files: {} });
  await assert.rejects(() => book.setSkipped(["p1"], true), /read only/);
});
