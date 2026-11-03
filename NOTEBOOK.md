# Layout experiments

## 1. Geometry baseline — Kale (1913), PDF page 17 / 252

**Method:** [001-geometry: Geometry baseline](methods/001-geometry/README.md).

**Input:** `kale-1913-page-017`; an unannotated rendering at 300 dpi, 1407 × 2135 pixels.

**Run:** 2026-11-02 03:09:28 UTC.

| Measurement | Result |
| --- | --- |
| Output boxes | 6 |
| Measured ink pixels | 410,866 |
| Uncovered ink pixels | 0 |
| Measured ink covered | 100.0000% |

Measured ink is the dark-pixel mask after margin exclusion and filtering of speckles, borders and horizontal rules. Coverage counts mask pixels inside at least one output box.

Purple marks the region labelled `header`; blue marks the other regions. Numbers show the proposed reading order.

![Geometry baseline output for Kale (1913), PDF page 17 / 252](outputs/kale-1913-page-017/001-geometry/overlay.png)

## 2. PP-DocLayout-S — Kale (1913), PDF page 17 / 252

**Method:** [002-pp-doclayout-s: PP-DocLayout-S](methods/002-pp-doclayout-s/README.md).

**Input:** `kale-1913-page-017`; an unannotated rendering at 300 dpi, 1407 × 2135 pixels.

**Settings:** Detector input 480 × 480 pixels; confidence threshold 0.30; additional suppression of overlapping boxes across classes at intersection-over-union threshold 0.55.

**Run:** 2026-11-02 03:35:43 UTC.

| Measurement | Result |
| --- | --- |
| Output boxes | 11 |
| Measured ink pixels | 410,866 |
| Uncovered ink pixels | 372 |
| Measured ink covered | 99.9095% |

Purple marks predictions labelled `number` or `footer_image`; blue marks other predictions. Red marks uncovered measured ink. Numbers show the proposed reading order.

![PP-DocLayout-S output for Kale (1913), PDF page 17 / 252](outputs/kale-1913-page-017/002-pp-doclayout-s/overlay.png)

## 3. PP-DocLayoutV3 — Kale (1913), PDF page 17 / 252

**Method:** [003-pp-doclayoutv3: PP-DocLayoutV3](methods/003-pp-doclayoutv3/README.md).

**Input:** `kale-1913-page-017`; an unannotated rendering at 300 dpi, 1407 × 2135 pixels.

**Settings:** Detector input 800 × 800 pixels; confidence threshold 0.30; reading order from predicted pairwise-order votes. Overlapping predictions are retained.

**Run:** 2026-11-02 04:53:32 UTC.

| Measurement | Result |
| --- | --- |
| Output boxes | 15 |
| Measured ink pixels | 410,866 |
| Uncovered ink pixels | 31,265 |
| Measured ink covered | 92.3905% |

Purple marks predictions labelled `header` or `footer`; blue marks other predictions. Red marks uncovered measured ink. Numbers show the proposed reading order.

![PP-DocLayoutV3 output for Kale (1913), PDF page 17 / 252](outputs/kale-1913-page-017/003-pp-doclayoutv3/overlay.png)

## 4. PP-DocLayoutV3 + pixel refinement — Kale (1913), PDF page 17 / 252

**Method:** [004-pp-doclayoutv3-pixel-refinement: PP-DocLayoutV3 + pixel refinement](methods/004-pp-doclayoutv3-pixel-refinement/README.md).

**Input:** `kale-1913-page-017`; an unannotated rendering at 300 dpi, 1407 × 2135 pixels.

**Source detections:** Method 003, confidence threshold 0.30, recorded at 2026-11-02 04:53:32 UTC.

**Settings:** Connected-component boundary extension, two-pixel padding and residual-ink recovery; boxes starting in the bottom 6% are discarded; final reading order is assigned by position.

**Run:** 2026-11-02 05:19:41 UTC.

| Measurement | Result |
| --- | --- |
| Output boxes | 15 |
| Retained detector boxes | 13 |
| Discarded detector boxes | 2 |
| Recovered ink regions | 2 |
| Measured ink pixels | 410,866 |
| Uncovered ink pixels | 20 |
| Measured ink covered | 99.9951% |

