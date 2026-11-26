// The book as one text: its page documents (the user's corrected versions where there are any) assembled, and each
// flow rendered in reading order. Headings, verses, paragraphs, tables and notes follow their types' region classes;
// formatting is shown; note markers link to their notes; figures are shown as their part of the page image, with
// their label; the printed page number is shown where each page starts.
// Hovering a passage shows its region on the page image; double-clicking it opens the page in the editor.

import { assemble } from "./assemble.js?v=20261125-leaveout-3";
import { cp } from "./inline.js";
import { lineHtml, esc, h, bbox, cropInto } from "./render.js";
import { verseGroups } from "./verses.js?v=20261125-leaveout-3";
import { css, unitStyle, baseCss } from "./style.js";
import { workflowAddress, hasReading, noContent } from "./workflow.js?v=20261125-leaveout-3";
import { layerState } from "./layers.js?v=20261125-leaveout-3";
import { bookReading } from "./reading.js?v=20261125-leaveout-3";

// A line piece with something in it (as ops.js joinLines): an empty one adds nothing to a block's text, not even a space.
const spoken = line => Boolean(line.text) || Boolean(line.spans?.length);

// A line piece's text and spans with a trailing hyphen dropped (end "hyphen", not the unit's last piece).
function dropHyphen(L) {
  const chars = cp(L.text);
  if (!chars.length || !/[-‐]/.test(chars[chars.length - 1])) return L;
  const n = chars.length - 1;
  return { ...L, text: chars.slice(0, n).join(""), spans: (L.spans || []).map(s => ({ ...s, start: Math.min(s.start, n), end: Math.min(s.end, n) })).filter(s => s.kind === "note_marker" || s.end > s.start) };
}

const SEP = { space: " ", hyphen: "", join: "", line: "<br>" };

export const safeId = value => String(value).replace(/[^A-Za-z0-9_-]/g, "_");
const DEV_DIGITS = "०१२३४५६७८९", KAN_DIGITS = "೦೧೨೩೪೫೬೭೮೯";
const asciiDigits = value => [...String(value)].map(c => DEV_DIGITS.includes(c) ? DEV_DIGITS.indexOf(c) : KAN_DIGITS.includes(c) ? KAN_DIGITS.indexOf(c) : c).join("");

// Page numbers printed at the end of a block ("… 161", "… 3, 46, 131", "… 1-31"): the pages they name, among the book's
// page labels (a range names its first page). `byLabel`: label → page id.
const PAGE_TAIL = /((?:[0-9०-९೦-೯]{1,4}\s*[,–-]\s*)*[0-9०-९೦-೯]{1,4})(\s*[.)]?\s*(?:<\/[^>]+>\s*)*)$/u;
function tailPages(text, byLabel) {
  const match = PAGE_TAIL.exec(text || "");
  if (!match || /[\p{L}\p{M}\p{N}]/u.test(text.slice(match.index - 1, match.index))) return null;
  const numbers = match[1].split(/\s*[,–-]\s*/), range = /[–-]/.test(match[1]) && !match[1].includes(",");
  const pages = (range ? numbers.slice(0, 1) : numbers).map(number => ({ number, pid: byLabel.get(asciiDigits(number)) }));
  return pages.some(page => page.pid) ? { match, pages, range } : null;
}

// The pages of a printed contents or index: three or more of their blocks, and 40% or more, end with page numbers of
// this book. On them those numbers link to where their pages start in Read (#pb-…), roughly where the passage is.
function referencePages(P) {
  const byLabel = new Map();
  for (const page of P.book.pages) if (page.label && !byLabel.has(asciiDigits(page.label))) byLabel.set(asciiDigits(page.label), page.id);
  const counts = new Map();
  for (const R of Object.values(P.regions)) {
    const cls = P.tl.types[R.region.type]?.region;
    if (!R.region.lines?.length || ["heading", "page_number", "running_header", "figure", "caption", "verse", "note"].includes(cls)) continue;
    const text = R.region.lines.map(line => line.text || "").join(" ").trim();
    const count = counts.get(R.page.id) || { blocks: 0, hits: 0 };
    count.blocks++;
    if (tailPages(text, byLabel)) count.hits++;
    counts.set(R.page.id, count);
  }
  const pages = new Set([...counts].filter(([, count]) => count.hits >= 3 && count.hits >= 0.4 * count.blocks).map(([pid]) => pid));
  return { pages, link: html => {
    const found = tailPages(html, byLabel);
    if (!found) return html;
    const { match, pages: named, range } = found;
    const linked = named.map(({ number, pid }) => pid ? `<a class="r-pageref" href="#pb-${safeId(pid)}" title="page ${esc(number)}">${number}</a>` : number);
    const rest = range ? match[1].slice(named[0].number.length) : "";
    const joined = range ? linked[0] + rest : match[1].split(/(\s*,\s*)/).map((part, i) => i % 2 ? part : linked[i / 2]).join("");
    return html.slice(0, match.index) + joined + match[2];
  } };
}
const bareLetters = value => String(value).normalize("NFC").replace(/[^\p{L}\p{M}]/gu, "");
function editDistance(a, b) {
  a = [...a]; b = [...b];
  let row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    row = next;
  }
  return row[b.length];
}

