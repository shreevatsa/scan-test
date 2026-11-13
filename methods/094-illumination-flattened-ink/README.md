# 094: illumination flattened before the ink threshold

A copy of [method 093](../093-paper-relative-ink-threshold/README.md) (paper-relative weak ink threshold, on [method 063](../063-fragment-band-lines/README.md)). Zero API calls. `analysis.py`, `ownership.py` and `run.py` (apart from a docstring line) are as in 093; `geometry.py` (new `flatten_gray`, called first in `ink_components`) and `line-config.json` (new `flatten_*` settings) change.

## What changed

Before the ink mask is made, the gray image is divided by a smooth estimate of the local paper brightness:

```
paper = 093's paper level of the original gray (smallest v with at least 0.9 of the pixels <= v)
B     = max(24, round(min(W, H) / 40));  grid bw = ceil(W / B), bh = ceil(H / B)
block value = 0.9 quantile of the gray values of every second pixel (both directions) of the block, at least 0.55 * paper
smooth the grid with a 3x3 mean over existing blocks; L(x, y) = bilinear interpolation at (x / B - 0.5, y / B - 0.5), clamped
flat = min(255, floor(gray / L * 255 + 0.5))
```

Everything else is method 093 run on `flat` (weak threshold from the paper level of `flat`, speck rules, components, roles, lines, ownership). Coordinates are unchanged. The settings are `flatten_percentile` 0.9, `flatten_floor` 0.55, `flatten_block_divisor` 40, `flatten_minimum_block` 24 and `flatten_sample_step` 2; flattening happens only when `flatten_percentile` is in the config, so methods 063 and 093 and the browser's `LEGACY_LINES` are unchanged. All arithmetic is float64 with round half up, so Python (`geometry.flatten_gray`) and the browser (`flattenGray` in `webapp/js/local/ink.js`) give the same bytes; `flatten-fixture.json` holds a small image and the Python result, checked by `test_flatten.py` and `webapp/test/flatten.test.mjs`.

## Why

On the Toronto scan of Ramayana-manjari (archive.org `ramayanamamjari00ksemuoft`, PDF pages 18 and 20) a dark band runs down the right edge and the right ends of the footnote lines touch it. Method 093's mask joined the band and the line ends into one large component, so the ends of those lines (for example the last word of page 18's first footnote line) were missing or smudged in the text outlines. With the lighting flattened the band falls below the weak threshold and the line ends are kept. See the NOTEBOOK entry for method 094.

## Run

```sh
uv run --offline python methods/094-illumination-flattened-ink/run.py inputs/kale-1913-page-106.png \
  --base-regions outputs/kale-1913-page-106/042-gpt-6.1-terra-none-book-types-continuations/regions.json \
  --output-dir outputs/kale-1913-page-106/094-illumination-flattened-ink/regression-001
uv run --offline python methods/094-illumination-flattened-ink/test_flatten.py
node --test webapp/test/flatten.test.mjs webapp/test/fragment-lines.test.mjs
```

`make_flatten_fixture.py` rewrites the fixture. Regression on the nine public reference pages: 0 / 0 / 0 on every page; summary in [outputs/surveys/094-illumination-flattened-ink/regression-001/summary.json](../../outputs/surveys/094-illumination-flattened-ink/regression-001/summary.json).
