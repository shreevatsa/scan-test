# 017-gemini-4-argon-low-native: Gemini 4 Argon low thinking, individual footnotes, native coordinates

The method sends the unchanged raw PNG and method 014's exact prompt and schema to `gemini-4-argon`, with thinking level `low`. It asks for one region per numbered footnote, including its marker and text, even when notes share a printed line.

Coordinates follow Google's documented `[ymin,xmin,ymax,xmax]` convention normalized to 0–1000. Returned arrays are preserved; derived `box` values reorder to x/y and scale to the original 1407 × 2135 image. Any edge clamping is recorded explicitly. The image is sent inline at resolution `high`, without local resizing. Maximum output is 16,384 tokens including thinking; service tier is standard, `store=false`, and automatic retries are disabled.

## Run

```sh
uv run python methods/017-gemini-4-argon-low-native/run.py inputs/kale-1913-page-017.png --check
uv run python methods/017-gemini-4-argon-low-native/run.py inputs/kale-1913-page-017.png
```

For another request, use a fresh `--output-dir`, such as `outputs/kale-1913-page-017/017-gemini-4-argon-low-native/run-002`. Existing output is protected against overwriting. Authentication uses the configured Google environment variables or the stored `llm` key named `gemini`.

## Artifacts and accounting

The output directory contains the exact request and prompt, raw response, model output text, parsed JSON, returned and converted coordinates, source hashes, token usage, timing, estimated cost, overlay and measurement mask. `regions.py` and `diagnostics.py` are copied unchanged from method 014. Blue marks kept regions, purple excluded page furniture and red uncovered measured ink; numbers show content reading order.

Google reports text output and thinking separately; they are added once to price output. `pricing.json` records the standard per-million-token rates checked on 2026-11-03: input 2.0, output including thinking 10.0, cached input 0.1, all in USD. API wall time ends after reading the response body and excludes local artifact writes and image rendering.

