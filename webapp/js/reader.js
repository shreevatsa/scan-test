// The book as one text: its page documents (the user's corrected versions where there are any) assembled, and each
// flow rendered in reading order. Headings, verses, paragraphs, tables and notes follow their types' region classes;
// formatting is shown; note markers link to their notes; figures are shown as their part of the page image, with
// their label; the printed page number is shown where each page starts.
// Hovering a passage shows its region on the page image; double-clicking it opens the page in the editor.

import { assemble } from "./assemble.js?v=20261113-type-tree-3";
import { cp } from "./inline.js";
import { lineHtml, esc, h, bbox, cropInto } from "./render.js";
import { css, unitStyle, baseCss } from "./style.js";
import { readingGaps, readingDocuments, eligible, noContent } from "./workflow.js?v=20261113-type-tree-3";
import { layerState } from "./layers.js?v=20261113-type-tree-3";
import { wireReadingPanel, readingIssues } from "./read-panel.js?v=20261113-type-tree-3";

// A line piece's text and spans with a trailing hyphen dropped (end "hyphen", not the unit's last piece).
function dropHyphen(L) {
  const chars = cp(L.text);
  if (!chars.length || !/[-‐]/.test(chars[chars.length - 1])) return L;
  const n = chars.length - 1;
  return { ...L, text: chars.slice(0, n).join(""), spans: (L.spans || []).map(s => ({ ...s, start: Math.min(s.start, n), end: Math.min(s.end, n) })).filter(s => s.kind === "note_marker" || s.end > s.start) };
}

const SEP = { space: " ", hyphen: "", join: "", line: "<br>" };

// The book assembled from page documents in page order (null where a page is not there, which nothing joins across),
// with what Read needs to show it.
export function prepare(pageDocs, tl, sheet = null) {
  const merged = {}, docs = pageDocs.filter(Boolean);
  const [book, warnings] = assemble(pageDocs, tl, {}, { onMerge: (a, b) => { merged[b] = a; } });
  const unitCanonical = {}, unitFragments = {};
  for (const doc of docs) for (const unit of doc.units) {
    const id = `${doc.page.id}#${unit.id}`;
    let target = id;
    while (merged[target]) target = merged[target];
    unitCanonical[id] = target;
    (unitFragments[target] ||= []).push({ page: doc.page.id, unit: unit.id });
  }
  const pages = Object.fromEntries(book.pages.map(p => [p.id, p]));
  const regions = {};
  for (const p of book.pages) for (const r of p.regions) regions[`${p.id}#${r.id}`] = { page: p, region: r };
  const units = Object.fromEntries(book.units.map(u => [u.id, u]));
  const noteOf = {}, markersOf = {};
  for (const rel of book.relations || []) {
    if (rel.type !== "note" || !rel.from.anchor) continue;
    noteOf[rel.from.anchor] = rel.to.unit;
    (markersOf[rel.to.unit] ||= []).push(rel.from.anchor);
  }
  return { book, warnings, pages, regions, units, noteOf, markersOf, tl, sheet, unitCanonical, unitFragments,
    provisionalPages: new Set(docs.filter(doc => !noContent(doc) && layerState(doc, "units")?.state === "provisional").map(doc => doc.page.id)) };
}

