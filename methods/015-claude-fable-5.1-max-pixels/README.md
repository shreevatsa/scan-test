# 015-claude-fable-5.1-max-pixels: Claude Fable 5.1 max effort, individual footnotes, pixel coordinates

## Method and settings

This uses Anthropic's documented absolute x/y pixel coordinates. The page is checked against the high-resolution image limits before submission: 1407 × 2135 pixels, 51 × 77 visual patches = 3,927 visual tokens, within 2,576-pixel padded-edge and 4,784-token limits. The unpadded coordinate mapping is identity.

The shared raw PNG is unchanged. The earlier footnote instruction is replaced with:

> Return one region per numbered footnote, including its marker and text. Separate neighboring footnotes even when they share a printed line.

Other region-grouping instructions are retained. The requested coordinate convention is `[x1,y1,x2,y2] in uploaded-image pixels`. The provider is Anthropic Claude; model and effort settings are pinned in `config.json`. Gemini uses high thinking, high image resolution and standard tier; Claude uses adaptive thinking at max effort with default service selection. Maximum output is 16,384 tokens including thinking. Each invocation makes one synchronous non-streaming request without automatic retries.

## Coordinate conversion and artifacts

`request.json`, `response.json`, `model-output.txt` and `parsed-regions.json` preserve the exact request and model response. The derived `regions.json` retains returned fields and adds `box` as `[x1,y1,x2,y2]` in original-image pixels. Native-format methods also add `box_xyxy_1000` as canonical normalized x/y coordinates.

Conversion: Identity on unpadded uploaded-image pixels; clamp only to image bounds. Any clamping is recorded in validation warnings and the affected region's `coordinate_adjustment`; raw values remain intact. Pixel coordinates use the unpadded image dimensions. No detected-component boundary refinement is applied.

The result directory also contains the frozen prompt, run metadata, selected response headers, usage, cost estimate, source and request/response checksums, `overlay.png` and the same diagnostic `ink-mask.png` used by previous methods. Claude additionally saves its transmitted schema and any returned readable thinking text. `vision_fit.py` records the documented image-fit calculation for the pixel-coordinate methods.

Blue marks kept regions, purple marks excluded page furniture and red marks uncovered measured ink. Content numbers show returned reading order; H and PN mark the running header and page number.

## Run

From the project root:

```sh
uv run python methods/015-claude-fable-5.1-max-pixels/run.py inputs/kale-1913-page-017.png --check
uv run python methods/015-claude-fable-5.1-max-pixels/run.py inputs/kale-1913-page-017.png
```

For another request, supply a fresh `--output-dir`, for example `outputs/kale-1913-page-017/015-claude-fable-5.1-max-pixels/run-002`. Existing output is protected against overwriting. Authentication follows the preceding provider method: Google environment variables or the stored `gemini` key; Anthropic environment variable or the stored `anthropic` key. Secrets are excluded from saved artifacts.

Pricing is pinned in `pricing.json`. Google output and thought counts are added for billable output; Claude output already includes thinking. Timing ends after the full HTTP response body is read, before artifact writes and image rendering.

## Coordinate references

[Google image understanding](https://aistudio.google.com/docs/image-understanding), [Claude coordinates and bounding boxes](https://platform.claude.com/docs/en/build-with-claude/vision-coordinates), and [Claude resolution tiers](https://platform.claude.com/docs/en/build-with-claude/vision) were checked on 2026-11-03.

## Recorded page-17 run

The request at 2026-11-03 14:53:11 UTC completed with HTTP 200. Requested and returned model IDs match. The [output directory](../../outputs/kale-1913-page-017/015-claude-fable-5.1-max-pixels/) preserves the exact request, response, original returned fields and mechanically converted coordinates.

| Measurement | Result |
| --- | --- |
| Output boxes | 14 |
| Boxes marked keep=true | 12 |
| Regions marked uncertain | 0 |
| Footnote regions | 6 |
| API wall time | 50.98 s |
| Input tokens | 4,955 |
| Output tokens, including thinking | 4,851 |
| Thinking tokens reported | 4,168 |
| Cache read or creation tokens | 0 |
| Coordinate clamping adjustments | 0 |
| Estimated paid-tier cost | $0.2921 |

The cost estimate uses $10.00 per million input tokens and $50.00 per million output tokens including thinking: (4,955 × $10.00 + 4,851 × $50.00) / 1,000,000.

Six footnote boxes are returned. Some boundaries separate a note's marker from its text: the first footnote box also includes the marker for note 2, and the second also includes the marker for note 3. The two verses, commentary passages and lead-ins have separate boxes.

Requested Anthropic's documented `[x1,y1,x2,y2]` absolute pixel coordinates. The 1407 × 2135 input fits the model's high-resolution tier: 51 × 77 = 3,927 visual patches, within the 4,784-patch budget and 2,576-pixel edge limit. Coordinates map directly to the original unpadded image. No resize or coordinate clamping was applied.

The frozen pixel-coordinate prompt specifies the current 1407 × 2135 test image; update that prompt when introducing a test image with different dimensions.
