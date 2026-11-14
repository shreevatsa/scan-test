import { suggestionButton } from "./review-view.js?v=20261113-moveon-1";
// The text side of the page editor: the page's units in reading order, each region's line pieces as editable
// lines (one region is one editing host, so a selection can run across its lines), and an inspector for the
// selected unit, region or note marker. Text typed into a line is read back from the DOM into text and spans; every
// other change goes through ops.js on a copy of the document (app.edit), which keeps the previous one for undo.

import { cp, cpLength, covered, removeKind, normalizeSpans } from "./inline.js";
import { lineHtml, esc, h, bbox, cropInto } from "./render.js";
import * as ops from "./ops.js?v=20261113-moveon-1";
import { editorFocus, applyUnitAction, unitRegionIds } from "./editing.js?v=20261113-moveon-1";
import { orderedRegions, textFlags } from "./flags.js?v=20261113-moveon-1";

const END_CYCLE = { space: "hyphen", hyphen: "join", join: "line", line: "space" };
const END_NAMES = { space: "a space", hyphen: "a hyphen to drop (the word goes on)", join: "nothing (the word goes on)", line: "a line break" };
const localRegion = ref => ref.split("#")[1];
const closest = (node, sel) => (node && (node.nodeType === 1 ? node : node.parentElement))?.closest(sel) || null;

// ---------------------------------------------------------------- DOM <-> text and spans

function kindsOf(el, inlineKinds) {
  const tag = el.tagName.toLowerCase(), k = [];
  if (tag === "b" || tag === "strong") k.push("bold");
  if (tag === "i" || tag === "em") k.push("italic");
  if (tag === "u") k.push("underline");
  if (tag === "sup" && !el.classList.contains("mk")) k.push("superscript");
  if (tag === "sub") k.push("subscript");
  if (el.classList.contains("sc")) k.push("small_caps");
  if (el.classList.contains("spc")) k.push("spaced");
  if (el.dataset.kind && inlineKinds.has(el.dataset.kind)) k.push(el.dataset.kind);
  const st = el.style;
  if (st && (st.fontWeight === "bold" || +st.fontWeight >= 600)) k.push("bold");
  if (st && st.fontStyle === "italic") k.push("italic");
  return k;
}

// A rendered line piece back into {text, spans}.
export function readLine(lp, inlineKinds = new Set()) {
  const chars = [], kindsAt = [], spans = [];
  const walk = (node, active) => {
    for (const ch of node.childNodes) {
      if (ch.nodeType === 3) {
        for (const c of Array.from(ch.data.replace(/ /g, " "))) { chars.push(c); kindsAt.push(active); }
      } else if (ch.nodeType === 1) {
        if (ch.classList.contains("mk")) {
          if (ch.dataset.id) spans.push({ start: chars.length, end: chars.length, kind: "note_marker", id: ch.dataset.id, marker: ch.dataset.sign });
          continue;
        }
        if (ch.tagName === "BR") continue;
        walk(ch, [...active, ...kindsOf(ch, inlineKinds)]);
      }
    }
  };
  walk(lp, []);
  for (const k of new Set(kindsAt.flat())) {
    let s = null;
    for (let i = 0; i <= chars.length; i++) {
      const has = i < chars.length && kindsAt[i].includes(k);
      if (has && s === null) s = i;
      if (!has && s !== null) { spans.push({ start: s, end: i, kind: k }); s = null; }
    }
  }
  return { text: chars.join(""), spans: normalizeSpans(spans) };
}

// Code-point offset of a DOM point inside a line piece (markers have no text, so they count zero).
function pointOffset(lp, node, offset) {
  const r = document.createRange();
  r.setStart(lp, 0);
  try { r.setEnd(node, offset); } catch { return 0; }
  return cpLength(r.toString());
}

// The DOM point at a code-point offset of a line piece.
function pointAt(lp, off) {
  const walker = document.createTreeWalker(lp, NodeFilter.SHOW_TEXT);
  let acc = 0, node, last = null;
  while ((node = walker.nextNode())) {
    const n = cpLength(node.data);
    if (acc + n >= off) return [node, Array.from(node.data).slice(0, off - acc).join("").length];
    acc += n; last = node;
  }
  return last ? [last, last.data.length] : [lp, lp.childNodes.length];
}

function sameSpans(a, b) { return JSON.stringify(normalizeSpans(a || [])) === JSON.stringify(normalizeSpans(b || [])); }

// ---------------------------------------------------------------- the text panel

export class TextPanel {
  constructor(el, app) {
    this.el = el;
    this.app = app;
    this.lastSel = null;
    this.focus = editorFocus(app.stage);
    this.onSelection = () => {
      const info = this.selectionInfo();
      if (info) this.lastSel = info;
    };
    document.addEventListener("selectionchange", this.onSelection);
  }

  destroy() { document.removeEventListener("selectionchange", this.onSelection); }
  get textEditable() { return this.focus !== "units"; }
  get unitsEditable() { return this.focus !== "text"; }

