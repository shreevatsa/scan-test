// A book as one standalone HTML page, laid out as the app's Book view (contents beside the text, notes in the margin):
// the same as Export's HTML, from the command line. Pages awaiting transcription and dimmed pages are left out, as in
// Read; figures are left empty (the app's export fills them with their crops).
//   node webapp/tools/chaya_html.mjs IN.chaya.pdf OUT.html
import { readFileSync, writeFileSync } from "node:fs";
import { readChaya } from "../js/chayapdf.js";
import { prepare, bookDocument } from "../js/reader.js";
import { bookReading } from "../js/reading.js";
import { hasReading } from "../js/workflow.js";

const [input, output] = process.argv.slice(2);
if (!input || !output) { console.error("usage: node webapp/tools/chaya_html.mjs IN.chaya.pdf OUT.html"); process.exit(2); }
const { data } = await readChaya(new Uint8Array(readFileSync(input)));
const files = data.files, manifest = files["book.json"], skipped = new Set(manifest.skipped || []);
const docs = manifest.pages.filter(page => !skipped.has(page.id)).map(page => files[`edits/${page.id}.json`] || files[`pages/${page.id}.json`])
  .filter(doc => hasReading(doc, files["types.json"]));
const view = bookReading(manifest.pages, docs, files["types.json"], skipped, manifest.rules);
const P = prepare(view.docs, view.types, files["style.json"] || null);
writeFileSync(output, bookDocument(P, { title: manifest.title || files["types.json"].title, lang: (files["types.json"].languages || [])[0] || "", figureSrc: () => "" }));
console.log(`${docs.length} pages, ${P.book.units.length} units, ${P.warnings.length} warnings → ${output}`);
