// Group a book's units into sections from its closing lines, with no model: a unit of the closing type ends the episode
// it closes, and a closing whose text matches the part pattern also ends the part (a kāṇḍa) around its episodes. Each
// page document gets section containers (open at a page edge where the section goes on across the break), and the
// type list lets a section hold what stands in it. Reads a .chaya.pdf (best from chaya_baseline.mjs) and writes another.
//   node webapp/tools/chaya_sections.mjs IN OUT [--closing=section_closing] [--part-closing='कथासारे|मञ्जरी समाप्ता']
import { readFileSync, writeFileSync } from "node:fs";
import { readChaya, writeChaya } from "../js/chayapdf.js";
import { layerState } from "../js/layers.js";
import { assemble } from "../js/assemble.js";
import { revisedTypeList } from "../js/type-revisions.js";
import { makeValidator, checkPage } from "../js/schema.js";

const idOf = (doc, base) => { let n = 1; const taken = new Set(doc.units.map(unit => unit.id)); while (taken.has(`${base}${n}`)) n++; return `${base}${n}`; };

// For the units of a page's main flow in order: { id, part, episode } (null outside the body of the book).
export function sectionKeys(pages, { closing, partClosing, textOf }) {
  const list = [];
  for (const [pageIndex, doc] of pages.entries()) for (const id of doc.flows.main || []) {
    const unit = doc.units.find(value => value.id === id);
    list.push({ pageIndex, id, unit, closing: unit.type === closing, part: null, episode: null, partEnd: false, text: unit.type === closing ? textOf(doc, unit) : "" });
  }
  const firstVerse = list.findIndex(item => item.unit.type === "verse");
  if (firstVerse < 0) return list;
  const start = list.findIndex(item => item.pageIndex === list[firstVerse].pageIndex);        // the page where the verses begin
  let end = -1; list.forEach((item, index) => { if (item.closing) end = index; });
  let part = 0, episode = 0;
  for (let index = start; index <= end; index++) {
    const item = list[index];
    item.part = part;
    if (item.closing && partClosing.test(item.text)) { item.partEnd = true; part++; episode++; }
    else { item.episode = episode; if (item.closing) episode++; }
  }
  return list;
}

// Rewrite one page's main flow with section containers. Returns the number of containers made.
export function groupPage(doc, items, previous, next) {
  const flow = doc.flows.main || [];
  const here = items.filter(item => item.unit && flow.includes(item.id));
  if (!here.some(item => item.part !== null)) return 0;
  const sameAs = (a, b, key) => Boolean(a && b && a[key] !== null && a[key] === b[key] && (key === "part" || a.part === b.part));
  const top = [], made = [];
  let made_n = 0;
  const container = (children, open) => { const unit = { id: idOf(doc, "sec-"), type: "section", children: children.map(id => ({ unit: id })) }; if (open.start || open.end) unit.open = open; doc.units.push(unit); made_n++; return unit.id; };
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
      partChildren.push(container(run.map(value => value.id), open));
      a = b + 1;
    }
    const open = { start: partItems[0] === here[0] && sameAs(previous, partItems[0], "part"), end: partItems.at(-1) === here.at(-1) && sameAs(next, partItems.at(-1), "part") };
    top.push(container(partChildren, open));
    i = j + 1;
  }
  doc.flows.main = top;
  return made_n;
}

export async function sections(bytes, { closing = "section_closing", partPattern = "कथासारे|मञ्जरी समाप्ता" } = {}) {
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
  const items = sectionKeys(docs, { closing, partClosing: new RegExp(partPattern), textOf });
  const report = { pages: docs.length, containers: 0, parts: new Set(items.filter(i => i.part !== null).map(i => i.part)).size, episodes: new Set(items.filter(i => i.episode !== null).map(i => i.episode)).size };
  const before = docs.reduce((n, doc) => n + doc.units.length, 0);
  for (const [index, doc] of docs.entries()) {
    const mine = items.filter(item => item.pageIndex === index);
    const previous = [...items.slice(0, items.indexOf(mine[0]))].reverse().find(item => item.pageIndex < index) || null;
    const after = mine.length ? items[items.indexOf(mine.at(-1)) + 1] : null;
    // The neighbour is the nearest main-flow unit on another page, so pages with none are looked past, as assembly does.
    const made = groupPage(doc, mine, mine.length ? previous : null, mine.length ? after : null);
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
  if (!problems.length) for (const [index, page] of pagesMeta.entries()) files[pathOf(page)] = docs[index];
  data.saved_at_utc = new Date().toISOString(); data.saved_by = "webapp/tools/chaya_sections.mjs";
  return { bytes: problems.length ? null : await writeChaya(original, data), report };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  const [input, output, ...flags] = process.argv.slice(2), opt = Object.fromEntries(flags.map(flag => flag.replace(/^--/, "").split(/=(.*)/s).slice(0, 2)));
  if (!input || !output) { console.error("usage: node webapp/tools/chaya_sections.mjs IN OUT [--closing=TYPE] [--part-closing=PATTERN]"); process.exit(2); }
  const { bytes, report } = await sections(new Uint8Array(readFileSync(input)), { closing: opt.closing, partPattern: opt["part-closing"] });
  console.log(JSON.stringify(report, null, 1));
  if (bytes) { writeFileSync(output, bytes); console.log("wrote", output); } else { console.error("not written: some pages do not pass the checks"); process.exit(1); }
}
