import { test } from "node:test";
import assert from "node:assert/strict";
import { makeWorkZip, openWorkZip } from "../js/work-zip.js";

test("a work ZIP made here reads back with the archive reader, records and manifest alike", async () => {
  const manifest = { format: "chaya-work", pdf: { sha256: "abc" }, pages: [{ id: "1", pdf_page: 1 }, { id: "2", pdf_page: 2, pdf_part: [0, 0.5] }] };
  const reading = { image_sha256: "scan", parsed: { regions: [{ id: "r1", lines: [{ n: 1, text: "Ünïcode ॐ text" }] }] } };
  const blob = await makeWorkZip([{ name: "book.json", value: manifest }, { name: "work/readings/1/carbon-low.json", value: reading },
    { name: "work/region-finders/1/terra-proposals.json", value: { image_sha256: "scan", regions: [] } }]);
  const zip = await openWorkZip(blob);
  assert.deepEqual(await zip.json("book.json"), manifest);
  assert.deepEqual(await zip.json("work/readings/1/carbon-low.json"), reading);
  assert.deepEqual(zip.names().sort(), ["book.json", "work/readings/1/carbon-low.json", "work/region-finders/1/terra-proposals.json"]);
  assert.equal(await zip.json("work/missing.json"), null);
});