  get inlineKinds() { return new Set(Object.keys(this.app.tl.inline || {})); }

  render() {
    const { doc } = this.app;
    const el = this.el;
    const scroll = el.scrollTop;
    el.replaceChildren();
    this.units = Object.fromEntries(doc.units.map(u => [u.id, u]));
    this.regions = Object.fromEntries(doc.page.regions.map(r => [r.id, r]));
    this.drawn = new Set();
    const problems = doc.source?.problems || [];
    if (problems.length) el.append(h("div", { class: "problems model" }, h("b", {}, "The model's notes on this page"), ...problems.map(p => h("div", {}, "• " + p))));
    if (this.focus === "text") {
      for (const region of orderedRegions(doc, this.app.tl)) el.append(this.regionBlock(region.id, null, 0));
      el.scrollTop = scroll; this.markSelection(); return;
    }
    for (const [flow, tops] of Object.entries(doc.flows)) {
      const sec = h("section", { class: "flow" }, h("div", { class: "flow-name" }, `flow ${flow}`));
      tops.forEach((uid, i) => sec.append(this.unitBlock(uid, { flow }, i)));
      if (!tops.length) sec.append(h("div", { class: "empty" }, "(nothing on this page)"));
      el.append(sec);
    }
    const loose = doc.units.filter(u => !this.drawn.has(u.id));
    if (loose.length) {
      const sec = h("section", { class: "flow" }, h("div", { class: "flow-name bad" }, "units in no flow"));
      for (const u of loose) if (!this.drawn.has(u.id)) sec.append(this.unitBlock(u.id, null, 0));
      el.append(sec);
    }
    const owned = new Set(doc.units.flatMap(u => u.children.filter(c => c.region).map(c => localRegion(c.region))));
    const furn = doc.page.regions.filter(r => !owned.has(r.id));
    if (furn.length) {
      const sec = h("section", { class: "flow furniture" }, h("div", { class: "flow-name" }, "page furniture and unowned regions"));
      for (const r of furn) sec.append(this.regionBlock(r.id, null, 0));
      el.append(sec);
    }
    const omitted = doc.source?.omitted_regions || [];
    if (omitted.length) el.append(h("section", { class: "flow omitted" }, h("div", { class: "flow-name" }, "left out by the transcription step (type other)"),
      ...omitted.map(o => h("div", { class: "omit" }, `${o.region}: ${(o.text || []).join(" / ")}`))));
    el.scrollTop = scroll;
    this.markSelection();
  }

  unitBlock(uid, container, index) {
    const app = this.app, u = this.units[uid];
    if (!u) return h("div", { class: "unit bad" }, `?? ${uid}`);
    if (this.drawn.has(uid)) return h("div", { class: "unit bad" }, `${uid} again (not a tree)`);
    this.drawn.add(uid);
    const open = end => {
      const on = !!(u.open || {})[end];
      return h("span", {
        class: "open" + (on ? " on" : ""), title: end === "start" ? (on ? "begun on an earlier page (click to change)" : "click if this unit began on an earlier page")
          : (on ? "goes on on a later page (click to change)" : "click if this unit goes on on a later page"),
        onclick: e => { e.stopPropagation(); app.edit(d => ops.setOpen(d, uid, end, !on)); },
      }, end === "start" ? "↑" : "↓");
    };
    const mover = container ? this.movers(container, index) : null;
    const head = h("div", { class: "uhead", onclick: () => app.select({ unit: uid }) }, open("start"),
      h("span", { class: "utype" }, u.type), u.number ? h("span", { class: "unum" }, u.number) : null,
      u.label ? h("span", { class: "ulabel" }, `“${u.label}”`) : null, open("end"), mover);
    const block = h("div", { class: "unit", dataset: { uid } }, head);
    u.children.forEach((c, k) => {
      if (k > 0) block.append(h("div", { class: "split", title: "split the unit here", onclick: () => app.edit(d => ops.splitUnit(d, uid, k)) }, "✂ split here"));
      block.append(c.unit ? this.unitBlock(c.unit, { unit: uid }, k) : this.regionBlock(localRegion(c.region), { unit: uid }, k));
    });
    return block;
  }

  movers(container, index) {
    const app = this.app;
    return h("span", { class: "movers" },
      h("button", { class: "mini", title: "move up", onclick: e => { e.stopPropagation(); app.edit(d => ops.moveChild(d, container, index, -1)); } }, "▲"),
      h("button", { class: "mini", title: "move down", onclick: e => { e.stopPropagation(); app.edit(d => ops.moveChild(d, container, index, +1)); } }, "▼"));
  }

