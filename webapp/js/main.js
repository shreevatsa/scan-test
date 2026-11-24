// The app: a library of book folders, and for a book the page editor, the reader, the checks and the exports.
// Processing runs in the browser, with optional calls using the user's model API keys.

import { makeValidator, checkPage, checkTypes, readingOrderWarnings, typeRevision } from "./schema.js?v=20261124-vision-7";
import { Book, browserBooks, newBrowserBookDir, deleteBrowserBook, importChaya, copyRecords, storagePersistence, restoreChaya } from "./store.js?v=20261124-vision-7";
import { DiskCopy, copyState, copyLabel, spendingBlock, storageText } from "./disk-copy.js?v=20261124-vision-7";
import { RECIPE } from "./recipe.js?v=20261124-vision-7";
import { readerOptions } from "./pipeline/readers.js?v=20261124-vision-7";
import { readChaya, sha256hex } from "./chayapdf.js";
import { BlocksPanel, blockInspector, drawBlock, projectOpenBook } from "./blocksview.js?v=20261124-vision-7";
import { blockName } from "./blocks.js?v=20261124-vision-7";
import { bookReading, placeWarnings, readThroughBlocks } from "./reading.js?v=20261124-vision-7";
import { headingDefaults } from "./rules.js?v=20261124-vision-7";
import { normalizeTypeName, restoreWaiting, waitingRegions } from "./type-additions.js?v=20261124-vision-7";
import { restoredText } from "./pipeline/apply.js?v=20261124-vision-7";
import { PageView } from "./pageimage.js?v=20261124-vision-7";
import { markerForm } from "./editor.js?v=20261124-vision-7";
import { renderBookView, prepare, bookText, bookDocument } from "./reader.js?v=20261124-vision-7";
import { noteTypesOf, noteProblems } from "./note-links.js?v=20261124-vision-7";
import { renderStyle } from "./styleview.js?v=20261124-vision-7";
import { typeSetup } from "./type-setup.js?v=20261124-vision-7";
import { h, typeColors, esc } from "./render.js";
import * as ops from "./ops.js?v=20261124-vision-7";
import { EditError } from "./ops.js?v=20261124-vision-7";
import { Maker, post } from "./pipeline/run.js?v=20261124-vision-7";
import { CredentialChecks } from "./key-check.js?v=20261124-vision-7";
import { loadExamples, exampleHref, exampleSize } from "./examples.js?v=20261124-vision-7";
import { pageStages, workflowRoute, workflowAddress, reviewPageStates, currentStage, pageWalker, readingDocuments } from "./workflow.js?v=20261124-vision-7";
import { pruneOverrides } from "./blocks-format.js?v=20261124-vision-7";
import { layerState, layerView, noteEdit, preservePageReview } from "./layers.js?v=20261124-vision-7";
import { orderedRegions } from "./flags.js?v=20261124-vision-7";
import { assemble } from "./assemble.js?v=20261124-vision-7";
import { editorFocus, mergeTextEdit } from "./editing.js?v=20261124-vision-7";
import { overridesAfter } from "./structure.js?v=20261124-vision-7";
import { renderPages } from "./pagesview.js?v=20261124-vision-7";
import { settings } from "./store.js?v=20261124-vision-7";
import { renderBookSettings } from "./settingsview.js?v=20261124-vision-7";
import { reviewPageWithAI } from "./page-review-view.js?v=20261124-vision-7";
import { pageMenu } from "./page-actions.js?v=20261124-vision-7";

const $ = sel => document.querySelector(sel);
const FORMAT_BUTTONS = [["bold", "B", "bold (⌘B)"], ["italic", "I", "italic (⌘I)"], ["small_caps", "Sᴄ", "small capitals"],
  ["superscript", "x²", "superscript (not a note marker)"], ["subscript", "x₂", "subscript"], ["underline", "U", "underline (⌘U)"], ["spaced", "s p", "letter-spaced"]];

class App {
  constructor() {
    this.root = $("#app");
    Book.onUpgrade = (done, total) => this.upgradeProgress(done, total);
    this.selection = {};
    this.undoStack = [];
    this.redoStack = [];
    this.saveTimer = null;
    this.typingKey = null;
    this.lastTypingAt = 0;
    this.outlineJobs = new Map();
    this.outlineSeq = 0;
    window.addEventListener("hashchange", () => this.route().catch(error => this.toast(error.message, "bad")));
    window.addEventListener("keydown", e => this.keydown(e));
    window.addEventListener("beforeunload", e => { if (this.dirty) { this.flush(); } });
  }

  async start() {
    this.schema = await (await fetch(new URL("../schema.json", import.meta.url))).json();
    this.validate = makeValidator(this.schema);
    const params = new URLSearchParams(location.search);
    if (params.get("book")) {
      try {
        // A large book takes a while to come over a slow link: say how much has come.
        const name = params.get("book").split("/").pop();
        const mb = n => (n / 1048576).toFixed(n < 10485760 ? 1 : 0);
        this.showProgress(`Downloading ${name}…`);
        const file = await Book.fetchPdf(params.get("book"), (got, total) =>
          this.showProgress(`Downloading ${name}… ${mb(got)}${total ? ` of ${mb(total)}` : ""} MB`, total ? got : null, total || null));
        if (!params.has("proposal")) history.replaceState(null, "", location.pathname + location.hash);
        this.openPdfFile(file, params.get("proposal"));
      } catch (e) { this.library(`Could not open ${params.get("book")}: ${e.message}`); }
    } else if (params.get("local")) {
      const found = (await browserBooks({ damaged: true }).catch(() => [])).find(b => b.name === params.get("local"));
      if (found) await this.openBrowserBook(found);
      else this.library(`There is no book “${params.get("local")}” in this browser.`);
    } else this.library();
  }

  check(doc) { return checkPage(this.validate, doc, this.book.types); }

  toast(msg, kind = "info") {
    const t = h("div", { class: `toast ${kind}` }, msg);
    document.body.append(t);
    setTimeout(() => t.classList.add("gone"), 3200);
    setTimeout(() => t.remove(), 4000);
  }

  // ---------------------------------------------------------------- library

  async library(message) {
    this.book = null;
    this.closeDiskCopy();
    this.root.className = "library";
    if (location.search) history.replaceState(null, "", location.pathname);
    const mine = canKeepBooks() ? await browserBooks({ damaged: true }).catch(e => { console.warn(e); return []; }) : [];
    const copies = new Map(await Promise.all(mine.map(async b => [b.name, await copyRecords.get(`browser:${b.name}`) || {}])));
    const storage = canKeepBooks() ? await storagePersistence() : null;
    const examples = await loadExamples(import.meta.url).catch(() => []);
    const openUrl = () => { const u = urlInput.value.trim(); if (u) location.search = "?book=" + encodeURIComponent(u); };
    const urlInput = h("input", { placeholder: "URL of a PDF", size: 40, onkeydown: e => e.key === "Enter" && openUrl() });
    const pdfInput = h("input", { type: "file", accept: "application/pdf,.pdf", style: "display:none", onchange: e => e.target.files[0] && this.openPdfFile(e.target.files[0]) });
    const bookRow = b => {
      if (b.error) {
        const actions = h("span", {}, h("button", { class: "mini", onclick: () => this.damagedBook(b, [{ path: "book.json", error: b.error }]) }, "restore…"), " ",
          h("button", { class: "mini danger", onclick: () => actions.replaceChildren(`Delete the folder “${b.name}” from this browser? `,
            h("button", { class: "mini danger", onclick: async () => { await deleteBrowserBook(b.name); this.library(`The folder “${b.name}” was deleted from this browser.`); } }, "delete"), " ",
            h("button", { class: "mini", onclick: () => this.library() }, "keep")) }, "delete…"));
        return h("div", { class: "row" }, h("button", { class: "link", onclick: () => this.damagedBook(b, [{ path: "book.json", error: b.error }]) }, b.name),
          h("span", { class: "warn" }, ` ${b.error}: this folder in the browser's storage cannot be opened as a book `), actions);
      }
      const m = b.manifest;
      const copy = copyLabel(copyState(copies.get(b.name)), { hasWork: true, canPick: !!window.showSaveFilePicker, time: shortTime });
      const actions = h("span", {},
        h("button", { class: "mini", title: "the book as one file: its PDF with the book's data in it", onclick: async () => {
          const book = await Book.openFolder(b.handle, { browser: true });
          await this.saveChaya(book);
        } }, "download .chaya.pdf"), " ",
        h("button", { class: "mini danger", onclick: () => actions.replaceChildren(`Delete “${m.title}” from this browser? `,
          h("button", { class: "mini danger", onclick: async () => { await deleteBrowserBook(b.name); this.library(`“${m.title}” was deleted from this browser.`); } }, "delete"), " ",
          h("button", { class: "mini", onclick: () => this.library() }, "keep")) }, "delete…"));
      return h("div", { class: "book-row" },
        h("div", { class: "book-main" },
          h("button", { class: "link book-title", onclick: () => this.openBrowserBook(b) }, m.title),
          h("div", { class: "meta" }, `${m.pages.length} pages · ${m.pdf?.name || ""} · saved ${new Date(b.saved).toLocaleString()}`),
          h("div", { class: copy.warn ? "warn" : "meta" }, copy.text)),
        actions);
    };
    this.root.replaceChildren(h("div", { class: "lib" },
      h("h1", {}, "Books"),
      h("p", {}, "Open a scanned or digital PDF to start a book, or a .chaya.pdf (a PDF with its book inside) to go on with one."),
      message ? h("div", { class: "box warn" }, message) : null,
      canKeepBooks() ? null : h("div", { class: "box warn" }, "This page is not served over https (or from localhost), so the browser does not let it keep books: ",
        "a .chaya.pdf opens read only (corrections are kept in this browser), and new books cannot be made here."),
      h("div", { class: "open" }, pdfInput,
        h("button", { class: "primary", onclick: () => pdfInput.click() }, "Choose a PDF or .chaya.pdf…"),
        h("span", { class: "meta" }, "or at a URL:"), urlInput, h("button", { onclick: openUrl }, "Open")),
      canKeepBooks() && mine.length ? h("div", { class: "recent" }, h("h3", {}, "Books in this browser"),
        mine.map(bookRow),
        h("p", { class: storage?.persisted === false ? "warn" : "meta" }, storageText(storage || {})),
        h("p", { class: "meta" }, "Books are kept in this browser's own storage, which is lost if the browser clears this site's data. Give each book a copy on disk (in its header or Export), or download its .chaya.pdf.")) : null,
      examples.length ? h("div", { class: "examples" }, h("h3", {}, "Examples"),
        h("p", { class: "meta" }, "Open one to read it, correct it or see how a finished book looks. It opens as a copy in this browser; nothing is uploaded."),
        h("div", { class: "example-list" }, ...examples.map(example => h("a", { class: "example", href: exampleHref(example) },
          h("b", {}, example.title), h("span", { class: "blurb" }, example.blurb),
          h("span", { class: "meta" }, `${example.pages} pages${exampleSize(example) ? ` · ${exampleSize(example)}` : ""}`))))) : null));
  }