// A printed contents line: a title, dots, and a page number.
export function tocLine(text) {
  const match = /^\s*(.+?)[\s.…·]*[.…·]{2,}[\s.…·]*([०-९0-9]{1,4})\s*$/u.exec(text || "");
  return match && bareLetters(match[1]) ? { title: match[1].replace(/[\s.…·]+$/u, ""), page: match[2] } : null;
}

// Where a contents line points: the named section (an episode or part labelled from its closing line or heading) whose
// name is the title, or nearly (the one starting on or near the printed page if several are close), else the page that
// prints that number.
function tocTargets(P) {
  const firstPage = uid => {
    for (let unit = P.units[uid]; unit;) {
      const child = unit.children?.[0];
      if (!child) return null;
      if (child.region) return P.regions[child.region]?.page;
      unit = P.units[child.unit];
    }
    return null;
  };
  const named = Object.values(P.units).filter(unit => unit.type === "section" && unit.label)
    .map(unit => ({ uid: unit.id, name: bareLetters(unit.label), page: Number(asciiDigits(firstPage(unit.id)?.label || "")) || null }));
  const byLabel = new Map();
  for (const page of P.book.pages) if (page.label && !byLabel.has(asciiDigits(page.label))) byLabel.set(asciiDigits(page.label), page.id);
  return {
    find({ title, page }) {
      // By name first ("… समाप्तिः", the end of a section, names that section); the printed page only chooses among
      // names nearly as close, since a page number read from the scan may be wrong.
      const name = bareLetters(title).replace(/समाप्तिः$/u, ""), at = Number(asciiDigits(page));
      const scored = named.map(unit => ({ unit, d: editDistance(name, unit.name) / Math.max(name.length, unit.name.length, 1), near: unit.page === null || Math.abs(unit.page - at) <= 3 }))
        .sort((a, b) => a.d - b.d || b.near - a.near);
      const best = scored[0];
      if (best && best.d <= 0.35) {
        const close = scored.filter(s => s.d <= best.d + 0.05);
        const pick = close.length === 1 ? best : close.find(s => s.near);
        if (pick) return `u-${safeId(pick.unit.uid)}`;
      }
      const pid = byLabel.get(asciiDigits(page));
      return pid ? `pb-${safeId(pid)}` : null;
    },
  };
}

// The notes for the plain rendering: each note's text, and the notes no marker points to, by the page they start on.
function plainNotes(P) {
  const { book, units, regions, markersOf } = P;
  const text = uid => {
    const out = [];
    const walk = unit => { for (const child of unit?.children || []) {
      if (child.region) { const R = regions[child.region]; if (R) out.push((R.region.lines || []).map(L => lineHtml(L.text || "", (L.spans || []).filter(s => s.kind !== "note_marker"), () => "")).join(" ")); }
      else walk(units[child.unit]);
    } };
    walk(units[uid]);
    return out.join(" ");
  };
  const unlinked = new Map();
  for (const [flow, tops] of Object.entries(book.flows)) {
    if (flow === "main") continue;
    for (const uid of tops) {
      if ((markersOf[uid] || []).length) continue;
      let unit = units[uid], ref = null;
      while (unit && !ref) { const child = unit.children?.[0]; if (!child) break; if (child.region) ref = child.region; else unit = units[child.unit]; }
      const pid = ref && regions[ref]?.page.id;
      if (pid) { if (!unlinked.has(pid)) unlinked.set(pid, []); unlinked.get(pid).push(uid); }
    }
  }
  return { text, unlinked };
}

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
    provisionalPages: new Set() };
}

