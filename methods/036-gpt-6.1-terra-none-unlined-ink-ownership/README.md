# 036-gpt-6.1-terra-none-unlined-ink-ownership: GPT-6.1 Terra without reasoning + line ownership with ink on no line and rule pieces, polygon regions

This local method is [method 035](../035-gpt-6.1-terra-none-column-margin-ownership/README.md) with two additions to the ownership step. Both come from the passage references corrected after the user's review (version 2; see NOTEBOOK.md, "Passage references after the user's review"). Against those references, methods 033 and 035 missed ink that the line finder puts on no line, and owned pieces of a broken printed rule that it attaches to text lines. The pinned source is still [025 — GPT-6.1 Terra without reasoning, individual footnotes](../025-gpt-6.1-terra-none-footnotes/README.md). Still one model call: the method makes no API calls and never changes the source result.

## What changed from method 035

1. **Rule pieces** (`prepare` in `ownership.py`, before ownership). A thin text component can be reclassified as a rule piece. It must be at most 0.25 character heights tall, and it must continue a printed rule.
   - **Anchors.** The rule, or anchor, is a component of role "rule", or a large thin horizontal component such as the top of a page frame.
   - **Joining.** A candidate joins when nearby rule ink lies within 3 character heights of it horizontally and the candidate sits within that ink's rows, give or take 0.1 character heights. Nearby rule ink means the anchor's own ink or pieces that have already joined.
   - **Rule-like rows.** For the anchor, only rows that its ink crosses in at least half of its nearby columns count. Without that, a rule fused with footnote glyphs (Kale page 58) or a skewed rule's tall bounding box (Kale page 113) would claim marks of the text next to it.
   - **Chaining.** Pieces join one at a time, so a broken rule end is collected piece by piece.
   - **Effect.** A rule piece gets role "rule" and no line. It is therefore never owned and acts as a separator in the outline partition, like the rest of the rule.
   - **Why.** On Cole page 3, the broken left end of the footnote rule was attached to text lines, and regions owned it: 314 separator pixels inside two outlines.
2. **Ink on no line** (`attach_unlined`, after the isolation check). The line finder leaves some text components on no line, and methods 033 and 035 left them unassigned. Examples are a merged word that is taller than normal glyphs and lies outside its line's horizontal extent, the bars of a ≡ sign, dashes, an ellipsis, and a stray letter.
   - **Rule.** Such a component joins the region whose box holds it (at least half its pixels inside) and whose owned ink is nearest. The gap between bounding boxes must be at most 2 character heights, the same distance the isolation rule uses.
   - **Chaining.** Passes repeat, so an ellipsis can join dot by dot.
   - **Line.** The component counts with the region's line whose owned ink spans its vertical center, or else comes nearest to it. That line determines its line polygon.
   - **What stays unassigned.** Anything outside every box, or farther away, stays unassigned: specks and marks in the margin, and ornament borders.
   - **Why.** On Nītiśataka 1914 page 258, the word मुष्टिभिरेव (8,604 pixels) was owned by no region. On Cole page 3, the outline of display-4 cut through a ≡ sign.

Everything else is unchanged: the ink mask, line finder, line decisions, side-by-side reassignment, isolation rule and outlines.
- **Byte-identical copies from method 035:** `analysis.py`, `geometry.py`, `line-config.json`, `evaluate.py`, `crossbook.py` and `stability.py`.
- **`sweep.py`:** applies a recipe's `prepare` step and attachments when the recipe has them, so recipes 033, 035 and 036 can all be compared on the same trials.
- **`run.py`:** records the new steps in `regions.json`, under `diagnostics`:
  - `rule_pieces`;
  - `attached_components`, each with its gap, chosen line and nearest owned component;
  - `empty_lines`, for lines whose only components became rule pieces.

## Run

