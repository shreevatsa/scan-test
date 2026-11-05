# 010-claude-fable-5.1-high: Claude Fable 5.1 high effort

## Method and settings

The method sends the original PNG bytes and frozen prompt to `claude-fable-5-1` through the Messages API. All request fields match method 008 except the model ID and `output_config.effort`, which is `high`.

| Setting | Value |
| --- | --- |
| Model | claude-fable-5-1 |
| Thinking | adaptive |
| Effort | high |
| API version | 2026-10-21 |
| Image processing | Provider default; no local resizing |
| Maximum output tokens including thinking | 16,384 |
| Service selection | Provider default |
| Transport | Synchronous, non-streaming |
| Automatic retries | 0 |

The exact prompt, original JSON Schema, provider-compatible schema and schema adapter are copied unchanged from method 008. Numerical limits and fixed array length are carried as descriptions in the transmitted schema and validated locally. The image is sent inline without local resizing.

Anthropic's output token count already includes thinking. The thinking-token breakdown is saved as a subset and is not added again for pricing. Input tokens are the sum of uncached, cache creation and cache read tokens. The published standard rates checked on 2026-11-03 are $10/M ordinary input, $50/M output including thinking, $0.25/M cache read, $12.50/M five-minute cache write and $20/M one-hour cache write.

Authentication checks `ANTHROPIC_API_KEY`, then the `llm` key named `anthropic`. Supply `--workspace-id` or `ANTHROPIC_WORKSPACE_ID` if an unscoped key requires a workspace selection. The secret is sent only in the HTTP authentication header.

The [Fable model and pricing](https://platform.claude.com/docs/en/models/fable-5-1/overview) and [model comparison](https://platform.claude.com/docs/en/models/overview) were checked for this run.

## Run

From the project root, using the existing project environment:

```sh
uv run --offline python methods/010-claude-fable-5.1-high/run.py inputs/kale-1913-page-017.png --check
uv run --offline python methods/010-claude-fable-5.1-high/run.py inputs/kale-1913-page-017.png
```

For a repeat call, choose a fresh output directory:

```sh
uv run --offline python methods/010-claude-fable-5.1-high/run.py inputs/kale-1913-page-017.png --output-dir outputs/kale-1913-page-017/010-claude-fable-5.1-high/run-002
```

Existing output directories are protected against overwriting. Each invocation makes one request and preserves failures.

## Artifacts and coordinates

Outputs are saved under `outputs/<input_id>/010-claude-fable-5.1-high/`. They include the exact `request.json`, frozen `prompt.txt`, raw `response.json`, selected `response-headers.json`, `model-output.txt`, `parsed-regions.json`, `regions.json`, `run.json`, `overlay.png` and `ink-mask.png`. The Claude runner also saves the transmitted schema and any returned readable thinking text.

The coordinate convention is `[x1,y1,x2,y2]`, normalized to 0–1000. Conversion is x × image width / 1000 and y × image height / 1000. Returned boxes and flags are preserved. Blue marks kept regions; purple marks excluded regions; red marks uncovered measured ink. Numbers show content reading order; H and PN mark page furniture.

`regions.py` and `diagnostics.py` are copied unchanged from the preceding provider method. The same foreground mask and box rasterization are used. Any coordinate-order diagnostic is saved separately with an explicit transformation.

All recorded durations start before opening the HTTP request. Header time ends when HTTP headers are available; first-body-byte time ends after reading one byte; API wall time ends after reading the complete response. The request is non-streaming. File writes, image rendering and credential lookup are outside the timer.

## Recorded page-17 run

The request at 2026-11-03 14:27:10 UTC completed with HTTP 200. The [output directory](../../outputs/kale-1913-page-017/010-claude-fable-5.1-high/) contains the exact request, raw response and returned boxes. Requested and returned model IDs match.

| Measurement | Result |
| --- | --- |
| Output boxes | 9 |
| Boxes marked keep=true | 7 |
| Regions marked uncertain | 0 |
| Footnote regions | 1 |
| API wall time | 4.95 s |
| Input tokens | 4,934 |
| Output tokens, including thinking | 415 |
| Thinking tokens reported | 0 |
| Cache read or creation tokens | 0 |
| Estimated paid-tier cost | $0.07009 |

The cost estimate uses $10.00 per million input tokens and $50.00 per million output tokens including thinking: (4,934 × $10.00 + 415 × $50.00) / 1,000,000.

The footnote-labeled box (order 7) is below the printed footnotes, which lie inside the final commentary box (order 6). The first verse box clips upper parts of its first line; the second verse box starts below its first line. Both commentary boxes begin partway through their first printed lines.

The raw request/response, source checksums and derived pixel coordinates were verified. The recorded overlay uses the requested x/y coordinate convention without manual boundary changes.
