// Saving a style sheet into a book folder (with an in-memory stand-in for the File System Access API's handles).
// Run from the repository root:  node --test webapp/test/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { Book, idb } from "../js/store.js";

function folder(files, prefix = "") {
  return {
    name: "book",
    async getDirectoryHandle(n, { create = false } = {}) {
      const path = `${prefix}${n}/`;
      if (!create && ![...files.keys()].some(key => key.startsWith(path))) throw new DOMException("Missing directory", "NotFoundError");
      return folder(files, path);
    },
    async removeEntry(n) {
      if (!files.delete(prefix + n)) throw new DOMException("Missing file", "NotFoundError");
    },
    async *entries() {
      for (const path of files.keys()) if (path.startsWith(prefix) && !path.slice(prefix.length).includes("/"))
        yield [path.slice(prefix.length), { kind: "file", getFile: async () => ({ text: async () => files.get(path) }) }];
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

function stageFixture() {
  const manifest = { format: "book-folder", book_id: "stage-store", title: "Stage test", types: "types.json",
    pages: [{ id: "p1", document: "pages/p1.json" }, { id: "p2", document: "pages/p2.json" }] };
  const model = { page: { id: "p1", regions: [], label: "old" }, units: [], source: { layers: {
    regions: { state: "model", accepted_at_utc: "reviewed" }, units: { state: "provisional" } } } };
  const edit = structuredClone(model);
  edit.page.label = "corrected";
  edit.source.layers.text = { state: "edited" };
  const files = new Map(Object.entries({ "book.json": manifest, "types.json": { types: {} },
    "pages/p1.json": model, "edits/p1.json": edit }).map(([path, value]) => [path, JSON.stringify(value)]));
  const handle = folder(files);
  const book = new Book("folder", handle, structuredClone(manifest), { types: {} }, { browser: true });
  book.edits.set("p1", edit);
  return { book, files, handle, edit };
}

test("stage saves recover after every file boundary and retain one protected previous document", async () => {
  const original = { ...idb };
  idb.get = async () => null;
  idb.del = async () => {};
  try {
    // Journal, history, model, manifest, old edit removal, journal removal.
    for (let boundary = 1; boundary <= 6; boundary++) {
      const { book, files, handle, edit } = stageFixture();
      const doc = structuredClone(edit);
      doc.page.label = "next";
      const write = book.writeFile.bind(book), remove = book.removeFile.bind(book);
      let operations = 0;
      const interrupt = () => { if (++operations === boundary) throw new Error("interrupted"); };
      book.writeFile = async (...args) => { await write(...args); interrupt(); };
      book.removeFile = async (...args) => { await remove(...args); interrupt(); };
      await assert.rejects(book.saveStage("p1", doc, true), /interrupted/);
      const reopened = await Book.openFolder(handle, { browser: true });
      assert.equal((await reopened.current("p1")).page.label, "next", `boundary ${boundary}`);
      assert.equal(reopened.page("p1").valid, true);
      assert.equal(files.has("edits/p1.json"), false);
      assert.equal(files.has(book.stagePath("p1")), false);
      assert.deepEqual(JSON.parse(files.get("work/history/p1.json")), edit);
      await reopened.recoverStages();
      assert.deepEqual(JSON.parse(files.get("work/history/p1.json")), edit);
    }
  } finally { Object.assign(idb, original); }
});

test("a failed journal write preserves the old edit and can be retried", async () => {
  const { book, files, edit } = stageFixture();
  book.draft = async () => null;
  const write = book.writeFile.bind(book);
  book.writeFile = async (path, value) => {
    if (path === book.stagePath("p1")) throw new Error("disk full");
    return write(path, value);
  };
  const doc = structuredClone(edit);
  doc.page.label = "next";
  await assert.rejects(book.saveStage("p1", doc, true), /disk full/);
  assert.equal((await book.current("p1")).page.label, "corrected");
  assert.equal(files.has(book.stagePath("p1")), false);
  book.writeFile = write;
  await book.saveStage("p1", doc, true);
  assert.equal((await book.current("p1")).page.label, "next");
});

test("stage updates reload corrections from another instance and serialize manifest updates", async () => {
  const { book, handle, files, edit } = stageFixture();
  const second = new Book("folder", handle, structuredClone(book.manifest), book.types, { browser: true });
  book.draft = second.draft = async () => null;
  book.clearDraft = second.clearDraft = async () => {};
  const newer = structuredClone(edit);
  newer.page.label = "newer correction";
  await second.saveEdit("p1", newer);
  assert.equal((await book.current("p1", { refresh: true })).page.label, "newer correction");
  await Promise.all([
    book.updateStage("p1", current => ({ doc: { ...current, extra: "merged" }, valid: true })),
    second.saveStage("p2", { page: { id: "p2", regions: [], label: "two" }, units: [] }, true),
  ]);
  assert.equal((await book.current("p1")).page.label, "newer correction");
  const saved = JSON.parse(files.get("book.json"));
  assert.deepEqual(saved.pages.map(page => page.label), ["newer correction", "two"]);
});

test("recovery retains a draft created after the interrupted save", async () => {
  const { book, files, edit } = stageFixture();
  const oldDraft = { at: 1, doc: edit };
  let draft = oldDraft;
  book.draft = async () => draft;
  book.clearDraft = async () => { draft = null; };
  const remove = book.removeFile.bind(book);
  book.removeFile = async path => {
    if (path.startsWith("edits/")) throw new Error("interrupted");
    return remove(path);
  };
  await assert.rejects(book.saveStage("p1", edit, true));
  draft = { at: 2, doc: { ...edit, newDraft: true } };
  book.removeFile = remove;
  await book.recoverStages();
  assert.equal(draft.at, 2);
  assert.equal(files.has(book.stagePath("p1")), false);
});

test("concurrent book instances append every processing charge to the ledger", async () => {
  const { book, handle } = stageFixture();
  const second = new Book("folder", handle, structuredClone(book.manifest), book.types, { browser: true });
  const path = "work/reader-lab/ledger.json";
  await second.readWork(path);
  await Promise.all([book, second, book, second].map((writer, index) => writer.updateWork(path,
    old => ({ calls: [...(old?.calls || []), { id: index, cost_usd: 0.1 }] }))));
  assert.equal((await book.readJson(path)).calls.length, 4);
});
