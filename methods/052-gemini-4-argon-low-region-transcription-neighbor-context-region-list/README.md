# 052-gemini-4-argon-low-region-transcription-neighbor-context-region-list: Method 051 with the regions as a list

This is method 051 with `schema_region_list` true in `config.json`: the response schema has `regions` as a list of objects with an `id` from the page's region ids (an enum), instead of an object with one required property per region. `run.py` turns the list into method 044's object keyed by id, keeps the first entry of an id and reports repeated ids; `pagedoc.py` reports regions not returned. Changed files: `prompt.py`, `run.py`, `config.json`.

## Run

```sh
cd methods/052-gemini-4-argon-low-region-transcription-neighbor-context-region-list
uv run --offline python run.py ../../inputs/hertel-panchatantra-page-152.png --check
uv run --offline python run.py ../../inputs/hertel-panchatantra-page-152.png
```

For a whole book whose region step was saved in a named run, `--run NAME` (from method 047) reads the page's and its neighbors' method 043 regions from that run and writes to `outputs/<input>/052-…/NAME/`; give `--types` for inputs whose record has no `book_id`. Scoring uses method 044's `evaluate.py` and `tree.py`; method 047's `book_report.py` (with `TRANSCRIPTION=052-…`) reports on a whole book. Authentication: `GEMINI_API_KEY` or `GOOGLE_API_KEY`, then the stored `llm` key named `gemini`.

## Recorded results

Two requests each on the three referenced pages, all completed (NOTEBOOK, "Stronger readers"):
- **text:** character error rate 0.00% / 0.00% (Hertel 152), 0.19% / 0.06% (Kale 106), 0.03% / 0.00% (Dutt page 2). The remaining differences are mostly at broken print, where the reference gives the intended word;
- **markers:** all four footnote markers on Kale 106 found and related to their footnotes in both requests;
- **trees:** all example units on Hertel 152 and Dutt page 2 matched, except two Dutt groups in the repeat;
- **cost:** $0.489 for the six requests, about $0.08 per page.

**The second Kale full-book run, `book-002`** (2026-11-06; NOTEBOOK, "The second Kale full-book run"): all 252 pages after method 042 + 043 with the revised Kale type list, $15.84.
- **Validity:** 250 of 252 page documents valid.
- **Assembly:** 2,105 units, open-end mismatches at 4 page breaks (two next to the invalid pages).
- **Numbers:** the Vairāgyaśataka's 145 verses with no gap or repeat, and no characters outside the expected scripts.
- **Against Terra's run `book-001`:** the print agrees with Gemini in 16 of 18 sampled differences, with Terra in 1.
