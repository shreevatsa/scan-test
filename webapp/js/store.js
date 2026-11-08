// Books (webapp/README.md, "Books"). A book is kept as a book folder: in this browser's own storage (the origin
// private file system, books/<name>/: the usual place, in any browser), or on disk with the File System Access API
// (Chrome and Edge, for the repository's tools; the user's corrected page documents are saved in edits/, beside the
// model's in pages/). A book's PDF (a PDF with the book's data attached, chayapdf.js; whatever its file is called)
// is the book as one file: opened from disk it goes into this browser's storage; opened from a URL, or where the
// browser keeps no books, it is read only (corrections are then kept in IndexedDB). Pages without an image file are
// drawn from the PDF. Drafts, versions that do not pass the checks yet, are always kept in IndexedDB.

import { readChaya, recoverOriginal, writeChaya, sha256hex } from "./chayapdf.js";

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
    this.pages = manifest.pages;
    this.index = Object.fromEntries(this.pages.map((p, i) => [p.id, i]));
    this.models = new Map();     // page id -> the model's page document
    this.edits = new Map();      // page id -> the user's saved page document
    this.imageUrls = new Map();
    this.style = null;           // the book's style sheet (schema 0.3), if book.json names one
    this.key = browser ? `browser:${where.name}` : kind === "folder" ? `folder:${manifest.book_id}:${where.name}` : `${kind}:${where}`;
  }

  get title() { return this.manifest.title; }
  get writable() { return this.kind === "folder"; }

  static async openFolder(handle, { browser = false } = {}) {
    const manifest = await readJsonFile(handle, "book.json");
    if (manifest.format !== "book-folder") throw new Error("book.json is not a book folder's manifest");
    const types = await readJsonFile(handle, manifest.types);
    const book = new Book("folder", handle, manifest, types, { browser });
    if (manifest.style) book.style = await readJsonFile(handle, manifest.style).catch(e => { console.warn("style sheet", e); return null; });
    try {
      const edits = await handle.getDirectoryHandle("edits", { create: true });
      for await (const [name, fh] of edits.entries()) {
        if (fh.kind !== "file" || !name.endsWith(".json")) continue;
        const pid = name.slice(0, -5);
        if (pid in book.index) book.edits.set(pid, JSON.parse(await (await fh.getFile()).text()));
      }
    } catch (e) { console.warn("edits/ could not be read", e); }
    if (!browser) await idb.put("handles", book.key, { handle, title: manifest.title, opened: Date.now() });
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
    return book;
  }

  // A book's PDF at a URL, read only. What it is comes from inside it, not its name: a PDF with a book in it (an
  // attached chaya.json) opens as that book; a plain PDF gives {plainPdf: File} for the caller to start a book from.
  static async openUrl(url) {
    url = new URL(url, location.href).href;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const bytes = new Uint8Array(await r.arrayBuffer());
    let read;
    try { read = await readChaya(bytes); } catch (e) { throw new Error(`not a PDF (${e.message})`); }
    if (read.data?.format === "chaya-book") return Book.openChaya(bytes, url);
    const name = decodeURIComponent(new URL(url).pathname.split("/").pop() || "book.pdf");
    return { plainPdf: new File([bytes], name, { type: "application/pdf" }) };
  }

  page(pid) { return this.pages[this.index[pid]]; }

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
    const parts = path.split("/");
    let d = this.where;
    for (const p of parts.slice(0, -1)) d = await d.getDirectoryHandle(p, { create: true });
    await writeHandle(await d.getFileHandle(parts[parts.length - 1], { create: true }), data);
  }

  async readJson(path) {
    try { return await readJsonFile(this.where, path); } catch (e) { if (e.name === "NotFoundError" || e.name === "TypeMismatchError") return null; throw e; }
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
      const path = this.manifest.style || "style.json";
      await this.writeFile(path, JSON.stringify(sheet, null, 1) + "\n");
      if (this.manifest.style !== path) {
        this.manifest.style = path;
        await this.writeFile("book.json", JSON.stringify(this.manifest, null, 1) + "\n");
      }
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
    await this.writeFile(this.page(pid).document, JSON.stringify(doc) + "\n");
    this.models.set(pid, doc);
    Object.assign(this.page(pid), { label: doc.page.label ?? null, valid });
    await this.writeFile("book.json", JSON.stringify(this.manifest, null, 1) + "\n");
  }

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

  async current(pid) { return this.edits.get(pid) || this.model(pid); }

  imageUrl(pid) {
    if (!this.imageUrls.has(pid)) {
      const p = this.page(pid);
      this.imageUrls.set(pid, this.imageBlob(pid).then(b => URL.createObjectURL(b)));
      this.imageUrls.get(pid).catch(() => this.imageUrls.delete(pid));
    }
    return this.imageUrls.get(pid);
  }

  // Save the user's corrected version of a page (it has passed the checks).
  async saveEdit(pid, doc) {
    if (this.kind === "folder") {
      const dir = await this.where.getDirectoryHandle("edits", { create: true });
      await writeHandle(await dir.getFileHandle(`${pid}.json`, { create: true }), pretty(doc));
    } else {
      await idb.put("edits", [this.key, pid], doc);
    }
    this.edits.set(pid, doc);
    await this.clearDraft(pid);
  }

  // Go back to the model's version.
  async revert(pid) {
    if (this.kind === "folder") {
      const dir = await this.where.getDirectoryHandle("edits", { create: true });
      try { await dir.removeEntry(`${pid}.json`); } catch (e) { if (e.name !== "NotFoundError") throw e; }
    } else {
      await idb.del("edits", [this.key, pid]);
    }
    this.edits.delete(pid);
    await this.clearDraft(pid);
  }

  draft(pid) { return idb.get("drafts", [this.key, pid]); }
  putDraft(pid, doc) { return idb.put("drafts", [this.key, pid], { doc, at: Date.now() }); }
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

export async function recentFolders() {
  const out = [];
  for (const key of await idb.keys("handles")) out.push({ key, ...(await idb.get("handles", key)) });
  return out.sort((a, b) => b.opened - a.opened);
}

export const forgetFolder = key => idb.del("handles", key);

// ---------------------------------------------------------------- books in this browser

async function booksDir() {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle("books", { create: true });
}

// The books kept in this browser's storage: {name, handle, manifest, saved}, the most recently saved first.
export async function browserBooks() {
  const out = [];
  for await (const [name, h] of (await booksDir()).entries()) {
    if (h.kind !== "directory") continue;
    try {
      const f = await (await h.getFileHandle("book.json")).getFile();
      out.push({ name, handle: h, manifest: JSON.parse(await f.text()), saved: f.lastModified });
    } catch (e) { /* not a book (yet) */ }
  }
  return out.sort((a, b) => b.saved - a.saved);
}

// A new, empty directory for a book in this browser (named after its id, with -2, -3… if taken). The browser is
// asked to keep this storage rather than clear it when space runs low.
export async function newBrowserBookDir(bookId) {
  const dir = await booksDir();
  const taken = new Set();
  for await (const [name] of dir.entries()) taken.add(name);
  let name = bookId, k = 1;
  while (taken.has(name)) name = `${bookId}-${++k}`;
  navigator.storage.persist?.().catch(() => {});
  return dir.getDirectoryHandle(name, { create: true });
}

export async function deleteBrowserBook(name) {
  await (await booksDir()).removeEntry(name, { recursive: true });
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
