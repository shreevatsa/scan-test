// Leaving pages out of a book after it is made (Pages), and including them again: book.json's left_out, the included
// pages every other part sees, the left-out pages' work kept, reopening, a .chaya.pdf round trip, Read's gaps and the
// copy on disk's change notice. Run from the repository root:  node --test webapp/test/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Book, importChaya, restoreChaya, idb } from "../js/store.js";
import { writeChaya } from "../js/chayapdf.js";
import { readingDocuments, readingGaps, withoutLeftOutJoins, reviewPageStates, pageStages } from "../js/workflow.js";
import { assemble } from "../js/assemble.js";
import { accept } from "../js/layers.js";
import { makeValidator, checkPage } from "../js/schema.js";
import { provisionalDocument } from "../js/pipeline/provisional.js";
import { planTypeRevision } from "../js/type-revisions.js";

// An in-memory stand-in for the File System Access API's directory handles (as in disk-copy.test.mjs).
function folder(files, prefix = "", name = "book") {
  const children = () => {
    const names = new Map();
    for (const path of files.keys()) if (path.startsWith(prefix)) {
      const rest = path.slice(prefix.length), cut = rest.indexOf("/");
      names.set(cut < 0 ? rest : rest.slice(0, cut), cut < 0 ? "file" : "directory");
    }
    return names;
  };
  const file = path => ({ kind: "file", name: path.split("/").at(-1),
    async getFile() {
      if (!files.has(path)) throw new DOMException("A requested file or directory could not be found.", "NotFoundError");
      const value = files.get(path);
      return { size: typeof value === "string" ? value.length : value.byteLength, text: async () => typeof value === "string" ? value : new TextDecoder().decode(value),
        arrayBuffer: async () => (typeof value === "string" ? new TextEncoder().encode(value) : value).buffer };
    },
    async createWritable() {
      let data = null;
      return { async write(value) { data = value instanceof Blob ? new Uint8Array(await value.arrayBuffer()) : value; }, async close() { files.set(path, data); } };
    } });
  return {
    kind: "directory", name,
    async getDirectoryHandle(n, { create = false } = {}) {
      if (!create && children().get(n) !== "directory") throw new DOMException("A requested file or directory could not be found.", "NotFoundError");
      return folder(files, `${prefix}${n}/`, n);
    },
    async getFileHandle(n, { create = false } = {}) {
      if (!create && !files.has(prefix + n)) throw new DOMException("A requested file or directory could not be found.", "NotFoundError");
      return file(prefix + n);
    },
    async removeEntry(n) {
      let found = files.delete(prefix + n);
      for (const path of [...files.keys()]) if (path.startsWith(`${prefix}${n}/`)) { files.delete(path); found = true; }
      if (!found) throw new DOMException("A requested file or directory could not be found.", "NotFoundError");
    },
    async *entries() {
      for (const [n, kind] of children()) yield [n, kind === "file" ? file(prefix + n) : folder(files, `${prefix}${n}/`, n)];
    },
  };
}

