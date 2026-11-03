# 014-gemini-4-argon-high-native: Gemini 4 Argon high thinking, individual footnotes, native coordinates

## Method and settings

This uses Google's documented y-first 0–1000 bounding-box convention. Relative to method 013, only the coordinate wording and mechanical coordinate conversion change.

The shared raw PNG is unchanged. The earlier footnote instruction is replaced with:

> Return one region per numbered footnote, including its marker and text. Separate neighboring footnotes even when they share a printed line.

Other region-grouping instructions are retained. The requested coordinate convention is `[ymin,xmin,ymax,xmax] normalized to 0..1000`. The provider is Google Gemini; model and effort settings are pinned in `config.json`. Gemini uses high thinking, high image resolution and standard tier; Claude uses adaptive thinking at max effort with default service selection. Maximum output is 16,384 tokens including thinking. Each invocation makes one synchronous non-streaming request without automatic retries.

## Coordinate conversion and artifacts

`request.json`, `response.json`, `model-output.txt` and `parsed-regions.json` preserve the exact request and model response. The derived `regions.json` retains returned fields and adds `box` as `[x1,y1,x2,y2]` in original-image pixels. Native-format methods also add `box_xyxy_1000` as canonical normalized x/y coordinates.

Conversion: Swap y/x order, then x*width/1000 and y*height/1000; clamp only to image bounds. Any clamping is recorded in validation warnings and the affected region's `coordinate_adjustment`; raw values remain intact. Pixel coordinates use the unpadded image dimensions. No detected-component boundary refinement is applied.

The result directory also contains the frozen prompt, run metadata, selected response headers, usage, cost estimate, source and request/response checksums, `overlay.png` and the same diagnostic `ink-mask.png` used by previous methods. Claude additionally saves its transmitted schema and any returned readable thinking text. `vision_fit.py` records the documented image-fit calculation for the pixel-coordinate methods.

Blue marks kept regions, purple marks excluded page furniture and red marks uncovered measured ink. Content numbers show returned reading order; H and PN mark the running header and page number.

## Run

From the project root:

```sh
uv run python methods/014-gemini-4-argon-high-native/run.py inputs/kale-1913-page-017.png --check
uv run python methods/014-gemini-4-argon-high-native/run.py inputs/kale-1913-page-017.png
```

For another request, supply a fresh `--output-dir`, for example `outputs/kale-1913-page-017/014-gemini-4-argon-high-native/run-002`. Existing output is protected against overwriting. Authentication follows the preceding provider method: Google environment variables or the stored `gemini` key; Anthropic environment variable or the stored `anthropic` key. Secrets are excluded from saved artifacts.

Pricing is pinned in `pricing.json`. Google output and thought counts are added for billable output; Claude output already includes thinking. Timing ends after the full HTTP response body is read, before artifact writes and image rendering.

## Coordinate references

[Google image understanding](https://aistudio.google.com/docs/image-understanding), [Claude coordinates and bounding boxes](https://platform.claude.com/docs/en/build-with-claude/vision-coordinates), and [Claude resolution tiers](https://platform.claude.com/docs/en/build-with-claude/vision) were checked on 2026-11-03.

## Recorded page-17 run

The request at 2026-11-03 14:53:08 UTC completed with HTTP 200. Requested and returned model IDs match. The [output directory](../../outputs/kale-1913-page-017/014-gemini-4-argon-high-native/) preserves the exact request, response, original returned fields and mechanically converted coordinates.

| Measurement | Result |
| --- | --- |
| Output boxes | 14 |
| Boxes marked keep=true | 12 |
| Regions marked uncertain | 0 |
| Footnote regions | 6 |
| API wall time | 24.58 s |
| Input tokens | 1,842 |
| Text output tokens | 616 |
| Thinking tokens | 1,524 |
| Output tokens, including thinking | 2,140 |
| Coordinate clamping adjustments | 0 |
| Estimated paid-tier cost | $0.025084 |

The cost estimate uses $2.00 per million input tokens and $10.00 per million output tokens including thinking: (1,842 × $2.00 + 2,140 × $10.00) / 1,000,000.

Each numbered footnote has its own box containing its marker and text. Each verse remains one region; the commentary passages and lead-ins have separate boxes. A few upper glyph tips on the first line of the final commentary fall above its box.

Requested Google's documented `[ymin,xmin,ymax,xmax]` coordinates normalized to 0–1000. Converted by reordering to `[xmin,ymin,xmax,ymax]`, then multiplying x by 1407 / 1000 and y by 2135 / 1000.

