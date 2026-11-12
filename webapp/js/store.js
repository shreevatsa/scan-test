// Books (webapp/README.md, "Books"). A book is kept as a book folder: in this browser's own storage (the origin
// private file system, books/<name>/: the usual place, in any browser), or on disk with the File System Access API
// (Chrome and Edge, for the repository's tools; the user's corrected page documents are saved in edits/, beside the
// model's in pages/). A book's PDF (a PDF with the book's data attached, chayapdf.js; whatever its file is called)
// is the book as one file: opened from disk it goes into this browser's storage; opened from a URL, or where the
// browser keeps no books, it is read only (corrections are then kept in IndexedDB). Pages without an image file are
// drawn from the PDF. Drafts, versions that do not pass the checks yet, are always kept in IndexedDB.

import { readChaya, recoverOriginal, writeChaya, sha256hex } from "./chayapdf.js";
import { LAYERS, isProtected, noteEdit } from "./layers.js?v=20261110-finders-4";
import { addBookType, initialBookTypes } from "./book-types.js?v=20261110-finders-4";
import { planTypeRevision, mappedTypeNames, migrateTypeDocument } from "./type-revisions.js?v=20261112-leave-out-2";
import { canonical } from "./ops.js?v=20261110-finders-4";
import { checkDocument, typeRevision } from "./schema.js?v=20261110-reading-2";
import { assertFocusEdit, unitSnapshot, mergeTextEdit, applyUnitChanges } from "./editing.js?v=20261110-finders-4";

const bookWrites = new Map();

// ---------------------------------------------------------------- IndexedDB

const DB_NAME = "scan-book-app", STORES = ["edits", "drafts", "handles", "settings"];
let dbPromise = null;

function db() {
  dbPromise ||= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => { for (const s of STORES) if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function tx(store, mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(store, mode), s = t.objectStore(store);
    const req = fn(s);
    t.oncomplete = () => resolve(req && req.result);
    t.onerror = () => reject(t.error);
  });
}

export const idb = {
  get: (store, key) => tx(store, "readonly", s => s.get(key)),
  put: (store, key, value) => tx(store, "readwrite", s => s.put(value, key)),
  del: (store, key) => tx(store, "readwrite", s => s.delete(key)),
  keys: store => tx(store, "readonly", s => s.getAllKeys()),
};

export const settings = {
  get: key => idb.get("settings", key),
  set: (key, value) => idb.put("settings", key, value),
  async update(key, change) {
    const database = await db();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction("settings", "readwrite");
      const store = transaction.objectStore("settings");
      const request = store.get(key);
      request.onsuccess = () => {
        try { store.put(change(request.result), key); }
        catch (error) { transaction.abort(); reject(error); }
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error || new Error("The settings update was interrupted."));
    });
  },
};

// ---------------------------------------------------------------- books

// Write a file through its handle: with a writable stream, or (where the browser has none for its own storage, as
// older Safari) with a synchronous access handle in a small worker.
async function writeHandle(fh, data) {
  if (typeof fh.createWritable === "function") {
    const w = await fh.createWritable();
    await w.write(data);
    await w.close();
    return;
  }
  const buf = data instanceof Blob ? await data.arrayBuffer() : typeof data === "string" ? new TextEncoder().encode(data).buffer : data.buffer || data;
  const src = `onmessage = async e => { try { const a = await e.data.fh.createSyncAccessHandle(); a.truncate(0); a.write(new Uint8Array(e.data.buf), { at: 0 }); a.flush(); a.close(); postMessage(null); } catch (err) { postMessage(String(err)); } };`;
  const w = new Worker(URL.createObjectURL(new Blob([src], { type: "text/javascript" })));
  const err = await new Promise(res => { w.onmessage = e => res(e.data); w.postMessage({ fh, buf }, [buf]); });
  w.terminate();
  if (err) throw new Error(err);
}

async function readJsonFile(dir, path) {
  const parts = path.split("/");
  let d = dir;
  for (const p of parts.slice(0, -1)) d = await d.getDirectoryHandle(p);
  const fh = await d.getFileHandle(parts[parts.length - 1]);
  return JSON.parse(await (await fh.getFile()).text());
}

async function fileFrom(dir, path) {
  const parts = path.split("/");
  let d = dir;
  for (const p of parts.slice(0, -1)) d = await d.getDirectoryHandle(p);
  return (await d.getFileHandle(parts[parts.length - 1])).getFile();
}

const pretty = doc => JSON.stringify(doc, null, 1) + "\n";

export class Book {
  constructor(kind, where, manifest, types, { files = null, pdfBytes = null, browser = false } = {}) {
    this.kind = kind;            // "folder" (in this browser's storage, or on disk) or "chaya" (a book's PDF opened read only)
    this.where = where;          // a directory handle, or the PDF's URL or file name
    this.files = files;          // a .chaya.pdf's files
    this.pdfBytes = pdfBytes;    // a .chaya.pdf's bytes, from which its pages are drawn
    this.browser = browser;      // kept in this browser's storage
    this.manifest = manifest;
    this.types = types;
    this.models = new Map();     // page id -> the model's page document
    this.edits = new Map();      // page id -> the user's saved page document
    this.imageUrls = new Map();
    this.work = new Map();
    this.writeQueue = new Map();
    this.style = null;           // the book's style sheet (schema 0.3), if book.json names one
    this.key = browser ? `browser:${where.name}` : kind === "folder" ? `folder:${manifest.book_id}:${where.name}` : `${kind}:${where}`;
  }

  get title() { return this.manifest.title; }
  get writable() { return this.kind === "folder"; }

