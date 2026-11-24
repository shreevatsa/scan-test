// Books (webapp/README.md, "Books"). A book is kept as a book folder: in this browser's own storage (the origin
// private file system, books/<name>/: the usual place, in any browser), or on disk with the File System Access API
// (Chrome and Edge, for the repository's tools; the user's corrected page documents are saved in edits/, beside the
// model's in pages/). A book's PDF (a PDF with the book's data attached, chayapdf.js; whatever its file is called)
// is the book as one file: opened from disk it goes into this browser's storage; opened from a URL, or where the
// browser keeps no books, it is read only (corrections are then kept in IndexedDB). Pages without an image file are
// drawn from the PDF. Drafts, versions that do not pass the checks yet, are always kept in IndexedDB.

import { readChaya, recoverOriginal, writeChaya, sha256hex } from "./chayapdf.js";
import { LAYERS, isProtected, noteEdit, withPageReview, preservePageReview } from "./layers.js?v=20261124-contents-1";
import { addBookType, initialBookTypes } from "./book-types.js?v=20261124-contents-1";
import { planTypeRevision, mappedTypeNames, migrateTypeDocument } from "./type-revisions.js?v=20261124-contents-1";
import { canonical } from "./ops.js?v=20261124-contents-1";
import { checkDocument, typeRevision } from "./schema.js?v=20261124-contents-1";
import { mergeTextEdit } from "./editing.js?v=20261124-contents-1";
import { upgradePages, isOldPage } from "./upgrade.js?v=20261124-contents-1";
import { blocksContext, toBlocks } from "./blocks-format.js?v=20261124-contents-1";
import { readingDocuments } from "./workflow.js?v=20261124-contents-1";

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

// Whether the browser's storage has room to cache a page image of `size` bytes and still keep half its quota free for
// the books themselves. Drawn pages are a cache: a book of large colour scans can fill a small quota (a private window, a
// browser driven by a script), and then saving the book's own files fails. Where the browser cannot tell, there is room.
async function roomFor(size) {
  try {
    const { usage, quota } = await navigator.storage.estimate();
    return !quota || usage + size < 0.5 * quota;
  } catch { return true; }
}