  // A book in this browser, opened only when the files it is known to have can be read: a book with a lost source PDF
  // or page document is not shown as if its pages were unprocessed.
  async openBrowserBook(b) {
    if (b.error) return this.damagedBook(b, [{ path: "book.json", error: b.error }]);
    let book;
    try { book = await Book.openFolder(b.handle, { browser: true }); }
    catch (e) { return this.damagedBook(b, [{ path: e.path || null, error: e.message }]); }
    let lost;
    try { lost = await book.unreadableFiles(); } catch (e) { lost = [{ path: null, error: e.message }]; }
    if (lost.length) return this.damagedBook(b, lost, book);
    try { await this.openBook(book); }
    catch (e) { this.library(`Could not open “${b.manifest?.title || b.name}”: ${e.message}`); }
  }

  // A book in this browser some of whose files cannot be read: which ones, and putting it back from a .chaya.pdf.
  async damagedBook(entry, lost, book = null) {
    this.book = null;
    this.closeDiskCopy();
    this.root.className = "library";
    history.replaceState(null, "", `${location.pathname}?local=${encodeURIComponent(entry.name)}`);
    const key = `browser:${entry.name}`, record = await copyRecords.get(key) || {};
    const title = entry.manifest?.title || book?.title || entry.name, bookId = entry.manifest?.book_id || book?.manifest.book_id || null;
    const status = h("p", { role: "status" });
    const restore = async (bytes, name, fromDisk = false) => {
      status.textContent = `Restoring from ${name}…`;
      try {
        const restored = await restoreChaya(bytes, entry.handle, bookId);
        const now = Date.now();
        await copyRecords.update(key, value => fromDisk ? { ...value, changed_at: value.written_at || now }
          : { ...value, changed_at: now, exported_at: now, exported_as: name });
        await this.openBrowserBook({ name: entry.name, handle: entry.handle, manifest: restored.manifest });
      } catch (e) { status.textContent = `Could not restore from ${name}: ${e.message}`; }
    };
    const fileInput = h("input", { type: "file", accept: "application/pdf,.pdf", style: "display:none", onchange: async e => {
      const file = e.target.files[0];
      if (file) await restore(new Uint8Array(await file.arrayBuffer()), file.name);
    } });
    const fromDisk = record.handle ? h("button", { class: "primary", onclick: async () => {
      try {
        const asked = await record.handle.queryPermission?.({ mode: "read" });
        if (asked && asked !== "granted" && await record.handle.requestPermission({ mode: "read" }) !== "granted") throw new Error("the browser was not given permission to read it");
        const file = await record.handle.getFile();
        await restore(new Uint8Array(await file.arrayBuffer()), record.name, true);
      } catch (e) { status.textContent = `Could not read ${record.name}: ${e.message}`; }
    } }, `Restore from the copy on disk (${record.name}${record.written_at ? `, written ${shortTime(record.written_at)}` : ""})`) : null;
    this.root.replaceChildren(h("div", { class: "lib" },
      h("h1", {}, title),
      h("div", { class: "box warn" }, h("p", {}, "This book is in this browser, but some of its files cannot be read, so it is not opened: without them its processed pages would look unprocessed."),
        h("ul", {}, ...lost.map(item => h("li", {}, item.path ? [h("code", {}, item.path), " · "] : null, item.error)))),
      h("p", {}, "Put the book back from a .chaya.pdf of it: its copy on disk, or a file saved from Export. What is in this browser is replaced by the file’s contents."),
      h("div", { class: "actions" }, fileInput, fromDisk, " ",
        h("button", { class: fromDisk ? "" : "primary", onclick: () => fileInput.click() }, "Restore from a .chaya.pdf…"), " ",
        book ? h("button", { onclick: () => this.openBook(book).catch(e => { status.textContent = e.message; }) }, "Open what can be read") : null, " ",
        h("button", { onclick: () => this.library() }, "Back to the library")),
      status,
      book ? h("p", { class: "meta" }, "“Open what can be read” shows the pages whose files are lost as unprocessed. The copy on disk is not written while files are missing, so it is not replaced by this damaged copy.") : null));
  }

  // A PDF chosen in the library: a .chaya.pdf goes into this browser (or opens the copy already there); a plain PDF
  // opens its book in this browser if there is one, else starts a new book.
  // A step of opening a book that takes a while: what is happening, with a bar (one that only moves, where how much is
  // left is not known).
  upgradeProgress(done, total) {
    if (this.root.querySelector(":scope > .opening")) this.showProgress(`Converting the book's pages to the blocks form… ${done ? `${done.toLocaleString()} of ${total.toLocaleString()}` : ""}`, done, total);
  }

  showProgress(text, value = null, max = null) {
    let box = this.root.querySelector(":scope > .opening");
    if (!box) { box = h("div", { class: "lib opening" }, h("p", {}), h("progress", {})); this.root.replaceChildren(box); }
    box.querySelector("p").textContent = text;
    const bar = box.querySelector("progress");
    if (value === null) bar.removeAttribute("value"); else { bar.max = max; bar.value = value; }
  }

  async openPdfFile(file, proposalUrl = null) {
    this.showProgress(`Reading ${file.name}…`);
    const bytes = new Uint8Array(await file.arrayBuffer());
    let read;
    try { read = await readChaya(bytes); } catch (e) { return this.library(`${file.name} could not be read as a PDF: ${e.message}`); }
    // Without a secure context (https or localhost) the browser keeps no books: a .chaya.pdf opens read only.
    if (!canKeepBooks()) {
      if (!read.data) return this.library(`${file.name} has no book in it, and new books can be made only where this page is served over https (or from localhost).`);
      try { return await this.openBook(await Book.openChaya(bytes, file.name)); } catch (e) { return this.library(`Could not open ${file.name}: ${e.message}`); }
    }
    const sha = await sha256hex(bytes);
    const mine = await browserBooks().catch(() => []);
    const choose = (title, text, buttons) => this.root.replaceChildren(h("div", { class: "lib" }, h("h1", {}, title), h("p", {}, text),
      h("div", { class: "actions" }, ...buttons, h("button", { onclick: () => this.library() }, "Cancel"))));
    if (read.data) {
      const m = read.data.files["book.json"];
      const same = mine.find(b => b.manifest.book_id === m.book_id && b.manifest.pdf?.sha256 === m.pdf?.sha256);
      const load = async into => {
        try {
          const n = Object.keys(read.data.files).length;
          this.showProgress(`Saving the book in this browser… 0 of ${n.toLocaleString()} files`, 0, n);
          const book = await importChaya(bytes, { into, read, onProgress: (done, total) =>
            this.showProgress(`Saving the book in this browser… ${done.toLocaleString()} of ${total.toLocaleString()} files`, done, total) });
          const now = Date.now();
          await copyRecords.update(book.key, value => ({ ...value, changed_at: now, exported_at: now, exported_as: file.name }));
          this.showProgress(`Opening ${m.title || file.name}…`);
          await this.openBook(book);
        } catch (e) { this.library(`Could not open ${file.name}: ${e.message}`); }
      };
      if (!same) return load(null);
      return choose(m.title, `This browser already has this book, saved ${new Date(same.saved).toLocaleString()}; the file was saved ${new Date(read.data.saved_at_utc).toLocaleString()}.`, [
        h("button", { class: "primary", onclick: () => load(same.handle) }, "Replace the browser's copy with the file"), " ",
        h("button", { onclick: () => this.openBrowserBook(same) }, "Open the browser's copy"), " ",
        h("button", { onclick: () => load(null) }, "Keep both"), " "]);
    }
    const same = mine.filter(b => b.manifest.pdf?.sha256 === sha);
    if (same.length) {
      return choose(file.name, `This browser already has a book made from this PDF: ${same.map(b => `“${b.manifest.title}”`).join(", ")}.`, [
        h("button", { class: "primary", onclick: () => this.openBrowserBook(same[0]) }, `Open “${same[0].manifest.title}”`), " ",
        h("button", { onclick: () => this.newBookForm(file, null, proposalUrl) }, "Make another book from it"), " "]);
    }
    this.newBookForm(file, null, proposalUrl);
  }

  // Save the book as a .chaya.pdf: into a file chosen once (Chrome and Edge, which then save to it again), or as a
  // download.
  async saveChaya(book, { again = false } = {}) {
    try {
      this.toast("Making the .chaya.pdf…");
      const at = Date.now();
      const bytes = await book.chayaBytes();
      const name = `${book.manifest.book_id}.chaya.pdf`;
      if (window.showSaveFilePicker) {
        let fh = again ? book.chayaHandle : null;
        if (!fh) fh = await window.showSaveFilePicker({ suggestedName: name, types: [{ description: "PDF with the book in it", accept: { "application/pdf": [".pdf"] } }] });
        const w = await fh.createWritable();
        await w.write(bytes);
        await w.close();
        book.chayaHandle = fh;
        this.toast(`Saved ${fh.name} (${(bytes.length / 1048576).toFixed(1)} MB).`);
        this.noteExport(book, at, fh.name);
      } else {
        const a = h("a", { href: URL.createObjectURL(new Blob([bytes], { type: "application/pdf" })), download: name });
        document.body.append(a); a.click(); a.remove();
        this.toast(`Downloaded ${name} (${(bytes.length / 1048576).toFixed(1)} MB).`);
        this.noteExport(book, at, name);
      }
      return true;
    } catch (e) { if (e.name !== "AbortError") this.toast(`Could not save the .chaya.pdf: ${e.message}`, "bad"); return false; }
  }

  // A book saved as a file covers the changes made before `at`.
  noteExport(book, at, name) {
    if (!book.browser) return;
    if (this.book === book && this.diskCopy) this.diskCopy.noteExport(at, name);
    else copyRecords.update(book.key, value => ({ ...value, exported_at: at, exported_as: name })).catch(e => console.warn("the copy record", e));
  }

  // ---------------------------------------------------------------- the copy on disk (disk-copy.js)