Orange marks recovered regions, purple marks headers, and blue marks other refined detector regions. Red marks uncovered measured ink. Numbers show the proposed reading order.

![PP-DocLayoutV3 with pixel refinement on Kale (1913), PDF page 17 / 252](outputs/kale-1913-page-017/004-pp-doclayoutv3-pixel-refinement/run-002/overlay.png)

## 5. GPT-6 Astra direct regions — Kale (1913), PDF page 17 / 252

**Method:** [005-gpt-6-astra-direct: GPT-6 Astra direct regions](methods/005-gpt-6-astra-direct/README.md).

**Input:** `kale-1913-page-017`; an unannotated rendering at 300 dpi, 1407 × 2135 pixels.

**Settings:** Requested and returned model `gpt-6-astra`; high reasoning effort; image detail `original`; strict JSON output; maximum 16,384 output tokens including reasoning. The request contained the page image and a prompt asking for whole verses, separate commentary, lead-ins, footnotes and page furniture.

**Run:** 2026-11-02 13:17:48 UTC.

| Measurement                        | Result   |
| ---------------------------------- | -------- |
| Output boxes                       | 14       |
| Boxes marked keep=true             | 12       |
| Regions marked uncertain           | 0        |
| Measured ink pixels                | 410,866  |
| Uncovered ink pixels, all boxes    | 4,524    |
| Measured ink covered, all boxes    | 98.8989% |
| API wall time                      | 45.49 s  |
| Input tokens                       | 3,919    |
| Output tokens, including reasoning | 2,013    |
| Reasoning tokens                   | 1,552    |

Returned region types: 2 verse, 2 commentary, 2 lead-in, 6 footnote, 1 running header and 1 page number.

Blue marks regions with `keep=true`; purple marks regions with `keep=false`. Red marks uncovered measured ink. Content numbers show returned reading order; H marks the running header and PN the page number.

![GPT-6 Astra direct-region output for Kale (1913), PDF page 17 / 252](outputs/kale-1913-page-017/005-gpt-6-astra-direct/overlay.png)

### Uncovered-pixel inspection

Of the 4,524 uncovered measured pixels, 4,492 are in the horizontal separator above the footnotes (view A). The remaining 32 pixels form seven small components, shown enlarged in views B–G. Views E and G include tiny clipped character tips.

Red marks the exact counted pixels; gray shows the source image for context. Teal markers identify the enlarged areas.

![Uncovered pixels for GPT-6 Astra on Kale (1913), PDF page 17 / 252](outputs/kale-1913-page-017/005-gpt-6-astra-direct/uncovered-highlight.png)


## 6. Gemini 3.8 Flash direct regions — Kale (1913), PDF page 17 / 252

**Method:** [006-gemini-3.8-flash-direct: Gemini 3.8 Flash direct regions](methods/006-gemini-3.8-flash-direct/README.md).

**Input:** `kale-1913-page-017`; an unannotated rendering at 300 dpi, 1407 × 2135 pixels.

**Settings:** Requested and returned model `gemini-3.8-flash`; thinking level `low`; image resolution `high`; JSON Schema output; maximum 16,384 output tokens including thinking; standard service tier. The request contained the page image and a prompt asking for whole verses, separate commentary, lead-ins, footnotes and page furniture.

**Run:** 2026-11-02 14:13:51 UTC.

| Measurement              | Result      |
| ------------------------ | ----------- |
| Output boxes             | 9           |
| Boxes marked keep=true   | 7           |
| Regions marked uncertain | 0           |
| API wall time            | 341.23 s    |
| Input tokens             | 1,413       |
| Image input tokens       | 1,107       |
| Text input tokens        | 306         |
| Text output tokens       | 378         |
| Thinking tokens reported | 0           |
| Estimated paid-tier cost | $0.00247725 |

The cost estimate uses $0.75 per million input tokens and $3.75 per million output tokens including thinking: (1,413 × $0.75 + 378 × $3.75) / 1,000,000. The response also reported `initial_input_tokens=1698`; the estimate uses `total_input_tokens=1413`.

