# 006-gemini-3.8-flash-direct: Gemini 3.8 Flash direct regions

This method sends one raw page image and the same region-grouping prompt used for Astra to Gemini 3.8 Flash. The model returns normalized boxes, types, keep flags, content reading order and uncertainty flags.

## Method and settings

1. Read the PNG's exact bytes, without local resizing.
2. Send the image inline with resolution `high`, together with `prompt.txt`, in a fresh Interactions API request.
3. Request low thinking effort and JSON matching `response-schema.json`.
4. Save the exact request, response body and model output text before parsing.
5. Validate the returned regions and convert normalized coordinates to input-image pixels.
6. Render the returned boxes and record usage, API wall time and foreground diagnostics.

| Setting | Value |
| --- | --- |
| Model | gemini-3.8-flash |
| Endpoint | https://generativelanguage.googleapis.com/v1beta/interactions |
| Thinking level | low |
| Thinking summaries | none |
| Image resolution | high |
| Maximum output tokens, including thinking | 16,384 |
| Response format | application/json with JSON Schema |
| Service tier | standard |
| Storage parameter | store=false |
| Automatic retries | 0 |

The prompt and schema are copied verbatim from method 005. The coordinate convention is `[x1,y1,x2,y2]`, normalized to 0–1000. Conversion uses x × image width / 1000 and y × image height / 1000. Returned rectangles and flags are preserved.

`regions.py` contains the same region validation and coordinate conversion as method 005, with footnote number tags placed below their boxes in the display. `diagnostics.py` contains the same measurement functions as the previous methods.

## Run

From the project root:

```sh
uv pip install --python .venv/bin/python -r methods/006-gemini-3.8-flash-direct/requirements.txt
uv run --offline python methods/006-gemini-3.8-flash-direct/run.py inputs/kale-1913-page-017.png --check
uv run --offline python methods/006-gemini-3.8-flash-direct/run.py inputs/kale-1913-page-017.png
```

Authentication checks `GEMINI_API_KEY`, then `GOOGLE_API_KEY`, then the locally stored `llm` key named `gemini`. A different stored key name can be supplied with `--llm-key-name`. The key is sent in the `x-goog-api-key` header and is excluded from saved request artifacts.

For a repeat request, choose a fresh output directory:

```sh
uv run --offline python methods/006-gemini-3.8-flash-direct/run.py inputs/kale-1913-page-017.png --output-dir outputs/kale-1913-page-017/006-gemini-3.8-flash-direct/run-004
```

Existing nonempty output directories are preserved. Each invocation makes one request; errors, incomplete responses and validation failures are saved with that attempt.

## Recorded page-17 attempts

All three requests sent the same payload bytes and source PNG. The completed result is in [run-003](../../outputs/kale-1913-page-017/006-gemini-3.8-flash-direct/run-003/).

| Attempt directory | Endpoint version | HTTP status | API wall time | Result |
| --- | --- | --- | --- | --- |
| method output root | v1 | 400 | 9.11 s | Inline image input rejected; error directed the request to v1beta |
| run-002 | v1beta | 503 | 1.07 s | High demand |
| run-003 | v1beta | 200 | 341.23 s | Completed; 9 regions, 7 kept, 0 uncertain |

The completed response reported 1,413 input tokens (306 text and 1,107 image), 378 output tokens, 0 thought tokens and 0 cached tokens. At the recorded paid-tier rates, its estimated cost is $0.00247725. Raw usage also includes `initial_input_tokens=1698`; the estimate uses `total_input_tokens=1413`, which sums with output to the reported `total_tokens=1791`.

The completed request, raw response, model text and derived boxes are preserved without manual boundary changes. The failed attempts retain their exact request and error response.

## Artifacts

Outputs are saved under `outputs/<input_id>/006-gemini-3.8-flash-direct/`.

- `request.json`: exact request body, including the encoded source image, prompt, schema and settings.
- `prompt.txt`: the exact input text.
- `response.json`: raw HTTP response body.
- `model-output.txt` and `parsed-regions.json`: model output text and its formatted JSON.
- `regions.json`: raw normalized boxes, derived pixel boxes, returned model ID, response ID, raw usage, cost estimate, timing, settings, validation warnings and checksums.
- `run.json`: attempt status, request metadata and any error.
- `overlay.png`: blue for kept regions, purple for excluded regions, red for uncovered measured ink. Numbers show content reading order; H and PN mark the header and page number.
- `ink-mask.png`: foreground pixels used for diagnostic measurements.

Primary diagnostics include all returned boxes; `kept_regions_metrics` includes only `keep=true` regions. The same grayscale threshold, margin exclusions and component/rule filtering are used as in the preceding methods.

## Usage and cost

The Interactions API reports `total_input_tokens`, `total_output_tokens` and `total_thought_tokens` separately. The normalized usage record sums text output and thinking for billable output and checks this against `total_tokens`.

`pricing.json` records the published paid-tier standard rates checked on 2026-11-02: $0.75 per million input tokens, $0.075 per million cached input tokens, and $3.75 per million output tokens including thinking, through 2026-12-31. The estimate is calculated from actual returned usage; account billing can be inspected separately.

## Interface references

The [Interactions API reference](https://ai.google.dev/api/interactions-api), [inline image input](https://ai.google.dev/gemini-api/docs/image-understanding), [per-image resolution](https://ai.google.dev/gemini-api/docs/media-resolution), [thinking controls](https://ai.google.dev/gemini-api/docs/thinking), [structured output](https://ai.google.dev/gemini-api/docs/structured-output) and [pricing](https://ai.google.dev/gemini-api/docs/pricing) were checked on 2026-11-02.