  async openDiskCopy(book) {
    this.closeDiskCopy();
    if (!book.browser) return;
    storagePersistence({ ask: true }).then(value => { this.storage = value; }).catch(() => {});
    const record = await copyRecords.get(book.key) || {};
    let previous = null;
    const copy = new DiskCopy({ record,
      store: value => copyRecords.put(book.key, value),
      bytes: () => book.chayaBytes(),
      write: async (handle, bytes) => { const writable = await handle.createWritable(); await writable.write(bytes); await writable.close(); },
      permission: handle => handle.queryPermission ? handle.queryPermission({ mode: "readwrite" }) : "granted",
      request: handle => handle.requestPermission ? handle.requestPermission({ mode: "readwrite" }) : "granted",
      check: async () => (await book.unreadableFiles({ parse: false })).map(item => `${item.path}: ${item.error}`),
      onState: state => {
        if (state.kind !== previous && state.kind === "error") this.toast(`The copy on disk was not written: ${state.error}`, "bad");
        if (state.kind !== previous && state.kind === "permission") this.toast(`The browser needs permission again to write ${state.name}. Use the button in the header.`, "warn");
        previous = state.kind;
        this.renderCopyStatus();
        if (this.mode === "export") this.renderCopySection?.();
      } });
    this.diskCopy = copy;
    book.onChange = () => copy.noteChange();
    await copy.start();
  }

  closeDiskCopy() {
    const copy = this.diskCopy;
    this.diskCopy = null;
    if (!copy) return;
    copy.dispose();
    if (copy.state.stale && copy.permission === "granted") copy.checkpoint().catch(() => {});
  }

  // Leaving the book: its last changes are written to the copy on disk first.
  async leaveBook() {
    const copy = this.diskCopy;
    if (copy?.state.stale && copy.permission === "granted") {
      this.toast("Writing the copy on disk…");
      if (!await copy.checkpoint()) this.toast(`The copy on disk was not written: ${copy.state.error || "permission is needed"}`, "bad");
    }
    history.replaceState(null, "", location.pathname);
    this.library();
  }

  // Choose the file for the copy on disk, and write it.
  async chooseDiskCopy() {
    const book = this.book, copy = this.diskCopy;
    if (!copy) return false;
    if (!window.showSaveFilePicker) return this.saveChaya(book);
    let handle;
    try {
      handle = await window.showSaveFilePicker({ suggestedName: `${book.manifest.book_id}.chaya.pdf`, types: [{ description: "PDF with the book in it", accept: { "application/pdf": [".pdf"] } }] });
    } catch (e) { if (e.name !== "AbortError") this.toast(`Could not choose the file: ${e.message}`, "bad"); return false; }
    this.toast(`Writing ${handle.name}…`);
    const written = await copy.choose(handle);
    if (written) this.toast(`Wrote ${handle.name}. It is written again after each run, after moving pages on, and at most every five minutes while there are changes.`);
    return written;
  }

  bookHasWork() {
    if (this.book?.edits.size) return true;
    for (const state of this.pageStates?.values() || []) if (Object.values(state.layers).some(layer => layer && layer.state !== "provisional")) return true;
    return false;
  }

  // The header's note on the copy on disk: when it was last written, or a warning with what to do.
  renderCopyStatus() {
    const el = this.copyStatus;
    if (!el) return;
    const copy = this.diskCopy, label = copy && copyLabel(copy.state, { hasWork: this.bookHasWork(), canPick: !!window.showSaveFilePicker, time: shortTime });
    el.className = `copy-status${label?.warn ? " warn" : ""}`;
    if (!label) { el.replaceChildren(); return; }
    const state = copy.state;
    el.title = state.disk ? `${label.when ? `Last saved to ${state.name} ${label.when}. ` : ""}It is saved again after each processing run, after review marks change, and at most every five minutes while there are changes.`
      : "Books are kept in this browser’s storage. A file on disk keeps the book if the browser clears it.";
    const actions = {
      choose: ["Save to a file…", () => this.chooseDiskCopy()],
      download: ["Download .chaya.pdf", () => this.saveChaya(this.book)],
      allow: ["Allow writing", () => copy.allow()],
      retry: ["Try again", () => copy.write()] };
    const action = actions[label.action];
    el.replaceChildren(label.text, ...action ? [" ", h("button", { class: "mini", onclick: action[1] }, action[0])] : []);
  }

  // Before a run that spends money: a book with no copy outside the browser that has its latest change waits for one,
  // or for an explicit "Run anyway". Resolves whether to run.
  confirmSpending() {
    const copy = this.diskCopy;
    const block = copy && spendingBlock(copy.state);
    if (!block) return Promise.resolve(true);
    return new Promise(resolve => {
      const state = copy.state;
      const dialog = h("dialog", { class: "type-dialog spend-guard", "aria-label": "Keep a copy before spending" });
      const done = value => { if (dialog.open) dialog.close(); dialog.remove(); resolve(value); };
      const status = h("p", { role: "status" });
      const text = block === "permission" ? `The browser needs permission again to write this book’s copy on disk (${state.name}). Without it, the results of this run are kept only in this browser.`
        : block === "error" ? `The copy on disk was not written: ${state.error}. Without it, the results of this run are kept only in this browser.`
          : `This book has no copy outside this browser${state.exportedAt ? ` with its latest changes (it was last saved as a file ${shortTime(state.exportedAt)})` : ""}. This run spends money on model calls, and if the browser loses its storage the results are lost with it.`;
      const primary = block === "permission" ? ["Allow writing", () => copy.allow()]
        : block === "error" ? ["Try writing it again", () => copy.write()]
          : window.showSaveFilePicker ? ["Save to a file…", () => this.chooseDiskCopy()] : ["Download .chaya.pdf", () => this.saveChaya(this.book)];
      const go = h("button", { class: "primary", onclick: async () => {
        go.disabled = true;
        try {
          if (await primary[1]()) return done(true);
          status.textContent = copy.state.kind === "permission" ? "The browser did not give permission." : copy.state.error ? `Not written: ${copy.state.error}` : "No copy was made.";
        } finally { go.disabled = false; }
      } }, primary[0]);
      dialog.append(h("h2", {}, "Keep a copy before spending?"), h("p", {}, text), status,
        h("div", { class: "actions" }, go, h("button", { onclick: () => done(true) }, "Run anyway"), h("button", { onclick: () => done(false) }, "Cancel")));
      dialog.addEventListener("cancel", event => { event.preventDefault(); done(false); });
      document.body.append(dialog);
      dialog.showModal();
    });
  }

  async newBookForm(pdfGiven = null, template = null, proposalUrl = null) {
    const index = await (await fetch(new URL("../types/index.json", import.meta.url))).json();
    const title = h("input", { size: 60, placeholder: "the book's title" });
    const bookId = h("input", { size: 24, placeholder: "a short id, such as kale-1913" });
    const description = h("textarea", { rows: 4, cols: 80, placeholder: "what the book is: its parts, languages and scripts, and how its pages are laid out" });
    for (const field of [title, bookId, description]) field.addEventListener("input", () => { field.dataset.edited = "1"; });
    const files = h("input", { type: "file", accept: "application/pdf,.pdf" });
    const info = h("span", { class: "meta" });
    const progress = h("div", { class: "meta" });
    let pdfDoc = null, pdfFile = null, pdfSha = null, opening = null, creating = false;
    // A new book starts with the draft types, which Regions builds on (Settings → Book types edits the list). This form
    // offers a choice only for an excerpt of an existing book (its types are the starting point) and for a saved proposal.
    const full = !!(template || proposalUrl);
    const setup = full ? typeSetup({ app: this, title, bookId, description, index, template, proposalUrl, onBusy: busy => {
      bookFields.querySelectorAll("input,textarea").forEach(control => { control.disabled = busy; });
      makeButton.disabled = busy;
    } }) : {
      element: null, usePdf: async () => {}, saveToBook: async () => {},
      loadTypes: async () => {
        const types = await (await fetch(new URL("../types/generic.json", import.meta.url))).json();
        types.source = { ...types.source, draft: true };
        return types;
      },
    };
    const usePdf = async file => {
      const token = opening = Symbol();
      pdfDoc = null; pdfFile = file && (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) ? file : null;
      pdfSha = null;
      await setup.usePdf(null);
      if (opening !== token) return;
      info.textContent = "";
      if (file && !pdfFile) { info.textContent = "Choose a PDF. (Page images can be made into one first, for example with img2pdf.)"; return; }
      if (!pdfFile) return;
      info.textContent = "Opening the PDF…";
      try {
        const { openPdf } = await import("./pipeline/pdf.js");
        const selected = pdfFile;
        const doc = await openPdf(selected);
        const sha = await sha256hex(new Uint8Array(await selected.arrayBuffer()));
        if (opening !== token) { await doc.destroy(); return; }
        pdfDoc = doc; pdfSha = sha;
        info.textContent = `${pdfFile.name}: ${pdfDoc.numPages} pages.`;
        if (!title.value) title.value = pdfFile.name.replace(/\.pdf$/i, "");
        if (!bookId.value) bookId.value = pdfFile.name.replace(/\.pdf$/i, "").toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
        await setup.usePdf({ doc, file: selected, sha });
      } catch (e) { if (opening === token) info.textContent = `The PDF setup could not finish. ${e.message}`; }
    };
    files.addEventListener("change", () => usePdf(files.files[0]));
    const go = async () => {
      if (creating) return;
      creating = true;
      formFields.disabled = makeButton.disabled = true;
      try {
        const id = bookId.value.trim();
        if (!/^[A-Za-z0-9._-]+$/.test(id)) { idDetails.open = true; throw new Error("give a book id of letters, digits, dots, dashes and underscores"); }
        let types = await setup.loadTypes();
        if (!types) throw new Error("load a unit type list");
        types = { ...types, book_id: id, title: title.value.trim() || types.title };
        // What the box shows is what is saved and sent to the models (never a starter list's placeholder text).
        types.description = description.value.trim();
        const errs = this.validate(types);
        if (!errs.length) errs.push(...checkTypes(types));
        if (errs.length) throw new Error(`the type list: ${errs[0]}`);
        if (!pdfFile) throw new Error("choose the book's PDF");
        if (!pdfDoc) throw new Error("the PDF is not open yet");
        const { pageInfo, drawnSize } = await import("./pipeline/pdf.js");
        // Every page of the PDF is in the book. A page that is not part of it (a library's cover, a blank page) is
        // left with no regions ("No content on this page" in Regions).
        const numbers = Array.from({ length: pdfDoc.numPages }, (_, i) => i + 1);
        // Each page's make-up and the size it is drawn at (its regions are measured in that size's pixels).
        const pages = [];
        for (const [i, n] of numbers.entries()) {
          progress.textContent = `Looking at page ${i + 1} of ${numbers.length}…`;
          const pi = await pageInfo(pdfDoc, n);
          const size = drawnSize(pi);
          pages.push({ pdfPage: n, width: size.width, height: size.height,
                       source: { render: { library: "pdf.js", effective_dpi: size.dpi, page_kind: pi.kind, scan_image: pi.scan_image, page_size_points: pi.size_points,
                                           rule: "a scanned page (an image covering at least half of it) at 300 dpi, or the scan's own resolution when lower; other pages at 300 dpi" },
                                 text_layer: { characters: pi.text_characters }, images: pi.images } });
        }
        progress.textContent = "Putting the book into this browser…";
        const dir = await newBrowserBookDir(id);
        const book = await Book.create(dir, { title: types.title, bookId: id, types, pages, browser: true,
          pdf: { file: pdfFile, sha256: pdfSha, pageCount: pdfDoc.numPages } });
        // A new book starts with the recipe; a proposal's or an excerpt's model choices replace it.
        if (!template) await book.saveReaderOptions(readerOptions(RECIPE, types));
        await setup.saveToBook(book);
        if (template) await book.saveReaderOptions(await template.getReaderOptions());
        // A new book's headings start sections (Settings → Structure), where its type list has a heading and a section type.
        const headings = template ? [] : headingDefaults(types);
        if (headings.length && !book.manifest.rules) await book.saveRules({ headings });
        progress.textContent = "Done.";
        await this.openBook(book);
        location.hash = "#pages";
      } catch (e) { this.toast(e.message, "bad"); progress.textContent = ""; }
      finally { creating = false; formFields.disabled = makeButton.disabled = false; }
    };
    const idDetails = h("details", { class: "book-id" }, h("summary", { class: "meta" }, "Book id (made from the file name; change it only if needed)"), h("label", {}, "Book id ", bookId));
    const bookFields = h("div", { class: "fields col" },
      pdfGiven ? h("label", {}, "PDF ", h("b", {}, pdfGiven.name), " ", info) : h("label", {}, "PDF ", files, " ", info),
      h("label", {}, "Title ", title),
      idDetails,
      full ? h("label", { class: "stack" }, "Description of the book, for the models ", description) : null);
    const formFields = h("fieldset", { class: "new-book-fields" }, bookFields, setup.element);
    const makeButton = h("button", { class: "primary", onclick: go }, "Start the book");
    this.root.replaceChildren(h("div", { class: "lib" }, h("h1", {}, "A new book"),
      h("p", {}, "The book is kept in this browser, and its pages are drawn from the PDF. Use Process pages to find boxes and read their text. Choose models and edit the type list in Settings."),
      formFields,
      h("div", { class: "actions" }, makeButton, " ",
        h("button", { onclick: () => this.library() }, "Cancel")), progress));
    if (pdfGiven) usePdf(pdfGiven);
  }

