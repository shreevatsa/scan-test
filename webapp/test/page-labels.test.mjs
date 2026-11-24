// Printed page numbers misread from the scan, settled by their neighbours (reading.js settleLabels).
import { test } from "node:test";
import assert from "node:assert/strict";
import { settleLabels } from "../js/reading.js";

const pages = labels => labels.map((label, i) => label === undefined ? null : { page: { id: `p${i}`, ...(label === "" ? {} : { label }) } });
const labels = docs => docs.map(doc => doc?.page.label);

test("a number with a stray digit, between neighbours that agree, takes the number they expect", () => {
  assert.deepEqual(labels(settleLabels(pages(["136", "8137", "138"]))), ["136", "137", "138"]);
  assert.deepEqual(labels(settleLabels(pages(["4", "50", "6"]))), ["4", "5", "6"]);
  assert.equal(settleLabels(pages(["55", "566", "57"]))[1].page.label_as_printed, "566", "what was read is kept");
  assert.deepEqual(labels(settleLabels(pages(["10", "", "8122", "13"]))), ["10", undefined, "12", "13"], "a page without a number between still counts");
});

test("a number left alone: it fits, its neighbours disagree, it does not hold the expected number, or it is not a number", () => {
  const unchanged = [["136", "137", "138"], ["136", "8137", "140"], ["136", "245", "138"], ["xii", "xiii", "xiv"], ["136", "8137"], ["136", "", "", "", "", "8141", "142"]];
  for (const run of unchanged) assert.deepEqual(labels(settleLabels(pages(run))), labels(pages(run)), run.join(" "));
  const docs = pages(["1", "2", "3"]);
  assert.ok(settleLabels(docs).every((doc, i) => doc === docs[i]), "pages that need nothing are the same objects");
});

test("a page with no number inside a run its neighbours agree on takes the run's number; a run's unnumbered first page too", () => {
  const page = label => ({ page: { id: "p", ...(label === undefined ? {} : { label }), regions: [] } });
  const settled = settleLabels(["20", undefined, "22", undefined, "24"].map(page));
  assert.deepEqual(settled.map(doc => doc.page.label), ["20", "21", "22", "23", "24"]);
  assert.equal(settled[1].page.label_from, "neighbours");
  // A chapter's first page, printed without its number, before pages 2, 3, 4; front matter before it is left alone.
  assert.deepEqual(settleLabels([undefined, undefined, undefined, "2", "3", "4"].map(page)).map(doc => doc.page.label), [undefined, undefined, "1", "2", "3", "4"]);
  // A plate between pages 88 and 89 breaks the run: no number for it.
  assert.deepEqual(settleLabels(["87", "88", undefined, "89", "90"].map(page)).map(doc => doc.page.label), ["87", "88", undefined, "89", "90"]);
});