Returned region types: 2 verse, 2 commentary, 2 lead-in, 1 footnote, 1 running header and 1 page number. The footnote box contains all six printed footnotes.

Earlier attempts returned HTTP 400 for the v1 endpoint's input format, then HTTP 503 for high demand on the v1beta endpoint. The completed request used v1beta; its payload was identical to both earlier attempts. The time and usage above are for the completed request.

Blue marks regions with `keep=true`; purple marks regions with `keep=false`. Red marks uncovered measured ink. Content numbers show returned reading order; H marks the running header and PN the page number.

![Gemini 3.8 Flash direct-region output for Kale (1913), PDF page 17 / 252](outputs/kale-1913-page-017/006-gemini-3.8-flash-direct/run-003/overlay.png)


## 7. Gemini 4 Argon direct regions — Kale (1913), PDF page 17 / 252

**Method:** [007-gemini-4-argon-direct: Gemini 4 Argon direct regions](methods/007-gemini-4-argon-direct/README.md).

**Input:** `kale-1913-page-017`; an unannotated rendering at 300 dpi, 1407 × 2135 pixels.

**Settings:** Requested and returned model `gemini-4-argon`; thinking level `low`; image resolution `high`; JSON Schema output; maximum 16,384 output tokens including thinking; standard service tier. The request contained the page image and a prompt asking for whole verses, separate commentary, lead-ins, footnotes and page furniture.

**Run:** 2026-11-02 15:19:59 UTC.

| Measurement | Result |
| --- | --- |
| Output boxes | 9 |
| Boxes marked keep=true | 7 |
| Regions marked uncertain | 0 |
| API wall time | 8.67 s |
| Input tokens | 1,835 |
| Image input tokens | 1,107 |
| Text input tokens | 728 |
| Text output tokens | 403 |
| Thinking tokens reported | 0 |
| Estimated paid-tier cost | $0.0077 |

The cost estimate uses $2.00 per million input tokens and $10.00 per million output tokens including thinking: (1,835 × $2.00 + 403 × $10.00) / 1,000,000.

Returned region types: 2 verse, 2 commentary, 2 lead-in, 1 footnote, 1 running header and 1 page number.

The prompt requested `[x1,y1,x2,y2]`. The returned arrays appear to use `[y1,x1,y2,x2]`: for example, the page-number box is `[71,126,95,175]`. The first image applies the requested x/y interpretation; the second applies permutation `[1,0,3,2]` to each returned array before scaling to image pixels.

Blue marks regions with `keep=true`; purple marks regions with `keep=false`. Red marks uncovered measured ink. Content numbers show returned reading order; H marks the running header and PN the page number.

**Returned coordinates, interpreted as requested:**

![Gemini 4 Argon output interpreted as x1,y1,x2,y2 for Kale (1913), PDF page 17 / 252](outputs/kale-1913-page-017/007-gemini-4-argon-direct/run-003/overlay.png)

**Coordinate-order inspection, interpreted as y1,x1,y2,x2:**

With this interpretation, each verse is enclosed in one box, commentary and lead-ins have separate boxes, and one box contains all six printed footnotes.

![Gemini 4 Argon output interpreted as y1,x1,y2,x2 for Kale (1913), PDF page 17 / 252](outputs/kale-1913-page-017/007-gemini-4-argon-direct/run-003/coordinate-order-check/overlay.png)


## 8. Claude Sonnet 5.5 direct regions — Kale (1913), PDF page 17 / 252

**Method:** [008-claude-sonnet-5.5-direct: Claude Sonnet 5.5 direct regions](methods/008-claude-sonnet-5.5-direct/README.md).

**Input:** `kale-1913-page-017`; an unannotated rendering at 300 dpi, 1407 × 2135 pixels.

**Settings:** Requested and returned model `claude-sonnet-5-5`; adaptive thinking at low effort; provider-default image processing with the original PNG bytes; JSON Schema output; maximum 16,384 output tokens including thinking. The unchanged prompt asked for whole verses, separate commentary, lead-ins, footnotes and page furniture. Numerical limits and fixed array length were moved to schema descriptions for Claude's structured-output interface and validated locally. The response reported standard tier, standard speed and global inference.