// HTML for the whole book, flow by flow. Consecutive units in one row (style.row, schema 0.3) stand side by side,
// as wide as the text allows (they wrap to one under the other where it is narrow). With `printed`, each unit and
// line piece is styled as the book prints it, from P.sheet (the book's style sheet) and its own style. With
// `figureSrc(ref)`, figures are <img> elements with that source (for a standalone export), not crops filled in later.
export function bookHtml(P, { printed = false, figureSrc = null } = {}) {
  const { book, tl, units, regions, noteOf, markersOf } = P;
  const sheet = printed ? P.sheet || null : null;
  const styleAttr = s => (s ? ` style="${esc(s)}"` : "");
  let lastPage = null;
  const pageMark = pid => {
    if (pid === lastPage) return "";
    lastPage = pid;
    const p = P.pages[pid];
    const scan = pid.replace(/^.*-page-0*/, "");
    return `<a class="r-pb" data-page="${esc(pid)}" title="scan page ${esc(scan)} (${esc(pid)}): open it">${p.label ? "p. " + esc(p.label) : "scan " + esc(scan)}</a>`;
  };
  const marker = pid => sp => {
    const a = `${pid}#${sp.id}`, note = noteOf[a];
    return note ? `<a class="r-mk" id="mk-${esc(a)}" href="#note-${esc(note)}" data-sign="${esc(sp.marker)}" title="note ${esc(sp.marker)}"></a>`
      : `<span class="r-mk none" id="mk-${esc(a)}" data-sign="${esc(sp.marker)}" title="a note marker not linked to a note"></span>`;
  };
  // The text of a run of regions of one unit, joined across line pieces, regions and pages. As printed, a line
  // piece's own style is kept, and a heading's lines are set one under the other.
  const regionsText = (refs, cls) => {
    let out = "";
    refs.forEach((ref, k) => {
      const R = regions[ref];
      if (!R) { out += `<span class="bad">?? ${esc(ref)}</span>`; return; }
      const pid = R.page.id, lines = R.region.lines || [];
      out += pageMark(pid) + `<span class="r-reg" data-ref="${esc(ref)}">`;
      lines.forEach((L, i) => {
        const last = k === refs.length - 1 && i === lines.length - 1;
        const end = P.provisionalPages?.has(pid) ? "space" : L.end || (cls === "verse" ? "line" : "space");
        const shown = end === "hyphen" && !last ? dropHyphen(L) : L;
        if (cls === "table") { out += `<span class="r-row">${lineHtml(shown.text || "", shown.spans || [], marker(pid))}</span>`; return; }
        const text = lineHtml(shown.text || "", shown.spans || [], marker(pid));
        const ls = sheet && L.style ? css(sheet, L.style, { block: false }) : "";
        if (sheet && cls === "heading") { out += `<span class="r-ln"${styleAttr("display:block" + (ls ? ";" + ls : ""))}>${text}</span>`; return; }
        out += ls ? `<span${styleAttr(ls)}>${text}</span>` : text;
        if (!last) out += SEP[end] ?? " ";
      });
      out += "</span>";
    });
    return out;
  };
  const tableHtml = refs => {
    const first = pageMark(regions[refs[0]]?.page.id);
    let out = "<table class=\"r-table\">";
    refs.forEach((ref, k) => {
      const R = regions[ref];
      if (!R) return;
      const mark = k ? pageMark(R.page.id) : "";
      if (mark) out += `<tbody><tr class="r-pbrow"><td colspan="99">${mark}</td></tr></tbody>`;
      out += `<tbody class="r-reg" data-ref="${esc(ref)}">`;
      for (const L of R.region.lines || []) {
        const cells = (L.text || "").split(" | ");
        out += "<tr>" + cells.map(c => `<td>${esc(c === ".." ? "" : c)}</td>`).join("") + "</tr>";
      }
      out += "</tbody>";
    });
    return first + out + "</table>";
  };
  // Units in reading order, with consecutive members of one row (on one page) side by side.
  const rowOf = uid => { const r = units[uid]?.style?.row; return r ? `${uid.split("#")[0]}#${r}` : null; };
  const unitList = (uids, depth) => {
    let out = "";
    for (let i = 0; i < uids.length;) {
      const key = rowOf(uids[i]);
      let j = i + 1;
      if (key) while (j < uids.length && rowOf(uids[j]) === key) j++;
      if (j - i < 2) { out += unitHtml(uids[i], depth); i++; continue; }
      out += `<div class="r-row">` + uids.slice(i, j).map(id => {
        const w = units[id].style.width;
        return `<div class="r-col"${w ? ` style="flex-basis:${Math.round(w * 100)}%"` : ""}>${unitHtml(id, depth)}</div>`;
      }).join("") + `</div>`;
      i = j;
    }
    return out;
  };
  const label = u => [u.type.replace(/_/g, " "), u.number, u.label ? `“${u.label}”` : ""].filter(Boolean).join(" ");
  const unitHtml = (uid, depth) => {
    const u = units[uid];
    if (!u) return "";
    const t = tl.types[u.type] || {}, cls = t.region;
    const lang = u.lang || t.lang;
    const own = sheet ? unitStyle(sheet, u.type, u.style) : null;
    const st = own ? css(sheet, own) : "";
    const attrs = `data-uid="${esc(uid)}" data-label="${esc(label(u))}"${lang ? ` lang="${esc(lang)}"` : ""}`;
    const back = (markersOf[uid] || []).map(a => `<a class="r-back" href="#mk-${esc(a)}" title="back to the marker">↩</a>`).join("");
    const mixed = u.children.some(c => c.unit);
    if (!cls || mixed) {
      // A first-line indent belongs to the unit's first run of text only (the text after a quoted verse goes on).
      const indent = own && own.indent_pt !== undefined ? own.indent_pt : null;
      const outer = own ? css(sheet, { ...own, indent_pt: undefined }) : "";
      let inner = "", run = [], kids = [], runs = 0;
      const flushRun = () => {
        if (run.length) {
          const ind = indent === null ? "" : `text-indent:${runs ? 0 : `calc(var(--pt, 1pt) * ${indent})`}`;
          inner += `<p class="r-para r-${cls || "para"}"${styleAttr(ind)}>${regionsText(run, cls)}</p>`;
          runs++;
        }
        run = [];
      };
      const flushKids = () => { if (kids.length) inner += unitList(kids, depth + 1); kids = []; };
      for (const c of u.children) {
        if (c.region) { flushKids(); run.push(c.region); continue; }
        flushRun();
        kids.push(c.unit);
      }
      flushRun(); flushKids();
      return `<section class="r-unit r-${esc(u.type)}" ${attrs}${styleAttr(outer)}>${inner}</section>`;
    }
    const refs = u.children.map(c => c.region);
    if (cls === "figure") {
      const pics = refs.map(ref => {
        if (!regions[ref]) return "";
        const src = figureSrc && figureSrc(ref);
        return pageMark(regions[ref].page.id) + (src ? `<img class="r-figimg" src="${esc(src)}" alt="${esc(u.label || "figure")}">` : `<span class="r-reg r-fig" data-ref="${esc(ref)}"></span>`);
      }).join("");
      return `<figure class="r-figure" ${attrs}${styleAttr(st)}>${pics}${u.label ? `<figcaption>${esc(u.label)}</figcaption>` : ""}</figure>`;
    }
    if (cls === "heading") return `<h${Math.min(2 + depth, 6)} class="r-heading" ${attrs}${styleAttr(st)}>${regionsText(refs, cls)}</h${Math.min(2 + depth, 6)}>`;
    if (cls === "verse") return `<div class="r-verse" ${attrs}${styleAttr(st)}>${regionsText(refs, cls)}</div>`;
    if (cls === "table") return `<div class="r-tablewrap" ${attrs}${styleAttr(st)}>${tableHtml(refs)}</div>`;
    if (cls === "note") return `<div class="r-note" id="note-${esc(uid)}" ${attrs}${styleAttr(st)}>${regionsText(refs, cls)}${back}</div>`;
    return `<p class="r-para r-${esc(cls)}" ${attrs}${styleAttr(st)}>${regionsText(refs, cls)}${back}</p>`;
  };
  let html = "";
  const flows = Object.keys(book.flows).sort((a, b) => (a === "main" ? -1 : b === "main" ? 1 : 0));
  for (const flow of flows) {
    lastPage = null;
    const tops = book.flows[flow];
    if (!tops.length) continue;
    html += `<section class="r-flow" data-flow="${esc(flow)}">`;
    if (flow !== "main") html += `<h2 class="r-flowname">${esc(tl.flows[flow] ? flow[0].toUpperCase() + flow.slice(1) : flow)}</h2>`;
    html += unitList(tops, 0);
    html += "</section>";
  }
  return html;
}