  // The book's pages. book.json's `pages` lists every page of the book, and `left_out` names the pages left out of it
  // (in the Pages tab). `pages` and `index` are the included pages only, so that processing, the stage grids, counts,
  // flags, estimates, Read and the exports see the book as if the left-out pages were not there. A left-out page keeps
  // its files, which are saved with the book and come back when it is included again. `allPages` is every page (for
  // the Pages grid), and a page's `number` is its place in that list: page numbers do not change when pages are left out.
  get allPages() { return this.manifest.pages; }
  get pages() { return this.pageLists().pages; }
  get index() { return this.pageLists().index; }
  get leftOut() { return this.pageLists().leftOut; }
  pageLists() {
    const manifest = this.manifest, cached = this.lists;
    if (cached?.manifest === manifest && cached.all === manifest.pages && cached.ids === manifest.left_out) return cached;
    const numbers = Object.fromEntries(manifest.pages.map((page, i) => [page.id, i + 1]));
    const leftOut = new Set((manifest.left_out || []).filter(id => Object.hasOwn(numbers, id)));
    const pages = manifest.pages.filter(page => !leftOut.has(page.id));
    this.lists = { manifest, all: manifest.pages, ids: manifest.left_out, leftOut, pages, numbers,
      index: Object.fromEntries(pages.map((page, i) => [page.id, i])) };
    return this.lists;
  }
  isLeftOut(pid) { return this.leftOut.has(pid); }
  hasPage(pid) { return Object.hasOwn(this.pageLists().numbers, pid); }
  number(pid) { return this.pageLists().numbers[pid]; }
  // The included pages with these numbers (from a selection such as 1-50, 62), in order.
  numbered(numbers) { return numbers.map(n => this.allPages[n - 1]).filter(page => page && !this.isLeftOut(page.id)); }
  // The page beside a page in the full list (delta -1 or 1), or null where there is none or it is left out: a left-out
  // page is a gap, and units do not join across it.
  neighbor(pid, delta) {
    const page = this.allPages[this.number(pid) - 1 + delta];
    return page && !this.isLeftOut(page.id) ? page : null;
  }
  // The page count a whole-book cost projection starts from: an excerpt's recorded target, else the PDF's pages less
  // those left out.
  get projectionPages() {
    const pdf = this.manifest.pdf?.page_count;
    return this.manifest.cost_projection?.page_count ?? (pdf ? Math.max(1, pdf - this.leftOut.size) : this.pages.length);
  }

  // Leave pages out of the book, or include them again (`out` false). Nothing of theirs is deleted: book.json records
  // the change, and the book is marked changed so its copy on disk is written again. Returns the page ids changed.
  async leaveOut(ids, out = true) {
    if (!this.writable) throw new Error("Make an editable copy of the book before leaving pages out.");
    return this.pageWrite(async () => {
      const manifest = await this.readJson("book.json") || structuredClone(this.manifest);
      const known = new Set(manifest.pages.map(page => page.id));
      for (const pid of ids) if (!known.has(pid)) throw new Error(`Unknown page ${pid}.`);
      const before = new Set((manifest.left_out || []).filter(id => known.has(id)));
      const after = new Set(before);
      for (const pid of ids) if (out) after.add(pid); else after.delete(pid);
      const changed = manifest.pages.map(page => page.id).filter(id => before.has(id) !== after.has(id));
      if (!changed.length) return [];
      if (out && after.size === manifest.pages.length) throw new Error("A book needs at least one page. Include another page before leaving out this one.");
      const leftOut = manifest.pages.map(page => page.id).filter(id => after.has(id));
      if (leftOut.length) manifest.left_out = leftOut; else delete manifest.left_out;
      await this.writeFile("book.json", pretty(manifest));
      this.manifest = manifest;
      return changed;
    });
  }

  // Which of these pages have work in them (a page document, a correction or a draft), as page ids.
  async pagesWithWork(ids) {
    const out = [];
    for (const pid of ids) {
      const valid = this.page(pid)?.valid;
      if (valid !== null && valid !== undefined || this.edits.has(pid) || await this.draft(pid).catch(() => null) || await this.model(pid)) out.push(pid);
    }
    return out;
  }

  async typesSnapshot() {
    const manifest = await this.readJson("book.json") || structuredClone(this.manifest);
    const snapshot = { manifest, pages: manifest.pages, models: {}, edits: {}, drafts: {},
      style: manifest.style ? await this.readJson(manifest.style) : this.style };
    for (const page of snapshot.pages) {
      const pending = await this.readJson(this.stagePath(page.id));
      if (pending) await this.finishStage(page.id, pending);
      snapshot.models[page.id] = await this.readJson(page.document);
      snapshot.edits[page.id] = await this.readJson(`edits/${page.id}.json`);
      snapshot.drafts[page.id] = await this.draft(page.id);
    }
    snapshot.manifest = await this.readJson("book.json") || manifest;
    snapshot.pages = snapshot.manifest.pages;
    const types = await this.readJson(manifest.types) || this.types;
    return { types, snapshot, token: await sha256hex(new TextEncoder().encode(canonical({ types, snapshot }))) };
  }

  async previewTypes(operations, options = {}) {
    if (!this.writable) throw new Error("Keep an editable copy before changing the type list.");
    return this.pageWrite(async () => {
      const { types, snapshot, token } = await this.typesSnapshot();
      return { ...planTypeRevision(types, snapshot, operations, options), token };
    });
  }

  async saveTypes(types, operations, { expected, ...options } = {}) {
    if (!this.writable) throw new Error("Keep an editable copy before changing the type list.");
    return this.pageWrite(async () => {
      const current = await this.typesSnapshot();
      if (expected && expected !== current.token) throw new Error("The book changed after this preview. Preview the change again.");
      const plan = planTypeRevision(current.types, current.snapshot, operations, { ...options, at: types.source?.revisions?.at(-1)?.at_utc });
      if (canonical(types) !== canonical(plan.types)) throw new Error("The type list changed. Preview the operation again.");
      const journal = { format: "type-revision", version: 1, types: plan.types, style: plan.style,
        manifest: { ...structuredClone(current.snapshot.manifest), title: plan.types.title }, changes: plan.changes,
        previous: { types: current.types, style: current.snapshot.style, manifest: current.snapshot.manifest, changes: plan.changes },
        reach: { pages: plan.pages, regions: plan.regions, units: plan.units, find: plan.find, complete: plan.complete, manual: plan.manual } };
      for (const page of journal.manifest.pages) {
        const changed = plan.changes.filter(change => change.page === page.id);
        if (!changed.length) continue;
        const modelChange = changed.find(change => change.kind === "model"), editChange = changed.find(change => change.kind === "edit");
        const doc = (editChange ? editChange.after : current.snapshot.edits[page.id]) || (modelChange ? modelChange.after : current.snapshot.models[page.id]);
        page.valid = !!doc && !(options.check ? options.check(doc, plan.types) : checkDocument(doc, plan.types)[0]).length;
        page.label = doc?.page.label ?? null;
      }
      await this.writeFile("work/pending-types.json", pretty(journal));
      await this.finishTypes(journal);
      return plan;
    });
  }

