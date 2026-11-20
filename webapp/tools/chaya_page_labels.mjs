// Printed page numbers checked against their sequence, by rule. Each page's label is read again from its page-number
// text (pageLabel, as the app does after reading), then the labels are compared with their neighbours in PDF order,
// where every page counts (a page that prints no number, such as a part's first page, still takes one): between two runs
// of at least three pages that agree, implying the same numbering, the pages take the numbers implied (pageNumberFixes).
// The page-number text is corrected with the label. Restarts (the front matter's own numbering) are listed.
//   node webapp/tools/chaya_page_labels.mjs IN OUT [--report=FILE.json]
import { readFileSync, writeFileSync } from "node:fs";
import { readChaya, writeChaya } from "../js/chayapdf.js";
import { pageLabel } from "../js/pipeline/steps.js";

const DEV = "०१२३४५६७८९";

// [{ index, value }] in page order → corrections [{ entry, value }] and breaks. Each page's offset is its number less
// its place in the book. A run of at least three numbered pages with one offset is trusted; between two trusted runs
// with the same offset, at most `gap` pages apart, every numbered page takes the number they imply. Runs with
// different offsets (a new numbering) are listed as breaks, as is any page left out of agreement.
export function pageNumberFixes(entries, { least = 3, gap = 12 } = {}) {
  const numbered = entries.filter(entry => entry.value !== null);
  const offset = entry => entry.value - entry.index;
  const runs = [];
  for (let k = 0; k < numbered.length;) {
    let j = k; while (j + 1 < numbered.length && offset(numbered[j + 1]) === offset(numbered[k])) j++;
    if (j - k + 1 >= least) runs.push({ from: k, to: j, offset: offset(numbered[k]) });
    k = j + 1;
  }
  const fixes = [], breaks = [];
  for (let r = 1; r < runs.length; r++) {
    const before = runs[r - 1], after = runs[r], between = numbered.slice(before.to + 1, after.from);
    if (before.offset === after.offset && numbered[after.from].index - numbered[before.to].index <= gap + 1) {
      for (const entry of between) { const value = entry.index + before.offset; if (value !== entry.value) { fixes.push({ entry, value }); entry.value = value; } }
    } else breaks.push({ entry: numbered[after.from], previous: numbered[before.to].value, read: numbered[after.from].value, expected: numbered[before.to].value + (numbered[after.from].index - numbered[before.to].index), pages: between.length });
  }
  return { fixes, breaks };
}

export async function pageLabels(bytes) {
  const { data, original } = await readChaya(bytes);
  const files = data.files, manifest = files["book.json"], skipped = new Set(manifest.skipped || []);
  const docsOf = page => [`pages/${page.id}.json`, `edits/${page.id}.json`].map(path => files[path]).filter(Boolean);
  let reread = 0;
  for (const page of manifest.pages) for (const doc of docsOf(page)) {
    const label = pageLabel(doc.page.regions);
    if ((label || null) !== (doc.page.label || null)) { reread += doc === docsOf(page).at(-1) ? 1 : 0; if (label) doc.page.label = label; else delete doc.page.label; }
  }
  const pages = manifest.pages.filter(page => !skipped.has(page.id) && docsOf(page).length);
  const entries = pages.map((page, index) => { const label = docsOf(page).at(-1).page.label; return { index, page, value: /^\d+$/.test(label || "") ? Number(label) : null }; });
  const { fixes, breaks } = pageNumberFixes(entries);
  for (const { entry, value } of fixes) for (const doc of docsOf(entry.page)) {
    doc.page.label = String(value);
    const region = doc.page.regions.find(r => r.type === "page_number" && (r.lines || []).some(l => /[0-9०-९]/.test(l.text || "")));
    const line = region?.lines.find(l => /[0-9०-९]/.test(l.text || ""));
    if (line) line.text = line.text.replace(/[0-9०-९]+/, String(value).replace(/\d/g, d => /[०-९]/.test(line.text) ? DEV[d] : d));
    doc.source.layers.text = { ...doc.source.layers.text, rule_fixes: [...new Set([...(doc.source.layers.text?.rule_fixes || []), "page numbers by sequence (webapp/tools/chaya_page_labels.mjs)"])] };
  }
  for (const page of manifest.pages) { const doc = docsOf(page).at(-1); if (doc) { if (doc.page.label) page.label = doc.page.label; else delete page.label; } }
  const report = { reread, fixed: fixes.length, corrections: fixes.map(({ entry, value }) => `PDF ${entry.page.pdf_page} → ${value}`),
    breaks: breaks.map(b => `PDF ${b.entry.page.pdf_page}: after ${b.previous}, a numbering from ${b.read} (${b.pages} pages between not settled)`) };
  data.saved_at_utc = new Date().toISOString(); data.saved_by = "webapp/tools/chaya_page_labels.mjs";
  return { bytes: await writeChaya(original, data), report };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  const [input, output, ...flags] = process.argv.slice(2), opt = Object.fromEntries(flags.map(flag => flag.replace(/^--/, "").split(/=(.*)/s).slice(0, 2)));
  if (!input || !output) { console.error("usage: node webapp/tools/chaya_page_labels.mjs IN OUT [--report=FILE.json]"); process.exit(2); }
  const { bytes, report } = await pageLabels(new Uint8Array(readFileSync(input)));
  if (opt.report) writeFileSync(opt.report, JSON.stringify(report, null, 1));
  console.log(JSON.stringify({ ...report, corrections: report.corrections.length }, null, 1));
  writeFileSync(output, bytes); console.log("wrote", output);
}