  regionBlock(rid, container, index) {
    const app = this.app, r = this.regions[rid];
    if (!r) return h("div", { class: "region bad" }, `?? ${rid}`);
    const col = app.colors[r.type] || "#888";
    const block = h("div", { class: "region", dataset: { rid }, style: `border-left-color:${col}` });
    block.append(h("div", { class: "rhead", onclick: () => app.select({ region: rid }) },
      h("span", { class: "rid" }, rid), h("span", { class: "rtype", style: `color:${col}` }, r.type),
      container ? this.movers(container, index) : null));
    if (app.tl.types[r.type]?.region === "figure" && !(r.lines || []).length) {
      const owner = ops.ownerOf(app.doc, rid);
      const pic = h("div", { class: "figpic", title: "the figure on the page" });
      app.book.imageUrl(app.doc.page.id).then(url => cropInto(pic, url, app.doc.page, r.box || bbox(r.polygons), 260, 160));
      block.append(pic, h("div", { class: "hint" }, owner?.label ? `Label: ${owner.label}` : "A figure: no text. Select its unit to give it a label (what it shows)."));
      return block;
    }
    const lang = app.tl.types[r.type]?.lang;
    const host = h("div", { class: `rtext${this.unitsEditable ? " line-joins" : ""}`, contenteditable: this.textEditable ? "true" : null, spellcheck: "false", dataset: { rid }, lang: lang || null,
      "aria-label": `${rid} transcription${this.textEditable ? "" : ", read only"}` });
    this.fillHost(host, r);
    this.wire(host);
    block.append(host);
    const kept = r.source?.transcription?.lines;
    if (kept && (r.lines || []).every(L => !L.text)) {
      block.append(h("div", { class: "kept" }, h("div", {}, `The transcription has ${kept.length} lines for ${(r.lines || []).length} line pieces, so it was kept aside:`),
        h("div", { class: "kept-text" }, kept.map(k => k.text).join(" / ")),
        this.textEditable ? h("button", { onclick: () => app.edit(d => ops.useKeptText(d, rid)) }, "Put it on the line pieces") : null));
    }
    return block;
  }

  fillHost(host, r) {
    const app = this.app;
    const linked = new Set((app.doc.relations || []).filter(x => x.from.anchor).map(x => x.from.anchor.split("#")[1]));
    host.replaceChildren();
    (r.lines || []).forEach((L, i) => {
      const html = lineHtml(L.text || "", L.spans || [], sp =>
        `<sup class="mk${linked.has(sp.id) ? " linked" : ""}" contenteditable="false" data-id="${esc(sp.id)}" data-sign="${esc(sp.marker)}" title="note marker ${esc(sp.marker)}${linked.has(sp.id) ? "" : " (not linked to a note)"}"></sup>`);
      const lp = h("div", { class: "lp" + (L.text === undefined ? " notext" : "") + (L.polygons ? "" : " nooutline"), dataset: { i: String(i), end: L.end || "space" }, html,
        title: L.polygons ? null : "this line piece has no outline on the page: its line is outside the region's box now" });
      host.append(lp);
    });
    if (!(r.lines || []).length) host.append(h("div", { class: "lp notext", dataset: { i: "0", end: "space" } }));
  }

  rerenderRegion(rid) {
    const host = this.el.querySelector(`.rtext[data-rid="${CSS.escape(rid)}"]`);
    const r = this.app.doc.page.regions.find(x => x.id === rid);
    if (host && r) this.fillHost(host, r);
  }

  wire(host) {
    const app = this.app, rid = host.dataset.rid;
    host.addEventListener("mousedown", e => {
      const mk = e.target.closest(".mk");
      if (mk) { e.preventDefault(); app.select({ marker: mk.dataset.id }); return; }
      const lp = e.target.closest(".lp");
      if (this.unitsEditable && lp && e.offsetX > lp.clientWidth - 24 && e.target === lp) {
        e.preventDefault();
        const i = +lp.dataset.i;
        app.edit(d => ops.setLineEnd(d, rid, i, END_CYCLE[lp.dataset.end || "space"]), { after: () => this.placeCaret(rid, i, Infinity) });
      }
    });
    host.addEventListener("focusin", () => { if (app.selection.region !== rid) app.select({ region: rid }, { keepFocus: true }); });
    host.addEventListener("mouseover", e => { const lp = e.target.closest(".lp"); if (lp) app.pageView.highlightLine(`${rid}:${lp.dataset.i}`, true); });
    host.addEventListener("mouseout", e => { const lp = e.target.closest(".lp"); if (lp) app.pageView.highlightLine(`${rid}:${lp.dataset.i}`, false); });
    if (!this.textEditable) return;
    host.addEventListener("drop", e => e.preventDefault());
    host.addEventListener("keydown", e => {
      const mod = e.metaKey || e.ctrlKey;
      if (e.key === "Enter") { e.preventDefault(); this.moveLine(rid, +1); }
      else if (mod && !e.shiftKey && e.key.toLowerCase() === "b") { e.preventDefault(); this.format("bold"); }
      else if (mod && !e.shiftKey && e.key.toLowerCase() === "i") { e.preventDefault(); this.format("italic"); }
      else if (mod && !e.shiftKey && e.key.toLowerCase() === "u") { e.preventDefault(); this.format("underline"); }
    });
    host.addEventListener("beforeinput", e => {
      const t = e.inputType;
      if (t === "historyUndo" || t === "historyRedo" || t.startsWith("format") || t === "insertParagraph" || t === "insertLineBreak") {
        e.preventDefault();
        return;
      }
      const info = this.selectionInfo();
      if (!info || info.rid !== rid) return;
      const [si, so] = info.start, [ei, eo] = info.end;
      const len = i => cpLength(app.doc.page.regions.find(x => x.id === rid).lines[i]?.text);
      if (info.collapsed && t === "deleteContentBackward" && so === 0) { e.preventDefault(); return; }
      if (info.collapsed && t === "deleteContentForward" && so >= len(si)) { e.preventDefault(); return; }
      const pasted = t === "insertFromPaste" || t === "insertFromDrop";
      if (si !== ei || pasted || t === "insertReplacementText") {
        e.preventDefault();
        const text = pasted || t === "insertReplacementText" ? (e.dataTransfer?.getData("text/plain") ?? e.data ?? "") : (t.startsWith("insert") ? e.data || "" : "");
        this.replaceSelection(info, text);
        return;
      }
      app.beforeTyping(`${rid}:${si}`);
    });
    host.addEventListener("input", () => this.readBack(host));
  }

