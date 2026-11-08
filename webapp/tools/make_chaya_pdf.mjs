// A book folder as a .chaya.pdf: its source PDF with the book's data attached (webapp/js/chayapdf.js).
//   node webapp/tools/make_chaya_pdf.mjs FOLDER [OUT.chaya.pdf]
// The folder must hold source.pdf (webapp/tools/add_source_pdf.py puts it there). Every file but source.pdf and the
// page images goes into chaya.json; each page's entry in book.json gains the page's width and height (from its page
// document), which the app needs to draw the page from the PDF. Default output: <folder>/../<book id>.chaya.pdf.
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { writeChaya, readChaya, sha256hex } from "../js/chayapdf.js";

const [folder, outArg] = process.argv.slice(2);
if (!folder) { console.error("usage: node webapp/tools/make_chaya_pdf.mjs FOLDER [OUT.chaya.pdf]"); process.exit(2); }
const manifest = JSON.parse(readFileSync(join(folder, "book.json"), "utf8"));
const pdfPath = join(folder, manifest.pdf?.path || "source.pdf");
if (!existsSync(pdfPath)) { console.error(`${pdfPath} is missing: run webapp/tools/add_source_pdf.py first`); process.exit(1); }
const original = new Uint8Array(readFileSync(pdfPath));
const files = {};
const walk = dir => {
  for (const name of readdirSync(join(folder, dir))) {
    const rel = dir ? `${dir}/${name}` : name;
    if (statSync(join(folder, rel)).isDirectory()) { if (rel !== "images") walk(rel); continue; }
    if (rel === (manifest.pdf?.path || "source.pdf") || rel.startsWith("images/") || rel === "book.json") continue;
    const text = readFileSync(join(folder, rel), "utf8");
    files[rel] = rel.endsWith(".json") ? JSON.parse(text) : text;
  }
};
walk("");
for (const p of manifest.pages) {
  const doc = files[p.document];
  if (doc) { p.width = doc.page.width; p.height = doc.page.height; }
  delete p.image;
}
files["book.json"] = manifest;
const data = { format: "chaya-book", version: 1,
               original: { name: manifest.pdf?.name || "source.pdf", sha256: await sha256hex(original), length: original.length },
               saved_at_utc: new Date().toISOString(), saved_by: "webapp/tools/make_chaya_pdf.mjs", files };
const out = outArg || join(dirname(folder), `${manifest.book_id}.chaya.pdf`);
const bytes = await writeChaya(original, data);
writeFileSync(out, bytes);
const back = await readChaya(bytes);
const same = JSON.stringify(back.data) === JSON.stringify(data);
console.log(`${out}: ${bytes.length} bytes (original ${original.length}, data ${bytes.length - original.length}); ${Object.keys(files).length} files;`,
  `read back: ${same ? "the same" : "DIFFERENT"}; original recovered: ${back.recovered}`);
if (!same || !back.recovered) process.exit(1);