  // ---------------------------------------------------------------- book

  async openBook(book) {
    this.book = book;
    this.regionOverview = {};
    this.processOpen = {};
    this.typeOverview = {};
    this.pageViews = new Map();
    this.workflowScroll = new Map();
    this.lastTypeRevision = null;
    if (book.browser) history.replaceState(null, "", `${location.pathname}?local=${encodeURIComponent(book.where.name)}${location.hash}`);
    this.tl = book.types;
    this.colors = typeColors(this.tl);
    this.furniture = new Set(Object.entries(this.tl.types).filter(([, t]) => t.role === "furniture").map(([n]) => n));
    this.doc = null;
    this.pid = null;
    this.dirty = false;
    this.pageBuilt = false;
    this.pageStates = new Map();
    this.pagesSelection = new Set();
    this.workflowLoading = true;
    this.main?.replaceChildren(h("p", { class: "loading" }, "Loading page states…"));
    await this.openDiskCopy(book);
    await book.all();
    await book.getRules();
    await Promise.all(book.pages.map(page => this.refreshWorkflowPage(page.id)));
    this.workflowLoading = false;
    this.refreshWorkflowFlags();
    const tlErrors = [...this.validate(this.tl)];
    if (tlErrors.length) this.toast(`The type list has problems: ${tlErrors[0]}`, "bad");
    this.layout();
    if (!location.hash) location.hash = book.pages.every(page => book.isSkipped(page.id) || currentStage(this.pageStates.get(page.id)) === "read") ? "#read" : "#pages";
    else await this.route();
  }

  async refreshWorkflowPage(pid) {
    const book = this.book, current = await book.current(pid), draft = await book.draft(pid).catch(() => null);
    const [errors, warnings] = draft ? this.check(draft.doc) : current ? this.check(current) : [[], []];
    this.pageStates.set(pid, { ...pageStages(current, book.types, errors, warnings), runErrors: this.pageStates.get(pid)?.runErrors || {} });
    if (!this.workflowLoading) { this.refreshWorkflowFlags(); this.renderCopyStatus(); }
  }

  refreshWorkflowFlags() {
    // In page order, as Read assembles them: a page with no document yet or an invalid one is a gap nothing joins across.
    const docs = this.book.pages.map(page => this.pageStates.get(page.id)).map(state => (state?.valid && state.doc) || null);
    let warnings = [];
    try {
      const derived = readThroughBlocks(docs, this.book.types, this.book.rules);
      warnings = placeWarnings(assemble(derived, this.book.types)[1], derived);
      // A page in the blocks form has no units of its own: its reading order is checked as Read derives it.
      docs.forEach((doc, i) => { if (doc?.overrides && derived[i]) warnings.push(...readingOrderWarnings(derived[i])); });
    } catch { /* Page checks identify invalid trees. */ }
    reviewPageStates(this.book.pages, this.pageStates, this.book.types, warnings);
  }

  syncTypes() {
    this.tl = this.book.types;
    this.colors = typeColors(this.tl);
    this.furniture = new Set(Object.entries(this.tl.types).filter(([, type]) => type.role === "furniture").map(([name]) => name));
    if (!this.workflowLoading) this.refreshWorkflowFlags();
  }

  async afterTypesSaved(plan) {
    const pid = this.pid, region = this.mode === "page" ? this.selection.region : null;
    this.workflowLoading = true;
    try {
      this.syncTypes();
      for (const page of this.book.pages) await this.refreshWorkflowPage(page.id);
    } finally { this.workflowLoading = false; }
    this.refreshWorkflowFlags();
    const title = this.header.querySelector(".title");
    title.textContent = title.title = this.book.title;
    this.doc = null; this.pageBuilt = false; this.undoStack = []; this.redoStack = [];
    this.lastTypeRevision = plan;
    const selectedType = this.typeOverview.selected;
    if (selectedType && !this.tl.types[selectedType]) this.typeOverview.selected = this.tl.source?.aliases?.[selectedType];
    this.dirty = false;
    this.workflowBusy = false;
    await this.route();
    if (region && this.mode === "page" && this.pid === pid && this.doc?.page.regions.some(value => value.id === region)) this.select({ region });
    await this.refreshTypeList?.();
  }

  regionFlagContext(doc) {
    const index = this.book.index[doc.page.id], docOf = id => (id === doc.page.id ? doc : this.pageStates.get(id)?.doc || null);
    return { errors: this.check(doc)[0], previous: pageWalker(this.book.pages, index, docOf, -1), next: pageWalker(this.book.pages, index, docOf, 1), cache: new WeakMap() };
  }

  async startByHand(pid) {
    if (this.workflowBusy) return;
    const book = this.book;
    this.workflowBusy = true;
    try {
      const maker = await this.getMaker(), file = await book.imageBlob(pid);
      const bitmap = await createImageBitmap(file);
      const record = { width: bitmap.width, height: bitmap.height, regions: [], local_method: "manual", types_revision: typeRevision(book.types.source?.revision) };
      bitmap.close?.();
      const candidate = maker.provisional(pid, record, await sha256hex(new Uint8Array(await file.arrayBuffer())));
      candidate.source.layers.regions.state = "edited";
      candidate.source.layers.regions.made_by = "user";
      const local = await this.outlines(pid, await book.imageUrl(pid), []);
      if (!local.error) Object.assign(candidate.source, { char_h: local.charH, page_angle_deg: local.angle, uncovered_lines: local.uncovered || [] });
      await book.updateStage(pid, (current, draft) => {
        if (draft) throw new Error("Resume this page’s draft before starting it by hand.");
        return { doc: current || candidate, valid: !this.check(current || candidate)[0].length };
      });
      if (this.book !== book) return;
      await this.refreshWorkflowPage(pid);
      this.doc = null; this.pageBuilt = false;
    } finally { this.workflowBusy = false; }
    if (location.hash === workflowAddress("page", pid)) await this.route(); else this.openPage(pid);
  }

  // Remove every region in one undoable edit. A blank page needs no model work.
  async markNoContent() {
    if (this.mode !== "page" || !this.doc || !this.book.writable) return;
    if (this.workflowBusy || this.outlineBusy) return this.toast("Wait for the current edit to finish.");
    const pid = this.pid, doc = this.doc, regions = doc.page.regions;
    const withText = regions.filter(region => region.lines?.some(line => typeof line.text === "string")).length;
    const edited = this.book.edits.has(pid) || ["regions", "text"].some(layer => layerState(doc, layer)?.state === "edited");
    if (regions.length && (withText || edited)) {
      const lines = [`This removes its ${regions.length} ${regions.length === 1 ? "region" : "regions"}${withText ? `, ${withText} of them with text,` : ""}.`,
        ...edited ? ["The page has your edits. Undo restores the regions while the page is open."] : []];
      if (!await this.confirmDialog("No content on this page?", lines, "Remove the regions")) return;
      if (this.pid !== pid) return;
    }
    if (regions.length || doc.source?.uncovered_lines?.length || doc.source?.omitted_regions?.length || doc.source?.warnings?.length) {
      const removed = this.edit(next => {
        for (const region of [...next.page.regions]) ops.deleteRegion(next, region.id);
        // Printed lines outside the regions, unassigned regions and the region finder's notes are not for review now.
        delete next.source.uncovered_lines;
        delete next.source.omitted_regions;
        delete next.source.warnings;
        this.selection = {};
      });
      if (!removed) return;
    }
    await this.flush();
    if (this.pid !== pid) return;
    if (this.dirty || this.lastErrors?.length) return this.toast("The page could not be saved without its regions.", "bad");
    await this.refreshWorkflowPage(pid);
    this.diskCopy?.checkpoint();
    this.toast("No content on this page. Undo brings the regions back.");
  }

  // A question before an action, answered in a dialog: resolves whether to go ahead.
  confirmDialog(title, lines, action) {
    return new Promise(resolve => {
      const dialog = h("dialog", { class: "type-dialog confirm-dialog", "aria-label": title });
      const done = value => { if (dialog.open) dialog.close(); dialog.remove(); resolve(value); };
      dialog.append(h("h2", {}, title), ...lines.map(line => h("p", {}, line)),
        h("div", { class: "actions" }, h("button", { class: "primary", onclick: () => done(true) }, action), h("button", { onclick: () => done(false) }, "Cancel")));
      dialog.addEventListener("cancel", event => { event.preventDefault(); done(false); });
      document.body.append(dialog);
      dialog.showModal();
    });
  }

  retypeRegion(rid, type) {
    const previous = this.tl.types[ops.regionById(this.doc, rid).type]?.region;
    if (this.edit(doc => ops.setRegionType(doc, this.tl, rid, type)) && (previous === "figure" || this.tl.types[type]?.region === "figure")) this.recompute();
  }

