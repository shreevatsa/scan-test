# 064 — Formatted transcription on joined fragment lines

This is [method 055](../055-gemini-4-argon-low-region-transcription-formatting/README.md) with its local source pinned to [method 063](../063-fragment-band-lines/README.md). The prompt, cut-outs, response schema, model settings, cost accounting and page-document builder are copied from method 055. The run's source and output paths identify the new methods.

`config.json` changes the source method and descriptive name. `run.py` adds this method's description. The other runtime files are byte copies of method 055. Its command-line interface and output protections apply.

```sh
uv run --offline python methods/064-gemini-4-argon-low-fragment-line-transcription/run.py \
  inputs/PAGE.png --run RUN --check
```

The run name selects method 063's region results for the page and any available neighbors. Explicit `--previous none` and `--next none` omit unavailable context. Removing `--check` submits the transcription request.

On 2026-11-08 the request builder passed its local check on a private sample page, with 25 complete line pieces. The existing sample's transcription was transferred locally to the corrected geometry. This method has a request-construction check and awaits a paid transcription run.
