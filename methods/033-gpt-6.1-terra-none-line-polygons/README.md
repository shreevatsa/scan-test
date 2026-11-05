# 033-gpt-6.1-terra-none-line-polygons: GPT-6.1 Terra without reasoning + line ownership and polygon regions

This local method keeps the grouping from one saved single-pass model result and replaces its rectangles with regions computed from the page's ink. The pinned source is [025 — GPT-6.1 Terra without reasoning, individual footnotes](../025-gpt-6.1-terra-none-footnotes/README.md). It makes no API calls and never changes the source result. [Method 034](../034-gpt-6-astra-low-line-polygons/README.md) applies the same recipe to GPT-6 Astra (020).

The model decides what the passages are: their types, keep flags and reading order, and which printed lines belong together. Local code decides exactly which ink each passage owns and draws an outline that follows the white space between lines. Every step is a threshold, connected-component labeling, a sum, a sort, a distance transform or a contour trace, so it can be ported to browser code.

## Recipe

1. **Ink and lines.** Method 032's hysteresis ink mask and line finder, copied unchanged (`geometry.py`, `analysis.py`, `line-config.json`). Lines are found in the frame of the page text angle. Detached marks such as vowel signs and dots join the nearest line.
2. **Line ownership.** For each line, count the ink inside each model box, using the pixels whose centers lie in the box.
   - Normally the whole line goes to the box holding the largest share of its ink, provided that share is at least 25%. Otherwise the line is reported as uncovered and its ink stays unassigned.
   - A box is **line-local** when it is narrower than 90% of the line's extent and holds at least half of its own line ink on this line. Footnotes sharing a printed line are the typical case. Line-local boxes claim the components with at least half their pixels inside, smallest box first.
   - Next, another box may claim the components it holds among the unclaimed remainder, if it holds at least 25% of the line's ink there. This covers a note continuing from the previous line.
   - Any remaining component joins the claimed component with the smallest horizontal edge-to-edge gap on the same line.
3. **Outlier marks.** A component more than 1 character height outside its owner's box, and more than 2 character heights from every other component on its line, is left unassigned. This catches scanner-edge marks and marginal notes that the line finder grouped with a line. A word that the model's box merely cut off is still kept.
4. **Outlines.**
   - The sites are the owned ink plus rules and large non-text components, which form a separator class. Every pixel is labeled with its nearest site (OpenCV `distanceTransformWithLabels`, L2, 5 × 5 mask).
   - A region is its nearest-site cell clipped to a rectangle at the page text angle around its own ink, padded by 0.25 character heights. Only pieces containing its own ink are kept.
   - Each line of a region gets its own outline the same way, clipped to the region. Line cells refine region cells exactly because both use the same nearest site pixel.
   - Outer rings are traced and simplified with Douglas–Peucker at 1 px.

By construction, each region contains all its owned ink and no ink owned by another region or by a separator. Whether the ownership is *right* is what the passage references measure.

## Run

```sh
uv run --offline python methods/033-gpt-6.1-terra-none-line-polygons/test_ownership.py
uv run --offline python methods/033-gpt-6.1-terra-none-line-polygons/run.py inputs/kale-1913-page-113.png --check
uv run --offline python methods/033-gpt-6.1-terra-none-line-polygons/run.py inputs/kale-1913-page-113.png
cd methods/033-gpt-6.1-terra-none-line-polygons
uv run --offline python evaluate.py ../../inputs/kale-1913-page-113.png ../../references/kale-1913-page-113 ../../outputs/kale-1913-page-113/033-gpt-6.1-terra-none-line-polygons/reference-evaluation \
  --result "GPT-6.1 Terra without reasoning (025), boxes=../../outputs/kale-1913-page-113/025-gpt-6.1-terra-none-footnotes/regions.json" \
  --result "GPT-6.1 Terra + line ownership polygons (033)=../../outputs/kale-1913-page-113/033-gpt-6.1-terra-none-line-polygons/regions.json" \
  --result "GPT-6 Astra low reasoning (020), boxes=../../outputs/kale-1913-page-113/020-gpt-6-astra-low-footnotes/regions.json" \
  --result "GPT-6 Astra + line ownership polygons (034)=../../outputs/kale-1913-page-113/034-gpt-6-astra-low-line-polygons/regions.json"
uv run --offline python sweep.py ../../outputs/surveys/033-gpt-6.1-terra-none-line-polygons
uv run --offline python reference.py ../../inputs/kale-1913-page-017.png ../../references/kale-1913-page-017/passage-spec.json
```

