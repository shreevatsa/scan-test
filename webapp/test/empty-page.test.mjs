// A page with no content: no regions, as "No content on this page" in Regions leaves it (a library's cover, a blank
// page, a page that is not part of the book). It is valid, moves on to Text and to Read with no model call, counts as
// done there, shows nothing in Read, and no unit joins across it. Run from the repository root:
//   node --test webapp/test/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Book, idb } from "../js/store.js";
import { Maker } from "../js/pipeline/run.js";
import { runBatch } from "../js/pipeline/batch.js";
import { movePage, eligible, pageStages, reviewPageStates, readingDocuments, readingGaps, noContent, breakAtEmptyPages, stageFlags } from "../js/workflow.js";
import { prepare, bookHtml } from "../js/reader.js";
import { assemble } from "../js/assemble.js";
import { accept, layerState, noteEdit } from "../js/layers.js";
import { makeValidator, checkPage } from "../js/schema.js";
import { provisionalDocument, rebuildProvisional } from "../js/pipeline/provisional.js";
import * as ops from "../js/ops.js";

const validate = makeValidator(JSON.parse(readFileSync(new URL("../schema.json", import.meta.url))));
const types = { format: "types", schema_version: "0.2", book_id: "empty", title: "Empty", flows: { main: "Main" },
  types: { paragraph: { description: "Paragraph", region: "paragraph", flow: "main" } } };
const check = doc => checkPage(validate, doc, types);
const id = n => `empty-page-00${n}`;
const ring = [[[10, 10], [90, 10], [90, 30], [10, 30]]];

// A transcribed page whose paragraph goes on from the page before and onto the next, its regions and text moved on.
const page = pid => {
  const doc = provisionalDocument(pid, { image: `${pid}.png`, image_sha256: "a".repeat(64), width: 100, height: 100 }, types,
    { regions: [{ region_id: 1, type: "paragraph", region_class: "paragraph", keep: true, reading_order: 1, status: "ok", polygons: ring,
      model_box: [10, 10, 90, 30], bounds: [10, 10, 90, 30], continues_from_earlier: true, continues_later: true, lines: [{ line_id: 1, polygons: ring }] }],
      uncovered_lines: [{ line_id: 9, box: [0, 50, 100, 60] }], warnings: ["Kept region 2 has no reading order."] });
  doc.page.regions[0].lines[0].text = "Printed";
  doc.source.layers.text = { state: "model", types_revision: 1 };
  doc.source.layers.units.state = "model";
  return accept(accept(doc, "regions"), "text");
};

// In-memory stand-in for the File System Access API's directory handles (as in disk-copy.test.mjs).
function folder(files, prefix = "", name = "book") {
  const children = () => {
    const names = new Map();
    for (const path of files.keys()) if (path.startsWith(prefix)) {
      const rest = path.slice(prefix.length), cut = rest.indexOf("/");
      names.set(cut < 0 ? rest : rest.slice(0, cut), cut < 0 ? "file" : "directory");
    }
    return names;
  };
  const missing = () => new DOMException("A requested file or directory could not be found.", "NotFoundError");
  const file = path => ({ kind: "file", name: path.split("/").at(-1),
    async getFile() {
      if (!files.has(path)) throw missing();
      const value = files.get(path);
      return { size: value.length, text: async () => value, arrayBuffer: async () => new TextEncoder().encode(value).buffer };
    },
    async createWritable() {
      let data = null;
      return { async write(value) { data = typeof value === "string" ? value : await value.text(); }, async close() { files.set(path, data); } };
    } });
  return {
    kind: "directory", name,
    async getDirectoryHandle(n, { create = false } = {}) {
      if (!create && children().get(n) !== "directory") throw missing();
      return folder(files, `${prefix}${n}/`, n);
    },
    async getFileHandle(n, { create = false } = {}) {
      if (!create && !files.has(prefix + n)) throw missing();
      return file(prefix + n);
    },
    async removeEntry(n) {
      let found = files.delete(prefix + n);
      for (const path of [...files.keys()]) if (path.startsWith(`${prefix}${n}/`)) { files.delete(path); found = true; }
      if (!found) throw missing();
    },
    async *entries() {
      for (const [n, kind] of children()) yield [n, kind === "file" ? file(prefix + n) : folder(files, `${prefix}${n}/`, n)];
    },
  };
}