**Run:** 2026-11-03 04:23:42 UTC.

| Measurement | Result |
| --- | --- |
| Output boxes | 9 |
| Boxes marked keep=true | 7 |
| Regions marked uncertain | 0 |
| API wall time | 5.21 s |
| Input tokens | 4,934 |
| Output tokens, including thinking | 414 |
| Thinking tokens reported | 0 |
| Cache read or creation tokens | 0 |
| Estimated paid-tier cost | $0.014008 |

The cost estimate uses $2.00 per million input tokens and $10.00 per million output tokens including thinking: (4,934 × $2.00 + 414 × $10.00) / 1,000,000.

Returned region types: 2 verse, 3 commentary, 1 lead-in, 1 footnote, 1 running header and 1 page number.

The footnote-labeled box (order 7) lies below the printed footnotes. The final commentary box (order 6) includes the printed footnote line. Both verse boxes clip upper parts of glyphs; the second verse box (order 5) extends into the first line of following commentary.

Blue marks regions with `keep=true`; purple marks regions with `keep=false`. Red marks uncovered measured ink. Content numbers show returned reading order; H marks the running header and PN the page number.

![Claude Sonnet 5.5 direct-region output for Kale (1913), PDF page 17 / 252](outputs/kale-1913-page-017/008-claude-sonnet-5.5-direct/overlay.png)


## 9. Gemini 4 Argon high thinking — Kale (1913), PDF page 17 / 252

**Method:** [009-gemini-4-argon-high: Gemini 4 Argon high thinking](methods/009-gemini-4-argon-high/README.md).

**Input:** `kale-1913-page-017`; an unannotated rendering at 300 dpi, 1407 × 2135 pixels.

**Settings:** Requested and returned model `gemini-4-argon`; thinking level `high`; image resolution `high`; JSON Schema output; maximum 16,384 output tokens including thinking; standard service tier. The unchanged prompt asked for whole verses, separate commentary, lead-ins, footnotes and page furniture.

**Run:** 2026-11-03 14:27:07 UTC.

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

Returned region types: 2 verse, 2 commentary, 2 lead-in, 1 footnote, 1 running header and 1 page number.

Each verse is enclosed in one box; the two commentary passages and two lead-ins have separate boxes. One box contains all six printed footnotes. The returned arrays use the requested x/y coordinate order.

Blue marks regions with `keep=true`; purple marks regions with `keep=false`. Red marks uncovered measured ink. Content numbers show returned reading order; H marks the running header and PN the page number.

![Gemini 4 Argon high thinking output for Kale (1913), PDF page 17 / 252](outputs/kale-1913-page-017/009-gemini-4-argon-high/overlay.png)


## 10. Claude Fable 5.1 high effort — Kale (1913), PDF page 17 / 252

**Method:** [010-claude-fable-5.1-high: Claude Fable 5.1 high effort](methods/010-claude-fable-5.1-high/README.md).

**Input:** `kale-1913-page-017`; an unannotated rendering at 300 dpi, 1407 × 2135 pixels.

**Settings:** Requested and returned model `claude-fable-5-1`; adaptive thinking at `high` effort; provider-default image processing with the original PNG bytes; JSON Schema output; maximum 16,384 output tokens including thinking. The unchanged prompt asked for whole verses, separate commentary, lead-ins, footnotes and page furniture. Numerical limits and fixed array length were carried as schema descriptions and validated locally. The response reported standard tier, standard speed and global inference.

**Run:** 2026-11-03 14:27:10 UTC.

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

Returned region types: 2 verse, 2 commentary, 2 lead-in, 1 footnote, 1 running header and 1 page number.

The footnote-labeled box (order 7) is below the printed footnotes, which lie inside the final commentary box (order 6). The first verse box clips upper parts of its first line; the second verse box starts below its first line. Both commentary boxes begin partway through their first printed lines.

Blue marks regions with `keep=true`; purple marks regions with `keep=false`. Red marks uncovered measured ink. Content numbers show returned reading order; H marks the running header and PN the page number.

