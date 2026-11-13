// The app: a library of book folders, and for a book the page editor, the reader, the checks and the exports.
// Processing runs in the browser, with optional calls using the user's model API keys.

import { makeValidator, checkPage, checkTypes, typeRevision } from "./schema.js?v=20261113-survey-1";
import { Book, browserBooks, newBrowserBookDir, deleteBrowserBook, importChaya, copyRecords, storagePersistence, restoreChaya } from "./store.js?v=20261113-survey-1";
import { DiskCopy, copyState, copyLabel, spendingBlock, storageText } from "./disk-copy.js?v=20261113-survey-1";
import { RECIPE } from "./recipe.js?v=20261113-survey-1";
import { readerOptions } from "./pipeline/readers.js?v=20261113-survey-1";
import { readChaya, sha256hex } from "./chayapdf.js";
import { PageView } from "./pageimage.js?v=20261113-survey-1";
import { TextPanel, renderInspector, markerForm } from "./editor.js?v=20261113-survey-1";
import { renderReader, prepare, bookText, bookDocument } from "./reader.js?v=20261113-survey-1";
import { renderStyle } from "./styleview.js?v=20261113-survey-1";
import { openTypeList } from "./typesview.js?v=20261113-survey-1";
import { typeSetup } from "./type-setup.js?v=20261113-survey-1";
import { h, typeColors, esc } from "./render.js";
import * as ops from "./ops.js?v=20261113-survey-1";
import { EditError } from "./ops.js?v=20261113-survey-1";
import { Maker } from "./pipeline/run.js?v=20261113-survey-1";
import { pageStages, eligible, availability, workflowRoute, workflowAddress, reviewPageStates, stageFlags, movePage, pageWalker, readingDocuments } from "./workflow.js?v=20261113-survey-1";
import { RegionsPanel, renderRegionInspector, regionTypesPanel, newTypeDialog } from "./regionsview.js?v=20261113-survey-1";
import { rebuildProvisional } from "./pipeline/provisional.js?v=20261113-survey-1";
import { layerState, noteEdit } from "./layers.js?v=20261113-survey-1";
import { orderedRegions } from "./flags.js?v=20261113-survey-1";
import { assemble } from "./assemble.js?v=20261113-survey-1";
import { assertFocusEdit, editorFocus, mergeTextEdit, applyUnitChanges } from "./editing.js?v=20261113-survey-1";
import { joinFollowingUnit, unitSnapshot } from "./reading-edit.js?v=20261113-survey-1";
import { renderPages } from "./pagesview.js?v=20261113-survey-1";
import { settings } from "./store.js?v=20261113-survey-1";
import { renderReaders } from "./readersview.js?v=20261113-survey-1";
import { renderStructures } from "./structuresview.js?v=20261113-survey-1";
import { reviewPageWithAI } from "./page-review-view.js?v=20261113-survey-1";

const $ = sel => document.querySelector(sel);
const FORMAT_BUTTONS = [["bold", "B", "bold (⌘B)"], ["italic", "I", "italic (⌘I)"], ["small_caps", "Sᴄ", "small capitals"],
  ["superscript", "x²", "superscript (not a note marker)"], ["subscript", "x₂", "subscript"], ["underline", "U", "underline (⌘U)"], ["spaced", "s p", "letter-spaced"]];

