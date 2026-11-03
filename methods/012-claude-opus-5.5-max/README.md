# 012-claude-opus-5.5-max: Claude Opus 5.5 max effort

## Method and settings

The method sends the original PNG bytes and frozen prompt to `claude-opus-5-5` through the Messages API. All request fields match method 011 except the model ID, which is `claude-opus-5-5`.

| Setting | Value |
| --- | --- |
| Model | claude-opus-5-5 |
| Thinking | adaptive |
| Effort | max |
| API version | 2026-10-21 |
| Image processing | Provider default; no local resizing |
| Maximum output tokens including thinking | 16,384 |
| Service selection | Provider default |
| Transport | Synchronous, non-streaming |
| Automatic retries | 0 |

The exact prompt, original JSON Schema, provider-compatible schema and schema adapter are copied unchanged from method 008. Numerical limits and fixed array length are carried as descriptions in the transmitted schema and validated locally. The image is sent inline without local resizing.

Anthropic's output token count already includes thinking. The thinking-token breakdown is saved as a subset and is not added again for pricing. Input tokens are the sum of uncached, cache creation and cache read tokens. The published standard rates checked on 2026-11-03 are $4/M ordinary input, $20/M output including thinking, $0.20/M cache read, $5/M five-minute cache write and $8/M one-hour cache write.

Authentication checks `ANTHROPIC_API_KEY`, then the `llm` key named `anthropic`. Supply `--workspace-id` or `ANTHROPIC_WORKSPACE_ID` if an unscoped key requires a workspace selection. The secret is sent only in the HTTP authentication header.

The [Fable model and pricing](https://platform.claude.com/docs/en/models/opus-5-5/overview) and [model comparison](https://platform.claude.com/docs/en/models/overview) were checked for this run.

## Run

From the project root, using the existing project environment:

```sh
uv run python methods/012-claude-opus-5.5-max/run.py inputs/kale-1913-page-017.png --check
uv run python methods/012-claude-opus-5.5-max/run.py inputs/kale-1913-page-017.png
```

For a repeat call, choose a fresh output directory:

```sh
uv run python methods/012-claude-opus-5.5-max/run.py inputs/kale-1913-page-017.png --output-dir outputs/kale-1913-page-017/012-claude-opus-5.5-max/run-002
```

Existing output directories are protected against overwriting. Each invocation makes one request and preserves failures.

## Artifacts and coordinates

Outputs are saved under `outputs/<input_id>/012-claude-opus-5.5-max/`. They include the exact `request.json`, frozen `prompt.txt`, raw `response.json`, selected `response-headers.json`, `model-output.txt`, `parsed-regions.json`, `regions.json`, `run.json`, `overlay.png` and `ink-mask.png`. The Claude runner also saves the transmitted schema and any returned readable thinking text.

The coordinate convention is `[x1,y1,x2,y2]`, normalized to 0–1000. Conversion is x × image width / 1000 and y × image height / 1000. Returned boxes and flags are preserved. Blue marks kept regions; purple marks excluded regions; red marks uncovered measured ink. Numbers show content reading order; H and PN mark page furniture.

`regions.py` and `diagnostics.py` are copied unchanged from the preceding provider method. The same foreground mask and box rasterization are used. Any coordinate-order diagnostic is saved separately with an explicit transformation.

All recorded durations start before opening the HTTP request. Header time ends when HTTP headers are available; first-body-byte time ends after reading one byte; API wall time ends after reading the complete response. The request is non-streaming. File writes, image rendering and credential lookup are outside the timer.

The supported effort levels were checked in the [effort documentation](https://platform.claude.com/docs/en/build-with-claude/effort).

## Recorded page-17 run

The request at 2026-11-03 14:31:28 UTC completed with HTTP 200. The [output directory](../../outputs/kale-1913-page-017/012-claude-opus-5.5-max/) contains the exact request, raw response and returned boxes. Requested and returned model IDs match.

| Measurement | Result |
| --- | --- |
| Output boxes | 9 |
| Boxes marked keep=true | 7 |
| Regions marked uncertain | 0 |
| Footnote regions | 1 |
| API wall time | 58.27 s |
| Input tokens | 4,934 |
| Output tokens, including thinking | 6,460 |
| Thinking tokens reported | 6,045 |
| Cache read or creation tokens | 0 |
| Estimated paid-tier cost | $0.148936 |

The cost estimate uses $4.00 per million input tokens and $20.00 per million output tokens including thinking: (4,934 × $4.00 + 6,460 × $20.00) / 1,000,000.

The footnotes are assigned one region. Its lower boundary clips the printed footnote line. Both commentary boxes clip their last lines. The second lead-in box clips part of its second line; the second verse box extends upward into that lead-in line.

The raw request/response, source checksums and derived pixel coordinates were verified. The recorded overlay uses the requested x/y coordinate convention without manual boundary changes.