  // Add a region over a printed line found outside all regions, with its outlines and line pieces.
  addRegionOverLine(lineId, type) {
    let rid = null;
    if (this.edit(doc => { rid = ops.coverLine(doc, this.tl, lineId, type); this.selection = { region: rid }; })) this.recompute();
  }

  // Every area in the book that the region finder proposed `name` for, made a block of type `type`: its outline and
  // lines as the finder drew them, its text from the page's saved reading (no model call). One decision for the book.
  async restoreProposed(name, type) {
    const book = this.book, key = normalizeTypeName(name);
    await this.flush();
    if (this.dirty) return this.toast("Save this page's changes first.", "warn");
    const ids = book.pages.map(page => page.id).filter(pid => waitingRegions(this.pageStates.get(pid)?.doc, new Set([key])).length);
    if (!ids.length) return 0;
    const maker = await this.getMaker(), options = await maker.options();
    const saved = new Map();
    for (const pid of ids) saved.set(pid, { record: await maker.regions(pid), reading: await book.readWork(`work/readings/${pid}/${options.reader}.json`) });
    let restored = 0, withText = 0;
    try {
      await book.editPages(ids, async (docs, types) => {
        for (const pid of ids) {
          const { record, reading } = saved.get(pid);
          const out = restoreWaiting(docs.get(pid), record, reading, key, type, types, restoredText);
          docs.set(pid, out.doc); restored += out.restored.length; withText += out.withText.length;
        }
        return docs;
      }, { archive: true });
    } catch (error) { this.toast(error.message, "bad"); return 0; }
    for (const pid of ids) await this.refreshWorkflowPage(pid);
    this.refreshWorkflowFlags();
    if (this.mode === "page") { this.doc = null; this.pageBuilt = false; }
    await this.route();
    const unread = restored - withText;
    this.toast(`${restored} ${restored === 1 ? "area" : "areas"} on ${ids.length} ${ids.length === 1 ? "page" : "pages"} became ${type.replaceAll("_", " ")}` +
      (unread ? `; ${unread} still ${unread === 1 ? "needs" : "need"} reading (Page → Read again).` : ", with their text."));
    return restored;
  }

  // Every area in the book waiting for the proposed type `name`, left out (kept among the page's ignored areas, from
  // where the page's checks can restore one).
  async leaveOutProposed(name) {
    const book = this.book, key = normalizeTypeName(name);
    await this.flush();
    if (this.dirty) return this.toast("Save this page's changes first.", "warn");
    const ids = book.pages.map(page => page.id).filter(pid => waitingRegions(this.pageStates.get(pid)?.doc, new Set([key])).length);
    let left = 0;
    try {
      await book.editPages(ids, async docs => {
        for (const pid of ids) {
          const doc = docs.get(pid);
          for (const area of waitingRegions(doc, new Set([key])).sort((a, b) => b.index - a.index)) { ops.ignoreOmittedRegion(doc, area.index); left++; }
        }
        return docs;
      }, { archive: true });
    } catch (error) { this.toast(error.message, "bad"); return 0; }
    for (const pid of ids) await this.refreshWorkflowPage(pid);
    this.refreshWorkflowFlags();
    if (this.mode === "page") { this.doc = null; this.pageBuilt = false; }
    await this.route();
    this.toast(`${left} ${left === 1 ? "area" : "areas"} left out.`);
    return left;
  }

  recoverOmitted(index, type) {
    const omitted = this.doc.source?.omitted_regions?.[index];
    if (!omitted) return;
    if (this.edit(doc => {
      const rid = ops.addRegion(doc, this.tl, type, omitted.box);
      doc.source.omitted_regions.splice(index, 1);
      this.selection = { region: rid };
    })) this.recompute();
  }

  layout() {
    const book = this.book;
    this.root.className = "book";
    const pageSel = h("select", { class: "pagesel", onchange: e => this.openPage(e.target.value) },
      ...book.pages.map(p => h("option", { value: p.id }, `${p.id.replace(/^.*-page-/, "")}${p.label ? ` (p. ${p.label})` : ""}${book.edits.has(p.id) ? " ✎" : ""}`)));
    this.pageSel = pageSel;
    this.status = h("span", { class: "status" });
    const modeBtn = (mode, text) => h("button", { class: "mode", dataset: { mode }, onclick: () => this.setMode(mode) }, text);
    this.header = h("header", {},
      h("button", { class: "link", title: "the library", onclick: () => {
        if (this.workflowBusy || this.outlineBusy || this.maker?.processing) return this.toast("Wait for the active operation before opening the library.");
        this.leaveBook();
      } }, "⌂"),
      h("span", { class: "title", title: book.title }, book.title),
      h("nav", { class: "modes", "aria-label": "Book workflow" }, ...["pages", "read", "export"].map(mode => modeBtn(mode, mode[0].toUpperCase() + mode.slice(1)))),
      h("button", { class: "book-settings", onclick: () => this.setMode("settings") }, "Settings"),
      h("span", { class: "nav" }, h("button", { title: "previous page (Alt ←)", onclick: () => this.step(-1) }, "←"), pageSel, h("button", { title: "next page (Alt →)", onclick: () => this.step(1) }, "→")),
      h("span", { class: "undo" }, h("button", { title: "undo (⌘Z)", onclick: () => this.undo() }, "↶"), h("button", { title: "redo (⇧⌘Z)", onclick: () => this.redo() }, "↷")),
      this.status, this.copyStatus = h("span", { class: "copy-status" }));
    this.main = h("main", {});
    this.root.replaceChildren(this.header, this.main);
    this.renderCopyStatus();
  }

  async route() {
    // While a book's pages are loading (openBook, afterTypesSaved) the view is not built yet; those call route() when done.
    if (!this.book || this.workflowLoading) return;
    if (this.workflowBusy || this.outlineBusy || this.maker?.processing) { history.replaceState(null, "", this.lastWorkflowUrl); return this.toast("Wait for the active operation before switching views."); }
    this.workflowScroll ||= new Map();
    if (this.stage) this.workflowScroll.set(`${this.stage}/${this.mode}`, this.main.scrollTop);
    if (this.mode === "page" && this.pageBuilt && this.doc) {
      const panes = [this.pageView.el, this.textPanel.el, this.main.querySelector(".lower")];
      this.pageViews.set(this.pid, { selection: structuredClone(this.selection), fit: this.pageView.fit, zoom: this.pageView.zoom,
        scroll: panes.map(pane => [pane.scrollLeft, pane.scrollTop]) });
    }
    const token = this.routeToken = (this.routeToken || 0) + 1;
    await this.flush();
    if (this.dirty) { history.replaceState(null, "", this.lastWorkflowUrl); return; }
    if (this.pid) await this.refreshWorkflowPage(this.pid);
    if (token !== this.routeToken) return;
    const route = workflowRoute(location.hash);
    // A page the book does not have shows Pages.
    if (route.mode === "page" && !this.pageStates.has(route.pid)) Object.assign(route, { stage: "pages", mode: "grid" });
    const { stage } = route;
    const mode = route.mode;
    this.onLeaveGrid?.(); this.onLeaveGrid = null;
    this.lastWorkflowUrl = location.href;
    this.stage = stage;
    this.routeView = route.view;
    this.mode = mode;
    this.header.dataset.top = stage;
    this.header.dataset.view = mode;
    const marked = stage === "page" ? "pages" : stage;
    this.header.querySelectorAll(".mode").forEach(button => button.classList.toggle("on", button.dataset.mode === marked));
    this.header.querySelector(".book-settings").classList.toggle("on", stage === "settings");
    if (mode === "page") {
      this.blocksProjection = null;
      this.blocksSource = null;
      const sel = route.region ? { region: route.region } : route.unit ? { unit: route.unit } : null;
      await this.showPage(route.pid, sel);
      if (token !== this.routeToken) return;
      const saved = this.pageViews.get(route.pid);
      if (saved && this.pageBuilt && (!sel || ops.canonical(sel) === ops.canonical(saved.selection))) {
        this.select(saved.selection, { keepFocus: true });
        this.pageView.setZoom(saved.zoom);
        this.pageView.fit = saved.fit;
        if (saved.fit === "height") this.pageView.fitHeight();
        const panes = [this.pageView.el, this.textPanel.el, this.main.querySelector(".lower")];
        panes.forEach((pane, index) => { [pane.scrollLeft, pane.scrollTop] = saved.scroll[index]; });
      }
    } else {
      this.pageBuilt = false;
      this.main.className = mode;
      if (mode === "grid") await renderPages(this.main, this);
      if (mode === "settings") await renderBookSettings(this.main, this);
      if (mode === "read") await renderBookView(this.main, this);
      if (mode === "style") renderStyle(this.main, this);
      if (mode === "export") this.renderExport();
    }
    if (mode !== "page" && token === this.routeToken) this.main.scrollTop = this.workflowScroll.get(`${stage}/${mode}`) || 0;
  }

  setMode(mode) {
    location.hash = workflowAddress(mode);
  }

  setRegionView(view, type) {
    if (view === "types") {
      const regionType = this.mode === "page" && this.doc?.page.regions.find(region => region.id === this.selection.region)?.type;
      if (type || regionType) this.typeOverview.selected = type || regionType;
      this.setMode("types");
    } else this.setMode("settings");
  }

  // The book's reading with the open page as the editor has it (reading.js), kept while the page document is the same.
  reading() {
    if (this.blocksSource !== this.doc || !this.blocksProjection) { this.blocksProjection = projectOpenBook(this); this.blocksSource = this.doc; }
    return this.blocksProjection;
  }

  // The open page's units, flows and relations as the rules and its overrides derive them (a 0.3-shaped copy to read, not to edit).
  derivedDoc() {
    return this.doc ? this.reading().docs.find(value => value?.page.id === this.pid) || null : null;
  }

  // A change to the page's structure, as overrides: `edit` changes a copy of the derived units, flows and relations
  // (structure.js), and the overrides that give the result are stored on the page.
  structure(edit, after) {
    try {
      const view = this.reading(), derived = this.derivedDoc();
      if (!derived) throw new ops.EditError("This page has no structure to change.");
      const overrides = overridesAfter(derived, this.book.types, view.docs.context, edit);
      return this.edit(next => { next.overrides = overrides; }, { after });
    } catch (e) {
      if (e instanceof EditError) { this.toast(e.message, "warn"); return false; }
      console.error(e); this.toast(`That did not work: ${e.message}`, "bad"); return false;
    }
  }
  // Every way of opening a page opens the one page editor, whatever the stage.
  openPage(pid, sel = {}) {
    location.hash = workflowAddress("page", pid, sel);
  }

  // The previous or next page of the book, in the page editor.
  step(d) {
    if (this.mode !== "page") return;
    const pages = this.book.pages;
    const i = pages.findIndex(page => page.id === this.pid);
    const j = Math.max(0, Math.min(pages.length - 1, i + d));
    if (j !== i && pages[j]) this.openPage(pages[j].id);
  }

