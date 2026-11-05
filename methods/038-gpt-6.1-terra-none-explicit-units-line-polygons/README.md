# 038-gpt-6.1-terra-none-explicit-units-line-polygons: GPT-6.1 Terra without reasoning, explicit units + line ownership with ink on no line and rule pieces, polygon regions

This local method applies [method 036](../036-gpt-6.1-terra-none-unlined-ink-ownership/README.md)'s ownership and outline recipe to the boxes of [method 037](../037-gpt-6.1-terra-none-explicit-units/README.md) instead of method 025. Method 034 applied method 033's recipe to Astra 020 in the same way. The method makes no API calls and never changes the source result.

Every file except two is byte-identical to method 036's: `ownership.py`, `analysis.py`, `geometry.py`, `line-config.json`, `evaluate.py`, `sweep.py`, `stability.py` and `test_ownership.py`. The two exceptions:
- **`config.json`:** `base_method_id` is `037-gpt-6.1-terra-none-explicit-units`, and the name differs.
- **`run.py` and `crossbook.py`:** the overlay places labels for method 037's `note` type the way method 036 places them for `footnote`. `crossbook.py` reads its source method from `config.json`.

## Run

```sh
uv run --offline python methods/038-gpt-6.1-terra-none-explicit-units-line-polygons/test_ownership.py
uv run --offline python methods/038-gpt-6.1-terra-none-explicit-units-line-polygons/run.py inputs/cole-1903-page-003.png
uv run --offline python methods/038-gpt-6.1-terra-none-explicit-units-line-polygons/run.py inputs/cole-1903-page-003.png \
  --base-regions outputs/cole-1903-page-003/037-gpt-6.1-terra-none-explicit-units/run-002/regions.json \
  --output-dir outputs/cole-1903-page-003/038-gpt-6.1-terra-none-explicit-units-line-polygons/run-002
cd methods/038-gpt-6.1-terra-none-explicit-units-line-polygons
uv run --offline python crossbook.py ../../outputs/surveys/038-gpt-6.1-terra-none-explicit-units-line-polygons
uv run --offline python stability.py ../../outputs/surveys/038-gpt-6.1-terra-none-explicit-units-line-polygons
```

Reference evaluations are under `outputs/<input>/038-gpt-6.1-terra-none-explicit-units-line-polygons/reference-evaluation/` and `run-002/reference-evaluation/`. Each scores method 037's raw boxes and this method's polygons.

## Recorded results

See the method 038 entry in [NOTEBOOK.md](../../NOTEBOOK.md). In brief:
- **References.** Against the nine references, both requests give 0 other passages' ink, 0 own ink left out and 0 separator pixels on eight pages. On Telang page 108, 6,714 pixels are left out under both requests. Method 037 split one apparatus entry into two or three regions, which hold only that entry's ink and are consecutive in reading order. So this is a grouping difference that the evaluation scores as left-out ink, not an ownership error.
- **Stability.** See method 037's README.

The robustness sweep was not run for this method: its ownership recipe is method 036's, which was swept on the same pages.
