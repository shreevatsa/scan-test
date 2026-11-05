# 034-gpt-6-astra-low-line-polygons: GPT-6 Astra low reasoning + line ownership and polygon regions

This local method applies [method 033's recipe](../033-gpt-6.1-terra-none-line-polygons/README.md) to a different pinned source: [020 — GPT-6 Astra low reasoning, individual footnotes](../020-gpt-6-astra-low-footnotes/README.md). It keeps the model's grouping, types, keep flags and reading order. It assigns each detected text line, or each component on a shared line, to a model region, and outlines each region by its nearest-ink partition. It makes no API calls.

The code is a copy of method 033's runner and ownership code; only `config.json` differs, in `name` and `base_method_id`. The reference builder, evaluation and robustness sweep live in method 033.

## Run

```sh
uv run --offline python methods/034-gpt-6-astra-low-line-polygons/test_ownership.py
uv run --offline python methods/034-gpt-6-astra-low-line-polygons/run.py inputs/kale-1913-page-113.png --check
uv run --offline python methods/034-gpt-6-astra-low-line-polygons/run.py inputs/kale-1913-page-113.png
```

Artifacts are as in method 033: `regions.json`, `ownership.png`, `overlay.png` and `lines.png` under `outputs/<input>/034-gpt-6-astra-low-line-polygons/`. Method 033's `reference-evaluation/` on each page scores this method's output alongside Terra's.

## Recorded results, 2026-11-04 15:49 UTC

On pages 17, 97 and 113, the line decisions, dropped marks, unassigned ink and outlines are identical to method 033's. Astra 020 and Terra 025 group the pages identically, and both sets of boxes lead to the same line ownership.

Against the passage references, Astra 020's raw boxes include, per page:

| Page | Other passages' ink | Own ink left out | Separator pixels |
| --- | ---: | ---: | ---: |
| 17 | 17 | 56 | 11 |
| 97 | 0 | 0 | 1 |
| 113 | 3,930 | 94 | 491 |

This method's polygons have 0 for all three counts on every page. Only the page-113 reference has been reviewed by the user; pages 17 and 97 are proposed. See method 033 for the evaluation's scope and limitations.
