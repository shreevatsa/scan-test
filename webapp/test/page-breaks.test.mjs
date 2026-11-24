// Page breaks the region finder marked on one side only, settled by the text (blocks-format.js settleBreaks), and a
// paragraph interrupted by a quoted verse on one page (provisional.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readThroughBlocks } from "../js/reading.js";
import { assemble } from "../js/assemble.js";

const types = JSON.parse(readFileSync(new URL("../types/generic.json", import.meta.url)));
let n = 0;
// A page of blocks: [type, text, { from, later }] in reading order, each one line.
const page = blocks => {
  const id = `b-page-${String(++n).padStart(3, "0")}`;
  return { format: "page", schema_version: "0.4", book_id: "b", overrides: {}, source: {},
    page: { id, width: 1000, height: 1400, regions: blocks.map(([type, text, flags = {}], i) => {
      const ring = [[[100, 100 + i * 60], [900, 100 + i * 60], [900, 150 + i * 60], [100, 150 + i * 60]]];
      return { id: `r${i + 1}`, type, order: i + 1, polygons: ring, box: [100, 100 + i * 60, 900, 150 + i * 60],
        lines: [{ line: 1, text, polygons: ring }], source: { continues_from_earlier: Boolean(flags.from), continues_later: Boolean(flags.later) } };
    }) } };
};
const read = (docs, rules = null) => {
  const [book, warnings] = assemble(readThroughBlocks(docs, types, rules), types);
  const at = new Map(docs.map((doc, i) => [doc.page.id, i + 1]));
  const text = id => { const u = book.units.find(x => x.id === id); return u.children.map(c => c.region ? at.get(c.region.split("#")[0]) + c.region.split("#")[1] : `[${text(c.unit)}]`).join("+"); };
  return { flow: book.flows.main.map(id => `${book.units.find(x => x.id === id).type} ${text(id)}`), warnings: warnings.length };
};

test("one side marked, the text going on: the two blocks join", () => {
  const docs = [page([["paragraph", "It was so, and then -", { later: true }]]), page([["paragraph", "they went home."]])];
  assert.deepEqual(read(docs), { flow: ["paragraph 1r1+2r1"], warnings: 0 });
  assert.equal(read(docs, { settleBreaks: false }).warnings, 1, "as marked, the break does not match");
});

test("one side marked, the text ending a sentence: the mark is a slip and the blocks stay apart, unreported", () => {
  const docs = [page([["paragraph", "We believe it."]]), page([["paragraph", "Once upon a time…", { from: true }]])];
  assert.deepEqual(read(docs), { flow: ["paragraph 1r1", "paragraph 2r1"], warnings: 0 });
  const verse = [page([["verse", "सह वीर्यं करवावहै ॥"]]), page([["verse", "तेजस्वि नावधीतमस्तु", { from: true }]])];
  assert.deepEqual(read(verse).warnings, 0);
});

test("blocks of other types across the break are left to assembly (a plate, a verse after prose)", () => {
  const docs = [page([["paragraph", "the tree has its roots above,", { later: true }]]), page([["verse", "ऊर्ध्वमूलमधःशाखम्"]])];
  assert.equal(read(docs).flow.length, 2);
});

test("a paragraph interrupted by a quoted verse on its page stays as printed, and goes on to the next page", () => {
  const docs = [page([["paragraph", "As the verse says,", { later: true }], ["verse", "पञ्चेन्द्रियस्य देहस्य ।"], ["paragraph", "so it is with conduct,", { from: true, later: true }]]),
    page([["paragraph", "which is the root.", { from: true }]])];
  assert.deepEqual(read(docs), { flow: ["paragraph 1r1", "verse 1r2", "paragraph 1r3+2r1"], warnings: 0 });
});

test("a figure and its caption at the foot of a page, between a paragraph's two pieces: the figure floats and the paragraph joins", () => {
  const docs = [page([["paragraph", "The child lies", { later: true }], ["figure", ""], ["caption", "(Figure 1)"]]), page([["paragraph", "within the womb.", { from: true }]])];
  assert.deepEqual(read(docs), { flow: ["figure 1r2", "caption 1r3", "paragraph 1r1+2r1"], warnings: 0 });
});

test("a paragraph, the verse it quotes across the break, and the paragraph going on after it stay as printed", () => {
  const forward = [page([["paragraph", "When dharma declines,", { later: true }]]), page([["verse", "यदा यदा हि धर्मस्य"], ["paragraph", "as the Gita says."]])];
  assert.deepEqual(read(forward), { flow: ["paragraph 1r1", "verse 2r1", "paragraph 2r2"], warnings: 0 });
  const backward = [page([["paragraph", "Manu says"], ["verse", "पिता रक्षति कौमारे"]]), page([["paragraph", "so said Manu.", { from: true }]])];
  assert.deepEqual(read(backward), { flow: ["paragraph 1r1", "verse 1r2", "paragraph 2r1"], warnings: 0 });
});

test("blocks of two types at the break, the earlier ending a sentence: the one mark is a slip", () => {
  assert.deepEqual(read([page([["paragraph", "It is so.", { later: true }]]), page([["verse", "सह वीर्यं करवावहै"]])]), { flow: ["paragraph 1r1", "verse 2r1"], warnings: 0 });
  assert.deepEqual(read([page([["paragraph", "It is so."]]), page([["verse", "सह वीर्यं करवावहै", { from: true }]])]), { flow: ["paragraph 1r1", "verse 2r1"], warnings: 0 });
});

test("both sides marked, the pieces typed differently: the later piece takes the earlier's type and they join", () => {
  const docs = [page([["list_item", "2. Then he showed the gait", { later: true }]]), page([["paragraph", "of the three gods.", { from: true }]])];
  assert.deepEqual(read(docs), { flow: ["list_item 1r1+2r1"], warnings: 0 });
});

test("footnotes across the break are settled as the main text is", () => {
  const docs = [page([["paragraph", "Text."], ["footnote", "* A judge went to court, and", { later: true }]]), page([["paragraph", "More."], ["footnote", "everyone looked at him."]])];
  assert.equal(read(docs).warnings, 0);
  assert.equal(read(docs, { settleBreaks: false }).warnings, 1, "as marked, the break does not match");
});
