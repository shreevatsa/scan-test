# Scanned-book layout investigation

Read this file before starting a local Codex or Claude Code session.

## Goal

Find meaningful, ordered page regions in scanned books for a future web app.
Preserve original scan pixels. Keep multi-line Sanskrit verses together,
separate prose commentary, lead-ins, footnotes and page furniture, and expose
uncertain boundaries for editing. Full OCR or regeneration is unnecessary.

## Available material

- [../NOTEBOOK.md](../NOTEBOOK.md): active append-only notebook; methods 001-geometry, 002-pp-doclayout-s, 003-pp-doclayoutv3, 004-pp-doclayoutv3-pixel-refinement, 005-gpt-6-astra-direct, 006-gemini-3.8-flash-direct, 007-gemini-4-argon-direct, 008-claude-sonnet-5.5-direct, 009-gemini-4-argon-high, 010-claude-fable-5.1-high, 011-claude-fable-5.1-max and 012-claude-opus-5.5-max have been run on input kale-1913-page-017. Method 004's completed result is under its run-002 output subdirectory. Methods 005–012 preserve direct API requests, responses, parsed boxes, usage and timing. Method 006's completed result is under run-003; its earlier HTTP 400 and 503 attempts are preserved. Method 007's completed result is under run-003: 9 regions, 8.67 seconds and an estimated paid-tier cost of $0.0077. The raw overlay uses the requested x/y order; coordinate-order-check shows the explicit y/x interpretation of the model's returned arrays. Its two earlier HTTP 429 attempts are preserved in the method output root and run-002. The notebook contains the completed result, replacing those failed-attempt sections at the user's request. Method 008 completed a fresh Claude Sonnet 5.5 API request with the same prompt and original image, adaptive thinking at low effort and a provider-compatible schema adapter: 9 boxes, 5.21 seconds and an estimated cost of $0.014008. Its footnote-labeled box is below the printed footnotes; original returned boxes are preserved. Methods 009–012 preserve higher-effort tests with the same image and frozen prompt: Gemini 4 Argon high thinking, Fable 5.1 high and max effort, and Opus 5.5 max effort. Each returned 9 regions with one footnote-labeled region. The notebook records the original overlays, reported thinking tokens, costs and boundary observations.
- [NOTEBOOK-initial.md](NOTEBOOK-initial.md): archived initial draft containing the four historical method results.
- [COMPARISON.md](COMPARISON.md): earlier project notes, aggregate comparisons and proposed experiments.
- `summarize_baseline.py`: standard-library-only regeneration of the write-up's
  marked tables, `output/layout-baseline-summary.json` and
  `output/layout-baseline-pages.csv`. Use `--check` for read-only verification.
- `output/Kale-detector-preview.png`: the original page-17 comparison plate
  extracted unchanged from the earlier archive.
- `input/Kale-1913-pp21-272.pdf`: the original 252-page PDF.
- `input/Kale-region-experiment.zip`: previous 24-page experiment, including
  custom geometric baseline, PP-DocLayout-S and PP-DocLayoutV3 results, model
  download manifest, code, and review notes. This did not run k2pdfopt itself.
- `input/regions.json`: previous raw detections for convenience.
- `pages/page-017.png`, `pages/page-097.png`, `pages/page-113.png`: source-image
  renders for three difficult cases. These are unannotated model inputs.
- `PROMPT.md`: a candidate prompt and normalized-box schema.
- `vision-regions.json`: the current assistant's interactive visual proposals.
- `output/Kale-vision-pilot-metrics.json`: diagnostic coverage/overlap values.
- `make_pilot.py`: recreates comparison diagrams without any model call.
- `output/Kale-vision-pilot.pdf`: illustrated findings from this small pilot.

## What has and has not happened

