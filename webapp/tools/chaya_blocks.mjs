// Write a converted copy of a book with its page documents in the blocks form (schema 0.4, webapp/js/blocks-format.js),
// for inspection, and print what the conversion needed. The input is never changed. Pages the book dims are left as
// they are. The app does not read this form yet.
//   node webapp/tools/chaya_blocks.mjs IN.chaya.pdf OUT.chaya.pdf
import { readFileSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { readChaya, writeChaya } from "../js/chayapdf.js";
import { blocksContext, toBlocks, fromBlocks, structureOf, assembledStructure, countOverrides } from "../js/blocks-format.js";

const bytesOf = value => Buffer.byteLength(JSON.stringify(value));
const zipped = value => gzipSync(JSON.stringify(value)).length;

// Converts the effective documents (edits/ over pages/) of `files` in place; returns the report.
export function convertBook(files) {
  const manifest = files["book.json"], types = files["types.json"], skipped = new Set(manifest.skipped || []);
  const keys = manifest.pages.filter(page => !skipped.has(page.id)).map(page => files[`edits/${page.id}.json`] ? `edits/${page.id}.json` : files[`pages/${page.id}.json`] ? `pages/${page.id}.json` : null);
  const docs = keys.map(key => key && files[key]);
  const context = blocksContext(docs, manifest.rules);
  const report = { book: manifest.title, pages: docs.filter(Boolean).length, overrides: {}, pagesWithOverrides: 0, mismatches: [],
    bytes: { before: 0, after: 0, structureBefore: 0, overridesAfter: 0, beforeGzip: 0, afterGzip: 0 } };
  const converted = docs.map(doc => doc && toBlocks(doc, types, context));
  const back = converted.map(doc => doc && fromBlocks(JSON.parse(JSON.stringify(doc)), types, context));
  docs.forEach((doc, index) => {
    if (!doc) return;
    const blocks = converted[index];
    const counts = countOverrides(blocks.overrides);
    if (Object.keys(counts).length) report.pagesWithOverrides++;
    for (const [kind, n] of Object.entries(counts)) report.overrides[kind] = (report.overrides[kind] || 0) + n;
    report.bytes.before += bytesOf(doc); report.bytes.after += bytesOf(blocks);
    report.bytes.beforeGzip += zipped(doc); report.bytes.afterGzip += zipped(blocks);
    report.bytes.structureBefore += bytesOf({ units: doc.units, flows: doc.flows, relations: doc.relations });
    report.bytes.overridesAfter += bytesOf(blocks.overrides);
    if (JSON.stringify(structureOf(back[index])) !== JSON.stringify(structureOf(doc))) report.mismatches.push(doc.page.id);
    files[keys[index]] = blocks;
  });
  const same = JSON.stringify(assembledStructure(back, types)) === JSON.stringify(assembledStructure(docs, types));
  report.assembledBookSame = same && !report.mismatches.length;
  return report;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) { console.error("Usage: node webapp/tools/chaya_blocks.mjs IN.chaya.pdf OUT.chaya.pdf"); process.exit(2); }
  if (input === output) { console.error("OUT must be a different file from IN"); process.exit(2); }
  const { data, original } = await readChaya(readFileSync(input));
  const report = convertBook(data.files);
  console.log(JSON.stringify(report, null, 2));
  if (!report.assembledBookSame) { console.error("The conversion is not lossless; not written."); process.exit(1); }
  writeFileSync(output, await writeChaya(original, data));
  console.log("wrote", output);
}