export async function renderReader(el, app, { keepPlace = false } = {}) {
  const { book } = app;
  const token = app.routeToken;
  const generation = app.readerGeneration = (app.readerGeneration || 0) + 1;
  const current = () => app.book === book && app.routeToken === token && app.readerGeneration === generation && app.mode === "read";
  const oldAnchor = keepPlace && [...el.querySelectorAll(".r-reg")].find(region => region.getBoundingClientRect().bottom > el.getBoundingClientRect().top);
  const bookmark = oldAnchor && { ref: oldAnchor.dataset.ref, top: oldAnchor.getBoundingClientRect().top };
  const oldScroll = el.scrollTop;
  app.onLeaveReader?.(); app.onLeaveReader = null;
  app.textPanel?.destroy?.(); app.pageView?.destroy(); app.textPanel = null; app.pageView = null; app.doc = null;
  el.replaceChildren(h("div", { class: "loading" }, "Loading the pages…"));
  const all = await book.all((d, n) => { if (current()) el.firstChild.textContent = `Loading the pages… ${d} of ${n}`; });
  if (!current()) return;
  const accepted = all.filter(doc => eligible("read", app.pageStates.get(doc.page.id)));
  const gaps = readingGaps(book.pages, new Set(accepted.map(doc => doc.page.id)));
  const P = prepare(readingDocuments(book.pages, accepted), book.types, book.style);
  const issues = readingIssues(accepted, book.types, app.validate, P.warnings, P.unitCanonical);
  app.readerData = P;
  if (app.readerPrinted === undefined) app.readerPrinted = !!book.style;
  const body = h("article", { class: "reader" });
  const draw = () => {
    const printed = app.readerPrinted && !!P.sheet;
    body.innerHTML = bookHtml(P, { printed });
    body.classList.toggle("printed", printed);
    body.classList.toggle("structure", !!app.readerStructure);
    body.style.cssText = printed ? baseCss(P.sheet) : "";
    fillFigures(body, app, P);
  };
  const tools = h("div", { class: "r-tools" },
    h("label", {}, h("input", { type: "checkbox", checked: app.readerStructure, onchange: e => { app.readerStructure = e.target.checked; body.classList.toggle("structure", e.target.checked); } }), " show the units"),
    P.sheet ? h("label", { title: "fonts, sizes, alignment and spacing from the book's style sheet and each unit's style" },
      h("input", { type: "checkbox", checked: app.readerPrinted ? true : null, onchange: e => { app.readerPrinted = e.target.checked; renderReader(el, app, { keepPlace: true }).catch(error => app.toast(error.message, "bad")); } }), " as printed") : null,
    h("span", { class: "meta" }, `${accepted.length} pages · ${P.book.units.length} units · ${book.edits.size} pages corrected`),
    issues.length ? h("details", { class: "warn" }, h("summary", {}, `${issues.length} reading problems`),
      ...issues.map(issue => h("p", {}, h("button", { class: "link", onclick: () => app.selectReadingIssue?.(issue) }, issue.message)))) : null,
    app.dirty ? h("div", { class: "warn" }, "The page open in the editor has changes that are not saved yet; they are not shown here.") : null);
  draw();
  const panel = h("aside", { class: "read-panel", "aria-label": "Passage structure", hidden: true });
  const workspace = h("div", { class: "read-workspace" }, h("div", { class: "reading-main" }, tools, body), panel);
  el.replaceChildren(app.book.writable ? h("div", { class: "r-stage-actions" }, h("button", { onclick: () => app.setMode("read&view=pages") }, "Complete and review units and links")) : "",
    ...(gaps.length ? [h("p", { class: "reading-gaps" }, `${gaps.join(" · ")} ${gaps.length === 1 && !gaps[0].startsWith("Pages") ? "is" : "are"} not here yet. Move these pages on from Text to include them.`)] : []),
    ...(P.provisionalPages.size ? [h("p", { class: "reading-gaps" }, `${P.provisionalPages.size} pages have provisional unit grouping. Complete units and links to review that grouping.`)] : []), workspace);
  wireSourcePreview(body, app, P);
  const leavePreview = app.onLeaveReader;
  const leavePanel = await wireReadingPanel({ app, body, panel, workspace, docs: accepted, P, issues, redraw: () => renderReader(el, app, { keepPlace: true }) });
  if (!current()) { leavePanel(); leavePreview(); return; }
  app.onLeaveReader = () => { leavePanel(); leavePreview(); };
  if (bookmark) {
    const anchor = body.querySelector(`[data-ref="${CSS.escape(bookmark.ref)}"]`);
    if (anchor) el.scrollTop = oldScroll + anchor.getBoundingClientRect().top - bookmark.top;
  } else if (keepPlace) el.scrollTop = oldScroll;
  body.addEventListener("click", e => {
    const pb = e.target.closest(".r-pb");
    if (pb) { e.preventDefault(); app.openPage(pb.dataset.page); }
  });
  body.addEventListener("dblclick", e => {
    const r = e.target.closest(".r-reg");
    if (r) { const [pid, rid] = r.dataset.ref.split("#"); app.openPage(pid, { region: rid }); }
  });
}