function tinyPdf() {
  const objs = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 300] >>"];
  let out = "%PDF-1.4\n";
  const offsets = [];
  objs.forEach((value, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${value}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f\r\n` + offsets.map(o => `${String(o).padStart(10, "0")} 00000 n\r\n`).join("");
  return new TextEncoder().encode(out + `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
}

// Drafts and other browser records, in memory.
function withMemoryIdb(run) {
  return async () => {
    const original = { ...idb }, values = new Map();
    const key = (store, id) => JSON.stringify([store, id]);
    idb.get = async (store, id) => structuredClone(values.get(key(store, id)));
    idb.put = async (store, id, value) => { values.set(key(store, id), structuredClone(value)); };
    idb.del = async (store, id) => { values.delete(key(store, id)); };
    idb.keys = async () => [];
    try { await run(); } finally { Object.assign(idb, original); }
  };
}

const types = { flows: { main: "Main" }, types: { paragraph: { region: "paragraph", flow: "main" } } };
const id = n => `lo-page-00${n}`;
// A page whose paragraph goes on from the page before and onto the next, moved on to Read.
const page = (pid, text = "Printed") => accept(accept({ page: { id: pid, regions: [{ id: "r1", type: "paragraph", lines: [{ line: 1, polygons: [[[0, 0], [10, 0], [10, 10]]], text }] }] },
  units: [{ id: "u1", type: "paragraph", children: [{ region: `${pid}#r1` }], open: { start: true, end: true } }], flows: { main: ["u1"] },
  source: { layers: { regions: { state: "model", types_revision: 1 }, text: { state: "model", types_revision: 1 }, units: { state: "model", types_revision: 1 } } } }, "regions"), "text");

// A five-page book: pages 1–4 processed, page 3 also corrected and with a work record, page 5 not processed.
function fiveBook() {
  const pages = [1, 2, 3, 4, 5].map(n => ({ id: id(n), document: `pages/${id(n)}.json`, label: null, valid: n < 5 ? true : null, pdf_page: n, width: 100, height: 100 }));
  const manifest = { format: "book-folder", version: 1, book_id: "lo", title: "Left out", types: "types.json", pdf: { path: "source.pdf", name: "lo.pdf", page_count: 5 }, pages };
  const corrected = page(id(3), "Corrected");
  const files = new Map([["book.json", JSON.stringify(manifest)], ["types.json", JSON.stringify(types)], ["source.pdf", tinyPdf()],
    ...[1, 2, 3, 4].map(n => [`pages/${id(n)}.json`, JSON.stringify(page(id(n)))]),
    [`edits/${id(3)}.json`, JSON.stringify(corrected)], [`work/readings/${id(3)}/argon-low.json`, JSON.stringify({ cost_usd: 0.04 })]]);
  return { files, handle: folder(files, "", "lo"), corrected };
}
const ids = pages => pages.map(page => page.id);

test("pages left out are gone from the included list, numbers stay, nothing of theirs is deleted, and they come back", withMemoryIdb(async () => {
  const { files, handle, corrected } = fiveBook();
  const book = await Book.openFolder(handle, { browser: true });
  const changes = [];
  book.onChange = path => changes.push(path);
  assert.deepEqual(await book.pagesWithWork([id(3), id(5)]), [id(3)], "a page with documents has work; an unprocessed one has none");

  assert.deepEqual(await book.leaveOut([id(5), id(3)]), [id(3), id(5)]);
  assert.deepEqual(ids(book.pages), [id(1), id(2), id(4)]);
  assert.deepEqual(ids(book.allPages), [1, 2, 3, 4, 5].map(id));
  assert.deepEqual(book.index, { [id(1)]: 0, [id(2)]: 1, [id(4)]: 2 });
  assert.equal(book.number(id(4)), 4, "page numbers are places in the full list");
  assert.equal(book.page(id(3)).document, `pages/${id(3)}.json`, "a left-out page is still found by its id");
  assert.equal(book.isLeftOut(id(3)), true);
  assert.equal(book.projectionPages, 3, "a whole-book projection counts the included pages");
  assert.deepEqual(JSON.parse(files.get("book.json")).left_out, [id(3), id(5)], "book.json records them in page order");
  assert.deepEqual(changes, ["book.json"], "the copy on disk is told the book changed");
  for (const path of [`pages/${id(3)}.json`, `edits/${id(3)}.json`, `work/readings/${id(3)}/argon-low.json`]) assert.ok(files.has(path), path);

  assert.deepEqual((await book.all()).map(doc => doc.page.id), [id(1), id(2), id(4)], "Read and the exports load only included pages");
  assert.equal(book.neighbor(id(2), 1), null, "a left-out page is a gap");
  assert.equal(book.neighbor(id(4), -1), null);
  assert.equal(book.neighbor(id(1), 1).id, id(2));
  await assert.rejects(book.editPages([id(3)], docs => docs), /Page 3 is left out/);

  changes.length = 0;
  assert.deepEqual(await book.leaveOut([id(3)]), [], "leaving out a page already left out changes nothing");
  assert.deepEqual(changes, []);
  await assert.rejects(book.leaveOut([1, 2, 4].map(id)), /at least one page/);
  await assert.rejects(book.leaveOut(["nowhere"]), /Unknown page nowhere/);

  // Reopened from the same files: the same pages are left out, and their files are checked and kept.
  let reopened = await Book.openFolder(handle, { browser: true });
  assert.deepEqual(ids(reopened.pages), [id(1), id(2), id(4)]);
  assert.deepEqual(reopened.edits.get(id(3)), corrected, "a left-out page's correction is still loaded, to be saved with the book");
  assert.deepEqual(await reopened.unreadableFiles(), []);
  const lost = files.get(`pages/${id(3)}.json`);
  files.delete(`pages/${id(3)}.json`);
  assert.deepEqual((await reopened.unreadableFiles()).map(item => item.path), [`pages/${id(3)}.json`],
    "a lost file of a left-out page is reported, so a damaged book never replaces the copy on disk");
  files.set(`pages/${id(3)}.json`, lost);

  changes.length = 0;
  assert.deepEqual(await book.leaveOut([id(3)], false), [id(3)]);
  assert.deepEqual(ids(book.pages), [1, 2, 3, 4].map(id));
  assert.deepEqual(await book.current(id(3)), corrected, "including a page again brings back its corrected document");
  assert.deepEqual(changes, ["book.json"]);
  await book.leaveOut([id(5)], false);
  assert.equal("left_out" in JSON.parse(files.get("book.json")), false, "an empty list is not kept");
  reopened = await Book.openFolder(handle, { browser: true });
  assert.deepEqual(ids(reopened.pages), [1, 2, 3, 4, 5].map(id));
}));

test("a read-only book cannot leave pages out", async () => {
  const manifest = { format: "book-folder", book_id: "ro", types: "types.json", pages: [{ id: "p1", document: "pages/p1.json" }], left_out: [] };
  const book = new Book("chaya", "ro", manifest, types, { files: { "book.json": manifest } });
  await assert.rejects(book.leaveOut(["p1"]), /editable copy/);
});

test("a left-out middle page is a gap that Read marks, and no unit joins across it", withMemoryIdb(async () => {
  const { handle } = fiveBook();
  const book = await Book.openFolder(handle, { browser: true });
  const joined = assemble((await book.all()).slice(0, 3), types)[0].units.filter(unit => unit.type === "paragraph");
  assert.equal(joined.length, 1, "consecutive pages whose paragraph goes on are one unit");

  await book.leaveOut([id(2)]);
  const docs = await book.all();
  assert.deepEqual(docs.map(doc => doc.page.id), [1, 3, 4].map(id), "page 5 has no document yet");
  // Read: the documents moved on to Read, cut at every page that is not there.
  const read = readingDocuments(book.allPages, docs);
  assert.deepEqual(read[0].units[0].open, { start: true }, "page 1's paragraph does not go on into page 3");
  assert.deepEqual(read[1].units[0].open, { end: true }, "page 3's paragraph does not continue page 1's");
  const [assembled, warnings] = assemble(read, types);
  assert.equal(assembled.units.filter(unit => unit.type === "paragraph" && unit.children.some(child => child.region?.startsWith(id(1)))).length, 1);
  assert.ok(!assembled.units.some(unit => unit.children.some(child => child.region?.startsWith(id(1))) && unit.children.some(child => child.region?.startsWith(id(3)))),
    "no unit holds both page 1's and page 3's regions");
  assert.ok(!warnings.some(warning => warning.includes(id(1)) && warning.includes(id(3))));
  // Read's notes: the left-out page by its number, and the included pages not in Read yet, without the left-out one.
  assert.deepEqual(readingGaps(book.allPages, new Set(ids(book.pages))), ["Page 2"]);
  assert.deepEqual(readingGaps(book.allPages, new Set(docs.map(doc => doc.page.id)), page => book.isLeftOut(page.id)), ["Page 5"]);
  // Export, Problems and the flags assemble the included pages without joining across the left-out one.
  const exported = withoutLeftOutJoins(book, docs);
  assert.deepEqual(exported[0].units[0].open, { start: true });
  assert.deepEqual(exported[1].units[0].open, { end: true }, "page 3 still goes on to page 4");
  assert.deepEqual(exported[2].units[0].open, { start: true, end: true });
  assert.equal(assemble(exported, types)[0].units.filter(unit => unit.children.some(child => child.region?.startsWith(id(3))) && unit.children.some(child => child.region?.startsWith(id(4)))).length, 1,
    "pages 3 and 4 still join");
  // Review flags look for neighbors in the full list, where a left-out page has no state and so is no page's neighbor.
  const states = new Map(book.pages.map(page => [page.id, { ...pageStages(docs.find(doc => doc.page.id === page.id) || null, types), runErrors: {} }]));
  reviewPageStates(book.allPages, states, types);
  assert.deepEqual([...states.keys()], [1, 3, 4, 5].map(id));
  assert.ok([...states.values()].every(state => Array.isArray(state.regionFlags)));
}));

test("left-out pages and their work survive a .chaya.pdf round trip, a restore and a read-only reopening", withMemoryIdb(async () => {
  const { handle, corrected } = fiveBook();
  const book = await Book.openFolder(handle, { browser: true });
  await book.leaveOut([id(3)]);
  const files = await book.chayaFiles();
  assert.deepEqual(files["book.json"].left_out, [id(3)]);
  assert.equal(files["book.json"].pages.length, 5, "the full page list is saved");
  for (const path of [`pages/${id(3)}.json`, `edits/${id(3)}.json`, `work/readings/${id(3)}/argon-low.json`]) assert.ok(path in files, path);
  const bytes = await writeChaya(tinyPdf(), { format: "chaya-book", version: 1, saved_by: "test", files });

  const imported = await importChaya(bytes, { into: folder(new Map(), "", "lo-copy") });
  assert.deepEqual(ids(imported.pages), [1, 2, 4, 5].map(id));
  assert.deepEqual(imported.edits.get(id(3)), corrected);
  await imported.leaveOut([id(3)], false);
  assert.deepEqual(await imported.current(id(3)), corrected, "included again after the round trip, its work is back");

  const damaged = new Map(), into = folder(damaged, "", "lo");
  const restored = await restoreChaya(bytes, into, "lo");
  assert.deepEqual(ids(restored.pages), [1, 2, 4, 5].map(id));

  const readonly = await Book.openChaya(bytes, "lo.chaya.pdf");
  assert.deepEqual(ids(readonly.pages), [1, 2, 4, 5].map(id));
  assert.deepEqual(readonly.edits.get(id(3)), corrected);
  const again = await readonly.chayaFiles();
  assert.deepEqual(again["book.json"].left_out, [id(3)]);
  assert.deepEqual(again[`edits/${id(3)}.json`], corrected, "saving a read-only book again keeps a left-out page's correction");
}));

test("type revisions also revise left-out pages, but count follow-up work only on included pages", () => {
  const validate = makeValidator(JSON.parse(readFileSync(new URL("../schema.json", import.meta.url))));
  const check = (doc, list) => checkPage(validate, doc, list)[0];
  const list = { format: "types", schema_version: "0.2", book_id: "lo", title: "Left out", flows: { main: "Main" },
    types: { paragraph: { description: "Paragraph", region: "paragraph", flow: "main" } } };
  const ring = [[[10, 10], [90, 10], [90, 30], [10, 30]]];
  const doc = pid => {
    const out = provisionalDocument(pid, { image: `${pid}.png`, image_sha256: "a".repeat(64), width: 100, height: 100 }, list,
      { regions: [{ region_id: 1, type: "paragraph", region_class: "paragraph", keep: true, reading_order: 1, status: "ok", polygons: ring, model_box: [10, 10, 90, 30], bounds: [10, 10, 90, 30], lines: [{ line_id: 1, polygons: ring }] }] });
    out.page.regions[0].lines[0].text = "Printed";
    return out;
  };
  const snapshot = { manifest: { left_out: ["p2"] }, pages: [{ id: "p1", document: "pages/p1.json" }, { id: "p2", document: "pages/p2.json" }],
    models: { p1: doc("p1"), p2: doc("p2") }, edits: {}, drafts: {}, style: null };
  const options = { validate, check, at: "2026-11-12T20:00:00Z" };
  const renamed = planTypeRevision(list, snapshot, [{ kind: "rename", name: "paragraph", to: "prose" }], options);
  assert.deepEqual(renamed.changes.map(change => change.page), ["p1", "p2"], "a left-out page is right when it is included again");
  assert.equal(renamed.changes[1].after.page.regions[0].type, "prose");
  const replaced = planTypeRevision(list, snapshot, [{ kind: "replace", types: list }], options);
  assert.deepEqual(replaced.find, ["p1"], "only an included page is counted (and estimated) as regions to find again");
});