  // ---------------------------------------------------------------- page mode

  async showPage(pid, sel) {
    const token = this.routeToken;
    const changed = this.pid !== pid || !this.doc;
    if (changed || !this.pageBuilt) {
      await this.flush();
      this.pid = pid;
      const model = await this.book.model(pid);
      if (token !== this.routeToken) return;
      if (!model) {
        this.pid = pid; this.doc = null; this.pageBuilt = false;
        this.main.className = "page-empty";
        this.main.replaceChildren(h("div", { class: "lib" }, h("h3", {}, `${pid} has no page document yet`),
          this.book.writable ? h("div", { class: "actions" }, h("button", { class: "primary", onclick: () => this.startByHand(pid).catch(error => this.toast(error.message, "bad")) }, "Start by hand"),
            h("button", { onclick: () => {
              this.pendingStageSelection = { ids: [pid] };
              this.setMode("pages");
            } }, "Process this page")) : null,
          h("img", { src: await this.book.imageUrl(pid), style: "max-width:100%;border:1px solid #ccc" })));
        this.pageSel.value = pid;
        return;
      }
      const saved = this.book.edits.get(pid);
      const draft = await this.book.draft(pid).catch(() => null);
      if (token !== this.routeToken) return;
      this.modelDoc = model;
      this.savedDoc = saved || model;
      this.doc = ops.clone(draft ? this.book.blocksOf(draft.doc) : this.savedDoc);
      this.dirty = !!draft;
      this.undoStack = [];
      this.redoStack = [];
      this.selection = {};
    }
    if (!this.pageBuilt) {
      await this.buildPageMode();
      if (token !== this.routeToken) return;
      this.pageBuilt = true;
    } else if (changed) {
      await this.refresh();
    }
    if (token !== this.routeToken) return;
    if (this.dirty && this.check(this.doc)[0].length) this.toast("This page has changes that do not pass the checks yet; they are shown.", "warn");
    if (sel) this.select(sel);
    this.pageSel.value = pid;
  }

  async buildPageMode() {
    this.textPanel?.destroy?.();
    const fit = this.pageView?.fit;
    this.pageView?.destroy();
    const image = h("div", { class: "imgpane" });
    const scanToolbar = h("div", { class: "toolbar block-scan-tools", "aria-label": "Scan tools" },
      h("button", { onclick: () => this.pageView.setZoom(this.pageView.zoom / 1.25), "aria-label": "Zoom out" }, "−"),
      h("button", { onclick: () => this.pageView.fitWidth() }, "Fit width"),
      h("button", { onclick: () => this.pageView.fitHeight() }, "Fit height"),
      h("button", { onclick: () => this.pageView.setZoom(this.pageView.zoom * 1.25), "aria-label": "Zoom in" }, "+"),
      this.book.writable ? h("button", { class: "draw", onclick: event => {
        this.pageView.setDrawing(!this.pageView.drawing);
        event.currentTarget.classList.toggle("on", this.pageView.drawing);
        if (this.pageView.drawing) this.toast("Draw a box on the scan.");
      } }, "＋ Region") : null);
    const text = h("div", { class: "textpane block-pane" });
    this.textPanel = new BlocksPanel(text, this);
    const format = h("div", { class: "block-format", hidden: true, "aria-label": "Text formatting" },
      ...FORMAT_BUTTONS.map(([kind, label, title]) => h("button", { title, onmousedown: event => event.preventDefault(),
        onclick: () => this.textPanel.format(kind) }, label)),
      ...Object.entries(this.tl.inline || {}).map(([kind, def]) => h("button", { title: def.description,
        onmousedown: event => event.preventDefault(), onclick: () => this.textPanel.format(kind) }, kind)),
      h("button", { onmousedown: event => event.preventDefault(), onclick: () => markerForm(this.inspector, this) }, "＋ Marker"));
    text.addEventListener("focusin", event => { format.hidden = !event.target.closest("[contenteditable]"); });
    text.addEventListener("focusout", event => {
      if (!event.relatedTarget?.closest(".block-format, [contenteditable]")) format.hidden = true;
    });
    this.inspector = h("div", { class: "inspector block-inspector" });
    this.main.className = "page blocks-page";
    this.main.replaceChildren(h("div", { class: "block-scan" }, scanToolbar, image),
      h("div", { class: "side block-side" }, h("div", { class: "toolbar block-page-tools" },
        h("a", { href: "#read" }, "Read book"), this.book.writable ? pageMenu(this, { reviewPageWithAI }) : null, format), text, h("div", { class: "lower" }, this.inspector)));
    this.pageView = new PageView(image, {
      editable: this.book.writable,
      typeLabel: blockName,
      onSelectRegion: rid => this.select(rid ? { region: rid } : {}),
      onSelectOmitted: index => this.select({ omitted: index }),
      onBox: (rid, box) => { if (this.edit(doc => ops.setBox(doc, rid, box))) this.recompute(); },
      onDraw: (box, event) => drawBlock(this, box, event),
      onHoverRegion: (rid, on) => this.hoverRegion(rid, on, true),
      onHoverLine: (key, on) => {
        const [rid, index] = key.split(":");
        text.querySelector(`.rtext[data-rid="${CSS.escape(rid)}"] > .lp[data-i="${index}"]`)?.classList.toggle("hl", on);
      },
    });
    this.pageView.fit = fit || "height";
    await this.refresh();
  }

  async refresh() {
    const { pid, routeToken } = this;
    const url = await this.book.imageUrl(pid);
    if (pid !== this.pid || routeToken !== this.routeToken || !this.doc) return;
    this.pageView.show(this.doc, url, this.colors, this.furniture, this.tl);
    if (this.blocksSource !== this.doc) {
      this.blocksProjection = projectOpenBook(this);
      this.blocksSource = this.doc;
    }
    this.textPanel.render();
    this.afterRender();
  }

  afterRender() {
    this.pageView.select(this.selection.region || (this.selection.marker && ops.findMarker(this.doc, this.selection.marker)?.region.id) || null);
    this.renderPageInspector();
    this.renderChecks();
  }

  renderPageInspector() {
    blockInspector(this.inspector, this);
  }

  renderChecks() {
    const [errors] = this.check(this.doc);
    this.lastErrors = errors;
    const message = errors.length ? "Draft needs review" : this.dirty ? "Saving…" : this.book.writable ? "Saved" : "Read only";
    this.status.replaceChildren(h("span", {}, message));
  }

  select(sel, { keepFocus = false } = {}) {
    this.selection = sel || {};
    if (!this.textPanel) return;
    const target = this.textPanel.markSelection();
    const rid = sel.region || (sel.marker && ops.findMarker(this.doc, sel.marker)?.region.id);
    this.pageView.select(rid || null);
    if (rid) this.pageView.reveal(rid);
    if (target && !keepFocus) target.scrollIntoView({ block: "nearest", behavior: "smooth" });
    this.renderPageInspector();
  }

  hoverRegion(rid, on, revealText = false) {
    this.pageView?.highlightRegion(rid, on);
    this.textPanel?.highlightRegion?.(rid, on, revealText);
  }

  // Apply an edit to a copy of the working document; keep the old one for undo.
  edit(fn, { after, sameStep = false } = {}) {
    let next = ops.clone(this.doc);
    try {
      fn(next);
      const focus = editorFocus();
      next = noteEdit(this.doc, next, { focus });
      next = this.droppedOverrides(next);
      if (next.source.layers.regions && layerView(this.doc, "regions") !== layerView(next, "regions"))
        next.source.layers.regions.types_revision = typeRevision(this.tl.source?.revision);
    }
    catch (e) {
      if (e instanceof EditError) { this.toast(e.message, "warn"); return false; }
      console.error(e);
      this.toast(`That did not work: ${e.message}`, "bad");
      return false;
    }
    if (!sameStep) {
      this.undoStack.push(this.doc);
      if (this.undoStack.length > 200) this.undoStack.shift();
      this.redoStack = [];
    }
    this.doc = next;
    this.typingKey = null;
    this.changed();
    this.refresh().then(() => { if (after) after(); });
    return true;
  }

  // After a change to the regions: overrides that name a block or unit that is gone no longer apply. They are dropped, and
  // the page's check list says so once.
  droppedOverrides(next) {
    if (!Object.keys(next.overrides || {}).length || JSON.stringify(next.page.regions) === JSON.stringify(this.doc.page.regions)) return next;
    const { book } = this, saved = book.pages.map(page => page.id === next.page.id ? next : this.pageStates.get(page.id)?.doc).filter(Boolean);
    const view = bookReading(book.pages, saved, book.types, book.skipped, book.rules);
    const { doc, dropped } = view.docs.context.pages.some(page => page?.page.id === next.page.id) ? pruneOverrides(next, book.types, view.docs.context) : { doc: next, dropped: 0 };
    if (!dropped) return next;
    return { ...doc, source: { ...doc.source, dropped_overrides: true } };
  }

  // Before the browser changes a line's text: a new undo step when a burst of typing starts.
  beforeTyping(key) {
    const now = Date.now();
    if (key !== this.typingKey || now - this.lastTypingAt > 1500) {
      this.undoStack.push(ops.clone(this.doc));
      this.redoStack = [];
    }
    this.typingKey = key;
    this.lastTypingAt = now;
  }

  // Text the user typed, read back from a line (the DOM already shows it).
  typed(rid, i, text, spans) {
    const previous = ops.regionById(this.doc, rid).lines[i]?.text;
    ops.setLine(this.doc, rid, i, text, spans);
    this.changed();
    if (previous === undefined || Boolean(previous.trim()) !== Boolean(text.trim())) this.textPanel.refreshFindings();
  }

