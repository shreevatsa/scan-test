# 008-claude-sonnet-5.5-direct: Claude Sonnet 5.5 direct regions

This method sends one raw page image and a frozen region-grouping prompt to Claude Sonnet 5.5. The response gives normalized boxes, region types, keep flags, content reading order and uncertainty flags.

## Method and settings

1. Read the PNG's exact bytes, without local resizing.
2. Send the frozen prompt followed by the inline image in a single fresh user message.
3. Request adaptive thinking at low effort and structured JSON.
4. Save the exact request, raw response body, model output text, timing and usage.
5. Validate the original region constraints locally and convert normalized coordinates to image pixels.
6. Render the returned boxes and record the same foreground diagnostics used by the previous methods.

| Setting | Value |
| --- | --- |
| Model | claude-sonnet-5-5 |
| Endpoint | https://api.anthropic.com/v1/messages |
| API version | 2026-10-21 |
| Thinking | adaptive |
| Effort | low |
| Image processing | Provider default; exact PNG bytes; no local resizing |
| Maximum output tokens, including thinking | 16,384 |
| Response format | JSON Schema through output_config.format |
| Service selection | Provider default; returned standard tier, standard speed, global inference |
| Transport | Synchronous, non-streaming |
| Automatic retries | 0 |

The input prompt and original schema are byte-for-byte copies of methods 005–007. The prompt asks for whole verses, separate commentary and lead-ins, footnotes, page furniture, reading order and uncertainty flags. It has no additional instruction about individual numbered footnotes.

The coordinate convention is `[x1,y1,x2,y2]`, normalized to 0–1000. Conversion uses x × image width / 1000 and y × image height / 1000. Returned rectangles and flags are preserved. `regions.py` and `diagnostics.py` are copied unchanged from method 007; footnote number tags are placed below their boxes in the display.

## Schema adaptation

`response-schema.json` preserves the original schema. Claude's structured-output subset does not support its numerical limits or fixed array length. `schema_adapter.py` moves `minimum`, `maximum`, `minItems=4` and `maxItems=4` into descriptions while preserving the other schema fields. The resulting `api-response-schema.json` is sent in `output_config.format` and copied into each run directory. The runner checks that this file matches the documented transformation.

The response is validated locally for the original region fields and types, exactly four integer coordinates from 0 to 1000, positive box dimensions, boolean flags and positive-or-null reading order. Reading-order consistency and furniture flags are also checked. The prompt text is unchanged.

## Run

From the project root, using the existing project environment:

```sh
uv run --offline python methods/008-claude-sonnet-5.5-direct/run.py inputs/kale-1913-page-017.png --check
uv run --offline python methods/008-claude-sonnet-5.5-direct/run.py inputs/kale-1913-page-017.png
```

The pinned image-processing dependencies are listed in `requirements.txt`. Authentication checks `ANTHROPIC_API_KEY`, then the locally stored `llm` key named `anthropic`. A different stored key name can be supplied with `--llm-key-name`. The key is sent as a bearer token and excluded from saved request artifacts.

A key scoped to a workspace can omit the workspace header. For an unscoped key, supply `--workspace-id` or `ANTHROPIC_WORKSPACE_ID`.

For a repeat request, choose a fresh output directory:

```sh
uv run --offline python methods/008-claude-sonnet-5.5-direct/run.py inputs/kale-1913-page-017.png --output-dir outputs/kale-1913-page-017/008-claude-sonnet-5.5-direct/run-002
```

Existing nonempty output directories are preserved. Each invocation makes one request; errors, incomplete responses and validation failures are saved with that attempt.

## Recorded page-17 run

The request at 2026-11-03 04:23:42 UTC completed with HTTP 200 and stop reason `end_turn`. The [output directory](../../outputs/kale-1913-page-017/008-claude-sonnet-5.5-direct/) preserves the request and response. The requested and returned model is `claude-sonnet-5-5`.

| Measurement | Result |
| --- | --- |
| Output regions | 9 |
| Regions marked keep=true | 7 |
| Regions marked uncertain | 0 |
| API wall time | 5.21474 s |
| Response headers available | 5.21360 s |
| First response-body byte | 5.21363 s |
| Input tokens | 4,934 |
| Output tokens, including thinking | 414 |
| Thinking tokens reported | 0 |
| Cache read or creation tokens | 0 |
| Estimated paid-tier cost | $0.014008 |

Returned region types: 2 verse, 3 commentary, 1 lead-in, 1 footnote, 1 running header and 1 page number.

The footnote-labeled box is below the printed footnotes, which lie inside the final commentary box. Both verse boxes clip upper parts of glyphs; the second verse box extends into the first line of following commentary. The recorded overlay uses the returned boxes without boundary changes.

## Artifacts

Outputs are saved under `outputs/<input_id>/008-claude-sonnet-5.5-direct/`.

- `request.json`: exact request body, including the encoded source image, prompt, adapted schema and settings.
- `prompt.txt` and `api-response-schema.json`: exact text prompt and transmitted schema.
- `response.json`: raw HTTP response body.
- `response-headers.json`: selected response headers, including request ID and server timing if returned.
- `model-output.txt` and `parsed-regions.json`: model output text and its formatted JSON.
- `thinking-output.txt`: returned readable thinking text, if a thinking block is present; the raw response preserves all content blocks.
- `regions.json`: raw normalized boxes, derived pixel boxes, returned model ID, raw usage, cost estimate, timing, settings, validation warnings and checksums.
- `run.json`: attempt status, nonsecret request headers, source hashes, timing and any error.
- `overlay.png`: blue for kept regions, purple for excluded regions, red for uncovered measured ink. Numbers show content reading order; H and PN mark the header and page number.
- `ink-mask.png`: foreground pixels used for diagnostic measurements.

Primary diagnostics include all returned boxes; `kept_regions_metrics` includes only `keep=true` regions. The grayscale threshold, margin exclusions and component/rule filtering match the preceding methods.

## Usage, cost and timing

Claude reports uncached input, cache creation and cache read tokens separately. Their sum gives total input tokens. Output tokens include thinking; `output_tokens_details.thinking_tokens` is a subset of that output count. The runner preserves all raw usage and prices the output count once.

`pricing.json` records the published Claude API standard rates checked on 2026-11-02: $2.00 per million ordinary input tokens, $10.00 per million output tokens, $0.10 per million cache read tokens, $2.50 per million five-minute cache write tokens and $4.00 per million one-hour cache write tokens. This run's estimate is (4,934 × $2.00 + 414 × $10.00) / 1,000,000 = $0.014008.

All timing measurements start immediately before opening the HTTP request. They end when response headers arrive, when the first response-body byte is read and when the full response body is read, respectively. The request is non-streaming; first-body-byte time describes delivery of the JSON response. Image loading, credential lookup, request construction, artifact writes and overlay rendering occur outside the API timer.

## Interface references

The [Sonnet 5.5 model and pricing](https://platform.claude.com/docs/en/models/sonnet-5-5/overview), [Messages API](https://platform.claude.com/docs/en/api/http/messages/create), [structured-output subset](https://platform.claude.com/docs/en/build-with-claude/structured-outputs), [image input](https://platform.claude.com/docs/en/build-with-claude/vision), [authentication](https://platform.claude.com/docs/en/manage-claude/authentication) and [token accounting](https://platform.claude.com/docs/en/build-with-claude/prompt-caching) were checked for this implementation.