  // Replay is idempotent. The journal is removed only after every file and draft is saved.
  async finishTypes(journal) {
    await this.writeFile(`work/type-revisions/${journal.types.source.revision}.json`, pretty(journal.previous));
    for (const change of journal.changes) {
      if (change.kind === "draft") {
        const current = await this.draft(change.page);
        if (canonical(current) !== canonical(change.before) && canonical(current) !== canonical(change.after)) {
          if (current) {
            const doc = migrateTypeDocument(current.doc, journal.types, journal.types.source.revisions.at(-1).operations);
            await idb.put("drafts", [this.key, change.page], { ...current, doc });
          }
        } else if (change.after) await idb.put("drafts", [this.key, change.page], change.after);
        else await this.clearDraft(change.page);
        continue;
      }
      const path = change.kind === "model" ? journal.manifest.pages.find(page => page.id === change.page).document : `edits/${change.page}.json`;
      if (change.after) await this.writeFile(path, pretty(change.after)); else await this.removeFile(path);
    }
    if (journal.style && journal.manifest.style) await this.writeFile(journal.manifest.style, pretty(journal.style));
    await this.writeFile(journal.manifest.types, pretty(journal.types));
    await this.writeFile("book.json", pretty(journal.manifest));
    this.types = journal.types; this.style = journal.style; this.manifest = journal.manifest;
    this.models.clear(); this.edits.clear();
    for (const page of this.allPages) {
      const edit = await this.readJson(`edits/${page.id}.json`);
      if (edit) this.edits.set(page.id, edit);
    }
    await this.removeFile("work/pending-types.json");
  }

  async editPages(ids, mutate, { check = (doc, types) => checkDocument(doc, types)[0], expected = new Map(), focus = "units", archive = false, protect = [] } = {}) {
    return this.pageWrite(async () => {
      if (this.writable) this.types = await this.readJson(this.manifest.types) || this.types;
      const models = new Map(), before = new Map(), drafts = {};
      for (const pid of [...new Set(ids)]) {
        if (!this.hasPage(pid)) throw new Error(`Unknown page ${pid}.`);
        if (this.isLeftOut(pid)) throw new Error(`Page ${this.number(pid)} is left out of the book. Include it again in Pages first.`);
        const pending = this.writable && await this.readJson(this.stagePath(pid));
        if (pending) await this.finishStage(pid, pending);
        const model = this.writable ? await this.readJson(this.page(pid).document) : await this.model(pid);
        const edit = this.writable ? await this.readJson(`edits/${pid}.json`) : await idb.get("edits", [this.key, pid]) || this.edits.get(pid);
        const draft = await this.draft(pid), doc = draft?.doc || edit || model;
        if (!doc) throw new Error(`Prepare page ${this.number(pid)} first.`);
        const errors = check(doc, this.types);
        if (draft && errors.length) throw new Error(`Fix page ${this.number(pid)}’s draft first. ${errors[0]}`);
        if (model) this.models.set(pid, model);
        if (edit) this.edits.set(pid, edit); else this.edits.delete(pid);
        if (expected.has(pid) && unitSnapshot(doc) !== expected.get(pid)) throw new Error("This page’s units changed. Select the passage again before editing.");
        models.set(pid, model); before.set(pid, doc); drafts[pid] = draft;
      }
      const changed = await mutate(new Map([...before].map(([pid, doc]) => [pid, structuredClone(doc)])), this.types);
      const docs = {};
      for (const [pid, previous] of before) {
        const doc = changed.get(pid);
        if (!doc || doc.page.id !== pid) throw new Error("The edit must return each requested page.");
        assertFocusEdit(focus, previous, doc);
        const errors = check(doc, this.types);
        if (errors.length) throw new Error(errors[0]);
        docs[pid] = noteEdit(models.get(pid), doc, { focus });
        if (protect.includes("regions") && doc.source?.layers?.units?.state === "provisional")
          docs[pid].source.layers.units = structuredClone(doc.source.layers.units);
        for (const layer of protect) {
          if (!LAYERS.includes(layer)) throw new Error(`Unknown review layer ${layer}.`);
          docs[pid].source.layers[layer] = { ...docs[pid].source.layers[layer], state: "edited", types_revision: typeRevision(this.types.source?.revision) };
        }
      }
      if (this.writable) {
        const journal = { format: "page-edits", version: 1, docs, drafts, ...(archive ? { previous: Object.fromEntries(before) } : {}) };
        await this.writeFile("work/pending-pages.json", pretty(journal));
        await this.finishPages(journal);
      } else {
        const database = await db();
        await new Promise((resolve, reject) => {
          const transaction = database.transaction(["edits", "drafts"], "readwrite");
          for (const [pid, doc] of Object.entries(docs)) {
            transaction.objectStore("edits").put(doc, [this.key, pid]); transaction.objectStore("drafts").delete([this.key, pid]);
          }
          transaction.oncomplete = resolve; transaction.onerror = () => reject(transaction.error); transaction.onabort = () => reject(transaction.error);
        });
        for (const [pid, doc] of Object.entries(docs)) this.edits.set(pid, doc);
      }
      return docs;
    });
  }

  async finishPages(journal) {
    const manifest = await this.readJson("book.json") || structuredClone(this.manifest);
    for (const [pid, doc] of Object.entries(journal.previous || {})) await this.writeFile(`work/history/${pid}.json`, pretty(doc));
    for (const [pid, doc] of Object.entries(journal.docs)) {
      await this.writeFile(`edits/${pid}.json`, pretty(doc));
      this.edits.set(pid, doc);
      Object.assign(manifest.pages.find(page => page.id === pid), { valid: true, label: doc.page.label ?? null });
    }
    await this.writeFile("book.json", pretty(manifest)); this.manifest = manifest;
    for (const pid of Object.keys(journal.docs)) if (canonical(await this.draft(pid)) === canonical(journal.drafts[pid])) await this.clearDraft(pid);
    await this.removeFile("work/pending-pages.json");
  }

