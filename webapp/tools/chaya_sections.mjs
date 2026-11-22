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

import { closingName, sectionKeys, groupPage } from "../js/section-rules.js";
export { closingName, sectionKeys, groupPage };

export async function sections(bytes, { closing = "section_closing", partPattern = "कथासारे", partHeading = null, partAfter = null, divisionClosing = null, partLabels = [] } = {}) {
  const { data, original } = await readChaya(bytes);
  const files = data.files, manifest = files["book.json"], skipped = new Set(manifest.skipped || []);
  const pagesMeta = manifest.pages.filter(page => !skipped.has(page.id) && files[`pages/${page.id}.json`]);
  const pathOf = page => files[`edits/${page.id}.json`] ? `edits/${page.id}.json` : `pages/${page.id}.json`;
  // A section may hold what stands in it: the closing line and the verse-group marker, besides what it holds already.
  const section = files["types.json"].types.section;
  const docs = pagesMeta.map(page => structuredClone(files[pathOf(page)]));
  const textOf = (doc, unit) => unit.children.filter(child => child.region).map(child => doc.page.regions.find(region => region.id === child.region.split("#").pop())).flatMap(region => (region?.lines || []).map(line => line.text || "")).join(" ");
  const re = value => value ? new RegExp(value) : null;
  const items = sectionKeys(docs, { closing, partClosing: new RegExp(partPattern), partHeading: re(partHeading), partAfter: re(partAfter), divisionClosing: re(divisionClosing), textOf });
  // A section may hold what stands in it: the closing line, a verse group, whatever falls inside a part or an episode.
  const holds = new Set([...(section.contains || []), closing, ...items.filter(item => item.part !== null).map(item => item.unit.type)]);
  const types = revisedTypeList(files["types.json"], [{ kind: "rules", name: "section", contains: [...holds], flow: section.flow }]);
  files["types.json"] = types;
  const revision = types.source.revision;
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
