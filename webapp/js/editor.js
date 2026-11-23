import { suggestionButton } from "./review-view.js?v=20261123-blocks-b1";
// The text side of the page editor: the page's units in reading order, each region's line pieces as editable
// lines (one region is one editing host, so a selection can run across its lines), and an inspector for the
// selected unit, region or note marker. Text typed into a line is read back from the DOM into text and spans; every
// other change goes through ops.js on a copy of the document (app.edit), which keeps the previous one for undo.

import { cp, cpLength, covered, removeKind, normalizeSpans } from "./inline.js";
import { lineHtml, esc, h, bbox, cropInto } from "./render.js";
import * as ops from "./ops.js?v=20261123-blocks-b1";
import { editorFocus, applyUnitAction, unitRegionIds } from "./editing.js?v=20261123-blocks-b1";
import { textFlags } from "./flags.js?v=20261123-blocks-b1";
import { regionTools, omittedInspector } from "./regionsview.js?v=20261123-blocks-b1";

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
    this.focus = editorFocus();
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
      // A region with no line piece (the ink analysis found no line in it) gets one when clicked, so its text can be typed.
      const region = app.doc.page.regions.find(x => x.id === rid);
      if (this.textEditable && region && !(region.lines || []).length && app.tl.types[region.type]?.region !== "figure") {
        e.preventDefault();
        app.edit(d => ops.addLinePiece(d, rid), { after: () => this.placeCaret(rid, 0, 0) });
        return;
      }
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
  if (s.omitted !== undefined) return omittedInspector(el, app, s.omitted);
  if (s.unit && doc.units.some(u => u.id === s.unit)) {
    unitInspector(el, app, s.unit);
    for (const rid of unitRegionIds(doc, s.unit)) regionLineJoins(el, app, rid);
    return;
  }
  if (s.region && doc.page.regions.some(r => r.id === s.region)) {
    const owner = ops.ownerOf(doc, s.region);
    if (owner) unitInspector(el, app, owner.id);
    regionLineJoins(el, app, s.region);
    if (app.readPanel) return;
    // The region itself: its type, box, split, merge, reading order and deletion.
    const region = doc.page.regions.find(r => r.id === s.region);
    for (const flag of textFlags(doc, tl).filter(flag => flag.region === region.id)) el.append(h("p", { class: "warn" }, flag.message));
    el.append(h("details", { class: "region-tools", open: true }, h("summary", {}, `Region ${region.id} · ${region.type}`),
      ...regionTools(app, region)));
    return;
  }
  el.append(h("p", { class: "hint" }, "Select a unit to change its grouping, or a region to correct its text, review its line joins or change its type, box or place. Draw a new region with ＋ Region. A region showing “(no text)” takes text when you click it."));
  if (!app.readPanel) el.append(field("Printed page label", h("input", { value: doc.page.label || "", "aria-label": "Printed page label", onchange: event => app.edit(next => {
    if (event.target.value.trim()) next.page.label = event.target.value.trim(); else delete next.page.label;
  }) })));
  const loose = (doc.relations || []).map((r, i) => [r, i]).filter(([r]) => r.type === "note" && !r.from.anchor && !r.from.unit);
  if (loose.length && !app.readPanel) el.append(looseRelations(app, loose));
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
      field("type", select(ops.retypeChoices(doc, tl, uid).filter(type => (tl.types[type].region === "figure") === (t.region === "figure")), u.type, v => change("type", v), { "aria-label": "Unit type" })),
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
  if (u.children.length > 1) {
    const split = select(u.children.slice(1).map((child, index) => [String(index + 1), `Before ${child.unit || child.region}`]), "1", () => {}, { "aria-label": "Split before child" });
    el.append(h("div", { class: "actions" }, split, h("button", { onclick: () => change("split", Number(split.value)) }, "Split unit")));
  }
  // Page furniture (an ornament, a running header): the unit's regions leave the text.
  const furnitureTypes = u.children.every(c => c.region) ? Object.entries(tl.types).filter(([, type]) => type.role === "furniture" && type.region && (type.region === "figure") === (t.region === "figure")).map(([n]) => n) : [];
  el.append(h("div", { class: "actions" },
    h("button", { onclick: () => app.joinNext ? app.joinNext(uid) : app.edit(d => ops.joinWithNext(d, uid)) }, "Join with the next unit"),
    wrapTypes.length ? select([["", "Put inside a new…"], ...wrapTypes], "", v => v && change("wrap", v), { "aria-label": "Wrap in a container" }) : null,
    furnitureTypes.length ? select([["", "Make it page furniture…"], ...furnitureTypes], "", v => v && change("furniture", v),
      { title: "take it out of the text: its regions stay on the page as furniture (as an ornament or a running header)" }) : null,
    u.children.every(c => c.unit) ? h("button", { onclick: () => change("unwrap") }, "Unwrap (keep its contents)") : null));
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

function markerInspector(el, app, sid) {
  const { doc, tl } = app;
  const m = ops.findMarker(doc, sid);
  if (!m) { el.append(h("div", { class: "hint" }, "That marker is gone.")); return; }
  const ref = `${doc.page.id}#${sid}`;
  const rel = (doc.relations || []).find(r => r.type === "note" && r.from.anchor === ref);
  const notes = ops.noteTargets(doc, tl);
  el.append(h("div", { class: "ititle" }, "Note marker ", h("b", {}, m.span.marker), ` in ${m.region.id}, line piece ${m.index + 1}`),
    h("div", { class: "fields" },
      field("printed as", app.readPanel ? h("span", {}, m.span.marker) : h("input", { value: m.span.marker, size: 4, onchange: e => app.edit(d => ops.setMarkerSign(d, sid, e.target.value.trim())) })),
      field("its note", select([["", "(none)"], ...notes.map(u => [u.id, unitName(u)])], rel ? rel.to.unit : "", v => app.edit(d => ops.linkMarker(d, tl, sid, v || null))))),
    h("div", { class: "actions" },
      rel ? h("button", { onclick: () => app.select({ unit: rel.to.unit }) }, "Go to the note") : null,
      !app.readPanel ? h("button", { class: "danger", onclick: () => app.edit(d => { ops.deleteMarker(d, sid); app.selection = { region: m.region.id }; }) }, "Delete the marker") : null));
}

// A form to insert a marker at the last caret position.
export function markerForm(el, app) {
  if (app.readPanel) return;
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
      field("its note", select([["", "(none yet)"], ...notes.map(u => [u.id, unitName(u)])], "", v => (note = v)))),
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
