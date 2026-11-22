// Verse numbers checked against their sequence, by rule. Each verse's number is read from the end of its last line
// ("॥ १२८ ॥"). Numbered verses should go up by one. Where a stretch of numbers (at most 100) is off by the same amount,
// at least 2, and the numbering then goes on as before or restarts at १, the stretch was misread (this font's ५ is read
// as ९ or ६), and each number in it is corrected when it differs from the expected one in a single digit. A number
// followed by २ and ३, a single digit away from १, becomes १ (the first verse after a restart, read ९). Restarts and
// other breaks are listed, not changed. Run with --type=section_closing for the episode numbers on closing lines.
//   node webapp/tools/chaya_verse_numbers.mjs IN OUT [--type=verse] [--report=FILE.json]
import { readFileSync, writeFileSync } from "node:fs";
import { readChaya, writeChaya } from "../js/chayapdf.js";
import { makeValidator, checkPage } from "../js/schema.js";

import { toDev, verseNumbers, sequenceFixes } from "../js/number-rules.js";
export { toDev, verseNumbers, sequenceFixes };

export async function verseNumberFix(bytes, { type = "verse" } = {}) {
  const { data, original } = await readChaya(bytes);
  const files = data.files, manifest = files["book.json"], skipped = new Set(manifest.skipped || []);
  const pagesMeta = manifest.pages.filter(page => !skipped.has(page.id) && files[`pages/${page.id}.json`]);
  const pathOf = page => files[`edits/${page.id}.json`] ? `edits/${page.id}.json` : `pages/${page.id}.json`;
  const docs = pagesMeta.map(page => files[pathOf(page)]);
  const verses = verseNumbers(docs, type);
  const { fixes, breaks } = sequenceFixes(verses);
  const changed = new Set();
  for (const fix of fixes) {
    const chars = [...fix.item.line.text], at = [...fix.item.line.text.slice(0, fix.item.at)].length, length = [...fix.item.printed].length;
    const printed = toDev(fix.value, fix.item.printed);
    chars.splice(at, length, ...printed);
    const shift = [...printed].length - length;
    for (const span of fix.item.line.spans || []) { if (span.start > at) span.start += shift; if (span.end > at) span.end += shift; }
    fix.item.line.text = chars.join("");
    changed.add(fix.item.page);
  }
  for (const doc of docs) if (changed.has(doc.page.id))
    doc.source.layers.text = { ...doc.source.layers.text, rule_fixes: [...new Set([...(doc.source.layers.text?.rule_fixes || []), "verse numbers by sequence (webapp/tools/chaya_verse_numbers.mjs)"])] };
  const validate = makeValidator(JSON.parse(readFileSync(new URL("../schema.json", import.meta.url), "utf8")));
  const invalid = docs.filter(doc => checkPage(validate, doc, files["types.json"])[0].length).length;
  const pdfPage = new Map(pagesMeta.map(page => [page.id, page.pdf_page])), pdfPageOf = id => pdfPage.get(id);
  const report = { corrections: fixes.map(fix => `PDF ${pdfPageOf(fix.item.page)}: ${fix.item.printed} → ${toDev(fix.value, fix.item.printed)}`), verses: verses.length, numbered: verses.filter(v => v.value !== null).length, fixed: fixes.length, pages_changed: changed.size, invalid,
    restarts: breaks.filter(b => b.restart).map(b => `PDF ${pdfPage.get(b.page)}: after ${b.previous}`),
    breaks: breaks.filter(b => !b.restart).map(b => `PDF ${pdfPage.get(b.page)}: after ${b.previous}, read ${b.read}, expected ${b.expected}`) };
  data.saved_at_utc = new Date().toISOString(); data.saved_by = "webapp/tools/chaya_verse_numbers.mjs";
  return { bytes: invalid ? null : await writeChaya(original, data), report };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  const [input, output, ...flags] = process.argv.slice(2), opt = Object.fromEntries(flags.map(flag => flag.replace(/^--/, "").split(/=(.*)/s).slice(0, 2)));
  if (!input || !output) { console.error("usage: node webapp/tools/chaya_verse_numbers.mjs IN OUT [--type=verse] [--report=FILE.json]"); process.exit(2); }
  const { bytes, report } = await verseNumberFix(new Uint8Array(readFileSync(input)), { type: opt.type || "verse" });
  if (opt.report) writeFileSync(opt.report, JSON.stringify(report, null, 1));
  console.log(JSON.stringify({ ...report, corrections: report.corrections.length, breaks: report.breaks.length, firstBreaks: report.breaks.slice(0, 15) }, null, 1));
  if (bytes) { writeFileSync(output, bytes); console.log("wrote", output); } else { console.error("not written"); process.exit(1); }
}
