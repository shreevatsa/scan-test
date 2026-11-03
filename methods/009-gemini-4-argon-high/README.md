# 009-gemini-4-argon-high: Gemini 4 Argon high thinking

## Method and settings

The method sends the original PNG bytes and frozen prompt to `gemini-4-argon` through the Interactions API. All request fields match method 007 except `generation_config.thinking_level`, which is `high`.

| Setting | Value |
| --- | --- |
| Model | gemini-4-argon |
| Thinking level | high |
| Thinking summaries | none |
| Image resolution | high |
| Maximum output tokens including thinking | 16,384 |
| Service tier | standard |
| Storage parameter | store=false |
| Transport | Synchronous, non-streaming |
| Automatic retries | 0 |

The exact prompt and original JSON Schema are copied unchanged from method 007. The image is sent inline without local resizing. Google input tokens, output tokens and thought tokens are preserved separately; output and thought counts are summed once for the output cost estimate. The published standard rates checked on 2026-11-03 are $2/M input, $0.10/M cached input and $10/M output including thinking, through 2026-11-30.

Authentication checks `GEMINI_API_KEY`, then `GOOGLE_API_KEY`, then the `llm` key named `gemini`. The secret is sent only in the HTTP authentication header.

The [model](https://aistudio.google.com/docs/models/gemini-4-argon), [thinking controls](https://aistudio.google.com/docs/thinking) and [pricing](https://aistudio.google.com/docs/pricing) were checked for this run.

## Run

From the project root, using the existing project environment:

```sh
uv run python methods/009-gemini-4-argon-high/run.py inputs/kale-1913-page-017.png --check
uv run python methods/009-gemini-4-argon-high/run.py inputs/kale-1913-page-017.png
```

For a repeat call, choose a fresh output directory:

```sh
uv run python methods/009-gemini-4-argon-high/run.py inputs/kale-1913-page-017.png --output-dir outputs/kale-1913-page-017/009-gemini-4-argon-high/run-002
```

Existing output directories are protected against overwriting. Each invocation makes one request and preserves failures.

## Artifacts and coordinates

Outputs are saved under `outputs/<input_id>/009-gemini-4-argon-high/`. They include the exact `request.json`, frozen `prompt.txt`, raw `response.json`, selected `response-headers.json`, `model-output.txt`, `parsed-regions.json`, `regions.json`, `run.json`, `overlay.png` and `ink-mask.png`. The Claude runner also saves the transmitted schema and any returned readable thinking text.

The coordinate convention is `[x1,y1,x2,y2]`, normalized to 0–1000. Conversion is x × image width / 1000 and y × image height / 1000. Returned boxes and flags are preserved. Blue marks kept regions; purple marks excluded regions; red marks uncovered measured ink. Numbers show content reading order; H and PN mark page furniture.

`regions.py` and `diagnostics.py` are copied unchanged from the preceding provider method. The same foreground mask and box rasterization are used. Any coordinate-order diagnostic is saved separately with an explicit transformation.

All recorded durations start before opening the HTTP request. Header time ends when HTTP headers are available; first-body-byte time ends after reading one byte; API wall time ends after reading the complete response. The request is non-streaming. File writes, image rendering and credential lookup are outside the timer.

## Recorded page-17 run

The request at 2026-11-03 14:27:07 UTC completed with HTTP 200. The [output directory](../../outputs/kale-1913-page-017/009-gemini-4-argon-high/) contains the exact request, raw response and returned boxes. Requested and returned model IDs match.

| Measurement | Result |
| --- | --- |
| Output boxes | 9 |
| Boxes marked keep=true | 7 |
| Regions marked uncertain | 0 |
| Footnote regions | 1 |
| API wall time | 42.04 s |
| Input tokens | 1,835 |
| Image input tokens | 1,107 |
| Text input tokens | 728 |
| Text output tokens | 404 |
| Thinking tokens | 2,035 |
| Output tokens, including thinking | 2,439 |
| Estimated paid-tier cost | $0.02806 |

The cost estimate uses $2.00 per million input tokens and $10.00 per million output tokens including thinking: (1,835 × $2.00 + 2,439 × $10.00) / 1,000,000.

Each verse is enclosed in one box; the two commentary passages and two lead-ins have separate boxes. One box contains all six printed footnotes. The returned arrays use the requested x/y coordinate order.

The raw request/response, source checksums and derived pixel coordinates were verified. The recorded overlay uses the requested x/y coordinate convention without manual boundary changes.
