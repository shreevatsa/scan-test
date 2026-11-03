# 007-gemini-4-argon-direct: Gemini 4 Argon direct regions

This method sends one raw page image and a frozen region-grouping prompt to Gemini 4 Argon. The model returns normalized boxes, region types, keep flags, reading order and uncertainty flags.

## Method and settings

1. Read the PNG's exact bytes, without local resizing.
2. Send the image inline with resolution `high`, together with `prompt.txt`, in a fresh Interactions API request.
3. Request low thinking effort and JSON matching `response-schema.json`.
4. Save the exact request, response body and model output text before parsing.
5. Validate the returned regions and convert normalized coordinates to input-image pixels.
6. Render the returned boxes and record usage, elapsed time and foreground diagnostics.

| Setting | Value |
| --- | --- |
| Model | gemini-4-argon |
| Endpoint | https://generativelanguage.googleapis.com/v1beta/interactions |
| Thinking level | low |
| Thinking summaries | none |
| Image resolution | high |
| Maximum output tokens, including thinking | 16,384 |
| Response format | application/json with JSON Schema |
| Service tier | standard |
| Storage parameter | store=false |
| Transport | Synchronous, non-streaming |
| Automatic retries | 0 |

The input prompt and schema are byte-for-byte copies of methods 005 and 006. All request fields match method 006's completed request except the model ID. The coordinate convention is `[x1,y1,x2,y2]`, normalized to 0–1000. Conversion uses x × image width / 1000 and y × image height / 1000. Returned rectangles and flags are preserved.

`regions.py` and `diagnostics.py` are copied unchanged from method 006. Footnote number tags are placed below their boxes in the display.

## Recorded page-17 attempts

The request at 2026-11-02 15:09:53 UTC returned HTTP 429 in 0.51 seconds. Google reported `too_many_requests` with this message: “Rate limit exceeded for model gemini-4-argon (limit: 0 input tokens per minute on Free Tier). Please upgrade your tier at https://ai.dev/rate-limit.”

The exact request, prompt, raw error response and run metadata are preserved under [the method output directory](../../outputs/kale-1913-page-017/007-gemini-4-argon-direct/). The request fields match method 006's completed request except for the model ID. Google rejected this attempt before returning region predictions or usage.

A second request at 2026-11-02 15:15:20 UTC used the locally stored `llm` key named `gemini` and identical payload bytes. It returned HTTP 429 in 0.50 seconds with: “Rate limit exceeded for model gemini-4-argon (limit: 0 requests per day on Free Tier). Please upgrade your tier at https://ai.dev/rate-limit.” Its [request, response and metadata](../../outputs/kale-1913-page-017/007-gemini-4-argon-direct/run-002/) are preserved separately.

The third request at 2026-11-02 15:19:59 UTC completed with HTTP 200 after billing was added. Its [completed output directory](../../outputs/kale-1913-page-017/007-gemini-4-argon-direct/run-003/) contains 9 returned regions (7 kept, 0 uncertain). API wall time was 8.67174 seconds, response headers arrived at 8.67086 seconds and the first response-body byte at 8.67089 seconds. Usage was 1,835 input tokens (728 text and 1,107 image), 403 text output tokens and 0 reported thinking tokens, for an estimated paid-tier cost of $0.0077.

The completed request body is byte-identical to both rejected requests. The repeat command below uses a fresh output directory and preserves all three attempts.

## Run

From the project root, using the existing project environment:

```sh
uv run python methods/007-gemini-4-argon-direct/run.py inputs/kale-1913-page-017.png --check
uv run python methods/007-gemini-4-argon-direct/run.py inputs/kale-1913-page-017.png
```

The pinned image-processing dependencies are listed in `requirements.txt`. Authentication checks `GEMINI_API_KEY`, then `GOOGLE_API_KEY`, then the locally stored `llm` key named `gemini`. A different stored key name can be supplied with `--llm-key-name`. The key is sent in the `x-goog-api-key` header and excluded from saved request artifacts.

For a repeat request, choose a fresh output directory:

```sh
uv run python methods/007-gemini-4-argon-direct/run.py inputs/kale-1913-page-017.png --output-dir outputs/kale-1913-page-017/007-gemini-4-argon-direct/run-004
```

Existing nonempty output directories are preserved. Each invocation makes one request; errors, incomplete responses and validation failures are saved with that attempt.

## Artifacts

Outputs are saved under `outputs/<input_id>/007-gemini-4-argon-direct/`.

- `request.json`: exact request body, including the encoded source image, prompt, schema and settings.
- `prompt.txt`: the exact input text.
- `response.json`: raw HTTP response body.
- `response-headers.json`: selected response headers, including server timing if provided.
- `model-output.txt` and `parsed-regions.json`: model output text and its formatted JSON.
- `regions.json`: raw normalized boxes, derived pixel boxes, returned model ID, response ID, raw usage, cost estimate, timing, settings, validation warnings and checksums.
- `run.json`: attempt status, request metadata, timing and any error.
- `overlay.png`: blue for kept regions, purple for excluded regions, red for uncovered measured ink. Numbers show content reading order; H and PN mark the header and page number.
- `ink-mask.png`: foreground pixels used for diagnostic measurements.

Primary diagnostics include all returned boxes; `kept_regions_metrics` includes only `keep=true` regions. The grayscale threshold, margin exclusions and component/rule filtering match the preceding methods.

## Timing

All durations start immediately before opening the HTTP request. `response_headers_seconds` ends when response headers are available; `response_first_body_byte_seconds` ends when the first response-body byte is read; `api_wall_seconds` ends after the full body is read. The request is non-streaming, so first-body-byte timing measures delivery of the completed JSON response rather than time to the model's first generated token. Image loading, credential lookup, request construction, artifact writes and overlay rendering occur outside the API timer.

## Coordinate-order inspection

The completed response appears to use `[y1,x1,y2,x2]` despite the prompt requesting `[x1,y1,x2,y2]`. The original overlay and region JSON use the requested order and are preserved. The page-number array, for example, is `[71,126,95,175]`.

A separate diagnostic applies permutation `[1,0,3,2]` before the same normalized-to-pixel conversion. It was generated with:

```sh
uv run python methods/007-gemini-4-argon-direct/inspect_coordinates.py outputs/kale-1913-page-017/007-gemini-4-argon-direct/run-003
```

The diagnostic's `coordinate-order-check/overlay.png` displays this interpretation. Its `regions.json` stores both the returned arrays and converted coordinates, the explicit transformation, input metadata and source/script hashes. The diagnostic leaves the API request, response, model text and original run artifacts intact. Existing diagnostic output is protected against overwriting.

## Usage and cost

The Interactions API reports `total_input_tokens`, `total_output_tokens` and `total_thought_tokens` separately. The normalized usage record sums text output and thinking for billable output and checks this against `total_tokens`.

`pricing.json` records the published paid-tier standard rates checked on 2026-11-02: $2.00 per million input tokens, $0.10 per million cached input tokens and $10.00 per million output tokens including thinking, through 2026-11-30. Cost is estimated from returned usage.

## Interface references

The [Gemini 4 Argon model documentation](https://ai.google.dev/gemini-api/docs/models/gemini-4-argon), [Interactions API reference](https://ai.google.dev/api/interactions-api), [thinking controls](https://ai.google.dev/gemini-api/docs/thinking), [structured output](https://ai.google.dev/gemini-api/docs/structured-output) and [pricing](https://ai.google.dev/gemini-api/docs/pricing) were checked on 2026-11-02.
