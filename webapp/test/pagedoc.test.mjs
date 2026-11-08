// The pipeline's page document step against method 055's pagedoc.build, on the six pages of the formatting test:
// the same saved model answers and region records give the same page document.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { buildPageDocument, selectRegions } from "../js/pipeline/steps.js";

const ROOT = new URL("../..", import.meta.url).pathname;
const M = "055-gemini-4-argon-low-region-transcription-formatting";
const PAGES = [["kale-1913-page-002", "book-002", "kale-1913"], ["kale-1913-page-166", "book-002", "kale-1913"], ["kale-1913-page-208", "book-002", "kale-1913"],
  ["telang-dli-book-page-013", "book-001", "telang-dli"], ["telang-dli-book-page-025", "book-001", "telang-dli"], ["telang-dli-book-page-127", "book-001", "telang-dli"]];

for (const [pid, run, types] of PAGES) {
  const dir = join(ROOT, "outputs", pid, M, run);
  test(`page document: ${pid}`, { skip: !existsSync(join(dir, "page.json")) }, () => {
    const want = JSON.parse(readFileSync(join(dir, "page.json"), "utf8"));
    const result = JSON.parse(readFileSync(join(dir, "result.json"), "utf8"));
    const records = JSON.parse(readFileSync(join(ROOT, result.source_regions.path ?? want.source.regions_path), "utf8"));
    const tl = JSON.parse(readFileSync(join(ROOT, "schema/types", `${types}.json`), "utf8"));
    const parsed = JSON.parse(readFileSync(join(dir, "model-output.txt"), "utf8"));
    const { sent } = selectRegions(records.regions);
    assert.deepEqual(sent.map(s => s.rid), result.regions_sent.map(s => s.id), "regions sent");
    const page = { image: want.page.image, image_sha256: want.page.image_sha256, width: want.page.width, height: want.page.height };
    const [doc] = buildPageDocument(pid, page, tl, sent, parsed, { ...want.source, omitted_regions: undefined, problems: undefined });
    // The app adds each region's box (from the model box) and anchors a relation without a sign to its line's only
    // marker; apart from those, the document is method 055's.
    for (const r of doc.page.regions) delete r.box;
    for (const rel of doc.relations) {
      const w = want.relations.find(x => x.to.unit === rel.to.unit && x.from.region === rel.from.region);
      if (rel.from.anchor && w && !w.from.anchor && !rel.from.marker) delete rel.from.anchor;
    }
    delete want.page.source;
    assert.deepEqual(doc.page, want.page);
    assert.deepEqual(doc.units, want.units);
    assert.deepEqual(doc.flows, want.flows);
    assert.deepEqual(doc.relations, want.relations);
    assert.deepEqual(doc.source.problems, want.source.problems);
  });
}
