// Group a book's units into sections from its closing lines, with no model: a unit of the closing type ends the episode
// it closes, and a closing whose text matches the part pattern also ends the part (a kāṇḍa) around its episodes. Each
// page document gets section containers (open at a page edge where the section goes on across the break), and the
// type list lets a section hold what stands in it. Reads a .chaya.pdf (best from chaya_baseline.mjs) and writes another.
// The book's own closing line after the last part (and anything between) stays outside the parts. With --part-heading,
// a heading that matches starts a new part where the part before it has no closing line.
// With --part-after, an episode's closing that matches also ends its part (a boundary the book does not print, inferred
// from content); with --division-closing, a closing that matches stands between episodes inside its part without ending
// it. Episodes take their name and number from their closing lines; parts take --part-labels in order. Each part records
// how its start and end were found (printed heading, printed closing, or inferred).
//   node webapp/tools/chaya_sections.mjs IN OUT [--closing=section_closing] [--part-closing='कथासारे'] [--part-heading='काण्ड']
//     [--part-after=PATTERN] [--division-closing=PATTERN] [--part-labels=बालकाण्डम्,…]
import { readFileSync, writeFileSync } from "node:fs";
import { readChaya, writeChaya } from "../js/chayapdf.js";
import { layerState } from "../js/layers.js";
import { assemble } from "../js/assemble.js";
import { revisedTypeList } from "../js/type-revisions.js";
import { makeValidator, checkPage } from "../js/schema.js";

const idOf = (doc, base) => { let n = 1; const taken = new Set(doc.units.map(unit => unit.id)); while (taken.has(`${base}${n}`)) n++; return `${base}${n}`; };

// For the units of a page's main flow in order: { id, part, episode } (null outside the body of the book).
// A closing line's name and number: "इति रावणवधः ॥ ४२ ॥" → { label: "रावणवधः", number: "४२" }; "इत्ययोध्या…" is इति + अयोध्या….
const SIGNS = { "ा": "आ", "ि": "इ", "ी": "ई", "ु": "उ", "ू": "ऊ", "े": "ए", "ै": "ऐ", "ो": "ओ", "ौ": "औ" };
export function closingName(text) {
  const match = /^\s*\(?\s*(इति\s+|इती\s+|इत्य|इती|इति)(.+?)\s*(?:॥\s*([०-९0-9]+)\s*॥)?\s*[।॥]?\s*\)?\s*$/.exec(text || "");
  if (!match) return {};
  let label = match[2].trim().replace(/\s+समाप्त[ःम्]?$/, "");
  if (match[1] === "इत्य") label = SIGNS[label[0]] ? SIGNS[label[0]] + label.slice(1) : "अ" + label;
  if (match[1] === "इती") label = "इ" + label;   // इति + इक्ष्वाकु…
  return { label, ...(match[3] ? { number: match[3] } : {}) };
}

export function sectionKeys(pages, { closing, partClosing, partHeading = null, partAfter = null, divisionClosing = null, textOf }) {
  const list = [];
  for (const [pageIndex, doc] of pages.entries()) for (const id of doc.flows.main || []) {
    const unit = doc.units.find(value => value.id === id);
    const heading = Boolean(partHeading) && unit.type === "heading";
    list.push({ pageIndex, id, unit, closing: unit.type === closing, part: null, episode: null, partEnd: false,
      text: unit.type === closing || heading ? textOf(doc, unit) : "" });
  }
  const firstVerse = list.findIndex(item => item.unit.type === "verse");
  if (firstVerse < 0) return list;
  const start = list.findIndex(item => item.pageIndex === list[firstVerse].pageIndex);        // the page where the verses begin
  const isDivision = item => item.closing && divisionClosing && divisionClosing.test(item.text);
  const isPartClosing = item => item.closing && !isDivision(item) && partClosing.test(item.text);
  // The body ends at the last part's closing line (what follows, such as the book's own closing, stays outside the
  // parts), or at the last closing line where no part closes.
  let end = -1, lastPart = -1;
  list.forEach((item, index) => { if (item.closing) { end = index; if (isPartClosing(item)) lastPart = index; } });
  if (lastPart >= 0) end = lastPart;
  let part = 0, episode = 0, partHasItems = false;
  const parts = [{ starts: "where the verses begin" }];
  const next = starts => { parts.at(-1).ends ||= starts.replace(/^after /, "at "); part++; episode++; partHasItems = false; parts.push({ starts }); };
  for (let index = start; index <= end; index++) {
    const item = list[index];
    // A part's heading starts a new part where the one before it has no closing line of its own.
    if (partHeading && item.unit.type === "heading" && partHeading.test(item.text) && partHasItems) { parts.at(-1).ends = "at the next part's heading"; next(`printed heading: ${item.text}`); }
    item.part = part; if (item.unit.type !== "heading") partHasItems = true;   // a title before a part's heading is not its content
    if (isPartClosing(item)) { item.partEnd = true; parts.at(-1).ends = `printed closing: ${item.text}`; next("after a printed closing"); }
    else if (isDivision(item)) episode++;                              // stands between episodes, inside the part
    else {
      item.episode = episode;
      if (item.closing) { episode++; if (partAfter && partAfter.test(item.text)) { parts.at(-1).ends = `inferred: after ${item.text}`; next(`inferred: after ${item.text}`); } }
    }
  }
  parts.length = part + (partHasItems ? 1 : 0);
  // Names: each episode from its closing line.
  const names = new Map();
  for (const item of list) if (item.closing && item.episode !== null) names.set(item.episode, closingName(item.text));
  for (const item of list) if (item.episode !== null) item.episodeName = names.get(item.episode) || {};
  list.parts = parts;
  return list;
}