class App {
  constructor() {
    this.root = $("#app");
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
        const file = await Book.fetchPdf(params.get("book"));
        if (!params.has("proposal")) history.replaceState(null, "", location.pathname);
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
        h("p", { class: "meta" }, "Books are kept in this browser's own storage, which is lost if the browser clears this site's data. Give each book a copy on disk (in its header or Export), or download its .chaya.pdf.")) : null));
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
  async openPdfFile(file, proposalUrl = null) {
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
          const book = await importChaya(bytes, { into });
          const now = Date.now();
          await copyRecords.update(book.key, value => ({ ...value, changed_at: now, exported_at: now, exported_as: file.name }));
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
    el.title = state.disk ? `${state.name}: written again after each processing run, after pages are moved on, and at most every five minutes while there are changes.` : "";
    const actions = {
      choose: ["Keep a copy on disk…", () => this.chooseDiskCopy()],
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
          : window.showSaveFilePicker ? ["Keep a copy on disk…", () => this.chooseDiskCopy()] : ["Download .chaya.pdf", () => this.saveChaya(this.book)];
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
    // A new book starts with the draft types, which Regions builds on (surveys of pages add types there). This form
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
      h("p", {}, "The book is kept in this browser, and its pages are drawn from the PDF. Next come Pages, then Regions (where the unit types are chosen), Text and Read."),
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
    this.regionPageViews = new Map();
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
    this.workflowLoading = true;
    this.main?.replaceChildren(h("p", { class: "loading" }, "Loading page states…"));
    await this.openDiskCopy(book);
    await book.all();
    await Promise.all(book.pages.map(page => this.refreshWorkflowPage(page.id)));
    this.workflowLoading = false;
    this.refreshWorkflowFlags();
    const tlErrors = [...this.validate(this.tl)];
    if (tlErrors.length) this.toast(`The type list has problems: ${tlErrors[0]}`, "bad");
    this.layout();
    if (!location.hash) location.hash = book.pages.every(page => this.pageStates.get(page.id).layers.text?.accepted) ? "#read" : "#pages";
    else await this.route();
  }

  async refreshWorkflowPage(pid) {
    const book = this.book, current = await book.current(pid), draft = await book.draft(pid).catch(() => null);
    const [errors, warnings] = draft ? this.check(draft.doc) : current ? this.check(current) : [[], []];
    this.pageStates.set(pid, { ...pageStages(current, book.types, errors, warnings), runErrors: this.pageStates.get(pid)?.runErrors || {} });
    if (!this.workflowLoading) { this.refreshWorkflowFlags(); this.renderCopyStatus(); }
    this.updateWorkflowNavigation();
  }

  refreshWorkflowFlags() {
    // In page order, as Read assembles them: a page with no document yet or an invalid one is a gap nothing joins across.
    const docs = this.book.pages.map(page => this.pageStates.get(page.id)).map(state => (state?.valid && state.doc) || null);
    let warnings = [];
    try { [, warnings] = assemble(docs, this.book.types); } catch { /* Page checks identify invalid trees. */ }
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
    if (location.hash === workflowAddress("regions", pid)) await this.route(); else this.openPage(pid, {}, "regions");
  }

  // "No content on this page" (Regions): every region removed, as one editing step that undo restores, and the page
  // moved on to Text. A page with no regions has nothing to transcribe or complete, and units join across it as across
  // any page with no unit of their type (assemble.js); this is how a page that is not part of the book (a library's
  // cover, a blank page) is kept. Asked first when the page has regions with text or a person's edits.
  async markNoContent() {
    if (this.stage !== "regions" || !this.doc || !this.book.writable) return;
    if (this.workflowBusy || this.outlineBusy) return this.toast("Wait for the current edit to finish.");
    const pid = this.pid, doc = this.doc, regions = doc.page.regions;
    const withText = regions.filter(region => region.lines?.some(line => typeof line.text === "string")).length;
    const edited = this.book.edits.has(pid) || ["regions", "text", "units"].some(layer => layerState(doc, layer)?.state === "edited");
    if (regions.length && (withText || edited)) {
      const lines = [`This removes its ${regions.length} ${regions.length === 1 ? "region" : "regions"}${withText ? `, ${withText} of them with text,` : ""} and moves it on to Text.`,
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
    if (this.dirty || this.lastErrors?.length) return this.toast("The page could not be saved without its regions, so it was not moved on.", "bad");
    this.workflowBusy = true;
    try {
      const out = await movePage(this.book, pid, "regions", true, value => this.check(value));
      if (this.pid !== pid) return;
      // The editor keeps its undo steps: undoing brings the regions back as an edit, and the page back to Regions.
      this.modelDoc = out.doc; this.savedDoc = out.doc; this.doc = ops.clone(out.doc); this.dirty = false;
      await this.refreshWorkflowPage(pid);
      this.updateWorkflowNavigation();
      this.markPageOption(pid);
      await this.refresh();
      this.diskCopy?.checkpoint();
      this.toast("No content on this page: its regions are removed and it is moved on to Text, where it needs no transcription. Undo brings the regions back.");
    } finally { this.workflowBusy = false; }
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

  recoverOmitted(index, type) {
    const omitted = this.doc.source?.omitted_regions?.[index];
    if (!omitted) return;
    if (this.edit(doc => {
      const rid = ops.addRegion(doc, this.tl, type, omitted.box);
      doc.source.omitted_regions.splice(index, 1);
      this.selection = { region: rid };
    })) this.recompute();
  }

  updateWorkflowNavigation() {
    this.available = availability([...this.pageStates.values()]);
    if (!this.header) return;
    this.header.querySelectorAll(".mode").forEach(button => {
      button.disabled = !this.available[button.dataset.mode];
      button.title = button.disabled ? `Move pages on from ${button.dataset.mode === "text" ? "Regions" : "Text"} first` : "";
    });
  }

  layout() {
    const book = this.book;
    this.root.className = "book";
    const pageSel = h("select", { class: "pagesel", onchange: e => this.openPage(e.target.value) },
      ...book.pages.map(p => h("option", { value: p.id }, `${p.id.replace(/^.*-page-/, "")}${p.label ? ` (p. ${p.label})` : ""}${book.edits.has(p.id) ? " ✎" : ""}`)));
    this.pageSel = pageSel;
    this.status = h("span", { class: "status" });
    const modeBtn = (mode, text) => h("button", { class: "mode", dataset: { mode }, onclick: () => this.setMode(mode) }, text);
    const tabBtn = (stage, view, text) => h("button", { class: "tab", dataset: { stage, view }, onclick: () => this.setMode(`${stage}${view ? `&view=${view}` : ""}`) }, text);
    this.header = h("header", {},
      h("button", { class: "link", title: "the library", onclick: () => {
        if (this.workflowBusy || this.outlineBusy || this.maker?.processing) return this.toast("Wait for the active operation before opening the library.");
        this.leaveBook();
      } }, "⌂"),
      h("span", { class: "title", title: book.title }, book.title),
      h("nav", { class: "modes", "aria-label": "Book workflow" }, ...["pages", "regions", "text", "read", "export"].map(mode => modeBtn(mode, mode[0].toUpperCase() + mode.slice(1)))),
      h("nav", { class: "tabs", "aria-label": "Stage views" },
        tabBtn("text", "", "Pages"), tabBtn("text", "compare", "Compare models"),
        tabBtn("read", "", "Read"), tabBtn("read", "pages", "Units and links"), tabBtn("read", "compare", "Compare completion models"), tabBtn("read", "problems", "Problems"), tabBtn("read", "style", "Style sheet")),
      h("span", { class: "nav" }, h("button", { title: "previous page (Alt ←)", onclick: () => this.step(-1) }, "←"), pageSel, h("button", { title: "next page (Alt →)", onclick: () => this.step(1) }, "→")),
      h("span", { class: "undo" }, h("button", { title: "undo (⌘Z)", onclick: () => this.undo() }, "↶"), h("button", { title: "redo (⇧⌘Z)", onclick: () => this.redo() }, "↷")),
      h("span", { class: "page-stage-links" }, ...["regions", "text", "read"].map(stage => h("button", { class: "mini", dataset: { stage }, onclick: () => this.openPage(this.pid, {}, stage) }, `Open in ${stage === "read" ? "Read" : stage[0].toUpperCase() + stage.slice(1)}`)),
        h("button", { class: "mini", onclick: () => {
          const ids = book.pages.filter(page => eligible(this.stage, this.pageStates.get(page.id)) && stageFlags(this.pageStates.get(page.id), this.stage).length).map(page => page.id);
          const next = ids.find(pid => book.index[pid] > book.index[this.pid]) || ids[0];
          if (next) this.openPage(next);
        } }, "Next flagged page")), this.status, this.copyStatus = h("span", { class: "copy-status" }));
    this.main = h("main", {});
    this.root.replaceChildren(this.header, this.main);
    this.updateWorkflowNavigation();
    this.renderCopyStatus();
  }

  async route() {
    if (!this.book) return;
    if (this.workflowBusy || this.outlineBusy || this.maker?.processing) { history.replaceState(null, "", this.lastWorkflowUrl); return this.toast("Wait for the active operation before switching views."); }
    this.workflowScroll ||= new Map();
    if (this.stage) this.workflowScroll.set(`${this.stage}/${this.mode}`, this.main.scrollTop);
    if (this.stage === "regions" && this.mode === "page" && this.pageBuilt && this.doc) {
      const panes = [this.pageView.el, this.textPanel.el, this.main.querySelector(".lower"), this.regionTypePanel.element];
      this.regionPageViews.set(this.pid, { selection: structuredClone(this.selection), fit: this.pageView.fit, zoom: this.pageView.zoom,
        scroll: panes.map(pane => [pane.scrollLeft, pane.scrollTop]) });
      this.regionOverview.pageAddress = workflowAddress("regions", this.pid, this.selection);
    }
    const token = this.routeToken = (this.routeToken || 0) + 1;
    await this.flush();
    if (this.dirty) { history.replaceState(null, "", this.lastWorkflowUrl); return; }
    if (this.pid) await this.refreshWorkflowPage(this.pid);
    if (token !== this.routeToken) return;
    const route = workflowRoute(location.hash, this.available, pid => this.pageStates.get(pid)), { stage } = route;
    let { mode } = route;
    if (route.pid && (!this.pageStates.has(route.pid) || !eligible(stage, this.pageStates.get(route.pid)))) mode = "grid";
    // Comparisons call models: a read-only book shows its stage grid, which offers an editable copy.
    if (!this.book.writable && ["readers", "structures"].includes(mode)) { mode = stage === "read" ? "read" : "grid"; route.view = ""; }
    this.onLeaveGrid?.(); this.onLeaveGrid = null;
    this.lastWorkflowUrl = location.href;
    this.stage = stage;
    this.routeView = route.view;
    this.mode = mode;
    this.header.dataset.top = stage;
    this.header.dataset.view = mode;
    this.header.querySelectorAll(".mode").forEach(b => b.classList.toggle("on", b.dataset.mode === stage));
    this.header.querySelectorAll(".tab").forEach(b => {
      // Comparisons are reached from a stage's "Change"; their tab shows only while one is open.
      b.hidden = b.dataset.stage !== stage || b.dataset.view === "compare" && (route.view !== "compare" || !this.book.writable);
      const view = stage === "regions" ? mode === "types" ? "types" : "pages" : route.view || "";
      b.classList.toggle("on", b.dataset.view === view);
      b.setAttribute("aria-pressed", String(b.classList.contains("on")));
    });
    this.header.querySelectorAll(".page-stage-links [data-stage]").forEach(button => { button.disabled = !route.pid || !eligible(button.dataset.stage, this.pageStates.get(route.pid)); });
    for (const option of this.pageSel.options) option.hidden = !eligible(stage, this.pageStates.get(option.value));
    if (this.onLeaveReader && mode !== "read") { this.onLeaveReader(); this.onLeaveReader = null; }
    if (mode === "page") {
      const sel = route.region ? { region: route.region } : route.unit ? { unit: route.unit } : null;
      await this.showPage(route.pid, sel);
      if (token !== this.routeToken) return;
      const saved = stage === "regions" && this.regionPageViews.get(route.pid);
      if (saved && this.pageBuilt && (!sel || ops.canonical(sel) === ops.canonical(saved.selection))) {
        this.select(saved.selection, { keepFocus: true });
        this.pageView.setZoom(saved.zoom);
        this.pageView.fit = saved.fit;
        if (saved.fit === "height") this.pageView.fitHeight();
        const panes = [this.pageView.el, this.textPanel.el, this.main.querySelector(".lower"), this.regionTypePanel.element];
        panes.forEach((pane, index) => { [pane.scrollLeft, pane.scrollTop] = saved.scroll[index]; });
      }
    } else {
      this.pageBuilt = false;
      this.main.className = mode;
      if (mode === "grid" || mode === "types") await renderPages(this.main, this);
      if (mode === "read") await renderReader(this.main, this);
      if (mode === "style") renderStyle(this.main, this);
      if (mode === "check") this.renderCheck();
      if (mode === "export") this.renderExport();
      if (mode === "readers") renderReaders(this.main, this).catch(error => this.toast(error.message, "bad"));
      if (mode === "structures") renderStructures(this.main, this).catch(error => this.toast(error.message, "bad"));
    }
    if (stage === "regions" && mode === "grid") this.regionOverview.pageAddress = workflowAddress("regions");
    if (mode !== "page" && token === this.routeToken) this.main.scrollTop = this.workflowScroll.get(`${stage}/${mode}`) || 0;
    if (route.locked) this.toast("Move pages on from the previous stage to open this tab.");
  }

  setMode(mode) {
    location.hash = workflowAddress(mode);
  }

  setRegionView(view, type) {
    if (view === "types") {
      const regionType = this.stage === "regions" && this.mode === "page" && this.doc?.page.regions.find(region => region.id === this.selection.region)?.type;
      if (type || regionType) this.typeOverview.selected = type || regionType;
      this.setMode("types");
    } else location.hash = this.regionOverview.pageAddress || workflowAddress("regions");
  }

  openPage(pid, sel = {}, stage = ["regions", "text", "read"].includes(this.stage) ? this.stage : "regions") {
    location.hash = workflowAddress(stage, pid, sel);
  }

  // The previous or next page (Edit pages).
  step(d) {
    if (this.mode !== "page") return;
    const pages = this.book.pages.filter(page => eligible(this.stage, this.pageStates.get(page.id)));
    const i = pages.findIndex(page => page.id === this.pid);
    const j = Math.max(0, Math.min(pages.length - 1, i + d));
    if (j !== i && pages[j]) this.openPage(pages[j].id);
  }

  // ---------------------------------------------------------------- page mode

  async showPage(pid, sel) {
    const token = this.routeToken;
    const focusChanged = this.editorStage !== this.stage;
    if (focusChanged) this.pageBuilt = false;
    const changed = this.pid !== pid || !this.doc || focusChanged;
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
            h("button", { onclick: () => this.setMode("regions") }, "Find regions with a model")) : null,
          h("img", { src: await this.book.imageUrl(pid), style: "max-width:100%;border:1px solid #ccc" })));
        this.pageSel.value = pid;
        return;
      }
      const saved = this.book.edits.get(pid);
      const draft = await this.book.draft(pid).catch(() => null);
      if (token !== this.routeToken) return;
      this.modelDoc = model;
      this.savedDoc = saved || model;
      this.doc = ops.clone(draft ? draft.doc : this.savedDoc);
      this.dirty = !!draft;
      this.undoStack = [];
      this.redoStack = [];
      this.selection = {};
    }
    if (!this.pageBuilt) {
      this.editorStage = this.stage;
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
    this.pageView?.destroy();
    this.main.className = "page";
    const imgPane = h("div", { class: "imgpane" });
    const toolbar = h("div", { class: "toolbar" },
      ...FORMAT_BUTTONS.map(([k, t, title]) => h("button", { class: `fmt f-${k}`, title, onmousedown: e => e.preventDefault(), onclick: () => this.textPanel.format(k) }, t)),
      ...Object.entries(this.tl.inline || {}).map(([k, d]) => h("button", { class: "fmt", title: d.description, onmousedown: e => e.preventDefault(), onclick: () => this.textPanel.format(k) }, k)),
      h("span", { class: "sep" }),
      h("button", { title: "insert a note marker at the caret", onmousedown: e => e.preventDefault(), onclick: () => markerForm(this.inspector, this) }, "＋ Marker"),
      h("span", { class: "sep" }),
      h("button", { class: "draw", title: "draw a new region on the page", onclick: e => this.toggleDraw(e.currentTarget) }, "＋ Region"),
      h("span", { class: "sep" }),
      h("button", { title: "zoom out", onclick: () => this.pageView.setZoom(this.pageView.zoom / 1.25) }, "−"),
      h("button", { title: "the page's whole width in the pane", onclick: () => this.pageView.fitWidth() }, "fit width"),
      h("button", { title: "the page's whole height in the pane (kept as you resize the window or change pages)", onclick: () => this.pageView.fitHeight() }, "fit height"),
      h("button", { title: "zoom in (or ⌘ + scroll on the page)", onclick: () => this.pageView.setZoom(this.pageView.zoom * 1.25) }, "+"),
      h("span", { class: "sep" }),
      h("button", { class: "revert", title: "return to this page’s last stage save", onclick: () => this.revertPage() }, "Revert page"));
    if (this.stage !== "text") {
      toolbar.querySelectorAll(".fmt").forEach(button => button.remove());
      toolbar.querySelector('[title="insert a note marker at the caret"]')?.remove();
    }
    if (this.stage !== "regions") toolbar.querySelector(".draw")?.remove();
    else if (this.book.writable) toolbar.append(h("button", { onclick: () => reviewPageWithAI(this).catch(error => this.toast(error.message, "bad")) }, "Review page with AI"),
      h("button", { class: "no-content", title: "for a page that is not part of the book, such as a library’s cover or a blank page: remove its regions and move it on to Text, where it needs no transcription",
        onclick: () => this.markNoContent().catch(error => this.toast(error.message, "bad")) }, "No content on this page"));
    const textPane = h("div", { class: "textpane" });
    this.inspector = h("div", { class: "inspector" });
    this.problems = h("div", { class: "checks" });
    const side = h("div", { class: "side" }, toolbar, textPane, h("div", { class: "lower" }, this.problems, this.inspector));
    this.regionTypePanel = this.stage === "regions" ? regionTypesPanel(this, () => openTypeList(this).catch(error => this.toast(error.message, "bad"))) : null;
    this.main.classList.toggle("regions-editor", this.stage === "regions");
    this.main.replaceChildren(...(this.regionTypePanel ? [this.regionTypePanel.element] : []), imgPane, side);
    const fit = this.pageView?.fit;   // fit height is kept when the page view is made again
    this.pageView = new PageView(imgPane, {
      editable: this.stage === "regions",
      onSelectRegion: rid => this.select(rid ? { region: rid } : {}),
      onSelectOmitted: index => this.select({ omitted: index }),
      onBox: (rid, box) => { if (this.edit(d => ops.setBox(d, rid, box))) this.recompute(); },
      onDraw: (box, ev) => this.drawn(box, ev),
      onHoverLine: (key, on) => this.textPanel.el.querySelectorAll(`.rtext[data-rid="${CSS.escape(key.split(":")[0])}"] > .lp[data-i="${key.split(":")[1]}"]`).forEach(x => x.classList.toggle("hl", on)),
      onHoverRegion: (rid, on) => this.hoverRegion(rid, on, true),
    });
    if (fit === "height") this.pageView.fit = "height";
    this.textPanel = this.stage === "regions" ? new RegionsPanel(textPane, this) : new TextPanel(textPane, this);
    await this.refresh();
  }

  async refresh() {
    const url = await this.book.imageUrl(this.pid);
    this.pageView.show(this.doc, url, this.colors, this.furniture, this.tl);
    this.textPanel.render();
    this.regionTypePanel?.refresh();
    this.afterRender();
  }

  afterRender() {
    this.pageView.select(this.selection.region || (this.selection.marker && ops.findMarker(this.doc, this.selection.marker)?.region.id) || null);
    if (this.stage === "regions") renderRegionInspector(this.inspector, this); else renderInspector(this.inspector, this);
    this.renderChecks();
  }

  renderChecks() {
    const [errors, warnings] = this.check(this.doc);
    this.lastErrors = errors;
    const edited = this.book.edits.has(this.pid);
    let state;
    if (errors.length) state = h("span", { class: "bad" }, `not saved: ${errors.length} problem${errors.length > 1 ? "s" : ""}`);
    else if (this.dirty) state = h("span", { class: "pending" }, "saving…");
    else state = h("span", { class: "ok" }, edited ? (this.book.writable ? "your version, saved in edits/" : "your version, saved in this browser") : "saved stage version");
    this.status.replaceChildren(state);
    const goto = msg => {
      const m = /region [^#\s]+#(\S+?)[: ]/.exec(msg + " ") || /unit (\S+?)[: ]/.exec(msg + " ");
      if (!m) return;
      if (msg.includes("region ")) this.select({ region: m[1] }); else this.select({ unit: m[1] });
    };
    this.problems.replaceChildren(
      ...errors.map(e => h("div", { class: "err", onclick: () => goto(e) }, "✗ " + e)),
      ...warnings.map(w => h("div", { class: "warnline" }, "• " + w)));
  }

  select(sel, { keepFocus = false } = {}) {
    this.selection = sel || {};
    if (!this.textPanel) return;
    const target = this.textPanel.markSelection();
    const rid = sel.region || (sel.marker && ops.findMarker(this.doc, sel.marker)?.region.id);
    this.pageView.select(rid || null);
    if (rid) this.pageView.reveal(rid);
    if (sel.unit) {
      const u = this.doc.units.find(x => x.id === sel.unit);
      const first = u && firstRegion(this.doc, u);
      if (first) this.pageView.reveal(first);
    }
    if (target && !keepFocus) target.scrollIntoView({ block: "nearest", behavior: "smooth" });
    if (this.stage === "regions") renderRegionInspector(this.inspector, this); else renderInspector(this.inspector, this);
  }

  hoverRegion(rid, on, revealText = false) {
    this.pageView?.highlightRegion(rid, on);
    this.textPanel?.highlightRegion?.(rid, on, revealText);
  }

  async joinNext(uid) {
    if (this.workflowBusy || this.outlineBusy) return this.toast("Wait for the current edit to finish.");
    await this.flush();
    if (this.dirty) return;
    const pid = this.pid, expected = new Map([[pid, unitSnapshot(this.doc)]]);
    this.workflowBusy = true;
    try {
      const saved = await joinFollowingUnit(this, pid, uid, expected);
      for (const id of Object.keys(saved)) await this.refreshWorkflowPage(id);
      this.doc = null; this.pageBuilt = false;
      await this.showPage(pid, { unit: uid });
    } catch (error) { this.toast(error.message, "warn"); }
    finally { this.workflowBusy = false; }
  }

  // Apply an edit to a copy of the working document; keep the old one for undo.
  edit(fn, { after, sameStep = false } = {}) {
    let next = ops.clone(this.doc);
    try {
      fn(next);
      const focus = editorFocus(this.stage);
      assertFocusEdit(focus, this.doc, next);
      if (this.stage === "regions") {
        rebuildProvisional(next, this.tl, { firstPage: this.book.index[this.pid] === 0, lastPage: this.book.index[this.pid] === this.book.pages.length - 1 });
        next = noteEdit(this.doc, next, { focus: "regions" });
        next.source.layers.regions.types_revision = typeRevision(this.tl.source?.revision);
      } else next = noteEdit(this.doc, next, { focus });
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
    if (this.stage !== "text") return;
    ops.setLine(this.doc, rid, i, text, spans);
    this.changed();
    this.renderChecks();
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
    const doc = ops.clone(this.doc), pid = this.pid, focus = editorFocus(this.stage), base = this.savedDoc;
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
        else if (focus === "units") this.doc = applyUnitChanges(doc, this.doc, this.savedDoc);
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
    this.doc = this.undoStack.pop();
    this.typingKey = null;
    this.changed();
    this.refresh();
  }

  redo() {
    if (this.mode !== "page" || !this.redoStack.length) return;
    this.undoStack.push(this.doc);
    this.doc = this.redoStack.pop();
    this.typingKey = null;
    this.changed();
    this.refresh();
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
      this.worker = new Worker(new URL("./local/worker.js?v=20261113-survey-1", import.meta.url), { type: "module" });
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

  toggleDraw(btn) {
    const on = !this.pageView.drawing;
    this.pageView.setDrawing(on);
    btn.classList.toggle("on", on);
    if (on) this.toast("Drag a rectangle on the page. The new region goes into the selected unit, if it can.");
  }

  drawn(box, ev) {
    this.pageView.setDrawing(false);
    this.main.querySelector(".toolbar .draw")?.classList.remove("on");
    const printed = Object.entries(this.tl.types).filter(([, t]) => "region" in t).map(([n]) => n);
    const into = this.selection.unit || (this.selection.region && ops.ownerOf(this.doc, this.selection.region)?.id) || null;
    const menu = h("div", { class: "popup", style: `left:${ev.clientX}px;top:${ev.clientY}px` },
      h("div", { class: "meta" }, "The new region's type:"),
      ...printed.map(t => h("button", { class: "link", onclick: () => {
        menu.remove();
        let rid = null;
        if (this.edit(d => { rid = ops.addRegion(d, this.tl, t, box, into); }, { after: () => { this.select({ region: rid }); this.textPanel.placeCaret(rid, 0, 0); } })) this.recompute();
      } }, h("i", { style: `background:${this.colors[t]}` }), t)),
      h("button", { class: "link", disabled: !this.book.writable, onclick: () => {
        menu.remove(); newTypeDialog(this, type => {
          if (this.edit(doc => { const rid = ops.addRegion(doc, this.tl, type, box, into); this.selection = { region: rid }; })) this.recompute();
        }, true);
      } }, "New type…"),
      h("button", { class: "mini", onclick: () => menu.remove() }, "cancel"));
    document.body.append(menu);
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
    if (this.mode !== "page" || this.stage !== "regions" || mod || e.altKey || e.target.closest("input,select,textarea,button,dialog,[contenteditable]")) return;
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

  async renderCheck() {
    const el = this.main;
    el.replaceChildren(h("div", { class: "loading" }, "Checking every page…"));
    const docs = await this.book.all((d, n) => { el.firstChild.textContent = `Checking every page… ${d} of ${n}`; });
    // In page order, with a page that has no document yet as a gap that nothing joins across.
    const P = prepare(readingDocuments(this.book.pages, docs), this.tl);
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
    const link = pid => h("button", { class: "link", onclick: () => this.openPage(pid) }, pid.replace(/^.*-page-/, "page "));
    el.replaceChildren(h("div", { class: "checkview" },
      h("h2", {}, "Problems"),
      h("p", { class: "hint" }, "What the checks find across the book. Each page document is checked against the schema and the book's type list whenever it changes (the same rules as schema/book.py check): a page that fails is marked ✗ here, and its corrections are kept as a draft until it passes. Across pages: units marked as going on at a page break that do not join a later page (past blank pages and plates, which have no unit of their type), and printed page numbers out of sequence. The table also shows the pages you corrected (✎) and the notes the transcription model left."),
      h("p", {}, `${rows.length} pages: ${bad.length} not passing the checks, ${edited.length} corrected by you, ${Object.keys(flagged).length} with a printed page number out of sequence (and ${Object.keys(unprinted).length} printing none, which is often right, as on a chapter's first page), `,
        `${P.warnings.length} page breaks where units do not join.`),
      P.warnings.length ? h("details", { open: true }, h("summary", {}, "Units that do not join across a page break"), ...P.warnings.map(w => h("div", { class: "row" }, w))) : null,
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

  async continueBook(stage = "regions") {
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
    const assembled = async () => prepare(readingDocuments(book.pages, await book.all()), this.tl, book.style);
    // Each figure unit's regions cut from their page images, as data: URLs (ornaments, being furniture, are not in the text).
    const figureCrops = async P => {
      const out = {};
      for (const u of P.book.units) {
        if ((this.tl.types[u.type] || {}).region !== "figure") continue;
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
      const when = "after each processing run, after pages are moved on, and at most every five minutes while there are changes";
      copySection.replaceChildren(...[h("h3", {}, "Copies of this book"),
        h("p", { class: this.storage?.persisted === false ? "warn" : "meta" }, storageText(this.storage || {})),
        state?.disk ? [h("p", { class: label.warn ? "warn" : "" }, `${label.text}. The file ${state.name} is written again ${when}.`),
          h("div", { class: "actions" }, state.kind === "permission" ? h("button", { class: "primary", onclick: () => copy.allow() }, "Allow writing")
            : h("button", { disabled: state.kind === "writing", onclick: () => copy.write() }, "Write it now"),
          h("button", { onclick: () => this.chooseDiskCopy() }, "Choose another file…"),
          h("button", { onclick: () => copy.forget() }, "Stop keeping a copy"))]
          : window.showSaveFilePicker ? [h("p", { class: label?.warn ? "warn" : "" }, `${label?.text || "No copy on disk"}. Choose a file once, and the book is written to it as a .chaya.pdf ${when}. If this browser loses the book, open that file again.`),
            h("div", { class: "actions" }, h("button", { class: "primary", onclick: () => this.chooseDiskCopy() }, "Keep a copy on disk…"))]
            : h("p", { class: label?.warn ? "warn" : "" }, `${label?.text || "No copy on disk"}. This browser cannot keep a file up to date: save the .chaya.pdf below after each session’s work.`)].flat());
    };
    if (copySection) storagePersistence().then(value => { this.storage = value; this.renderCopySection(); }).catch(() => {});
    el.replaceChildren(h("div", { class: "exportview" },
      h("h2", {}, "Export"),
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

function firstRegion(doc, u) {
  for (const c of u.children) {
    if (c.region) return c.region.split("#")[1];
    const k = doc.units.find(x => x.id === c.unit);
    const r = k && firstRegion(doc, k);
    if (r) return r;
  }
  return null;
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