// The CSS a standalone export needs: the reader's rules for its elements, as printed.
const EXPORT_CSS = `
body { margin: 0; background: #fdfdfb; color: #1d1d1b; }
.reader { --pt: 1.35pt; margin: 2em auto 6em; padding: 0 1.2em; box-sizing: content-box; hyphens: auto; }
.reader h2, .reader h3, .reader h4, .reader h5, .reader h6 { margin: 0; }
.r-para, .r-verse, .r-note { margin: 0; }
.r-flow[data-flow="notes"] { margin-top: 3em; border-top: 1px solid #ccc; padding-top: 1em; }
.r-flowname { font: 600 12px system-ui, sans-serif; color: #888; text-transform: uppercase; letter-spacing: .08em; }
.r-row { display: flex; flex-wrap: wrap; justify-content: space-between; column-gap: 1.5em; }
.r-col { flex-grow: 1; flex-shrink: 1; min-width: 8em; }
.r-figure { margin: 1em 0; text-align: center; }
.r-figimg { max-width: 100%; height: auto; }
.r-figure figcaption { display: none; }
.r-pb { font: 10px system-ui, sans-serif; color: #aaa; text-decoration: none; margin: 0 .4em; vertical-align: 2px; }
.r-mk { color: inherit; text-decoration: none; font-size: .7em; vertical-align: super; padding: 0 1px; }
.r-mk::before { content: attr(data-sign); }
.r-back { font-size: .8em; text-decoration: none; margin-left: 4px; }
.sc { font-variant: small-caps; }
.r-table { border-collapse: collapse; } .r-table td { padding: 1px 6px; }
@media print { .r-pb, .r-back { display: none; } .reader { margin: 0 auto; } }
`;

