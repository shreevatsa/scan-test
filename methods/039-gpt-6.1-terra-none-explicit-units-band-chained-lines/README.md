# 039-gpt-6.1-terra-none-explicit-units-band-chained-lines: GPT-6.1 Terra without reasoning, explicit units + line ownership with band-chained short glyphs, ink on no line and rule pieces, polygon regions

This local method is [method 038](../038-gpt-6.1-terra-none-explicit-units-line-polygons/README.md) — [method 036](../036-gpt-6.1-terra-none-unlined-ink-ownership/README.md)'s recipe on [method 037](../037-gpt-6.1-terra-none-explicit-units/README.md)'s boxes — with one change to the line finder, and with split-aware scoring in its evaluation script. No API calls; the source result is never changed.

## What changed from method 038

1. **Band-chained short glyphs** (`geometry.segment_lines`, setting `band_chain_gap_char` = 1.0 in `line-config.json`).
   - **The old rule:** a line's horizontal extent comes from its normal-height ("main") glyphs. A short glyph, such as italic lowercase, punctuation or a dash, joins the nearest line whose extent covers it, if that line's band is within 1.2 character heights.
   - **What went wrong:** a run of short glyphs before a line's first main glyph, or after its last, can fall within a neighboring line's extent and join that line. On Nītiśataka 1914 page 119, the italic word "sarvasvam" at the start of a note's second line was split between the note and the paragraph below. This was found by the user.
   - **The new rule:** a short glyph whose vertical center lies in a line's core band, but outside that line's extent, joins the line if it chains to the line's glyphs through gaps of at most one character height.
   - **When it applies:** it replaces no line, or an assignment to a line whose band the glyph lies outside. In the second case, the band line's glyphs must be nearer to it than the glyphs of its current line that lie within that line's own band. Without that last condition, a whole word put on the wrong line holds itself there.
   - **What it never does:** a glyph already within its own line's band is never moved.
   - **The record:** moved glyphs are listed as `band_chained_components` in each `regions.json`.
2. **Split-aware scoring** (`evaluate.py`).
   - **The rule:** a passage whose other regions hold only its ink, and whose regions are consecutive in reading order among kept regions, is split as a grouping difference. The user judged that either granularity is acceptable for the Telang apparatus. That ink is reported but not counted as left out, in `own_ink_left_out_beyond_reading_order_splits` and the ownership check's `beyond_reading_order_splits`.
   - **Earlier totals:** they are unchanged.
3. **`crossbook.py --pages`** summarizes another page list, such as `inputs/pages-fresh.json`. The option was added after the runs on the 46 test pages, so those 92 `regions.json` files record the earlier `crossbook.py` hash (`6a665dc58046…`). That is the hash of method 038's `crossbook.py`, which is the file 039's copy started from. All runtime files are unchanged.

**Unchanged files:**
- **Byte-identical to method 038's:** `ownership.py`, `analysis.py`, `sweep.py`, `stability.py` and `test_ownership.py`.
- **`config.json`:** only the name differs.
- **`run.py`:** only the record of moved glyphs is new.

**The sweep caveat:** the line finder is part of this method's recipe, so `sweep.py --recipe-dir` (which swaps only `ownership.py` and `config.json`) cannot compare it with method 038. The two methods were swept with their own scripts on identical trials instead.

## Run

```sh
uv run --offline python methods/039-gpt-6.1-terra-none-explicit-units-band-chained-lines/test_ownership.py
uv run --offline python methods/039-gpt-6.1-terra-none-explicit-units-band-chained-lines/run.py inputs/gopinath-1914-page-119.png
cd methods/039-gpt-6.1-terra-none-explicit-units-band-chained-lines
uv run --offline python sweep.py ../../outputs/surveys/039-gpt-6.1-terra-none-explicit-units-band-chained-lines
uv run --offline python crossbook.py ../../outputs/surveys/039-gpt-6.1-terra-none-explicit-units-band-chained-lines/held-out --pages ../../inputs/pages-fresh.json
uv run --offline python stability.py ../../outputs/surveys/039-gpt-6.1-terra-none-explicit-units-band-chained-lines/held-out
```

Repeat requests and reference evaluations work as in method 038.

## Recorded results

See the method 039 entry and the held-out test in [NOTEBOOK.md](../../NOTEBOOK.md). In brief:
- **"sarvasvam":** the word goes whole to the note. On fresh pages, the same fix rejoins "genius." and "follows :--" to their own lines.
- **Changed pages:** ownership differs from method 038's on 3 of the 46 test pages and 5 of the 54 fresh pages.
- **References:** 0 / 0 / 0 on all nine earlier references (with Nītiśataka 1896 page 123 at version 3) and on three of the four fresh references, counting splits in reading order as grouping differences. On the fourth, Hertel page 152, method 037's first request omitted the margin line numbers, so they are owned by text regions.
- **Robustness:** identical to method 038 in 124 of 153 page–condition pairs, better in 28 and worse in 1 (all boxes shifted 40 px down on Nītiśataka 1914 page 258, where both fail).

## Limitations

The limitations of methods 035 and 036 still apply, except for short glyphs on a neighboring line. In addition:
- **Margin marks:** a speck within one character height of a line's end, inside its band, now joins the line: specks of 16–17 pixels on Kale pages 146 and 246, and a margin speck on Kale page 64.
- **Photographed pages:** on unevenly lit photographs such as the Ryder Gita spreads, the ink mask itself fails and no local method applies.