  // After the browser has changed a host's text, take the changed line pieces into the document.
  readBack(host) {
    if (!this.textEditable) return;
    const app = this.app, rid = host.dataset.rid;
    const r = app.doc.page.regions.find(x => x.id === rid);
    const lps = [...host.querySelectorAll(":scope > .lp")];
    if (lps.length !== Math.max(1, (r.lines || []).length)) { app.refresh(); return; }
    const kinds = this.inlineKinds;
    lps.forEach((lp, i) => {
      const L = (r.lines || [])[i];
      if (!L) return;
      const { text, spans } = readLine(lp, kinds);
      if ((L.text ?? "") !== text || !sameSpans(L.spans, spans)) app.typed(rid, i, text, spans);
      lp.classList.toggle("notext", false);
    });
  }

  replaceSelection(info, text) {
    const { rid } = info, [si, so] = info.start, [ei, eo] = info.end;
    this.app.edit(d => {
      const r = ops.regionById(d, rid);
      const len = i => cpLength(r.lines[i].text);
      if (si === ei) ops.replaceInLine(d, rid, si, so, eo, text);
      else {
        ops.replaceInLine(d, rid, ei, 0, eo, "");
        for (let i = ei - 1; i > si; i--) ops.replaceInLine(d, rid, i, 0, len(i), "");
        ops.replaceInLine(d, rid, si, so, len(si), text);
      }
    }, { after: () => this.placeCaret(rid, si, so + cpLength(text)) });
  }

  // {rid, start: [line index, offset], end: [...], collapsed} for the selection, if it lies in one region's host.
  selectionInfo() {
    const sel = document.getSelection();
    if (!sel || !sel.rangeCount) return null;
    const range = sel.getRangeAt(0);
    const host = closest(range.startContainer, ".rtext");
    if (!host || !this.el.contains(host) || !host.contains(range.endContainer)) return null;
    const lps = [...host.querySelectorAll(":scope > .lp")];
    const point = (node, offset) => {
      if (node === host) {
        if (offset < lps.length) return [offset, 0];
        const last = lps.length - 1;
        return [last, cpLength(lps[last]?.textContent)];
      }
      const lp = closest(node, ".lp");
      if (!lp) return [0, 0];
      return [+lp.dataset.i, pointOffset(lp, node, offset)];
    };
    return { rid: host.dataset.rid, start: point(range.startContainer, range.startOffset), end: point(range.endContainer, range.endOffset), collapsed: range.collapsed };
  }

  placeCaret(rid, i, off, endI = null, endOff = null) {
    const host = this.el.querySelector(`.rtext[data-rid="${CSS.escape(rid)}"]`);
    if (!host) return;
    const lps = host.querySelectorAll(":scope > .lp");
    const clamp = k => Math.max(0, Math.min(k, lps.length - 1));
    const lp = lps[clamp(i)];
    if (!lp) return;
    host.focus({ preventScroll: true });
    const r = document.createRange();
    const [n, o] = pointAt(lp, off === Infinity ? 1e9 : off);
    r.setStart(n, o);
    if (endI !== null) { const [n2, o2] = pointAt(lps[clamp(endI)], endOff); r.setEnd(n2, o2); } else r.collapse(true);
    const sel = document.getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
  }

  moveLine(rid, delta) {
    const info = this.selectionInfo();
    const hosts = [...this.el.querySelectorAll(".rtext")];
    let k = hosts.findIndex(x => x.dataset.rid === rid), i = (info ? info.end[0] : 0) + delta;
    const n = hosts[k].querySelectorAll(":scope > .lp").length;
    if (i >= n && k + 1 < hosts.length) { k += 1; i = 0; }
    if (i < 0 && k > 0) { k -= 1; i = hosts[k].querySelectorAll(":scope > .lp").length - 1; }
    this.placeCaret(hosts[k].dataset.rid, i, 0);
  }