// A standalone HTML document of the book: as printed where the book has a style sheet, rows side by side, figures
// as images (figureSrc gives each figure region's image URL, such as a data: URL of its crop), the printed page
// numbers small in the text.
export function bookDocument(P, { title, lang = "", figureSrc }) {
  const printed = !!P.sheet;
  return `<!DOCTYPE html>
<html${lang ? ` lang="${esc(lang)}"` : ""}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>${EXPORT_CSS}</style></head>
<body><article class="reader${printed ? " printed" : ""}"${printed ? ` style="${esc(baseCss(P.sheet))}"` : ""}>
${bookHtml(P, { printed, figureSrc })}
</article></body></html>
`;
}

// Each figure's part of its page image.
export async function fillFigures(body, app, P) {
  for (const el of body.querySelectorAll(".r-fig")) {
    const R = P.regions[el.dataset.ref];
    if (!R) continue;
    cropInto(el, await app.book.imageUrl(R.page.id), R.page, R.region.box || bbox(R.region.polygons), 480, 420);
  }
}

// A floating view of a passage's region on its page image, shown on hover.
function wireSourcePreview(body, app, P) {
  const tip = h("div", { class: "r-source" });
  document.body.append(tip);
  let current = null;
  body.addEventListener("mouseover", async e => {
    const r = e.target.closest(".r-reg");
    if (!r || r.dataset.ref === current) return;
    current = r.dataset.ref;
    const R = P.regions[current];
    if (!R) return;
    const url = await app.book.imageUrl(R.page.id);
    if (current !== r.dataset.ref) return;
    const [x1, y1, x2, y2] = R.region.box || bbox(R.region.polygons);
    const pad = 12, bw = x2 - x1 + 2 * pad, bh = y2 - y1 + 2 * pad;
    const s = Math.min(1, 560 / bw, 360 / bh);
    tip.style.width = `${bw * s}px`;
    tip.style.height = `${bh * s}px`;
    tip.style.backgroundImage = `url("${url}")`;
    tip.style.backgroundSize = `${R.page.width * s}px ${R.page.height * s}px`;
    tip.style.backgroundPosition = `${-(x1 - pad) * s}px ${-(y1 - pad) * s}px`;
    tip.title = current;
    const rect = r.getBoundingClientRect();
    const below = rect.bottom + 8 + bh * s < innerHeight;
    tip.style.left = `${Math.max(8, Math.min(innerWidth - bw * s - 8, rect.left))}px`;
    tip.style.top = `${below ? rect.bottom + 8 : Math.max(8, rect.top - bh * s - 8)}px`;
    tip.classList.add("on");
  });
  body.addEventListener("mouseout", e => {
    const r = e.target.closest(".r-reg");
    if (r && !r.contains(e.relatedTarget)) { tip.classList.remove("on"); current = null; }
  });
  app.onLeaveReader = () => tip.remove();
}