// Rewrite one page's main flow with section containers. Returns the number of containers made.
export function groupPage(doc, items, previous, next, { partLabels = [], parts = [] } = {}) {
  const flow = doc.flows.main || [];
  const here = items.filter(item => item.unit && flow.includes(item.id));
  if (!here.some(item => item.part !== null)) return 0;
  const sameAs = (a, b, key) => Boolean(a && b && a[key] !== null && a[key] === b[key] && (key === "part" || a.part === b.part));
  const top = [], made = [];
  let made_n = 0;
  const container = (children, open, meta = {}) => {
    const unit = { id: idOf(doc, "sec-"), type: "section", children: children.map(id => ({ unit: id })) };
    if (meta.number) unit.number = meta.number;
    if (meta.label) unit.label = meta.label;
    if (open.start || open.end) unit.open = open;
    unit.source = { made_by: "rule: closing lines (webapp/tools/chaya_sections.mjs)", ...(meta.source || {}) };
    doc.units.push(unit); made_n++; return unit.id;
  };
  for (let i = 0; i < here.length;) {
    const first = here[i];
    if (first.part === null) { top.push(first.id); i++; continue; }
    let j = i; while (j + 1 < here.length && here[j + 1].part === first.part) j++;
    const partItems = here.slice(i, j + 1), partChildren = [];
    for (let a = 0; a < partItems.length;) {
      const item = partItems[a];
      if (item.episode === null) { partChildren.push(item.id); a++; continue; }
      let b = a; while (b + 1 < partItems.length && partItems[b + 1].episode === item.episode) b++;
      const run = partItems.slice(a, b + 1);
      const open = { start: run[0] === here[0] && sameAs(previous, run[0], "episode") && previous.part === run[0].part, end: run.at(-1) === here.at(-1) && sameAs(next, run.at(-1), "episode") && next.part === run.at(-1).part };
      partChildren.push(container(run.map(value => value.id), open, run[0].episodeName || {}));
      a = b + 1;
    }
    const open = { start: partItems[0] === here[0] && sameAs(previous, partItems[0], "part"), end: partItems.at(-1) === here.at(-1) && sameAs(next, partItems.at(-1), "part") };
    const info = parts[first.part] || {};
    top.push(container(partChildren, open, { label: partLabels[first.part], source: { starts: info.starts, ends: info.ends } }));
    i = j + 1;
  }
  doc.flows.main = top;
  return made_n;
}