  // Toggle a formatting kind over the selection (on every line piece it touches).
  format(kind) {
    if (!this.textEditable) return;
    const info = this.selectionInfo() || this.lastSel;
    if (!info || info.collapsed) { this.app.toast("Select some text first."); return; }
    const { rid } = info, [si, so] = info.start, [ei, eo] = info.end;
    this.app.edit(d => {
      const r = ops.regionById(d, rid);
      const ranges = [];
      for (let i = si; i <= ei; i++) ranges.push([i, i === si ? so : 0, i === ei ? eo : cpLength(r.lines[i].text)]);
      const all = ranges.every(([i, a, b]) => b <= a || covered(r.lines[i].spans || [], kind, a, b));
      for (const [i, a, b] of ranges) {
        if (b <= a) continue;
        const L = r.lines[i], sp = L.spans || [];
        ops.setLine(d, rid, i, L.text || "", all ? removeKind(sp, kind, a, b) : normalizeSpans([...sp, { start: a, end: b, kind }]));
      }
    }, { after: () => this.placeCaret(rid, si, so, ei, eo) });
  }

  markSelection() {
    const s = this.app.selection;
    this.el.querySelectorAll(".sel").forEach(x => x.classList.remove("sel"));
    let target = null;
    if (s.unit) target = this.el.querySelector(`.unit[data-uid="${CSS.escape(s.unit)}"]`);
    if (s.region) target = this.el.querySelector(`.region[data-rid="${CSS.escape(s.region)}"]`);
    if (s.marker) target = this.el.querySelector(`.mk[data-id="${CSS.escape(s.marker)}"]`);
    if (target) target.classList.add("sel");
    return target;
  }
}

// ---------------------------------------------------------------- the inspector

const field = (label, input) => h("label", { class: "field" }, h("span", {}, label), input);

function select(options, value, onchange, attrs = {}) {
  const s = h("select", { ...attrs, onchange: e => onchange(e.target.value) });
  for (const o of options) {
    const [v, text] = Array.isArray(o) ? o : [o, o];
    s.append(h("option", { value: v, selected: v === value ? true : null }, text));
  }
  return s;
}

function unitName(u) {
  return [u.type, u.number, u.label ? `“${u.label}”` : null].filter(Boolean).join(" ") + ` (${u.id})`;
}

export function renderInspector(el, app) {
  const { doc, tl, selection: s } = app;
  el.replaceChildren();
  if (!app.readPanel) el.append(suggestionButton(app, doc.page.id));
  if (s.marker) return markerInspector(el, app, s.marker);
  if (app.stage === "text") return textInspector(el, app);
  if (s.unit && doc.units.some(u => u.id === s.unit)) {
    unitInspector(el, app, s.unit);
    if (app.stage === "read") for (const rid of unitRegionIds(doc, s.unit)) regionLineJoins(el, app, rid);
    return;
  }
  if (s.region && doc.page.regions.some(r => r.id === s.region)) {
    if (app.stage === "read") {
      const owner = ops.ownerOf(doc, s.region);
      if (owner) unitInspector(el, app, owner.id);
      regionLineJoins(el, app, s.region);
      return;
    }
    return regionInspector(el, app, s.region);
  }
  if (app.stage === "read") { el.append(h("p", { class: "hint" }, "Select a unit to change its grouping, or a region to review its line joins. Its transcription is read only.")); return; }
  el.append(h("div", { class: "hint" },
    "Click a region on the page or its heading in the text to select it; click a unit's heading to select the unit. ",
    "Type to correct the text; select text and use the formatting buttons (or ⌘B, ⌘I); click a line's right edge to change how it joins the next line. ",
    "Changes are checked as you go and saved when the page passes the checks."));
  const loose = (doc.relations || []).map((r, i) => [r, i]).filter(([r]) => r.type === "note" && !r.from.anchor && !r.from.unit);
  if (loose.length) el.append(looseRelations(app, loose));
}

function textInspector(el, app) {
  const { doc, tl } = app, rid = app.selection.region;
  const region = doc.page.regions.find(region => region.id === rid);
  el.append(h("p", { class: "hint" }, "Correct each line’s transcription and formatting. Select a printed note marker to change its sign."),
    field("Printed page label", h("input", { value: doc.page.label || "", "aria-label": "Printed page label", onchange: event => app.edit(next => {
      if (event.target.value.trim()) next.page.label = event.target.value.trim(); else delete next.page.label;
    }) })));
  if (region) el.append(h("h3", {}, `${region.id} · ${region.type}`), h("p", {}, tl.types[region.type]?.description || ""));
  for (const flag of textFlags(doc, tl).filter(flag => !flag.region || !rid || flag.region === rid)) el.append(h("p", { class: "warn" }, flag.message));
  el.append(h("button", { onclick: () => {
    app.pendingStageSelection = { stage: "text", ids: [doc.page.id], reprocess: true }; app.setMode("text");
  } }, "Review re-transcription of this page"));
}

