# 051-gemini-4-argon-low-region-transcription-neighbor-context-free-line-counts: Method 050 without fixed line counts in the response schema

This is method 050 with `schema_fixed_line_counts` false in `config.json`: each region's `lines` array has no `minItems`/`maxItems`. The captions still give each region's line count, and `pagedoc.py` reports any region whose count differs. Changed files: `prompt.py` (`build_schema` takes the option), `run.py` (passes it), `config.json`.

## Run

```sh
cd methods/051-gemini-4-argon-low-region-transcription-neighbor-context-free-line-counts
uv run --offline python run.py ../../inputs/hertel-panchatantra-page-152.png --check
uv run --offline python run.py ../../inputs/hertel-panchatantra-page-152.png
```

Scoring uses method 044's `evaluate.py` and `tree.py`. Authentication: `GEMINI_API_KEY` or `GOOGLE_API_KEY`, then the stored `llm` key named `gemini`.

## Recorded results

Hertel 152 and Kale 106 completed; Dutt page 2 was refused with the same HTTP 400.
