// The reader's HTML for a made-up book with a style sheet (schema 0.3): rows side by side, styles as printed,
// figures, and the standalone document. Run from the repository root:  node --test webapp/test/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { prepare, bookHtml, bookDocument, bookText, fillFigures } from "../js/reader.js";
import { makeValidator, checkPage } from "../js/schema.js";

const ROOT = new URL("../..", import.meta.url).pathname;
const validate = makeValidator(JSON.parse(readFileSync(join(ROOT, "webapp/schema.json"), "utf8")));

const TL = { format: "types", schema_version: "0.2", book_id: "test", title: "A made-up book", flows: { main: "The text." },
  types: {
    chapter: { description: "A chapter.", contains: ["heading", "paragraph", "figure"], flow: "main" },
    heading: { description: "A heading.", region: "heading" },
    paragraph: { description: "A paragraph, or a block of lines set apart.", region: "paragraph" },
    figure: { description: "A picture in the text.", region: "figure" },
  } };

const SHEET = { format: "style", schema_version: "0.3", book_id: "test",
  page: { width_pt: 411, height_pt: 638, text_box_pt: [56.6, 86.5, 354.2, 564] },
  fonts: { body: { family: ["Noto Serif Kannada", "serif"] }, display: { family: ["Noto Sans Kannada", "sans-serif"] } },
  base: { font: "body", size_pt: 12, leading_pt: 18, align: "justify" },
  types: { heading: { font: "display", weight: "bold", size_pt: 17.1, align: "center" }, paragraph: { indent_pt: 17 }, figure: { align: "center" } } };

const rect = (x0, y0, x1, y1) => [[[x0, y0], [x1, y0], [x1, y1], [x0, y1]]];
const piece = (line, y, text, style) => ({ line, polygons: rect(100, y, 1100, y + 40), text, ...(style ? { style } : {}) });

// Page 1: a title page (a figure, then a heading whose first line is at 29 pt) and an address in two columns.
// Page 2: a paragraph.
function pages() {
  const p1 = "test-page-001", p2 = "test-page-002";
  const one = { format: "page", schema_version: "0.3", book_id: "test",
    page: { id: p1, image: `${p1}.png`, width: 1200, height: 1600, regions: [
      { id: "r1", type: "figure", polygons: rect(500, 50, 700, 250), box: [500, 50, 701, 251] },
      { id: "r2", type: "heading", polygons: rect(100, 300, 1100, 420), lines: [piece(1, 300, "The Title", { size_pt: 29 }), piece(2, 380, "(Parts 1-4)")] },
      { id: "r3", type: "paragraph", polygons: rect(100, 600, 500, 700), lines: [piece(3, 600, "Head Office"), piece(4, 650, "Some Road")] },
      { id: "r4", type: "paragraph", polygons: rect(800, 600, 1100, 700), lines: [piece(3, 600, "Branch Office"), piece(4, 650, "Another Road")] } ] },
    units: [{ id: "u1", type: "chapter", children: [{ unit: "u2" }, { unit: "u3" }, { unit: "u4" }, { unit: "u5" }] },
            { id: "u2", type: "figure", label: "a symbol", children: [{ region: `${p1}#r1` }] },
            { id: "u3", type: "heading", children: [{ region: `${p1}#r2` }] },
            { id: "u4", type: "paragraph", style: { indent_pt: 0, row: "k1", width: 0.4 }, children: [{ region: `${p1}#r3` }] },
            { id: "u5", type: "paragraph", style: { align: "right", indent_pt: 0, row: "k1", width: 0.32 }, children: [{ region: `${p1}#r4` }] }],
    flows: { main: ["u1"] } };
  const two = { format: "page", schema_version: "0.2", book_id: "test",
    page: { id: p2, image: `${p2}.png`, width: 1200, height: 1600, regions: [
      { id: "r1", type: "paragraph", polygons: rect(100, 200, 1100, 240), lines: [piece(1, 200, "A paragraph of the text.")] } ] },
    units: [{ id: "u1", type: "chapter", children: [{ unit: "u2" }] }, { id: "u2", type: "paragraph", children: [{ region: `${p2}#r1` }] }],
    flows: { main: ["u1"] } };
  return [one, two];
}

test("rows, styles and figures in the reader's HTML", () => {
  assert.deepEqual(validate(SHEET), [], "the style sheet is valid");
  for (const d of pages()) assert.deepEqual(checkPage(validate, d, TL)[0], [], `${d.page.id} is valid`);
  const P = prepare(pages(), TL, SHEET);
  const plain = bookHtml(P), printed = bookHtml(P, { printed: true });
  // The address: one row of two columns, in both views.
  for (const html of [plain, printed]) {
    assert.equal(html.split('<div class="r-row">').length - 1, 1, "one row");
    assert.ok(/<div class="r-row"><div class="r-col" style="flex-basis:40%">[^]*Head Office[^]*<div class="r-col" style="flex-basis:32%">[^]*Branch Office/.test(html));
  }
  assert.ok(!/style=/.test(plain.replace(/ style="flex-basis:\d+%"/g, "")), "the plain view has no styles but the rows' widths");
  assert.ok(/text-align:right/.test(printed), "the right column is set flush right");
  assert.ok(/font-size:calc\(var\(--pt, 1pt\) \* 29\)/.test(printed), "the title is 29 pt");
  assert.ok(/text-indent:calc\(var\(--pt, 1pt\) \* 17\)/.test(printed), "a paragraph has its type's first-line indent");
  assert.ok(printed.includes('class="r-reg r-fig"'), "figures are crops filled in later");
  const doc = bookDocument(P, { title: "t", lang: "kn", figureSrc: ref => `data:image/png;base64,${ref.length}` });
  assert.ok(doc.startsWith("<!DOCTYPE html>") && doc.includes('<img class="r-figimg" src="data:image/png;base64,'), "a standalone document with images");
  assert.ok(doc.includes("max-width:calc(var(--pt, 1pt) * 297.6)"), "the book's measure");
  assert.ok(bookText(P).includes("[figure: a symbol]"));
});

test("figures in Read retain the full crop when the detected ink covers only a small area", async () => {
  const docs = pages(), region = docs[0].page.regions[0];
  region.polygons = rect(550, 60, 570, 80);
  const image = { dataset: { ref: `${docs[0].page.id}#r1` }, style: {} };
  await fillFigures({ querySelectorAll: () => [image] }, { book: { imageUrl: async () => "page.png" } }, prepare(docs, TL));
  assert.equal(image.style.width, "201px");
  assert.equal(image.style.height, "201px");
  assert.equal(image.style.backgroundPosition, "-500px -50px");
});