  async addType(definition, validate) {
    if (!this.writable) throw new Error("Keep an editable copy of the book before adding a type.");
    return this.pageWrite(async () => {
      const current = await this.readJson(this.manifest.types) || this.types;
      const next = addBookType(current, definition);
      const errors = validate(next);
      if (errors.length) throw new Error(errors[0]);
      await this.writeFile(this.manifest.types, pretty(next));
      this.types = next;
      return next;
    });
  }

  async initializeTypes(proposed, validate) {
    if (!this.writable) throw new Error("Keep an editable copy of the book before choosing its types.");
    return this.pageWrite(async () => {
      for (const page of this.allPages) if (await this.readJson(page.document) || await this.readJson(`edits/${page.id}.json`) || await this.draft(page.id))
        throw new Error("Apply an initial type list before making page documents. Existing pages can use added types.");
      const current = await this.readJson(this.manifest.types) || this.types;
      const next = initialBookTypes(current, proposed, this.manifest.book_id, this.title);
      const errors = validate(next);
      if (errors.length) throw new Error(errors[0]);
      await this.writeFile(this.manifest.types, pretty(next));
      this.types = next;
      return next;
    });
  }

  static async openFolder(handle, { browser = false } = {}) {
    const read = path => readJsonFile(handle, path).catch(error => {
      throw Object.assign(new Error(`${path} could not be read (${error.name && error.name !== "Error" ? `${error.name}: ` : ""}${error.message})`), { path, cause: error });
    });
    const manifest = await read("book.json");
    if (manifest.format !== "book-folder") throw new Error("book.json is not a book folder's manifest");
    const types = await read(manifest.types);
    const book = new Book("folder", handle, manifest, types, { browser });
    await book.recoverStages();
    if (book.manifest.style) book.style = await readJsonFile(handle, book.manifest.style).catch(e => { console.warn("style sheet", e); return null; });
    try {
      const edits = await handle.getDirectoryHandle("edits", { create: true });
      for await (const [name, fh] of edits.entries()) {
        if (fh.kind !== "file" || !name.endsWith(".json")) continue;
        const pid = name.slice(0, -5);
        if (book.hasPage(pid)) book.edits.set(pid, JSON.parse(await (await fh.getFile()).text()));
      }
    } catch (e) { console.warn("edits/ could not be read", e); }
    return book;
  }

  // A book's PDF (a PDF with chaya.json attached), read only (where: its URL or file name): corrections and a
  // changed style sheet are kept in IndexedDB.
  static async openChaya(bytes, where) {
    const { data } = await readChaya(bytes);
    if (!data || data.format !== "chaya-book") throw new Error("this PDF has no book in it (no chaya.json)");
    const files = data.files, manifest = files["book.json"];
    const book = new Book("chaya", where, manifest, files[manifest.types], { files, pdfBytes: bytes });
    book.style = book.servedStyle = manifest.style ? files[manifest.style] || null : null;
    const mine = await idb.get("settings", ["style", book.key]).catch(() => null);
    if (mine) { book.style = mine; book.styleEdited = true; }
    for (const [path, doc] of Object.entries(files)) {
      const m = /^edits\/(.+)\.json$/.exec(path);
      if (m && book.hasPage(m[1])) book.edits.set(m[1], doc);
    }
    for (const key of await idb.keys("edits")) {
      if (Array.isArray(key) && key[0] === book.key) book.edits.set(key[1], await idb.get("edits", key));
    }
    return book;
  }

  // A PDF at a URL, as a File: opened by the app exactly as a PDF chosen from disk is.
  static async fetchPdf(url) {
    url = new URL(url, location.href).href;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const name = decodeURIComponent(new URL(url).pathname.split("/").pop() || "book.pdf");
    return new File([await r.arrayBuffer()], name, { type: "application/pdf" });
  }

  // Any page, included or left out.
  page(pid) { return this.allPages[this.number(pid) - 1]; }

  // The model's page document, or null for a page not transcribed yet.
  async model(pid) {
    if (!this.models.has(pid)) {
      const p = this.page(pid);
      let doc = null;
      try {
        doc = this.kind === "chaya" ? this.files[p.document] ?? null : await readJsonFile(this.where, p.document);
      } catch (e) { if (e.name === "NotFoundError") doc = null; else throw e; }
      if (doc === null) return null;
      this.models.set(pid, doc);
    }
    return this.models.get(pid);
  }

  // Files of a folder book, for making it (folder books only).
  async writeFile(path, data) {
    if (!this.writable) throw new Error("This book's source files are read only.");
    const prior = this.writeQueue.get(path) || Promise.resolve();
    const job = prior.catch(() => {}).then(async () => {
      const parts = path.split("/");
      let d = this.where;
      for (const p of parts.slice(0, -1)) d = await d.getDirectoryHandle(p, { create: true });
      await writeHandle(await d.getFileHandle(parts[parts.length - 1], { create: true }), data);
    });
    this.writeQueue.set(path, job);
    try { await job; }
    finally { if (this.writeQueue.get(path) === job) this.writeQueue.delete(path); }
    this.changed(path);
  }

  // Tell whoever keeps a copy of the book (main.js, disk-copy.js) that its data changed. Page images are a cache.
  changed(path) {
    if (this.onChange && !path.startsWith("images/")) this.onChange(path);
  }

  // Files the manifest says this book has that cannot be read: its source PDF, and the document of every page that has
  // one (a page's `valid` is set when its document is saved). A book opened without them would look unprocessed.
  // With `parse`, page documents are read and checked, and kept so that opening the book does not read them again;
  // without it, only their presence is checked (before writing a .chaya.pdf, which reads them anyway). Left-out pages
  // are checked too: their files are still the book's, saved with it, and come back when the pages are included again.
  async unreadableFiles({ parse = true } = {}) {
    if (this.kind !== "folder") return [];
    const out = [];
    const failed = (path, error) => out.push({ path, error: error.name && error.name !== "Error" ? `${error.name}: ${error.message}` : error.message });
    const pdf = this.manifest.pdf?.path;
    if (pdf) {
      try { if (!(await fileFrom(this.where, pdf)).size) throw new Error("the file is empty"); } catch (error) { failed(pdf, error); }
    }
    for (const page of this.allPages) {
      if (page.valid === null || page.valid === undefined) continue;
      try {
        if (!parse) { if (!(await fileFrom(this.where, page.document)).size) throw new Error("the file is empty"); continue; }
        const doc = await readJsonFile(this.where, page.document);
        if (doc?.page?.id !== page.id) throw new Error(`it holds ${doc?.page?.id ? `page ${doc.page.id}` : "no page"}`);
        this.models.set(page.id, doc);
      } catch (error) { failed(page.document, error); }
    }
    return out;
  }