export function regionLineJoins(el, app, rid) {
  const region = ops.regionById(app.doc, rid);
  const rows = (region.lines || []).map((line, index) => h("div", { class: "line-join-row" },
    h("span", {}, line.text || "Text pending"),
    select(Object.entries(END_NAMES), line.end || "space", end => app.edit(doc => ops.setLineEnd(doc, rid, index, end)),
      { "aria-label": `Join after ${rid} line ${index + 1}` })));
  if (app.readPanel) {
    const key = `${app.doc.page.id}#${rid}`;
    el.append(h("details", { open: app.lineJoinsOpen.has(key), ontoggle: event => {
      if (event.target.open) app.lineJoinsOpen.add(key); else app.lineJoinsOpen.delete(key);
    } }, h("summary", {}, `Line joins · ${rid}`), ...rows));
  } else el.append(h("h4", {}, `Line joins · ${rid}`), ...rows);
}

function looseRelations(app, loose) {
  const { doc } = app;
  const markers = doc.page.regions.flatMap(r => (r.lines || []).flatMap(L => (L.spans || []).filter(x => x.kind === "note_marker").map(x => [x.id, `${x.marker} in ${r.id} (${x.id})`])));
  return h("div", { class: "box warn" }, h("b", {}, "Note relations without a marker"),
    ...loose.map(([r, i]) => h("div", { class: "row" },
      `${r.from.region || "?"}${r.from.line !== undefined ? ` line ${r.from.line}` : ""}${r.from.marker ? ` marker ${r.from.marker}` : ""} → ${r.to.unit}: `,
      select([["", "choose its marker…"], ...markers], "", v => v && app.edit(d => ops.anchorRelation(d, i, v))),
      h("button", { class: "mini", onclick: () => app.edit(d => ops.removeRelation(d, i)) }, "remove"))));
}

export function unitInspector(el, app, uid) {
  const { doc, tl } = app;
  const local = doc.units.find(x => x.id === uid), u = app.displayUnit ? { ...local, ...app.displayUnit(uid) } : local;
  const place = ops.placeOf(doc, uid);
  const t = tl.types[u.type] || {};
  const change = (action, value) => app.unitAction ? app.unitAction(uid, action, value) : app.edit(doc => { app.selection = applyUnitAction(doc, tl, uid, action, value); });
  const text = (k, v) => h("input", { value: v || "", "aria-label": `Unit ${k}`, onchange: e => change(k, e.target.value) });
  el.append(h("div", { class: "ititle" }, "Unit ", h("b", {}, unitName(u))),
    h("div", { class: "desc" }, t.description || ""),
    h("div", { class: "fields" },
      field("type", select(ops.retypeChoices(doc, tl, uid).filter(type => app.stage !== "read" || (tl.types[type].region === "figure") === (t.region === "figure")), u.type, v => change("type", v), { "aria-label": "Unit type" })),
      field("number", text("number", u.number)), field("label", text("label", u.label)),
      field("begun on an earlier page", h("input", { type: "checkbox", checked: (u.open || {}).start ? true : null, onchange: e => change("start", e.target.checked) })),
      field("goes on on a later page", h("input", { type: "checkbox", checked: (u.open || {}).end ? true : null, onchange: e => change("end", e.target.checked) }))));
  // How the unit is printed (schema 0.3 style): presentation only, used by the reader's "as printed" view and exports.
  const st = u.style || {};
  const nextSib = place && place.index + 1 < place.list.length ? place.list[place.index + 1] : null;
  const nextUid = nextSib && (typeof nextSib === "string" ? nextSib : nextSib.unit);
  const besideNext = !!st.row && !!nextUid && doc.units.find(x => x.id === nextUid)?.style?.row === st.row;
  if (!app.readPanel) el.append(h("div", { class: "fields printed" },
    field("printed: align", select([["", "as its type"], "left", "center", "right", "justify"], st.align || "", v => app.edit(d => ops.setUnitStyle(d, uid, "align", v)))),
    field("size (pt)", h("input", { type: "number", step: "0.5", min: "1", value: st.size_pt ?? "", style: "width:5em",
      onchange: e => app.edit(d => ops.setUnitStyle(d, uid, "size_pt", e.target.value === "" ? null : +e.target.value)) })),
    field("side by side with the next unit", h("input", { type: "checkbox", checked: besideNext ? true : null, disabled: nextUid ? null : true,
      onchange: e => app.edit(d => ops.setRowWithNext(d, uid, e.target.checked)) }))));
  const wrapTypes = ops.containersFor(tl, u.type);
  if (app.stage === "read" && u.children.length > 1) {
    const split = select(u.children.slice(1).map((child, index) => [String(index + 1), `Before ${child.unit || child.region}`]), "1", () => {}, { "aria-label": "Split before child" });
    el.append(h("div", { class: "actions" }, split, h("button", { onclick: () => change("split", Number(split.value)) }, "Split unit")));
  }
  // Page furniture (an ornament, a running header): the unit's regions leave the text.
  const furnitureTypes = u.children.every(c => c.region) ? Object.entries(tl.types).filter(([, type]) => type.role === "furniture" && type.region && (app.stage !== "read" || (type.region === "figure") === (t.region === "figure"))).map(([n]) => n) : [];
  el.append(h("div", { class: "actions" },
    h("button", { onclick: () => app.joinNext ? app.joinNext(uid) : app.edit(d => ops.joinWithNext(d, uid)) }, "Join with the next unit"),
    wrapTypes.length ? select([["", "Put inside a new…"], ...wrapTypes], "", v => v && change("wrap", v), { "aria-label": "Wrap in a container" }) : null,
    furnitureTypes.length ? select([["", "Make it page furniture…"], ...furnitureTypes], "", v => v && change("furniture", v),
      { title: "take it out of the text: its regions stay on the page as furniture (as an ornament or a running header)" }) : null,
    u.children.every(c => c.unit) ? h("button", { onclick: () => change("unwrap") }, "Unwrap (keep its contents)") : null,
    app.stage !== "read" ? h("button", { class: "danger", onclick: () => app.edit(d => { ops.deleteUnit(d, uid); app.selection = {}; }) }, "Delete with its regions") : null));
  // Relations from and to this unit.
  const rels = (doc.relations || []).map((r, i) => [r, i]).filter(([r]) => r.from.unit === uid || r.to.unit === uid ||
    (r.from.anchor && u.children.some(c => c.region && regionHasAnchor(doc, localRegion(c.region), r.from.anchor))));
  const others = doc.units.filter(x => x.id !== uid);
  const relTypes = Object.keys(tl.relations || {});
  const box = h("div", { class: "box" }, h("b", {}, "Relations"),
    ...rels.map(([r, i]) => h("div", { class: "row" }, `${r.type}: ${r.from.unit || r.from.anchor || r.from.region} → ${r.to.unit}`,
      h("button", { class: "mini", onclick: () => app.edit(d => ops.removeRelation(d, i)) }, "remove"))));
  if (relTypes.length && others.length) {
    let relType = relTypes[0], target = others[0].id;
    box.append(h("div", { class: "row" }, "add: ", select(relTypes, relType, v => (relType = v)), " → ",
      select(others.map(x => [x.id, unitName(x)]), target, v => (target = v)),
      h("button", { class: "mini", onclick: () => app.edit(d => ops.addRelation(d, tl, relType, uid, target)) }, "add")));
  }
  el.append(box);
  if (place) el.append(h("div", { class: "meta" }, place.flow ? `At the top of flow ${place.flow}.` : `Inside ${unitName(place.parent)}.`));
}

