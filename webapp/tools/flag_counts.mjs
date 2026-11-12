// How many pages each review stage flags in a book, by flag kind, as the app's page grids count them
// (webapp/js/flags.js and workflow.js). Used to keep flags rare enough to be worth opening (NOTEBOOK.md).
//   node webapp/tools/flag_counts.mjs BOOK.chaya.pdf [--pages]
// --pages also lists each flagged page with its flags. Pages counts each page's flags at the stage it waits at.
import { readFileSync } from "node:fs";
import { readChaya } from "../js/chayapdf.js";
import { makeValidator, checkPage } from "../js/schema.js";
import { assemble } from "../js/assemble.js";
import { pageStages, reviewPageStates, stageFlags, currentStage, breakAtEmptyPages } from "../js/workflow.js";

const [path, ...options] = process.argv.slice(2);
if (!path) { console.error("usage: node webapp/tools/flag_counts.mjs BOOK.chaya.pdf [--pages]"); process.exit(2); }
const { data } = await readChaya(new Uint8Array(readFileSync(path)));
const files = data.files, manifest = files["book.json"], types = files[manifest.types];
const validate = makeValidator(JSON.parse(readFileSync(new URL("../schema.json", import.meta.url), "utf8")));
const states = new Map();
for (const page of manifest.pages) {
  const doc = files[`edits/${page.id}.json`] || files[page.document] || null;
  const [errors, warnings] = doc ? checkPage(validate, doc, types) : [[], []];
  states.set(page.id, { ...pageStages(doc, types, errors, warnings), runErrors: {} });
}
let warnings = [];
try { [, warnings] = assemble(breakAtEmptyPages([...states.values()].filter(state => state.valid && state.doc).map(state => state.doc)), types); } catch { /* invalid trees are flagged per page */ }
reviewPageStates(manifest.pages, states, types, warnings);

const kinds = { regions: "regionFlags", text: "textFlags", read: "readFlags" };
const total = manifest.pages.length;
const percent = n => `${(100 * n / total).toFixed(1)}%`;
const union = manifest.pages.filter(page => ["regions", "text", "read"].some(stage => stageFlags(states.get(page.id), stage).length)).length;
console.log(`any stage: ${union} of ${total} pages have a flag at some stage (${percent(union)})`);
for (const stage of ["pages", "regions", "text", "read"]) {
  const flagged = manifest.pages.filter(page => stageFlags(states.get(page.id), stage).length);
  console.log(`${stage}: ${flagged.length} of ${total} pages flagged (${percent(flagged.length)})`);
  const byKind = new Map();
  for (const page of manifest.pages) {
    const state = states.get(page.id), seen = new Set(), at = stage === "pages" ? currentStage(state) : stage;
    if (at === "text") for (const error of state.errors) seen.add("invalid");
    for (const flag of state[kinds[at]] || []) seen.add(flag.code);
    for (const code of seen) byKind.set(code, (byKind.get(code) || 0) + 1);
  }
  for (const [code, n] of [...byKind].sort((a, b) => b[1] - a[1])) console.log(`  ${code}: ${n} pages`);
  if (options.includes("--pages")) for (const page of flagged) console.log(`    ${page.id}: ${stageFlags(states.get(page.id), stage).join(" | ")}`);
}
