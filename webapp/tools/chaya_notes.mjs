// Note markers and their links, by rule, with no model (the rules are in webapp/js/note-links.js). On every page:
//  1. In the running text (regions of types in a flow other than the notes'), a footnote marker the transcription left
//     as ordinary text becomes a note marker: a superscript span holding only a number or sign (¹, *, †), a superscript
//     digit character, or digits printed against a letter ("सूरी१नाम", "राजन्३"). The marker's characters leave the
//     text and a zero-width note-marker span stands where they were.
//  2. Only with --from-quotes: a note that quotes a reading and still has no marker gets one after the word closest to the
//     quote (placeFromQuotes). Off by default: a note's quote does not always name its marker's word (method 099, page 60).
//  3. Each note marker is linked to the note on the same page whose printed number (from the start of its first line,
//     "१." or "(3)") is the same, in reading order where a number is used twice. A note continued from an earlier page
//     has no number of its own and is not linked here.
//   node webapp/tools/chaya_notes.mjs IN OUT [--report=FILE.json] [--from-quotes]
import { readFileSync, writeFileSync } from "node:fs";
import { readChaya, writeChaya } from "../js/chayapdf.js";
import { assemble } from "../js/assemble.js";
import { makeValidator, checkPage } from "../js/schema.js";
import { markLine, linkNotes, placeFromQuotes, noteTypesOf } from "../js/note-links.js";

export async function notes(bytes, { fromQuotes = false } = {}) {
  const { data, original } = await readChaya(bytes);
  const files = data.files, manifest = files["book.json"], types = files["types.json"], skipped = new Set(manifest.skipped || []);
  const { noteTypes, mainTypes } = noteTypesOf(types);
  const pagesMeta = manifest.pages.filter(page => !skipped.has(page.id) && files[`pages/${page.id}.json`]);
  const pathOf = page => files[`edits/${page.id}.json`] ? `edits/${page.id}.json` : `pages/${page.id}.json`;
  const docs = pagesMeta.map(page => structuredClone(files[pathOf(page)]));
  const report = { pages: docs.length, made: { superscript_span: 0, superscript_char: 0, tagged: 0, glued_digits: 0, from_quotes: 0 }, markers: 0, notes: 0, links: 0, unmatchedMarkers: 0, notesWithoutMarker: 0, pages_notes_no_markers: [], pages_unmatched: [], placements: [] };
  for (const [index, doc] of docs.entries()) {
    const ids = new Set(doc.page.regions.flatMap(region => (region.lines || []).flatMap(line => (line.spans || []).map(span => span.id).filter(Boolean))));
    let n = 0; const newId = () => { let id; do id = `nm${++n}`; while (ids.has(id)); ids.add(id); return id; };
    let changed = 0;
    for (const region of doc.page.regions) if (mainTypes.has(region.type)) for (const line of region.lines || []) {
      const made = markLine(line, newId);
      for (const [kind, count] of Object.entries(made)) { report.made[kind] += count; changed += count; }
    }
    const placed = fromQuotes ? placeFromQuotes(doc, noteTypes, mainTypes, newId) : [];
    report.made.from_quotes += placed.length; changed += placed.length;
    for (const value of placed) report.placements.push({ pdf_page: pagesMeta[index].pdf_page, ...value, score: Math.round(value.score * 100) / 100 });
    if (changed) doc.source.layers.text = { ...doc.source.layers.text, rule_fixes: [...new Set([...(doc.source.layers.text?.rule_fixes || []), "note markers (webapp/tools/chaya_notes.mjs)"])] };
    const result = linkNotes(doc, noteTypes, mainTypes);
    report.markers += result.markers; report.notes += result.notes; report.links += result.links;
    report.unmatchedMarkers += result.unmatched.length; report.notesWithoutMarker += result.notesWithoutMarker;
    if (result.notes && !result.markers) report.pages_notes_no_markers.push(pagesMeta[index].pdf_page ?? index);
    if (result.unmatched.length) report.pages_unmatched.push(`${pagesMeta[index].pdf_page ?? index}: ${result.unmatched.join(" ")}`);
  }
  const validate = makeValidator(JSON.parse(readFileSync(new URL("../schema.json", import.meta.url), "utf8")));
  const problems = [];
  for (const [index, doc] of docs.entries()) { const [errors] = checkPage(validate, doc, types); if (errors.length) problems.push(`${pagesMeta[index].pdf_page}: ${errors[0]}`); }
  report.invalidPages = problems.length; report.firstProblems = problems.slice(0, 5);
  const [book, warnings] = assemble(docs, types);
  report.warnings = warnings.length; report.bookRelations = (book.relations || []).length;
  if (!problems.length) for (const [index, page] of pagesMeta.entries()) files[pathOf(page)] = docs[index];
  data.saved_at_utc = new Date().toISOString(); data.saved_by = "webapp/tools/chaya_notes.mjs";
  return { bytes: problems.length ? null : await writeChaya(original, data), report };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  const [input, output, ...flags] = process.argv.slice(2), opt = Object.fromEntries(flags.map(flag => flag.replace(/^--/, "").split(/=(.*)/s).slice(0, 2)));
  if (!input || !output) { console.error("usage: node webapp/tools/chaya_notes.mjs IN OUT [--report=FILE.json] [--from-quotes]"); process.exit(2); }
  const { bytes, report } = await notes(new Uint8Array(readFileSync(input)), { fromQuotes: "from-quotes" in opt });
  if (opt.report) writeFileSync(opt.report, JSON.stringify(report, null, 1));
  const { pages_notes_no_markers, pages_unmatched, placements, ...summary } = report;
  console.log(JSON.stringify({ ...summary, pagesWithNotesButNoMarkers: pages_notes_no_markers.length, pagesWithUnmatchedMarkers: pages_unmatched.length }, null, 1));
  if (bytes) { writeFileSync(output, bytes); console.log("wrote", output); } else { console.error("not written: some pages do not pass the checks"); process.exit(1); }
}
