import { bookCredentials } from "./book-credentials.js?v=20261127-place-areas";
import { openExport } from "./book-export.js?v=20261127-place-areas";
import { openSettings } from "./book-settings.js?v=20261127-place-areas";
import { openProcess } from "./process-view.js?v=20261127-place-areas";
import { h, cropInto } from "./render.js?v=20261127-place-areas";
import * as B from "./book.js?v=20261127-place-areas";
import { pageCaption } from "./bookchecks.js?v=20261127-place-areas";
import { ScanView } from "./bookview.js?v=20261127-place-areas";
import { browserBooks, openBook, importBook, downloadInput, fileStem, removeBook, OldBookError, PREVIOUS } from "./store.js?v=20261127-place-areas";
import { bookHtml, bookToc, BOOK_CSS, wireBookView, safeId } from "./reader.js?v=20261127-place-areas";
import { baseCss } from "./style.js?v=20261127-place-areas";

const app = document.querySelector("#app");
let dialogSequence = 0;
const button = (text, click, attrs) => h("button", { type: "button", onclick: click, ...attrs }, text);

document.head.append(h("style", {}, BOOK_CSS));

function download(blob, name) {
  const url = URL.createObjectURL(blob), link = h("a", { href: url, download: name });
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

class App {
  constructor() {
    this.mode = "scans";
    window.addEventListener("keydown", event => this.key(event));
    window.addEventListener("popstate", () => this.route());
    document.addEventListener("visibilitychange", () => { if (document.hidden) this.flush().catch(() => {}); });
    window.addEventListener("beforeunload", event => { if (this.dirty) { event.preventDefault(); this.flush().catch(() => {}); } });
  }

  async route() {
    const params = new URLSearchParams(location.search);
    if (params.has("book")) return this.load(async progress => downloadInput(params.get("book"), progress), params.get("book"));
    if (params.has("local")) {
      try { return this.show(await openBook(params.get("local"))); }
      catch (error) { return this.library(error); }
    }
    return this.library();
  }

  async leave() {
    if (!this.session) return;
    await this.flush();
    this.scans?.destroy();
    this.clearText();
    this.session.close().catch(() => {});
    this.session = null;
  }

  library(error, oldUrl) {
    this.leave().then(() => this.renderLibrary(error, oldUrl)).catch(err => this.notify(err.message));
  }

  async renderLibrary(error, oldUrl) {
    app.className = "v1-library";
    const status = h("div", { class: "v1-library-status", role: "status" });
    if (error) {
      status.append(h("p", { class: "v1-error" }, error.message));
      if (error instanceof OldBookError) status.append(h("a", { href: oldUrl ? `${PREVIOUS}?book=${encodeURIComponent(oldUrl)}` : PREVIOUS },
        "Open the previous version"));
    }
    const file = h("input", { type: "file", accept: ".pdf,application/pdf", hidden: true,
      onchange: () => { if (file.files[0]) this.load(async () => file.files[0]); } });
    const url = h("input", { type: "url", placeholder: "https://…", "aria-label": "PDF URL", required: true });
    const form = h("form", { class: "v1-url", onsubmit: event => {
      event.preventDefault();
      const link = url.value.trim();
      if (link) {
        history.replaceState({}, "", `?book=${encodeURIComponent(link)}`);
        this.load(progress => downloadInput(link, progress), link);
      }
    } }, url, h("button", { type: "submit" }, "Open URL"));
    const list = h("div", { class: "v1-books" }, h("p", { class: "v1-muted" }, "Opening the library…"));
    const examples = h("div", { class: "v1-examples" });
    app.replaceChildren(h("div", { class: "v1-library-inner" },
      h("h1", {}, "Chaya"), h("p", { class: "v1-library-subtitle" }, "Scanned books"),
      h("div", { class: "v1-open" }, button("Open PDF…", () => file.click(), { class: "primary" }), file, form),
      status, h("section", {}, h("h2", {}, "Books in this browser"), list),
      h("section", {}, h("h2", {}, "Examples"), examples),
      h("footer", {}, h("a", { href: PREVIOUS }, "The previous version, for books in the old format"))));
    try {
      const books = await browserBooks();
      list.replaceChildren(...books.map(book => h("div", { class: "v1-book-row" },
        h("div", {}, button(book.title, async () => {
          try { await this.show(await openBook(book.id)); }
          catch (err) { this.renderLibrary(err); }
        }, { class: "v1-book-title", disabled: !!book.error }),
        h("small", {}, book.error ?? `${book.pages} ${book.pages === 1 ? "page" : "pages"}`)),
        h("div", { class: "v1-tools" }, button("Download", async () => {
          try {
            const session = await openBook(book.id);
            download(await session.export(session.book), fileStem(session.book.title) + ".chaya.pdf");
          } catch (err) { this.notify(err.message); }
        }, { disabled: !!book.error }), button("Delete", async () => {
          try {
            if (confirm(`Remove “${book.title}” from this browser?`)) { await removeBook(book.id); this.renderLibrary(); }
          } catch (err) { this.notify(err.message); }
        })))));
      if (!books.length) list.append(h("p", { class: "v1-muted" }, "Open a PDF to start your library."));
    } catch (err) { list.replaceChildren(h("p", { class: "v1-error" }, err.message)); }
    try {
      const response = await fetch(new URL("../examples.json?v=20261127-place-areas", import.meta.url));
      if (!response.ok) throw new Error();
      const books = await response.json();
      for (const book of books) {
        const url = book.url ?? new URL(`../examples/${book.file}`, import.meta.url).href;
        examples.append(h("a", { class: "v1-example", href: `?book=${encodeURIComponent(url)}` },
          h("strong", {}, book.title), h("span", {}, book.blurb)));
      }
    } catch { examples.append(h("p", { class: "v1-muted" }, "Examples are unavailable.")); }
  }

  async load(input, oldUrl) {
    if (this.loading) return;
    this.loading = true;
    const message = h("p", { role: "status" }, "Opening PDF…");
    const gauge = h("progress");
    app.className = "v1-library";
    app.replaceChildren(h("div", { class: "v1-library-inner" }, h("h1", {}, "Opening book"), message, gauge));
    const progress = (text, value, total) => {
      message.textContent = text;
      if (total) { gauge.max = total; gauge.value = value; } else gauge.removeAttribute("value");
    };
    try { await this.show(await importBook(await input(progress), progress)); }
    catch (error) { this.renderLibrary(error, oldUrl); }
    finally { this.loading = false; }
  }

  async show(session) {
    await this.leave();
    this.session = session;
    this.book = session.book;
    this.undo = [];
    this.redo = [];
    this.mode = "scans";
    this.dirty = false;
    this.saveError = null;
    this.typing = null;
    history.replaceState({}, "", `?local=${encodeURIComponent(session.id)}`);
    app.className = "book v1-app";
    this.title = h("strong", { class: "v1-title" }, this.book.title);
    this.status = h("span", { class: "v1-status", role: "status" }, "Saved in browser");
    this.scansButton = button("Scans", () => this.switchMode("scans"), { "aria-pressed": "true" });
    this.textButton = button("Text", () => this.switchMode("text"), { "aria-pressed": "false" });
    this.nextButton = button("Next check", () => this.nextCheck(), { title: "Next check (N)" });
    this.undoButton = button("↶", () => this.step(false), { "aria-label": "Undo", title: "Undo" });
    this.redoButton = button("↷", () => this.step(true), { "aria-label": "Redo", title: "Redo" });
    const home = button("⌂", () => {
      this.leave().then(() => { history.pushState({}, "", location.pathname); this.renderLibrary(); })
        .catch(error => this.notify(error.message));
    }, { "aria-label": "Library" });
    this.header = h("header", { class: "v1-header" }, home, this.title,
      h("div", { class: "v1-switch", "aria-label": "Book view" }, this.scansButton, this.textButton),
      this.nextButton, h("div", { class: "v1-history" }, this.undoButton, this.redoButton), this.status,
      button("Process…", () => this.process()), button("Settings", () => this.settings()), button("Export", () => this.exportMenu()));
    this.scanScroll = h("main", { class: "v1-scroll", "aria-label": "Scans" });
    this.textScroll = h("main", { class: "v1-scroll v1-reading", "aria-label": "Text", hidden: true });
    app.replaceChildren(this.header, this.scanScroll, this.textScroll);
    this.scans = new ScanView(this.scanScroll, session, { edit: (operation, detail) => this.edit(operation, detail),
      process: (index, restore) => this.process(index, restore), message: message => this.notify(message) });
    this.updateHistory();
  }

  edit(operation, detail = {}) {
    let next;
    try { next = operation(this.book); }
    catch (error) { this.notify(error.message); return; }
    if (next === this.book) return;
    const group = detail.typing && this.typing?.key === detail.typing && Date.now() - this.typing.time < 900;
    if (!group) { this.undo.push(this.book); if (this.undo.length > 150) this.undo.shift(); }
    this.redo.length = 0;
    this.typing = detail.typing ? { key: detail.typing, time: Date.now() } : null;
    this.apply(next, !!detail.typing);
  }

  apply(book, typing) {
    this.book = book;
    this.title.textContent = book.title;
    this.scans.update(book, typing);
    if (this.mode === "text") this.renderText(this.textPosition());
    this.updateHistory();
    this.dirty = true;
    this.status.textContent = "Saving…";
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.flush().catch(() => {}), 350);
  }

  async flush() {
    clearTimeout(this.saveTimer);
    if (!this.session) return;
    if (!this.dirty) { await this.inFlight; return; }
    this.dirty = false;
    const current = this.session, book = this.book;
    const saving = current.save(book);
    this.inFlight = saving;
    try {
      await saving;
      if (this.inFlight === saving && this.session === current && !this.dirty) this.status.textContent = "Saved in browser";
    } catch (error) {
      if (this.session === current) { this.dirty = true; this.status.textContent = `Save failed: ${error.message}`; }
      throw error;
    }
  }

  updateHistory() {
    this.undoButton.disabled = !this.undo.length;
    this.redoButton.disabled = !this.redo.length;
  }

  step(redo) {
    const from = redo ? this.redo : this.undo, to = redo ? this.undo : this.redo;
    const book = from.pop();
    if (!book) return;
    to.push(this.book);
    this.typing = null;
    this.apply(book, false);
  }

  nextCheck() {
    if (this.mode === "text") this.switchMode("scans");
    this.scans.nextCheck();
  }

  switchMode(mode, address) {
    if (mode === this.mode) return;
    const position = this.mode === "scans" ? this.scans.currentPosition() : this.textPosition();
    this.mode = mode;
    this.scanScroll.hidden = mode !== "scans";
    this.textScroll.hidden = mode !== "text";
    this.scansButton.setAttribute("aria-pressed", mode === "scans");
    this.textButton.setAttribute("aria-pressed", mode === "text");
    if (mode === "text") this.renderText(position);
    else {
      const index = address ? B.pageIndexOf(this.book, address) : position.index;
      if (index >= 0) this.scans.goTo(index, address ?? position.address);
      this.clearText();
    }
  }

  textPosition() {
    const top = this.textScroll.getBoundingClientRect().top;
    const first = [...this.textScroll.querySelectorAll(".r-reg[data-ref]")].find(item => item.getBoundingClientRect().bottom > top + 10 &&
      item.getBoundingClientRect().width);
    const address = first && this.addressOf(first.dataset.ref);
    return { index: address ? B.pageIndexOf(this.book, address) : 0, address };
  }

  addressOf(ref) {
    const [pageId, id] = ref.split("#"), index = this.book.pages.findIndex((page, i) => (page.id ?? String(i + 1)) === pageId);
    return index >= 0 ? `${index + 1}/${id}` : undefined;
  }

  clearText() {
    this.closeScanPreview?.();
    this.figures?.disconnect();
    this.figures = null;
    this.textJob?.abort();
    this.textJob = null;
    this.textUrls?.forEach(url => URL.revokeObjectURL(url));
    this.textUrls = [];
    if (this.textScroll) this.textScroll.replaceChildren();
  }

  renderText(position = { index: 0 }) {
    this.clearText();
    const view = B.assemble(this.book);
    const printed = !!view.sheet;
    const root = h("div", { class: "bookview" });
    root.innerHTML = `<button class="bv-open" type="button">Contents</button>${bookToc(view)}<article class="reader plain${printed ? " printed" : ""}">${bookHtml(view, { plain: true, printed })}</article>`;
    const article = root.querySelector("article");
    if (printed) article.style.cssText = baseCss(view.sheet);
    if (!view.book.units.length) article.append(h("p", { class: "v1-empty" }, "The book has no text yet."));
    this.textScroll.append(root);
    const job = this.textJob = new AbortController();
    wireBookView(root, this.textScroll, { signal: job.signal });
    root.addEventListener("dblclick", event => {
      if (event.target.closest("a")) return;
      const source = event.target.closest(".r-reg[data-ref], .r-note-piece, .sidenote, .bv-inline-note");
      const ref = source?.dataset.ref ?? source?.querySelector(".r-note-piece")?.dataset.ref;
      const address = ref && this.addressOf(ref);
      if (!address) return;
      getSelection()?.removeAllRanges();
      this.previewScan(address, event.clientX, event.clientY);
    }, { signal: job.signal });
    this.figures = new IntersectionObserver(entries => {
      for (const { isIntersecting, target } of entries) {
        if (!isIntersecting) continue;
        this.figures.unobserve(target);
        const address = this.addressOf(target.dataset.ref), region = address && B.regionAt(this.book, address);
        if (!region) continue;
        const page = this.book.pages[B.pageIndexOf(this.book, address)];
        this.session.scan(page, 740, job.signal).then(async blob => {
          if (job.signal.aborted) return;
          const bmp = await createImageBitmap(blob);
          const w = bmp.width, h = bmp.height;
          bmp.close();
          if (job.signal.aborted) return;
          const url = URL.createObjectURL(blob);
          this.textUrls.push(url);
          cropInto(target, url, { width: w, height: h }, region.box.map((n, i) => n * (i % 2 ? h : w)), 560, 460);
        }).catch(() => {});
      }
    }, { root: this.textScroll });
    root.querySelectorAll(".r-fig[data-ref]").forEach(el => this.figures.observe(el));
    const page = this.book.pages[position.index];
    const ref = position.address ? `${page?.id ?? position.index + 1}#${position.address.split("/")[1]}` : null;
    const region = ref && root.querySelector(`[data-ref="${CSS.escape(ref)}"]`);
    const at = region || root.querySelector(`#pb-${CSS.escape(safeId(page?.id ?? position.index + 1))}`);
    if (at) at.scrollIntoView({ block: "start" });
    else this.textScroll.scrollTop = 0;
  }

  async previewScan(address, x, y) {
    const region = B.regionAt(this.book, address);
    if (!region) return;
    this.closeScanPreview?.();
    const page = this.book.pages[B.pageIndexOf(this.book, address)];

    const job = new AbortController(), { signal } = job;
    let url;
    const caption = pageCaption(page);
    const status = h("p", { class: "meta", role: "status" }, "Loading scan…");
    const crop = h("div", { role: "img", "aria-label": `Scan crop from ${caption}`, hidden: true });
    const close = () => {
      if (signal.aborted) return;
      job.abort();
      if (url) URL.revokeObjectURL(url);
      panel.remove();
      this.closeScanPreview = null;
    };
    const panel = h("div", { class: "v1-scan-preview", popover: "auto", role: "dialog", "aria-label": "Scan preview" },
      status, crop,
      h("div", { class: "v1-scan-preview-bar" }, h("span", {}, caption),
        button("Open in Scans", () => { close(); this.switchMode("scans", address); }),
        button("×", close, { "aria-label": "Close scan preview" })));
    this.closeScanPreview = close;
    this.textScroll.append(panel);
    panel.addEventListener("toggle", event => { if (event.newState === "closed") close(); });
    const { scrollTop, scrollLeft } = this.textScroll;
    this.textScroll.addEventListener("scroll", () => {
      if (this.textScroll.scrollTop !== scrollTop || this.textScroll.scrollLeft !== scrollLeft) close();
    }, { passive: true, signal });
    panel.showPopover();
    const place = () => {
      const { width, height } = panel.getBoundingClientRect();
      panel.style.left = `${Math.max(8, Math.min(innerWidth - width - 8, x - width / 2))}px`;
      panel.style.top = `${Math.max(8, y + height + 12 < innerHeight ? y + 8 : y - height - 8)}px`;
    };
    place();

    try {
      const blob = await this.session.scan(page, 1440, signal);
      if (signal.aborted) return;
      const bitmap = await createImageBitmap(blob);
      const { width, height } = bitmap;
      bitmap.close();
      if (signal.aborted) return;
      url = URL.createObjectURL(blob);
      const box = region.box.map((value, i) => {
        const bound = i % 2 ? height : width;
        const pad = i < 2 ? -12 : 12;
        return Math.max(0, Math.min(bound, value * bound + pad));
      });
      cropInto(crop, url, { width, height }, box, Math.min(640, innerWidth - 34), Math.min(420, innerHeight * 0.6));
      crop.hidden = false;
      status.hidden = true;
      place();
    } catch (error) {
      if (!signal.aborted) { status.textContent = `Could not load the scan. ${error.message}`; place(); }
    }
  }

  dialog(title, content) {
    const label = `v1-dialog-title-${++dialogSequence}`;
    const panel = h("dialog", { class: "v1-dialog", "aria-labelledby": label }, h("div", { class: "v1-dialog-head" }, h("h2", { id: label }, title),
      button("×", () => panel.close(), { "aria-label": "Close" })), content);
    panel.addEventListener("close", () => panel.remove(), { once: true });
    app.append(panel);
    panel.showModal();
    return panel;
  }

  credentials() { return this.credentialStore ??= bookCredentials(); }

  async structureHints() {
    const hints = new Map();
    for (const [index, page] of this.book.pages.entries()) {
      if (page.skip || !page.regions) continue;
      const pid = page.id ?? String(index + 1);
      const data = await this.session.readWork(`work/structure-hints/${pid}.json`, true);
      if (data) hints.set(pid, data);
    }
    return hints;
  }

  settings() { openSettings(this); }

  process(index, restore) { openProcess(this, index, restore).catch(error => this.notify(error.message)); }

  exportMenu() {
    try { openExport(this, download); }
    catch (error) { this.notify(error.message); }
  }

  notify(message) {
    document.querySelector(".v1-toast")?.remove();
    const toast = h("div", { class: "v1-toast", role: "status" }, message);
    document.body.append(toast);
    setTimeout(() => toast.remove(), 3200);
  }

  key(event) {
    if (!this.session || event.defaultPrevented || app.querySelector("dialog[open]")) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const typing = target.closest("input, textarea, select, [contenteditable]");
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      this.step(event.shiftKey);
    } else if (!typing && event.key.toLowerCase() === "n") {
      event.preventDefault();
      this.nextCheck();
    } else if (this.mode === "scans" && this.scans.key(event)) event.preventDefault();
  }
}

new App().route().catch(error => { app.textContent = error.message; });