export async function sections(bytes, { closing = "section_closing", partPattern = "कथासारे", partHeading = null, partAfter = null, divisionClosing = null, partLabels = [] } = {}) {
  const { data, original } = await readChaya(bytes);
  const files = data.files, manifest = files["book.json"], skipped = new Set(manifest.skipped || []);
  const pagesMeta = manifest.pages.filter(page => !skipped.has(page.id) && files[`pages/${page.id}.json`]);
  const pathOf = page => files[`edits/${page.id}.json`] ? `edits/${page.id}.json` : `pages/${page.id}.json`;
  // A section may hold what stands in it: the closing line and the verse-group marker, besides what it holds already.
  const section = files["types.json"].types.section;
  const holds = new Set([...(section.contains || []), closing, ...Object.keys(files["types.json"].types).filter(name => name === "verse_group_marker")]);
  const types = revisedTypeList(files["types.json"], [{ kind: "rules", name: "section", contains: [...holds], flow: section.flow }]);
  files["types.json"] = types;
  const revision = types.source.revision;
  const docs = pagesMeta.map(page => structuredClone(files[pathOf(page)]));
  const textOf = (doc, unit) => unit.children.filter(child => child.region).map(child => doc.page.regions.find(region => region.id === child.region.split("#").pop())).flatMap(region => (region?.lines || []).map(line => line.text || "")).join(" ");
  const re = value => value ? new RegExp(value) : null;
  const items = sectionKeys(docs, { closing, partClosing: new RegExp(partPattern), partHeading: re(partHeading), partAfter: re(partAfter), divisionClosing: re(divisionClosing), textOf });
  const report = { pages: docs.length, containers: 0, parts: new Set(items.filter(i => i.part !== null).map(i => i.part)).size, episodes: new Set(items.filter(i => i.episode !== null).map(i => i.episode)).size };
  const before = docs.reduce((n, doc) => n + doc.units.length, 0);
  for (const [index, doc] of docs.entries()) {
    const mine = items.filter(item => item.pageIndex === index);
    const previous = [...items.slice(0, items.indexOf(mine[0]))].reverse().find(item => item.pageIndex < index) || null;
    const after = mine.length ? items[items.indexOf(mine.at(-1)) + 1] : null;
    // The neighbour is the nearest main-flow unit on another page, so pages with none are looked past, as assembly does.
    const made = groupPage(doc, mine, mine.length ? previous : null, mine.length ? after : null, { partLabels, parts: items.parts });
    report.containers += made;
    if (made) doc.source.layers = { ...doc.source.layers, units: { state: "model", made_by: "rule: closing lines (webapp/tools/chaya_sections.mjs)", types_revision: revision } };
  }
  const validate = makeValidator(JSON.parse(readFileSync(new URL("../schema.json", import.meta.url), "utf8")));
  const problems = [];
  for (const [index, doc] of docs.entries()) { const [errors] = checkPage(validate, doc, types); if (errors.length) problems.push(`${pagesMeta[index].pdf_page}: ${errors[0]}`); }
  report.invalidPages = problems.length; report.firstProblems = problems.slice(0, 5);
  const [book, warnings] = assemble(docs, types);
  report.warnings = warnings.length; report.firstWarnings = warnings.slice(0, 5);
  report.leafUnitsBefore = before; report.unitsAfter = docs.reduce((n, doc) => n + doc.units.length, 0);
  report.topLevelSections = book.flows.main.filter(id => book.units.find(unit => unit.id === id)?.type === "section").length;
  report.outline = book.flows.main.map(id => book.units.find(unit => unit.id === id)).filter(unit => unit?.type === "section")
    .map(unit => `${unit.label || "?"}: ${unit.children.filter(child => book.units.find(u => u.id === child.unit)?.type === "section").length} episodes (starts ${unit.source?.starts}; ends ${unit.source?.ends})`);
  if (!problems.length) for (const [index, page] of pagesMeta.entries()) files[pathOf(page)] = docs[index];
  data.saved_at_utc = new Date().toISOString(); data.saved_by = "webapp/tools/chaya_sections.mjs";
  return { bytes: problems.length ? null : await writeChaya(original, data), report };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  const [input, output, ...flags] = process.argv.slice(2), opt = Object.fromEntries(flags.map(flag => flag.replace(/^--/, "").split(/=(.*)/s).slice(0, 2)));
  if (!input || !output) { console.error("usage: node webapp/tools/chaya_sections.mjs IN OUT [--closing=TYPE] [--part-closing=PATTERN] [--part-heading=PATTERN] [--part-after=PATTERN] [--division-closing=PATTERN] [--part-labels=A,B,…]"); process.exit(2); }
  const { bytes, report } = await sections(new Uint8Array(readFileSync(input)), { closing: opt.closing, partPattern: opt["part-closing"], partHeading: opt["part-heading"],
    partAfter: opt["part-after"], divisionClosing: opt["division-closing"], partLabels: opt["part-labels"] ? opt["part-labels"].split(",") : [] });
  console.log(JSON.stringify(report, null, 1));
  if (bytes) { writeFileSync(output, bytes); console.log("wrote", output); } else { console.error("not written: some pages do not pass the checks"); process.exit(1); }
}