![Claude Fable 5.1 high effort output for Kale (1913), PDF page 17 / 252](outputs/kale-1913-page-017/010-claude-fable-5.1-high/overlay.png)


## 11. Claude Fable 5.1 max effort — Kale (1913), PDF page 17 / 252

**Method:** [011-claude-fable-5.1-max: Claude Fable 5.1 max effort](methods/011-claude-fable-5.1-max/README.md).

**Input:** `kale-1913-page-017`; an unannotated rendering at 300 dpi, 1407 × 2135 pixels.

**Settings:** Requested and returned model `claude-fable-5-1`; adaptive thinking at `max` effort; provider-default image processing with the original PNG bytes; JSON Schema output; maximum 16,384 output tokens including thinking. The unchanged prompt asked for whole verses, separate commentary, lead-ins, footnotes and page furniture. Numerical limits and fixed array length were carried as schema descriptions and validated locally. The response reported standard tier, standard speed and global inference.

**Run:** 2026-11-03 14:29:16 UTC.

| Measurement | Result |
| --- | --- |
| Output boxes | 9 |
| Boxes marked keep=true | 7 |
| Regions marked uncertain | 0 |
| Footnote regions | 1 |
| API wall time | 52.63 s |
| Input tokens | 4,934 |
| Output tokens, including thinking | 4,758 |
| Thinking tokens reported | 4,343 |
| Cache read or creation tokens | 0 |
| Estimated paid-tier cost | $0.28724 |

The cost estimate uses $10.00 per million input tokens and $50.00 per million output tokens including thinking: (4,934 × $10.00 + 4,758 × $50.00) / 1,000,000.

Returned region types: 2 verse, 2 commentary, 2 lead-in, 1 footnote, 1 running header and 1 page number.

The footnote-labeled box (order 7) covers the last commentary line and the separator above the printed footnotes; most footnote text lies below it. The final commentary box ends above its last printed line. The first commentary and second verse boxes clip their last lines; the second lead-in box clips its second line.

Blue marks regions with `keep=true`; purple marks regions with `keep=false`. Red marks uncovered measured ink. Content numbers show returned reading order; H marks the running header and PN the page number.

![Claude Fable 5.1 max effort output for Kale (1913), PDF page 17 / 252](outputs/kale-1913-page-017/011-claude-fable-5.1-max/overlay.png)


## 12. Claude Opus 5.5 max effort — Kale (1913), PDF page 17 / 252

**Method:** [012-claude-opus-5.5-max: Claude Opus 5.5 max effort](methods/012-claude-opus-5.5-max/README.md).

**Input:** `kale-1913-page-017`; an unannotated rendering at 300 dpi, 1407 × 2135 pixels.

**Settings:** Requested and returned model `claude-opus-5-5`; adaptive thinking at `max` effort; provider-default image processing with the original PNG bytes; JSON Schema output; maximum 16,384 output tokens including thinking. The unchanged prompt asked for whole verses, separate commentary, lead-ins, footnotes and page furniture. Numerical limits and fixed array length were carried as schema descriptions and validated locally. The response reported standard tier, standard speed and global inference.

**Run:** 2026-11-03 14:31:28 UTC.

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

Returned region types: 2 verse, 2 commentary, 2 lead-in, 1 footnote, 1 running header and 1 page number.

The footnotes are assigned one region. Its lower boundary clips the printed footnote line. Both commentary boxes clip their last lines. The second lead-in box clips part of its second line; the second verse box extends upward into that lead-in line.

Blue marks regions with `keep=true`; purple marks regions with `keep=false`. Red marks uncovered measured ink. Content numbers show returned reading order; H marks the running header and PN the page number.

![Claude Opus 5.5 max effort output for Kale (1913), PDF page 17 / 252](outputs/kale-1913-page-017/012-claude-opus-5.5-max/overlay.png)


## 13. Gemini 4 Argon high thinking, individual footnotes — Kale (1913), PDF page 17 / 252

**Method:** [013-gemini-4-argon-high-footnotes: Gemini 4 Argon high thinking, individual footnotes](methods/013-gemini-4-argon-high-footnotes/README.md).

**Input:** `kale-1913-page-017`; the unchanged PNG rendering at 300 dpi, 1407 × 2135 pixels.

