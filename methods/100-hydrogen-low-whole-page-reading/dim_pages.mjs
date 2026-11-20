// Dim pages (leave them out of the book), as the × on a page in the app's Pages grid does: here PDF 242 and 243, a
// second scan of PDF 240 and 241 (the same printed pages 226–227, the same verses ४७९–५०३).
//   node dim_pages.mjs IN OUT 242,243
import { readFileSync, writeFileSync } from "node:fs";
import { readChaya, writeChaya } from "../../webapp/js/chayapdf.js";
const [input, output, list] = process.argv.slice(2);
const { data, original } = await readChaya(new Uint8Array(readFileSync(input)));
const manifest = data.files["book.json"], wanted = new Set(list.split(",").map(Number));
manifest.skipped = [...new Set([...(manifest.skipped || []), ...manifest.pages.filter(p => wanted.has(p.pdf_page)).map(p => p.id)])];
writeFileSync(output, await writeChaya(original, data));
console.log("dimmed:", manifest.skipped.length, "pages");
