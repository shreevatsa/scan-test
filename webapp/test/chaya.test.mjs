// A book inside its PDF (webapp/js/chayapdf.js): written, read back, saved again without growing, the original
// recovered exactly. Run from the repository root:  node --test webapp/test/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { writeChaya, readChaya, recoverOriginal, sha256hex } from "../js/chayapdf.js";

const ROOT = new URL("../..", import.meta.url).pathname;

// A minimal one-page PDF with a classic cross-reference table.
function tinyPdf() {
  const objs = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
                "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 300] >>"];
  let out = "%PDF-1.4\n", offs = [];
  objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const x = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f\r\n` + offs.map(o => `${String(o).padStart(10, "0")} 00000 n\r\n`).join("");
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF\n`;
  return new TextEncoder().encode(out);
}

const book = n => ({ format: "chaya-book", version: 1, saved_by: "test", files: { "book.json": { book_id: "t", n }, "pages/t-page-001.json": { page: { width: 10, height: 20 } }, "work/x.txt": "ಕನ್ನಡ text" } });

test("written, read back, saved again on the original, original recovered", async () => {
  const pdf = tinyPdf();
  const a = await writeChaya(pdf, book(1));
  const ra = await readChaya(a);
  assert.deepEqual(ra.data, book(1));
  assert.equal(ra.recovered, true);
  assert.deepEqual(ra.original, pdf);
  // Saving again from the .chaya.pdf rebuilds the update on the original: the same size for the same data, and new
  // data replaces the old (one book, not two).
  assert.equal((await writeChaya(a, book(1))).length, a.length);
  const b = await writeChaya(a, book(2));
  assert.equal((await readChaya(b)).data.files["book.json"].n, 2);
  assert.ok(b.length < a.length + 100, "no growth");
  assert.deepEqual(await recoverOriginal(b), pdf);
  // A plain PDF has no book.
  assert.equal((await readChaya(pdf)).data, null);
  assert.equal(await recoverOriginal(pdf), null);
});

test("an encrypted PDF is refused", async () => {
  const pdf = new TextDecoder().decode(tinyPdf()).replace("/Root 1 0 R >>", "/Root 1 0 R /Encrypt 1 0 R >>");
  await assert.rejects(writeChaya(new TextEncoder().encode(pdf), book(1)), /encrypted/);
});

// The tiny PDF with an earlier incremental update that gave it an attachment of its own, in a name tree under
// /Kids: the update must follow the earlier one, and keep the attachment (in one flat list with chaya.json).
function updatedPdf() {
  const base = new TextDecoder().decode(tinyPdf());
  const prev = base.slice(base.lastIndexOf("startxref") + 10).trim().split(/\s/)[0];
  let out = base, offs = {};
  const add = (n, body) => { offs[n] = out.length; out += `${n} 0 obj\n${body}\nendobj\n`; };
  add(4, "<< /Type /EmbeddedFile /Length 5 >>\nstream\nhello\nendstream");
  add(5, "<< /Type /Filespec /F (note.txt) /UF (note.txt) /EF << /F 4 0 R >> >>");
  add(6, "<< /Names [(note.txt) 5 0 R] /Limits [(note.txt) (note.txt)] >>");
  add(7, "<< /Kids [6 0 R] >>");
  add(8, "<< /EmbeddedFiles 7 0 R >>");
  add(1, "<< /Type /Catalog /Pages 2 0 R /Names 8 0 R >>");
  const x = out.length;
  const entry = n => `${String(offs[n]).padStart(10, "0")} 00000 n\r\n`;
  out += `xref\n1 1\n${entry(1)}4 5\n${[4, 5, 6, 7, 8].map(entry).join("")}trailer\n<< /Size 9 /Root 1 0 R /Prev ${prev} >>\nstartxref\n${x}\n%%EOF\n`;
  return new TextEncoder().encode(out);
}

test("a PDF updated before, with an attachment tree of its own", async () => {
  const pdf = updatedPdf();
  const out = await writeChaya(pdf, book(4));
  const r = await readChaya(out);
  assert.deepEqual(r.data, book(4));
  assert.deepEqual(r.original, pdf);
  const update = new TextDecoder("latin1").decode(out.subarray(pdf.length));
  assert.ok(/\/Names \[\(chaya\.json\) \d+ 0 R \(note\.txt\) 5 0 R\]/.test(update), "one flat list, sorted, with the PDF's own attachment kept");
  const text = new TextDecoder("latin1").decode(pdf);
  const lastXref = text.slice(text.lastIndexOf("startxref") + 10).trim().split(/\s/)[0];
  assert.ok(update.includes(`/Prev ${lastXref}`), "the update follows the earlier one");
});

// Kale's PDF (in the repository): a cross-reference stream and object streams.
const KALE = join(ROOT, "Kale-1913-pp21-272.pdf");
test("a .chaya.pdf of Kale's PDF", { skip: !existsSync(KALE) }, async () => {
  const pdf = new Uint8Array(readFileSync(KALE));
  const out = await writeChaya(pdf, book(3));
  const r = await readChaya(out);
  assert.deepEqual(r.data, book(3));
  assert.equal(await sha256hex(r.original), await sha256hex(pdf));
  assert.equal((await writeChaya(out, book(3))).length, out.length, "no growth on saving again");
});