```sh
uv run --offline python methods/036-gpt-6.1-terra-none-unlined-ink-ownership/test_ownership.py
uv run --offline python methods/036-gpt-6.1-terra-none-unlined-ink-ownership/run.py inputs/cole-1903-page-003.png --check
uv run --offline python methods/036-gpt-6.1-terra-none-unlined-ink-ownership/run.py inputs/cole-1903-page-003.png
cd methods/036-gpt-6.1-terra-none-unlined-ink-ownership
uv run --offline python evaluate.py ../../inputs/cole-1903-page-003.png ../../references/cole-1903-page-003 ../../outputs/cole-1903-page-003/036-gpt-6.1-terra-none-unlined-ink-ownership/reference-evaluation \
  --result "GPT-6.1 Terra without reasoning (025), boxes=../../outputs/cole-1903-page-003/025-gpt-6.1-terra-none-footnotes/regions.json" \
  --result "GPT-6.1 Terra + column-safe ownership polygons (035)=../../outputs/cole-1903-page-003/035-gpt-6.1-terra-none-column-margin-ownership/regions.json" \
  --result "GPT-6.1 Terra + ownership with ink on no line and rule pieces (036)=../../outputs/cole-1903-page-003/036-gpt-6.1-terra-none-unlined-ink-ownership/regions.json"
uv run --offline python crossbook.py ../../outputs/surveys/036-gpt-6.1-terra-none-unlined-ink-ownership
uv run --offline python stability.py ../../outputs/surveys/036-gpt-6.1-terra-none-unlined-ink-ownership
uv run --offline python sweep.py ../../outputs/surveys/036-gpt-6.1-terra-none-unlined-ink-ownership
uv run --offline python sweep.py ../../outputs/surveys/036-gpt-6.1-terra-none-unlined-ink-ownership --recipe-dir ../035-gpt-6.1-terra-none-column-margin-ownership
```

For a repeat Terra request, pass `--base-regions outputs/<input>/025-gpt-6.1-terra-none-footnotes/run-002/regions.json --output-dir outputs/<input>/036-gpt-6.1-terra-none-unlined-ink-ownership/run-002`. Every command refuses to overwrite existing output. Artifacts are as in method 035. The passage-reference builder stays in method 035 (`reference.py`).

## Tests

`test_ownership.py` has method 035's nine synthetic tests and two new ones:
- **A merged word and an ellipsis on no line join their region.** The test checks that the line finder puts both on no line. They are counted with their own printed line, and a tall mark in the margin, in no box, stays unassigned.
- **A broken rule end is a separator.** The rule's left end is broken into thin pieces, which the line finder classes as text and attaches to a text line. All the pieces become rule pieces, and no region outline contains rule ink.

All 11 pass. Both new tests fail under method 035's ownership code:
- the merged word is not owned;
- the region outlines contain 398 rule pixels.

## Recorded results

See the method 036 entry in [NOTEBOOK.md](../../NOTEBOOK.md), under "Cross-book test". In brief:
- **Changes from method 035.** Ownership differs on 24 of 46 pages. The new steps attached 56 components on no line (15,898 pixels) and reclassified 44 rule pieces (1,619 pixels). Outline measures are otherwise unchanged, except on Telang's sideways table, which was already unusable.
- **References.** Against all nine passage references, both Terra requests give 0 other passages' ink, 0 own ink left out and 0 separator pixels. The ownership check is 0 everywhere except Cole's split running header, 1,208 pixels.
- **Robustness.** On identical perturbation trials, method 036 is identical to method 035 in 107 of 153 page–condition pairs and better in the other 46. Of 49 saved box results from 27 methods, it is identical on 46 and better on 3. It is worse on none of either.

## Limitations

Method 035's limitations still apply, apart from the two addressed here. In particular:
- **Frames.** Frame and ornament pieces next to the text are still owned by text regions when the line finder attaches them to a line.
- **Frame-rule pieces.** The 1896 frame piece under the top rule is not reclassified as a rule piece. It sits below the frame's rule-like rows, not within them.
- **Glyphs on the wrong line.** The line finder can put short glyphs on a neighboring line: an italic lowercase word at the start of a line whose normal-height glyphs start further right. Ownership follows the line, so such glyphs go to that line's region. On Nītiśataka 1914 page 119, the word "sarvasvam" is split between a note and the paragraph below. Methods 033 and 035 already gave its middle letters to the paragraph, and this method's attachment step gives the outer letters, which are on no line, to the note. This is the only word affected on the 46 test pages (see NOTEBOOK.md).
- **Attachment needs a holding box.** A merged word that the model's box does not hold stays unassigned, as before. A small speck inside a box near text is attached; it is harmless but makes ownership depend slightly on the box, as on Telang page 108, where one 14-pixel speck was attached under one Terra request and not the other.
