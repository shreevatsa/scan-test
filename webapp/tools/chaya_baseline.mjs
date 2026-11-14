// A baseline for a book with no problems in its units: every page back to the grouping built from its regions (what it
// has before a model's completion), and no page-break continuation that cannot be honoured, so that the book reads as a
// plain sequence of its units. Reads a .chaya.pdf and writes another; the first is not changed.
//   node webapp/tools/chaya_baseline.mjs IN.chaya.pdf OUT.chaya.pdf
import { readFileSync, writeFileSync } from "node:fs";
import { readChaya, writeChaya } from "../js/chayapdf.js";
import { layerState } from "../js/layers.js";
import { groupingReset } from "../js/workflow.js";
import { assemble } from "../js/assemble.js";

// Remove the open ends at page breaks that assembly could not join (no matching unit on the other side): the units
// stay, only the flags that point at nothing go. Returns how many flags were cleared.
export function clearUnmatchedBreaks(docs) {
  let cleared = 0;
  const unit = (doc, id) => doc.units.find(value => value.id === id);
  for (let i = 1; i < docs.length; i++) {
    const prev = docs[i - 1], cur = docs[i];
    for (const flow of Object.keys(cur.flows)) {
      const lastId = (prev.flows[flow] || []).at(-1), last = lastId && unit(prev, lastId);
      const starts = cur.flows[flow].map(id => unit(cur, id)).filter(value => value.open?.start);
      const joins = last?.open?.end && starts.length && last.type === starts[0].type;
      if (last?.open?.end && !joins) { delete last.open.end; if (!Object.keys(last.open).length) delete last.open; cleared++; }
      if (starts.length && !joins) for (const value of starts) { delete value.open.start; if (!Object.keys(value.open).length) delete value.open; cleared++; }
    }
  }
  return cleared;
}

export async function baseline(bytes) {
  const { data, original } = await readChaya(bytes);
  const files = data.files, manifest = files["book.json"], types = files["types.json"], skipped = new Set(manifest.skipped || []);
  const pages = manifest.pages.filter(page => !skipped.has(page.id) && files[`pages/${page.id}.json`]);
  const report = { pages: pages.length, reset: 0, cleared: 0, warningsBefore: 0, warningsAfter: 0 };
  const current = page => files[`edits/${page.id}.json`] ? [`edits/${page.id}.json`, files[`edits/${page.id}.json`]] : [`pages/${page.id}.json`, files[`pages/${page.id}.json`]];
  report.warningsBefore = assemble(pages.map(page => current(page)[1]), types)[1].length;
  const docs = [];
  for (const [index, page] of pages.entries()) {
    const [path, doc] = current(page);
    const units = layerState(doc, "units");
    if (units && units.state !== "provisional" && !units.accepted) {
      files[path] = groupingReset(doc, types, { firstPage: index === 0, lastPage: index === pages.length - 1 });
      report.reset++;
    }
    docs.push(files[path]);
  }
  report.cleared = clearUnmatchedBreaks(docs);
  report.warningsAfter = assemble(docs, types)[1].length;
  data.saved_at_utc = new Date().toISOString();
  data.saved_by = "webapp/tools/chaya_baseline.mjs";
  return { bytes: await writeChaya(original, data), report };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) { console.error("usage: node webapp/tools/chaya_baseline.mjs IN.chaya.pdf OUT.chaya.pdf"); process.exit(2); }
  const { bytes, report } = await baseline(new Uint8Array(readFileSync(input)));
  writeFileSync(output, bytes);
  console.log(JSON.stringify(report));
}
