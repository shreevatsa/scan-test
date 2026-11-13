# 093: weak ink threshold relative to the paper level

A copy of [method 063](../063-fragment-band-lines/README.md) (itself built on [method 043](../043-gpt-6.1-terra-none-book-types-continuations-band-chained-lines/README.md)). Zero API calls. `analysis.py`, `ownership.py` and `run.py` (apart from a docstring line and the method ID, which comes from the directory name) are as in 063; `geometry.py` and `line-config.json` change.

## What changed

The ink mask keeps weak ink (darker than a weak threshold) only when its component also holds strong ink (at or below the Otsu threshold, at most 200). Methods 043 and 063 put the weak threshold at `(strong + 255) / 2`, which assumes near-white paper. Method 093 uses

```
paper = smallest gray value v such that at least paper_percentile of all pixels have gray <= v
weak  = (strong + max(strong + weak_minimum_gap, paper)) / 2
```

with `paper_percentile` 0.9 and `weak_minimum_gap` 20, both in `line-config.json`. The rule applies only when the config has these settings, so method 063's config and the browser's `LEGACY_LINES` keep the old threshold. Python (`geometry.ink_components`) and the browser (`paperLevel` and `inkComponents` in `webapp/js/local/ink.js`) compute the paper level from the histogram of all pixels, with the same comparison `cumulative >= fraction * pixel_count`.

## Why

On scans with darker paper (brightness about 190 to 210 of 255), `(strong + 255) / 2` falls inside the paper, the mask joins into one large component and the page fails with `too_little_text`. The University of Toronto scan of Ramayana-manjari (archive.org `ramayanamamjari00ksemuoft`), PDF pages 15 to 21, gave 5 failures out of 7 pages. With the new rule every one of 19 test scan pages and Kale 1913 page 5 gives `ok` with 23 to 31 lines. See the NOTEBOOK entry for method 093 for the table.

## Run

```sh
uv run --offline python methods/093-paper-relative-ink-threshold/run.py inputs/kale-1913-page-106.png \
  --base-regions outputs/kale-1913-page-106/042-gpt-6.1-terra-none-book-types-continuations/regions.json \
  --output-dir outputs/kale-1913-page-106/093-paper-relative-ink-threshold/regression-001
node --test webapp/test/paper-threshold.test.mjs webapp/test/fragment-lines.test.mjs
```

Regression on the nine public reference pages (as for 063, with method 043's `evaluate.py`): 0 other-passage ink included, 0 own ink left out and 0 separator ink included on every page; line counts equal 063's. Summary: [outputs/surveys/093-paper-relative-ink-threshold/regression-001/summary.json](../../outputs/surveys/093-paper-relative-ink-threshold/regression-001/summary.json).