  changed() {
    this.dirty = true;
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.flush(), 700);
    this.renderChecks();
  }

  // Save the working document: as the user's version if it passes the checks, else as a draft.
  async flush() {
    clearTimeout(this.saveTimer);
    if (this.pageSave) { await this.pageSave; if (this.dirty) return this.flush(); return; }
    if (this.outlineBusy) { this.saveTimer = setTimeout(() => this.flush(), 300); return; }
    if (!this.dirty || !this.doc) return;
    this.pageSave = this.persistPage();
    try { await this.pageSave; } finally { this.pageSave = null; }
  }

  async persistPage() {
    const doc = ops.clone(this.doc), pid = this.pid, focus = editorFocus(), base = this.savedDoc;
    const [errors] = this.check(doc);
    try {
      if (errors.length) { await this.book.putDraft(pid, doc); this.dirty = ops.canonical(this.doc) !== ops.canonical(doc); }
      else if (same(doc, this.modelDoc) && focus === "regions") {
        if (this.book.edits.has(pid)) await this.book.revert(pid); else await this.book.clearDraft(pid);
        this.dirty = false;
      } else {
        const out = ops.markEdited(ops.clone(doc), this.modelDoc.source?.created_at_utc || null);
        this.savedDoc = await this.book.saveEdit(pid, out, { focus, base }) || out;
        const unchanged = ops.canonical(this.doc) === ops.canonical(doc);
        if (unchanged) this.doc = this.savedDoc;
        else if (focus === "text") this.doc = mergeTextEdit(this.savedDoc, this.doc, doc);
        if (ops.canonical(this.tl) !== ops.canonical(this.book.types)) {
          this.syncTypes();
          this.pageBuilt = false;
        }
        this.dirty = !unchanged;
      }
    } catch (e) { console.error(e); this.toast(`Could not save: ${e.message}`, "bad"); }
    if (pid === this.pid) { this.renderChecks(); this.markPageOption(pid); }
  }

  markPageOption(pid) {
    const o = [...this.pageSel.options].find(x => x.value === pid);
    if (o) o.textContent = o.textContent.replace(/ ✎$/, "") + (this.book.edits.has(pid) ? " ✎" : "");
  }

  undo() {
    if (this.mode !== "page" || !this.undoStack.length) return;
    this.redoStack.push(this.doc);
    this.doc = preservePageReview(this.undoStack.pop(), this.doc);
    this.typingKey = null;
    this.changed();
    this.refresh();
  }

  redo() {
    if (this.mode !== "page" || !this.redoStack.length) return;
    this.undoStack.push(this.doc);
    this.doc = preservePageReview(this.redoStack.pop(), this.doc);
    this.typingKey = null;
    this.changed();
    this.refresh();
  }

  async setPageReviewed(checked) {
    if (this.workflowBusy || this.outlineBusy) return this.toast("Wait for the current edit to finish.");
    const { book, pid } = this;
    await this.flush();
    if (this.pid !== pid || this.book !== book) return;
    if (this.dirty || this.lastErrors?.length) return this.toast("Correct the draft before checking this page.", "warn");
    this.workflowBusy = this.header.inert = this.main.inert = true;
    try {
      this.doc = await book.savePageReview(pid, checked);
      this.savedDoc = this.doc;
      this.modelDoc = await book.model(pid);
      await this.refreshWorkflowPage(pid);
      await this.refresh();
      this.diskCopy?.checkpoint();
    } catch (error) { this.toast(error.message, "bad"); }
    finally { this.workflowBusy = this.header.inert = this.main.inert = false; }
  }

  async revertPage() {
    if (!this.book.edits.has(this.pid) && !this.dirty) { this.toast("This page is already at its last stage save."); return; }
    this.undoStack.push(this.doc);
    this.doc = ops.clone(this.modelDoc);
    this.dirty = true;
    await this.flush();
    this.refresh();
    this.toast("Returned to the last stage save. Undo restores your changes.");
  }

  // Method 063's local step in a worker: outlines and complete glyph lines for the current boxes.
  outlines(pid, url, boxes) {
    if (!this.worker) {
      this.worker = new Worker(new URL("./local/worker.js?v=20261124-vision-7", import.meta.url), { type: "module" });
      this.worker.onmessage = e => { const job = this.outlineJobs.get(e.data.id); this.outlineJobs.delete(e.data.id); if (job) job(e.data); };
    }
    const id = ++this.outlineSeq;
    return new Promise(resolve => { this.outlineJobs.set(id, resolve); this.worker.postMessage({ id, pid, url, boxes }); });
  }

  // Recompute the page's outlines from its boxes, as one step with the edit that changed a box.
  async recompute() {
    const pid = this.pid, doc = this.doc;
    this.outlineBusy = true;
    this.status.replaceChildren(h("span", { class: "pending" }, "computing the outlines…"));
    const res = await this.outlines(pid, await this.book.imageUrl(pid), ops.boxesOf(doc));
    this.outlineBusy = false;
    if (this.pid !== pid) return;
    if (res.error) { this.edit(next => { next.source.geometry_error = res.error; }, { sameStep: true }); this.toast(`The outlines could not be recomputed. ${res.error}`, "warn"); return; }
    if (this.doc !== doc) { this.recompute(); return; }
    this.edit(d => {
      const geometry = res.geometry.map((value, index) => this.tl.types[d.page.regions[index].type]?.region === "figure" ? { ...value, lines: [] } : value);
      ops.applyGeometry(d, geometry);
      d.source = { ...d.source, char_h: res.charH, page_angle_deg: res.angle, uncovered_lines: res.uncovered || [] };
      delete d.source.geometry_error;
    }, { sameStep: true });
  }

  keydown(e) {
    if (e.target.closest("dialog")) return;
    const mod = e.metaKey || e.ctrlKey;
    if (this.mode === "page" && !e.target.closest("input,textarea,select") && mod && e.key.toLowerCase() === "z") { e.preventDefault(); if (e.shiftKey) this.redo(); else this.undo(); return; }
    if (this.mode === "page" && !e.target.closest("input,textarea,select") && mod && e.key.toLowerCase() === "y") { e.preventDefault(); this.redo(); return; }
    if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); this.flush(); return; }
    if (e.altKey && e.key === "ArrowLeft" && this.mode === "page") { e.preventDefault(); this.step(-1); }
    if (e.altKey && e.key === "ArrowRight" && this.mode === "page") { e.preventDefault(); this.step(1); }
    if (e.key === "Escape") { this.pageView?.setDrawing(false); document.querySelectorAll(".popup").forEach(p => p.remove()); }
    if (this.mode !== "page" || mod || e.altKey || e.target.closest("input,select,textarea,button,dialog,[contenteditable]")) return;
    if (/^[1-9]$/.test(e.key) && this.selection.region) {
      const type = Object.entries(this.tl.types).filter(([, value]) => value.region)[Number(e.key) - 1]?.[0];
      if (type) { e.preventDefault(); this.retypeRegion(this.selection.region, type); }
    }
    if (e.key === "Tab" && this.selection.region) {
      const regions = orderedRegions(this.doc, this.tl), index = regions.findIndex(region => region.id === this.selection.region);
      if (regions.length) {
        e.preventDefault();
        this.select({ region: regions[(index + (e.shiftKey ? regions.length - 1 : 1)) % regions.length].id });
      }
    }
  }

  // ---------------------------------------------------------------- checks across the book

  async renderCheck(el) {
    el.replaceChildren(h("div", { class: "loading" }, "Checking every page…"));
    // A dimmed page is not part of the book (a library's cover, a blank page, a duplicate scan).
    const docs = (await this.book.all((d, n) => { el.firstChild.textContent = `Checking every page… ${d} of ${n}`; })).filter(doc => !this.book.isSkipped?.(doc.page.id));
    // In page order, with a page that has no document yet as a gap that nothing joins across.
    await this.book.getRules();
    const derived = readThroughBlocks(readingDocuments(this.book.pages, docs, id => this.book.isSkipped?.(id)), this.tl, this.book.rules);
    const P = prepare(derived, this.tl), joinWarnings = placeWarnings(P.warnings, derived);
    const rows = docs.map(doc => {
      const pid = doc.page.id;
      const [errors, warnings] = this.check(doc);
      return { pid, label: doc.page.label, errors, warnings, problems: doc.source?.problems || [], edited: this.book.edits.has(pid) };
    });
    const nums = rows.map(r => (/^\d+$/.test(r.label || "") ? +r.label : null));
    // A number that differs from what its neighbors imply is a problem; a page that prints none (as a chapter's
    // first page often does) is only noted.
    const flagged = {}, unprinted = {};
    for (let i = 1; i < rows.length - 1; i++) {
      const a = nums[i - 1], b = nums[i + 1];
      if (a !== null && b !== null && a + 2 === b && nums[i] !== a + 1) (nums[i] === null ? unprinted : flagged)[rows[i].pid] = String(a + 1);
    }
    const bad = rows.filter(r => r.errors.length), edited = rows.filter(r => r.edited);
    // Note markers that point to no note, and notes no marker points to, page by page.
    const { noteTypes, mainTypes } = noteTypesOf(this.tl);
    // On the pages as Read derives them: stored pages have regions and overrides, not units and links.
    const notes = derived.filter(Boolean).map(doc => ({ pid: doc.page.id, ...noteProblems(doc, noteTypes, mainTypes) })).filter(row => row.markers.length || row.notes.length);
    const unlinkedNotes = notes.reduce((n, row) => n + row.notes.length, 0), unlinkedMarkers = notes.reduce((n, row) => n + row.markers.length, 0);
    const link = pid => h("button", { class: "link", onclick: () => this.openPage(pid) }, pid.replace(/^.*-page-/, "page "));
    el.replaceChildren(h("div", { class: "checkview" },
      h("h2", {}, "Problems"),
      h("p", { class: "hint" }, "What the checks find across the book. Each page document is checked against the schema and the book's type list whenever it changes (the same rules as schema/book.py check): a page that fails is marked ✗ here, and its corrections are kept as a draft until it passes. Across pages: units marked as going on at a page break that do not join a later page (past blank pages and plates, which have no unit of their type), printed page numbers out of sequence, and notes and note markers that are not linked. The table also shows the pages you corrected (✎) and the notes the transcription model left."),
      h("p", {}, `${rows.length} pages: ${bad.length} not passing the checks, ${edited.length} corrected by you, ${Object.keys(flagged).length} with a printed page number out of sequence (and ${Object.keys(unprinted).length} printing none, which is often right, as on a chapter's first page), `,
        `${joinWarnings.length} page breaks where units do not join, ${unlinkedNotes} notes with no marker in the text and ${unlinkedMarkers} note markers with no note.`),
      joinWarnings.length ? h("details", { open: true }, h("summary", {}, "Units that do not join across a page break"), ...joinWarnings.map(w => h("div", { class: "row" }, w))) : null,
      notes.length ? h("details", {}, h("summary", {}, `Notes and their markers (${notes.length} pages)`),
        h("p", { class: "hint" }, "A note is linked to the marker in the text with the same printed number on its page. A note with no marker is often one whose marker the transcription missed; a marker with no note may be misread."),
        ...notes.map(row => h("div", { class: "row" }, link(row.pid),
          row.notes.length ? ` notes ${row.notes.join(", ")} have no marker` : "", row.notes.length && row.markers.length ? ";" : "",
          row.markers.length ? ` markers ${row.markers.join(", ")} have no note` : ""))) : null,
      Object.keys(flagged).length ? h("details", { open: true }, h("summary", {}, "Printed page numbers out of sequence"),
        ...Object.entries(flagged).map(([pid, exp]) => h("div", { class: "row" }, link(pid), ` reads ${rows.find(r => r.pid === pid).label || "nothing"}; its neighbors suggest ${exp}`))) : null,
      Object.keys(unprinted).length ? h("details", {}, h("summary", {}, `Pages with no printed number (${Object.keys(unprinted).length}), with the number their neighbors imply`),
        ...Object.entries(unprinted).map(([pid, exp]) => h("div", { class: "row" }, link(pid), ` ${exp}`))) : null,
      h("table", { class: "pages" }, h("tr", {}, ...["page", "printed", "checks", "yours", "the model's notes"].map(t => h("th", {}, t))),
        ...rows.map(r => h("tr", { class: r.errors.length ? "bad" : "" }, h("td", {}, link(r.pid)),
          h("td", {}, (r.label || "") + (flagged[r.pid] ? ` (→ ${flagged[r.pid]}?)` : unprinted[r.pid] ? `(${unprinted[r.pid]})` : "")),
          h("td", {}, r.errors.length ? `✗ ${r.errors[0]}${r.errors.length > 1 ? ` (+${r.errors.length - 1})` : ""}` : r.warnings.length ? `ok, ${r.warnings.length} warning` : "ok"),
          h("td", {}, r.edited ? "✎" : ""), h("td", { class: "meta" }, r.problems.join("; ").slice(0, 160)))))));
  }

  // ---------------------------------------------------------------- making a book

  async continueBook(stage = "pages") {
    try {
      await this.flush();
      if (!this.book.writable) {
        if (!canKeepBooks()) throw new Error("Open the app over HTTPS or localhost to keep an editable copy in this browser.");
        this.toast("Creating an editable copy in this browser…");
        const copy = await importChaya(await this.book.chayaBytes());
        await this.openBook(copy);
      }
      this.setMode(stage);
    } catch (error) { this.toast(error.message, "bad"); }
  }

  async getMaker() {
    if (this.maker?.book === this.book) return this.maker;
    const book = this.book;
    if (this.makerJob?.book === book) return this.makerJob.promise;
    const promise = (async () => {
      const keys = Object.fromEntries(await Promise.all(["openai", "gemini", "vision", "vision_auth", "vision_project"].map(async provider => [provider, await settings.get(`key:${provider}`) || ""])));
      const maker = new Maker(book, { outlines: (pid, url, boxes) => this.outlines(pid, url, boxes), keys, check: d => checkPage(this.validate, d, book.types),
        onSaved: async pid => {
          if (this.book === book) {
            this.syncTypes();
            if (this.pid === pid) { this.doc = null; this.pageBuilt = false; }
            await this.refreshWorkflowPage(pid);
          }
        } });
      // Successful key checks are kept across reloads (a digest of the key, never the key).
      maker.credentials = new CredentialChecks(keys, post, { load: async () => await settings.get("credential-checks") || [], save: records => settings.set("credential-checks", records) });
      await maker.credentials.ready;
      if (this.book === book) this.maker = maker;
      return maker;
    })();
    this.makerJob = { book, promise };
    try { return await promise; }
    finally { if (this.makerJob?.promise === promise) this.makerJob = null; }
  }

  renderExport() {
    const el = this.main, book = this.book;
    const save = (name, text, type = "application/json") => {
      const a = h("a", { href: URL.createObjectURL(new Blob([text], { type })), download: name });
      document.body.append(a); a.click(); a.remove();
    };
    const id = book.manifest.book_id;
    const assembled = async () => {
      await book.getRules();
      const view = bookReading(book.pages, await book.all(), this.tl, id => book.isSkipped?.(id), book.rules);
      return prepare(view.docs, view.types, book.style);
    };
    // Each figure unit's regions cut from their page images, as data: URLs (ornaments, being furniture, are not in the text).
    const figureCrops = async P => {
      const out = {};
      for (const u of P.book.units) {
        if (P.tl.types[u.type]?.region !== "figure") continue;
        for (const c of u.children) {
          const R = c.region && P.regions[c.region];
          if (!R) continue;
          const [x1, y1, x2, y2] = (R.region.box || bboxOf(R.region.polygons)).map(Math.round);
          const img = await createImageBitmap(await (await fetch(await book.imageUrl(R.page.id))).blob());
          const cv = document.createElement("canvas");
          cv.width = x2 - x1; cv.height = y2 - y1;
          cv.getContext("2d").drawImage(img, x1, y1, x2 - x1, y2 - y1, 0, 0, x2 - x1, y2 - y1);
          out[c.region] = cv.toDataURL("image/png");
        }
      }
      return out;
    };
    const fileInput = h("input", { type: "file", accept: ".json", onchange: async e => {
      try {
        const n = await book.importEdits(JSON.parse(await e.target.files[0].text()), d => this.check(d));
        this.toast(`${n} corrected pages imported.`);
      } catch (err) { this.toast(err.message, "bad"); }
    } });
    // A book in this browser: whether the browser keeps it, and its copy on disk.
    const copySection = book.browser ? h("section", { class: "copy-section" }) : null;
    this.renderCopySection = () => {
      if (!copySection || this.book !== book) return;
      const copy = this.diskCopy, state = copy?.state;
      const label = state && copyLabel(state, { hasWork: true, canPick: !!window.showSaveFilePicker, time: shortTime });
      const when = "after each processing run, after review marks change, and at most every five minutes while there are changes";
      copySection.replaceChildren(...[h("h3", {}, "Copies of this book"),
        h("p", { class: this.storage?.persisted === false ? "warn" : "meta" }, storageText(this.storage || {})),
        state?.disk ? [h("p", { class: label.warn ? "warn" : "" }, `${label.text}. It is saved again ${when}.`),
          h("div", { class: "actions" }, state.kind === "permission" ? h("button", { class: "primary", onclick: () => copy.allow() }, "Allow writing")
            : h("button", { disabled: state.kind === "writing", onclick: () => copy.write() }, "Write it now"),
          h("button", { onclick: () => this.chooseDiskCopy() }, "Choose another file…"),
          h("button", { onclick: () => copy.forget() }, "Stop keeping a copy"))]
          : window.showSaveFilePicker ? [h("p", { class: label?.warn ? "warn" : "" }, `${label?.text || "Saved in this browser"}. Choose a file once, and the book is written to it as a .chaya.pdf ${when}. If this browser loses the book, open that file again.`),
            h("div", { class: "actions" }, h("button", { class: "primary", onclick: () => this.chooseDiskCopy() }, "Save to a file…"))]
            : h("p", { class: label?.warn ? "warn" : "" }, `${label?.text || "Saved in this browser"}. This browser cannot keep a file up to date: save the .chaya.pdf below after each session’s work.`)].flat());
    };
    if (copySection) storagePersistence().then(value => { this.storage = value; this.renderCopySection(); }).catch(() => {});
    el.replaceChildren(h("div", { class: "exportview" },
      h("h2", {}, "Export"),
      h("a", { href: "#export&view=style" }, "Style sheet"),
      copySection,
      h("div", { class: "row" }, h("button", { onclick: async () => {
        const P = await assembled();
        const errors = this.validate(P.book);
        if (errors.length) this.toast(`The assembled book does not validate: ${errors[0]}`, "bad");
        save(`${id}.book.json`, JSON.stringify(P.book) + "\n");
      } }, "The book (JSON)"), " one document of the book schema: every page's regions, the units joined across pages, and the relations."),
      h("div", { class: "row" }, h("button", { onclick: async () => save(`${id}.txt`, bookText(await assembled()) + "\n", "text/plain") }, "The text"),
        " plain text, one passage after another, with the printed page number where each page starts."),
      h("div", { class: "row" }, h("button", { onclick: async () => {
        const P = await assembled();
        const crops = await figureCrops(P);
        save(`${id}.html`, bookDocument(P, { title: book.title, lang: (this.tl.languages || [])[0] || "", figureSrc: ref => crops[ref] }), "text/html");
      } }, "The book as a web page"),
        book.style ? " one HTML file, as printed: the book's fonts, sizes, alignment and spacing (its style sheet), blocks side by side, and its figures."
          : " one HTML file, with blocks side by side and the figures (this book has no style sheet, so not as printed)."),
      book.manifest.pdf || book.kind === "chaya" ? h("div", { class: "row" },
        h("button", { class: "primary", onclick: () => this.saveChaya(book) }, "Save as .chaya.pdf"),
        book.chayaHandle && !book.browser ? [" ", h("button", { onclick: () => this.saveChaya(book, { again: true }) }, `Save to ${book.chayaHandle.name} again`)] : null,
        " the book as one file: its PDF, unchanged, with the book's types, pages, your corrections and its style sheet inside. It opens as the book in any PDF viewer, and again here to go on (Open a PDF or a .chaya.pdf…), in any browser.") : null,
      book.manifest.pdf || book.kind === "chaya" ? h("div", { class: "row" }, h("button", { onclick: async () => {
        const bytes = await book.originalPdf();
        const a = h("a", { href: URL.createObjectURL(new Blob([bytes], { type: "application/pdf" })), download: book.manifest.pdf?.name || "source.pdf" });
        document.body.append(a); a.click(); a.remove();
      } }, "The source PDF"), ` ${book.manifest.pdf?.name || ""}${book.manifest.pdf?.page_count ? `, ${book.manifest.pdf.page_count} pages` : ""}${book.manifest.pdf?.sha256 ? ` (sha256 ${book.manifest.pdf.sha256.slice(0, 12)}…)` : ""}: the book's source, exactly as it was given, which every page points back into.`) : null,
      h("div", { class: "row" }, h("button", { onclick: () => save(`${id}.edits.json`, JSON.stringify(book.exportEdits()) + "\n") }, "Your corrections"),
        ` the ${book.edits.size} pages you corrected, as one file${book.writable ? " (they are also in the folder's edits/)" : ""}.`),
      h("div", { class: "row" }, "Import corrections: ", fileInput)));
    this.renderCopySection();
    if (![...this.pageStates.values()].some(state => state.layers.text)) {
      el.querySelectorAll(".row button").forEach(button => {
        if (["The book (JSON)", "The text", "The book as a web page"].includes(button.textContent)) {
          button.disabled = true;
          button.title = "Transcribe some pages before exporting text.";
        }
      });
    }
  }
}

// Two page documents are the same apart from their edit stamps.
function same(a, b) {
  const strip = d => { const c = ops.clone(d); if (c.source) delete c.source.edited; return ops.canonical(c); };
  return strip(a) === strip(b);
}

function bboxOf(rings) {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const r of rings) for (const [x, y] of r) { x1 = Math.min(x1, x); y1 = Math.min(y1, y); x2 = Math.max(x2, x + 1); y2 = Math.max(y2, y + 1); }
  return [x1, y1, x2, y2];
}

// Whether this browser lets the page keep books in its own storage (a secure context with the origin private file
// system).
function canKeepBooks() { return window.isSecureContext && !!navigator.storage?.getDirectory; }

// A time as the header shows it: the time of day today, else the date as well.
function shortTime(t) {
  const date = new Date(t), today = new Date().toDateString() === date.toDateString();
  return today ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

const app = new App();
window.app = app;
app.start().catch(error => app.library(error.message));