function regionHasAnchor(doc, rid, anchor) {
  const r = doc.page.regions.find(x => x.id === rid);
  return !!r && (r.lines || []).some(L => (L.spans || []).some(s => `${doc.page.id}#${s.id}` === anchor));
}

function regionInspector(el, app, rid) {
  const { doc, tl } = app;
  const r = doc.page.regions.find(x => x.id === rid);
  const owner = ops.ownerOf(doc, rid);
  const printed = Object.entries(tl.types).filter(([, t]) => "region" in t).map(([n, t]) => [n, n + (t.role === "furniture" ? " (furniture)" : "")]);
  const targets = doc.units.filter(u => (tl.types[u.type] || {}).region && u.id !== owner?.id);
  const caret = app.textPanel.lastSel && app.textPanel.lastSel.rid === rid ? app.textPanel.lastSel.end[0] : (r.lines || []).length - 1;
  const nLines = (r.lines || []).length;
  // Splitting at the caret's line piece, and moving the rest of its line to a column on the right. The caret is
  // read when the button is pressed.
  const caretHere = () => {
    const s = app.textPanel.lastSel;
    if (!s || s.rid !== rid) throw new ops.EditError("Put the caret in this region's text first, at the line (or the place in the line) to split at.");
    return s;
  };
  const blockActions = nLines ? h("div", { class: "actions" },
    h("button", { title: "the line pieces from the caret's on become a new unit of the same type, right after this one",
      onclick: () => app.edit(d => { const nid = ops.splitRegionAt(d, rid, caretHere().end[0], true); app.selection = { region: nid }; }) }, "Start a new unit at the caret's line"),
    h("button", { title: "the line pieces from the caret's on become a new region of the same unit (as for a second paragraph of a saying)",
      onclick: () => app.edit(d => { const nid = ops.splitRegionAt(d, rid, caretHere().end[0], false); app.selection = { region: nid }; }) }, "Split the region at the caret's line"),
    h("button", { title: "for two columns read as one: the text after the caret goes to a column region on the right (made the first time, then added to), in its own unit",
      onclick: () => app.edit(d => { const c = caretHere(); ops.moveRestToColumn(d, rid, c.end[0], c.end[1]); }) },
      "Move the text after the caret to a column on the right")) : null;
  el.append(h("div", { class: "ititle" }, "Region ", h("b", {}, `${rid} · ${r.type}`), owner ? ` in ${unitName(owner)}` : " (furniture: no unit)"),
    h("div", { class: "desc" }, (tl.types[r.type] || {}).description || ""),
    h("div", { class: "fields" },
      field("type", select(printed, r.type, v => app.edit(d => ops.setRegionType(d, tl, rid, v, app.selection.unit || null)))),
      targets.length ? field("move to", select([["", "another unit…"], ...targets.map(u => [u.id, unitName(u)])], "", v => v && app.edit(d => ops.moveRegionToUnit(d, tl, rid, v)))) : null),
    h("div", { class: "meta" }, `${(r.lines || []).length} line pieces; box ${r.box ? `[${r.box.join(", ")}]` : "none (the outline's bounds)"}. `,
      "Drag the box's handles on the page to change it.", r.source?.outline ? ` Outline: ${r.source.outline}.` : ""),
    h("div", { class: "actions" },
      h("button", { onclick: () => app.edit(d => ops.addLine(d, rid, caret), { after: () => app.textPanel.placeCaret(rid, caret + 1, 0) }) }, "Add a line piece after the caret's"),
      (r.lines || []).length ? h("button", { onclick: () => app.edit(d => ops.deleteLine(d, rid, Math.max(0, caret))) }, "Delete the caret's line piece") : null,
      h("button", { title: "run the outline step again on this page's boxes", onclick: () => app.recompute() }, "Recompute the outlines"),
      h("button", { class: "danger", onclick: () => app.edit(d => { ops.deleteRegion(d, rid); app.selection = {}; }) }, "Delete the region")),
    blockActions || "");
}

