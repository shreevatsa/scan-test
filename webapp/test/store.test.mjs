// Saving a style sheet into a book folder (with an in-memory stand-in for the File System Access API's handles).
// Run from the repository root:  node --test webapp/test/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { Book } from "../js/store.js";

function folder(files, prefix = "") {
  return {
    name: "book",
    async getDirectoryHandle(n) { return folder(files, `${prefix}${n}/`); },
    async getFileHandle(n) {
      const path = prefix + n;
      return {
        async createWritable() { let buf = ""; return { async write(d) { buf += d; }, async close() { files.set(path, buf); } }; },
        async getFile() { return { text: async () => files.get(path) }; },
      };
    },
  };
}

test("a style sheet saved into a book folder is written as style.json and named in book.json", async () => {
  const files = new Map();
  const manifest = { format: "book-folder", version: 1, book_id: "b", title: "B", types: "types.json", pages: [] };
  const book = new Book("folder", folder(files), manifest, { types: {} });
  const sheet = { format: "style", schema_version: "0.3", book_id: "b", base: { size_pt: 11 }, types: { heading: { align: "center" } } };
  await book.saveStyle(sheet);
  assert.deepEqual(JSON.parse(files.get("style.json")), sheet);
  assert.equal(JSON.parse(files.get("book.json")).style, "style.json");
  assert.equal(book.style, sheet);
  files.delete("book.json");
  await book.saveStyle({ ...sheet, base: { size_pt: 12 } });
  assert.equal(JSON.parse(files.get("style.json")).base.size_pt, 12);
  assert.equal(files.has("book.json"), false, "book.json is written only when it did not name the style sheet");
});
