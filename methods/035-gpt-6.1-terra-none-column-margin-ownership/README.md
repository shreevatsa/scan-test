# 035-gpt-6.1-terra-none-column-margin-ownership: GPT-6.1 Terra without reasoning + line ownership with side-by-side reassignment and in-box isolation, polygon regions

This local method is [method 033](../033-gpt-6.1-terra-none-line-polygons/README.md) with two changes to the ownership step. Both come from failures in the cross-book test of method 033 on 43 pages from seven books, recorded in [NOTEBOOK.md](../../NOTEBOOK.md). The pinned source is still [025 — GPT-6.1 Terra without reasoning, individual footnotes](../025-gpt-6.1-terra-none-footnotes/README.md). The method makes no API calls and never changes the source result.

## What changed from method 033

1. **Side-by-side reassignment.** After each line's decision, a component that lies entirely to the left or right of its assigned box moves to another box, under two conditions. The other box must hold the component (at least half its pixels inside), and it must be horizontally apart from the assigned box, overlapping it by less than 10% of the narrower box's width. If several boxes qualify, the one holding most of the component wins.
   - **Why:** on one Dutt page the line finder did not separate the two columns. Every detected line spanned both columns, and method 033 gave whole lines to one column's region; 19 of 31 regions owned ink in the other column.
   - **Why marks are safe:** marks above or below a line are not affected, because they are not beside the box horizontally. Those are the marks that stacked boxes on skewed pages catch. Footnote lines are unaffected too: a component not claimed by a footnote box is not held by any other footnote box.
2. **In-box isolation, beyond all boxes.** The outlier rule still unassigns a component more than 1 character height outside its owner's box and more than 2 character heights from the rest of its line. For a component lying wholly beyond the outermost left or right edge of all boxes, "the rest of its line" now means the line's components that some box holds (at least half inside), when there are any. Components between boxes are judged as in method 033.
   - A first version applied the narrower test everywhere, measuring only to the components that the owner's box holds. In the robustness sweep it dropped glyphs on shared footnote and header lines: glyphs that no perturbed box held, and that had fallen back to the nearest note. All its outputs were deleted, and the rule was restricted before the results below were recorded.
   - **Why:** on framed pages, scanner-edge marks beyond the frame were linked to the text through frame pieces on the same line. On one 1896 Nītiśataka page, six regions had a second piece in the margin.

Everything else is unchanged: the ink mask, line finder, line-local and remainder rules, nearest-gap fallback and outlines. `analysis.py`, `geometry.py`, `line-config.json`, `run.py` and `evaluate.py` are byte-identical copies from method 033.

Changes to the copied analysis scripts:
- `sweep.py` runs on every page with a reference under `references/`. Its `--recipe-dir` option applies another method's `ownership.py` and `config.json` to the same trials.
- `crossbook.py` summarizes this method's outputs.
- `stability.py` (new) compares this method's outputs for two Terra requests on the same page (`run-002`).
- `reference.py`, the passage-reference builder, was added after the recorded runs; it is not part of the method. It is method 033's builder with two additions:
  - **Component rules.** A spec can label every component lying wholly inside a box: with a passage, as unlabeled, or as separator. This covers ink that the line finder puts on no line, and pieces of frames or rules that it attaches to a text line.
  - **Right-column labels.** In `review.png`, passages on the right half of the page are labeled in a margin to the right of the page.

  With a spec that has no component rules, it reproduces all nine earlier label images byte for byte. It built version 2 of four references after the user's review.

## Run

```sh
uv run --offline python methods/035-gpt-6.1-terra-none-column-margin-ownership/test_ownership.py
uv run --offline python methods/035-gpt-6.1-terra-none-column-margin-ownership/run.py inputs/dutt-mahabharata-15f-chapter-239-page-002.png --check
uv run --offline python methods/035-gpt-6.1-terra-none-column-margin-ownership/run.py inputs/dutt-mahabharata-15f-chapter-239-page-002.png
cd methods/035-gpt-6.1-terra-none-column-margin-ownership
uv run --offline python evaluate.py ../../inputs/cole-1903-page-003.png ../../references/cole-1903-page-003 ../../outputs/cole-1903-page-003/035-gpt-6.1-terra-none-column-margin-ownership/reference-evaluation \
  --result "GPT-6.1 Terra without reasoning (025), boxes=../../outputs/cole-1903-page-003/025-gpt-6.1-terra-none-footnotes/regions.json" \
  --result "GPT-6.1 Terra + line ownership polygons (033)=../../outputs/cole-1903-page-003/033-gpt-6.1-terra-none-line-polygons/regions.json" \
  --result "GPT-6.1 Terra + column-safe ownership polygons (035)=../../outputs/cole-1903-page-003/035-gpt-6.1-terra-none-column-margin-ownership/regions.json"
uv run --offline python crossbook.py ../../outputs/surveys/035-gpt-6.1-terra-none-column-margin-ownership
uv run --offline python sweep.py ../../outputs/surveys/035-gpt-6.1-terra-none-column-margin-ownership
uv run --offline python sweep.py ../../outputs/surveys/035-gpt-6.1-terra-none-column-margin-ownership --recipe-dir ../033-gpt-6.1-terra-none-line-polygons
uv run --offline python stability.py ../../outputs/surveys/035-gpt-6.1-terra-none-column-margin-ownership
uv run --offline python reference.py ../../inputs/cole-1903-page-003.png ../../references/cole-1903-page-003/passage-spec.json
```

