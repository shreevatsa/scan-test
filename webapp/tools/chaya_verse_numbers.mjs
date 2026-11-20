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

const DEV = "०१२३४५६७८९";
const toInt = s => Number([...s].map(c => DEV.includes(c) ? DEV.indexOf(c) : c).join(""));
const toDev = (n, like) => /[०-९]/.test(like) ? String(n).replace(/\d/g, d => DEV[d]) : String(n);
const NUMBER = /(?:॥|\|\||II|।।)\s*([०-९0-9]{1,4})\s*(?:॥|\|\||II|।।)?\s*$/;

// The verses in book order: [{ line, at, printed, value, page }] (null value where no number is printed).
export function verseNumbers(docs, type = "verse") {
  const out = [];
  for (const doc of docs) {
    const regions = new Map(doc.page.regions.map(region => [region.id, region]));
    const units = new Map(doc.units.map(unit => [unit.id, unit]));
    const walk = id => {
      const unit = units.get(id); if (!unit) return;
      if (unit.type !== type) { for (const child of unit.children) if (child.unit) walk(child.unit); return; }
      if (unit.open?.end) return;   // its number is printed where it ends, on a later page
      const last = [...unit.children].reverse().find(child => child.region);
      const region = last && regions.get(last.region.split("#").pop()), line = region?.lines?.at(-1);
      const match = line && NUMBER.exec(line.text || "");
      out.push(match ? { line, at: match.index + match[0].indexOf(match[1]), printed: match[1], value: toInt(match[1]), page: doc.page.id } : { line: null, value: null, page: doc.page.id });
    };
    for (const id of doc.flows.main || []) walk(id);
  }
  return out;
}

const digitsDiffer = (a, b) => { const x = String(a), y = String(b); if (x.length !== y.length) return Infinity; let n = 0; for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) n++; return n; };

// Corrections for misread stretches: [{ item, value }], and the breaks left.
// Corrections for misread stretches: [{ item, value }], and the breaks left. Only numbered items count: a verse with no
// number of its own is most often a verse split across two units, and a closing with none is unnumbered in print.
export function sequenceFixes(verses, { longest = 100 } = {}) {
  const fixes = [], breaks = [];
  const numbered = verses.filter(item => item.value !== null);
  for (let k = 1; k < numbered.length; k++) {
    const prev = numbered[k - 1], cur = numbered[k], expected = prev.value + 1;
    if (cur.value === expected) continue;
    const delta = cur.value - expected;
    let j = k;   // the stretch off by delta
    while (j + 1 < numbered.length && j + 1 - k < longest && numbered[j + 1].value - (expected + (j + 1 - k)) === delta) j++;
    // The numbering goes on as before after the stretch, or the stretch runs up to a restart (१ again).
    const after = numbered[j + 1], resumes = after && (after.value === expected + (j + 1 - k) || (after.value === 1 && j > k));
    const stretch = numbered.slice(k, j + 1).map((item, i) => ({ item, value: expected + i }));
    // A misread digit moves a number by 2 or more (५ read as ९: 4, 40, 400); an item missing or added moves it by 1.
    if (resumes && Math.abs(delta) >= 2 && stretch.every(fix => digitsDiffer(fix.item.value, fix.value) === 1)) {
      for (const fix of stretch) { fixes.push(fix); fix.item.value = fix.value; }
      k = j;
      continue;
    }
    // The first number after a restart, read ९ for १: the two after it say १.
    const [n1, n2] = [numbered[k + 1], numbered[k + 2]];
    if (n1 && n2 && n1.value === 2 && n2.value === 3 && cur.value !== 1 && digitsDiffer(cur.value, 1) === 1) {
      fixes.push({ item: cur, value: 1 }); cur.value = 1;
      breaks.push({ page: cur.page, previous: prev.value, read: 1, expected, restart: true });
    } else breaks.push({ page: cur.page, previous: prev.value, read: cur.value, expected, restart: cur.value === 1 });
  }
  return { fixes, breaks };
}

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