**Settings:** Requested and returned model `gemini-4-argon`; thinking level `high`; image resolution `high`; JSON Schema output; maximum 16,384 output tokens including thinking; standard service tier.

**Footnote instruction:**

> Return one region per numbered footnote, including its marker and text. Separate neighboring footnotes even when they share a printed line.

**Coordinates:** Requested `[x1,y1,x2,y2]` coordinates normalized to 0–1000. Converted to original-image pixels using x × 1407 / 1000 and y × 2135 / 1000.

**Run:** 2026-11-03 14:53:05 UTC.

| Measurement | Result |
| --- | --- |
| Output boxes | 14 |
| Boxes marked keep=true | 12 |
| Regions marked uncertain | 0 |
| Footnote regions | 6 |
| API wall time | 32.71 s |
| Input tokens | 1,848 |
| Text output tokens | 616 |
| Thinking tokens | 1,521 |
| Output tokens, including thinking | 2,137 |
| Coordinate clamping adjustments | 0 |
| Estimated paid-tier cost | $0.025066 |

The cost estimate uses $2.00 per million input tokens and $10.00 per million output tokens including thinking: (1,848 × $2.00 + 2,137 × $10.00) / 1,000,000.

Returned region types: 2 verse, 2 commentary, 2 lead-in, 6 footnote, 1 running header and 1 page number.

Each numbered footnote has its own box containing its marker and text. Each verse remains one region; the commentary passages and lead-ins have separate boxes.

Blue marks regions with `keep=true`; purple marks regions with `keep=false`. Red marks uncovered measured ink. Content numbers show returned reading order; H marks the running header and PN the page number.

![Gemini 4 Argon high thinking, individual footnotes output for Kale (1913), PDF page 17 / 252](outputs/kale-1913-page-017/013-gemini-4-argon-high-footnotes/overlay.png)


## 14. Gemini 4 Argon high thinking, individual footnotes, native coordinates — Kale (1913), PDF page 17 / 252

**Method:** [014-gemini-4-argon-high-native: Gemini 4 Argon high thinking, individual footnotes, native coordinates](methods/014-gemini-4-argon-high-native/README.md).

**Input:** `kale-1913-page-017`; the unchanged PNG rendering at 300 dpi, 1407 × 2135 pixels.

**Settings:** Requested and returned model `gemini-4-argon`; thinking level `high`; image resolution `high`; JSON Schema output; maximum 16,384 output tokens including thinking; standard service tier.

**Footnote instruction:**

> Return one region per numbered footnote, including its marker and text. Separate neighboring footnotes even when they share a printed line.

**Coordinates:** Requested Google's documented `[ymin,xmin,ymax,xmax]` coordinates normalized to 0–1000. Converted by reordering to `[xmin,ymin,xmax,ymax]`, then multiplying x by 1407 / 1000 and y by 2135 / 1000.

**Run:** 2026-11-03 14:53:08 UTC.

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

Returned region types: 2 verse, 2 commentary, 2 lead-in, 6 footnote, 1 running header and 1 page number.

Each numbered footnote has its own box containing its marker and text. Each verse remains one region; the commentary passages and lead-ins have separate boxes. A few upper glyph tips on the first line of the final commentary fall above its box.

Blue marks regions with `keep=true`; purple marks regions with `keep=false`. Red marks uncovered measured ink. Content numbers show returned reading order; H marks the running header and PN the page number.

![Gemini 4 Argon high thinking, individual footnotes, native coordinates output for Kale (1913), PDF page 17 / 252](outputs/kale-1913-page-017/014-gemini-4-argon-high-native/overlay.png)


## 15. Claude Fable 5.1 max effort, individual footnotes, pixel coordinates — Kale (1913), PDF page 17 / 252

**Method:** [015-claude-fable-5.1-max-pixels: Claude Fable 5.1 max effort, individual footnotes, pixel coordinates](methods/015-claude-fable-5.1-max-pixels/README.md).

**Input:** `kale-1913-page-017`; the unchanged PNG rendering at 300 dpi, 1407 × 2135 pixels.