Run the pinned source method on the input first. `--base-regions` selects another saved run of it, and `--output-dir` gives a fresh output for a repeat. Every command refuses to overwrite existing output. `reference.py` is method 032's reference builder with one addition: a split rule with `"passage": null` leaves components unlabeled. It built the page 17 and 97 references.

## Artifacts

- `outputs/<input>/033-gpt-6.1-terra-none-line-polygons/regions.json`: the result. It contains:
  - for each source region, the type, keep flag, reading order and uncertainty flag (all unchanged), plus `model_box` (unchanged);
  - `polygons`, the outer rings in input-image pixel indices, largest first;
  - `bounds`, owned ink pixels and components, and `line_ids`;
  - `lines`, with one outline per printed line of the region, and `shared_with_other_regions` marking footnote-style shared lines;
  - an `audit` of ink inside and outside both the polygons and the original box.

  The file also records a decision per line (`whole`, `split` or `uncovered`, with each box's ink share), dropped components, diagnostics, settings, hashes of the input, source and code, and local timing. A polygon vertex (x, y) is the center of pixel (x, y); add 0.5 for SVG coordinates with the image placed at (0, 0).
- `ownership.png`: 8-bit owner labels on the ink mask: 0 unassigned, region index + 1 in source order, and 255 for rules and large non-text.
- `overlay.png`: owned ink colored by region, region outlines, original model boxes in gray, unassigned text ink in red and separators in black.
- `lines.png`: the line outlines.
- `reference-evaluation/` on pages with a passage reference:
  - `evaluation.json`;
  - `comparison.png`, with the four results side by side. Red marks other passages' ink inside a passage's matched region, and magenta its own ink outside.
  - one `boundary-*.png` per boundary between consecutive non-footnote passages.
- `outputs/surveys/033-gpt-6.1-terra-none-line-polygons/robustness.json`: the source sweep and perturbation analysis below.

## Recorded results

### Test pages, 2026-11-04 15:49 UTC

Source boxes from Terra 025; method 034's diagnostics from Astra 020's boxes are identical on all three pages.

| Page | Lines: whole / split / uncovered | Dropped outlier marks | Unassigned text pixels | Polygon vertices | Whitespace shared by adjacent polygons | Ink in shared whitespace |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| 17 | 28 / 2 / 0 | 2 scanner-edge marks | 251 | 811 | 160 px | 0 |
| 97 | 26 / 2 / 0 | 0 | 0 | 533 | 88 px | 0 |
| 113 | 28 / 2 / 0 | 0 | 1,232 | 857 | 166 px | 0 |

The split lines are the header line (page number and running header) and the footnote line on each page. Unassigned text is scanner-edge marks and specks away from any line. On page 113 most of it is the dark mark at the bottom edge.

Local time per page on the development Mac was about 0.65 s for ink and lines, 0.01 s for ownership and 0.55 s for outlines. Passage polygons take 6–10 KB as compact JSON per page, and line polygons 39–47 KB.

### Against the passage references, 2026-11-04 15:50 UTC

Totals over kept passages: other passages' ink inside each passage's matched region / own ink outside it / separator pixels inside it.

| Page | Reference | Terra 025 boxes | Terra + 033 polygons | Astra 020 boxes | Astra + 034 polygons |
| --- | --- | --- | --- | --- | --- |
| 17 | proposed, not yet reviewed | 87 / 13 / 176 | 0 / 0 / 0 | 17 / 56 / 11 | 0 / 0 / 0 |
| 97 | proposed, not yet reviewed | 0 / 0 / 44 | 0 / 0 / 0 | 0 / 0 / 1 | 0 / 0 / 0 |
| 113 | reviewed by the user | 3,053 / 210 / 378 | 0 / 0 / 0 | 3,930 / 94 / 491 | 0 / 0 / 0 |

Raw-box numbers on page 113 match method 032's evaluation. The references were built from the same ink mask and line finder, so these zeros show that the model grouping plus line ownership reproduces the reference's line-to-passage assignment. They do not test the line finder itself; only review of the reference images does.

### Robustness, 2026-11-04 15:50–15:51 UTC

**Source sweep.** The same recipe was applied, in memory, to every saved box result on the three referenced pages.

- On page 113, all eight saved results give zero ownership errors. Their raw boxes include 3,053–34,727 pixels of other passages' ink.
- On page 97, all ten results give zero errors.
- On page 17, 14 of 25 results group the page as the reference does. Of these, 12 give zero errors.
  - Claude Fable 015 (599 px) and Claude Opus 016 (401 px) have errors only on the footnote line. There, their own boxes put footnote numeral २, and for 015 also ३ and a period, into the preceding note.
  - The other 11 results group differently: they merge or split passages, put all footnotes in one region, or omit them. Six of them (001, 008, 010, 011, 023, 024) also have boxes a whole line off at a passage boundary. Ownership reproduces their grouping and follows those boxes, so those lines go to the wrong passage.

**Perturbation.** Terra 025's boxes were perturbed; character height is 40–43 px. Each cell gives clean trials, or error pixels.

| Perturbation | Page 17 | Page 97 | Page 113 |
| --- | --- | --- | --- |
| Each edge moved independently within ±10 px, 20 trials | 20 / 20 clean | 20 / 20 clean | 20 / 20 clean |
| Within ±20 px | 12 / 20 clean; at most 323 px on one line | 19 / 20; at most 63 px | 17 / 20; at most 75 px |
| Within ±30 px | 2 / 20; merges in 6 | 9 / 20; merges in 7 | 7 / 20; merges in 10 |
| Within ±40 px | 0 / 20 | 5 / 20 | 4 / 20 |
| All boxes shifted ±20 px vertically | clean | clean | clean |
| All boxes shifted ±40 px vertically | 55,546 / 66,002 px | 42,371 / 46,942 px | 77,018 / 74,425 px |
| All boxes shifted ∓20 px horizontally | 167 / 546 px | 63 / 327 px | 255 / 275 px |
| All boxes shifted ∓40 px horizontally | 1,134 / 990 px | 393 / 629 px | 1,257 / 1,225 px |
| All coordinates scaled by 0.99 or 1.01 | clean | clean | clean |
| Scaled by 0.97 / 1.03 | 465 / 323 px | 305 / 607 px | 159 / 800 px |

Every error from horizontal shifts and scaling is on the shared footnote line.

**Interpretation.**
- Whole-line ownership tolerates box errors up to about half a line height.
- Lines shared by several passages depend directly on the model's horizontal box edges, and are the weak point.

A first version chose the nearest component by center distance. With it, Gemini 3.8 Flash 029's boxes misassigned a cut-off period on pages 17 and 97. The edge-gap rule fixed both, and a synthetic test now covers the case. Those first outputs were deleted and regenerated before being recorded.

Seven synthetic tests passed on 2026-11-04. They cover:
- skewed stacked passages with overlapping boxes;
- footnotes sharing a line, with a box cutting off a word;
- a cut-off period next to the following note's numeral;
- a note wrapping onto the next line;
- a cut-off word kept while a scanner-edge mark is dropped;
- a line without a box;
- line outlines nesting in region outlines.

## Limitations

- **Narrow evidence at first.** These results first covered three pages of one book. The line finder's thresholds come from method 032 and were chosen while looking at Kale and the survey contact sheets. A later cross-book test covered 43 more pages from seven books, six of them with proposed references; see NOTEBOOK.md. `crossbook.py` was added to this directory for that summary, and the runtime files are unchanged. After the user's review, three of those references were corrected (version 2). Against them, this method's polygons are no longer error-free on two pages:
  - **Cole page 3:** they leave out 208 pixels of a ≡ sign that is on no line, and include 314 pixels of footnote-rule pieces that the line finder attached to text lines.
  - **Nītiśataka 1914, page 258:** they leave out 137 pixels of a merged word that is on no line.
- **Columns the line finder misses.** If the line finder reads two columns as one, each line spans both, and goes whole to one column's region. On one Dutt page in the cross-book test, 19 of 31 regions owned ink in the other column. [Method 035](../035-gpt-6.1-terra-none-column-margin-ownership/README.md) fixes this, and also stops frame pieces from linking scanner-edge marks to text.
- **Shared lines follow the model's horizontal edges.** A model that puts a numeral or words in the wrong note is not corrected. A new paragraph starting mid-line, inside running text whose two model boxes both span the line, goes whole to one passage.
- **Whole-line assignment fails at large box errors.** It breaks when box edges are off by more than about half a line height, or when all boxes are shifted by a full line.
- **Unassigned text can fall inside an outline.** Ink not on any line (specks, marks more than 1.2 character heights from a line) is not owned. It can lie inside a region's outline; the audit counts it.
- **Non-text is treated as a separator.** Rules and large non-text components (figures, borders, stamps) are excluded from every region, so a figure belonging to a passage is not handled.
- **Small simplification overlaps.** Outlines are simplified separately, so neighbors share up to about 1 px of whitespace. Line outlines can extend up to about 1 px beyond their region's outline.
- **Ink-mask dependence.** Bleed-through, stains and handwriting would be owned by whichever line they attach to.
