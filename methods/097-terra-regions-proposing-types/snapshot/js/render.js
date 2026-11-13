// HTML for a line piece's text with its spans (formatting and note markers), shared by the editor and the reader.

import { segments } from "./inline.js";

export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// Formatting kind -> [opening tag, closing tag]. The book's own inline kinds become a tinted span.
export const KIND_HTML = {
  bold: ["<b>", "</b>"], italic: ["<i>", "</i>"], underline: ["<u>", "</u>"],
  superscript: ['<sup class="fs">', "</sup>"], subscript: ["<sub>", "</sub>"],
  small_caps: ['<span class="sc">', "</span>"], spaced: ['<span class="spc">', "</span>"],
};
const kindHtml = kind => KIND_HTML[kind] || [`<span class="ik" data-kind="${esc(kind)}" title="${esc(kind)}">`, "</span>"];

// marker(span) returns the HTML for a note marker.
export function lineHtml(text, spans, marker) {
  let out = "";
  for (const seg of segments(text, spans)) {
    if (seg.marker) { out += marker(seg.marker); continue; }
    let h = esc(seg.text);
    for (const k of seg.kinds) { const [o, c] = kindHtml(k); h = o + h + c; }
    out += h;
  }
  return out;
}

export const PALETTE = ["#d62728", "#1f77b4", "#2ca02c", "#9467bd", "#ff7f0e", "#17becf", "#8c564b", "#e377c2", "#bcbd22",
  "#7f7f7f", "#393b79", "#637939", "#8c6d31", "#843c39", "#7b4173"];

export function typeColors(tl) {
  const printed = Object.entries(tl.types).filter(([, t]) => "region" in t).map(([n]) => n);
  return Object.fromEntries(printed.map((t, i) => [t, PALETTE[i % PALETTE.length]]));
}

// SVG path data for polygon rings in pixel-center coordinates.
export const pathD = rings => rings.filter(r => r.length >= 3)
  .map(r => "M" + r.map(([x, y]) => `${x + 0.5},${y + 0.5}`).join(" L") + " Z").join(" ");

export function bbox(rings) {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const r of rings) for (const [x, y] of r) { x1 = Math.min(x1, x); y1 = Math.min(y1, y); x2 = Math.max(x2, x); y2 = Math.max(y2, y); }
  return [x1, y1, x2, y2];
}

export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "html") el.innerHTML = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "dataset") Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) el.append(kid instanceof Node ? kid : String(kid));
  return el;
}

// Show the part `box` [x1, y1, x2, y2] of a page image (its URL; page {width, height}) in element `el`, scaled to fit
// maxW × maxH (never enlarged).
export function cropInto(el, url, page, box, maxW, maxH) {
  const [x1, y1, x2, y2] = box;
  const bw = Math.max(1, x2 - x1), bh = Math.max(1, y2 - y1);
  const s = Math.min(1, maxW / bw, maxH / bh);
  Object.assign(el.style, { width: `${bw * s}px`, height: `${bh * s}px`, backgroundImage: `url("${url}")`, backgroundRepeat: "no-repeat",
    backgroundSize: `${page.width * s}px ${page.height * s}px`, backgroundPosition: `${-x1 * s}px ${-y1 * s}px` });
}