// Whether an image decodes (where the browser can tell; elsewhere it is taken as fine).
async function decodes(blob) {
  if (typeof createImageBitmap !== "function") return true;
  try { const bitmap = await createImageBitmap(blob); bitmap.close?.(); return true; } catch { return false; }
}

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
  const text = await (await fh.getFile()).text();
  // A file just created and not yet written is empty (a write commits only when it closes): it is not there yet.
  if (!text.trim()) throw new DOMException(`${path} is not written yet`, "NotFoundError");
  return JSON.parse(text);
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
  // The book's pages, always those of the manifest as last read or written (so they are never stale after book.json is
  // read again), and each page's place in them.
  get pages() { return this.manifest.pages; }
  // Pages marked "not interesting": dimmed in the grids and left out of what a stage's runs and moves default to. Only
  // a default (never the page list, counts, Read or exports), kept in book.json so it survives a reload and a .chaya.pdf.
  get skipped() { return new Set(this.manifest.skipped || []); }
  isSkipped(pid) { return (this.manifest.skipped || []).includes(pid); }
  async setSkipped(ids, skip) {
    if (!this.writable) throw new Error("This book is read only here: make an editable copy to dim pages.");
    await this.pageWrite(async () => {
      this.manifest = await this.readJson("book.json") || this.manifest;
      const set = new Set(this.manifest.skipped || []);
      for (const pid of ids) if (pid in this.index) { if (skip) set.add(pid); else set.delete(pid); }
      const list = this.pages.map(page => page.id).filter(pid => set.has(pid));
      if (list.length) this.manifest.skipped = list; else delete this.manifest.skipped;
      await this.writeFile("book.json", pretty(this.manifest));
    });
  }
  get index() {
    if (this.indexed?.pages !== this.manifest.pages) this.indexed = { pages: this.manifest.pages, index: Object.fromEntries(this.manifest.pages.map((p, i) => [p.id, i])) };
    return this.indexed.index;
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
    for (const page of this.pages) {
      const edit = await this.readJson(`edits/${page.id}.json`);
      if (edit) this.edits.set(page.id, edit);
    }
    await this.removeFile("work/pending-types.json");
  }

  async editPages(ids, mutate, { check = (doc, types) => checkDocument(doc, types)[0], focus = null, archive = false, protect = [] } = {}) {
    return this.pageWrite(async () => {
      if (this.writable) this.types = await this.readJson(this.manifest.types) || this.types;
      const models = new Map(), before = new Map(), drafts = {};
      for (const pid of [...new Set(ids)]) {
        if (!(pid in this.index)) throw new Error(`Unknown page ${pid}.`);
        const pending = this.writable && await this.readJson(this.stagePath(pid));
        if (pending) await this.finishStage(pid, pending);
        const model = this.writable ? await this.readJson(this.page(pid).document) : await this.model(pid);
        const edit = this.writable ? await this.readJson(`edits/${pid}.json`) : await idb.get("edits", [this.key, pid]) || this.edits.get(pid);
        const draft = await this.draft(pid), doc = draft?.doc || edit || model;
        if (!doc) throw new Error(`Prepare page ${this.index[pid] + 1} first.`);
        const errors = check(doc, this.types);
        if (draft && errors.length) throw new Error(`Fix page ${this.index[pid] + 1}’s draft first. ${errors[0]}`);
        if (model) this.models.set(pid, model);
        if (edit) this.edits.set(pid, edit); else this.edits.delete(pid);
        models.set(pid, model); before.set(pid, doc); drafts[pid] = draft;
      }
      const changed = await mutate(new Map([...before].map(([pid, doc]) => [pid, structuredClone(doc)])), this.types);
      const docs = {};
      for (const [pid, previous] of before) {
        const doc = changed.get(pid);
        if (!doc || doc.page.id !== pid) throw new Error("The edit must return each requested page.");
        const errors = check(doc, this.types);
        if (errors.length) throw new Error(errors[0]);
        docs[pid] = noteEdit(models.get(pid), this.blocksOf(doc), { focus });
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
      for (const page of this.pages) if (await this.readJson(page.document) || await this.readJson(`edits/${page.id}.json`) || await this.draft(page.id))
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
        if (pid in book.index) book.edits.set(pid, JSON.parse(await (await fh.getFile()).text()));
      }
    } catch (e) { console.warn("edits/ could not be read", e); }
    await book.upgradePages();
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
      if (m && m[1] in book.index) book.edits.set(m[1], doc);
    }
    for (const key of await idb.keys("edits")) {
      if (Array.isArray(key) && key[0] === book.key) book.edits.set(key[1], await idb.get("edits", key));
    }
    await book.upgradePages();
    return book;
  }

  // A PDF at a URL, as a File: opened by the app exactly as a PDF chosen from disk is.
  // With onProgress(received, total), it is told as the bytes come (total is 0 where the server does not say).
  static async fetchPdf(url, onProgress = null) {
    url = new URL(url, location.href).href;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const name = decodeURIComponent(new URL(url).pathname.split("/").pop() || "book.pdf");
    if (!onProgress || !r.body?.getReader) return new File([await r.arrayBuffer()], name, { type: "application/pdf" });
    const total = Number(r.headers.get("content-length")) || 0, reader = r.body.getReader(), parts = [];
    let received = 0, told = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value); received += value.length;
      if (received - told > 262144) { told = received; onProgress(received, total); }
    }
    onProgress(received, total);
    return new File(parts, name, { type: "application/pdf" });
  }

  page(pid) { return this.pages[this.index[pid]]; }

  // A page document in the form that is stored (0.4, schema/README.md): a 0.3 one (units, flows, relations, as the page
  // editor works on until it edits overrides itself) becomes its regions and the overrides that differ from what the
  // book's rules derive. Reads the pages that are loaded.
  blocksOf(doc) {
    if (!isOldPage(doc)) return doc;
    const docs = this.pages.map(page => page.id === doc.page.id ? doc : this.edits.get(page.id) || this.models.get(page.id)).filter(Boolean);
    const context = this.inReading(doc.page.id) ? blocksContext(readingDocuments(this.pages, docs, this.skipped), this.manifest.rules) : blocksContext([doc], this.manifest.rules);
    let out;
    try { out = toBlocks(doc, this.types, context); }
    catch (error) { console.warn(`page ${doc.page.id} was kept in the old form: ${error.message}`); return doc; }
    if (out.source?.layers?.units) { out.source = { ...out.source, layers: { ...out.source.layers } }; delete out.source.layers.units; }
    return out;
  }
  inReading(pid) { return !this.isSkipped(pid); }

  // Convert the book's 0.3 page documents to 0.4 (upgrade.js). A book in this browser or on disk is written back, page
  // by page, each after its 0.3 structure is kept in work/pre-0.4/<page id>.json, and book.json says when it is done;
  // a book that is read only (a PDF opened from a URL without a place to keep it) is converted in memory.
  // Static Book.onUpgrade(done, total), if set, is told as pages are converted.
  async upgradePages() {
    if (this.manifest.page_schema === "0.4") return 0;
    const models = new Map(), edits = new Map(this.edits);
    let unreadable = 0;
    for (const page of this.pages) {
      try { const doc = await this.model(page.id); if (doc) models.set(page.id, doc); }
      catch (error) { unreadable++; console.warn(`${page.document} could not be read, so the book is not converted yet: ${error.message}`); }
    }
    // Say so before the conversion starts: it keeps the page busy for a few seconds.
    if (this.pages.some(page => isOldPage(edits.get(page.id)) || isOldPage(models.get(page.id)))) {
      Book.onUpgrade?.(0, this.pages.length);
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    const done = await upgradePages({ pages: this.pages, models, edits, types: this.types, rules: await this.getRules(), skipped: this.skipped,
      progress: (n, total) => Book.onUpgrade?.(n, total) });
    for (const [pid, record] of done.records) {
      const model = done.models.get(pid) || this.models.get(pid), edit = done.edits.get(pid);
      if (this.writable) {
        await this.writeFile(`work/pre-0.4/${pid}.json`, pretty(record));
        if (done.models.has(pid)) await this.writeFile(this.page(pid).document, pretty(model));
        if (edit) await this.writeFile(`edits/${pid}.json`, pretty(edit));
      } else {
        this.files[`work/pre-0.4/${pid}.json`] = record;
        if (done.models.has(pid)) this.files[this.page(pid).document] = model;
        if (edit) this.files[`edits/${pid}.json`] = edit;
      }
      if (done.models.has(pid)) this.models.set(pid, model);
      if (edit) this.edits.set(pid, edit);
    }
    for (const failure of done.failed) console.warn(`page ${failure.page} was not converted to 0.4: ${failure.message}`);
    if (this.writable && !done.failed.length && !unreadable) {
      const manifest = await this.readJson("book.json") || structuredClone(this.manifest);
      manifest.page_schema = "0.4";
      await this.writeFile("book.json", pretty(manifest));
      this.manifest = manifest;
    }
    return done.records.size;
  }

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
  // without it, only their presence is checked (before writing a .chaya.pdf, which reads them anyway).
  async unreadableFiles({ parse = true } = {}) {
    if (this.kind !== "folder") return [];
    const out = [];
    const failed = (path, error) => out.push({ path, error: error.name && error.name !== "Error" ? `${error.name}: ${error.message}` : error.message });
    const pdf = this.manifest.pdf?.path;
    if (pdf) {
      try { if (!(await fileFrom(this.where, pdf)).size) throw new Error("the file is empty"); } catch (error) { failed(pdf, error); }
    }
    for (const page of this.pages) {
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

  // The book's structure rules (book.json `rules`, webapp/js/rules.js); none means the defaults. A book that cannot be
  // written keeps its changes in this browser, as reader options.
  get rules() { return this.manifest.rules; }
  async getRules() {
    if (!this.writable && !this.rulesLoaded) {
      const saved = await idb.get("settings", ["rules", this.key]).catch(() => null);
      if (saved) this.manifest.rules = saved;
      this.rulesLoaded = true;
    }
    return this.manifest.rules;
  }
  async saveRules(rules) {
    const next = rules ? JSON.parse(JSON.stringify(rules)) : null;
    if (this.writable) {
      await this.pageWrite(async () => {
        const manifest = await this.readJson("book.json") || structuredClone(this.manifest);
        if (next) manifest.rules = next; else delete manifest.rules;
        await this.writeFile("book.json", pretty(manifest));
        this.manifest = manifest;
      });
    } else {
      if (next) await idb.put("settings", ["rules", this.key], next); else await idb.del("settings", ["rules", this.key]);
      if (next) this.manifest.rules = next; else delete this.manifest.rules;
      this.rulesLoaded = true;
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
      const { openPdfData } = await import("./pipeline/pdf.js?v=20261124-contents-1");
      return openPdfData(this.kind === "chaya" ? this.pdfBytes.slice() : await this.originalPdf());
    })();
    return this.pdfPromise;
  }

  // A page's image: its file where it has one (a book folder made by the repository's tools), else drawn from its PDF
  // page at the size its regions are measured in. A book in this browser keeps what it draws in images/ (a cache:
  // not part of the book's data, and left out of a .chaya.pdf).
  // A page's image. Requests for the same page while it is being drawn share the drawing, so that one never reads the
  // cached file while another writes it; an image that does not decode (a cache left half written) is drawn again.
  imageBlob(pid) {
    this.imageJobs ||= new Map();
    if (!this.imageJobs.has(pid)) this.imageJobs.set(pid, this.pageImage(pid).finally(() => this.imageJobs.delete(pid)));
    return this.imageJobs.get(pid);
  }

  async pageImage(pid) {
    const p = this.page(pid);
    if (p.image && this.kind === "folder") { try { return await fileFrom(this.where, p.image); } catch (e) { if (e.name !== "NotFoundError") throw e; } }
    const cache = `images/${pid}.png`;
    if (this.browser) {
      try { const file = await fileFrom(this.where, cache); if (await decodes(file)) return file; }
      catch (e) { if (e.name !== "NotFoundError") throw e; }
    }
    if (!this.manifest.pdf && this.kind !== "chaya") throw new Error(`${pid} has no image, and the book no PDF to draw it from`);
    let W = p.width, H = p.height;
    if (!W) { const d = await this.model(pid); W = d?.page.width; H = d?.page.height; }
    const { renderPageSized } = await import("./pipeline/pdf.js?v=20261124-contents-1");
    let blob = await renderPageSized(await this.pdf(), p.pdf_page, W, H, p.pdf_part);
    if (!await decodes(blob)) blob = await renderPageSized(await this.pdf(), p.pdf_page, W, H, p.pdf_part);
    if (!await decodes(blob)) throw new Error(`page ${this.index[pid] + 1} could not be drawn from the PDF`);
    if (this.browser && await roomFor(blob.size)) await this.writeFile(cache, blob).catch(e => console.warn("the image cache", e));
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
    doc = this.blocksOf(doc);
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
        if (!name.endsWith(".json") || !(pid in this.index)) continue;
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
      out.doc = this.blocksOf(out.doc);
      const previous = draft?.doc || current;
      const journal = { format: "page-stage-save", version: 1, page: pid, doc: out.doc, valid: out.valid, draft: draft || null,
        previous: previous && LAYERS.some(layer => isProtected(previous, layer)) ? previous : null };
      await this.writeFile(this.stagePath(pid), pretty(journal));
      await this.finishStage(pid, journal);
      return { ...out, doc: await this.model(pid) };
    });
  }

  // Review changes the current version in place, including a correction in edits/.
  async savePageReview(pid, checked) {
    if (!this.writable) throw new Error("Open an editable copy to check this page.");
    return this.pageWrite(async () => {
      const pending = await this.readJson(this.stagePath(pid));
      if (pending) await this.finishStage(pid, pending);
      if (await this.draft(pid)) throw new Error("Correct the page’s draft before changing its review status.");
      const modelPath = this.page(pid).document, editPath = `edits/${pid}.json`;
      const edit = await this.readJson(editPath);
      const current = edit || await this.readJson(modelPath);
      if (!current) throw new Error("Prepare the page before checking it.");
      const doc = withPageReview(current, checked);
      await this.writeFile(edit ? editPath : modelPath, pretty(doc));
      if (edit) this.edits.set(pid, doc);
      else { this.models.set(pid, doc); this.edits.delete(pid); }
      return doc;
    });
  }

  saveStage(pid, doc, valid) { return this.updateStage(pid, () => ({ doc, valid })); }

  // A new book in an empty directory, from a PDF: the PDF itself (source.pdf, the book's source), the manifest and
  // the type list. pdf: {file, sha256, pageCount}; pages: [{pdfPage, part, width, height, source}] (the size each page is
  // drawn at, and how it was analyzed; `part`, for one side of a two-page spread, the [x0, x1] fractions of the PDF
  // page's width it is drawn from); the page images are drawn from the PDF when they are needed.
  static async create(handle, { title, bookId, types, pdf, pages: items, browser = false }) {
    const pages = items.map((item, i) => {
      const id = `${bookId}-page-${String(i + 1).padStart(3, "0")}`;
      return { id, document: `pages/${id}.json`, label: null, valid: null, pdf_page: item.pdfPage, ...(item.part ? { pdf_part: item.part } : {}),
        width: item.width, height: item.height, source: item.source };
    });
    const manifest = { format: "book-folder", version: 1, schema_version: "0.2", book_id: bookId, title, types: "types.json",
                       pdf: { path: "source.pdf", name: pdf.file.name, sha256: pdf.sha256, page_count: pdf.pageCount }, pages, page_schema: "0.4",
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
        doc = this.blocksOf(migrateTypeDocument(doc, this.types, operations));
        if (base) {
          const latest = await this.readJson(`edits/${pid}.json`) || model;
          const prior = migrateTypeDocument(base, this.types, operations);
          if (latest && focus === "text") doc = mergeTextEdit(latest, doc, prior);
          if (latest && focus === "all") doc = preservePageReview(doc, latest);
        }
      } else if (base) {
        doc = this.blocksOf(doc);
        const latest = await idb.get("edits", [this.key, pid]) || this.edits.get(pid) || await this.model(pid);
        if (focus === "text") doc = mergeTextEdit(latest, doc, base);
      }
      if (base && focus === "text") {
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
      try { doc = this.blocksOf(doc); } catch { /* a draft that does not pass the checks keeps its form */ }
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
      if (!(pid in this.index)) continue;
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
// `read` is the PDF already read (readChaya's result), so it is not read twice; onProgress(done, total) is told as the
// book's files are written into the browser.
export async function importChaya(bytes, { into = null, read = null, onProgress = null } = {}) {
  const { data, original } = read || await readChaya(bytes);
  if (!data || data.format !== "chaya-book") throw new Error("this PDF has no book in it (no chaya.json)");
  const manifest = data.files["book.json"];
  let dir = into;
  if (dir) {
    for await (const [name] of dir.entries()) await dir.removeEntry(name, { recursive: true });
  } else dir = await newBrowserBookDir(manifest.book_id);
  const book = new Book("folder", dir, manifest, null, { browser: true });
  await book.writeFile("source.pdf", original || bytes);
  const entries = Object.entries(data.files).filter(([path]) => path !== "book.json");
  for (const [k, [path, v]] of entries.entries()) {
    await book.writeFile(path, typeof v === "string" ? v : JSON.stringify(v, null, 1) + "\n");
    if (onProgress && (k % 25 === 24 || k === entries.length - 1)) onProgress(k + 1, entries.length);
  }
  manifest.pdf = { path: "source.pdf", ...(manifest.pdf || {}) };
  await book.writeFile("book.json", JSON.stringify(manifest, null, 1) + "\n");
  return Book.openFolder(dir, { browser: true });
}
