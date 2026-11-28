import * as B from "./book.js?v=20261128-page-joins";
import { UNCLASSIFIED } from "./chaya-book.js?v=20261128-page-joins";
import { areaTitle, checksFor, compareScanBoxes, existingProposedType, pageCaption, typeLabel as words } from "./bookchecks.js?v=20261128-page-joins";
import { hasTextInk } from "./local/ink-checks.js?v=20261128-page-joins";
import { PageView } from "./pageimage.js?v=20261128-page-joins";
import { boxRing } from "./ops.js?v=20261128-page-joins";
import { h, PALETTE, lineHtml } from "./render.js?v=20261128-page-joins";
import { cpLength, normalizeSpans } from "./inline.js?v=20261128-page-joins";

const button = (title, action, attrs) => h("button", { type: "button", onclick: action, ...attrs }, title);
const addressOf = (index, id) => `${index + 1}/${id}`;
const clamp = n => Math.max(0, Math.min(1, n));
const orderedBox = ([a, b, c, d]) => [clamp(Math.min(a, c)), clamp(Math.min(b, d)), clamp(Math.max(a, c)), clamp(Math.max(b, d))];
const pixel = (box, w, h) => box.map((n, i) => n * (i % 2 ? h : w));
const fractions = (box, w, h) => box.map((n, i) => n / (i % 2 ? h : w));
const nonText = (book, r) => r.ignored || r.type === "?" || book.types[r.type]?.ignored;
const checkKey = ({ kind, address, line, span, id }) => JSON.stringify([kind, address, line, span, id]);

function picker(types, selected, change, label) {
  const select = h("select", { "aria-label": label, onchange: e => change(e.target.value) });
  const entries = selected && !types.includes(selected) ? [...types, selected] : types;
  select.append(...entries.map(type => h("option", { value: type }, words(type))));
  select.value = selected;
  return select;
}

function markerNode(marker) {
  return h("span", { class: "v1-marker", contenteditable: "false", dataset: { sign: marker.marker, to: marker.to ?? "" },
    title: marker.to ? `Note at ${marker.to}` : "Note marker" });
}

function readEditable(host) {
  let text = "";
  const spans = [];
  const kinds = { B: "bold", STRONG: "bold", I: "italic", EM: "italic", U: "underline", SUP: "superscript", SUB: "subscript" };
  function walk(node) {
    if (node.nodeType === Node.TEXT_NODE) { text += node.data.replaceAll("\u00a0", " "); return; }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const start = cpLength(text);
    if (node.classList.contains("v1-marker")) {
      spans.push({ kind: "note_marker", start, end: start, marker: node.dataset.sign, ...(node.dataset.to ? { to: node.dataset.to } : {}) });
      return;
    }
    for (const child of node.childNodes) walk(child);
    const end = cpLength(text);
    const kind = kinds[node.tagName] ?? node.dataset.kind ?? (node.classList.contains("sc") ? "small_caps" :
      node.classList.contains("spc") ? "spaced" : node.style.fontWeight === "bold" || +node.style.fontWeight >= 600 ? "bold" :
      node.style.fontStyle === "italic" ? "italic" : undefined);
    if (kind && end > start) spans.push({ kind, start, end });
  }
  for (const child of host.childNodes) walk(child);
  return { text, spans: normalizeSpans(spans) };
}

class Outlines {
  constructor(getWork) { this.getWork = getWork; this.sequence = 0; }
  request() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.run(), 210);
  }
  run() {
    if (this.busy) return;
    const work = this.getWork();
    if (!work) return;
    if (!this.worker) {
      this.worker = new Worker(new URL("./local/worker.js?v=20261128-page-joins", import.meta.url), { type: "module" });
      this.worker.onmessage = event => this.finish(event.data);
      this.worker.onerror = () => { this.worker?.terminate(); this.worker = null; this.finish({ error: true }); };
    }
    this.busy = work;
    this.worker.postMessage({ ...work.input, id: ++this.sequence });
  }
  finish(result) {
    const work = this.busy;
    this.busy = null;
    work?.done(result.uncovered ?? [], result.charH);
    this.request();
  }
  destroy() { clearTimeout(this.timer); this.worker?.terminate(); this.busy = null; }
}