[Model documentation](https://aistudio.google.com/docs/models/gemini-4-argon), [thinking controls](https://aistudio.google.com/docs/thinking), [coordinate convention](https://aistudio.google.com/docs/image-understanding), and [pricing](https://aistudio.google.com/docs/pricing).

## Recorded run

Input: `kale-1913-page-017`, 1407 × 2135 pixels, unchanged raw PNG. Started 2026-11-03 15:16:46 UTC. Requested and returned model `gemini-4-argon`.

| Measurement | Result |
| --- | --- |
| Output boxes | 14 |
| Boxes marked keep=true | 12 |
| Regions marked uncertain | 0 |
| Footnote regions | 6 |
| API wall time | 28.23 s |
| Input tokens | 1,842 |
| Text output tokens | 618 |
| Thinking tokens | 0 |
| Output tokens, including thinking | 618 |
| Cached input tokens | 0 |
| Coordinate clamping adjustments | 0 |
| Estimated paid-tier cost | $0.009864 |

Each of the six numbered footnotes has its own box containing its marker and text. Both four-line verses remain whole; the two commentary passages and two lead-ins have separate boxes.

The estimated cost uses $2 per million input tokens and $10 per million output tokens including thinking: (1,842 × $2 + 618 × $10) / 1,000,000 = $0.009864. Rates checked on 2026-11-03.

![Recorded output](../../outputs/kale-1913-page-017/017-gemini-4-argon-low-native/overlay.png)

## Kale (1913), PDF page 97 / 252

Input: `kale-1913-page-097`, unannotated 300 dpi RGB render, 1374 × 2114 pixels. Started 2026-11-04 04:28:40 UTC. Requested and returned model `gemini-4-argon`. Settings and prompt are unchanged; coordinate conversion uses this input's actual width and height. HTTP 200, response completed.

```sh
uv run python methods/017-gemini-4-argon-low-native/run.py inputs/kale-1913-page-097.png --check
uv run python methods/017-gemini-4-argon-low-native/run.py inputs/kale-1913-page-097.png
```

The completed artifacts are under `outputs/kale-1913-page-097/017-gemini-4-argon-low-native/`. Choose a fresh `--output-dir` for another API request.

| Measurement | Result |
| --- | --- |
| Output boxes | 13 |
| Boxes marked keep=true | 11 |
| Regions marked uncertain | 0 |
| Footnote regions | 6 |
| API wall time | 9.66 s |
| Input tokens | 1,801 |
| Text output tokens | 571 |
| Thinking tokens | 0 |
| Output tokens, including thinking | 571 |
| Cached input tokens | 0 |
| Coordinate clamping adjustments | 0 |
| Estimated paid-tier cost | $0.009312 |

The estimated paid-tier cost uses $2 per million input tokens and $10 per million output tokens including thinking: (1,801 × $2 + 571 × $10) / 1,000,000 = $0.009312. Rates checked on 2026-11-03.

Both four-line verses remain whole. The two commentary passages and the short lead-in have separate boxes. Each numbered footnote has a separate box containing its marker and text, including the sixth footnote on the second printed footnote line. Some right edges of commentary boxes are tight, with small glyph tips extending beyond them.

![Page 97 output](../../outputs/kale-1913-page-097/017-gemini-4-argon-low-native/overlay.png)

## Recorded test on PDF page 113 / 252

Input `kale-1913-page-113`, unchanged raw PNG, 1370 × 2118 pixels.

```sh
uv run python methods/017-gemini-4-argon-low-native/run.py inputs/kale-1913-page-113.png --check
uv run python methods/017-gemini-4-argon-low-native/run.py inputs/kale-1913-page-113.png
```

The completed output is `outputs/kale-1913-page-113/017-gemini-4-argon-low-native/`; use a fresh `--output-dir` for a repeat run.

**Run:** 2026-11-04 06:00:22 UTC.

| Measurement | Result |
| --- | --- |
| Output boxes | 14 |
| Boxes marked keep=true | 12 |
| Regions marked uncertain | 0 |
| Footnote regions | 6 |
| Unique text components cut by kept crop edges | 45 |
| Overlapping kept-box pairs containing text | 5 |
| Detected separator pixels inside kept boxes | 1953 |
| API wall time | 7.42 s |
| Input tokens | 1,801 |
| Text output tokens | 612 |
| Thinking tokens | 0 |
| Output tokens, including thinking | 612 |
| Cached input tokens | 0 |
| Coordinate clamping adjustments | 0 |
| Estimated paid-tier API cost | $0.009722 |

The estimated paid-tier cost uses $2 per million input tokens and $10 per million output tokens including thinking: (1,801 × $2 + 612 × $10) / 1,000,000 = $0.009722. Rates checked on 2026-11-03.

The audit uses grayscale <175, speckle and margin filtering, and the same automatic thin-line separator detector for all compared results. It counts connected text components crossing individual kept crop edges, kept-box overlaps containing text-mask pixels, and detected separator pixels inside kept boxes. A cut can belong to text from a neighboring passage that enters a crop.

Returned region types: 1 page number, 1 running header, 3 verse, 3 commentary, 6 footnote.

Three four-line verse groups, three commentary passages and six individual footnotes are returned. Neighboring body boxes overlap at five transitions, with text in each intersection. Several crop edges pass through upper or lower glyph parts. The audit records 45 cut text components.

The full-page overlay marks kept boxes blue and excluded page furniture purple. Red marks uncovered pixels from the method's analysis mask. The enlarged inspection marks text-mask pixels cut by individual crops in red.

![Gemini 4 Argon low thinking, individual footnotes, native coordinates, PDF page 113 / 252](../../outputs/kale-1913-page-113/017-gemini-4-argon-low-native/overlay.png)

![Gemini 4 Argon low thinking, individual footnotes, native coordinates, enlarged boundary inspection, PDF page 113 / 252](../../outputs/kale-1913-page-113/017-gemini-4-argon-low-native/separator-review/details.png)