function withMemoryIdb(run) {
  return async () => {
    const original = { ...idb }, values = new Map();
    const key = (store, item) => JSON.stringify([store, item]);
    idb.get = async (store, item) => structuredClone(values.get(key(store, item)));
    idb.put = async (store, item, value) => { values.set(key(store, item), structuredClone(value)); };
    idb.del = async (store, item) => { values.delete(key(store, item)); };
    idb.keys = async () => [];
    try { await run(); } finally { Object.assign(idb, original); }
  };
}

// Three pages, each with one paragraph going on across the page breaks; page 2 is the one with no content.
async function threePages() {
  const pages = [1, 2, 3].map(n => ({ id: id(n), document: `pages/${id(n)}.json`, label: null, valid: true, pdf_page: n, width: 100, height: 100 }));
  const manifest = { format: "book-folder", version: 1, book_id: "empty", title: "Empty", types: "types.json", pages };
  const files = new Map([["book.json", JSON.stringify(manifest)], ["types.json", JSON.stringify(types)],
    ...[1, 2, 3].map(n => [`pages/${id(n)}.json`, JSON.stringify(page(id(n)))])]);
  // Page 2 as the region finder left it: its regions not moved on yet.
  const second = page(id(2));
  delete second.source.layers.regions.accepted_at_utc;
  delete second.source.layers.text;
  delete second.page.regions[0].lines[0].text;
  second.source.layers.units.state = "provisional";
  files.set(`pages/${id(2)}.json`, JSON.stringify(second));
  return { files, book: await Book.openFolder(folder(files, "", "empty"), { browser: true }) };
}

// What the editor's "No content on this page" does: every region deleted in one Regions edit (the provisional units
// rebuilt, the layer states noted), saved as the person's version, then the regions moved on to Text.
async function markNoContent(book, pid) {
  const before = await book.current(pid), next = structuredClone(before);
  for (const region of [...next.page.regions]) ops.deleteRegion(next, region.id);
  delete next.source.uncovered_lines; delete next.source.omitted_regions; delete next.source.warnings;
  rebuildProvisional(next, types, { firstPage: false, lastPage: false });
  const edited = noteEdit(before, next, { focus: "regions" });
  assert.deepEqual(check(edited)[0], [], "a page with no regions passes the checks");
  await book.saveEdit(pid, ops.markEdited(edited, null), { focus: "regions" });
  return movePage(book, pid, "regions", true, check);
}

test("a page with no content moves on from Regions and Text and counts as done", withMemoryIdb(async () => {
  const { book } = await threePages();
  const moved = await markNoContent(book, id(2));
  assert.equal(moved.valid, true);
  let doc = await book.current(id(2));
  assert.equal(noContent(doc), true);
  assert.equal(layerState(doc, "regions").accepted, true, "its regions are moved on");
  assert.equal(layerState(doc, "regions").state, "edited", "as the person's version");
  let state = { ...pageStages(doc, types, ...check(doc)), runErrors: {} };
  assert.equal(eligible("text", state), true, "it is in Text");
  assert.equal(state.missing, 0, "with nothing to transcribe");
  const states = new Map(await Promise.all(book.pages.map(async item => [item.id, { ...pageStages(await book.current(item.id), types), runErrors: {} }])));
  reviewPageStates(book.pages, states, types);
  assert.deepEqual(stageFlags(states.get(id(2)), "regions"), [], "no review flags: no uncovered lines, unassigned regions or finder notes are left");
  assert.deepEqual(stageFlags(states.get(id(2)), "text"), []);

  // Moving on from Text needs no transcription: the page gets an empty text layer, moved on.
  assert.equal(layerState(doc, "text"), null);
  await movePage(book, id(2), "text", true, check);
  doc = await book.current(id(2));
  assert.equal(layerState(doc, "text").accepted, true);
  assert.deepEqual(check(doc)[0], []);
  state = { ...pageStages(doc, types), runErrors: {} };
  assert.equal(eligible("read", state), true, "it is in Read");
  assert.equal(layerState(doc, "units").state, "provisional", "its (empty) units need no completion");
}));

