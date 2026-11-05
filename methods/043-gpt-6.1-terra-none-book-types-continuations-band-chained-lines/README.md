# 043-gpt-6.1-terra-none-book-types-continuations-band-chained-lines: GPT-6.1 Terra without reasoning, book types with continuation flags + band-chained line ownership, polygon regions

This local method is [method 041](../041-gpt-6.1-terra-none-explicit-units-continuations-band-chained-lines/README.md)'s recipe on [method 042](../042-gpt-6.1-terra-none-book-types-continuations/README.md)'s boxes. Its purpose is to check that book-specific types do not change grouping, and to carry the book types into polygon regions. No API calls; the source result is never changed.

## What changed from method 041

- **`config.json`:** `base_method_id` is method 042, and the name says so.
- **`run.py`:** each region record also carries the source region's `region_class`, unchanged. The overlay labels notes by class rather than by type. The docstring says so.
- **`stability.py`:** each comparison also reports `class_differences`, which compare region classes, using the type for a region without one. With `--against` method 041, a book type such as `commentary` is then compared with method 041's neutral `paragraph`.
- **`book_types.py`** (new): compares this method's types with the hand-written unit trees of the schema examples (`schema/examples/*/pages/*.json`). Those give a book type to every method 041 first-request region on seven pages. Each example region is matched to the region of this method that owns most of its ink, and the types are compared. Splits, merges and unmatched regions are listed.

`analysis.py`, `geometry.py`, `line-config.json`, `ownership.py`, `evaluate.py`, `crossbook.py`, `sweep.py` and `test_ownership.py` are byte-identical to method 041's.

## Run

```sh
uv run --offline python methods/043-gpt-6.1-terra-none-book-types-continuations-band-chained-lines/test_ownership.py
uv run --offline python methods/043-gpt-6.1-terra-none-book-types-continuations-band-chained-lines/run.py inputs/kale-1913-page-107.png
uv run --offline python methods/043-gpt-6.1-terra-none-book-types-continuations-band-chained-lines/run.py inputs/kale-1913-page-107.png \
  --base-regions outputs/kale-1913-page-107/042-gpt-6.1-terra-none-book-types-continuations/run-002/regions.json \
  --output-dir outputs/kale-1913-page-107/043-gpt-6.1-terra-none-book-types-continuations-band-chained-lines/run-002
cd methods/043-gpt-6.1-terra-none-book-types-continuations-band-chained-lines
O=../../outputs/surveys/043-gpt-6.1-terra-none-book-types-continuations-band-chained-lines
uv run --offline python stability.py $O/runs --pages ../../inputs/pages-runs.json
uv run --offline python stability.py $O/runs --pages ../../inputs/pages-runs.json --against 041-gpt-6.1-terra-none-explicit-units-continuations-band-chained-lines
uv run --offline python book_types.py $O/book-types/book-types.json
```

Reference evaluations are in `outputs/<input>/043-…/reference-evaluation/` and `run-002/reference-evaluation/` for Kale 106, Hertel 152 and Dutt 17F chapter 1 page 2. Each scores method 042's raw boxes and this method's polygons with the split-aware `evaluate.py`.

## Recorded results

See "Book types from the type list" in [NOTEBOOK.md](../../NOTEBOOK.md). In brief, on the 12 run pages of Kale, Hertel and Dutt:
- **References:** 0 / 0 / 0 on all three referenced pages in both requests (method 042's raw boxes: Kale 106 225/350/0 and 201/103/0; Dutt page 2 0/47/0 and 0/35/0; Hertel 152 0/0/0).
- **Book types:** 139 of 139 example regions get the example's type in both requests. Two merges, both of one unit: Kale page 108's footnote 3, which the example has as two regions (both requests), and Hertel page 152's running title and tale title (first request), which the Hertel type list calls one running header.
- **Request-to-request stability:** ownership and keep flags identical on 10 of 12 pages. The other two differ only in whether Hertel's running header is one region or two. Types identical on all matched regions. Method 041 is identical on 11 of 12 on these pages.
- **Against method 041,** request by request: region classes agree on every matched region except one, a Kale page 108 footnote that method 041's repeat typed verse. The ownership differences are those listed under method 042.

**Telang run** (Telang 108–111, with Claude's draft type list): 0 / 0 / 0 on Telang 108 in both requests with no apparatus entry split (method 041 split one entry in reading order in its first request and three in its repeat). Ownership and keep flags are identical between the two requests on all 4 pages, against none of 4 under method 041. Survey outputs are in `runs-telang/`.

**Cole run** (Cole 1–4, with Claude's draft type list): 0 / 0 / 0 on Cole page 3 in both requests, with no split or merge. Ownership, keep flags and types are identical between the two requests on all 4 pages (method 041: ownership identical, with 3 type differences). Against method 041, the only ownership difference on each page is the running header, which method 041 split in two. Survey outputs are in `runs-cole/`.

## Limitations

Those of method 041.