  async readJson(path) {
    try { return await readJsonFile(this.where, path); } catch (e) { if (e.name === "NotFoundError" || e.name === "TypeMismatchError") return null; throw e; }
  }

  // Processing records also work for books opened by URL. Their local overlay is exported with the book.
  async readWork(path) {
    if (!path.startsWith("work/")) throw new Error("Expected a work-file path.");
    if (this.work.has(path)) return mappedTypeNames(this.work.get(path), this.types);
    const value = this.writable ? await this.readJson(path)
      : (await idb.get("settings", ["work", this.key, path]).catch(() => null)) ?? this.files?.[path] ?? null;
    this.work.set(path, value);
    return mappedTypeNames(value, this.types);
  }

  async writeWork(path, value) {
    if (!path.startsWith("work/")) throw new Error("Expected a work-file path.");
    if (this.writable) await this.writeFile(path, pretty(value));
    else await idb.put("settings", ["work", this.key, path], value);
    this.work.set(path, value);
  }

  async updateWork(path, update) {
    return this.pageWrite(async () => {
      this.work.delete(path);
      const value = await update(await this.readWork(path));
      await this.writeWork(path, value);
      return value;
    });
  }

  async getReaderOptions() {
    if (!this.writable && !this.readerOptionsLoaded) {
      const saved = await idb.get("settings", ["reader-options", this.key]).catch(() => null);
      if (saved) this.manifest.reader_options = saved;
      this.readerOptionsLoaded = true;
    }
    return this.manifest.reader_options || {};
  }

  async saveReaderOptions(options) {
    const next = JSON.parse(JSON.stringify(options));
    if (this.writable) {
      await this.pageWrite(async () => {
        const manifest = await this.readJson("book.json") || structuredClone(this.manifest);
        manifest.reader_options = next;
        await this.writeFile("book.json", pretty(manifest));
        this.manifest = manifest;
      });
    } else {
      await idb.put("settings", ["reader-options", this.key], next);
      this.manifest.reader_options = next;
      this.readerOptionsLoaded = true;
    }
  }

  async file(path) { return fileFrom(this.where, path); }

  // ---- the PDF and the page images

  // The book's source PDF's bytes: the original, for saving a .chaya.pdf and for download.
  async originalPdf() {
    if (this.kind === "chaya") return (await recoverOriginal(this.pdfBytes)) || this.pdfBytes;
    const path = this.manifest.pdf?.path;
    if (!path) throw new Error("this book has no source PDF");
    return new Uint8Array(await (await fileFrom(this.where, path)).arrayBuffer());
  }

  // The PDF, opened with pdf.js (once).
  pdf() {
    this.pdfPromise ||= (async () => {
      const { openPdfData } = await import("./pipeline/pdf.js");
      return openPdfData(this.kind === "chaya" ? this.pdfBytes.slice() : await this.originalPdf());
    })();
    return this.pdfPromise;
  }

  // A page's image: its file where it has one (a book folder made by the repository's tools), else drawn from its PDF
  // page at the size its regions are measured in. A book in this browser keeps what it draws in images/ (a cache:
  // not part of the book's data, and left out of a .chaya.pdf).
  async imageBlob(pid) {
    const p = this.page(pid);
    if (p.image && this.kind === "folder") { try { return await fileFrom(this.where, p.image); } catch (e) { if (e.name !== "NotFoundError") throw e; } }
    const cache = `images/${pid}.png`;
    if (this.browser) { try { return await fileFrom(this.where, cache); } catch (e) { if (e.name !== "NotFoundError") throw e; } }
    if (!this.manifest.pdf && this.kind !== "chaya") throw new Error(`${pid} has no image, and the book no PDF to draw it from`);
    let W = p.width, H = p.height;
    if (!W) { const d = await this.model(pid); W = d?.page.width; H = d?.page.height; }
    const { renderPageSized } = await import("./pipeline/pdf.js");
    const blob = await renderPageSized(await this.pdf(), p.pdf_page, W, H);
    if (this.browser) await this.writeFile(cache, blob).catch(e => console.warn("the image cache", e));
    return blob;
  }

  // ---- the book as one file

  // The book's files for a .chaya.pdf (all but the PDF and the page images), as they stand: the model's pages, the
  // user's corrections, the style sheet in use and the work files.
  async chayaFiles(progress = () => {}) {
    await this.recoverStages();
    return this.pageWrite(() => this.collectChayaFiles(progress));
  }

  async collectChayaFiles(progress) {
    if (this.writable) {
      const { types, snapshot } = await this.typesSnapshot();
      this.types = types; this.manifest = snapshot.manifest; this.style = snapshot.style;
      this.models = new Map(Object.entries(snapshot.models).filter(([, value]) => value));
      this.edits = new Map(Object.entries(snapshot.edits).filter(([, value]) => value));
    }
    await this.getReaderOptions();
    const manifest = JSON.parse(JSON.stringify(this.manifest));
    const files = {};
    files[manifest.types] = this.types;
    if (this.style) { manifest.style ||= "style.json"; files[manifest.style] = this.style; }
    let i = 0;
    for (const p of manifest.pages) {
      progress(++i, manifest.pages.length);
      const doc = await this.model(p.id);
      if (doc) { files[p.document] = doc; p.width ||= doc.page.width; p.height ||= doc.page.height; }
      delete p.image;
    }
    for (const [pid, doc] of this.edits) files[`edits/${pid}.json`] = doc;
    if (this.kind === "chaya") for (const [path, v] of Object.entries(this.files)) if (path.startsWith("work/")) files[path] = v;
    if (this.kind === "chaya") for (const key of await idb.keys("settings").catch(() => [])) {
      if (Array.isArray(key) && key[0] === "work" && key[1] === this.key) files[key[2]] = await idb.get("settings", key);
    }
    for (const [path, value] of this.work) if (value !== null) files[path] = value;
    if (this.kind === "folder") {
      try {
        const walk = async (dir, prefix) => {
          for await (const [name, h] of dir.entries()) {
            if (h.kind === "directory") await walk(h, `${prefix}${name}/`);
            else { const text = await (await h.getFile()).text(); files[`${prefix}${name}`] = name.endsWith(".json") ? JSON.parse(text) : text; }
          }
        };
        await walk(await this.where.getDirectoryHandle("work"), "work/");
      } catch (e) { if (e.name !== "NotFoundError") throw e; }
    }
    manifest.pdf = { path: "source.pdf", ...(manifest.pdf || {}) };
    files["book.json"] = manifest;
    return files;
  }

