# 054-gemini-4-argon-low-region-transcription-unowned-box-pixels: method 052 with cut-outs that keep unowned ink

This is [method 052](../052-gemini-4-argon-low-region-transcription-neighbor-context-region-list/README.md) (Gemini 4 Argon transcription on method 043's regions, with neighbor context) with one change, set by `cutout_unowned_box_pixels` in `config.json`. Each region's cut-out also shows the pixels inside the region's model box that are inside no other region's polygons. The crop is widened to the model box where needed.

**Why:** on Telang's flattened preface pages, method 043 takes the dark bands at the page edges as large non-text components. So the region polygons stop short of them, and method 052's cut-outs blanked out the words printed there ("what ere can e been"). The pixels a cut-out now adds belong to no region, so a region still shows nothing of its neighbors.

The page document is unchanged: its region polygons are still method 043's, so on such pages they do not cover the words in the bands. The text, though, is complete.

Changed files: `cutouts.py` (`cutout` takes the other regions' polygons), `run.py` (passes them when the option is set), `config.json`. The others are byte copies of method 052's.

## Run

```sh
cd methods/054-gemini-4-argon-low-region-transcription-unowned-box-pixels
uv run --offline python run.py ../../inputs/telang-dli-book-page-008.png --types ../../schema/types/telang-dli.json --run book-001 --check --preview-dir /tmp/preview
uv run --offline python run.py ../../inputs/telang-dli-book-page-008.png --types ../../schema/types/telang-dli.json --run book-001
```

## Where it was used

In the Telang full-book walk (NOTEBOOK, "The Telang full-book walk"), on the 11 pages where method 043's large non-text components cover more than 5% of the page: 1, 5–12, 158 and 200. The median page has 0.1%, and the index pages 2.5–3.7% from their table rules.
