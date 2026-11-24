// Printed page numbers misread from the scan, settled by their neighbours (reading.js settleLabels).
import { test } from "node:test";
import assert from "node:assert/strict";
import { settleLabels } from "../js/reading.js";

const pages = labels => labels.map((label, i) => label === undefined ? null : { page: { id: `p${i}`, ...(label === "" ? {} : { label }) } });
const labels = docs => docs.map(doc => doc?.page.label);

test("a misread number (a stray digit, a wrong digit, one dropped), between neighbours that agree, takes the number they expect", () => {
  assert.deepEqual(labels(settleLabels(pages(["136", "8137", "138"]))), ["136", "137", "138"]);
  assert.deepEqual(labels(settleLabels(pages(["30", "31", "22", "33", "34"]))), ["30", "31", "32", "33", "34"]);
  assert.deepEqual(labels(settleLabels(pages(["95", "96", "7", "98", "99"]))), ["95", "96", "97", "98", "99"]);
  assert.deepEqual(labels(settleLabels(pages(["135", "136", "245", "138", "139"]))), ["135", "136", "137", "138", "139"]);
  // Every other page numbered: the two numbered neighbours are all there are.
  assert.deepEqual(labels(settleLabels(pages(["80", "", "42", "", "84"]))), ["80", undefined, "82", undefined, "84"]);
  assert.deepEqual(labels(settleLabels(pages(["31", "22", "33"]))), ["31", "32", "33"]);
  // Every other number misread ("41" for 14): the run's other pages are enough.
  assert.deepEqual(labels(settleLabels(pages(["13", "41", "15", "61", "17", "81", "19"]))), ["13", "14", "15", "16", "17", "18", "19"]);
  assert.deepEqual(labels(settleLabels(pages(["4", "50", "6"]))), ["4", "5", "6"]);
  assert.equal(settleLabels(pages(["55", "566", "57"]))[1].page.label_as_printed, "566", "what was read is kept");
  assert.deepEqual(labels(settleLabels(pages(["10", "", "8122", "13"]))), ["10", undefined, "12", "13"], "a page without a number between still counts");
});

test("a number left alone: it fits, its neighbours disagree or are too far or too few, or it is not a number", () => {
  const unchanged = [["136", "137", "138"], ["136", "8137", "140"], ["xii", "xiii", "xiv"], ["136", "8137"], ["136", "", "", "", "", "8141", "142"],
    ["7", "9", "20", "22", "22", "12", "19"]];
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