  // The book as a .chaya.pdf's bytes.
  async chayaBytes(progress) {
    const original = await this.originalPdf();
    const files = await this.chayaFiles(progress);
    const data = { format: "chaya-book", version: 1,
                   original: { name: this.manifest.pdf?.name || "source.pdf", sha256: await sha256hex(original), length: original.length },
                   saved_at_utc: new Date().toISOString(), saved_by: "the web app", files };
    return writeChaya(original, data);
  }

  // The book's style sheet as the user changed it: written to the folder (style.json, named in book.json), or for a
  // book's PDF opened read only kept in this browser over the PDF's.
  async saveStyle(sheet) {
    if (this.kind === "folder") {
      await this.pageWrite(async () => {
        this.manifest = await this.readJson("book.json") || this.manifest;
        const types = await this.readJson(this.manifest.types) || this.types;
        const aliases = Object.entries(types.source?.aliases || {}).filter(([old]) => Object.hasOwn(sheet.types || {}, old));
        if (aliases.length) sheet = structuredClone(sheet);
        for (const [old, name] of aliases) {
          sheet.types[name] = sheet.types[name] || sheet.types[old]; delete sheet.types[old];
        }
        const path = this.manifest.style || "style.json";
        await this.writeFile(path, pretty(sheet));
        if (this.manifest.style !== path) {
          this.manifest.style = path;
          await this.writeFile("book.json", pretty(this.manifest));
        }
      });
    } else {
      await idb.put("settings", ["style", this.key], sheet);
      this.styleEdited = true;
    }
    this.style = sheet;
  }

  // A book's PDF opened read only: back to the PDF's style sheet.
  async revertStyle() {
    await idb.del("settings", ["style", this.key]);
    this.style = this.servedStyle || null;
    this.styleEdited = false;
  }

  // A new model page document: saved in pages/, and the manifest updated.
  async saveModel(pid, doc, valid) {
    const previous = await this.model(pid);
    const sample = doc.source?.sample || previous?.source?.sample;
    if (sample) {
      const original = Object.fromEntries(doc.units.filter(unit => unit.open).map(unit => [unit.id, { ...unit.open }]));
      for (const unit of doc.units.filter(unit => unit.open)) {
        if (sample.consecutive_previous === false) delete unit.open.start;
        if (sample.consecutive_next === false) delete unit.open.end;
        if (!Object.keys(unit.open).length) delete unit.open;
      }
      doc.source = { ...doc.source, sample: { ...JSON.parse(JSON.stringify(sample)), original_open_ends: original } };
    }
    await this.writeFile(this.page(pid).document, JSON.stringify(doc) + "\n");
    this.models.set(pid, doc);
    Object.assign(this.page(pid), { label: doc.page.label ?? null, valid });
    await this.writeFile("book.json", JSON.stringify(this.manifest, null, 1) + "\n");
  }

  // Serialize page mutations across instances and, with Web Locks, browser tabs.
  pageWrite(change) {
    const previous = bookWrites.get(this.key) || Promise.resolve();
    const recover = async () => {
      if (this.writable) {
        const pending = await this.readJson("work/pending-types.json");
        if (pending) await this.finishTypes(pending);
        const pages = await this.readJson("work/pending-pages.json");
        if (pages) await this.finishPages(pages);
      }
      return change();
    };
    const run = () => globalThis.navigator?.locks?.request ? navigator.locks.request(`book-write:${this.key}`, recover) : recover();
    const job = previous.catch(() => {}).then(run);
    bookWrites.set(this.key, job);
    return job.finally(() => { if (bookWrites.get(this.key) === job) bookWrites.delete(this.key); });
  }