**Settings:** Requested and returned model `claude-fable-5-1`; adaptive thinking at `max` effort; JSON Schema output; maximum 16,384 output tokens including thinking; returned standard tier, standard speed and global inference. Fixed array length was carried as a schema description and validated locally.

**Footnote instruction:**

> Return one region per numbered footnote, including its marker and text. Separate neighboring footnotes even when they share a printed line.

**Coordinates:** Requested Anthropic's documented `[x1,y1,x2,y2]` absolute pixel coordinates. The 1407 × 2135 input fits the model's high-resolution tier: 51 × 77 = 3,927 visual patches, within the 4,784-patch budget and 2,576-pixel edge limit. Coordinates map directly to the original unpadded image. No resize or coordinate clamping was applied.

**Run:** 2026-11-03 14:53:11 UTC.

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

Returned region types: 2 verse, 2 commentary, 2 lead-in, 6 footnote, 1 running header and 1 page number.

Six footnote boxes are returned. Some boundaries separate a note's marker from its text: the first footnote box also includes the marker for note 2, and the second also includes the marker for note 3. The two verses, commentary passages and lead-ins have separate boxes.

Blue marks regions with `keep=true`; purple marks regions with `keep=false`. Red marks uncovered measured ink. Content numbers show returned reading order; H marks the running header and PN the page number.

![Claude Fable 5.1 max effort, individual footnotes, pixel coordinates output for Kale (1913), PDF page 17 / 252](outputs/kale-1913-page-017/015-claude-fable-5.1-max-pixels/overlay.png)


## 16. Claude Opus 5.5 max effort, individual footnotes, pixel coordinates — Kale (1913), PDF page 17 / 252

**Method:** [016-claude-opus-5.5-max-pixels: Claude Opus 5.5 max effort, individual footnotes, pixel coordinates](methods/016-claude-opus-5.5-max-pixels/README.md).

**Input:** `kale-1913-page-017`; the unchanged PNG rendering at 300 dpi, 1407 × 2135 pixels.

**Settings:** Requested and returned model `claude-opus-5-5`; adaptive thinking at `max` effort; JSON Schema output; maximum 16,384 output tokens including thinking; returned standard tier, standard speed and global inference. Fixed array length was carried as a schema description and validated locally.

**Footnote instruction:**

> Return one region per numbered footnote, including its marker and text. Separate neighboring footnotes even when they share a printed line.

**Coordinates:** Requested Anthropic's documented `[x1,y1,x2,y2]` absolute pixel coordinates. The 1407 × 2135 input fits the model's high-resolution tier: 51 × 77 = 3,927 visual patches, within the 4,784-patch budget and 2,576-pixel edge limit. Coordinates map directly to the original unpadded image. No resize or coordinate clamping was applied.

**Run:** 2026-11-03 14:53:13 UTC.

| Measurement | Result |
| --- | --- |
| Output boxes | 14 |
| Boxes marked keep=true | 12 |
| Regions marked uncertain | 0 |
| Footnote regions | 6 |
| API wall time | 74.62 s |
| Input tokens | 4,955 |
| Output tokens, including thinking | 8,803 |
| Thinking tokens reported | 8,121 |
| Cache read or creation tokens | 0 |
| Coordinate clamping adjustments | 0 |
| Estimated paid-tier cost | $0.19588 |

The cost estimate uses $4.00 per million input tokens and $20.00 per million output tokens including thinking: (4,955 × $4.00 + 8,803 × $20.00) / 1,000,000.

Returned region types: 2 verse, 2 commentary, 2 lead-in, 6 footnote, 1 running header and 1 page number.

Six footnote boxes are returned. Their lower boundaries cross the printed footnote line, clipping lower parts of glyphs. The final commentary box also clips its last printed line.

Blue marks regions with `keep=true`; purple marks regions with `keep=false`. Red marks uncovered measured ink. Content numbers show returned reading order; H marks the running header and PN the page number.

![Claude Opus 5.5 max effort, individual footnotes, pixel coordinates output for Kale (1913), PDF page 17 / 252](outputs/kale-1913-page-017/016-claude-opus-5.5-max-pixels/overlay.png)
