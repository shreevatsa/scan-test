# 041-gpt-6.1-terra-none-explicit-units-continuations-band-chained-lines: GPT-6.1 Terra without reasoning, explicit units with continuation flags + band-chained line ownership, polygon regions

This local method is [method 039](../039-gpt-6.1-terra-none-explicit-units-band-chained-lines/README.md)'s recipe on [method 040](../040-gpt-6.1-terra-none-explicit-units-continuations/README.md)'s boxes. Its purpose is to check that adding continuation flags to the prompt does not change grouping, and to carry the flags into polygon regions. No API calls; the source result is never changed.

## What changed from method 039

- **`config.json`:** `base_method_id` is method 040, and the name says so.
- **`run.py`:** each region record also carries the source region's `continues_from_earlier` and `continues_later`, unchanged. The docstring says so.
- **`stability.py`:** three options were added.
  - `--pages` limits the pages to an input list, such as `inputs/pages-runs.json`.
  - `--method` reads another local method's outputs in place of this one's.
  - `--against METHOD` compares this method with another local method request by request (first with first, repeat with repeat), to show the effect of the prompt change.

  The comparison itself is unchanged.

`analysis.py`, `geometry.py`, `line-config.json`, `ownership.py`, `evaluate.py`, `crossbook.py`, `sweep.py` and `test_ownership.py` are byte-identical to method 039's.

## Run

```sh
uv run --offline python methods/041-gpt-6.1-terra-none-explicit-units-continuations-band-chained-lines/test_ownership.py
uv run --offline python methods/041-gpt-6.1-terra-none-explicit-units-continuations-band-chained-lines/run.py inputs/kale-1913-page-106.png
uv run --offline python methods/041-gpt-6.1-terra-none-explicit-units-continuations-band-chained-lines/run.py inputs/kale-1913-page-106.png \
  --base-regions outputs/kale-1913-page-106/040-gpt-6.1-terra-none-explicit-units-continuations/run-002/regions.json \
  --output-dir outputs/kale-1913-page-106/041-gpt-6.1-terra-none-explicit-units-continuations-band-chained-lines/run-002
cd methods/041-gpt-6.1-terra-none-explicit-units-continuations-band-chained-lines
O=../../outputs/surveys/041-gpt-6.1-terra-none-explicit-units-continuations-band-chained-lines/runs
uv run --offline python stability.py $O --pages ../../inputs/pages-runs.json
uv run --offline python stability.py $O --pages ../../inputs/pages-runs.json --method 039-gpt-6.1-terra-none-explicit-units-band-chained-lines
uv run --offline python stability.py $O --pages ../../inputs/pages-runs.json --against 039-gpt-6.1-terra-none-explicit-units-band-chained-lines
```

Reference evaluations are in `outputs/<input>/041-…/reference-evaluation/` and `run-002/reference-evaluation/` on the seven referenced pages of the runs. Each scores method 040's raw boxes and this method's polygons with the split-aware `evaluate.py`.

## Recorded results

See "Continuation flags" in [NOTEBOOK.md](../../NOTEBOOK.md). In brief, on the 28 pages of `inputs/pages-runs.json`:
- **References:** 0 / 0 / 0 on all seven referenced pages in both requests.
  - **Against method 039:** scores are the same except on Hertel page 152's first request, where method 039 scores 2,303 / 0 / 0 because method 037 omitted the margin numbers.
  - **Ownership checks:** 8,115 pixels on Hertel page 152 in each request, from the header and margin numbers (method 039: 7,843 and 8,115), and 1,208 on Cole page 3 (the same as method 039).
  - **Telang page 108, repeat request:** three apparatus entries are split in reading order, against one under method 039.
- **Request-to-request stability:** ownership and keep flags are identical on 23 of 28 pages, against 20 for method 039 on the same pages. Mean ink agreement is 0.978 against 0.990, lowered by two Telang apparatus pages.
- **Effect of the prompt:** against method 039, request by request, ownership is identical on 21 of 28 pages in each request. The differences are apparatus granularity on Telang, margin numbers on Hertel and one footnote on Kale page 108 typed as verse in one result. These are the same kinds of difference seen between two requests under one prompt.

## Limitations

Those of method 039.