The reference builder refuses to run if the spec's folder already holds a built reference. A revised reference moves the previous version's four files into `version-1/` (or the next version number) first. Re-evaluations against a revised reference go to a new folder, such as `reference-evaluation-version-2/` or `outputs/surveys/035-gpt-6.1-terra-none-column-margin-ownership/references-version-2/`.

For a repeat Terra request, run method 025 with `--output-dir outputs/<input>/025-gpt-6.1-terra-none-footnotes/run-002`. Then run this method with `--base-regions` pointing at that run's `regions.json` and `--output-dir outputs/<input>/035-gpt-6.1-terra-none-column-margin-ownership/run-002`.

Run Terra 025 on an input first. Every command refuses to overwrite existing output. Artifacts are as in method 033: `regions.json` gains a `components_moved_beside` count in each line decision. Cross-page summaries are under `outputs/surveys/035-gpt-6.1-terra-none-column-margin-ownership/`.

## Tests

`test_ownership.py` has method 033's seven synthetic tests and two new ones:
- **Two columns read as one line.** The paragraph breaks fall on different rows in the two columns, and the gutter is narrow enough that the line finder reports one column.
- **An edge mark beyond a frame piece.** The mark is dropped, and the frame piece next to the text stays with the region.

Both new tests fail under method 033's ownership code and pass here. All nine pass.

## Recorded results

See the method 035 entries in [NOTEBOOK.md](../../NOTEBOOK.md), under "Cross-book test". In brief:
- **Changes from method 033.** On 46 pages, ownership differs from method 033's on six only.
  - On the Dutt page whose columns were not found, content regions now own 15 ink pixels across the column gutter, against tens of thousands, and no region comes out in several pieces.
  - On four framed Nītiśataka pages, the newly dropped marks all lie at the page edges.
  - Telang's sideways table changes but remains unusable.
- **References.** Against the nine passage references as first recorded, the results equal method 033's exactly: 0 other passages' ink, 0 own ink left out and 0 separator pixels. After the user's review, three references were corrected (version 2). Against those, the results still equal method 033's, but two pages show errors that version 1 hid:
  - **Cole page 3:** 208 pixels of a ≡ sign on no line are left out, and 314 pixels of footnote-rule pieces attached to text lines are included.
  - **Nītiśataka 1914, page 258:** 137 pixels of a merged word on no line are left out.

  The ownership step leaves all ink on no line unassigned: 803, 174 and 8,664 pixels on the three revised pages.
- **Robustness.** The sweep on the nine referenced pages matches method 033's recipe in 149 of 153 page–condition pairs. The four differences all come at perturbations where both recipes fail. The same holds against reference version 2. There, every trial on the revised pages also counts the unassigned ink on no line.
- **Repeat requests.** For the second Terra request on each of the 43 cross-book pages, ownership and keep flags are identical on 35 pages. The other eight differ mostly in granularity, such as consecutive verses or contents entries grouped into blocks.

## Limitations

Method 033's limitations still apply, with these additions from the cross-book test:
- **Frame and ornament pieces next to the text** are still owned by text regions when the line finder attaches them to a line. Telling a frame piece from a word that the model's box cut off needs more than a distance rule, such as recognizing a frame as a vertical structure along the page edge.
- **Rotated text**, such as Telang's sideways table, is not handled by the horizontal line finder. The model's box is the better region there.
- **Loose outlines next to short lines.** Where a region's ink leaves empty space in its padded rectangle, the nearest-ink partition gives spiky but ink-free boundaries.
- **Ink on no line**, such as large merged glyphs, long dashes and the bars of a ≡ sign, stays unassigned, though an outline often covers it. Against reference version 2, the outline misses part of a ≡ sign on Cole page 3 and the tail of a merged word on Nītiśataka 1914 page 258.
- **Pieces of a broken rule** that the line finder attaches to text lines are owned by text regions. On Cole page 3 they put 314 separator pixels inside two regions.

[Method 036](../036-gpt-6.1-terra-none-unlined-ink-ownership/README.md) addresses these last two limitations.