function markerInspector(el, app, sid) {
  const { doc, tl } = app;
  const m = ops.findMarker(doc, sid);
  if (!m) { el.append(h("div", { class: "hint" }, "That marker is gone.")); return; }
  const ref = `${doc.page.id}#${sid}`;
  const rel = (doc.relations || []).find(r => r.type === "note" && r.from.anchor === ref);
  const notes = ops.noteTargets(doc, tl);
  el.append(h("div", { class: "ititle" }, "Note marker ", h("b", {}, m.span.marker), ` in ${m.region.id}, line piece ${m.index + 1}`),
    h("div", { class: "fields" },
      field("printed as", app.stage === "read" ? h("span", {}, m.span.marker) : h("input", { value: m.span.marker, size: 4, onchange: e => app.edit(d => ops.setMarkerSign(d, sid, e.target.value.trim())) })),
      app.stage !== "text" ? field("its note", select([["", "(none)"], ...notes.map(u => [u.id, unitName(u)])], rel ? rel.to.unit : "", v => app.edit(d => ops.linkMarker(d, tl, sid, v || null)))) : null),
    h("div", { class: "actions" },
      rel ? h("button", { onclick: () => app.select({ unit: rel.to.unit }) }, "Go to the note") : null,
      app.stage !== "read" ? h("button", { class: "danger", onclick: () => app.edit(d => { ops.deleteMarker(d, sid); app.selection = { region: m.region.id }; }) }, "Delete the marker") : null));
}

// A form to insert a marker at the last caret position.
export function markerForm(el, app) {
  if (app.stage === "read") return;
  const at = app.textPanel.lastSel;
  el.replaceChildren();
  if (!at) { el.append(h("div", { class: "hint" }, "Put the caret in the text where the marker is printed, then click ＋ Marker again.")); return; }
  const signs = app.doc.page.regions.flatMap(r => (r.lines || []).flatMap(L => (L.spans || []).filter(s => s.kind === "note_marker").map(s => s.marker)));
  const guess = nextSign(signs);
  const input = h("input", { value: guess, size: 4 });
  const notes = ops.noteTargets(app.doc, app.tl);
  let note = "";
  el.append(h("div", { class: "ititle" }, `Insert a note marker in ${at.rid}, line piece ${at.end[0] + 1}, at character ${at.end[1]}`),
    h("div", { class: "fields" }, field("printed as", input),
      app.stage !== "text" ? field("its note", select([["", "(none yet)"], ...notes.map(u => [u.id, unitName(u)])], "", v => (note = v))) : null),
    h("div", { class: "actions" }, h("button", { class: "primary", onclick: () => {
      let id = null;
      app.edit(d => { id = ops.insertMarker(d, at.rid, at.end[0], at.end[1], input.value.trim()); if (note) ops.linkMarker(d, app.tl, id, note); },
        { after: () => app.select({ marker: id }) });
    } }, "Insert")));
  input.focus();
  input.select();
}

const DEV = "०१२३४५६७८९";
function nextSign(signs) {
  const last = signs[signs.length - 1];
  if (!last) return "1";
  if (/^\d+$/.test(last)) return String(+last + 1);
  if ([...last].every(c => DEV.includes(c))) {
    const n = +[...last].map(c => DEV.indexOf(c)).join("") + 1;
    return [...String(n)].map(d => DEV[+d]).join("");
  }
  const seq = ["*", "†", "‡", "§", "‖", "¶"];
  const k = seq.indexOf(last);
  return k >= 0 && k + 1 < seq.length ? seq[k + 1] : last;
}