On 2026-11-02, method 005 made one fresh OpenAI Responses API request to gpt-6-astra with the shared page-17 PNG and the frozen region prompt. The response and resulting artifacts are recorded in the root notebook. Method 006 then sent the same image, prompt and schema to gemini-3.8-flash with low thinking and high image resolution via Google's Interactions API. The completed run returned 9 boxes in 341.23 seconds, with 1,413 input and 378 output tokens and an estimated paid-tier cost of $0.00247725. Method 007 then attempted gemini-4-argon with the same request settings; it returned HTTP 429 in 0.51 seconds, with zero input-token quota on the Free tier. A retry at 15:15:20 UTC returned HTTP 429 in 0.50 seconds, with zero requests per day on the Free tier; this is preserved in method 007's run-002 directory. After billing was added, method 007 completed at 15:19:59 UTC in 8.67 seconds, returning 9 regions with 1,835 input and 403 output tokens, for an estimated paid-tier cost of $0.0077. Its arrays appear to use y/x order despite the prompt requesting x/y; both the original output and an explicitly swapped-coordinate diagnostic are preserved. The user requested replacing the failed-attempt notebook entries with this completed result. On 2026-11-03 at 04:23:42 UTC, method 008 sent the unchanged prompt and original image to claude-sonnet-5-5. Its structured-output schema moves unsupported numerical and array-length constraints into descriptions and validates the original constraints locally. The response returned 9 boxes in 5.21 seconds, with 4,934 input and 414 output tokens including 0 reported thinking tokens, for an estimated cost of $0.014008. The footnote-labeled box lies below the printed footnotes and the final commentary box includes them. On 2026-11-03, methods 009–012 tested higher effort with the same input, frozen prompt and existing provider schema handling. Gemini 4 Argon high completed in 42.04 s ($0.02806 estimated), Fable 5.1 high in 4.95 s ($0.07009), Fable 5.1 max in 52.63 s ($0.28724), and Opus 5.5 max in 58.27 s ($0.148936). Their reported thinking-token counts were 2,035, 0, 4,343 and 6,045 respectively. Each returned one footnote-labeled region; original boxes and observed clipping or grouping are recorded separately for each method. The paragraphs below describe the earlier interactive pilot.

The chat assistant visually grouped seven verse passages across three pages
into whole blocks and estimated their coordinates. This was an interactive
pass with prior conversation context, not a fresh independent API experiment.
Its approximate crop coordinates have not been silently refined to fit pixels.
No Claude, Gemini or external OpenAI API calls were made. No latency, cost,
repeatability or formal region accuracy was measured for the visual pass.

The earlier specialized detectors ran locally on CPU. PP-DocLayoutV3 was
sensitive to the confidence threshold on Sanskrit. The geometric baseline
preserved most foreground but merged passages and failed on a crowded page.
A hybrid recovered much missed ink while still requiring grouping edits.
Foreground coverage is not segmentation accuracy: a whole-page box scores well.

## Notebook convention

The active notebook is ../NOTEBOOK.md at the project root. Put each method's code and README under ../methods/<method_id>/, shared raw images under ../inputs/, and run artifacts under ../outputs/<input_id>/<method_id>/. Append actual method/test-case results to the notebook, linking the method README and embedding its output image. Use full method names and one physical line per paragraph. Keep project planning and cross-experiment conclusions in separate documents. Preserve existing notebook entries and output directories when adding methods or test cases; use a fresh output subdirectory for a repeat run.

The current test case is PDF page 17 / 252. The broader experiment proposal below is background; methods and additional test cases are to be introduced one at a time.

## Next experiment

1. Pick actual provider model IDs and confirm their vision/structured-output
   interfaces from current provider documentation. Do not assume a model alias.
2. For a blind pilot, give each provider the unannotated source render and the
   same PROMPT.md, one page per fresh request. Do not show the existing boxes
   or assistant proposals until outputs have been saved.
3. Save raw responses, parsed boxes, exact model ID, prompt, image size,
   generation parameters, token usage and wall-clock time. Preserve failures.
4. Repeat each request to check stability. Then broaden to the original 24
   pages and several other books, rather than treating these hard cases as
   representative of every page.
5. Compare whole-verse grouping, commentary separation, missing text, clipping,
   overlaps and reading order. Define a small independent reference set or
   have the user review before calculating a region accuracy score.
6. Keep model grouping and pixel boundary refinement separately measurable.
   Consider asking the model to group numbered detected lines rather than
   estimating every crop coordinate from scratch.

## Access and environment

The cloud environment used for this conversation had no provider API keys
configured and no Codex, Claude or llm CLI installed. That says nothing about
the user's own machine.

Codex can be signed in with a ChatGPT subscription for interactive agent work.
That sign-in is distinct from credentials for direct OpenAI Platform API calls.
Use locally configured credentials for programmatic provider comparisons.
Do not ask the user to paste keys into a prompt or commit them to a repository.

The earlier ONNX run triggered a review of unexpected runtime telemetry. Its
final reported run disabled telemetry and denied network sockets. Preserve
those safeguards if reproducing that local detector experiment. The new
diagram script does not import ONNX Runtime or call any model service.

## Recreate this pilot report

From this extracted directory:

```bash
python -m pip install -r requirements.txt
python make_pilot.py
```

This command redraws saved proposals; it does not re-run a language model.

Suggested opening message for a coding agent:

> Read HANDOFF.md. Continue the comparison of general vision-language models
> for scanned-book region grouping. Start with the three unannotated images,
> use PROMPT.md, and save exact model/run metadata. Check available local
> authentication before making provider calls. Keep the interactive pilot
> separate from independent model results.