// The book as plain text, with page references: each top-level unit's text, a blank line between units,
// [page label] where a page starts, and [figure: label] for a figure.
export function bookText(P) {
  const { book, tl, units, regions } = P;
  const lines = [];
  let lastPage = null;
  const regionText = (ref, cls, isLastRegion) => {
    const R = regions[ref];
    if (!R) return "";
    let out = "";
    if (R.page.id !== lastPage) { lastPage = R.page.id; out += `[${R.page.label ? "p. " + R.page.label : R.page.id}] `; }
    const ls = R.region.lines || [];
    ls.forEach((L, i) => {
      const last = isLastRegion && i === ls.length - 1;
      const end = P.provisionalPages?.has(R.page.id) ? "space" : L.end || (cls === "verse" || cls === "table" ? "line" : "space");
      let t = L.text || "";
      if (end === "hyphen" && !last) t = t.replace(/[-‐]$/u, "");
      out += t + (last ? "" : end === "line" ? "\n" : end === "space" ? " " : "");
    });
    return out;
  };
  const walk = uid => {
    const u = units[uid];
    if (!u) return;
    const cls = (tl.types[u.type] || {}).region;
    if (cls === "figure") {
      let mark = "";
      for (const c of u.children) {
        const R = c.region && regions[c.region];
        if (R && R.page.id !== lastPage) { lastPage = R.page.id; mark = `[${R.page.label ? "p. " + R.page.label : R.page.id}] `; }
      }
      lines.push(`${mark}[figure${u.label ? ": " + u.label : ""}]`, "");
      return;
    }
    let buf = "";
    u.children.forEach((c, k) => {
      if (c.region) buf += regionText(c.region, cls, k === u.children.length - 1 || !!u.children[k + 1]?.unit);
      else { if (buf.trim()) lines.push(buf.trim(), ""); buf = ""; walk(c.unit); }
    });
    if (buf.trim()) lines.push(buf.trim(), "");
  };
  for (const [flow, tops] of Object.entries(book.flows)) {
    if (!tops.length) continue;
    lines.push(`=== ${flow} ===`, "");
    lastPage = null;
    for (const uid of tops) walk(uid);
  }
  return lines.join("\n");
}
