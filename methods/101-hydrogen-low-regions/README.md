# 101-hydrogen-low-regions

Can Gemini 4 Hydrogen (low thinking) find a page's regions as well as the default finder, method 097 (GPT-6.1 Terra, reasoning off, proposing types)? If it could, a book would need one provider and one API key (Gemini) for both regions and text, since Hydrogen reads whole pages well (method 100).

**Request.** [run.mjs](run.mjs) runs method 097's runtime snapshot on one reference page with only the model call changed: 097's prompt, page image and schema go to Vertex AI `generateContent` (`gemini-4-hydrogen`, `thinkingLevel` LOW, `mediaResolution` high, JSON with a `responseSchema`), and the answer goes back through 097's own parsing, outlines and the 094 local step. Vertex's schema is the OpenAPI subset (no `additionalProperties`, nullable instead of type arrays, `propertyOrdering` kept); everything else carries over. [benchmark.py](benchmark.py) runs the nine public reference pages and scores them with method 043's evaluator, as 097 and 042 were scored. `--replay RUN` scores an earlier run's saved answers again without calling; `--box-order yxyx` reads each `box_1000` as [y1, x1, y2, x2] (Gemini's native order) before 097's code sees it.

## Result, 2026-11-22

Nine pages, one call each, $0.1918 (2.1¢ a page, about 1,000 thinking tokens a page; 097 cost $0.1066, 1.2¢). With a two-call smoke test on one page, $0.2158 in all. Pixels of other passages' ink included / own ink left out (beyond reading-order splits), as boxes are read in each order (the same answers, replayed):

| Page | Hydrogen, boxes as asked (x, y) | Hydrogen, boxes read as (y, x) | 097 and 042 |
|---|---|---|---|
| cole-1903-page-003 | 714,642 / 234,771 | 0 / 1,729 | 0 / 0 |
| dutt-mahabharata-17f-chapter-001-page-002 | 1,339,393 / 294,660 (2 passages missing) | 83,692 / 71,272 | 0 / 0 |
| gopinath-1896-page-123 | 757,367 / 301,808 | 12,456 / 20,554 | 0 / 0 |
| gopinath-1914-page-258 | 0 / 0 | 119,671 / 221,027 | 0 / 0 |
| hertel-panchatantra-page-152 | 2,614,207 / 321,642 (1 missing) | 385,200 / 173,522 | 0 / 0 |
| kale-1913-page-106 | 53,441 / 75,749 (4 missing) | 1,163,461 / 252,686 (4 missing) | 0 / 0 |
| ryder-ten-princes-1927-page-030 | 36,366 / 70,798 | 10,026 / 15,407 | 0 / 0 |
| telang-dli-page-108 | 10,296 / 10,296 | 425,429 / 236,099 (1 missing) | 0 / 0 |
| vavilla-page-034 | 0 / 9,695 (1 missing) | 657,564 / 118,567 | 0 / 0 |
| Sum | 5,525,712 / 1,319,419 | 2,857,499 / 1,110,863 | 0 / 0 |

**Conclusion.** Hydrogen with 097's request is not a fit region finder. It is not even consistent about box order: four pages score better as asked (x, y) and five as Gemini's native (y, x), so it mixes conventions from page to page, and taking the better order for each page still leaves merged or missing passages on seven of the nine pages, where 097 and 042 score 0 / 0 / 0 everywhere, at under half the cost. Regions stay with Terra (097); a book needs an OpenAI key for regions and a Gemini key for text. A Gemini-specific request (boxes asked for in Gemini's own `box_2d` [ymin, xmin, ymax, xmax] form) might do better; that would be a new method.

## Reproducing

From the repository root, with `TOKEN=$(gcloud auth print-access-token)` and `PROJECT` set: `UV_CACHE_DIR=/private/tmp/scan-test-uv-cache UV_NO_SYNC=1 uv run --offline python methods/101-hydrogen-low-regions/benchmark.py --run low-001` (calls the model, about $0.19), then `… --run low-001-yxyx --replay low-001 --box-order yxyx` (no cost). Results: [low-001](../../outputs/surveys/101-hydrogen-low-regions/low-001/comparison.json), [low-001-yxyx](../../outputs/surveys/101-hydrogen-low-regions/low-001-yxyx/comparison.json). The experiment was run by an agent that stopped at a usage limit before writing this; the replay and this write-up were done after.