test("transcribing or completing a page with no content calls no model and costs nothing", withMemoryIdb(async () => {
  // The grids leave such a page out of their runs and estimates; if it is sent anyway, nothing is called.
  const { book } = await threePages();
  await markNoContent(book, id(2));
  const calls = [], costs = [];
  book.imageBlob = async () => new Blob(["image"], { type: "image/png" });
  book.work.set(`work/${id(2)}.regions.json`, { width: 100, height: 100, char_h: 10, regions: [] });
  const maker = new Maker(book, { keys: { gemini: "key", openai: "key" }, check, onCost: cost => costs.push(cost),
    request: async (...args) => { calls.push(args); throw new Error("no model call is expected"); } });
  const read = await runBatch({ maker, ids: [id(2)], stage: "text", limit: 1 });
  assert.deepEqual([read.failed, read.spend, calls.length], [0, 0, 0], "transcription: no call, no cost");
  await movePage(book, id(2), "text", true, check);
  const completed = await runBatch({ maker, ids: [id(2)], stage: "read", limit: 1 });
  assert.deepEqual([completed.failed, completed.spend, calls.length], [0, 0, 0], "completion: no call, no cost");
  assert.deepEqual(costs.filter(cost => cost), []);
  assert.deepEqual(check(await book.current(id(2))), [[], []]);
}));

test("Read shows nothing for a page with no content, joins no unit across it and reports no problem", withMemoryIdb(async () => {
  const { book } = await threePages();
  const docs = await book.all();
  const joined = assemble(docs, types)[0].units;
  assert.equal(joined.length, 1, "before: page 1's paragraph goes on through page 3");

  await markNoContent(book, id(2));
  await movePage(book, id(2), "text", true, check);
  const all = await book.all();
  assert.deepEqual(all.map(doc => doc.page.id), [1, 2, 3].map(id));
  // Read: every page moved on, so there is no gap to name, and no unit joins across the empty page.
  const read = readingDocuments(book.pages, all);
  assert.deepEqual(readingGaps(book.pages, new Set(read.map(doc => doc.page.id))), []);
  const P = prepare(read, types);
  assert.deepEqual(P.warnings, [], "no page break where units do not join");
  assert.equal(P.book.units.length, 2, "page 1's and page 3's paragraphs stay apart");
  assert.ok(!P.book.units.some(unit => unit.children.some(child => child.region.startsWith(id(1))) && unit.children.some(child => child.region.startsWith(id(3)))));
  assert.deepEqual([...P.provisionalPages], [], "the empty page's units are not waiting for completion");
  const html = bookHtml(P);
  assert.ok(html.includes(id(1)) && html.includes(id(3)));
  assert.ok(!html.includes(id(2)), "nothing of the empty page is shown");
  // Problems and the flags assemble the same way: no warning, and no flag on the pages either side.
  const states = new Map(all.map(doc => [doc.page.id, { ...pageStages(doc, types, ...check(doc)), runErrors: {} }]));
  const [, warnings] = assemble(breakAtEmptyPages(all), types);
  assert.deepEqual(warnings, []);
  reviewPageStates(book.pages, states, types, warnings);
  for (const n of [1, 2, 3]) assert.deepEqual(stageFlags(states.get(id(n)), "read"), [], `page ${n} has no Read flag`);
  for (const doc of all) assert.deepEqual(check(doc), [[], []], `${doc.page.id} passes the checks with no warning`);
}));

test("units join only between pages with content: an empty page breaks a join, and other pages are left alone", () => {
  const docs = [1, 2, 3].map(n => page(id(n)));
  assert.equal(breakAtEmptyPages(docs), docs, "with no empty page, the same documents");
  const empty = structuredClone(docs[1]);
  for (const region of [...empty.page.regions]) ops.deleteRegion(empty, region.id);
  const list = [docs[0], empty, docs[2]], snapshot = structuredClone(list);
  const out = breakAtEmptyPages(list);
  assert.deepEqual(out[0].units[0].open, { start: true }, "page 1's paragraph still continues the page before it");
  assert.deepEqual(out[2].units[0].open, { end: true }, "page 3's still goes on to the next");
  assert.deepEqual(list, snapshot, "the documents given are not changed");
  assert.equal(noContent(null), false, "a page with no document yet is not a page with no content");
});