  async removeFile(path) {
    const parts = path.split("/");
    try {
      let dir = this.where;
      for (const part of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(part);
      await dir.removeEntry(parts.at(-1));
      this.changed(path);
    } catch (error) { if (error.name !== "NotFoundError") throw error; }
  }

  stagePath(pid) { return `work/pending-stage/${pid}.json`; }

  async finishStage(pid, pending) {
    if (pending.previous) await this.writeWork(`work/history/${pid}.json`, pending.previous);
    const manifest = await this.readJson("book.json");
    if (manifest) this.manifest = manifest;
    await this.saveModel(pid, structuredClone(pending.doc), pending.valid);
    await this.removeFile(`edits/${pid}.json`);
    this.edits.delete(pid);
    const draft = await this.draft(pid);
    if (pending.draft && JSON.stringify(draft) === JSON.stringify(pending.draft)) await this.clearDraft(pid);
    await this.removeFile(this.stagePath(pid));
    this.work.delete(this.stagePath(pid));
  }

  async recoverStages() {
    if (!this.writable) return;
    await this.pageWrite(async () => {
      let dir;
      try { dir = await this.where.getDirectoryHandle("work").then(work => work.getDirectoryHandle("pending-stage")); }
      catch (error) { if (error.name === "NotFoundError") return; throw error; }
      for await (const [name] of dir.entries()) {
        const pid = name.replace(/\.json$/, "");
        if (!name.endsWith(".json") || !this.hasPage(pid)) continue;
        const pending = await this.readJson(this.stagePath(pid));
        if (pending) await this.finishStage(pid, pending);
      }
    });
  }

  // Merge while holding the write lock so a result cannot overtake a saved correction.
  async updateStage(pid, update) {
    if (!this.writable) throw new Error("Save a writable copy of the book before saving page stages.");
    return this.pageWrite(async () => {
      const pending = await this.readJson(this.stagePath(pid));
      if (pending) await this.finishStage(pid, pending);
      const diskModel = await this.readJson(this.page(pid).document);
      const types = await this.readJson(this.manifest.types);
      if (types) this.types = types;
      if (diskModel) this.models.set(pid, diskModel);
      const model = diskModel || await this.model(pid);
      const edit = await this.readJson(`edits/${pid}.json`);
      if (edit) this.edits.set(pid, edit); else this.edits.delete(pid);
      const current = edit || model;
      const draft = await this.draft(pid);
      const out = await update(current, draft?.doc || null);
      if (!out?.doc) return out;
      const previous = draft?.doc || current;
      const journal = { format: "page-stage-save", version: 1, page: pid, doc: out.doc, valid: out.valid, draft: draft || null,
        previous: previous && LAYERS.some(layer => isProtected(previous, layer)) ? previous : null };
      await this.writeFile(this.stagePath(pid), pretty(journal));
      await this.finishStage(pid, journal);
      return { ...out, doc: await this.model(pid) };
    });
  }

  saveStage(pid, doc, valid) { return this.updateStage(pid, () => ({ doc, valid })); }

  // A new book in an empty directory, from a PDF: the PDF itself (source.pdf, the book's source), the manifest and
  // the type list. pdf: {file, sha256, pageCount}; pages: [{pdfPage, width, height, source}] (the size each page is
  // drawn at, and how it was analyzed); the page images are drawn from the PDF when they are needed.
  static async create(handle, { title, bookId, types, pdf, pages: items, browser = false }) {
    const pages = items.map((item, i) => {
      const id = `${bookId}-page-${String(i + 1).padStart(3, "0")}`;
      return { id, document: `pages/${id}.json`, label: null, valid: null, pdf_page: item.pdfPage, width: item.width, height: item.height, source: item.source };
    });
    const manifest = { format: "book-folder", version: 1, schema_version: "0.2", book_id: bookId, title, types: "types.json",
                       pdf: { path: "source.pdf", name: pdf.file.name, sha256: pdf.sha256, page_count: pdf.pageCount }, pages,
                       source: { made_by: "the web app", made_at_utc: new Date().toISOString() } };
    const book = new Book("folder", handle, manifest, types, { browser });
    await book.writeFile("source.pdf", pdf.file);
    await book.writeFile("types.json", JSON.stringify(types, null, 1) + "\n");
    await book.writeFile("book.json", JSON.stringify(manifest, null, 1) + "\n");
    await handle.getDirectoryHandle("pages", { create: true });
    await handle.getDirectoryHandle("edits", { create: true });
    return Book.openFolder(handle, { browser });
  }

  async current(pid, { refresh = false } = {}) {
    if (this.writable && (refresh || await this.readJson("work/pending-types.json") || await this.readJson("work/pending-pages.json") || await this.readJson(this.stagePath(pid)))) await this.pageWrite(async () => {
      const pending = await this.readJson(this.stagePath(pid));
      if (pending) await this.finishStage(pid, pending);
      if (refresh) {
        const types = await this.readJson(this.manifest.types);
        if (types) this.types = types;
        const model = await this.readJson(this.page(pid).document);
        if (model) this.models.set(pid, model);
        const edit = await this.readJson(`edits/${pid}.json`);
        if (edit) this.edits.set(pid, edit); else this.edits.delete(pid);
      }
    });
    return this.edits.get(pid) || this.model(pid);
  }

  imageUrl(pid) {
    if (!this.imageUrls.has(pid)) {
      const p = this.page(pid);
      this.imageUrls.set(pid, this.imageBlob(pid).then(b => URL.createObjectURL(b)));
      this.imageUrls.get(pid).catch(() => this.imageUrls.delete(pid));
    }
    return this.imageUrls.get(pid);
  }

  // Save the user's corrected version of a page (it has passed the checks).
  async saveEdit(pid, doc, { classify = true, focus = null, base = null } = {}) {
    return this.pageWrite(async () => {
      if (this.writable) {
        const pending = await this.readJson(this.stagePath(pid));
        if (pending) await this.finishStage(pid, pending);
        const model = await this.readJson(this.page(pid).document);
        if (model) this.models.set(pid, model);
        this.types = await this.readJson(this.manifest.types) || this.types;
        const revision = doc.source?.types_migration_revision || 1;
        const operations = (this.types.source?.revisions || []).filter(entry => entry.n > revision).flatMap(entry => entry.operations);
        doc = migrateTypeDocument(doc, this.types, operations);
        if (base) {
          const latest = await this.readJson(`edits/${pid}.json`) || model;
          const prior = migrateTypeDocument(base, this.types, operations);
          if (latest && focus === "text") doc = mergeTextEdit(latest, doc, prior);
          if (latest && focus === "units") doc = applyUnitChanges(prior, doc, latest);
        }
      } else if (base) {
        const latest = await idb.get("edits", [this.key, pid]) || this.edits.get(pid) || await this.model(pid);
        if (focus === "text") doc = mergeTextEdit(latest, doc, base);
        if (focus === "units") doc = applyUnitChanges(base, doc, latest);
      }
      if (base && ["text", "units"].includes(focus)) {
        const errors = checkDocument(doc, this.types)[0];
        if (errors.length) throw new Error(errors[0]);
      }
      if (classify) doc = noteEdit(await this.model(pid), doc, { focus });
      if (doc.source?.type_review?.manual && !checkDocument(doc, this.types)[0].length) {
        delete doc.source.type_review.manual;
        delete doc.source.type_review.errors;
        if (!Object.keys(doc.source.type_review).length) delete doc.source.type_review;
      }
      if (this.kind === "folder") {
        await this.writeFile(`edits/${pid}.json`, pretty(doc));
      } else {
        await idb.put("edits", [this.key, pid], doc);
      }
      this.edits.set(pid, doc);
      await this.clearDraft(pid);
      return doc;
    });
  }

  // Go back to the model's version.
  async revert(pid) {
    return this.pageWrite(async () => {
      if (this.writable) {
        const pending = await this.readJson(this.stagePath(pid));
        if (pending) await this.finishStage(pid, pending);
        await this.removeFile(`edits/${pid}.json`);
      } else {
        await idb.del("edits", [this.key, pid]);
      }
      this.edits.delete(pid);
      await this.clearDraft(pid);
    });
  }

  draft(pid) { return idb.get("drafts", [this.key, pid]); }
  putDraft(pid, doc) {
    return this.pageWrite(async () => {
      if (this.writable) {
        const pending = await this.readJson(this.stagePath(pid));
        if (pending) await this.finishStage(pid, pending);
        this.types = await this.readJson(this.manifest.types) || this.types;
        const revision = doc.source?.types_migration_revision || 1;
        const operations = (this.types.source?.revisions || []).filter(entry => entry.n > revision).flatMap(entry => entry.operations);
        doc = migrateTypeDocument(doc, this.types, operations);
      }
      await idb.put("drafts", [this.key, pid], { doc, at: Date.now() });
    });
  }
  clearDraft(pid) { return idb.del("drafts", [this.key, pid]); }

  // Every page's current document, loading what is not loaded yet.
  async all(progress = () => {}) {
    const out = [];
    let done = 0;
    const queue = [...this.pages];
    const work = async () => {
      while (queue.length) {
        const p = queue.shift();
        await this.current(p.id);
        progress(++done, this.pages.length);
      }
    };
    await Promise.all(Array.from({ length: 8 }, work));
    for (const p of this.pages) { const d = await this.current(p.id); if (d) out.push(d); }
    return out;
  }

  // The user's corrections as one JSON file, for books opened from a URL.
  exportEdits() {
    return { format: "book-edits", book_id: this.manifest.book_id, title: this.title, exported_at_utc: new Date().toISOString(),
             pages: Object.fromEntries(this.edits) };
  }

  async importEdits(bundle, check) {
    if (bundle.format !== "book-edits" || bundle.book_id !== this.manifest.book_id) throw new Error("not this book's corrections");
    let n = 0;
    for (const [pid, doc] of Object.entries(bundle.pages)) {
      if (!this.hasPage(pid)) continue;
      const [errors] = check(doc);
      if (errors.length) throw new Error(`${pid}: ${errors[0]}`);
      await this.saveEdit(pid, doc);
      n++;
    }
    return n;
  }
}

// ---------------------------------------------------------------- books in this browser

async function booksDir() {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle("books", { create: true });
}

// The books kept in this browser's storage: {name, handle, manifest, saved}, the most recently saved first. With
// `damaged`, a folder that holds files but no readable book.json is listed too, as {name, handle, error}.
export async function browserBooks({ damaged = false } = {}) {
  const out = [], broken = [];
  for await (const [name, h] of (await booksDir()).entries()) {
    if (h.kind !== "directory") continue;
    try {
      const f = await (await h.getFileHandle("book.json")).getFile();
      out.push({ name, handle: h, manifest: JSON.parse(await f.text()), saved: f.lastModified });
    } catch (e) {
      if (!damaged) continue;
      let files = 0;
      for await (const _ of h.entries()) { files++; break; }
      if (files) broken.push({ name, handle: h, error: e.name === "NotFoundError" ? "it has no book.json" : `its book.json could not be read (${e.message})` });
    }
  }
  return [...out.sort((a, b) => b.saved - a.saved), ...broken];
}

// Each book's copy outside the browser (disk-copy.js), by the book's key: the chosen file's handle and when it, or a
// download, was last written.
export const copyRecords = {
  get: key => idb.get("settings", ["disk-copy", key]).catch(() => null),
  put: (key, record) => idb.put("settings", ["disk-copy", key], record),
  del: key => idb.del("settings", ["disk-copy", key]),
  update: (key, change) => settings.update(["disk-copy", key], record => change(record || {})),
};

// Ask the browser to keep this site's storage rather than clear it when space runs low, and report what it says:
// {persisted, usage, quota}, with null for what it does not tell.
export async function storagePersistence({ ask = false } = {}) {
  const storage = globalThis.navigator?.storage;
  let persisted = null, usage = null, quota = null;
  try { persisted = ask && storage?.persist ? await storage.persist() : storage?.persisted ? await storage.persisted() : null; } catch { persisted = null; }
  try { ({ usage = null, quota = null } = await storage?.estimate?.() || {}); } catch { /* no estimate */ }
  return { persisted, usage, quota };
}

// A new, empty directory for a book in this browser (named after its id, with -2, -3… if taken). The browser is
// asked to keep this storage rather than clear it when space runs low.
export async function newBrowserBookDir(bookId) {
  const dir = await booksDir();
  const taken = new Set();
  for await (const [name] of dir.entries()) taken.add(name);
  let name = bookId, k = 1;
  while (taken.has(name)) name = `${bookId}-${++k}`;
  storagePersistence({ ask: true });
  return dir.getDirectoryHandle(name, { create: true });
}

export async function deleteBrowserBook(name) {
  await (await booksDir()).removeEntry(name, { recursive: true });
  await copyRecords.del(`browser:${name}`).catch(() => {});
}

// Put a .chaya.pdf of a book back into that book's folder in this browser, in place of what is there (a damaged copy).
// The file must hold the same book.
export async function restoreChaya(bytes, handle, bookId) {
  const { data } = await readChaya(bytes);
  if (!data || data.format !== "chaya-book") throw new Error("this PDF has no book in it (no chaya.json)");
  const found = data.files["book.json"]?.book_id;
  if (bookId && found !== bookId) throw new Error(`this file holds the book “${found}”, not “${bookId}”. Open it from the library instead.`);
  return importChaya(bytes, { into: handle });
}

// A .chaya.pdf put into this browser's storage, as a book: its original PDF and its files (into `into`, a book's
// directory to replace, or a new one). Returns the book, opened.
export async function importChaya(bytes, { into = null } = {}) {
  const { data, original } = await readChaya(bytes);
  if (!data || data.format !== "chaya-book") throw new Error("this PDF has no book in it (no chaya.json)");
  const manifest = data.files["book.json"];
  let dir = into;
  if (dir) {
    for await (const [name] of dir.entries()) await dir.removeEntry(name, { recursive: true });
  } else dir = await newBrowserBookDir(manifest.book_id);
  const book = new Book("folder", dir, manifest, null, { browser: true });
  await book.writeFile("source.pdf", original || bytes);
  for (const [path, v] of Object.entries(data.files)) {
    if (path === "book.json") continue;
    await book.writeFile(path, typeof v === "string" ? v : JSON.stringify(v, null, 1) + "\n");
  }
  manifest.pdf = { path: "source.pdf", ...(manifest.pdf || {}) };
  await book.writeFile("book.json", JSON.stringify(manifest, null, 1) + "\n");
  return Book.openFolder(dir, { browser: true });
}
