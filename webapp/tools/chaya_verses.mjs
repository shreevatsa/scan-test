// Write a śataka edition's verses, each with everything that belongs to it (lead-in, commentary, translation, notes,
// apparatus readings, footnotes) and the regions they are printed in, as JSON keyed as the Bhartṛhari site keys verses
// (N001…; js/verses.js). For linking or showing a verse's material from another site.
//   node webapp/tools/chaya_verses.mjs BOOK.chaya.pdf OUT.json
import { readFileSync, writeFileSync } from "node:fs";
import { readChaya } from "../js/chayapdf.js";
import { bookReading } from "../js/reading.js";
import { assemble } from "../js/assemble.js";
import { verseExport } from "../js/verses.js";

const [input, output] = process.argv.slice(2);
if (!input || !output) { console.error("usage: node webapp/tools/chaya_verses.mjs BOOK.chaya.pdf OUT.json"); process.exit(2); }
const { data: { files } } = await readChaya(new Uint8Array(readFileSync(input)));
const manifest = files["book.json"], types = files["types.json"];
const docs = manifest.pages.map(page => files[`edits/${page.id}.json`] || files[`pages/${page.id}.json`] || null);
const view = bookReading(manifest.pages, docs.filter(Boolean), types, new Set(manifest.skipped || []), manifest.rules);
const [book] = assemble(view.docs, view.types);
const verses = verseExport(book, view.types, manifest);
writeFileSync(output, JSON.stringify({ format: "verses", book: { id: manifest.book_id, title: manifest.title, pdf: manifest.pdf ? { name: manifest.pdf.name, sha256: manifest.pdf.sha256 } : null },
  keys: "the śataka's letter (N nīti, V vairāgya, S śṛṅgāra) and the verse's number, a miscellany going on from the last number", verses }, null, 1) + "\n");
const roles = {}; for (const v of verses) for (const p of v.parts) roles[p.role] = (roles[p.role] || 0) + 1;
console.log(`${verses.length} verses (${verses[0]?.key} … ${verses.at(-1)?.key}); parts: ${JSON.stringify(roles)}; wrote ${output}`);