// HTML for the whole book, flow by flow. Consecutive units in one row (style.row, schema 0.3) stand side by side,
// as wide as the text allows (they wrap to one under the other where it is narrow). With `printed`, each unit and
// line piece is styled as the book prints it, from P.sheet (the book's style sheet) and its own style. With
// `figureSrc(ref)`, figures are <img> elements with that source (for a standalone export), not crops filled in later.
export function bookHtml(P, { printed = false, figureSrc = null, plain = false } = {}) {
  const { book, tl, units, regions, noteOf, markersOf } = P;
  const sheet = printed ? P.sheet || null : null;
  const styleAttr = s => (s ? ` style="${esc(s)}"` : "");
  // Plain (the Book view and the HTML export): no page numbers in the text, only anchors; each note beside its marker,
  // and a note no marker points to beside the start of its page.
  const notes = plain ? plainNotes(P) : null;
  const references = referencePages(P);
  const renderedNotes = new Set();
  const sidenote = (uid, cls = "", back = null) => {
    if (renderedNotes.has(uid)) return "";
    renderedNotes.add(uid);
    return `<span class="sidenote${cls}" id="sn-${safeId(uid)}">${notes.text(uid)}${back ? ` <a class="r-back" href="#${esc(back)}" title="Back to marker">↩</a>` : ""}</span>`;
  };
  const toc = tocTargets(P);
  let lastPage = null, flowNow = "main";
  const pageMark = pid => {
    if (pid === lastPage) return "";
    lastPage = pid;
    if (plain) return flowNow !== "main" ? "" : `<span class="r-pbanchor" id="pb-${safeId(pid)}"></span>` + (notes.unlinked.get(pid) || []).map(uid => sidenote(uid, " unlinked")).join("");
    const p = P.pages[pid];
    const scan = pid.replace(/^.*-page-0*/, "");
    return `<a class="r-pb" data-page="${esc(pid)}" title="scan page ${esc(scan)} (${esc(pid)}): open it">${p.label ? "p. " + esc(p.label) : "scan " + esc(scan)}</a>`;
  };
  const marker = pid => sp => {
    const a = `${pid}#${sp.id}`, note = noteOf[a];
    if (plain) return note ? `<a class="r-mk" id="mk-${esc(a)}" href="#sn-${safeId(note)}" data-sign="${esc(sp.marker)}" title="note ${esc(sp.marker)}"></a>${sidenote(note, "", `mk-${a}`)}`
      : `<span class="r-mk none" data-sign="${esc(sp.marker)}"></span>`;
    return note ? `<a class="r-mk" id="mk-${esc(a)}" href="#note-${esc(note)}" data-sign="${esc(sp.marker)}" title="note ${esc(sp.marker)}"></a>`
      : `<span class="r-mk none" id="mk-${esc(a)}" data-sign="${esc(sp.marker)}" title="a note marker not linked to a note"></span>`;
  };
  // The text of a run of regions of one unit, joined across line pieces, regions and pages. As printed, a line
  // piece's own style is kept, and a heading's lines are set one under the other.
  // `tail` goes after the last line's text (a verse group's marker, floated into the free space at its right).
  const regionsText = (refs, cls, tail = "") => {
    let out = "";
    refs.forEach((ref, k) => {
      const R = regions[ref];
      if (!R) { out += `<span class="bad">?? ${esc(ref)}</span>`; return; }
      const pid = R.page.id, lines = (R.region.lines || []).filter(spoken);
      out += pageMark(pid) + `<span class="r-reg" data-ref="${esc(ref)}">`;
      lines.forEach((L, i) => {
        const last = k === refs.length - 1 && i === lines.length - 1;
        // A verse's lines are its lines; other line ends of a provisional grouping are not known yet, so spaces.
        const end = P.provisionalPages?.has(pid) && cls !== "verse" ? "space" : L.end || (cls === "verse" ? "line" : "space");
        const shown = end === "hyphen" && !last ? dropHyphen(L) : L;
        if (cls === "table") { out += `<span class="r-row">${lineHtml(shown.text || "", shown.spans || [], marker(pid))}</span>`; return; }
        const text = lineHtml(shown.text || "", shown.spans || [], marker(pid));
        const ls = sheet && L.style ? css(sheet, L.style, { block: false }) : "";
        if (sheet && cls === "heading") { out += `<span class="r-ln"${styleAttr("display:block" + (ls ? ";" + ls : ""))}>${text}</span>`; return; }
        out += ls ? `<span${styleAttr(ls)}>${text}</span>` : text;
        if (last && tail) out += tail;   // after the text: it stays on the line only where it fits beside it
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
  // A verse (verses.js) has an anchor, v-N001, and below it links to its translation and notes; each of those an anchor,
  // v-notes-N001, and a link back to its verse.
  const verses = verseGroups(P.book, tl), anchored = new Set();
  const streamName = type => type.replaceAll("_", " ");
  const withVerse = (uid, html) => {
    const key = verses.keyOf.get(uid), g = key && verses.groups.get(key);
    if (!g) return html;
    let before = "", after = "";
    const anchor = id => { if (anchored.has(id)) return ""; anchored.add(id); return `<span class="r-vanchor" id="${esc(id)}"></span>`; };
    if (uid === (g.lead[0] || g.verse[0])) before = anchor(`v-${key}`);
    if (uid === g.verse[0]) {
      const links = Object.keys(g.companions).map(type => `<a href="#v-${esc(type)}-${esc(key)}">${esc(streamName(type))}</a>`);
      after = `<div class="r-vlinks"><span class="r-vkey">${esc(key)}</span>${links.length ? " · " + links.join(" · ") : ""}</div>`;
    }
    for (const [type, list] of Object.entries(g.companions)) if (list.includes(uid)) {
      const keys = [...verses.groups.values()].filter(other => other.companions[type]?.includes(uid)).map(other => other.key);
      before = keys.map(k => anchor(`v-${type}-${k}`)).join("");
      after = `<div class="r-vlinks">${keys.map(k => `<a href="#v-${esc(k)}" title="the verse">↑ ${esc(k)}</a>`).join(" · ")}</div>`;
    }
    return before + html + after;
  };
  const unitHtml = (uid, depth, tail = "") => withVerse(uid, unitBody(uid, depth, tail));
  const unitBody = (uid, depth, tail = "") => {
    const u = units[uid];
    if (!u) return "";
    const t = tl.types[u.type] || {}, cls = t.region;
    const lang = u.lang || t.lang;
    const own = sheet ? unitStyle(sheet, u.type, u.style) : null;
    const st = own ? css(sheet, own) : "";
    const anchor = cls !== "note" && (depth === 0 || u.type === "section") ? ` id="u-${safeId(uid)}"` : "";
    const attrs = `data-uid="${esc(uid)}" data-label="${esc(label(u))}"${lang ? ` lang="${esc(lang)}"` : ""}${anchor}`;
    const back = (markersOf[uid] || []).map(a => `<a class="r-back" href="#mk-${esc(a)}" title="back to the marker">↩</a>`).join("");
    const mixed = u.children.some(c => c.unit);
    // Verses that make one sentence, with their marker ((युगलकम्), (तिलकम्)) set in the free space at the right of the
    // last line rather than on a line of its own.
    if (u.type === "verse_group") {
      const kids = u.children.map(c => c.unit).filter(id => units[id]);
      const markId = kids.find(id => tl.types[units[id].type]?.region === "lead_in");
      const verses = kids.filter(id => id !== markId);
      const text = markId ? units[markId].children.filter(c => c.region).map(c => regions[c.region]).filter(Boolean)
        .map(R => (R.region.lines || []).map(L => lineHtml(L.text || "", L.spans || [], marker(R.page.id))).join(" ")).join(" ") : "";
      const mark = markId ? `<span class="r-vgmark" data-uid="${esc(markId)}" title="these verses make one sentence">${text}</span>` : "";
      return `<section class="r-unit r-verse_group" ${attrs}>${verses.map((id, i) => unitHtml(id, depth + 1, i === verses.length - 1 ? mark : "")).join("")}</section>`;
    }
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
    // A line of a printed table of contents ("title .... page"): the title, a dotted leader and the page, linked to
    // the section it names or else to its page.
    const entry = cls === "list_item" && tocLine(refs.flatMap(ref => (regions[ref]?.region.lines || []).map(L => L.text || "")).join(" "));
    if (entry) {
      const target = toc.find(entry);
      const pages = refs.map(ref => regions[ref] && pageMark(regions[ref].page.id)).join("");
      const title = target ? `<a href="#${target}">${esc(entry.title)}</a>` : esc(entry.title);
      return `<p class="r-tocline" ${attrs}>${pages}<span class="r-toctitle">${title}</span><span class="r-leader"></span><span class="r-tocpage">${esc(entry.page)}</span></p>`;
    }
    if (cls === "verse") return `<div class="r-verse" ${attrs}${styleAttr(st)}>${regionsText(refs, cls, tail)}</div>`;
    if (cls === "table") return `<div class="r-tablewrap" ${attrs}${styleAttr(st)}>${tableHtml(refs)}</div>`;
    if (cls === "note") return `<div class="r-note" id="note-${esc(uid)}" ${attrs}${styleAttr(st)}>${regionsText(refs, cls)}${back}</div>`;
    const text = regionsText(refs, cls);
    const linked = refs.length && refs.every(ref => regions[ref] && references.pages.has(regions[ref].page.id)) ? references.link(text) : text;
    return `<p class="r-para r-${esc(cls)}" ${attrs}${styleAttr(st)}>${linked}${back}</p>`;
  };
  let html = "";
  const flows = Object.keys(book.flows).sort((a, b) => (a === "main" ? -1 : b === "main" ? 1 : 0));
  for (const flow of flows) {
    lastPage = null; flowNow = flow;
    const tops = book.flows[flow];
    if (!tops.length) continue;
    html += `<section class="r-flow" data-flow="${esc(flow)}">`;
    if (flow !== "main") html += `<h2 class="r-flowname">${esc(tl.flows[flow] ? flow[0].toUpperCase() + flow.slice(1) : flow)}</h2>`;
    html += unitList(tops, 0);
    html += "</section>";
  }
  return html;
}

// The contents beside the Book view: the parts (top-level sections) and their sections, each by its label and number,
// after a link to the front matter and to a printed table of contents if the book has one.
export function bookToc(P) {
  const { book, units } = P;
  const tops = book.flows.main || [];
  const name = unit => `<span class="num">${esc(unit.number || "")}</span>${esc(unit.label || unit.number || "…")}`;
  const link = (uid, html, cls = "") => `<a href="#u-${safeId(uid)}"${cls ? ` class="${cls}"` : ""}>${html}</a>`;
  // The entries: the sections at the top of the main flow, or, in a book with none, its named containers (the chapters
  // its headings start); inside each, the sections or named containers it holds.
  const sectioned = tops.some(uid => units[uid]?.type === "section");
  const isEntry = unit => Boolean(unit) && (sectioned ? unit.type === "section" : Boolean(unit.label) && unit.children.some(child => child.unit));
  const isKid = unit => Boolean(unit) && (unit.type === "section" || !sectioned && Boolean(unit.label) && unit.children.some(child => child.unit));
  const first = tops.findIndex(uid => isEntry(units[uid]));
  let out = "";
  if (first > 0) out += link(tops[0], "Front matter", "front");
  const contents = tops.slice(0, first < 0 ? tops.length : first).find(uid => /toc/.test(units[uid]?.type || ""));
  if (contents) out += link(contents, "Contents (as printed)", "front");
  for (const uid of tops) {
    const unit = units[uid];
    if (!isEntry(unit)) continue;
    const kids = unit.children.map(child => units[child.unit]).filter(isKid);
    // A part the book gives no name keeps none here either.
    // A name the editor gave (not printed as the part's name) is in parentheses and lighter.
    const title = !unit.label ? `<span class="untitled">untitled in the book</span>`
      : unit.source?.label === "editor" ? `<span class="editorial">(${esc(unit.label)})</span>` : esc(unit.label);
    out += `<details class="part" open><summary>${link(uid, title)}</summary>${kids.map(kid => link(kid.id, name(kid), "ep")).join("")}</details>`;
  }
  const last = tops.findLastIndex(uid => isEntry(units[uid]));
  if (last >= 0 && last < tops.length - 1) out += link(tops[last + 1], "End", "front");
  return `<nav class="bv-toc" aria-label="Contents">${out}</nav>`;
}

// The Book view's behaviour, self-contained so the HTML export can carry it as a script: links within the book scroll
// to their place (in the app the address belongs to the app's own routes); on a narrow screen a note marker opens its
// note under the line; the contents follow the reading, marking the part and section in view; a button shows the
// contents where they do not fit beside the text.
export function wireBookView(root, scroller, { signal } = {}) {
  const top = () => scroller === window ? 0 : scroller.getBoundingClientRect().top;
  root.addEventListener("click", event => {
    if (event.target.closest(".bv-open")) { root.classList.toggle("toc-open"); return; }
    const groupMark = event.target.closest(".r-vgmark");
    if (groupMark) { groupMark.closest(".r-verse_group")?.classList.toggle("lit"); return; }   // a tap lights the verses the marker groups
    const a = event.target.closest('a[href^="#"]');
    if (!a) return;
    const target = root.querySelector(`[id="${a.getAttribute("href").slice(1)}"]`);
    if (!target) return;
    event.preventDefault();
    if (a.classList.contains("r-mk") && a.id) target.querySelector(".r-back")?.setAttribute("href", "#" + a.id);
    if (a.classList.contains("r-mk") && getComputedStyle(target).float === "none") {
      // Where notes do not fit in the margin, the note opens under its verse or paragraph, and a second tap closes it.
      const block = a.closest(".r-verse, .r-para, .r-heading, .r-tocline") || a.parentElement;
      const open = block.nextElementSibling;
      if (open && open.classList.contains("bv-inline-note") && open.dataset.for === target.id) { open.remove(); return; }
      const box = document.createElement("div");
      box.className = "bv-inline-note"; box.dataset.for = target.id; box.innerHTML = target.innerHTML;
      block.after(box);
      return;
    }
    root.classList.remove("toc-open");
    target.scrollIntoView({ block: "start" });
    if (scroller !== window) scroller.scrollTop -= 8;
  }, { signal });
  const links = [...root.querySelectorAll(".bv-toc a")], nav = root.querySelector(".bv-toc");
  const targets = links.map(a => root.querySelector(`[id="${a.getAttribute("href").slice(1)}"]`));
  let pending = false;
  const spy = () => {
    if (signal?.aborted) return;
    pending = false;
    let current = -1;
    targets.forEach((el, i) => { if (el && el.getBoundingClientRect().top - top() < 120) current = i; });
    links.forEach((a, i) => a.classList.toggle("active", i === current));
    const active = links[current];
    if (active && nav && !root.classList.contains("toc-open")) {
      const r = active.getBoundingClientRect(), n = nav.getBoundingClientRect();
      if (r.top < n.top || r.bottom > n.bottom) nav.scrollTop += r.top - n.top - n.height / 3;
    }
  };
  (scroller === window ? window : scroller).addEventListener("scroll", () => { if (!pending) { pending = true; requestAnimationFrame(spy); } }, { passive: true, signal });
  spy();
}

// The Book view's styles, shared by the app and the HTML export.
export const BOOK_CSS = `
.bookview { --toc: 15rem; --note: 14rem; --gap: 2.5rem; display: grid; grid-template-columns: var(--toc) minmax(0, 38rem) var(--note); column-gap: var(--gap); justify-content: center; align-items: start; }
.bookview .bv-toc { grid-column: 1; position: sticky; top: 0; max-height: 100vh; overflow-y: auto; box-sizing: border-box; padding: 1.5rem .25rem 4rem 0; font: 14px/1.45 system-ui, -apple-system, sans-serif; }
.bv-toc a { display: block; color: inherit; text-decoration: none; padding: 1px 6px; border-radius: 4px; }
.bv-toc a:hover { background: #f1eee4; }
.bv-toc a.active { background: #ece6d4; font-weight: 600; }
.bv-toc a.front { color: #666; margin-bottom: 2px; }
.bv-toc details.part { margin: .5em 0; }
.bv-toc summary { cursor: pointer; font-weight: 600; list-style-position: outside; }
.bv-toc summary a { display: inline; }
/* The number (or its empty column) hangs: an entry's wrapped lines line up with its first line's text. */
.bv-toc a.ep { padding-left: 3em; text-indent: -1.8em; }
.bv-toc a.ep .num { text-indent: 0; }
.bv-toc .num { color: #999; display: inline-block; min-width: 1.8em; }
.bv-toc .untitled { font-weight: normal; font-style: italic; color: #888; }
.bv-toc .editorial { font-weight: normal; color: #7a7466; }
.r-title_page { text-align: center; margin: 1.5em 0 4em; }
.r-title_page .r-para, .r-title_page .r-heading { text-align: center; margin: .6em 0; }
.r-verse_group { margin-left: -12px; padding-left: 10px; border-left: 2px solid transparent; border-radius: 2px; transition: background .15s; }
.r-vgmark { float: right; margin-left: 1em; font-size: .85em; color: #8a8170; cursor: pointer; }
.r-verse_group:has(.r-vgmark:hover), .r-verse_group.lit { border-left-color: #d9cfb5; background: #faf6ea; }
.bookview .reader { grid-column: 2; max-width: none; margin: 0; padding: 1.5rem 0 10rem; }
.bookview .reader:not(.printed) { font-size: 18px; line-height: 1.65; }
.bookview .reader:not(.printed) .r-verse { margin: .8em 0 .8em 1.5em; }
.bookview .reader:not(.printed) .r-para { margin: .5em 0; }
.bookview .reader:not(.printed) .r-heading { text-align: center; margin: 1.4em 0 .5em; }
/* A heading that ends its section (a closing line: "इति … ॥ १२ ॥") belongs to what it closes: close to the text above,
   a wider gap after. (A negative top margin, since it collapses with the verse's bottom margin.) */
.bookview .reader .r-unit > .r-heading:last-child { margin: -.3em 0 1.9em; }
.bookview .r-flow[data-flow]:not([data-flow="main"]) { display: none; }
.bookview .r-mk { cursor: pointer; }
.bookview .sidenote { float: right; clear: right; width: var(--note); margin: .15em calc(-1 * (var(--note) + var(--gap))) .6em 0; font-size: 13.5px; line-height: 1.45; color: #555; text-align: left; text-indent: 0; }
.bookview .sidenote.unlinked { color: #888; }
.bookview .r-unit[id] { scroll-margin-top: 8px; }
.bv-open { display: none; }
.r-tocline { display: flex; align-items: baseline; gap: .4em; margin: .1em 0; }
.r-tocline .r-leader { flex: 1; border-bottom: 1px dotted #bbb; }
.r-tocline a { color: inherit; text-decoration: none; }
.r-tocline a:hover { text-decoration: underline; }
@media (max-width: 1240px) {
  .bookview { grid-template-columns: minmax(0, 38rem) var(--note); }
  .bookview .reader { grid-column: 1; }
  .bookview .bv-toc { position: fixed; left: 0; top: 0; bottom: 0; z-index: 40; width: 19rem; max-height: none; padding: 1rem; background: #fdfdfb; box-shadow: 0 0 24px rgba(0,0,0,.18); transform: translateX(-105%); transition: transform .18s; }
  .bookview.toc-open .bv-toc { transform: none; }
  .bv-open { display: block; position: sticky; top: .5rem; z-index: 30; grid-column: 1 / -1; justify-self: start; font: 13px system-ui, sans-serif; padding: 4px 10px; border: 1px solid #ccc; border-radius: 6px; background: #fdfdfb; cursor: pointer; }
}
@media (max-width: 820px) {
  .bookview { grid-template-columns: minmax(0, 1fr); padding: 0 1rem; }
  .bookview .sidenote { display: none; float: none; }
  .bookview .bv-inline-note { margin: .2em 0 .7em 1.5em; padding: .35em .6em; font-size: 14px; line-height: 1.45; color: #555; background: #f6f3ea; border-left: 3px solid #d9cfb5; }
}
@media print { .bv-toc, .bv-open { display: none; } .bookview { display: block; } }

.bookview .r-pageref { color: inherit; text-decoration: underline dotted; text-underline-offset: 2px; }
.bookview .r-vlinks { font: 11px/1.4 system-ui, -apple-system, sans-serif; color: #8a8170; margin: .1em 0 .9em; text-indent: 0; }
.bookview .r-vlinks a { color: inherit; }
.bookview .r-vkey { font-variant-numeric: tabular-nums; letter-spacing: .02em; }`;

export async function renderBookView(el, app) {
  const { book, routeToken } = app;
  app.textPanel?.destroy();
  app.pageView?.destroy();
  app.textPanel = null; app.pageView = null; app.doc = null;
  el.replaceChildren(h("div", { class: "loading" }, "Loading the pages…"));
  const current = () => app.book === book && app.routeToken === routeToken;
  const all = await book.all((done, total) => {
    if (current()) el.firstChild.textContent = `Loading the pages… ${done} of ${total}`;
  });
  if (!current()) return;
  // The rest runs in one piece on the page's thread: say which part, and let the message show before each.
  const say = async text => { el.firstChild.textContent = text; await painted(); return current(); };
  if (!await say("Putting the book together…")) return;
  const readable = all.filter(doc => hasReading(doc, book.types));
  await book.getRules();
  const projection = bookReading(book.pages, readable, book.types, id => book.isSkipped?.(id), book.rules);
  const P = prepare(projection.docs, projection.types, book.style);
  if (!await say("Laying out the text…")) return;
  if (!document.getElementById("bookview-css")) document.head.append(h("style", { id: "bookview-css" }, BOOK_CSS));
  if (!P.book.units.length) {
    el.replaceChildren(h("p", { class: "loading" }, "Text appears here as pages are transcribed."));
    return;
  }
  const printed = Boolean((app.readerPrinted ?? true) && P.sheet);
  const view = h("div", { class: "bookview" });
  view.innerHTML = `<button class="bv-open" type="button">☰ Contents</button>${bookToc(P)}<article class="reader plain${printed ? " printed" : ""}"${printed ? ` style="${esc(baseCss(P.sheet))}"` : ""}>${bookHtml(P, { printed, plain: true })}</article>`;
  const first = P.book.pages[0];
  const editor = h("a", { href: workflowAddress("page", app.pid || first.id) }, "Open page editor");
  el.replaceChildren(h("div", { class: "blocks-reader-tools" }, editor, h("span", {}, "Double-click text to see its scan.")), view);
  wireSourceView(view, el, app, P);
  fillFigures(view, app, P);
  wireBookView(view, el);
  // An address naming a verse (#read&v=N001, from outside: the Bhartṛhari site) opens Read at it.
  const verse = new URLSearchParams(location.hash.replace(/^#/, "")).get("v");
  const target = verse && view.querySelector(`[id="v-${CSS.escape(verse)}"]`);
  if (target) { target.scrollIntoView({ block: "start" }); el.scrollTop -= 8; }
}

// Let the browser show what changed (a message) before a long piece of work: after the next frame, or soon in a tab
// that is not drawing frames.
const painted = () => new Promise(resolve => {
  let done = false;
  const go = () => { if (!done) { done = true; resolve(); } };
  requestAnimationFrame(() => setTimeout(go, 0));
  setTimeout(go, 60);
});

// Double-clicking a passage shows its region on the page image, by the passage, with a link to the page editor.
// A click elsewhere, Escape or scrolling closes it.
function wireSourceView(view, el, app, P) {
  const tip = h("div", { class: "r-source", role: "dialog", "aria-label": "The passage on its page", hidden: true });
  el.append(tip);
  let shown = null;
  const close = () => { tip.hidden = true; tip.replaceChildren(); shown = null; };
  view.addEventListener("dblclick", async event => {
    const passage = event.target.closest(".r-reg"), ref = passage?.dataset.ref, R = ref && P.regions[ref];
    if (!R || event.target.closest("a")) return;
    getSelection()?.removeAllRanges();
    shown = ref;
    const [pid, rid] = ref.split("#"), url = await app.book.imageUrl(pid);
    if (shown !== ref) return;
    const [x1, y1, x2, y2] = R.region.box || bbox(R.region.polygons);
    const pad = 12, bw = x2 - x1 + 2 * pad, bh = y2 - y1 + 2 * pad;
    const scale = Math.min(1, Math.min(640, innerWidth - 40) / bw, 420 / bh);
    const crop = h("div", { class: "r-source-crop", title: `${pid} ${rid}` });
    Object.assign(crop.style, { width: `${bw * scale}px`, height: `${bh * scale}px`, backgroundImage: `url("${url}")`,
      backgroundSize: `${R.page.width * scale}px ${R.page.height * scale}px`, backgroundPosition: `${-(x1 - pad) * scale}px ${-(y1 - pad) * scale}px` });
    const pdfPage = `PDF page ${(app.book.index?.[pid] ?? 0) + 1}`, where = R.page.label ? `p. ${R.page.label} · ${pdfPage}` : pdfPage;
    tip.replaceChildren(crop, h("div", { class: "r-source-bar" }, h("span", {}, where),
      h("a", { href: workflowAddress("page", pid, { region: rid }) }, "Open in the page editor"),
      h("button", { class: "mini", type: "button", "aria-label": "Close", onclick: close }, "×")));
    tip.hidden = false;
    // Below the passage where it fits, else above it.
    const rect = passage.getBoundingClientRect(), width = tip.offsetWidth, height = tip.offsetHeight;
    tip.style.left = `${Math.max(8, Math.min(innerWidth - width - 8, event.clientX - width / 2))}px`;
    tip.style.top = `${rect.bottom + 8 + height < innerHeight ? rect.bottom + 8 : Math.max(8, Math.min(rect.top, innerHeight) - height - 8)}px`;
  });
  view.addEventListener("click", event => { if (!tip.hidden && !tip.contains(event.target)) close(); });
  el.addEventListener("scroll", () => { if (!tip.hidden) close(); }, { passive: true });
  const onKey = event => {
    if (!tip.isConnected) { document.removeEventListener("keydown", onKey); return; }
    if (event.key === "Escape" && !tip.hidden) close();
  };
  document.addEventListener("keydown", onKey);
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
.r-pageref { color: inherit; text-decoration: underline dotted; text-underline-offset: 2px; }
.r-vlinks { font: 11px/1.4 system-ui, sans-serif; color: #8a8170; margin: .1em 0 .9em; }
.r-vlinks a { color: inherit; }
.r-vkey { font-variant-numeric: tabular-nums; letter-spacing: .02em; }
.r-mk { color: inherit; text-decoration: none; font-size: .7em; vertical-align: super; padding: 0 1px; }
.r-mk::before { content: attr(data-sign); }
.r-back { font-size: .8em; text-decoration: none; margin-left: 4px; }
.sc { font-variant: small-caps; }
.r-table { border-collapse: collapse; } .r-table td { padding: 1px 6px; }
@media print { .r-pb, .r-back { display: none; } .reader { margin: 0 auto; } }
`;

// A standalone HTML document of the book, laid out as the Book view: the contents beside the text and each note in
// the margin by its marker; as printed where the book has a style sheet, rows side by side, figures as images
// (figureSrc gives each figure region's image URL, such as a data: URL of its crop).
export function bookDocument(P, { title, lang = "", figureSrc }) {
  const printed = !!P.sheet;
  return `<!DOCTYPE html>
<html${lang ? ` lang="${esc(lang)}"` : ""}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>${EXPORT_CSS}${BOOK_CSS}</style></head>
<body><div class="bookview"><button class="bv-open" type="button">☰ Contents</button>${bookToc(P)}<article class="reader plain${printed ? " printed" : ""}"${printed ? ` style="${esc(baseCss(P.sheet))}"` : ""}>
${bookHtml(P, { printed, figureSrc, plain: true })}
</article></div>
<script>(${wireBookView.toString()})(document.querySelector(".bookview"), window);</script></body></html>
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
    const ls = (R.region.lines || []).filter(spoken);
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