export class ScanView {
  constructor(scroller, session, callbacks) {
    this.scroll = scroller;
    this.session = session;
    this.book = session.book;
    this.callbacks = callbacks;
    this.selection = new Set();
    this.active = null;
    this.element = h("div", { class: "v1-scans" });
    scroller.append(this.element);
    this.slots = this.book.pages.map((page, index) => this.makeSlot(page, index));
    this.element.append(...this.slots.map(slot => slot.element));
    this.rendered = new Set();
    this.observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        const index = Number(entry.target.dataset.page);
        if (entry.isIntersecting) this.mount(index);
        else this.unmount(index);
      }
    }, { root: scroller, rootMargin: "650px 0px" });
    this.slots.forEach(slot => this.observer.observe(slot.element));
    this.resize = new ResizeObserver(() => {
      const width = this.element.clientWidth;
      if (!width || width === this.width) return;
      this.width = width;
      this.slots.forEach((slot, index) => { slot.measured = null; this.size(slot, this.book.pages[index]); });
    });
    this.resize.observe(this.element);
    this.outlines = new Outlines(() => this.workerJob());
    this.onScroll = () => this.outlines.request();
    this.scroll.addEventListener("scroll", this.onScroll, { passive: true });
  }

  makeSlot(page, index) {
    const label = h("span", { class: "v1-page-label" });
    const process = button("", () => this.callbacks.process(index));
    const draw = button("＋ Region", () => {
      const slot = this.slots[index];
      this.mount(index);
      const drawing = !slot.view.drawing;
      slot.view.setDrawing(drawing);
      draw.setAttribute("aria-pressed", drawing);
    });
    const skip = button("", () => this.edit(b => this.book.pages[index].skip ? B.unskipPage(b, index) : B.skipPage(b, index)));
    const heading = h("div", { class: "v1-page-head" }, label, process, draw, skip);
    const element = h("section", { class: "v1-page", dataset: { page: index } }, heading);
    const slot = { heading, label, process, draw, skip, element, index };
    this.header(slot, page);
    this.size(slot, page);
    return slot;
  }

  header(slot, page) {
    slot.label.textContent = pageCaption(page);
    slot.process.textContent = page.regions ? "Process again" : "Process";
    slot.process.hidden = slot.draw.hidden = !!page.skip;
    slot.skip.textContent = page.skip ? "↺" : "×";
    slot.skip.setAttribute("aria-label", page.skip ? "Restore page" : "Skip page");
    slot.element.classList.toggle("skipped", !!page.skip);
  }

  dimensions(page) { return page.size ?? [2, 3]; }

  size(slot, page) {
    if (page.skip) { slot.element.style.minHeight = "0px"; return; }
    const [w, h] = this.dimensions(page);
    const available = this.width || this.element.clientWidth || 1000;
    const scan = available <= 700 ? available - 24 : (available - 40) / 2;
    const estimated = Math.min(1800, Math.max(220, scan * h / w)) + 49;
    slot.element.style.minHeight = `${slot.measured ?? estimated}px`;
  }

  mount(index) {
    const slot = this.slots[index], page = this.book.pages[index];
    if (slot.body || page.skip) return;
    this.rendered.add(index);
    const scan = h("div", { class: "imgpane v1-image" });
    const cards = h("div", { class: "v1-cards" });
    slot.checkBox = h("div", { class: "v1-review", hidden: true });
    slot.body = h("div", { class: "v1-page-body" }, scan, h("div", {}, slot.checkBox, cards));
    slot.cards = cards;
    slot.element.append(slot.body);
    slot.view = new PageView(scan, {
      hatchFurniture: true,
      onSelectRegion: (rid, options) => {
        this.select(rid ? addressOf(index, rid) : null, options?.add);
        if (rid && !options?.add) this.card(slot, rid)?.focus({ preventScroll: true });
      },
      onSelectOmitted: (i, options) => {
        const rid = slot.unknown[i].id;
        this.select(addressOf(index, rid), options?.add);
        if (!options?.add) this.card(slot, rid)?.focus({ preventScroll: true });
      },
      onSelectIgnored: (i, options) => {
        const rid = slot.ignored[i].id;
        this.select(addressOf(index, rid), options?.add);
        if (!options?.add) this.card(slot, rid)?.focus({ preventScroll: true });
      },
      onSelectMany: ({ regions, omitted }) => {
        this.selection.clear();
        for (const rid of [...regions, ...omitted.map(i => slot.unknown[i].id)]) this.selection.add(addressOf(index, rid));
        this.active = this.selection.values().next().value ?? null;
        this.refreshSelection();
      },
      onHoverRegion: (rid, active) => this.card(slot, rid)?.classList.toggle("hover", active),
      onBox: (rid, box) => {
        const address = addressOf(index, rid), next = orderedBox(fractions(box, slot.w, slot.h));
        if (next[0] < next[2] && next[1] < next[3]) this.edit(b => B.resizeRegion(b, address, next));
      },
      onDraw: box => {
        const id = B.newRegionId(this.book, index);
        slot.view.setDrawing(false);
        slot.draw.setAttribute("aria-pressed", false);
        this.edit(b => B.addRegion(b, index, UNCLASSIFIED, orderedBox(fractions(box, slot.w, slot.h))));
        this.select(addressOf(index, id));
      },
      onLeaveOut: item => {
        const id = item.regions?.[0] ?? slot.unknown[item.omitted?.[0]]?.id;
        if (id) this.edit(b => B.ignoreRegion(b, addressOf(index, id)));
      },
      onRestore: i => this.edit(b => B.restoreRegion(b, addressOf(index, slot.ignored[i].id))),
      onCheck: key => this.showCheck(index, key),
    });
    this.render(slot);
    const request = slot.request = new AbortController();
    const width = slot.scanWidth = Math.max(560, Math.min(920, Math.round(scan.clientWidth || 700)));
    this.session.scan(page, width, request.signal).then(blob => {
      if (request.signal.aborted) return;
      slot.url = URL.createObjectURL(blob);
      this.draw(slot);
      this.outlines.request();
    }).catch(error => { if (!request.signal.aborted) scan.append(h("p", { class: "v1-error" }, error.message)); });
    this.measure(slot);
  }

  measure(slot) {
    requestAnimationFrame(() => {
      if (!slot.body) return;
      const height = Math.round(slot.heading.getBoundingClientRect().height + slot.body.getBoundingClientRect().height) + 12;
      if (height > 100) {
        slot.measured = height;
        slot.element.style.minHeight = `${height}px`;
      }
    });
  }

  unmount(index) {
    const slot = this.slots[index];
    if (!slot.body) return;
    if (slot.body.contains(document.activeElement) && !this.book.pages[index].skip && !this.element.hidden && slot === this.focusedSlot) return;
    this.rendered.delete(index);
    slot.request?.abort();
    if (slot.url) URL.revokeObjectURL(slot.url);
    slot.view.destroy();
    slot.body.remove();
    slot.body = slot.view = slot.url = null;
  }

  destroy() {
    this.observer.disconnect();
    this.resize.disconnect();
    this.outlines.destroy();
    this.scroll.removeEventListener("scroll", this.onScroll);
    this.focusedSlot = null;
    [...this.rendered].forEach(i => this.unmount(i));
    this.element.remove();
  }

  update(book, typing = false) {
    const old = this.book;
    this.book = book;
    this.checkBook = null;
    for (const [index, page] of book.pages.entries()) {
      const slot = this.slots[index];
      if (page === old.pages[index]) continue;
      this.header(slot, page);
      if (slot.signature && slot.signature !== this.inkSignature(slot)) slot.ink = null;
      if (page.skip) this.unmount(index);
      else if (old.pages[index].skip) this.mount(index);
      this.size(slot, page);
    }
    for (const index of this.rendered) {
      const slot = this.slots[index];
      if (typing && slot.body.contains(document.activeElement)) { this.measure(slot); continue; }
      if (book.types !== old.types || book.containers !== old.containers || book.pages[index] !== old.pages[index]) this.render(slot);
      else this.badges(slot);
    }
    this.outlines.request();
  }

  card(slot, id) { return slot.cards?.querySelector(`[data-region="${CSS.escape(id)}"]`); }

  draw(slot) {
    const page = this.book.pages[slot.index];
    [slot.w, slot.h] = this.dimensions(page);
    if (!page.size) { slot.w = 1000; slot.h = 1500; }
    const box = region => pixel(region.box, slot.w, slot.h);
    const active = (page.regions ?? []).filter(region => !region.ignored && region.type !== "?");
    slot.unknown = (page.regions ?? []).filter(region => !region.ignored && region.type === "?");
    slot.ignored = (page.regions ?? []).filter(region => region.ignored);
    const colors = Object.fromEntries(this.typeNames().map((type, index) => [type, PALETTE[index % PALETTE.length]]));
    const furniture = new Set(active.filter(r => this.book.types[r.type]?.ignored).map(r => r.type));
    for (const type of furniture) colors[type] = "#777575";
    slot.view.show({ page: { width: slot.w, height: slot.h, regions: active.map(region => ({
      ...region, box: box(region), polygons: [boxRing(box(region))], lines: [],
    })) }, source: { omitted_regions: slot.unknown.map(r => ({ region: r.id, box: box(r), proposed_type: r.proposed, label: areaTitle(r, this.book.types) })),
      ignored_regions: slot.ignored.map(r => ({ region: r.id, box: box(r) })) } }, slot.url, colors, furniture);
    this.badges(slot);
  }

  render(slot) {
    const page = this.book.pages[slot.index];
    slot.cards.replaceChildren(...(page.regions ?? []).map(region => this.makeCard(slot, region)));
    // An open check moves with the cards it stands among.
    const open = slot.openCheck && !slot.checkBox.hidden && this.checks(slot.index).find(item => checkKey(item) === slot.openCheck);
    if (open) this.placeCheck(slot, open);
    if (!page.regions) slot.cards.append(h("p", { class: "v1-empty" }, "This page is awaiting regions."));
    else if (!page.regions.length) slot.cards.append(h("p", { class: "v1-empty" }, "This page has no regions."));
    this.draw(slot);
    this.selectionFor(slot);
    this.measure(slot);
  }

  typeNames() {
    if (this.namedTypes === this.book.types) return this.names;
    this.namedTypes = this.book.types;
    const printed = new Set(this.book.pages.flatMap(p => (p.regions ?? []).map(r => r.type)));
    return this.names = Object.keys(this.book.types).filter(type => !this.book.types[type].contains || this.book.types[type].heading ||
      this.book.reading?.finder_classes?.[type] || printed.has(type));
  }

  makeCard(slot, region) {
    const address = addressOf(slot.index, region.id), muted = nonText(this.book, region);
    const plan = picker(this.typeNames(), region.type, type => this.edit(b => B.retypeRegion(b, address, type)), "Region type");
    const badge = button("!", event => {
      event.stopPropagation();
      const first = this.checks(slot.index).find(item => item.address === address);
      if (first) this.showCheck(slot.index, checkKey(first));
    }, { class: "v1-mark", "aria-label": "Open check" });
    badge.hidden = true;
    const text = h("div", { class: "v1-lines" });
    const tools = h("div", { class: "v1-card-tools", hidden: true });
    const card = h("article", { class: `v1-card${muted ? " muted" : ""}`, tabindex: "0", dataset: { region: region.id, address },
      onclick: event => { if (!event.target.closest("button, select, input, .v1-structure, [contenteditable]")) this.select(address, event.shiftKey); },
      onpointerenter: () => slot.view?.highlightRegion(region.id, true),
      onpointerleave: () => slot.view?.highlightRegion(region.id, false) },
    h("div", { class: "v1-type" }, plan, badge, muted && region.ignored ? button("↺", () => this.edit(b => B.restoreRegion(b, address)), { "aria-label": "Restore region" }) : null),
    text, tools);
    if (muted) return card;
    if (!this.book.types[region.type]?.figure)
      for (const [index, line] of (region.lines ?? []).entries()) text.append(this.line(slot, address, index, line));
    if (!region.lines?.length && !this.book.types[region.type]?.figure)
      text.append(button("Add text", () => {
        this.edit(b => B.addLine(b, address, 0));
        this.card(slot, region.id)?.querySelector(".v1-line")?.focus();
      }, { class: "v1-link" }));
    return card;
  }

  line(slot, address, index, line) {
    const host = h("div", { class: "v1-line", contenteditable: "true", spellcheck: "false", role: "textbox",
      "aria-label": `Line ${index + 1}`, dataset: { line: index },
      onfocus: () => { this.focusedSlot = slot; if (this.active !== address) this.select(address); },
      onblur: () => { if (this.focusedSlot === slot) this.focusedSlot = null; this.badges(slot); },
      oninput: event => { if (!event.isComposing) this.commitLine(host, address, index); },
      oncompositionend: () => this.commitLine(host, address, index),
      onpaste: event => {
        event.preventDefault();
        document.execCommand("insertText", false, event.clipboardData.getData("text/plain").replace(/[\r\n]+/g, " "));
      },
      onkeydown: event => {
        if (event.key !== "Enter" || event.isComposing) return;
        event.preventDefault();
        this.edit(b => B.addLine(b, address, index + 1));
        this.card(slot, address.split("/")[1])?.querySelector(`[data-line="${index + 1}"]`)?.focus();
      },
    });
    host.innerHTML = lineHtml(line.text ?? "", line.spans ?? [], marker => markerNode(marker).outerHTML);
    return host;
  }

  commitLine(host, address, index) {
    const { text, spans } = readEditable(host);
    const line = B.regionAt(this.book, address)?.lines[index];
    if (!line || (line.text === text && JSON.stringify(normalizeSpans(line.spans ?? [])) === JSON.stringify(spans))) return;
    this.edit(b => B.setLine(b, address, index, text, spans), { typing: `${address}:${index}` });
  }

  edit(change, options) { this.callbacks.edit(change, options); }

  select(address, add = false) {
    if (!add) this.selection.clear();
    if (address) {
      if (add && this.selection.has(address)) this.selection.delete(address);
      else this.selection.add(address);
    }
    this.active = this.selection.has(address) ? address : (this.selection.values().next().value ?? null);
    this.refreshSelection();
  }

  refreshSelection() { for (const index of this.rendered) this.selectionFor(this.slots[index]); }

  selectionFor(slot) {
    if (!slot.view) return;
    const ids = [...this.selection].filter(a => B.pageIndexOf(this.book, a) === slot.index).map(a => a.split("/")[1]);
    const active = ids.length === 1 ? ids[0] : null;
    const visible = active && slot.view.regionEls?.[active] ? active : null;
    const omitted = slot.unknown.flatMap((r, i) => ids.includes(r.id) ? [i] : []);
    slot.view.select(visible, { regions: ids.length > 1 ? ids : [], omitted }, active && omitted.length ? omitted[0] : null);
    for (const card of slot.cards.children) {
      const chosen = ids.includes(card.dataset.region);
      card.classList.toggle("selected", chosen);
      const tools = card.querySelector(".v1-card-tools");
      if (!tools) continue;
      const show = this.active === card.dataset.address && ids.length === 1 && !nonText(this.book, B.regionAt(this.book, card.dataset.address));
      if (show && tools.hidden) tools.replaceChildren(this.tools(slot, card.dataset.address));
      tools.hidden = !show;
    }
  }

  tools(slot, address) {
    const region = B.regionAt(this.book, address), card = this.card(slot, region.id);
    const unit = B.regionAt(this.book, B.unitStartAddress(this.book, address));
    const format = (command, label, key) => button(label, () => {
      const host = document.activeElement;
      if (host?.classList.contains("v1-line") && card.contains(host)) {
        document.execCommand(command);
        this.commitLine(host, address, +host.dataset.line);
      }
    }, { onpointerdown: e => e.preventDefault(), "aria-label": key, title: key });
    const note = button("Note marker", () => {
      const host = document.activeElement;
      const selection = getSelection();
      if (!host?.classList.contains("v1-line") || !selection.rangeCount || !host.contains(selection.anchorNode)) return;
      const range = selection.getRangeAt(0).cloneRange();
      const sign = prompt("Printed note sign", "1")?.trim();
      if (!sign) return;
      range.collapse(false);
      const marker = markerNode({ marker: sign });
      range.insertNode(marker);
      range.setStartAfter(marker);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      this.commitLine(host, address, +host.dataset.line);
    }, { onpointerdown: e => e.preventDefault() });
    const path = region.in ?? [];
    const id = path.at(-1), shell = h("div", { class: "v1-structure", tabindex: "0", "aria-label": "Structure",
      onkeydown: event => {
        if (event.target !== shell || !id || event.key !== "Tab") return;
        event.preventDefault();
        this.edit(b => event.shiftKey ? B.sectionUp(b, id) : B.sectionDeeper(b, id));
        this.card(slot, region.id)?.querySelector(".v1-structure")?.focus();
      },
    });
    const fields = h("div", { class: "v1-fields" });
    const sectionTypes = Object.keys(this.book.types).filter(type => this.book.types[type].contains);
    const field = (name, value, change) => h("label", {}, name, h("input", { value: value ?? "", onchange: e => this.edit(b => change(b, e.target.value)) }));
    if (path.length) shell.append(h("div", { class: "v1-breadcrumb" }, path.map(key => {
      const c = this.book.containers[key];
      return [words(c.type), c.number, c.label].filter(Boolean).join(" ");
    }).join(" › ")));
    if (sectionTypes.length) {
      const types = picker(sectionTypes, this.book.containers?.[id]?.type ?? sectionTypes[0], () => {}, "Section type");
      shell.append(h("div", { class: "v1-tools" }, types, button("Start a section here", () => this.edit(b => B.startSection(b, address, types.value))),
        id ? button("Deeper", () => this.edit(b => B.sectionDeeper(b, id)), { title: "Tab on the structure row" }) : null,
        id ? button("Up", () => this.edit(b => B.sectionUp(b, id))) : null,
        id ? button("Not a section start", () => this.edit(b => B.notSectionStart(b, id))) : null));
    }
    if (id) fields.append(field("Section label", this.book.containers[id].label, (b, value) => B.setLabel(b, id, value)));
    fields.append(field("Unit number", unit.number, (b, value) => B.setNumber(b, address, value)),
      field("Unit label", unit.label, (b, value) => B.setLabel(b, address, value)),
      h("label", {}, h("input", { type: "checkbox", checked: !!region.continues, onchange: e => this.edit(b => B.setContinues(b, address, e.target.checked)) }),
        " Continues on the next page"));
    shell.append(fields);
    return h("div", {}, h("div", { class: "v1-tools v1-format" }, format("bold", "B", "Bold"),
      format("italic", "I", "Italic"), format("superscript", "x²", "Superscript"), format("subscript", "x₂", "Subscript"), note), shell);
  }

  checks(index) {
    if (this.checkBook !== this.book) {
      this.dataChecks = checksFor(this.book);
      this.checkBook = this.book;
    }
    const checks = [...this.dataChecks[index], ...(this.slots[index].ink ?? [])];
    if (checks.length < 2) return checks;
    const boxes = new Map((this.book.pages[index].regions ?? []).map(region => [addressOf(index, region.id), region.box]));
    const box = check => check.box ?? boxes.get(check.address);
    return checks.sort((a, b) => compareScanBoxes(box(a), box(b)));
  }

  badges(slot) {
    if (!slot.view) return;
    const checks = this.checks(slot.index);
    const regionChecks = new Map();
    for (const item of checks) if (item.address && !regionChecks.has(item.address)) regionChecks.set(item.address, item);
    slot.view.setChecks([...regionChecks.values(), ...checks.filter(item => !item.address)].map(item => ({
      key: checkKey(item), box: pixel(item.box ?? B.regionAt(this.book, item.address).box, slot.w, slot.h), title: item.title,
    })));
    for (const badge of slot.cards.querySelectorAll(".v1-mark"))
      badge.hidden = !regionChecks.has(badge.closest(".v1-card").dataset.address);
    if (!slot.openCheck) return;
    const open = checks.find(item => checkKey(item) === slot.openCheck);
    if (!open) {
      slot.openCheck = null;
      slot.checkBox.hidden = true;
    } else if (open.kind === "type" && slot.checkTypes !== this.book.types && !slot.checkBox.hidden) {
      this.renderCheck(slot, open);
    }
  }

  showCheck(index, key) {
    const slot = this.slots[index], check = this.checks(index).find(item => checkKey(item) === key);
    if (!check || !slot.view) return;
    if (check.address) this.select(check.address);
    slot.openCheck = key;
    this.currentCheck = { index, key };
    slot.checkBox.hidden = false;
    this.placeCheck(slot, check);
    this.renderCheck(slot, check);
    slot.checkBox.scrollIntoView({ block: "nearest" });
    this.measure(slot);
  }

  // An open check stands where it is about: in its region's card, under the type and above the text; a check with no
  // region (ink outside every box) among the cards, before the first region printed below it.
  placeCheck(slot, check) {
    const card = check.address && this.card(slot, check.address.split("/")[1]);
    if (card) { card.querySelector(".v1-type").after(slot.checkBox); return; }
    const top = check.box?.[1] ?? 0, regions = this.book.pages[slot.index].regions ?? [];
    const below = [...slot.cards.children].find(element => regions.find(region => region.id === element.dataset?.region)?.box[1] > top);
    slot.cards.insertBefore(slot.checkBox, below ?? null);
  }

  renderCheck(slot, check) {
    slot.checkTypes = this.book.types;
    slot.checkBox.replaceChildren(h("div", { class: "v1-review-heading" }, h("strong", {}, check.title),
      button("×", () => { slot.openCheck = null; slot.checkBox.hidden = true; }, { "aria-label": "Close check" })));
    const address = check.address, region = address && B.regionAt(this.book, address);
    const leaveOut = () => button("Leave out", () => this.edit(b => B.ignoreRegion(b, address)));
    const actions = h("div", { class: "v1-tools" });
    if (check.kind === "type") {
      const existing = existingProposedType(region, this.book.types);
      const proposed = region.proposed;
      if (existing) actions.append(button(`Use ${words(existing)}`, () =>
        this.edit(b => B.retypeRegion(b, address, existing))));
      else if (proposed && /^[a-z][a-z0-9_]*$/.test(proposed)) actions.append(button(`Add type ${words(proposed)}`, () =>
        this.edit(b => B.retypeRegion(B.addType(b, proposed), address, proposed))));
      const keep = picker(this.typeNames(), region.type, () => {}, "Keep as");
      actions.append(h("label", {}, "Keep as ", keep),
        button("Keep", () => this.edit(b => B.retypeRegion(b, address, keep.value))), leaveOut());
    } else if (check.kind === "unread") {
      if (region.note) slot.checkBox.append(h("p", {}, region.note));
      actions.append(button("Enter text", () => {
        const line = check.line ?? 0;
        if (check.line == null) this.edit(b => B.addLine(b, address, line));
        this.card(slot, region.id)?.querySelector(`[data-line="${line}"]`)?.focus();
      }), button("Keep empty", () => this.edit(b => check.line == null
        ? B.addLine(b, address, 0, { text: "" })
        : B.setLine(b, address, check.line, "", region.lines[check.line].spans))), leaveOut());
    } else if (check.kind === "uncertain") {
      if (region.note) slot.checkBox.append(h("p", {}, region.note));
      actions.append(button("Resolve", () => this.edit(b => B.clearUncertainty(b, address))));
    } else if (check.kind === "marker") {
      const options = this.book.pages.flatMap((p, i) => p.skip ? [] : (p.regions ?? []).filter(r => !nonText(this.book, r) &&
        this.book.types[r.type]?.flow === "notes").map(r => h("option", { value: addressOf(i, r.id) },
          `Page ${p.label ?? i + 1} · ${r.lines?.[0]?.text?.slice(0, 62) || r.id}`)));
      const target = h("select", { "aria-label": "Link to note" }, h("option", { value: "" }, "Choose a note"), ...options);
      actions.append(target, button("Link note", () => {
        if (!target.value) return;
        const line = region.lines[check.line];
        this.edit(b => ({ ...B.setLine(b, address, check.line, line.text,
          line.spans.map((span, i) => i === check.span ? { ...span, to: target.value } : span)), structure_edited: true }));
      }));
    } else if (check.kind === "note") {
      actions.append(button("Find an unlinked marker", () => this.nextCheck("marker")));
    } else {
      actions.append(button("Draw region around line", () => {
        this.edit(b => B.addRegion(b, slot.index, UNCLASSIFIED, orderedBox(check.box)));
      }));
    }
    if (check.kind === "unread" || (check.kind === "type" && !region.lines?.length))
      actions.append(button("Restore from saved work…", () => this.callbacks.process(slot.index, true)));
    slot.checkBox.append(actions);
  }

  workerJob() {
    const visible = this.scroll.getBoundingClientRect();
    const slot = [...this.rendered].map(i => this.slots[i]).find(s => {
      if (!s.url) return false;
      const rect = s.view.el.getBoundingClientRect(), page = this.book.pages[s.index];
      if (rect.bottom < visible.top || rect.top > visible.bottom || page.skip || !page.regions) return false;
      return this.inkSignature(s) !== s.signature;
    });
    if (!slot) return;
    const signature = slot.signature = this.inkSignature(slot), url = slot.url;
    const page = this.book.pages[slot.index], width = slot.scanWidth ?? Math.max(560, Math.min(920, Math.round(slot.view.el.clientWidth || 700)));
    const height = slot.view.img.naturalHeight || Math.round(width * slot.h / slot.w);
    const boxes = page.regions.map(region => pixel(region.box, width, height));
    return { input: { pid: slot.index, url, boxes, measureRules: true }, done: (uncovered, charH) => {
      if (slot.url !== url || signature !== this.inkSignature(slot)) return;
      slot.ink = uncovered.filter(item => hasTextInk(item.box, charH, width, height, item.stroke, item.vertical)).map(item => ({
        kind: "ink", id: item.line_id, title: "Ink outside the region boxes", box: fractions(item.box, width, height),
      }));
      this.badges(slot);
    } };
  }

  inkSignature(slot) { return JSON.stringify((this.book.pages[slot.index].regions ?? []).map(region => region.box)); }

  nextCheck(kind) {
    const start = this.currentCheck;
    const all = this.book.pages.flatMap((_, index) => this.checks(index).filter(item => !kind || item.kind === kind)
      .map(item => ({ index, item, key: checkKey(item) })));
    if (!all.length) { this.callbacks.message("No checks found."); return; }
    const startAt = start ? all.findIndex(item => item.index === start.index && item.key === start.key) : -1;
    const closest = this.currentPosition().index;
    const item = all[startAt >= 0 ? (startAt + 1) % all.length : Math.max(0, all.findIndex(item => item.index >= closest))];
    this.goTo(item.index, item.item.address);
    this.showCheck(item.index, item.key);
  }

  goTo(index, address, offset = 0) {
    this.mount(index);
    const slot = this.slots[index], card = address && this.card(slot, address.split("/")[1]);
    if (card) {
      this.select(address);
      card.scrollIntoView({ block: "center" });
    } else {
      slot.element.scrollIntoView({ block: "start" });
      this.scroll.scrollTop += offset;
    }
  }

  currentPosition() {
    const top = this.scroll.getBoundingClientRect().top;
    const slot = this.slots.find(s => s.element.getBoundingClientRect().bottom > top + 1) ?? this.slots.at(-1);
    if (!slot) return { index: 0, offset: 0 };
    const address = [...(slot.cards?.querySelectorAll(".v1-card:not(.muted)") ?? [])]
      .find(card => card.getBoundingClientRect().bottom > top + 30)?.dataset.address;
    return { index: slot.index, address, offset: Math.max(0, top - slot.element.getBoundingClientRect().top) };
  }

  key(event) {
    const field = event.target.closest("input, textarea, select, [contenteditable]");
    if (!field && /^[1-9]$/.test(event.key) && this.selection.size) {
      const type = this.typeNames()[+event.key - 1];
      if (type) this.edit(book => [...this.selection].reduce((b, address) => B.retypeRegion(b, address, type), book));
      return true;
    }
    if (!field && event.key === "Delete" && this.selection.size) {
      this.edit(book => [...this.selection].reduce((b, address) => B.ignoreRegion(b, address), book));
      return true;
    }
    const card = event.target.closest(".v1-card");
    if (event.key !== "Tab" || !card || !(event.target === card || event.target.matches(".v1-line"))) return false;
    const all = this.book.pages.flatMap((page, index) => page.skip ? [] : (page.regions ?? []).map(r => addressOf(index, r.id)));
    const at = all.indexOf(card.dataset.address), address = all[at + (event.shiftKey ? -1 : 1)];
    if (!address) return false;
    const index = B.pageIndexOf(this.book, address);
    this.goTo(index, address);
    this.card(this.slots[index], address.split("/")[1])?.focus();
    return true;
  }
}
