// The Rāmāyaṇa-mañjarī's front matter regrouped by hand (as a person would in the page editor, so saved as corrections
// under edits/): each title page (the cover, the English title page, the notice behind it, the Sanskrit title page)
// becomes one `title_page` unit, a new container the reader sets centred, holding its statements — the series, the title,
// the author, the editors, the imprint — each one unit of its printed lines, kept as lines.
//   node front_matter.mjs IN.chaya.pdf OUT.chaya.pdf
import { readFileSync, writeFileSync } from "node:fs";
import { readChaya, writeChaya } from "../../webapp/js/chayapdf.js";
import { revisedTypeList } from "../../webapp/js/type-revisions.js";
import { noteEdit } from "../../webapp/js/layers.js";
import { makeValidator, checkPage } from "../../webapp/js/schema.js";

const PLAN = {
  3: [["heading", ["r1"]], ["paragraph", ["r2"]], ["heading", ["r3"]], ["paragraph", ["r4"]]],
  7: [["series_statement", ["r1"]], ["heading", ["r2", "r3"]], ["title_page_credit", ["r4", "r5"]],
      ["title_page_credit", ["r6", "r7", "r8", "r9", "r10", "r11", "r12", "r13", "r14"]],
      ["imprint", ["r15", "r16", "r17", "r18", "r19"]], ["imprint", ["r20"]], ["imprint", ["r21"]]],
  8: [["paragraph", ["r2"]], ["paragraph", ["r3"]]],
  9: [["heading", ["r1"]], ["heading", ["r2"]], ["heading", ["r3"]], ["paragraph", ["r4"]], ["paragraph", ["r5"]], ["paragraph", ["r7"]], ["paragraph", ["r8"]]],
};
const [input, output] = process.argv.slice(2);
const { data, original } = await readChaya(new Uint8Array(readFileSync(input)));
const files = data.files, manifest = files["book.json"];
const contains = ["heading", "paragraph", "series_statement", "title_page_credit", "imprint"];
if (!files["types.json"].types.title_page) files["types.json"] = revisedTypeList(files["types.json"], [{ kind: "add", name: "title_page", region: "container", flow: "main", contains,
  description: "A title page, a cover or the notice behind a title page: its statements (series, title, author, editors, imprint) set centred, each with its printed lines." }]);
const types = files["types.json"], validate = makeValidator(JSON.parse(readFileSync(new URL("../../webapp/schema.json", import.meta.url), "utf8")));
for (const [pdf, plan] of Object.entries(PLAN)) {
  const page = manifest.pages.find(p => p.pdf_page === Number(pdf)), before = files[`edits/${page.id}.json`] || files[`pages/${page.id}.json`];
  const doc = structuredClone(before), regions = new Map(doc.page.regions.map(r => [r.id, r]));
  const units = plan.map(([type, ids], i) => {
    const pieces = ids.flatMap(id => regions.get(id).lines || []);
    pieces.forEach((piece, k) => { if (k < pieces.length - 1) piece.end = "line"; else delete piece.end; });   // each printed line stays a line
    return { id: `f${i + 1}`, type, children: ids.map(id => ({ region: `${page.id}#${id}` })) };
  });
  doc.units = [{ id: "tp", type: "title_page", children: units.map(u => ({ unit: u.id })) }, ...units];
  doc.flows = { ...doc.flows, main: ["tp"] };
  delete doc.relations;
  const edited = noteEdit(before, doc);
  const [errors] = checkPage(validate, edited, types);
  if (errors.length) throw new Error(`PDF ${pdf}: ${errors[0]}`);
  files[`edits/${page.id}.json`] = edited;
  console.log(`PDF ${pdf}: ${units.length} statements`, JSON.stringify(edited.source.layers.units));
}
data.saved_at_utc = new Date().toISOString(); data.saved_by = "methods/100-hydrogen-low-whole-page-reading/front_matter.mjs";
writeFileSync(output, await writeChaya(original, data));
