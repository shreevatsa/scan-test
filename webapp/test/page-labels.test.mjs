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

test("a page whose printed number was not read takes the number its neighbours expect, if it has a page number block", () => {
  const types = { types: { page_number: { region: "page_number", role: "furniture" }, paragraph: { region: "paragraph", flow: "main" } } };
  const withBlock = (label, block = true) => ({ page: { id: "p", ...(label === undefined ? {} : { label }), regions: block ? [{ id: "r1", type: "page_number" }] : [] } });
  const docs = [withBlock("20"), withBlock(undefined), withBlock("22"), withBlock(undefined, false), withBlock("24")];
  const settled = settleLabels(docs, types);
  assert.deepEqual(settled.map(doc => doc.page.label), ["20", "21", "22", undefined, "24"], "a page with no page number block is left alone");
  assert.equal(settled[1].page.label_from, "neighbours");
  assert.equal(settleLabels(docs)[1].page.label, undefined, "without the types, as before");
});
