# Layout experiments

## Kale (1913), PDF page 17 / 252

### Method 001 — Geometry baseline

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

### Method 002 — PP-DocLayout-S

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

### Method 003 — PP-DocLayoutV3

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

### Method 004 — PP-DocLayoutV3 + pixel refinement

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

### Method 005 — GPT-6 Astra direct regions

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

#### Uncovered-pixel inspection

Of the 4,524 uncovered measured pixels, 4,492 are in the horizontal separator above the footnotes (view A). The remaining 32 pixels form seven small components, shown enlarged in views B–G. Views E and G include tiny clipped character tips.

Red marks the exact counted pixels; gray shows the source image for context. Teal markers identify the enlarged areas.

![Uncovered pixels for GPT-6 Astra on Kale (1913), PDF page 17 / 252](outputs/kale-1913-page-017/005-gpt-6-astra-direct/uncovered-highlight.png)


### Method 006 — Gemini 3.8 Flash direct regions

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


### Method 007 — Gemini 4 Argon direct regions

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


### Method 008 — Claude Sonnet 5.5 direct regions

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


### Method 009 — Gemini 4 Argon high thinking

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


### Method 010 — Claude Fable 5.1 high effort

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


### Method 011 — Claude Fable 5.1 max effort

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


### Method 012 — Claude Opus 5.5 max effort

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


### Method 013 — Gemini 4 Argon high thinking, individual footnotes

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


### Method 014 — Gemini 4 Argon high thinking, individual footnotes, native coordinates

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


### Method 015 — Claude Fable 5.1 max effort, individual footnotes, pixel coordinates

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


### Method 016 — Claude Opus 5.5 max effort, individual footnotes, pixel coordinates

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

### Method 017 — Gemini 4 Argon low thinking, individual footnotes, native coordinates

**Method:** [017-gemini-4-argon-low-native: Gemini 4 Argon low thinking, individual footnotes, native coordinates](methods/017-gemini-4-argon-low-native/README.md).

**Input:** `kale-1913-page-017`; the unchanged PNG rendering at 300 dpi, 1407 × 2135 pixels.

**Settings:** Requested and returned model `gemini-4-argon`; thinking level `low`; image resolution `high`; JSON Schema output; maximum 16,384 output tokens including thinking; standard service tier; `store=false`.

**Footnote instruction:**

> Return one region per numbered footnote, including its marker and text. Separate neighboring footnotes even when they share a printed line.

**Coordinates:** Requested Google's documented [ymin,xmin,ymax,xmax] coordinates normalized to 0–1000. Converted by reordering to [xmin,ymin,xmax,ymax], then multiplying x by 1407 / 1000 and y by 2135 / 1000.

**Run:** 2026-11-03 15:16:46 UTC.

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

The estimated cost uses $2 per million input tokens and $10 per million output tokens including thinking: (1,842 × $2 + 618 × $10) / 1,000,000 = $0.009864. Rates checked on 2026-11-03.

Returned region types: 2 verse, 2 commentary, 2 lead in, 6 footnote, 1 running header, 1 page number.

Each of the six numbered footnotes has its own box containing its marker and text. Both four-line verses remain whole; the two commentary passages and two lead-ins have separate boxes.

Blue marks regions with `keep=true`; purple marks regions with `keep=false`. Red marks uncovered measured ink. Content numbers show returned reading order; H marks the running header and PN the page number.

![Gemini 4 Argon low thinking, individual footnotes, native coordinates output for Kale (1913), PDF page 17 / 252](outputs/kale-1913-page-017/017-gemini-4-argon-low-native/overlay.png)


### Method 018 — Gemini 3.8 Flash low thinking, individual footnotes, native coordinates

#### Run 001

**Method:** [018-gemini-3.8-flash-low-native: Gemini 3.8 Flash low thinking, individual footnotes, native coordinates](methods/018-gemini-3.8-flash-low-native/README.md).

**Input:** `kale-1913-page-017`; the unchanged PNG rendering at 300 dpi, 1407 × 2135 pixels.

**Settings:** Requested and returned model `gemini-3.8-flash`; thinking level `low`; image resolution `high`; JSON Schema output; maximum 16,384 output tokens including thinking; standard service tier; `store=false`.

**Footnote instruction:**

> Return one region per numbered footnote, including its marker and text. Separate neighboring footnotes even when they share a printed line.

**Coordinates:** Requested Google's documented [ymin,xmin,ymax,xmax] coordinates normalized to 0–1000. Converted by reordering to [xmin,ymin,xmax,ymax], then multiplying x by 1407 / 1000 and y by 2135 / 1000.

**Run:** 2026-11-03 15:16:51 UTC.

| Measurement | Result |
| --- | --- |
| Output boxes | 14 |
| Boxes marked keep=true | 12 |
| Regions marked uncertain | 0 |
| Footnote regions | 6 |
| API wall time | 7.46 s |
| Input tokens | 1,420 |
| Text output tokens | 622 |
| Thinking tokens | 0 |
| Output tokens, including thinking | 622 |
| Cached input tokens | 0 |
| Coordinate clamping adjustments | 0 |
| Estimated paid-tier cost | $0.0033975 |

The estimated cost uses $0.75 per million input tokens and $3.75 per million output tokens including thinking: (1,420 × $0.75 + 622 × $3.75) / 1,000,000 = $0.0033975. Rates checked on 2026-11-03.

Returned region types: 2 verse, 2 commentary, 2 lead in, 6 footnote, 1 running header, 1 page number.

Each of the six numbered footnotes has its own box containing its marker and text. Both four-line verses remain whole; the two commentary passages and two lead-ins have separate boxes. Several edges are tight, including the right edge of the fifth footnote.

Blue marks regions with `keep=true`; purple marks regions with `keep=false`. Red marks uncovered measured ink. Content numbers show returned reading order; H marks the running header and PN the page number.

![Gemini 3.8 Flash low thinking, individual footnotes, native coordinates output for Kale (1913), PDF page 17 / 252](outputs/kale-1913-page-017/018-gemini-3.8-flash-low-native/overlay.png)

Footnotes enlarged 2× from original-image crop [150,1870,1300,2005], using nearest-neighbor scaling:

![Gemini 3.8 Flash low thinking footnotes at 2× scale](outputs/kale-1913-page-017/018-gemini-3.8-flash-low-native/footnotes-detail.png)



#### Run 002

**Method:** [018-gemini-3.8-flash-low-native: Gemini 3.8 Flash low thinking, individual footnotes, native coordinates](methods/018-gemini-3.8-flash-low-native/README.md).

**Input:** `kale-1913-page-017`; the unchanged PNG rendering at 300 dpi, 1407 × 2135 pixels.

**Settings:** Requested and returned model `gemini-3.8-flash`; thinking level `low`; image resolution `high`; JSON Schema output; maximum 16,384 output tokens including thinking; standard service tier; `store=false`. One synchronous request, with automatic retries disabled.

**Footnote instruction:**

> Return one region per numbered footnote, including its marker and text. Separate neighboring footnotes even when they share a printed line.

**Coordinates:** Requested [ymin,xmin,ymax,xmax] integer coordinates normalized to 0–1000. Converted by reordering to [xmin,ymin,xmax,ymax], then multiplying x by 1407 / 1000 and y by 2135 / 1000. No coordinate clamping was applied.

**Run:** 2026-11-04 03:23:40 UTC; `run-002`; HTTP 200, response completed.

| Measurement | Result |
| --- | --- |
| Output boxes | 14 |
| Boxes marked keep=true | 12 |
| Regions marked uncertain | 0 |
| Footnote regions | 6 |
| API wall time | 7.12 s |
| Input tokens | 1,420 |
| Text output tokens | 619 |
| Thinking tokens | 0 |
| Output tokens, including thinking | 619 |
| Cached input tokens | 0 |
| Coordinate clamping adjustments | 0 |
| Estimated paid-tier cost | $0.00338625 |

The estimated paid-tier cost uses $0.75 per million input tokens and $3.75 per million output tokens including thinking: (1,420 × $0.75 + 619 × $3.75) / 1,000,000 = $0.00338625. Rates checked on 2026-11-03.

Returned region types: 2 verse, 2 commentary, 2 lead in, 6 footnote, 1 running header, 1 page number.

Each of the six numbered footnotes has a separate box containing its marker and text. Both four-line verses remain whole, with separate commentary and lead-in boxes. Some box edges are tight, including the first commentary's right edge and the fifth footnote's left edge.

Blue marks regions with `keep=true`; purple marks regions with `keep=false`. Red marks uncovered measured ink. Content numbers show returned reading order; H marks the running header and PN the page number.

![Gemini 3.8 Flash low thinking, individual footnotes, native coordinates — repeat 2 output for Kale (1913), PDF page 17 / 252](outputs/kale-1913-page-017/018-gemini-3.8-flash-low-native/run-002/overlay.png)



#### Run 003

**Method:** [018-gemini-3.8-flash-low-native: Gemini 3.8 Flash low thinking, individual footnotes, native coordinates](methods/018-gemini-3.8-flash-low-native/README.md).

**Input:** `kale-1913-page-017`; the unchanged PNG rendering at 300 dpi, 1407 × 2135 pixels.

**Settings:** Requested and returned model `gemini-3.8-flash`; thinking level `low`; image resolution `high`; JSON Schema output; maximum 16,384 output tokens including thinking; standard service tier; `store=false`. One synchronous request, with automatic retries disabled.

**Footnote instruction:**

> Return one region per numbered footnote, including its marker and text. Separate neighboring footnotes even when they share a printed line.

**Coordinates:** Requested [ymin,xmin,ymax,xmax] integer coordinates normalized to 0–1000. Converted by reordering to [xmin,ymin,xmax,ymax], then multiplying x by 1407 / 1000 and y by 2135 / 1000. No coordinate clamping was applied.

**Run:** 2026-11-04 03:23:58 UTC; `run-003`; HTTP 200, response completed.

| Measurement | Result |
| --- | --- |
| Output boxes | 14 |
| Boxes marked keep=true | 12 |
| Regions marked uncertain | 0 |
| Footnote regions | 6 |
| API wall time | 5.49 s |
| Input tokens | 1,420 |
| Text output tokens | 619 |
| Thinking tokens | 0 |
| Output tokens, including thinking | 619 |
| Cached input tokens | 0 |
| Coordinate clamping adjustments | 0 |
| Estimated paid-tier cost | $0.00338625 |

The estimated paid-tier cost uses $0.75 per million input tokens and $3.75 per million output tokens including thinking: (1,420 × $0.75 + 619 × $3.75) / 1,000,000 = $0.00338625. Rates checked on 2026-11-03.

Returned region types: 2 verse, 2 commentary, 2 lead in, 6 footnote, 1 running header, 1 page number.

Each of the six numbered footnotes has a separate box containing its marker and text. Both four-line verses remain whole, with separate commentary and lead-in boxes. A few glyph tips fall beyond tight boundaries, including the top of the first verse and the left edge of the second footnote.

Blue marks regions with `keep=true`; purple marks regions with `keep=false`. Red marks uncovered measured ink. Content numbers show returned reading order; H marks the running header and PN the page number.

![Gemini 3.8 Flash low thinking, individual footnotes, native coordinates — repeat 3 output for Kale (1913), PDF page 17 / 252](outputs/kale-1913-page-017/018-gemini-3.8-flash-low-native/run-003/overlay.png)


### Method 019 — Gemini 3.5 Flash-Lite minimal thinking, individual footnotes, native coordinates

**Method:** [019-gemini-3.5-flash-lite-minimal: Gemini 3.5 Flash-Lite minimal thinking, individual footnotes, native coordinates](methods/019-gemini-3.5-flash-lite-minimal/README.md).

**Input:** `kale-1913-page-017`; the unchanged PNG rendering at 300 dpi, 1407 × 2135 pixels.

**Settings:** Requested and returned model `gemini-3.5-flash-lite`; thinking level `minimal`; image resolution `high`; JSON Schema output; maximum 16,384 output tokens including thinking; standard service tier; `store=false`.

**Footnote instruction:**

> Return one region per numbered footnote, including its marker and text. Separate neighboring footnotes even when they share a printed line.

**Coordinates:** Requested Google's documented [ymin,xmin,ymax,xmax] coordinates normalized to 0–1000. Converted by reordering to [xmin,ymin,xmax,ymax], then multiplying x by 1407 / 1000 and y by 2135 / 1000.

**Run:** 2026-11-03 15:16:57 UTC.

| Measurement | Result |
| --- | --- |
| Output proposals | 9 |
| Boxes marked keep=true | 7 |
| Regions marked uncertain | 0 |
| Footnote regions | 1 |
| API wall time | 2.46 s |
| Input tokens | 1,420 |
| Text output tokens | 684 |
| Thinking tokens | 0 |
| Output tokens, including thinking | 684 |
| Cached input tokens | 0 |
| Valid rectangles rendered in diagnostic | 8 |
| Invalid rectangle proposals | 1 |
| Estimated paid-tier cost | $0.002136 |

The estimated cost uses $0.3 per million input tokens and $2.5 per million output tokens including thinking: (1,420 × $0.3 + 684 × $2.5) / 1,000,000 = $0.002136. Rates checked on 2026-11-03.

Returned region types: 2 verse, 2 commentary, 2 lead in, 1 footnote, 1 running header, 1 page number.

The API returned nine proposals. The page-number proposal has inverted vertical coordinates, [130,132,22,173] in [ymin,xmin,ymax,xmax] order, and local validation stopped with `Nonpositive rectangle at region 1`. The first verse box contains only three of its four lines; its fourth line is included in the commentary box. All six numbered footnotes share one box.

The diagnostic image renders the eight valid returned rectangles with their original coordinates. The invalid page-number proposal is omitted. Blue marks regions with `keep=true`; purple marks regions with `keep=false`; red marks uncovered measured ink. Content numbers show returned reading order; H marks the running header.

![Gemini 3.5 Flash-Lite minimal thinking, individual footnotes, native coordinates output for Kale (1913), PDF page 17 / 252](outputs/kale-1913-page-017/019-gemini-3.5-flash-lite-minimal/diagnostic/overlay.png)


### Method 020 — GPT-6 Astra low reasoning, individual footnotes

**Method:** [020-gpt-6-astra-low-footnotes: GPT-6 Astra low reasoning, individual footnotes](methods/020-gpt-6-astra-low-footnotes/README.md).

**Input:** `kale-1913-page-017`; the unchanged PNG rendering at 300 dpi, 1407 × 2135 pixels.

**Settings:** Requested and returned model `gpt-6-astra`; reasoning effort `low`; image detail `original`; strict JSON Schema output; maximum 16,384 output tokens including reasoning; returned service tier `default`; `store=false`.

**Footnote instruction:**

> Return one region per numbered footnote, including its marker and text. Separate neighboring footnotes even when they share a printed line.

**Coordinates:** Requested [xmin,ymin,xmax,ymax] coordinates normalized to 0–1000. Converted by multiplying x by 1407 / 1000 and y by 2135 / 1000.

**Run:** 2026-11-03 15:20:34 UTC.

| Measurement | Result |
| --- | --- |
| Output boxes | 14 |
| Boxes marked keep=true | 12 |
| Regions marked uncertain | 0 |
| Footnote regions | 6 |
| API wall time | 11.36 s |
| Input tokens | 3,932 |
| Ordinary input tokens | 3 |
| Cache-write input tokens, default 30-minute lifetime | 3,929 |
| Cache-read input tokens | 0 |
| Output tokens, including reasoning | 510 |
| Reasoning tokens | 49 |
| Output tokens excluding reasoning | 461 |
| Coordinate clamping adjustments | 0 |
| Estimated paid-tier cost | $0.0746425 |

The estimated cost uses $10 per million ordinary input tokens, $12.5 per million default 30-minute cache-write tokens and $50 per million output tokens including reasoning: (3 × $10 + 3,929 × $12.5 + 510 × $50) / 1,000,000 = $0.0746425. Rates checked on 2026-11-03.

Returned region types: 2 verse, 2 commentary, 2 lead in, 6 footnote, 1 running header, 1 page number.

Each of the six numbered footnotes has its own box containing its marker and text. Both four-line verses remain whole; the two commentary passages and two lead-ins have separate boxes. A few upper glyph tips on the first line of the final commentary extend above its box.

Blue marks regions with `keep=true`; purple marks regions with `keep=false`. Red marks uncovered measured ink. Content numbers show returned reading order; H marks the running header and PN the page number.

![GPT-6 Astra low reasoning, individual footnotes output for Kale (1913), PDF page 17 / 252](outputs/kale-1913-page-017/020-gpt-6-astra-low-footnotes/overlay.png)


### Method 021 — GPT-6.1 Terra low reasoning, individual footnotes

#### Run 001

**Method:** [021-gpt-6.1-terra-low-footnotes: GPT-6.1 Terra low reasoning, individual footnotes](methods/021-gpt-6.1-terra-low-footnotes/README.md).

**Input:** `kale-1913-page-017`; the unchanged PNG rendering at 300 dpi, 1407 × 2135 pixels.

**Settings:** Requested and returned model `gpt-6.1-terra`; reasoning effort `low`; image detail `original`; strict JSON Schema output; maximum 16,384 output tokens including reasoning; returned service tier `default`; `store=false`.

**Footnote instruction:**

> Return one region per numbered footnote, including its marker and text. Separate neighboring footnotes even when they share a printed line.

**Coordinates:** Requested [xmin,ymin,xmax,ymax] coordinates normalized to 0–1000. Converted by multiplying x by 1407 / 1000 and y by 2135 / 1000.

**Run:** 2026-11-03 15:20:39 UTC.

| Measurement | Result |
| --- | --- |
| Output boxes | 14 |
| Boxes marked keep=true | 12 |
| Regions marked uncertain | 0 |
| Footnote regions | 6 |
| API wall time | 7.82 s |
| Input tokens | 3,932 |
| Ordinary input tokens | 3 |
| Cache-write input tokens, default 30-minute lifetime | 3,929 |
| Cache-read input tokens | 0 |
| Output tokens, including reasoning | 519 |
| Reasoning tokens | 58 |
| Output tokens excluding reasoning | 461 |
| Coordinate clamping adjustments | 0 |
| Estimated paid-tier cost | $0.00750925 |

The estimated cost uses $1 per million ordinary input tokens, $1.25 per million default 30-minute cache-write tokens and $5 per million output tokens including reasoning: (3 × $1 + 3,929 × $1.25 + 519 × $5) / 1,000,000 = $0.00750925. Rates checked on 2026-11-03.

Returned region types: 2 verse, 2 commentary, 2 lead in, 6 footnote, 1 running header, 1 page number.

Each of the six numbered footnotes has its own box containing its marker and text. Both four-line verses remain whole; the two commentary passages and two lead-ins have separate boxes. A few glyph tips extend beyond the commentary boundaries.

Blue marks regions with `keep=true`; purple marks regions with `keep=false`. Red marks uncovered measured ink. Content numbers show returned reading order; H marks the running header and PN the page number.

![GPT-6.1 Terra low reasoning, individual footnotes output for Kale (1913), PDF page 17 / 252](outputs/kale-1913-page-017/021-gpt-6.1-terra-low-footnotes/overlay.png)



#### Run 002

**Method:** [021-gpt-6.1-terra-low-footnotes: GPT-6.1 Terra low reasoning, individual footnotes](methods/021-gpt-6.1-terra-low-footnotes/README.md).

**Input:** `kale-1913-page-017`; the unchanged PNG rendering at 300 dpi, 1407 × 2135 pixels.

**Settings:** Requested and returned model `gpt-6.1-terra`; reasoning effort `low`; image detail `original`; strict JSON Schema output; maximum 16,384 output tokens including reasoning; returned service tier `default`; `store=false`. One synchronous request, with automatic retries disabled.

**Footnote instruction:**

> Return one region per numbered footnote, including its marker and text. Separate neighboring footnotes even when they share a printed line.

**Coordinates:** Requested [xmin,ymin,xmax,ymax] integer coordinates normalized to 0–1000. Converted by multiplying x by 1407 / 1000 and y by 2135 / 1000. No coordinate clamping was applied.

**Run:** 2026-11-04 03:23:48 UTC; `run-002`; HTTP 200, response completed.

| Measurement | Result |
| --- | --- |
| Output boxes | 14 |
| Boxes marked keep=true | 12 |
| Regions marked uncertain | 0 |
| Footnote regions | 6 |
| API wall time | 8.85 s |
| Input tokens | 3,932 |
| Ordinary input tokens | 3 |
| Cache-write input tokens, default 30-minute lifetime | 3,929 |
| Cache-read input tokens | 0 |
| Output tokens, including reasoning | 513 |
| Reasoning tokens | 52 |
| Output tokens excluding reasoning | 461 |
| Coordinate clamping adjustments | 0 |
| Estimated paid-tier cost | $0.00747925 |

The estimated paid-tier cost uses $1 per million ordinary input tokens, $1.25 per million default 30-minute cache-write tokens, $0.05 per million cache-read tokens and $5 per million output tokens including reasoning: (3 × $1 + 3,929 × $1.25 + 0 × $0.05 + 513 × $5) / 1,000,000 = $0.00747925. Rates checked on 2026-11-03.

Returned region types: 2 verse, 2 commentary, 2 lead in, 6 footnote, 1 running header, 1 page number.

Each of the six numbered footnotes has a separate box containing its marker and text. Both four-line verses remain whole, with separate commentary and lead-in boxes.

Blue marks regions with `keep=true`; purple marks regions with `keep=false`. Red marks uncovered measured ink. Content numbers show returned reading order; H marks the running header and PN the page number.

![GPT-6.1 Terra low reasoning, individual footnotes — repeat 2 output for Kale (1913), PDF page 17 / 252](outputs/kale-1913-page-017/021-gpt-6.1-terra-low-footnotes/run-002/overlay.png)



#### Run 003

**Method:** [021-gpt-6.1-terra-low-footnotes: GPT-6.1 Terra low reasoning, individual footnotes](methods/021-gpt-6.1-terra-low-footnotes/README.md).

**Input:** `kale-1913-page-017`; the unchanged PNG rendering at 300 dpi, 1407 × 2135 pixels.

**Settings:** Requested and returned model `gpt-6.1-terra`; reasoning effort `low`; image detail `original`; strict JSON Schema output; maximum 16,384 output tokens including reasoning; returned service tier `default`; `store=false`. One synchronous request, with automatic retries disabled.

**Footnote instruction:**

> Return one region per numbered footnote, including its marker and text. Separate neighboring footnotes even when they share a printed line.

**Coordinates:** Requested [xmin,ymin,xmax,ymax] integer coordinates normalized to 0–1000. Converted by multiplying x by 1407 / 1000 and y by 2135 / 1000. No coordinate clamping was applied.

**Run:** 2026-11-04 03:24:05 UTC; `run-003`; HTTP 200, response completed.

| Measurement | Result |
| --- | --- |
| Output boxes | 14 |
| Boxes marked keep=true | 12 |
| Regions marked uncertain | 0 |
| Footnote regions | 6 |
| API wall time | 8.26 s |
| Input tokens | 3,932 |
| Ordinary input tokens | 3 |
| Cache-write input tokens, default 30-minute lifetime | 0 |
| Cache-read input tokens | 3,929 |
| Output tokens, including reasoning | 535 |
| Reasoning tokens | 74 |
| Output tokens excluding reasoning | 461 |
| Coordinate clamping adjustments | 0 |
| Estimated paid-tier cost | $0.00287445 |

The estimated paid-tier cost uses $1 per million ordinary input tokens, $1.25 per million default 30-minute cache-write tokens, $0.05 per million cache-read tokens and $5 per million output tokens including reasoning: (3 × $1 + 0 × $1.25 + 3,929 × $0.05 + 535 × $5) / 1,000,000 = $0.00287445. Rates checked on 2026-11-03.

Returned region types: 2 verse, 2 commentary, 2 lead in, 6 footnote, 1 running header, 1 page number.

Each of the six numbered footnotes has a separate box containing its marker and text. Both four-line verses remain whole, with separate commentary and lead-in boxes. The API reported 3,929 cached input tokens and zero cache-write tokens.

Blue marks regions with `keep=true`; purple marks regions with `keep=false`. Red marks uncovered measured ink. Content numbers show returned reading order; H marks the running header and PN the page number.

![GPT-6.1 Terra low reasoning, individual footnotes — repeat 3 output for Kale (1913), PDF page 17 / 252](outputs/kale-1913-page-017/021-gpt-6.1-terra-low-footnotes/run-003/overlay.png)


### Method 022 — GPT-6 Luna low reasoning, individual footnotes

**Method:** [022-gpt-6-luna-low-footnotes: GPT-6 Luna low reasoning, individual footnotes](methods/022-gpt-6-luna-low-footnotes/README.md).

**Input:** `kale-1913-page-017`; the unchanged PNG rendering at 300 dpi, 1407 × 2135 pixels.

**Settings:** Requested and returned model `gpt-6-luna`; reasoning effort `low`; image detail `original`; strict JSON Schema output; maximum 16,384 output tokens including reasoning; returned service tier `default`; `store=false`.

**Footnote instruction:**

> Return one region per numbered footnote, including its marker and text. Separate neighboring footnotes even when they share a printed line.

**Coordinates:** Requested [xmin,ymin,xmax,ymax] coordinates normalized to 0–1000. Converted by multiplying x by 1407 / 1000 and y by 2135 / 1000.

**Run:** 2026-11-03 15:20:44 UTC.

| Measurement | Result |
| --- | --- |
| Output boxes | 15 |
| Boxes marked keep=true | 13 |
| Regions marked uncertain | 7 |
| Footnote regions | 6 |
| API wall time | 8.62 s |
| Input tokens | 3,932 |
| Ordinary input tokens | 3 |
| Cache-write input tokens, default 30-minute lifetime | 3,929 |
| Cache-read input tokens | 0 |
| Output tokens, including reasoning | 750 |
| Reasoning tokens | 257 |
| Output tokens excluding reasoning | 493 |
| Coordinate clamping adjustments | 0 |
| Estimated paid-tier cost | $0.000866425 |

The estimated cost uses $0.1 per million ordinary input tokens, $0.125 per million default 30-minute cache-write tokens and $0.5 per million output tokens including reasoning: (3 × $0.1 + 3,929 × $0.125 + 750 × $0.5) / 1,000,000 = $0.000866425. Rates checked on 2026-11-03.

Returned region types: 2 verse, 3 commentary, 2 lead in, 6 footnote, 1 running header, 1 page number.

Six footnote boxes are returned, but several horizontal boundaries pass through notes and separate markers from their text. The final box combines notes 5 and 6, while earlier boxes split note 4. The second lead-in is split across two overlapping boxes labeled lead_in and commentary. Both verses remain whole.

Blue marks regions with `keep=true`; purple marks regions with `keep=false`. Red marks uncovered measured ink. Content numbers show returned reading order; H marks the running header and PN the page number.

![GPT-6 Luna low reasoning, individual footnotes output for Kale (1913), PDF page 17 / 252](outputs/kale-1913-page-017/022-gpt-6-luna-low-footnotes/overlay.png)


### Method 023 — GPT-6 Luna high reasoning, individual footnotes

**Method:** [023-gpt-6-luna-high-footnotes: GPT-6 Luna high reasoning, individual footnotes](methods/023-gpt-6-luna-high-footnotes/README.md).

**Input:** `kale-1913-page-017`; the unchanged PNG rendering at 300 dpi, 1407 × 2135 pixels.

**Settings:** Requested and returned model `gpt-6-luna`; reasoning effort `high`; image detail `original`; strict JSON Schema output; maximum 16,384 output tokens including reasoning; returned service tier `default`; `store=false`.

**Footnote instruction:**

> Return one region per numbered footnote, including its marker and text. Separate neighboring footnotes even when they share a printed line.

**Coordinates:** Requested [xmin,ymin,xmax,ymax] coordinates normalized to 0–1000. Converted by multiplying x by 1407 / 1000 and y by 2135 / 1000.

**Run:** 2026-11-03 15:23:37 UTC.

| Measurement | Result |
| --- | --- |
| Output boxes | 14 |
| Boxes marked keep=true | 12 |
| Regions marked uncertain | 0 |
| Footnote regions | 6 |
| API wall time | 23.31 s |
| Input tokens | 3,932 |
| Ordinary input tokens | 3 |
| Cache-write input tokens, default 30-minute lifetime | 3,929 |
| Cache-read input tokens | 0 |
| Output tokens, including reasoning | 2,646 |
| Reasoning tokens | 2,185 |
| Output tokens excluding reasoning | 461 |
| Coordinate clamping adjustments | 0 |
| Estimated paid-tier cost | $0.001814425 |

The estimated cost uses $0.1 per million ordinary input tokens, $0.125 per million default 30-minute cache-write tokens and $0.5 per million output tokens including reasoning: (3 × $0.1 + 3,929 × $0.125 + 2,646 × $0.5) / 1,000,000 = $0.001814425. Rates checked on 2026-11-03.

Returned region types: 2 verse, 2 commentary, 2 lead in, 6 footnote, 1 running header, 1 page number.

The six footnote boxes lie below the printed footnote line, over blank space. The final commentary box includes the footnote line and separator rule. The second verse box omits its first line and includes the first line of its commentary; the omitted verse line is included in the preceding lead-in box.

Blue marks regions with `keep=true`; purple marks regions with `keep=false`. Red marks uncovered measured ink. Content numbers show returned reading order; H marks the running header and PN the page number.

![GPT-6 Luna high reasoning, individual footnotes output for Kale (1913), PDF page 17 / 252](outputs/kale-1913-page-017/023-gpt-6-luna-high-footnotes/overlay.png)

### Method 024 — Gemini 3.5 Flash-Lite low thinking, individual footnotes, native coordinates

**Method:** [024-gemini-3.5-flash-lite-low: Gemini 3.5 Flash-Lite low thinking, individual footnotes, native coordinates](methods/024-gemini-3.5-flash-lite-low/README.md).

**Input:** `kale-1913-page-017`; the unchanged PNG rendering at 300 dpi, 1407 × 2135 pixels.

**Settings:** Requested and returned model `gemini-3.5-flash-lite`; thinking level `low`; image resolution `high`; JSON Schema output; maximum 16,384 output tokens including thinking; standard service tier; `store=false`. One synchronous request, with automatic retries disabled.

**Footnote instruction:**

> Return one region per numbered footnote, including its marker and text. Separate neighboring footnotes even when they share a printed line.

**Coordinates:** Requested [ymin,xmin,ymax,xmax] integer coordinates normalized to 0–1000. Converted by reordering to [xmin,ymin,xmax,ymax], then multiplying x by 1407 / 1000 and y by 2135 / 1000. No coordinate clamping was applied.

**Run:** 2026-11-04 03:24:14 UTC; `run-001`; HTTP 200, response completed.

| Measurement | Result |
| --- | --- |
| Output boxes | 9 |
| Boxes marked keep=true | 7 |
| Regions marked uncertain | 0 |
| Footnote regions | 1 |
| API wall time | 1.94 s |
| Input tokens | 1,420 |
| Text output tokens | 378 |
| Thinking tokens | 0 |
| Output tokens, including thinking | 378 |
| Cached input tokens | 0 |
| Coordinate clamping adjustments | 0 |
| Estimated paid-tier cost | $0.001371 |

The estimated paid-tier cost uses $0.3 per million input tokens and $2.5 per million output tokens including thinking: (1,420 × $0.3 + 378 × $2.5) / 1,000,000 = $0.001371. Rates checked on 2026-11-03.

Returned region types: 2 verse, 2 commentary, 2 lead in, 1 footnote, 1 running header, 1 page number.

All six numbered footnotes share one box. The first verse box contains three of its four lines; the fourth line is included in the following commentary box. The second verse is whole. Several upper glyph tips extend beyond their box boundaries.

Blue marks regions with `keep=true`; purple marks regions with `keep=false`. Red marks uncovered measured ink. Content numbers show returned reading order; H marks the running header and PN the page number.

![Gemini 3.5 Flash-Lite low thinking, individual footnotes, native coordinates output for Kale (1913), PDF page 17 / 252](outputs/kale-1913-page-017/024-gemini-3.5-flash-lite-low/overlay.png)


### Method 025 — GPT-6.1 Terra without reasoning, individual footnotes

**Method:** [025-gpt-6.1-terra-none-footnotes: GPT-6.1 Terra without reasoning, individual footnotes](methods/025-gpt-6.1-terra-none-footnotes/README.md).

**Input:** `kale-1913-page-017`; the unchanged PNG rendering at 300 dpi, 1407 × 2135 pixels.

**Settings:** Requested and returned model `gpt-6.1-terra`; reasoning effort `none`; image detail `original`; strict JSON Schema output; maximum 16,384 output tokens including reasoning; returned service tier `default`; `store=false`. One synchronous request, with automatic retries disabled.

**Footnote instruction:**

> Return one region per numbered footnote, including its marker and text. Separate neighboring footnotes even when they share a printed line.

**Coordinates:** Requested [xmin,ymin,xmax,ymax] integer coordinates normalized to 0–1000. Converted by multiplying x by 1407 / 1000 and y by 2135 / 1000. No coordinate clamping was applied.

**Run:** 2026-11-04 03:24:17 UTC; `run-001`; HTTP 200, response completed.

| Measurement | Result |
| --- | --- |
| Output boxes | 14 |
| Boxes marked keep=true | 12 |
| Regions marked uncertain | 0 |
| Footnote regions | 6 |
| API wall time | 8.36 s |
| Input tokens | 3,932 |
| Ordinary input tokens | 3 |
| Cache-write input tokens, default 30-minute lifetime | 3,929 |
| Cache-read input tokens | 0 |
| Output tokens, including reasoning | 459 |
| Reasoning tokens | 0 |
| Output tokens excluding reasoning | 459 |
| Coordinate clamping adjustments | 0 |
| Estimated paid-tier cost | $0.00720925 |

The estimated paid-tier cost uses $1 per million ordinary input tokens, $1.25 per million default 30-minute cache-write tokens, $0.05 per million cache-read tokens and $5 per million output tokens including reasoning: (3 × $1 + 3,929 × $1.25 + 0 × $0.05 + 459 × $5) / 1,000,000 = $0.00720925. Rates checked on 2026-11-03.

Returned region types: 2 verse, 2 commentary, 2 lead in, 6 footnote, 1 running header, 1 page number.

Each of the six numbered footnotes has a separate box containing its marker and text. Both four-line verses remain whole, with separate commentary and lead-in boxes. The API reported zero reasoning tokens.

Blue marks regions with `keep=true`; purple marks regions with `keep=false`. Red marks uncovered measured ink. Content numbers show returned reading order; H marks the running header and PN the page number.

![GPT-6.1 Terra without reasoning, individual footnotes output for Kale (1913), PDF page 17 / 252](outputs/kale-1913-page-017/025-gpt-6.1-terra-none-footnotes/overlay.png)



### Method 028 — Gemini 4 Argon low thinking, explicit crop padding

**Method:** [028-gemini-4-argon-low-padded-prompt](methods/028-gemini-4-argon-low-padded-prompt/README.md).

**Input:** [kale-1913-page-017](inputs/kale-1913-page-017.png); unchanged RGB rendering at 300 dpi, 1407 × 2135 pixels.

**Settings:** Requested and returned model `gemini-4-argon`; thinking level `low`; image resolution `high`; JSON Schema output; maximum 16,384 output tokens including thinking; standard service tier; `store=false`. One synchronous request with automatic retries disabled.

**Footnote instruction:**

> Return one region per numbered footnote, including its marker and text. Separate neighboring footnotes even when they share a printed line.

**Padding instruction:** The prompt explicitly requests complete glyphs, a white margin and an edge inspection before returning the boxes.

> Leave a visible white margin of at least 5 normalized x units on the left and right and 3 normalized y units above and below the outermost ink (about seven original-image pixels per axis on this page). Reduce this margin only where it would include a neighboring text block or footnote, or a separator rule. Keep each footnote separate.

**Coordinates:** Returned [ymin,xmin,ymax,xmax] integer coordinates normalized to 0–1000, mechanically reordered to [xmin,ymin,xmax,ymax] and scaled by x × 1407 / 1000 and y × 2135 / 1000. Original arrays are preserved. No coordinate clamping was applied.


**Run:** 2026-11-04 06:00:06 UTC.

| Measurement | Result |
| --- | --- |
| Output boxes | 14 |
| Boxes marked keep=true | 12 |
| Regions marked uncertain | 0 |
| Footnote regions | 6 |
| Unique text components cut by kept crop edges | 8 |
| Overlapping kept-box pairs containing text | 1 |
| Detected separator pixels inside kept boxes | 305 |
| API wall time | 8.06 s |
| Input tokens | 1,961 |
| Text output tokens | 617 |
| Thinking tokens | 0 |
| Output tokens, including thinking | 617 |
| Cached input tokens | 0 |
| Coordinate clamping adjustments | 0 |
| Estimated paid-tier API cost | $0.010092 |

The estimated paid-tier cost uses $2 per million input tokens and $10 per million output tokens including thinking: (1,961 × $2 + 617 × $10) / 1,000,000 = $0.010092. Rates checked on 2026-11-03.

The audit uses grayscale <175, speckle and margin filtering, and the same automatic thin-line separator detector for all compared results. It counts connected text components crossing individual kept crop edges, kept-box overlaps containing text-mask pixels, and detected separator pixels inside kept boxes. A cut can belong to text from a neighboring passage that enters a crop.

Returned region types: 1 page number, 1 running header, 2 lead in, 2 verse, 2 commentary, 6 footnote.

Both verses remain whole, with separate commentary, lead-ins and six footnotes. Some glyph tips still cross crop edges. One neighboring pair overlaps printed text.

The full-page overlay marks kept boxes blue and excluded page furniture purple. Red marks uncovered pixels from the method's analysis mask. The enlarged inspection marks text-mask pixels cut by individual crops in red.

![Gemini 4 Argon low thinking, explicit crop padding, PDF page 17 / 252](outputs/kale-1913-page-017/028-gemini-4-argon-low-padded-prompt/overlay.png)

![Gemini 4 Argon low thinking, explicit crop padding, enlarged boundary inspection, PDF page 17 / 252](outputs/kale-1913-page-017/028-gemini-4-argon-low-padded-prompt/separator-review/details.png)



### Method 029 — Gemini 3.8 Flash low thinking, explicit crop padding

**Method:** [029-gemini-3.8-flash-low-padded-prompt](methods/029-gemini-3.8-flash-low-padded-prompt/README.md).

**Input:** [kale-1913-page-017](inputs/kale-1913-page-017.png); unchanged RGB rendering at 300 dpi, 1407 × 2135 pixels.

**Settings:** Requested and returned model `gemini-3.8-flash`; thinking level `low`; image resolution `high`; JSON Schema output; maximum 16,384 output tokens including thinking; standard service tier; `store=false`. One synchronous request with automatic retries disabled.

**Footnote instruction:**

> Return one region per numbered footnote, including its marker and text. Separate neighboring footnotes even when they share a printed line.

**Padding instruction:** The prompt explicitly requests complete glyphs, a white margin and an edge inspection before returning the boxes.

> Leave a visible white margin of at least 5 normalized x units on the left and right and 3 normalized y units above and below the outermost ink (about seven original-image pixels per axis on this page). Reduce this margin only where it would include a neighboring text block or footnote, or a separator rule. Keep each footnote separate.

**Coordinates:** Returned [ymin,xmin,ymax,xmax] integer coordinates normalized to 0–1000, mechanically reordered to [xmin,ymin,xmax,ymax] and scaled by x × 1407 / 1000 and y × 2135 / 1000. Original arrays are preserved. No coordinate clamping was applied.


**Run:** 2026-11-04 06:00:15 UTC.

| Measurement | Result |
| --- | --- |
| Output boxes | 14 |
| Boxes marked keep=true | 12 |
| Regions marked uncertain | 0 |
| Footnote regions | 6 |
| Unique text components cut by kept crop edges | 21 |
| Overlapping kept-box pairs containing text | 2 |
| Detected separator pixels inside kept boxes | 0 |
| API wall time | 5.72 s |
| Input tokens | 1,538 |
| Text output tokens | 619 |
| Thinking tokens | 0 |
| Output tokens, including thinking | 619 |
| Cached input tokens | 0 |
| Coordinate clamping adjustments | 0 |
| Estimated paid-tier API cost | $0.00347475 |

The estimated paid-tier cost uses $0.75 per million input tokens and $3.75 per million output tokens including thinking: (1,538 × $0.75 + 619 × $3.75) / 1,000,000 = $0.00347475. Rates checked on 2026-11-03.

The audit uses grayscale <175, speckle and margin filtering, and the same automatic thin-line separator detector for all compared results. It counts connected text components crossing individual kept crop edges, kept-box overlaps containing text-mask pixels, and detected separator pixels inside kept boxes. A cut can belong to text from a neighboring passage that enters a crop.

Returned region types: 1 page number, 1 running header, 2 lead in, 2 verse, 2 commentary, 6 footnote.

Both verses remain whole, with separate commentary, lead-ins and six footnotes. Upper glyph tips on the first verse and several other character edges are clipped. Two neighboring pairs overlap printed text.

The full-page overlay marks kept boxes blue and excluded page furniture purple. Red marks uncovered pixels from the method's analysis mask. The enlarged inspection marks text-mask pixels cut by individual crops in red.

![Gemini 3.8 Flash low thinking, explicit crop padding, PDF page 17 / 252](outputs/kale-1913-page-017/029-gemini-3.8-flash-low-padded-prompt/overlay.png)

![Gemini 3.8 Flash low thinking, explicit crop padding, enlarged boundary inspection, PDF page 17 / 252](outputs/kale-1913-page-017/029-gemini-3.8-flash-low-padded-prompt/separator-review/details.png)



### Method 030 — Gemini 4 Argon low thinking + component completion, padding and slanted-separator handling

**Method:** [030-gemini-4-argon-low-slanted-refinement](methods/030-gemini-4-argon-low-slanted-refinement/README.md).

**Input:** [kale-1913-page-017](inputs/kale-1913-page-017.png); unchanged RGB rendering at 300 dpi, 1407 × 2135 pixels.

**Source method:** [017-gemini-4-argon-low-native](methods/017-gemini-4-argon-low-native/README.md), applied to the identical raw image.

**Settings:** Complete assigned foreground components within ceil(1.5% of width) horizontally and ceil(1.2% of height) vertically; request ceil(0.5% of width) horizontal and ceil(0.3% of height) vertical padding. Keep source region count, types, keep flags, reading order and uncertainty flags.

**Separator handling:** Detect near-straight thin components from source pixels: width at least max(80 pixels, 8% of image width), aspect ratio at least 10, height at most 5% of image height, at least 95% filled columns, median column thickness at most max(3 pixels, 0.3% of image height), maximum thickness at most twice that, absolute line slope at most 0.05 and 95th-percentile fit residual at most max(1.5 pixels, 0.15% of image height). Exclude accepted line pixels from component ownership. Limit crop edges to their local line envelope, requesting a one-pixel gap. Original whitespace and separator inclusion can be reduced while preserving owned text and all text-mask pixels originally inside each source box.

**Coordinates:** Final integer [xmin,ymin,xmax,ymax] pixel rectangles, with exclusive right and bottom edges. Original model coordinates are preserved.


**Run:** 2026-11-04 06:05:31 UTC.

| Measurement | Result |
| --- | --- |
| Output boxes | 14 |
| Boxes marked keep=true | 12 |
| Regions marked uncertain | 0 |
| Footnote regions | 6 |
| Unique text components cut by kept crop edges | 31 |
| Overlapping kept-box pairs containing text | 4 |
| Detected separator pixels inside kept boxes | 0 |
| Source text components cut by kept crop edges | 10 |
| Detected separator fragments | 3 |
| Regions constrained by separators | 6 |
| Requested padding per axis | 8 × 7 pixels |
| Ambiguous component assignments | 0 |
| Completed rectangle overlap warnings | 4 |
| Local refinement time | 0.0371 s |
| Local total before file writes | 0.2325 s |
| Additional API calls | 0 |
| Estimated source API cost | $0.009864 |
| Additional API cost | $0 |

The local step uses the saved source boxes. Its additional API cost is $0; the previously recorded source request is estimated at $0.009864.

The audit uses grayscale <175, speckle and margin filtering, and the same automatic thin-line separator detector for all compared results. It counts connected text components crossing individual kept crop edges, kept-box overlaps containing text-mask pixels, and detected separator pixels inside kept boxes. A cut can belong to text from a neighboring passage that enters a crop.

Returned region types: 1 page number, 1 running header, 2 lead in, 2 verse, 2 commentary, 6 footnote.

The detected separator stays outside every kept box, and source labels and reading order are retained. Padding extends into neighboring text at existing body-box overlaps. The audit records 31 cut text components and 4 overlaps containing text. The output retains 0 ambiguous component assignments and 4 completed-rectangle overlap warnings for inspection. Source text-mask pixels remain enclosed.

The full-page overlay marks kept boxes blue and excluded page furniture purple. Red marks uncovered pixels from the method's analysis mask. The enlarged inspection marks text-mask pixels cut by individual crops in red.

![Gemini 4 Argon low thinking + component completion, padding and slanted-separator handling, PDF page 17 / 252](outputs/kale-1913-page-017/030-gemini-4-argon-low-slanted-refinement/overlay.png)

![Gemini 4 Argon low thinking + component completion, padding and slanted-separator handling, enlarged boundary inspection, PDF page 17 / 252](outputs/kale-1913-page-017/030-gemini-4-argon-low-slanted-refinement/separator-review/details.png)



### Method 031 — Gemini 3.8 Flash low thinking + component completion, padding and slanted-separator handling

**Method:** [031-gemini-3.8-flash-low-slanted-refinement](methods/031-gemini-3.8-flash-low-slanted-refinement/README.md).

**Input:** [kale-1913-page-017](inputs/kale-1913-page-017.png); unchanged RGB rendering at 300 dpi, 1407 × 2135 pixels.

**Source method:** [018-gemini-3.8-flash-low-native](methods/018-gemini-3.8-flash-low-native/README.md), applied to the identical raw image.

**Settings:** Complete assigned foreground components within ceil(1.5% of width) horizontally and ceil(1.2% of height) vertically; request ceil(0.5% of width) horizontal and ceil(0.3% of height) vertical padding. Keep source region count, types, keep flags, reading order and uncertainty flags.

**Separator handling:** Detect near-straight thin components from source pixels: width at least max(80 pixels, 8% of image width), aspect ratio at least 10, height at most 5% of image height, at least 95% filled columns, median column thickness at most max(3 pixels, 0.3% of image height), maximum thickness at most twice that, absolute line slope at most 0.05 and 95th-percentile fit residual at most max(1.5 pixels, 0.15% of image height). Exclude accepted line pixels from component ownership. Limit crop edges to their local line envelope, requesting a one-pixel gap. Original whitespace and separator inclusion can be reduced while preserving owned text and all text-mask pixels originally inside each source box.

**Coordinates:** Final integer [xmin,ymin,xmax,ymax] pixel rectangles, with exclusive right and bottom edges. Original model coordinates are preserved.


**Run:** 2026-11-04 06:05:32 UTC.

| Measurement | Result |
| --- | --- |
| Output boxes | 14 |
| Boxes marked keep=true | 12 |
| Regions marked uncertain | 0 |
| Footnote regions | 6 |
| Unique text components cut by kept crop edges | 25 |
| Overlapping kept-box pairs containing text | 3 |
| Detected separator pixels inside kept boxes | 0 |
| Source text components cut by kept crop edges | 15 |
| Detected separator fragments | 3 |
| Regions constrained by separators | 4 |
| Requested padding per axis | 8 × 7 pixels |
| Ambiguous component assignments | 0 |
| Completed rectangle overlap warnings | 3 |
| Local refinement time | 0.0383 s |
| Local total before file writes | 0.2096 s |
| Additional API calls | 0 |
| Estimated source API cost | $0.0033975 |
| Additional API cost | $0 |

The local step uses the saved source boxes. Its additional API cost is $0; the previously recorded source request is estimated at $0.0033975.

The audit uses grayscale <175, speckle and margin filtering, and the same automatic thin-line separator detector for all compared results. It counts connected text components crossing individual kept crop edges, kept-box overlaps containing text-mask pixels, and detected separator pixels inside kept boxes. A cut can belong to text from a neighboring passage that enters a crop.

Returned region types: 1 page number, 1 running header, 2 lead in, 2 verse, 2 commentary, 6 footnote.

The detected separator stays outside every kept box, and source labels and reading order are retained. Padding extends into neighboring text at existing body-box overlaps. The audit records 25 cut text components and 3 overlaps containing text. The output retains 0 ambiguous component assignments and 3 completed-rectangle overlap warnings for inspection. Source text-mask pixels remain enclosed.

The full-page overlay marks kept boxes blue and excluded page furniture purple. Red marks uncovered pixels from the method's analysis mask. The enlarged inspection marks text-mask pixels cut by individual crops in red.

![Gemini 3.8 Flash low thinking + component completion, padding and slanted-separator handling, PDF page 17 / 252](outputs/kale-1913-page-017/031-gemini-3.8-flash-low-slanted-refinement/overlay.png)

![Gemini 3.8 Flash low thinking + component completion, padding and slanted-separator handling, enlarged boundary inspection, PDF page 17 / 252](outputs/kale-1913-page-017/031-gemini-3.8-flash-low-slanted-refinement/separator-review/details.png)


### Method 032 — Text-line skew, curvature and boundary separability

**Method:** [032-line-skew-separability](methods/032-line-skew-separability/README.md).

**Input:** [kale-1913-page-017](inputs/kale-1913-page-017.png); unchanged RGB rendering at 300 dpi, 1407 × 2135 pixels.

**Settings:** Local measurement only; no API call and no image resampling (rotations act on pixel coordinates). Hysteresis ink mask: strong ink at or below the Otsu threshold, weak ink darker than the midpoint between that threshold and white, kept when connected to strong ink; specks below max(4 px, page area × 5e-7, (0.1 × character height)²) removed; thin long components classed as rules and components taller than 3 character heights or wider than 60% of the page classed as large non-text. Page text angle by projection-profile sharpness over ±6° (0.1° then 0.01° steps). Lines from main components (0.55–2.2 character heights) split at rotated-center gaps above 0.35 character heights, with detached marks joined to the nearest line within 1.2 character heights. Per-line angle and bow from segment row-profile cross-correlation on lines at least 60% of the column width and 10 character heights long. Bow is positive when the middle of a line is higher than its ends.

Consecutive lines in a column are tested with four boundary representations: tight axis-aligned rectangles; tight rectangles at the page text angle; a straight cut at any angle within ±6°; and a per-column staircase cut. Two pixels conflict when their centers are less than one pixel apart in the tested direction.

**Run:** 2026-11-04 07:09:02 UTC.

| Measurement | Result |
| --- | --- |
| Page text angle | −0.05° |
| Character height | 40 px |
| Lines | 30, of which 21 long |
| Long-line angles, excluding line 0 | −0.19° to +0.41°, median +0.22° |
| Long-line bow, excluding line 0 | −1.0 to +4.2 px, median 2.1 px |
| Unassigned text components | 1 |
| Components touching two lines | 0 |
| Line pairs tested | 29 |
| Not separable by tight axis-aligned rectangles | 10 |
| Not separable by tight rectangles at the page angle | 10 |
| Not separable by any straight cut | 6 |
| Not separable by a staircase cut | 0 |
| API calls | 0 |

The page is essentially unrotated. Ten of 29 adjacent line pairs still cannot be separated by tight axis-aligned rectangles, and rotation does not change that count, so these conflicts come from marks above and below neighboring lines rather than skew. Every pair has a clear per-column gap.

Lines are drawn in cycling colors, rules black and unassigned text light gray. The square left of each line pair shows the most constrained representation that separates it: light gray axis-aligned rectangle, orange rectangle at the page angle, red straight cut at another angle, purple staircase only.

![Text-line skew, curvature and boundary separability, PDF page 17 / 252](outputs/kale-1913-page-017/032-line-skew-separability/lines.png)


### Proposed passage reference

**Reference:** [references/kale-1913-page-017](references/kale-1913-page-017/README.md). Claude proposed it, and it has not yet been reviewed by a person. It was written from the page image and the method 032 line segmentation with line numbers drawn on it, before any method 033 or 034 output existed for this page. No API call was made.

**Input:** [kale-1913-page-017](inputs/kale-1913-page-017.png); unchanged RGB rendering at 300 dpi, 1407 × 2135 pixels.

**Built:** 2026-11-04 15:38:58 UTC with `reference.py` from [033-gpt-6.1-terra-none-line-polygons](methods/033-gpt-6.1-terra-none-line-polygons/README.md). That is method 032's builder plus split rules that can leave components unlabeled.

| Passage | Detected lines | Ink pixels |
| --- | --- | ---: |
| Page number | 0, x < 400 | 1,080 |
| Running header | 0, 400 ≤ x < 1127 | 5,456 |
| Lead-in to verse 35 | 1 | 7,442 |
| Verse 35 | 2–5 | 58,351 |
| Commentary on verse 35 | 6–13 | 111,545 |
| Lead-in to verse 36 | 14–15 | 23,575 |
| Verse 36 | 16–19 | 55,049 |
| Commentary on verse 36 | 20–28 | 148,012 |
| Footnotes 1–6 | 29, split | 12,513 |

Footnote line 29 is split at the centers of the ink-free column runs before each footnote numeral: x = 321.5, 473, 661, 1011.5 and 1148.5. The six footnotes have 1,500, 1,537, 2,176, 4,283, 1,446 and 1,571 ink pixels. The gap between प्राणत्यागः, and प्राणोच्छेदः is inside footnote 4 and is not a split.

Four scanner-edge components at x ≥ 1399 are unlabeled. Two of them had been attached to lines 0 and 27 by the line finder, and one is a tall edge strip classed as large non-text.

Each passage is shown in its own color, with separators in black.

![Proposed passage reference, PDF page 17 / 252](references/kale-1913-page-017/review.png)

### Methods 033 and 034 — GPT-6.1 Terra without reasoning and GPT-6 Astra low reasoning + line ownership and polygon regions

**Methods:** [033-gpt-6.1-terra-none-line-polygons](methods/033-gpt-6.1-terra-none-line-polygons/README.md) and [034-gpt-6-astra-low-line-polygons](methods/034-gpt-6-astra-low-line-polygons/README.md).

**Input:** [kale-1913-page-017](inputs/kale-1913-page-017.png); unchanged RGB rendering at 300 dpi, 1407 × 2135 pixels.

**Source results:** [025 — GPT-6.1 Terra without reasoning, individual footnotes](methods/025-gpt-6.1-terra-none-footnotes/README.md) and [020 — GPT-6 Astra low reasoning, individual footnotes](methods/020-gpt-6-astra-low-footnotes/README.md). Their page-17 `regions.json` files are used unchanged; no new API call was made.

**Settings:** Local processing only. Method 032's hysteresis ink mask and line finder, copied unchanged. Each line goes whole to the model box holding the largest share of its ink, if that share is at least 25%. A box narrower than 90% of a line's extent and holding at least half of its own line ink on that line is line-local. Line-local boxes claim the components with at least half their pixels inside, smallest box first. Another box may then claim the unclaimed remainder it holds, if that is at least 25% of the line's ink. Anything left joins the claimed component with the smallest horizontal edge-to-edge gap on the line. Components more than 1 character height outside their owner's box and more than 2 character heights from the rest of their line stay unassigned. Outlines come from a nearest-ink partition, in which owned ink and separators (rules and large non-text) are sites. Each region is its cell clipped to a rectangle at the page text angle around its own ink, padded by 0.25 character heights, and lines are outlined the same way within their region. Rings are simplified with Douglas–Peucker at 1 px.

**Reference:** the proposed page-17 reference above, which has not yet been reviewed by a person.

**Run:** 2026-11-04 15:49:40 UTC (033), 15:49:46 UTC (034); reference evaluation 15:50:02 UTC.

| Measurement | Method 033 (Terra boxes) | Method 034 (Astra boxes) |
| --- | --- | --- |
| Lines: whole / split between regions / uncovered | 28 / 2 / 0 | identical |
| Outlier marks dropped | 2 scanner-edge marks, on lines 0 and 27 | identical |
| Unassigned text pixels | 251 | identical |
| Polygon vertices, all regions | 811 | identical |
| Whitespace pixels inside two adjacent outlines | 160, with no ink | identical |
| Local time: ink and lines / ownership / outlines | 0.67 s / 0.01 s / 0.56 s | similar |
| API calls | 0 | 0 |

Against the reference, summed over kept passages: other passages' ink inside each passage's matched region / own ink outside it / separator pixels inside it.

| Result | Other passages' ink | Own ink left out | Separator pixels |
| --- | ---: | ---: | ---: |
| GPT-6.1 Terra without reasoning (025), boxes as returned | 87 | 13 | 176 |
| GPT-6.1 Terra without reasoning + line ownership polygons (033) | 0 | 0 | 0 |
| GPT-6 Astra low reasoning (020), boxes as returned | 17 | 56 | 11 |
| GPT-6 Astra low reasoning + line ownership polygons (034) | 0 | 0 | 0 |

The two split lines are line 0 (page number and running header) and footnote line 29. Both models' boxes are already close on this page; the polygons remove the remaining overlaps and the footnote rule. The unassigned text is the two dropped edge marks and a speck at the top-right corner. Terra and Astra boxes lead to identical line ownership.

In the overlay, owned ink is colored by region, outlines are drawn in the region color, the original model boxes are thin gray rectangles, unassigned text ink is red and separators are black. The comparison shows the four results; red marks other passages' ink inside a passage's matched region and magenta its own ink outside.

![GPT-6.1 Terra without reasoning + line ownership and polygon regions, PDF page 17 / 252](outputs/kale-1913-page-017/033-gpt-6.1-terra-none-line-polygons/overlay.png)

![Boxes as returned and line ownership polygons against the proposed reference, PDF page 17 / 252](outputs/kale-1913-page-017/033-gpt-6.1-terra-none-line-polygons/reference-evaluation/comparison.png)

## Kale (1913), PDF page 97 / 252

### Method 017 — Gemini 4 Argon low thinking, individual footnotes, native coordinates

**Method:** [017-gemini-4-argon-low-native: Gemini 4 Argon low thinking, individual footnotes, native coordinates](methods/017-gemini-4-argon-low-native/README.md).

**Input:** [kale-1913-page-097](inputs/kale-1913-page-097.png); unannotated RGB rendering at 300 dpi, 1374 × 2114 pixels. Two four-line verses, two commentary passages, one lead-in and six numbered footnotes; the sixth footnote is printed on a second line.

**Settings:** Requested and returned model `gemini-4-argon`; thinking level `low`; image resolution `high`; JSON Schema output; maximum 16,384 output tokens including thinking; standard service tier; `store=false`. One synchronous request, with automatic retries disabled.

**Footnote instruction:**

> Return one region per numbered footnote, including its marker and text. Separate neighboring footnotes even when they share a printed line.

**Coordinates:** Requested [ymin,xmin,ymax,xmax] integer coordinates normalized to 0–1000. Converted by reordering to [xmin,ymin,xmax,ymax], then multiplying x by 1374 / 1000 and y by 2114 / 1000. No coordinate clamping was applied.

**Run:** 2026-11-04 04:28:40 UTC; HTTP 200, response completed.

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

Returned region types: 2 verse, 2 commentary, 1 lead in, 6 footnote, 1 running header, 1 page number.

Both four-line verses remain whole. The two commentary passages and the short lead-in have separate boxes. Each numbered footnote has a separate box containing its marker and text, including the sixth footnote on the second printed footnote line. Some right edges of commentary boxes are tight, with small glyph tips extending beyond them.

Blue marks regions with `keep=true`; purple marks regions with `keep=false`. Red marks uncovered measured ink. Content numbers show returned reading order; H marks the running header and PN the page number.

![Gemini 4 Argon low thinking, individual footnotes, native coordinates output for Kale (1913), PDF page 97 / 252](outputs/kale-1913-page-097/017-gemini-4-argon-low-native/overlay.png)


### Method 018 — Gemini 3.8 Flash low thinking, individual footnotes, native coordinates

**Method:** [018-gemini-3.8-flash-low-native: Gemini 3.8 Flash low thinking, individual footnotes, native coordinates](methods/018-gemini-3.8-flash-low-native/README.md).

**Input:** [kale-1913-page-097](inputs/kale-1913-page-097.png); unannotated RGB rendering at 300 dpi, 1374 × 2114 pixels. Two four-line verses, two commentary passages, one lead-in and six numbered footnotes; the sixth footnote is printed on a second line.

**Settings:** Requested and returned model `gemini-3.8-flash`; thinking level `low`; image resolution `high`; JSON Schema output; maximum 16,384 output tokens including thinking; standard service tier; `store=false`. One synchronous request, with automatic retries disabled.

**Footnote instruction:**

> Return one region per numbered footnote, including its marker and text. Separate neighboring footnotes even when they share a printed line.

**Coordinates:** Requested [ymin,xmin,ymax,xmax] integer coordinates normalized to 0–1000. Converted by reordering to [xmin,ymin,xmax,ymax], then multiplying x by 1374 / 1000 and y by 2114 / 1000. No coordinate clamping was applied.

**Run:** 2026-11-04 04:28:23 UTC; HTTP 200, response completed.

| Measurement | Result |
| --- | --- |
| Output boxes | 13 |
| Boxes marked keep=true | 11 |
| Regions marked uncertain | 0 |
| Footnote regions | 6 |
| API wall time | 5.99 s |
| Input tokens | 1,379 |
| Text output tokens | 575 |
| Thinking tokens | 0 |
| Output tokens, including thinking | 575 |
| Cached input tokens | 0 |
| Coordinate clamping adjustments | 0 |
| Estimated paid-tier cost | $0.0031905 |

The estimated paid-tier cost uses $0.75 per million input tokens and $3.75 per million output tokens including thinking: (1,379 × $0.75 + 575 × $3.75) / 1,000,000 = $0.0031905. Rates checked on 2026-11-03.

Returned region types: 2 verse, 2 commentary, 1 lead in, 6 footnote, 1 running header, 1 page number.

Both four-line verses remain whole. The two commentary passages and the short lead-in have separate boxes. Each numbered footnote has a separate box containing its marker and text; the sixth footnote is on the second printed footnote line. Several boundaries are tight, with small glyph tips outside the first verse and commentary boxes.

Blue marks regions with `keep=true`; purple marks regions with `keep=false`. Red marks uncovered measured ink. Content numbers show returned reading order; H marks the running header and PN the page number.

![Gemini 3.8 Flash low thinking, individual footnotes, native coordinates output for Kale (1913), PDF page 97 / 252](outputs/kale-1913-page-097/018-gemini-3.8-flash-low-native/overlay.png)


### Method 020 — GPT-6 Astra low reasoning, individual footnotes

**Method:** [020-gpt-6-astra-low-footnotes: GPT-6 Astra low reasoning, individual footnotes](methods/020-gpt-6-astra-low-footnotes/README.md).

**Input:** [kale-1913-page-097](inputs/kale-1913-page-097.png); unannotated RGB rendering at 300 dpi, 1374 × 2114 pixels. Two four-line verses, two commentary passages, one lead-in and six numbered footnotes; the sixth footnote is printed on a second line.

**Settings:** Requested and returned model `gpt-6-astra`; reasoning effort `low`; image detail `original`; strict JSON Schema output; maximum 16,384 output tokens including reasoning; returned service tier `default`; `store=false`. One synchronous request, with automatic retries disabled.

**Footnote instruction:**

> Return one region per numbered footnote, including its marker and text. Separate neighboring footnotes even when they share a printed line.

**Coordinates:** Requested [xmin,ymin,xmax,ymax] integer coordinates normalized to 0–1000. Converted by multiplying x by 1374 / 1000 and y by 2114 / 1000. No coordinate clamping was applied.

**Run:** 2026-11-04 04:28:51 UTC; HTTP 200, response completed.

| Measurement | Result |
| --- | --- |
| Output boxes | 13 |
| Boxes marked keep=true | 11 |
| Regions marked uncertain | 0 |
| Footnote regions | 6 |
| API wall time | 9.71 s |
| Input tokens | 3,852 |
| Ordinary input tokens | 3 |
| Cache-write input tokens, default 30-minute lifetime | 3,849 |
| Cache-read input tokens | 0 |
| Output tokens, including reasoning | 427 |
| Reasoning tokens | 0 |
| Output tokens excluding reasoning | 427 |
| Coordinate clamping adjustments | 0 |
| Estimated paid-tier cost | $0.0694925 |

The estimated paid-tier cost uses $10 per million ordinary input tokens, $12.5 per million default 30-minute cache-write tokens, $1 per million cache-read tokens and $50 per million output tokens including reasoning: (3 × $10 + 3,849 × $12.5 + 0 × $1 + 427 × $50) / 1,000,000 = $0.0694925. Rates checked on 2026-11-03.

Returned region types: 2 verse, 2 commentary, 1 lead in, 6 footnote, 1 running header, 1 page number.

Both four-line verses remain whole. The two commentary passages and the short lead-in have separate boxes. Each numbered footnote has a separate box containing its marker and text, including the sixth footnote on the second printed footnote line.

Blue marks regions with `keep=true`; purple marks regions with `keep=false`. Red marks uncovered measured ink. Content numbers show returned reading order; H marks the running header and PN the page number.

![GPT-6 Astra low reasoning, individual footnotes output for Kale (1913), PDF page 97 / 252](outputs/kale-1913-page-097/020-gpt-6-astra-low-footnotes/overlay.png)
### Method 025 — GPT-6.1 Terra without reasoning, individual footnotes

**Method:** [025-gpt-6.1-terra-none-footnotes: GPT-6.1 Terra without reasoning, individual footnotes](methods/025-gpt-6.1-terra-none-footnotes/README.md).

**Input:** [kale-1913-page-097](inputs/kale-1913-page-097.png); unannotated RGB rendering at 300 dpi, 1374 × 2114 pixels. Two four-line verses, two commentary passages, one lead-in and six numbered footnotes; the sixth footnote is printed on a second line.

**Settings:** Requested and returned model `gpt-6.1-terra`; reasoning effort `none`; image detail `original`; strict JSON Schema output; maximum 16,384 output tokens including reasoning; returned service tier `default`; `store=false`. One synchronous request, with automatic retries disabled.

**Footnote instruction:**

> Return one region per numbered footnote, including its marker and text. Separate neighboring footnotes even when they share a printed line.

**Coordinates:** Requested [xmin,ymin,xmax,ymax] integer coordinates normalized to 0–1000. Converted by multiplying x by 1374 / 1000 and y by 2114 / 1000. No coordinate clamping was applied.

**Run:** 2026-11-04 04:28:30 UTC; HTTP 200, response completed.

| Measurement | Result |
| --- | --- |
| Output boxes | 13 |
| Boxes marked keep=true | 11 |
| Regions marked uncertain | 0 |
| Footnote regions | 6 |
| API wall time | 8.83 s |
| Input tokens | 3,852 |
| Ordinary input tokens | 3 |
| Cache-write input tokens, default 30-minute lifetime | 3,849 |
| Cache-read input tokens | 0 |
| Output tokens, including reasoning | 427 |
| Reasoning tokens | 0 |
| Output tokens excluding reasoning | 427 |
| Coordinate clamping adjustments | 0 |
| Estimated paid-tier cost | $0.00694925 |

The estimated paid-tier cost uses $1 per million ordinary input tokens, $1.25 per million default 30-minute cache-write tokens, $0.05 per million cache-read tokens and $5 per million output tokens including reasoning: (3 × $1 + 3,849 × $1.25 + 0 × $0.05 + 427 × $5) / 1,000,000 = $0.00694925. Rates checked on 2026-11-03.

Returned region types: 2 verse, 2 commentary, 1 lead in, 6 footnote, 1 running header, 1 page number.

Both four-line verses remain whole. The two commentary passages and the short lead-in have separate boxes. Each numbered footnote has a separate box containing its marker and text, including the sixth footnote on the second printed footnote line.

Blue marks regions with `keep=true`; purple marks regions with `keep=false`. Red marks uncovered measured ink. Content numbers show returned reading order; H marks the running header and PN the page number.

![GPT-6.1 Terra without reasoning, individual footnotes output for Kale (1913), PDF page 97 / 252](outputs/kale-1913-page-097/025-gpt-6.1-terra-none-footnotes/overlay.png)

### Method 026 — Gemini 4 Argon low thinking + component completion and padding

**Method:** [026-gemini-4-argon-low-pixel-refinement](methods/026-gemini-4-argon-low-pixel-refinement/README.md).

**Input:** [kale-1913-page-097](inputs/kale-1913-page-097.png); unannotated RGB rendering at 300 dpi, 1374 × 2114 pixels.

**Source method:** [017-gemini-4-argon-low-native](methods/017-gemini-4-argon-low-native/README.md), applied to the same 1374 × 2114 raw image.

**Settings:** Local processing of saved method 017 boxes on the identical raw image. Complete foreground components assigned by greatest original-box pixel intersection; include uniquely nearest detached components within the padding distance. Limit completion to 21 pixels horizontally and 26 vertically beyond each rounded source box, then request seven pixels of padding on every side. Padding stops at image edges, detected rule rows and midpoints between neighboring completed rectangles. Preserve source region count, types, keep flags, reading order and uncertainty flags.

**Coordinates:** Original model boxes remain in the saved source record. Final boxes use integer [xmin,ymin,xmax,ymax] original-image pixels, with exclusive right and bottom edges.


**Run:** 2026-11-04 05:39:09 UTC.

| Measurement | Result |
| --- | --- |
| Output boxes | 13 |
| Boxes marked keep=true | 11 |
| Regions marked uncertain | 0 |
| Footnote regions | 6 |
| Source text components cut by crop edges, separator excluded | 19 |
| Output text components cut by crop edges, separator excluded | 0 |
| Padding requested per axis | 7 × 7 pixels |
| Component extension limit before padding | 21 pixels horizontally; 26 vertically |
| Changed boxes | 13 |
| Ambiguous component assignments | 1 |
| Overlapping completed rectangle pairs | 0 |
| Local pixel-refinement time | 0.0190 s |
| Local total before file writes, including mask and drawing | 0.1517 s |
| Additional API calls | 0 |
| Estimated source API cost | $0.009312 |
| Additional API cost | $0 |

The source API request was previously recorded at an estimated $0.009312. This run uses its saved boxes; the additional API cost is $0.

The boundary audit counts connected foreground components that cross individual kept crop edges in the grayscale <175 mask, after the existing speckle and margin filtering. Visual inspection identifies two slanted-separator components, bounded by [1096,1835,1273,1845] and [182,1839,1094,1858] in original-image pixels; these are reported separately from text-component cuts.

Returned region types: 2 verse, 2 commentary, 1 lead-in, 6 footnote, 1 running header and 1 page number.

Both four-line verses remain whole, with separate commentary and lead-in regions and six individual footnotes. The previously clipped text components are enclosed. The slanted separator survives the rule filter: one component receives a tied assignment, and parts of the separator enter the expanded final-commentary and footnote crops.

The full-page overlay marks kept boxes blue, page furniture purple and uncovered measured ink red. Reading-order labels for footnotes appear below both printed footnote lines.

![Gemini 4 Argon low thinking + component completion and padding, Kale (1913), PDF page 97 / 252](outputs/kale-1913-page-097/026-gemini-4-argon-low-pixel-refinement/overlay.png)

The enlarged panels show original pixels at 2× scale, crop edges in blue and clipped text-mask pixels in red.

![Gemini 4 Argon low thinking + component completion and padding, enlarged boundary inspection](outputs/kale-1913-page-097/026-gemini-4-argon-low-pixel-refinement/boundary-review/details.png)



### Method 027 — Gemini 3.8 Flash low thinking + component completion and padding

**Method:** [027-gemini-3.8-flash-low-pixel-refinement](methods/027-gemini-3.8-flash-low-pixel-refinement/README.md).

**Input:** [kale-1913-page-097](inputs/kale-1913-page-097.png); unannotated RGB rendering at 300 dpi, 1374 × 2114 pixels.

**Source method:** [018-gemini-3.8-flash-low-native](methods/018-gemini-3.8-flash-low-native/README.md), applied to the same 1374 × 2114 raw image.

**Settings:** Local processing of saved method 018 boxes on the identical raw image. Complete foreground components assigned by greatest original-box pixel intersection; include uniquely nearest detached components within the padding distance. Limit completion to 21 pixels horizontally and 26 vertically beyond each rounded source box, then request seven pixels of padding on every side. Padding stops at image edges, detected rule rows and midpoints between neighboring completed rectangles. Preserve source region count, types, keep flags, reading order and uncertainty flags.

**Coordinates:** Original model boxes remain in the saved source record. Final boxes use integer [xmin,ymin,xmax,ymax] original-image pixels, with exclusive right and bottom edges.


**Run:** 2026-11-04 05:39:10 UTC.

| Measurement | Result |
| --- | --- |
| Output boxes | 13 |
| Boxes marked keep=true | 11 |
| Regions marked uncertain | 0 |
| Footnote regions | 6 |
| Source text components cut by crop edges, separator excluded | 17 |
| Output text components cut by crop edges, separator excluded | 0 |
| Padding requested per axis | 7 × 7 pixels |
| Component extension limit before padding | 21 pixels horizontally; 26 vertically |
| Changed boxes | 13 |
| Ambiguous component assignments | 1 |
| Overlapping completed rectangle pairs | 0 |
| Local pixel-refinement time | 0.0181 s |
| Local total before file writes, including mask and drawing | 0.1302 s |
| Additional API calls | 0 |
| Estimated source API cost | $0.0031905 |
| Additional API cost | $0 |

The source API request was previously recorded at an estimated $0.0031905. This run uses its saved boxes; the additional API cost is $0.

The boundary audit counts connected foreground components that cross individual kept crop edges in the grayscale <175 mask, after the existing speckle and margin filtering. Visual inspection identifies two slanted-separator components, bounded by [1096,1835,1273,1845] and [182,1839,1094,1858] in original-image pixels; these are reported separately from text-component cuts.

Returned region types: 2 verse, 2 commentary, 1 lead-in, 6 footnote, 1 running header and 1 page number.

Both four-line verses remain whole, with separate commentary and lead-in regions and six individual footnotes. The previously clipped text components are enclosed. The slanted separator survives the rule filter: one component receives a tied assignment, and parts of the separator enter the expanded final-commentary and footnote crops.

The full-page overlay marks kept boxes blue, page furniture purple and uncovered measured ink red. Reading-order labels for footnotes appear below both printed footnote lines.

![Gemini 3.8 Flash low thinking + component completion and padding, Kale (1913), PDF page 97 / 252](outputs/kale-1913-page-097/027-gemini-3.8-flash-low-pixel-refinement/overlay.png)

The enlarged panels show original pixels at 2× scale, crop edges in blue and clipped text-mask pixels in red.

![Gemini 3.8 Flash low thinking + component completion and padding, enlarged boundary inspection](outputs/kale-1913-page-097/027-gemini-3.8-flash-low-pixel-refinement/boundary-review/details.png)



### Method 028 — Gemini 4 Argon low thinking, explicit crop padding

**Method:** [028-gemini-4-argon-low-padded-prompt](methods/028-gemini-4-argon-low-padded-prompt/README.md).

**Input:** [kale-1913-page-097](inputs/kale-1913-page-097.png); unannotated RGB rendering at 300 dpi, 1374 × 2114 pixels.

**Source method:** [017-gemini-4-argon-low-native](methods/017-gemini-4-argon-low-native/README.md). The prompt replaces its general padding instruction with the following text; model, reasoning level, image and API schema remain the same. The request contains the unannotated source image and the revised prompt.

> Include every visible glyph completely, including all diacritics, detached accents, superscripts, punctuation, upper tips and lower strokes. Never place a crop edge through printed ink.
>
> Leave a visible white margin of at least 5 normalized x units on the left and right and 3 normalized y units above and below the outermost ink (about seven original-image pixels per axis on this page). Reduce this margin only where it would include a neighboring text block or footnote, or a separator rule. Keep each footnote separate.
>
> Before returning the boxes, inspect every edge and expand any box whose edge touches or cuts a glyph. Prefer a slightly loose crop that preserves the complete glyph over a tight crop.

**Settings:** Requested and returned model `gemini-4-argon`; thinking level `low`; image resolution `high`; native [ymin,xmin,ymax,xmax] 0–1000 JSON Schema output; maximum 16,384 output tokens including thinking; standard service tier; `store=false`. One fresh synchronous request with automatic retries disabled.

**Footnote instruction:**

> Return one region per numbered footnote, including its marker and text. Separate neighboring footnotes even when they share a printed line.

**Coordinates:** Reorder returned [ymin,xmin,ymax,xmax] coordinates to [xmin,ymin,xmax,ymax], then multiply x by 1374 / 1000 and y by 2114 / 1000. Original model coordinates are preserved. No coordinate clamping was applied.


**Run:** 2026-11-04 05:39:11 UTC.

| Measurement | Result |
| --- | --- |
| Output boxes | 13 |
| Boxes marked keep=true | 11 |
| Regions marked uncertain | 0 |
| Footnote regions | 6 |
| Source text components cut by crop edges, separator excluded | 19 |
| Output text components cut by crop edges, separator excluded | 0 |
| API wall time | 9.15 s |
| Input tokens | 1,920 |
| Text output tokens | 571 |
| Thinking tokens | 0 |
| Output tokens, including thinking | 571 |
| Cached input tokens | 0 |
| Coordinate clamping adjustments | 0 |
| Estimated paid-tier API cost | $0.00955 |

The estimated paid-tier cost uses $2 per million input tokens and $10 per million output tokens including thinking: (1,920 × $2 + 571 × $10) / 1,000,000 = $0.00955. Rates checked on 2026-11-03.

The boundary audit counts connected foreground components that cross individual kept crop edges in the grayscale <175 mask, after the existing speckle and margin filtering. Visual inspection identifies two slanted-separator components, bounded by [1096,1835,1273,1845] and [182,1839,1094,1858] in original-image pixels; these are reported separately from text-component cuts.

Returned region types: 2 verse, 2 commentary, 1 lead-in, 6 footnote, 1 running header and 1 page number.

Both four-line verses remain whole, with separate commentary and lead-in regions and six individual footnotes. The boxes have visible white margins. The audit finds zero cut text components after excluding the slanted separator. Part of that separator remains inside the final commentary crop.

The full-page overlay marks kept boxes blue, page furniture purple and uncovered measured ink red. Reading-order labels for footnotes appear below both printed footnote lines.

![Gemini 4 Argon low thinking, explicit crop padding, Kale (1913), PDF page 97 / 252](outputs/kale-1913-page-097/028-gemini-4-argon-low-padded-prompt/overlay.png)

The enlarged panels show original pixels at 2× scale, crop edges in blue and clipped text-mask pixels in red.

![Gemini 4 Argon low thinking, explicit crop padding, enlarged boundary inspection](outputs/kale-1913-page-097/028-gemini-4-argon-low-padded-prompt/boundary-review/details.png)



### Method 029 — Gemini 3.8 Flash low thinking, explicit crop padding

**Method:** [029-gemini-3.8-flash-low-padded-prompt](methods/029-gemini-3.8-flash-low-padded-prompt/README.md).

**Input:** [kale-1913-page-097](inputs/kale-1913-page-097.png); unannotated RGB rendering at 300 dpi, 1374 × 2114 pixels.

**Source method:** [018-gemini-3.8-flash-low-native](methods/018-gemini-3.8-flash-low-native/README.md). The prompt replaces its general padding instruction with the following text; model, reasoning level, image and API schema remain the same. The request contains the unannotated source image and the revised prompt.

> Include every visible glyph completely, including all diacritics, detached accents, superscripts, punctuation, upper tips and lower strokes. Never place a crop edge through printed ink.
>
> Leave a visible white margin of at least 5 normalized x units on the left and right and 3 normalized y units above and below the outermost ink (about seven original-image pixels per axis on this page). Reduce this margin only where it would include a neighboring text block or footnote, or a separator rule. Keep each footnote separate.
>
> Before returning the boxes, inspect every edge and expand any box whose edge touches or cuts a glyph. Prefer a slightly loose crop that preserves the complete glyph over a tight crop.

**Settings:** Requested and returned model `gemini-3.8-flash`; thinking level `low`; image resolution `high`; native [ymin,xmin,ymax,xmax] 0–1000 JSON Schema output; maximum 16,384 output tokens including thinking; standard service tier; `store=false`. One fresh synchronous request with automatic retries disabled.

**Footnote instruction:**

> Return one region per numbered footnote, including its marker and text. Separate neighboring footnotes even when they share a printed line.

**Coordinates:** Reorder returned [ymin,xmin,ymax,xmax] coordinates to [xmin,ymin,xmax,ymax], then multiply x by 1374 / 1000 and y by 2114 / 1000. Original model coordinates are preserved. No coordinate clamping was applied.


**Run:** 2026-11-04 05:39:21 UTC.

| Measurement | Result |
| --- | --- |
| Output boxes | 13 |
| Boxes marked keep=true | 11 |
| Regions marked uncertain | 0 |
| Footnote regions | 6 |
| Source text components cut by crop edges, separator excluded | 17 |
| Output text components cut by crop edges, separator excluded | 2 |
| API wall time | 5.65 s |
| Input tokens | 1,497 |
| Text output tokens | 545 |
| Thinking tokens | 0 |
| Output tokens, including thinking | 545 |
| Cached input tokens | 0 |
| Coordinate clamping adjustments | 0 |
| Estimated paid-tier API cost | $0.0031665 |

The estimated paid-tier cost uses $0.75 per million input tokens and $3.75 per million output tokens including thinking: (1,497 × $0.75 + 545 × $3.75) / 1,000,000 = $0.0031665. Rates checked on 2026-11-03.

The boundary audit counts connected foreground components that cross individual kept crop edges in the grayscale <175 mask, after the existing speckle and margin filtering. Visual inspection identifies two slanted-separator components, bounded by [1096,1835,1273,1845] and [182,1839,1094,1858] in original-image pixels; these are reported separately from text-component cuts.

Returned region types: 2 verse, 2 commentary, 1 lead-in, 6 footnote, 1 running header and 1 page number.

Both four-line verses remain whole, with separate commentary and lead-in regions and six individual footnotes. Body text has more margin than in the source result. The final punctuation of note 1 falls across the gap between its box and the box for note 2; note 3's final punctuation is also clipped. The audit records two unique cut punctuation components, intersected by three boxes. Parts of the slanted separator enter the final-commentary and footnote crops.

The full-page overlay marks kept boxes blue, page furniture purple and uncovered measured ink red. Reading-order labels for footnotes appear below both printed footnote lines.

![Gemini 3.8 Flash low thinking, explicit crop padding, Kale (1913), PDF page 97 / 252](outputs/kale-1913-page-097/029-gemini-3.8-flash-low-padded-prompt/overlay.png)

The enlarged panels show original pixels at 2× scale, crop edges in blue and clipped text-mask pixels in red.

![Gemini 3.8 Flash low thinking, explicit crop padding, enlarged boundary inspection](outputs/kale-1913-page-097/029-gemini-3.8-flash-low-padded-prompt/boundary-review/details.png)


### Method 030 — Gemini 4 Argon low thinking + component completion, padding and slanted-separator handling

**Method:** [030-gemini-4-argon-low-slanted-refinement](methods/030-gemini-4-argon-low-slanted-refinement/README.md).

**Input:** [kale-1913-page-097](inputs/kale-1913-page-097.png); unchanged RGB rendering at 300 dpi, 1374 × 2114 pixels.

**Source method:** [017-gemini-4-argon-low-native](methods/017-gemini-4-argon-low-native/README.md), applied to the identical raw image.

**Settings:** Complete assigned foreground components within ceil(1.5% of width) horizontally and ceil(1.2% of height) vertically; request ceil(0.5% of width) horizontal and ceil(0.3% of height) vertical padding. Keep source region count, types, keep flags, reading order and uncertainty flags.

**Separator handling:** Detect near-straight thin components from source pixels: width at least max(80 pixels, 8% of image width), aspect ratio at least 10, height at most 5% of image height, at least 95% filled columns, median column thickness at most max(3 pixels, 0.3% of image height), maximum thickness at most twice that, absolute line slope at most 0.05 and 95th-percentile fit residual at most max(1.5 pixels, 0.15% of image height). Exclude accepted line pixels from component ownership. Limit crop edges to their local line envelope, requesting a one-pixel gap. Original whitespace and separator inclusion can be reduced while preserving owned text and all text-mask pixels originally inside each source box.

**Coordinates:** Final integer [xmin,ymin,xmax,ymax] pixel rectangles, with exclusive right and bottom edges. Original model coordinates are preserved.


**Run:** 2026-11-04 06:05:33 UTC.

| Measurement | Result |
| --- | --- |
| Output boxes | 13 |
| Boxes marked keep=true | 11 |
| Regions marked uncertain | 0 |
| Footnote regions | 6 |
| Unique text components cut by kept crop edges | 0 |
| Overlapping kept-box pairs containing text | 0 |
| Detected separator pixels inside kept boxes | 0 |
| Source text components cut by kept crop edges | 19 |
| Detected separator fragments | 2 |
| Regions constrained by separators | 4 |
| Requested padding per axis | 7 × 7 pixels |
| Ambiguous component assignments | 0 |
| Completed rectangle overlap warnings | 0 |
| Local refinement time | 0.0335 s |
| Local total before file writes | 0.2031 s |
| Additional API calls | 0 |
| Estimated source API cost | $0.009312 |
| Additional API cost | $0 |

The local step uses the saved source boxes. Its additional API cost is $0; the previously recorded source request is estimated at $0.009312.

The audit uses grayscale <175, speckle and margin filtering, and the same automatic thin-line separator detector for all compared results. It counts connected text components crossing individual kept crop edges, kept-box overlaps containing text-mask pixels, and detected separator pixels inside kept boxes. A cut can belong to text from a neighboring passage that enters a crop.

Returned region types: 1 page number, 1 running header, 1 lead in, 2 verse, 2 commentary, 6 footnote.

Both verses, commentary passages and the lead-in retain their source grouping; each of the six footnotes remains separate. The detected separator stays outside every kept box. The audit records zero cut text components and zero overlaps containing text. Component assignments and completed rectangles produce zero ambiguity or overlap warnings.

The full-page overlay marks kept boxes blue and excluded page furniture purple. Red marks uncovered pixels from the method's analysis mask. The enlarged inspection marks text-mask pixels cut by individual crops in red.

![Gemini 4 Argon low thinking + component completion, padding and slanted-separator handling, PDF page 97 / 252](outputs/kale-1913-page-097/030-gemini-4-argon-low-slanted-refinement/overlay.png)

![Gemini 4 Argon low thinking + component completion, padding and slanted-separator handling, enlarged boundary inspection, PDF page 97 / 252](outputs/kale-1913-page-097/030-gemini-4-argon-low-slanted-refinement/separator-review/details.png)



### Method 031 — Gemini 3.8 Flash low thinking + component completion, padding and slanted-separator handling

**Method:** [031-gemini-3.8-flash-low-slanted-refinement](methods/031-gemini-3.8-flash-low-slanted-refinement/README.md).

**Input:** [kale-1913-page-097](inputs/kale-1913-page-097.png); unchanged RGB rendering at 300 dpi, 1374 × 2114 pixels.

**Source method:** [018-gemini-3.8-flash-low-native](methods/018-gemini-3.8-flash-low-native/README.md), applied to the identical raw image.

**Settings:** Complete assigned foreground components within ceil(1.5% of width) horizontally and ceil(1.2% of height) vertically; request ceil(0.5% of width) horizontal and ceil(0.3% of height) vertical padding. Keep source region count, types, keep flags, reading order and uncertainty flags.

**Separator handling:** Detect near-straight thin components from source pixels: width at least max(80 pixels, 8% of image width), aspect ratio at least 10, height at most 5% of image height, at least 95% filled columns, median column thickness at most max(3 pixels, 0.3% of image height), maximum thickness at most twice that, absolute line slope at most 0.05 and 95th-percentile fit residual at most max(1.5 pixels, 0.15% of image height). Exclude accepted line pixels from component ownership. Limit crop edges to their local line envelope, requesting a one-pixel gap. Original whitespace and separator inclusion can be reduced while preserving owned text and all text-mask pixels originally inside each source box.

**Coordinates:** Final integer [xmin,ymin,xmax,ymax] pixel rectangles, with exclusive right and bottom edges. Original model coordinates are preserved.


**Run:** 2026-11-04 06:05:33 UTC.

| Measurement | Result |
| --- | --- |
| Output boxes | 13 |
| Boxes marked keep=true | 11 |
| Regions marked uncertain | 0 |
| Footnote regions | 6 |
| Unique text components cut by kept crop edges | 0 |
| Overlapping kept-box pairs containing text | 0 |
| Detected separator pixels inside kept boxes | 0 |
| Source text components cut by kept crop edges | 17 |
| Detected separator fragments | 2 |
| Regions constrained by separators | 5 |
| Requested padding per axis | 7 × 7 pixels |
| Ambiguous component assignments | 0 |
| Completed rectangle overlap warnings | 0 |
| Local refinement time | 0.0361 s |
| Local total before file writes | 0.2225 s |
| Additional API calls | 0 |
| Estimated source API cost | $0.0031905 |
| Additional API cost | $0 |

The local step uses the saved source boxes. Its additional API cost is $0; the previously recorded source request is estimated at $0.0031905.

The audit uses grayscale <175, speckle and margin filtering, and the same automatic thin-line separator detector for all compared results. It counts connected text components crossing individual kept crop edges, kept-box overlaps containing text-mask pixels, and detected separator pixels inside kept boxes. A cut can belong to text from a neighboring passage that enters a crop.

Returned region types: 1 page number, 1 running header, 1 lead in, 2 verse, 2 commentary, 6 footnote.

Both verses, commentary passages and the lead-in retain their source grouping; each of the six footnotes remains separate. The detected separator stays outside every kept box. The audit records zero cut text components and zero overlaps containing text. Component assignments and completed rectangles produce zero ambiguity or overlap warnings.

The full-page overlay marks kept boxes blue and excluded page furniture purple. Red marks uncovered pixels from the method's analysis mask. The enlarged inspection marks text-mask pixels cut by individual crops in red.

![Gemini 3.8 Flash low thinking + component completion, padding and slanted-separator handling, PDF page 97 / 252](outputs/kale-1913-page-097/031-gemini-3.8-flash-low-slanted-refinement/overlay.png)

![Gemini 3.8 Flash low thinking + component completion, padding and slanted-separator handling, enlarged boundary inspection, PDF page 97 / 252](outputs/kale-1913-page-097/031-gemini-3.8-flash-low-slanted-refinement/separator-review/details.png)


### Method 032 — Text-line skew, curvature and boundary separability

**Method:** [032-line-skew-separability](methods/032-line-skew-separability/README.md).

**Input:** [kale-1913-page-097](inputs/kale-1913-page-097.png); unchanged RGB rendering at 300 dpi, 1374 × 2114 pixels.

**Settings:** Local measurement only; no API call and no image resampling (rotations act on pixel coordinates). Hysteresis ink mask: strong ink at or below the Otsu threshold, weak ink darker than the midpoint between that threshold and white, kept when connected to strong ink; specks below max(4 px, page area × 5e-7, (0.1 × character height)²) removed; thin long components classed as rules and components taller than 3 character heights or wider than 60% of the page classed as large non-text. Page text angle by projection-profile sharpness over ±6° (0.1° then 0.01° steps). Lines from main components (0.55–2.2 character heights) split at rotated-center gaps above 0.35 character heights, with detached marks joined to the nearest line within 1.2 character heights. Per-line angle and bow from segment row-profile cross-correlation on lines at least 60% of the column width and 10 character heights long. Bow is positive when the middle of a line is higher than its ends.

Consecutive lines in a column are tested with four boundary representations: tight axis-aligned rectangles; tight rectangles at the page text angle; a straight cut at any angle within ±6°; and a per-column staircase cut. Two pixels conflict when their centers are less than one pixel apart in the tested direction.

**Run:** 2026-11-04 07:09:03 UTC.

| Measurement | Result |
| --- | --- |
| Page text angle | −0.57° |
| Character height | 43 px |
| Lines | 28, of which 25 long |
| Long-line angles, excluding line 0 | −0.94° to −0.36°, median −0.63° |
| Long-line bow, excluding line 0 | −0.5 to +3.3 px, median 1.9 px |
| Detected rule angle | −1.21° (the slanted footnote rule) |
| Unassigned text components | 0 |
| Components touching two lines | 0 |
| Line pairs tested | 27 |
| Not separable by tight axis-aligned rectangles | 8 |
| Not separable by tight rectangles at the page angle | 5 |
| Not separable by any straight cut | 2 |
| Not separable by a staircase cut | 0 |
| API calls | 0 |

Text lines are rotated by about −0.6°, while the detected footnote rule is at −1.21°, so the rule angle is not a good estimate of the text angle on this page. Rotating rectangles to the page angle reduces non-separable line pairs from 8 to 5 of 27.

Lines are drawn in cycling colors, rules black and unassigned text light gray. The square left of each line pair shows the most constrained representation that separates it: light gray axis-aligned rectangle, orange rectangle at the page angle, red straight cut at another angle, purple staircase only.

![Text-line skew, curvature and boundary separability, PDF page 97 / 252](outputs/kale-1913-page-097/032-line-skew-separability/lines.png)


### Proposed passage reference

**Reference:** [references/kale-1913-page-097](references/kale-1913-page-097/README.md). Claude proposed it, and it has not yet been reviewed by a person. It was written from the page image and the method 032 line segmentation with line numbers drawn on it, before any method 033 or 034 output existed for this page. No API call was made.

**Input:** [kale-1913-page-097](inputs/kale-1913-page-097.png); unchanged RGB rendering at 300 dpi, 1374 × 2114 pixels.

**Built:** 2026-11-04 15:39:00 UTC with `reference.py` from [033-gpt-6.1-terra-none-line-polygons](methods/033-gpt-6.1-terra-none-line-polygons/README.md). That is method 032's builder plus split rules that can leave components unlabeled.

| Passage | Detected lines | Ink pixels |
| --- | --- | ---: |
| Page number | 0, x < 400 | 1,099 |
| Running header | 0, x ≥ 400 | 5,698 |
| Lead-in to verses 96–97 | 1 | 7,864 |
| Verse 96 | 2–5 | 71,923 |
| Commentary on verse 96 | 6–12 | 112,440 |
| Verse 97 | 13–16 | 71,748 |
| Commentary on verse 97 | 17–25 | 149,986 |
| Footnotes 1–5 | 26, split | 14,259 |
| Footnote 6 | 27 | 5,081 |

Footnote line 26 is split at the centers of the ink-free column runs before each footnote numeral: x = 329, 459.5, 613 and 1093.5. The five footnotes have 1,513, 1,587, 1,636, 6,553 and 2,970 ink pixels. The gap between संप्रोत०; and संप्राप्तकन्थासखः is inside footnote 4 and is not a split.

A 93-pixel smudge left of footnote numeral १ (x 171–187) is unlabeled. The slanted footnote separator is labeled separator.

Each passage is shown in its own color, with separators in black.

![Proposed passage reference, PDF page 97 / 252](references/kale-1913-page-097/review.png)

### Methods 033 and 034 — GPT-6.1 Terra without reasoning and GPT-6 Astra low reasoning + line ownership and polygon regions

**Methods:** [033-gpt-6.1-terra-none-line-polygons](methods/033-gpt-6.1-terra-none-line-polygons/README.md) and [034-gpt-6-astra-low-line-polygons](methods/034-gpt-6-astra-low-line-polygons/README.md).

**Input:** [kale-1913-page-097](inputs/kale-1913-page-097.png); unchanged RGB rendering at 300 dpi, 1374 × 2114 pixels.

**Source results:** [025 — GPT-6.1 Terra without reasoning, individual footnotes](methods/025-gpt-6.1-terra-none-footnotes/README.md) and [020 — GPT-6 Astra low reasoning, individual footnotes](methods/020-gpt-6-astra-low-footnotes/README.md). Their page-97 `regions.json` files are used unchanged; no new API call was made.

**Settings:** Local processing only. Method 032's hysteresis ink mask and line finder, copied unchanged. Each line goes whole to the model box holding the largest share of its ink, if that share is at least 25%. A box narrower than 90% of a line's extent and holding at least half of its own line ink on that line is line-local. Line-local boxes claim the components with at least half their pixels inside, smallest box first. Another box may then claim the unclaimed remainder it holds, if that is at least 25% of the line's ink. Anything left joins the claimed component with the smallest horizontal edge-to-edge gap on the line. Components more than 1 character height outside their owner's box and more than 2 character heights from the rest of their line stay unassigned. Outlines come from a nearest-ink partition, in which owned ink and separators (rules and large non-text) are sites. Each region is its cell clipped to a rectangle at the page text angle around its own ink, padded by 0.25 character heights, and lines are outlined the same way within their region. Rings are simplified with Douglas–Peucker at 1 px.

**Reference:** the proposed page-97 reference above, which has not yet been reviewed by a person.

**Run:** 2026-11-04 15:49:42 UTC (033), 15:49:48 UTC (034); reference evaluation 15:50:03 UTC.

| Measurement | Method 033 (Terra boxes) | Method 034 (Astra boxes) |
| --- | --- | --- |
| Lines: whole / split between regions / uncovered | 26 / 2 / 0 | identical |
| Outlier marks dropped | 0 | identical |
| Unassigned text pixels | 0 | identical |
| Polygon vertices, all regions | 533 | identical |
| Whitespace pixels inside two adjacent outlines | 88, with no ink | identical |
| Local time: ink and lines / ownership / outlines | 0.64 s / 0.01 s / 0.51 s | similar |
| API calls | 0 | 0 |

Against the reference, summed over kept passages: other passages' ink inside each passage's matched region / own ink outside it / separator pixels inside it.

| Result | Other passages' ink | Own ink left out | Separator pixels |
| --- | ---: | ---: | ---: |
| GPT-6.1 Terra without reasoning (025), boxes as returned | 0 | 0 | 44 |
| GPT-6.1 Terra without reasoning + line ownership polygons (033) | 0 | 0 | 0 |
| GPT-6 Astra low reasoning (020), boxes as returned | 0 | 0 | 1 |
| GPT-6 Astra low reasoning + line ownership polygons (034) | 0 | 0 | 0 |

Both models' boxes already separate every passage on this page; the only remaining issue was separator pixels inside boxes, which the polygons exclude. The split lines are line 0 and footnote line 26; footnote 6 has line 27 to itself. Terra and Astra boxes lead to identical line ownership.

![GPT-6.1 Terra without reasoning + line ownership and polygon regions, PDF page 97 / 252](outputs/kale-1913-page-097/033-gpt-6.1-terra-none-line-polygons/overlay.png)

![Boxes as returned and line ownership polygons against the proposed reference, PDF page 97 / 252](outputs/kale-1913-page-097/033-gpt-6.1-terra-none-line-polygons/reference-evaluation/comparison.png)

## Kale (1913), PDF page 113 / 252


### Method 017 — Gemini 4 Argon low thinking, individual footnotes, native coordinates

**Method:** [017-gemini-4-argon-low-native](methods/017-gemini-4-argon-low-native/README.md).

**Input:** [kale-1913-page-113](inputs/kale-1913-page-113.png); unchanged RGB rendering at 300 dpi, 1370 × 2118 pixels.

**Settings:** Requested and returned model `gemini-4-argon`; thinking level `low`; image resolution `high`; JSON Schema output; maximum 16,384 output tokens including thinking; standard service tier; `store=false`. One synchronous request with automatic retries disabled.

**Footnote instruction:**

> Return one region per numbered footnote, including its marker and text. Separate neighboring footnotes even when they share a printed line.

**Coordinates:** Returned [ymin,xmin,ymax,xmax] integer coordinates normalized to 0–1000, mechanically reordered to [xmin,ymin,xmax,ymax] and scaled by x × 1370 / 1000 and y × 2118 / 1000. Original arrays are preserved. No coordinate clamping was applied.


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

![Gemini 4 Argon low thinking, individual footnotes, native coordinates, PDF page 113 / 252](outputs/kale-1913-page-113/017-gemini-4-argon-low-native/overlay.png)

![Gemini 4 Argon low thinking, individual footnotes, native coordinates, enlarged boundary inspection, PDF page 113 / 252](outputs/kale-1913-page-113/017-gemini-4-argon-low-native/separator-review/details.png)



### Method 018 — Gemini 3.8 Flash low thinking, individual footnotes, native coordinates

**Method:** [018-gemini-3.8-flash-low-native](methods/018-gemini-3.8-flash-low-native/README.md).

**Input:** [kale-1913-page-113](inputs/kale-1913-page-113.png); unchanged RGB rendering at 300 dpi, 1370 × 2118 pixels.

**Settings:** Requested and returned model `gemini-3.8-flash`; thinking level `low`; image resolution `high`; JSON Schema output; maximum 16,384 output tokens including thinking; standard service tier; `store=false`. One synchronous request with automatic retries disabled.

**Footnote instruction:**

> Return one region per numbered footnote, including its marker and text. Separate neighboring footnotes even when they share a printed line.

**Coordinates:** Returned [ymin,xmin,ymax,xmax] integer coordinates normalized to 0–1000, mechanically reordered to [xmin,ymin,xmax,ymax] and scaled by x × 1370 / 1000 and y × 2118 / 1000. Original arrays are preserved. No coordinate clamping was applied.


**Run:** 2026-11-04 06:00:30 UTC.

| Measurement | Result |
| --- | --- |
| Output boxes | 14 |
| Boxes marked keep=true | 12 |
| Regions marked uncertain | 0 |
| Footnote regions | 6 |
| Unique text components cut by kept crop edges | 63 |
| Overlapping kept-box pairs containing text | 5 |
| Detected separator pixels inside kept boxes | 337 |
| API wall time | 5.90 s |
| Input tokens | 1,379 |
| Text output tokens | 602 |
| Thinking tokens | 0 |
| Output tokens, including thinking | 602 |
| Cached input tokens | 0 |
| Coordinate clamping adjustments | 0 |
| Estimated paid-tier API cost | $0.00329175 |

The estimated paid-tier cost uses $0.75 per million input tokens and $3.75 per million output tokens including thinking: (1,379 × $0.75 + 602 × $3.75) / 1,000,000 = $0.00329175. Rates checked on 2026-11-03.

The audit uses grayscale <175, speckle and margin filtering, and the same automatic thin-line separator detector for all compared results. It counts connected text components crossing individual kept crop edges, kept-box overlaps containing text-mask pixels, and detected separator pixels inside kept boxes. A cut can belong to text from a neighboring passage that enters a crop.

Returned region types: 1 page number, 1 running header, 3 verse, 3 commentary, 6 footnote.

Three four-line verse groups, three commentary passages and six individual footnotes are returned. Neighboring body boxes overlap at five transitions, with text in each intersection. Several crop edges pass through upper or lower glyph parts. The audit records 63 cut text components.

The full-page overlay marks kept boxes blue and excluded page furniture purple. Red marks uncovered pixels from the method's analysis mask. The enlarged inspection marks text-mask pixels cut by individual crops in red.

![Gemini 3.8 Flash low thinking, individual footnotes, native coordinates, PDF page 113 / 252](outputs/kale-1913-page-113/018-gemini-3.8-flash-low-native/overlay.png)

![Gemini 3.8 Flash low thinking, individual footnotes, native coordinates, enlarged boundary inspection, PDF page 113 / 252](outputs/kale-1913-page-113/018-gemini-3.8-flash-low-native/separator-review/details.png)



### Method 020 — GPT-6 Astra low reasoning, individual footnotes

**Method:** [020-gpt-6-astra-low-footnotes](methods/020-gpt-6-astra-low-footnotes/README.md).

**Input:** [kale-1913-page-113](inputs/kale-1913-page-113.png); unchanged RGB rendering at 300 dpi, 1370 × 2118 pixels.

**Settings:** Requested and returned model `gpt-6-astra`; reasoning effort `low`; image detail `original`; strict JSON Schema output; maximum 16,384 output tokens including reasoning; returned service tier `default`; `store=false`. One synchronous request with automatic retries disabled.

**Footnote instruction:**

> Return one region per numbered footnote, including its marker and text. Separate neighboring footnotes even when they share a printed line.

**Coordinates:** Returned [xmin,ymin,xmax,ymax] integer coordinates normalized to 0–1000, scaled by x × 1370 / 1000 and y × 2118 / 1000. Original arrays are preserved. No coordinate clamping was applied.


**Run:** 2026-11-04 05:59:23 UTC.

| Measurement | Result |
| --- | --- |
| Output boxes | 14 |
| Boxes marked keep=true | 12 |
| Regions marked uncertain | 0 |
| Footnote regions | 6 |
| Unique text components cut by kept crop edges | 33 |
| Overlapping kept-box pairs containing text | 5 |
| Detected separator pixels inside kept boxes | 479 |
| API wall time | 11.94 s |
| Input tokens | 3,852 |
| Ordinary input tokens | 3 |
| Cache-write input tokens, default 30-minute lifetime | 3,849 |
| Cache-read input tokens | 0 |
| Output tokens, including reasoning | 458 |
| Reasoning tokens | 0 |
| Coordinate clamping adjustments | 0 |
| Estimated paid-tier API cost | $0.0710425 |

The estimated paid-tier cost uses $10 per million ordinary input tokens, $12.5 per million default 30-minute cache-write tokens, $1 per million cache-read tokens and $50 per million output tokens including reasoning: (3 × $10 + 3,849 × $12.5 + 0 × $1 + 458 × $50) / 1,000,000 = $0.0710425. Rates checked on 2026-11-03.

The audit uses grayscale <175, speckle and margin filtering, and the same automatic thin-line separator detector for all compared results. It counts connected text components crossing individual kept crop edges, kept-box overlaps containing text-mask pixels, and detected separator pixels inside kept boxes. A cut can belong to text from a neighboring passage that enters a crop.

Returned region types: 1 page number, 1 running header, 3 verse, 3 commentary, 6 footnote.

Three four-line verse groups, three commentary passages and six individual footnotes are returned. Neighboring body boxes overlap at five transitions, with text in each intersection. Several crop edges pass through upper or lower glyph parts. The audit records 33 cut text components.

The full-page overlay marks kept boxes blue and excluded page furniture purple. Red marks uncovered pixels from the method's analysis mask. The enlarged inspection marks text-mask pixels cut by individual crops in red.

![GPT-6 Astra low reasoning, individual footnotes, PDF page 113 / 252](outputs/kale-1913-page-113/020-gpt-6-astra-low-footnotes/overlay.png)

![GPT-6 Astra low reasoning, individual footnotes, enlarged boundary inspection, PDF page 113 / 252](outputs/kale-1913-page-113/020-gpt-6-astra-low-footnotes/separator-review/details.png)



### Method 025 — GPT-6.1 Terra without reasoning, individual footnotes

**Method:** [025-gpt-6.1-terra-none-footnotes](methods/025-gpt-6.1-terra-none-footnotes/README.md).

**Input:** [kale-1913-page-113](inputs/kale-1913-page-113.png); unchanged RGB rendering at 300 dpi, 1370 × 2118 pixels.

**Settings:** Requested and returned model `gpt-6.1-terra`; reasoning effort `none`; image detail `original`; strict JSON Schema output; maximum 16,384 output tokens including reasoning; returned service tier `default`; `store=false`. One synchronous request with automatic retries disabled.

**Footnote instruction:**

> Return one region per numbered footnote, including its marker and text. Separate neighboring footnotes even when they share a printed line.

**Coordinates:** Returned [xmin,ymin,xmax,ymax] integer coordinates normalized to 0–1000, scaled by x × 1370 / 1000 and y × 2118 / 1000. Original arrays are preserved. No coordinate clamping was applied.


**Run:** 2026-11-04 05:59:36 UTC.

| Measurement | Result |
| --- | --- |
| Output boxes | 14 |
| Boxes marked keep=true | 12 |
| Regions marked uncertain | 0 |
| Footnote regions | 6 |
| Unique text components cut by kept crop edges | 24 |
| Overlapping kept-box pairs containing text | 5 |
| Detected separator pixels inside kept boxes | 368 |
| API wall time | 7.00 s |
| Input tokens | 3,852 |
| Ordinary input tokens | 3 |
| Cache-write input tokens, default 30-minute lifetime | 3,849 |
| Cache-read input tokens | 0 |
| Output tokens, including reasoning | 458 |
| Reasoning tokens | 0 |
| Coordinate clamping adjustments | 0 |
| Estimated paid-tier API cost | $0.00710425 |

The estimated paid-tier cost uses $1 per million ordinary input tokens, $1.25 per million default 30-minute cache-write tokens, $0.05 per million cache-read tokens and $5 per million output tokens including reasoning: (3 × $1 + 3,849 × $1.25 + 0 × $0.05 + 458 × $5) / 1,000,000 = $0.00710425. Rates checked on 2026-11-03.

The audit uses grayscale <175, speckle and margin filtering, and the same automatic thin-line separator detector for all compared results. It counts connected text components crossing individual kept crop edges, kept-box overlaps containing text-mask pixels, and detected separator pixels inside kept boxes. A cut can belong to text from a neighboring passage that enters a crop.

Returned region types: 1 page number, 1 running header, 3 verse, 3 commentary, 6 footnote.

Three four-line verse groups, three commentary passages and six individual footnotes are returned. Neighboring body boxes overlap at five transitions, with text in each intersection. Several crop edges pass through upper or lower glyph parts. The audit records 24 cut text components.

The full-page overlay marks kept boxes blue and excluded page furniture purple. Red marks uncovered pixels from the method's analysis mask. The enlarged inspection marks text-mask pixels cut by individual crops in red.

![GPT-6.1 Terra without reasoning, individual footnotes, PDF page 113 / 252](outputs/kale-1913-page-113/025-gpt-6.1-terra-none-footnotes/overlay.png)

![GPT-6.1 Terra without reasoning, individual footnotes, enlarged boundary inspection, PDF page 113 / 252](outputs/kale-1913-page-113/025-gpt-6.1-terra-none-footnotes/separator-review/details.png)



### Method 028 — Gemini 4 Argon low thinking, explicit crop padding

**Method:** [028-gemini-4-argon-low-padded-prompt](methods/028-gemini-4-argon-low-padded-prompt/README.md).

**Input:** [kale-1913-page-113](inputs/kale-1913-page-113.png); unchanged RGB rendering at 300 dpi, 1370 × 2118 pixels.

**Settings:** Requested and returned model `gemini-4-argon`; thinking level `low`; image resolution `high`; JSON Schema output; maximum 16,384 output tokens including thinking; standard service tier; `store=false`. One synchronous request with automatic retries disabled.

**Footnote instruction:**

> Return one region per numbered footnote, including its marker and text. Separate neighboring footnotes even when they share a printed line.

**Padding instruction:** The prompt explicitly requests complete glyphs, a white margin and an edge inspection before returning the boxes.

> Leave a visible white margin of at least 5 normalized x units on the left and right and 3 normalized y units above and below the outermost ink (about seven original-image pixels per axis on this page). Reduce this margin only where it would include a neighboring text block or footnote, or a separator rule. Keep each footnote separate.

**Coordinates:** Returned [ymin,xmin,ymax,xmax] integer coordinates normalized to 0–1000, mechanically reordered to [xmin,ymin,xmax,ymax] and scaled by x × 1370 / 1000 and y × 2118 / 1000. Original arrays are preserved. No coordinate clamping was applied.


**Run:** 2026-11-04 05:59:44 UTC.

| Measurement | Result |
| --- | --- |
| Output boxes | 14 |
| Boxes marked keep=true | 12 |
| Regions marked uncertain | 0 |
| Footnote regions | 6 |
| Unique text components cut by kept crop edges | 53 |
| Overlapping kept-box pairs containing text | 5 |
| Detected separator pixels inside kept boxes | 2161 |
| API wall time | 12.82 s |
| Input tokens | 1,920 |
| Text output tokens | 614 |
| Thinking tokens | 0 |
| Output tokens, including thinking | 614 |
| Cached input tokens | 0 |
| Coordinate clamping adjustments | 0 |
| Estimated paid-tier API cost | $0.00998 |

The estimated paid-tier cost uses $2 per million input tokens and $10 per million output tokens including thinking: (1,920 × $2 + 614 × $10) / 1,000,000 = $0.00998. Rates checked on 2026-11-03.

The audit uses grayscale <175, speckle and margin filtering, and the same automatic thin-line separator detector for all compared results. It counts connected text components crossing individual kept crop edges, kept-box overlaps containing text-mask pixels, and detected separator pixels inside kept boxes. A cut can belong to text from a neighboring passage that enters a crop.

Returned region types: 1 page number, 1 running header, 3 verse, 3 commentary, 6 footnote.

Three four-line verse groups, three commentary passages and six individual footnotes are returned. Neighboring body boxes overlap at five transitions, with text in each intersection. Several crop edges pass through upper or lower glyph parts. The audit records 53 cut text components.

The full-page overlay marks kept boxes blue and excluded page furniture purple. Red marks uncovered pixels from the method's analysis mask. The enlarged inspection marks text-mask pixels cut by individual crops in red.

![Gemini 4 Argon low thinking, explicit crop padding, PDF page 113 / 252](outputs/kale-1913-page-113/028-gemini-4-argon-low-padded-prompt/overlay.png)

![Gemini 4 Argon low thinking, explicit crop padding, enlarged boundary inspection, PDF page 113 / 252](outputs/kale-1913-page-113/028-gemini-4-argon-low-padded-prompt/separator-review/details.png)



### Method 029 — Gemini 3.8 Flash low thinking, explicit crop padding

**Method:** [029-gemini-3.8-flash-low-padded-prompt](methods/029-gemini-3.8-flash-low-padded-prompt/README.md).

**Input:** [kale-1913-page-113](inputs/kale-1913-page-113.png); unchanged RGB rendering at 300 dpi, 1370 × 2118 pixels.

**Settings:** Requested and returned model `gemini-3.8-flash`; thinking level `low`; image resolution `high`; JSON Schema output; maximum 16,384 output tokens including thinking; standard service tier; `store=false`. One synchronous request with automatic retries disabled.

**Footnote instruction:**

> Return one region per numbered footnote, including its marker and text. Separate neighboring footnotes even when they share a printed line.

**Padding instruction:** The prompt explicitly requests complete glyphs, a white margin and an edge inspection before returning the boxes.

> Leave a visible white margin of at least 5 normalized x units on the left and right and 3 normalized y units above and below the outermost ink (about seven original-image pixels per axis on this page). Reduce this margin only where it would include a neighboring text block or footnote, or a separator rule. Keep each footnote separate.

**Coordinates:** Returned [ymin,xmin,ymax,xmax] integer coordinates normalized to 0–1000, mechanically reordered to [xmin,ymin,xmax,ymax] and scaled by x × 1370 / 1000 and y × 2118 / 1000. Original arrays are preserved. No coordinate clamping was applied.


**Run:** 2026-11-04 05:59:58 UTC.

| Measurement | Result |
| --- | --- |
| Output boxes | 14 |
| Boxes marked keep=true | 12 |
| Regions marked uncertain | 0 |
| Footnote regions | 6 |
| Unique text components cut by kept crop edges | 35 |
| Overlapping kept-box pairs containing text | 5 |
| Detected separator pixels inside kept boxes | 0 |
| API wall time | 6.27 s |
| Input tokens | 1,497 |
| Text output tokens | 604 |
| Thinking tokens | 0 |
| Output tokens, including thinking | 604 |
| Cached input tokens | 0 |
| Coordinate clamping adjustments | 0 |
| Estimated paid-tier API cost | $0.00338775 |

The estimated paid-tier cost uses $0.75 per million input tokens and $3.75 per million output tokens including thinking: (1,497 × $0.75 + 604 × $3.75) / 1,000,000 = $0.00338775. Rates checked on 2026-11-03.

The audit uses grayscale <175, speckle and margin filtering, and the same automatic thin-line separator detector for all compared results. It counts connected text components crossing individual kept crop edges, kept-box overlaps containing text-mask pixels, and detected separator pixels inside kept boxes. A cut can belong to text from a neighboring passage that enters a crop.

Returned region types: 1 page number, 1 running header, 3 verse, 3 commentary, 6 footnote.

Three four-line verse groups, three commentary passages and six individual footnotes are returned. Neighboring body boxes overlap at five transitions, with text in each intersection. Several crop edges pass through upper or lower glyph parts. The audit records 35 cut text components.

The full-page overlay marks kept boxes blue and excluded page furniture purple. Red marks uncovered pixels from the method's analysis mask. The enlarged inspection marks text-mask pixels cut by individual crops in red.

![Gemini 3.8 Flash low thinking, explicit crop padding, PDF page 113 / 252](outputs/kale-1913-page-113/029-gemini-3.8-flash-low-padded-prompt/overlay.png)

![Gemini 3.8 Flash low thinking, explicit crop padding, enlarged boundary inspection, PDF page 113 / 252](outputs/kale-1913-page-113/029-gemini-3.8-flash-low-padded-prompt/separator-review/details.png)



### Method 030 — Gemini 4 Argon low thinking + component completion, padding and slanted-separator handling

**Method:** [030-gemini-4-argon-low-slanted-refinement](methods/030-gemini-4-argon-low-slanted-refinement/README.md).

**Input:** [kale-1913-page-113](inputs/kale-1913-page-113.png); unchanged RGB rendering at 300 dpi, 1370 × 2118 pixels.

**Source method:** [017-gemini-4-argon-low-native](methods/017-gemini-4-argon-low-native/README.md), applied to the identical raw image.

**Settings:** Complete assigned foreground components within ceil(1.5% of width) horizontally and ceil(1.2% of height) vertically; request ceil(0.5% of width) horizontal and ceil(0.3% of height) vertical padding. Keep source region count, types, keep flags, reading order and uncertainty flags.

**Separator handling:** Detect near-straight thin components from source pixels: width at least max(80 pixels, 8% of image width), aspect ratio at least 10, height at most 5% of image height, at least 95% filled columns, median column thickness at most max(3 pixels, 0.3% of image height), maximum thickness at most twice that, absolute line slope at most 0.05 and 95th-percentile fit residual at most max(1.5 pixels, 0.15% of image height). Exclude accepted line pixels from component ownership. Limit crop edges to their local line envelope, requesting a one-pixel gap. Original whitespace and separator inclusion can be reduced while preserving owned text and all text-mask pixels originally inside each source box.

**Coordinates:** Final integer [xmin,ymin,xmax,ymax] pixel rectangles, with exclusive right and bottom edges. Original model coordinates are preserved.


**Run:** 2026-11-04 06:05:34 UTC.

| Measurement | Result |
| --- | --- |
| Output boxes | 14 |
| Boxes marked keep=true | 12 |
| Regions marked uncertain | 0 |
| Footnote regions | 6 |
| Unique text components cut by kept crop edges | 88 |
| Overlapping kept-box pairs containing text | 5 |
| Detected separator pixels inside kept boxes | 0 |
| Source text components cut by kept crop edges | 45 |
| Detected separator fragments | 2 |
| Regions constrained by separators | 6 |
| Requested padding per axis | 7 × 7 pixels |
| Ambiguous component assignments | 4 |
| Completed rectangle overlap warnings | 5 |
| Local refinement time | 0.0367 s |
| Local total before file writes | 0.1748 s |
| Additional API calls | 0 |
| Estimated source API cost | $0.009722 |
| Additional API cost | $0 |

The local step uses the saved source boxes. Its additional API cost is $0; the previously recorded source request is estimated at $0.009722.

The audit uses grayscale <175, speckle and margin filtering, and the same automatic thin-line separator detector for all compared results. It counts connected text components crossing individual kept crop edges, kept-box overlaps containing text-mask pixels, and detected separator pixels inside kept boxes. A cut can belong to text from a neighboring passage that enters a crop.

Returned region types: 1 page number, 1 running header, 3 verse, 3 commentary, 6 footnote.

The detected separator stays outside every kept box, and source labels and reading order are retained. Padding extends into neighboring text at existing body-box overlaps. The audit records 88 cut text components and 5 overlaps containing text. The output retains 4 ambiguous component assignments and 5 completed-rectangle overlap warnings for inspection. Source text-mask pixels remain enclosed.

The full-page overlay marks kept boxes blue and excluded page furniture purple. Red marks uncovered pixels from the method's analysis mask. The enlarged inspection marks text-mask pixels cut by individual crops in red.

![Gemini 4 Argon low thinking + component completion, padding and slanted-separator handling, PDF page 113 / 252](outputs/kale-1913-page-113/030-gemini-4-argon-low-slanted-refinement/overlay.png)

![Gemini 4 Argon low thinking + component completion, padding and slanted-separator handling, enlarged boundary inspection, PDF page 113 / 252](outputs/kale-1913-page-113/030-gemini-4-argon-low-slanted-refinement/separator-review/details.png)



### Method 031 — Gemini 3.8 Flash low thinking + component completion, padding and slanted-separator handling

**Method:** [031-gemini-3.8-flash-low-slanted-refinement](methods/031-gemini-3.8-flash-low-slanted-refinement/README.md).

**Input:** [kale-1913-page-113](inputs/kale-1913-page-113.png); unchanged RGB rendering at 300 dpi, 1370 × 2118 pixels.

**Source method:** [018-gemini-3.8-flash-low-native](methods/018-gemini-3.8-flash-low-native/README.md), applied to the identical raw image.

**Settings:** Complete assigned foreground components within ceil(1.5% of width) horizontally and ceil(1.2% of height) vertically; request ceil(0.5% of width) horizontal and ceil(0.3% of height) vertical padding. Keep source region count, types, keep flags, reading order and uncertainty flags.

**Separator handling:** Detect near-straight thin components from source pixels: width at least max(80 pixels, 8% of image width), aspect ratio at least 10, height at most 5% of image height, at least 95% filled columns, median column thickness at most max(3 pixels, 0.3% of image height), maximum thickness at most twice that, absolute line slope at most 0.05 and 95th-percentile fit residual at most max(1.5 pixels, 0.15% of image height). Exclude accepted line pixels from component ownership. Limit crop edges to their local line envelope, requesting a one-pixel gap. Original whitespace and separator inclusion can be reduced while preserving owned text and all text-mask pixels originally inside each source box.

**Coordinates:** Final integer [xmin,ymin,xmax,ymax] pixel rectangles, with exclusive right and bottom edges. Original model coordinates are preserved.


**Run:** 2026-11-04 06:05:35 UTC.

| Measurement | Result |
| --- | --- |
| Output boxes | 14 |
| Boxes marked keep=true | 12 |
| Regions marked uncertain | 0 |
| Footnote regions | 6 |
| Unique text components cut by kept crop edges | 119 |
| Overlapping kept-box pairs containing text | 5 |
| Detected separator pixels inside kept boxes | 0 |
| Source text components cut by kept crop edges | 63 |
| Detected separator fragments | 2 |
| Regions constrained by separators | 7 |
| Requested padding per axis | 7 × 7 pixels |
| Ambiguous component assignments | 10 |
| Completed rectangle overlap warnings | 5 |
| Local refinement time | 0.0363 s |
| Local total before file writes | 0.1823 s |
| Additional API calls | 0 |
| Estimated source API cost | $0.00329175 |
| Additional API cost | $0 |

The local step uses the saved source boxes. Its additional API cost is $0; the previously recorded source request is estimated at $0.00329175.

The audit uses grayscale <175, speckle and margin filtering, and the same automatic thin-line separator detector for all compared results. It counts connected text components crossing individual kept crop edges, kept-box overlaps containing text-mask pixels, and detected separator pixels inside kept boxes. A cut can belong to text from a neighboring passage that enters a crop.

Returned region types: 1 page number, 1 running header, 3 verse, 3 commentary, 6 footnote.

The detected separator stays outside every kept box, and source labels and reading order are retained. Padding extends into neighboring text at existing body-box overlaps. The audit records 119 cut text components and 5 overlaps containing text. The output retains 10 ambiguous component assignments and 5 completed-rectangle overlap warnings for inspection. Source text-mask pixels remain enclosed.

The full-page overlay marks kept boxes blue and excluded page furniture purple. Red marks uncovered pixels from the method's analysis mask. The enlarged inspection marks text-mask pixels cut by individual crops in red.

![Gemini 3.8 Flash low thinking + component completion, padding and slanted-separator handling, PDF page 113 / 252](outputs/kale-1913-page-113/031-gemini-3.8-flash-low-slanted-refinement/overlay.png)

![Gemini 3.8 Flash low thinking + component completion, padding and slanted-separator handling, enlarged boundary inspection, PDF page 113 / 252](outputs/kale-1913-page-113/031-gemini-3.8-flash-low-slanted-refinement/separator-review/details.png)


### Method 032 — Text-line skew, curvature and boundary separability

**Method:** [032-line-skew-separability](methods/032-line-skew-separability/README.md).

**Input:** [kale-1913-page-113](inputs/kale-1913-page-113.png); unchanged RGB rendering at 300 dpi, 1370 × 2118 pixels.

**Settings:** Local measurement only; no API call and no image resampling (rotations act on pixel coordinates). Hysteresis ink mask: strong ink at or below the Otsu threshold, weak ink darker than the midpoint between that threshold and white, kept when connected to strong ink; specks below max(4 px, page area × 5e-7, (0.1 × character height)²) removed; thin long components classed as rules and components taller than 3 character heights or wider than 60% of the page classed as large non-text. Page text angle by projection-profile sharpness over ±6° (0.1° then 0.01° steps). Lines from main components (0.55–2.2 character heights) split at rotated-center gaps above 0.35 character heights, with detached marks joined to the nearest line within 1.2 character heights. Per-line angle and bow from segment row-profile cross-correlation on lines at least 60% of the column width and 10 character heights long. Bow is positive when the middle of a line is higher than its ends.

Consecutive lines in a column are tested with four boundary representations: tight axis-aligned rectangles; tight rectangles at the page text angle; a straight cut at any angle within ±6°; and a per-column staircase cut. Two pixels conflict when their centers are less than one pixel apart in the tested direction.

**Run:** 2026-11-04 07:09:04 UTC.

| Measurement | Result |
| --- | --- |
| Page text angle | −1.43° |
| Character height | 40 px |
| Lines | 30, of which 27 long |
| Long-line angles, excluding line 0 | −1.69° to −1.14°, median −1.46° |
| Long-line bow, excluding line 0 | +0.4 to +4.1 px, median 2.2 px |
| Detected short centered rule angle | −1.09° |
| Unassigned text components | 3 (two dots and the dark mark at the bottom edge) |
| Components touching two lines | 0 |
| Line pairs tested | 29 |
| Not separable by tight axis-aligned rectangles | 26 |
| Not separable by tight rectangles at the page angle | 17 |
| Not separable by any straight cut | 12 |
| Not separable by a staircase cut | 0 |
| Smallest per-column gap between adjacent lines | 4 px |
| API calls | 0 |

Text lines are rotated by about −1.4°, steeper than the separator angles previously measured (−1.19° for the long rule, −1.09° for the short rule). Lines also bend slightly: in commentary 42 the leftmost segment of each line sits about 4–6 px lower than the rest of the line, and on other long lines about 2.5 px or less. Only 3 of 29 adjacent line pairs can be separated by tight axis-aligned rectangles; rectangles at the page angle separate 12. Every pair has a clear per-column gap of at least 4 px, so the inter-line whitespace exists but is not straight. Line 0 combines the page number with the running header; its fitted angle (−2.18°) and bow (13 px) are not a real line shape.

Lines are drawn in cycling colors, rules black and unassigned text light gray. The square left of each line pair shows the most constrained representation that separates it: light gray axis-aligned rectangle, orange rectangle at the page angle, red straight cut at another angle, purple staircase only.

![Text-line skew, curvature and boundary separability, PDF page 113 / 252](outputs/kale-1913-page-113/032-line-skew-separability/lines.png)


### Method 032 — Text-line skew, curvature and boundary separability: passage boundaries against a proposed reference

**Method:** [032-line-skew-separability](methods/032-line-skew-separability/README.md), `evaluate.py`.

**Input:** [kale-1913-page-113](inputs/kale-1913-page-113.png); unchanged RGB rendering at 300 dpi, 1370 × 2118 pixels.

**Reference:** [references/kale-1913-page-113](references/kale-1913-page-113/README.md), a component-level passage assignment proposed by Claude from the method 032 lines and not yet human-reviewed at the time of this run. It labels page number, running header, verses 42–44, three commentary passages, footnotes 1–6 and two rules.

**Review, 2026-11-04, after this run:** The user inspected `review.png` and confirmed that every label is correct. The reference files and the numbers below are unchanged.

**Saved results compared:** [020 — GPT-6 Astra low reasoning, individual footnotes](methods/020-gpt-6-astra-low-footnotes/README.md) and [025 — GPT-6.1 Terra without reasoning, individual footnotes](methods/025-gpt-6.1-terra-none-footnotes/README.md), page-113 `regions.json` unchanged; no new API call.

**Settings:** For each kept passage, other passages' ink inside the tight rectangle around all its own ink, for axis-aligned rectangles, rectangles at the page text angle (−1.43°) and the best single angle per passage (0.05° steps within ±6°). For each adjacent pair, the four separability tests and the best placement of one shared edge with the other edges tight, scored as own ink left out plus other ink included. Model boxes are scored the same way, overall and at each boundary.

**Run:** 2026-11-04 07:09 UTC.

| Measurement | Result |
| --- | --- |
| Other passages' ink inside tight axis-aligned rectangles, summed over 12 kept passages | 3,966 px |
| The same at the page text angle | 614 px |
| The same at the best single angle per passage | 283 px |
| GPT-6.1 Terra without reasoning: other passages' ink inside its boxes | 3,053 px |
| GPT-6.1 Terra without reasoning: own ink left outside its boxes | 210 px |
| GPT-6.1 Terra without reasoning: separator pixels inside its boxes | 378 px |
| GPT-6 Astra low reasoning: other passages' ink inside its boxes | 3,930 px |
| GPT-6 Astra low reasoning: own ink left outside its boxes | 94 px |
| GPT-6 Astra low reasoning: separator pixels inside its boxes | 491 px |
| Passages without a matching box, either result | 0 |
| API calls | 0 |

Best single-edge cost, in pixels of own ink left out plus other ink included. Each pair of numbers is the upper box's bottom edge, then the lower box's top edge.

| Boundary | Best axis-aligned | Best at page angle | GPT-6.1 Terra without reasoning | GPT-6 Astra low reasoning | Straight cut at any angle | Smallest per-column gap |
| --- | --- | --- | --- | --- | --- | ---: |
| verse 42 / commentary 42 | 522 / 564 | 67 / 67 | 601 / 1,141 | 1,644 / 905 | no, −5.8 px margin | 10 px |
| commentary 42 / verse 43 | 172 / 60 | 0 / 0 | 334 / 84 | 243 / 60 | yes | 15 px |
| verse 43 / commentary 43 | 0 / 0 | 19 / 19 | 36 / 173 | 7 / 337 | yes, 1.0 px margin | 7 px |
| commentary 43 / verse 44 | 46 / 24 | 0 / 0 | 201 / 50 | 66 / 25 | yes | 12 px |
| verse 44 / commentary 44 | 182 / 258 | 10 / 10 | 342 / 301 | 217 / 520 | no, 0.85 px margin | 13 px |

Commentary 44 / footnotes and all five boundaries between neighboring footnotes are separable by tight axis-aligned rectangles.

Four of the five verse/commentary boundaries cannot be drawn with axis-aligned rectangles without some ink of the neighboring passage, whatever the coordinates. Rectangles at the page angle remove about 85% of the unavoidable inclusion and make two of those four boundaries clean; verse 42 / commentary 42 and verse 44 / commentary 44 still need a non-straight boundary. Verse 43 / commentary 43 is separable by axis-aligned rectangles, yet both models' commentary-43 boxes include verse-43 ink: 173 px for GPT-6.1 Terra without reasoning and 337 px for GPT-6 Astra low reasoning. At the other boundaries the model edges cost between 1.0 and 4.4 times the best achievable axis-aligned edge.

The first image shows tight axis-aligned rectangles (left) and tight rectangles at the page angle (right), with other passages' ink inside them in red. The boundary image compares tight axis-aligned rectangles, rectangles at the page angle and both saved results at 2x source pixels: red marks the other passage's ink inside a box, magenta a box's own ink outside it.

![Text-line skew, curvature and boundary separability, tight rectangles by representation, PDF page 113 / 252](outputs/kale-1913-page-113/032-line-skew-separability/passage-boundaries/representations.png)

![Text-line skew, curvature and boundary separability, verse 42 / commentary 42 boundary, PDF page 113 / 252](outputs/kale-1913-page-113/032-line-skew-separability/passage-boundaries/boundary-verse-42--commentary-42.png)

![Text-line skew, curvature and boundary separability, verse 43 / commentary 43 boundary, PDF page 113 / 252](outputs/kale-1913-page-113/032-line-skew-separability/passage-boundaries/boundary-verse-43--commentary-43.png)

![Proposed passage reference, PDF page 113 / 252](references/kale-1913-page-113/review.png)


### Methods 033 and 034 — GPT-6.1 Terra without reasoning and GPT-6 Astra low reasoning + line ownership and polygon regions

**Methods:** [033-gpt-6.1-terra-none-line-polygons](methods/033-gpt-6.1-terra-none-line-polygons/README.md) and [034-gpt-6-astra-low-line-polygons](methods/034-gpt-6-astra-low-line-polygons/README.md).

**Input:** [kale-1913-page-113](inputs/kale-1913-page-113.png); unchanged RGB rendering at 300 dpi, 1370 × 2118 pixels.

**Source results:** [025 — GPT-6.1 Terra without reasoning, individual footnotes](methods/025-gpt-6.1-terra-none-footnotes/README.md) and [020 — GPT-6 Astra low reasoning, individual footnotes](methods/020-gpt-6-astra-low-footnotes/README.md). Their page-113 `regions.json` files are used unchanged; no new API call was made.

**Settings:** Local processing only. Method 032's hysteresis ink mask and line finder, copied unchanged. Each line goes whole to the model box holding the largest share of its ink, if that share is at least 25%. A box narrower than 90% of a line's extent and holding at least half of its own line ink on that line is line-local. Line-local boxes claim the components with at least half their pixels inside, smallest box first. Another box may then claim the unclaimed remainder it holds, if that is at least 25% of the line's ink. Anything left joins the claimed component with the smallest horizontal edge-to-edge gap on the line. Components more than 1 character height outside their owner's box and more than 2 character heights from the rest of their line stay unassigned. Outlines come from a nearest-ink partition, in which owned ink and separators (rules and large non-text) are sites. Each region is its cell clipped to a rectangle at the page text angle around its own ink, padded by 0.25 character heights, and lines are outlined the same way within their region. Rings are simplified with Douglas–Peucker at 1 px.

**Reference:** [references/kale-1913-page-113](references/kale-1913-page-113/README.md), reviewed by the user on 2026-11-04 and confirmed correct.

**Run:** 2026-11-04 15:49:44 UTC (033), 15:49:50 UTC (034); reference evaluation 15:50:05 UTC.

| Measurement | Method 033 (Terra boxes) | Method 034 (Astra boxes) |
| --- | --- | --- |
| Lines: whole / split between regions / uncovered | 28 / 2 / 0 | identical |
| Outlier marks dropped | 0 | identical |
| Unassigned text pixels | 1,232 | identical |
| Polygon vertices, all regions | 857 | identical |
| Whitespace pixels inside two adjacent outlines | 166, with no ink | identical |
| Local time: ink and lines / ownership / outlines | 0.82 s / 0.01 s / 0.55 s | similar |
| API calls | 0 | 0 |

Against the reference, summed over kept passages: other passages' ink inside each passage's matched region / own ink outside it / separator pixels inside it.

| Result | Other passages' ink | Own ink left out | Separator pixels |
| --- | ---: | ---: | ---: |
| GPT-6.1 Terra without reasoning (025), boxes as returned | 3,053 | 210 | 378 |
| GPT-6.1 Terra without reasoning + line ownership polygons (033) | 0 | 0 | 0 |
| GPT-6 Astra low reasoning (020), boxes as returned | 3,930 | 94 | 491 |
| GPT-6 Astra low reasoning + line ownership polygons (034) | 0 | 0 | 0 |

The page text angle is −1.43°. Raw-box numbers match the method 032 passage evaluation. Each of the five verse/commentary boundaries has 0 pixels taken across it by the polygons. Taken across by the boxes (upper region taking lower ink / lower region taking upper ink):

| Boundary | Terra 025 boxes | Astra 020 boxes |
| --- | --- | --- |
| verse 42 / commentary 42 | 463 / 1,140 | 1,644 / 881 |
| commentary 42 / verse 43 | 334 / 84 | 240 / 40 |
| verse 43 / commentary 43 | 36 / 173 | 7 / 337 |
| commentary 43 / verse 44 | 201 / 50 | 66 / 25 |
| verse 44 / commentary 44 | 332 / 240 | 177 / 513 |

Most of the unassigned text is the dark mark at the bottom edge (1,186 px). The reference and the polygons use the same ink mask and line finder, so the zeros show that the model grouping plus line ownership reproduces the reviewed line-to-passage assignment; the line finder itself was checked by the user's review of the reference image.

The boundary image shows verse 42 / commentary 42 at source resolution for all four results.

![GPT-6.1 Terra without reasoning + line ownership and polygon regions, PDF page 113 / 252](outputs/kale-1913-page-113/033-gpt-6.1-terra-none-line-polygons/overlay.png)

![Line outlines, GPT-6.1 Terra without reasoning + line ownership and polygon regions, PDF page 113 / 252](outputs/kale-1913-page-113/033-gpt-6.1-terra-none-line-polygons/lines.png)

![Boxes as returned and line ownership polygons at the verse 42 / commentary 42 boundary, PDF page 113 / 252](outputs/kale-1913-page-113/033-gpt-6.1-terra-none-line-polygons/reference-evaluation/boundary-verse-42--commentary-42.png)

## Survey: all Kale (1913) pages and six other scanned books

### Method 032 — Text-line skew, curvature and boundary separability

**Method:** [032-line-skew-separability](methods/032-line-skew-separability/README.md), `survey.py` with `books.json`.

**Inputs:** All 252 pages of `Kale-1913-pp21-272.pdf`, and 12 pages sampled evenly between 10% and 90% of each of four other local scans: a Digital Library of India Telang edition of Bhartṛhari, the Vavilla edition with Rāmacandra Budhendra's commentary, and the 1896 and 1914 Google Books editions of the Nītiśataka, Śṛṅgāraśataka and Vairāgyaśataka. For M. N. Dutt's English Mahābhārata, the second page of 12 chapter files sampled the same way from the sorted file list. All four pages of F. N. Cole (1903) from the Bulletin of the AMS are also included. Each PDF's SHA-256 is in `summary.json`; no page image is saved.

**Settings:** Pages rendered with PyMuPDF 1.26.6 as grayscale without alpha at 300 dpi, or at the embedded page image's native resolution when lower (Telang: 1500 × 2500). Measurement settings as for the test pages above. Telang PDF page 50, a sideways table, is excluded from its summary after inspection.

**Run:** 2026-11-04 07:14:07–07:15:11 UTC.

| Book | Pages analyzed | Median abs. page angle | 90th percentile | Maximum | Pages ≥ 0.5° | Line pairs | Not separable: axis-aligned / page angle / any straight cut / staircase |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Kale (1913) | 252 of 252 | 0.06° | 0.34° | 1.43° | 18 | 7,349 | 18.3% / 17.2% / 10.8% / 0.1% |
| Telang, Digital Library of India | 11 of 12 | 0.01° | 0.10° | 0.15° | 0 | 301 | 15.0% / 15.3% / 12.0% / 0.0% |
| Vavilla, Rāmacandra Budhendra commentary | 12 of 12 | 0.01° | 0.10° | 0.24° | 0 | 108 | 17.6% / 18.5% / 17.6% / 0.0% |
| Nītiśataka etc., 1896 | 12 of 12 | 0.08° | 0.09° | 0.11° | 0 | 278 | 26.3% / 27.3% / 21.9% / 0.4% |
| Nītiśataka etc., 1914 | 12 of 12 | 0.03° | 0.10° | 0.33° | 0 | 254 | 48.8% / 49.6% / 43.3% / 0.4% |
| Dutt, Mahābhārata | 12 of 12 | 0.08° | 0.11° | 0.19° | 0 | 922 | 1.5% / 1.5% / 0.2% / 0.0% |
| Cole (1903) | 4 of 4 | 0.01° | 0.01° | 0.01° | 0 | 130 | 13.1% / 13.8% / 12.3% / 0.0% |

In Kale, page 113 has the largest absolute text angle of all 252 pages. The other pages at or above 1° are 146 (+1.20°), 58 (−1.15°) and 246 (+1.06°). On the 18 Kale pages at 0.5° or more, line pairs not separable by axis-aligned rectangles fall from 48.3% to 23.2% at the page angle, and conflicts larger than a quarter character-height square fall from 22.2% to 5.3%. On the other 234 Kale pages the axis-aligned and page-angle rates are 15.9% and 16.8%, with 5.0% and 4.9% above a quarter character-height square.

None of the sampled pages from the other books reaches 0.5°. Their non-separable rates are almost unchanged by rotation, so they come from marks above and below tightly set lines rather than skew. The two-column Dutt pages, with wide leading, are nearly all separable. A staircase boundary separates at least 99.5% of line pairs in every book.

The 1914 edition's pages have a border of small repeated ornaments that the line segmentation attaches to text lines (visible at the page edges in its contact sheet), so its line-pair rates are not reliable. Its page angles are unaffected.

Each contact sheet shows six sampled pages with the line overlay described for the test pages.

![Text-line skew, curvature and boundary separability, Kale (1913) sampled pages](outputs/surveys/032-line-skew-separability/kale-1913-contact.png)

![Text-line skew, curvature and boundary separability, Telang, Digital Library of India, sampled pages](outputs/surveys/032-line-skew-separability/telang-dli-contact.png)

![Text-line skew, curvature and boundary separability, Vavilla, sampled pages](outputs/surveys/032-line-skew-separability/vavilla-contact.png)

![Text-line skew, curvature and boundary separability, Nītiśataka etc. 1896, sampled pages](outputs/surveys/032-line-skew-separability/gopinath-1896-contact.png)

![Text-line skew, curvature and boundary separability, Nītiśataka etc. 1914, sampled pages](outputs/surveys/032-line-skew-separability/gopinath-1914-contact.png)

![Text-line skew, curvature and boundary separability, Dutt Mahābhārata, sampled chapter pages](outputs/surveys/032-line-skew-separability/dutt-mahabharata-contact.png)

![Text-line skew, curvature and boundary separability, Cole (1903), all pages](outputs/surveys/032-line-skew-separability/cole-1903-contact.png)


## Robustness of line ownership: saved model results and perturbed boxes

### Method 033 — GPT-6.1 Terra without reasoning + line ownership and polygon regions: robustness sweep

**Method:** [033-gpt-6.1-terra-none-line-polygons](methods/033-gpt-6.1-terra-none-line-polygons/README.md), `sweep.py`.

**Inputs:** Kale (1913) PDF pages 17, 97 and 113 with their passage references. Page 113's was reviewed by the user; pages 17 and 97 are proposed. The inputs are every saved box result under `outputs/<page>/`: 25 on page 17, 10 on page 97 and 8 on page 113. They come from earlier methods, including results whose prompts did not ask for individual footnotes. No API call was made.

**Settings:** Method 033's settings, applied in memory to each source's boxes; no method outputs are written for the other sources. Ownership errors count reference ink owned by anything other than the region owning most of that passage's ink. A region that owns most of several kept passages is reported as a merge, which reflects the source's grouping. For the perturbation, Terra 025's boxes were changed in three ways: each edge moved independently by a uniform amount (20 trials per size, generator seed 20261104), all boxes shifted together, and all coordinates scaled about the page center. Character height is 40 px on pages 17 and 113 and 43 px on page 97.

**Run:** 2026-11-04 15:50:05–15:51:15 UTC. Output: `outputs/surveys/033-gpt-6.1-terra-none-line-polygons/robustness.json`.

Page 113. Every saved result groups the page as the reference does.

| Source | Boxes: other passages' ink / own ink left out | Polygons: other / own | Ownership errors |
| --- | --- | --- | ---: |
| 017 — Gemini 4 Argon low thinking, native coordinates | 6,249 / 101 | 0 / 0 | 0 |
| 018 — Gemini 3.8 Flash low thinking, native coordinates | 14,533 / 86 | 0 / 0 | 0 |
| 020 — GPT-6 Astra low reasoning | 3,930 / 94 | 0 / 0 | 0 |
| 025 — GPT-6.1 Terra without reasoning | 3,053 / 210 | 0 / 0 | 0 |
| 028 — Gemini 4 Argon low thinking, explicit crop padding | 8,353 / 25 | 0 / 0 | 0 |
| 029 — Gemini 3.8 Flash low thinking, explicit crop padding | 4,224 / 189 | 0 / 0 | 0 |
| 030 — Gemini 4 Argon low thinking + slanted-separator refinement | 18,609 / 0 | 0 / 0 | 0 |
| 031 — Gemini 3.8 Flash low thinking + slanted-separator refinement | 34,727 / 0 | 0 / 0 | 0 |

Page 97: all ten saved results (017, 018, 020, 025, 026, 027, 028, 029, 030, 031) group the page as the reference does. All ten give 0 ownership errors and polygons with 0 other-passage ink and 0 own ink left out. The raw boxes include at most 5 pixels of other passages' ink and leave out at most 407 of their own.

Page 17:

| Source | Difference from the reference's grouping | Boxes: other / own | Polygons: other / own | Ownership errors |
| --- | --- | --- | --- | ---: |
| 001 — Geometry baseline | coarse blocks: header with page number, lead-in 36 with commentary 35, footnotes with commentary 36; verse 36's last line in the commentary block | 1,207,567 / 15,430 | 1,206,679 / 15,487 | 15,487 |
| 002 — PP-DocLayout-S | all body text in one region, footnotes in another | 1,840,585 / 114 | 1,923,115 / 31,864 | 31,864 |
| 003 — PP-DocLayoutV3 | verse lines in separate regions, two verse-35 lines outside every box, footnotes in one region | 66,413 / 82,497 | 62,565 / 81,843 | 82,472 |
| 005 — GPT-6 Astra direct | same | 21 / 22 | 0 / 0 | 0 |
| 008 — Claude Sonnet 5.5 direct | footnotes with commentary 36; commentary 36's first line inside the verse box | 884,899 / 23,567 | 885,335 / 15,563 | 15,563 |
| 009 — Gemini 4 Argon high thinking | footnotes in one region | 62,689 / 61 | 62,565 / 0 | 0 |
| 010 — Claude Fable 5.1 high effort | footnotes with commentary 36; boxes a line off around verse 36 | 893,314 / 57,188 | 898,580 / 28,808 | 28,808 |
| 011 — Claude Fable 5.1 max effort | no footnote regions; boxes a line off at the ends of verse 36 and commentary 36 | 77,919 / 40,038 | 15,487 / 41,989 | 29,476 |
| 012 — Claude Opus 5.5 max effort | footnotes in one region | 44,650 / 12,902 | 62,565 / 0 | 0 |
| 013 — Gemini 4 Argon high thinking, individual footnotes | same | 250 / 2 | 0 / 0 | 0 |
| 014 — Gemini 4 Argon high thinking, native coordinates | same | 17 / 59 | 0 / 0 | 0 |
| 015 — Claude Fable 5.1 max effort, pixel coordinates | same | 1,316 / 1,087 | 599 / 599 | 599 |
| 016 — Claude Opus 5.5 max effort, pixel coordinates | same | 582 / 13,788 | 401 / 401 | 401 |
| 017 — Gemini 4 Argon low thinking, native coordinates | same | 117 / 25 | 0 / 0 | 0 |
| 018 — Gemini 3.8 Flash low thinking, native coordinates | same | 211 / 57 | 0 / 0 | 0 |
| 020 — GPT-6 Astra low reasoning | same | 17 / 56 | 0 / 0 | 0 |
| 021 — GPT-6.1 Terra low reasoning | same | 32 / 124 | 0 / 0 | 0 |
| 022 — GPT-6 Luna low reasoning | footnote boxes far off, footnotes 5 and 6 together | 5,457 / 3,264 | 5,074 / 2,640 | 2,640 |
| 023 — GPT-6 Luna high reasoning | footnotes with commentary 36; boxes a line off around lead-in 36 and verse 36 | 1,009,740 / 43,603 | 1,013,101 / 36,162 | 36,162 |
| 024 — Gemini 3.5 Flash-Lite low thinking | footnotes in one region; verse 35's last line inside the commentary box | 77,648 / 16,665 | 78,006 / 15,441 | 15,441 |
| 025 — GPT-6.1 Terra without reasoning | same | 87 / 13 | 0 / 0 | 0 |
| 028 — Gemini 4 Argon low thinking, explicit crop padding | same | 25 / 69 | 0 / 0 | 0 |
| 029 — Gemini 3.8 Flash low thinking, explicit crop padding | same | 353 / 238 | 0 / 0 | 0 |
| 030 — Gemini 4 Argon low thinking + slanted-separator refinement | same | 2,046 / 0 | 0 / 0 | 0 |
| 031 — Gemini 3.8 Flash low thinking + slanted-separator refinement | same | 1,824 / 0 | 0 / 0 | 0 |

Across the three pages, 32 saved results group the page as the reference does, and 30 of them give zero ownership errors. The two exceptions, Claude Fable 015 and Claude Opus 016 on page 17, err only on footnote line 29. There, the models' own boxes place footnote numeral २ inside the preceding note's box, and for 015 also numeral ३ and a period. Where a source groups differently, ownership reproduces that grouping. Where a source's boxes are a whole line off at a passage boundary, as for 001, 008, 010, 011, 023 and 024, ownership follows the boxes and assigns that line to the wrong passage. This matches the perturbation results below.

Perturbation of Terra 025's boxes (clean trials, or error pixels):

| Perturbation | Page 17 | Page 97 | Page 113 |
| --- | --- | --- | --- |
| Each edge moved independently within ±10 px | 20 / 20 clean | 20 / 20 clean | 20 / 20 clean |
| Within ±20 px | 12 / 20 clean, at most 323 px on one line | 19 / 20, at most 63 px | 17 / 20, at most 75 px |
| Within ±30 px | 2 / 20; merges in 6 | 9 / 20; merges in 7 | 7 / 20; merges in 10 |
| Within ±40 px | 0 / 20 | 5 / 20 | 4 / 20 |
| Within ±60 px | 0 / 20 | 0 / 20 | 0 / 20 |
| All boxes shifted ±20 px vertically | clean | clean | clean |
| All boxes shifted ±40 px vertically | 55,546 / 66,002 px | 42,371 / 46,942 px | 77,018 / 74,425 px |
| All boxes shifted −20 / +20 px horizontally | 167 / 546 px | 63 / 327 px | 255 / 275 px |
| All boxes shifted −40 / +40 px horizontally | 1,134 / 990 px | 393 / 629 px | 1,257 / 1,225 px |
| All coordinates scaled by 0.99 or 1.01 | clean | clean | clean |
| Scaled by 0.97 / 1.03 | 465 / 323 px | 305 / 607 px | 159 / 800 px |

Every error from a horizontal shift or a scaling was on the page's shared footnote line: line 29 on pages 17 and 113, line 26 on page 97. Whole-line ownership tolerated independent edge errors of a quarter character height on every trial, and a common vertical shift of half a character height. It failed once boxes were off by about a full line.

An earlier run of this sweep (15:46–15:47 UTC) used center-to-center distance to place components left outside every box on a shared line. It had 32 and 63 error pixels from Gemini 3.8 Flash 029 on pages 17 and 97: a footnote's final period, cut off by the model's box, joined the next footnote's numeral. Method 033 was changed to edge-to-edge distance, a synthetic test for the case was added, and all method 033 and 034 outputs and this sweep were regenerated before being recorded here.

## Cross-book test: 43 more pages from seven books

### Test pages

**Inputs:** 43 pages, listed in [inputs/pages.json](inputs/pages.json) and rendered on 2026-11-04 by [inputs/render_pages.py](inputs/render_pages.py). Each page has a provenance record next to it (`inputs/<input_id>.json`) with the source PDF's SHA-256. Book descriptions are in [methods/032-line-skew-separability/books.json](methods/032-line-skew-separability/books.json).

| Book | PDF pages | Pixel size |
| --- | --- | --- |
| Kale (1913) | 1, 43, 85, 127, 169, 211 (contents, verse with commentary, English translation, English notes), and 58, 146, 246 | 1347–1379 × 2105–2119 |
| Telang, Digital Library of India scan | 21, 50, 79, 108, 137, 166 | 1500 × 2500 |
| Vavilla edition | 34, 82, 130, 179, 227, 275 | 1488 × 2140 |
| Nītiśataka edition (1896), Google Books | 51, 123, 195, 267, 339, 411 | 1539–1580 × 2388–2403 |
| Nītiśataka edition (1914), Google Books | 49, 119, 189, 258, 328, 398 | 1524–1620 × 2342–2366 |
| M. N. Dutt's Mahābhārata | page 2 of chapter files 13F 221_1, 14F 225, 15F 239, 17F 154, 19F 034 and 20F 337 | 2071–2101 × 2808–2862 |
| Cole (1903) | 1–4 | 1800–1809 × 2850–2855 |

The selection was made before any model run on these pages. Each book contributes every other page of method 032's evenly spaced survey sample, which are the pages on that survey's contact sheets. Cole contributes all four pages. Kale also contributes pages 58, 146 and 246, three of the four Kale pages whose text angle reaches 1°; page 113 is the fourth. Pages are RGB with no alpha, rendered with PyMuPDF 1.26.6 at 300 dpi, or at the scan's native resolution where that is lower: the Telang scan's page images are 1500 × 2500 pixels.

### Proposed passage references

**References:** [telang-dli-page-108](references/telang-dli-page-108/passage-spec.json), [vavilla-page-034](references/vavilla-page-034/passage-spec.json), [gopinath-1896-page-123](references/gopinath-1896-page-123/version-1/passage-spec.json), [gopinath-1914-page-258](references/gopinath-1914-page-258/version-1/passage-spec.json), [dutt-mahabharata-14f-chapter-225-page-002](references/dutt-mahabharata-14f-chapter-225-page-002/version-1/passage-spec.json) and [cole-1903-page-003](references/cole-1903-page-003/version-1/passage-spec.json). Claude proposed them; the user's review of them is recorded in the entry "Passage references after review" below, and the links here are to version 1 of the four that were revised. Each was written from the page image and the method 032 line segmentation with line numbers drawn on it. The Terra requests for all 43 pages had already been sent, but no model or method 033 output for these six pages was opened until all six references were built. No API call was made for the references.

**Built:** 2026-11-04 18:14:00–18:19:06 UTC with `reference.py` from [033-gpt-6.1-terra-none-line-polygons](methods/033-gpt-6.1-terra-none-line-polygons/README.md).

**Unit definition:** the finest visually separate unit. That is one passage per verse, or per verse fragment where a verse crosses the page boundary or where Dutt interleaves a half-verse with a paragraph; one per prose or translation paragraph, heading, metre line and note item; and one per displayed formula or list in Cole. A result that joins such units is a grouping difference, not an ownership error.

| Page | Lines | Passages (kept) | Notes on unlabeled ink |
| --- | ---: | --- | --- |
| Telang 108 | 35 | 9 (8): page number, the end of verse 79, verses 80 and 81, the start of verse 82, and apparatus entries for verses 79–82 | 8 specks, 119 px |
| Vavilla 34 | 34 | 7 (5): page number, running header, end of commentary 23, verse 24, commentary 24, the metre line of verse 24, verse 25 | a margin mark and three specks, 196 px |
| Nītiśataka 1896, page 123 | 36 | 10 (9): running header, verse 54, Hindi translation, the भावार्थ heading, the Hindi gist, English translation, and four note items | the vertical frame bars and three frame pieces that the line finder attached to text lines 14, 15 and 24 |
| Nītiśataka 1914, page 258 | 30 | 7 (5): running header, page number, verse 81, Hindi translation, English translation, two note paragraphs | the ornament border, which the line finder splits into eight lines of its own and pieces attached to ten text lines; also the word मुष्टिभिरेव, one 240 × 87 px component that the line finder puts on no line |
| Dutt 14F 225, page 2 | 85, in two columns | 32 (30): running header, page number, a speaker line, 20 verses or half-verses, 9 translation paragraphs | the vertical rule between the columns |
| Cole page 3 | 54 | 14 (12): page number, running header, 7 prose blocks, 4 displays, the footnote | 10 components of the displays that the line finder puts on no line, 860 px. The broken left end of the footnote rule, about 130 px, is attached to the first footnote line and is labeled footnote. |

Each review image shows every passage in its own color, with separators in black and unlabeled ink in gray.

![Proposed reference, Telang page 108](references/telang-dli-page-108/review.png)

![Proposed reference, Vavilla page 34](references/vavilla-page-034/review.png)

![Proposed reference, Nītiśataka 1896 page 123](references/gopinath-1896-page-123/version-1/review.png)

![Proposed reference, Nītiśataka 1914 page 258](references/gopinath-1914-page-258/version-1/review.png)

![Proposed reference, Dutt 14F chapter 225 page 2](references/dutt-mahabharata-14f-chapter-225-page-002/version-1/review.png)

![Proposed reference, Cole page 3](references/cole-1903-page-003/version-1/review.png)

### Method 025 — GPT-6.1 Terra without reasoning, individual footnotes: 43 more pages

**Method:** [025-gpt-6.1-terra-none-footnotes](methods/025-gpt-6.1-terra-none-footnotes/README.md), unchanged: `gpt-6.1-terra`, reasoning effort `none`, image detail `original`, strict JSON Schema output, 16,384 maximum output tokens, `store=false`, one request per page and no retries. The prompt was written for Kale. Its region types are verse, commentary, lead-in, footnote, running header, page number and other.

**Inputs:** the 43 pages above, unchanged PNGs.

**Run:** 2026-11-04 18:12:38–18:13:59 UTC, four requests at a time. All 43 requests returned HTTP 200 with status `completed`, with no validation warnings and no coordinate clamping. Outputs: `outputs/<input_id>/025-gpt-6.1-terra-none-footnotes/`.

| Book | Pages | Regions | Regions flagged uncertain | Estimated cost |
| --- | ---: | ---: | ---: | ---: |
| Kale (1913) | 9 | 101 | 2 | $0.0599 |
| Telang | 6 | 51 | 4 | $0.0449 |
| Vavilla | 6 | 40 | 3 | $0.0380 |
| Nītiśataka 1896 | 6 | 62 | 5 | $0.0465 |
| Nītiśataka 1914 | 6 | 56 | 7 | $0.0452 |
| Dutt | 6 | 187 | 24 | $0.0855 |
| Cole (1903) | 4 | 61 | 0 | $0.0427 |
| All | 43 | 558 | 45 | $0.3627 |

Input tokens ranged from 3,800 to 7,523 per request and output tokens from 172 to 1,174. The API reported zero reasoning tokens for every request. API wall time summed to 292.9 s, at most 14.8 s for one request. Costs use the pricing snapshot recorded with method 025, checked on 2026-11-03.

Grouping, from inspecting every page's overlay:

- **Kale.** Every page matches its visible structure. On the contents page each entry and heading is its own region. Each numbered translation on pages 127 and 146 and each "Sl." note on pages 169, 211 and 246 is its own region. Verses, commentaries, lead-ins and individual footnotes are separate, as on the earlier test pages, and the colophon on page 43 is its own region. Running headers and page numbers are excluded, and so are the printer's signature marks on pages 146 and 246.
- **Telang.** Verses, each verse's apparatus entry, each stanza's note, preface paragraphs and the six footnotes on page 21 are separate. On page 50, a sideways table, the model returned one region for the table and six for the sideways notes.
- **Vavilla.** Verses, commentaries, metre lines, quoted verses and lead-ins are separate. The printer's signature numbers at the foot are labeled inconsistently: on page 179 "12" is kept as content with reading order 6; on pages 227 and 275 it is excluded.
- **Nītiśataka 1896 and 1914.** Verse, Hindi translation, भावार्थ heading and gist, English translation, each note item and each variant-reading entry are separate. The page frames are excluded.
- **Dutt.** Every verse or half-verse, every translation paragraph and every speaker line ("Sanjaya said", मार्कण्डेय उवाच) is its own region. Reading order runs down the left column, then the right.
- **Cole.** Prose blocks, each displayed formula, the title, author and affiliation lines, and the footnotes are separate. The running header is returned as two regions, title and date.

The 45 uncertain flags are mostly on verse fragments: Dutt's half-verses and the verse fragments that cross page boundaries on Telang page 108. The rest are spread over running headers, printer's signature marks, footnotes and other regions.

### Method 033 — GPT-6.1 Terra without reasoning + line ownership and polygon regions: 43 more pages

**Method:** [033-gpt-6.1-terra-none-line-polygons](methods/033-gpt-6.1-terra-none-line-polygons/README.md), settings unchanged from the Kale entries. A new script in the method directory, `crossbook.py`, writes the summary below; the runtime files are unchanged.

**Source results:** the 43 Terra 025 results above, used unchanged.

**Run:** 2026-11-04 18:19:27–18:21:20 UTC. Reference evaluations followed at 18:21:54–18:22:03 UTC, and the summary at 18:23:17 UTC: `outputs/surveys/033-gpt-6.1-terra-none-line-polygons/cross-book.json` and one overlay contact sheet per book. Local time per page was 1.6–3.3 s, and 4.6–5.6 s on the larger Dutt pages. No API call was made.

| Page | Regions kept / all | Uncertain | Lines whole / split / uncovered | Text components on no line | Unassigned text pixels (share) | Dropped marks | Regions in several pieces | Terra cost |
| --- | --- | ---: | --- | ---: | --- | ---: | ---: | ---: |
| [kale-1913-page-001](inputs/kale-1913-page-001.png) | 28 / 28 | 0 | 30 / 0 / 2 | 6 | 5,279 (1.71%) | 0 | 0 | $0.0093 |
| [kale-1913-page-043](inputs/kale-1913-page-043.png) | 13 / 15 | 0 | 23 / 2 / 0 | 2 | 55 (0.02%) | 0 | 0 | $0.0074 |
| [kale-1913-page-085](inputs/kale-1913-page-085.png) | 12 / 14 | 0 | 28 / 2 / 0 | 1 | 725 (0.16%) | 0 | 0 | $0.0071 |
| [kale-1913-page-127](inputs/kale-1913-page-127.png) | 5 / 6 | 0 | 35 / 0 / 0 | 3 | 18 (0.01%) | 0 | 0 | $0.0057 |
| [kale-1913-page-169](inputs/kale-1913-page-169.png) | 4 / 5 | 0 | 36 / 0 / 0 | 1 | 13 (0.00%) | 0 | 0 | $0.0056 |
| [kale-1913-page-211](inputs/kale-1913-page-211.png) | 5 / 6 | 0 | 35 / 0 / 0 | 2 | 62 (0.01%) | 0 | 0 | $0.0058 |
| [kale-1913-page-146](inputs/kale-1913-page-146.png) | 6 / 8 | 1 | 37 / 0 / 0 | 5 | 57 (0.01%) | 0 | 0 | $0.0061 |
| [kale-1913-page-058](inputs/kale-1913-page-058.png) | 10 / 12 | 0 | 26 / 2 / 0 | 2 | 54 (0.01%) | 0 | 1 | $0.0069 |
| [kale-1913-page-246](inputs/kale-1913-page-246.png) | 5 / 7 | 1 | 35 / 0 / 1 | 3 | 129 (0.03%) | 0 | 0 | $0.0060 |
| [telang-dli-page-021](inputs/telang-dli-page-021.png) | 9 / 10 | 0 | 37 / 0 / 0 | 4 | 41 (0.01%) | 0 | 0 | $0.0077 |
| [telang-dli-page-050](inputs/telang-dli-page-050.png) | 7 / 8 | 1 | 113 / 0 / 0 | 25 | 7,129 (3.47%) | 36 | 6 | $0.0074 |
| [telang-dli-page-079](inputs/telang-dli-page-079.png) | 11 / 12 | 0 | 27 / 0 / 0 | 8 | 155 (0.06%) | 0 | 0 | $0.0080 |
| [telang-dli-page-108](inputs/telang-dli-page-108.png) | 8 / 9 | 3 | 35 / 0 / 0 | 8 | 119 (0.04%) | 0 | 0 | $0.0075 |
| [telang-dli-page-137](inputs/telang-dli-page-137.png) | 3 / 5 | 0 | 30 / 1 / 0 | 3 | 113 (0.03%) | 2 | 0 | $0.0069 |
| [telang-dli-page-166](inputs/telang-dli-page-166.png) | 5 / 7 | 0 | 30 / 1 / 0 | 2 | 145 (0.04%) | 0 | 0 | $0.0072 |
| [vavilla-page-034](inputs/vavilla-page-034.png) | 5 / 7 | 0 | 32 / 1 / 1 | 3 | 196 (0.07%) | 0 | 0 | $0.0064 |
| [vavilla-page-082](inputs/vavilla-page-082.png) | 3 / 5 | 0 | 35 / 1 / 2 | 2 | 790 (0.27%) | 0 | 0 | $0.0061 |
| [vavilla-page-130](inputs/vavilla-page-130.png) | 5 / 7 | 0 | 40 / 1 / 0 | 5 | 1,110 (0.37%) | 0 | 0 | $0.0064 |
| [vavilla-page-179](inputs/vavilla-page-179.png) | 6 / 8 | 1 | 39 / 1 / 0 | 2 | 178 (0.05%) | 0 | 0 | $0.0065 |
| [vavilla-page-227](inputs/vavilla-page-227.png) | 4 / 7 | 1 | 36 / 1 / 2 | 2 | 408 (0.12%) | 0 | 0 | $0.0064 |
| [vavilla-page-275](inputs/vavilla-page-275.png) | 3 / 6 | 1 | 41 / 1 / 1 | 2 | 544 (0.16%) | 0 | 0 | $0.0062 |
| [gopinath-1896-page-051](inputs/gopinath-1896-page-051.png) | 4 / 6 | 0 | 30 / 1 / 0 | 11 | 222 (0.05%) | 0 | 0 | $0.0070 |
| [gopinath-1896-page-123](inputs/gopinath-1896-page-123.png) | 9 / 10 | 0 | 36 / 0 / 0 | 14 | 2,152 (0.48%) | 0 | 0 | $0.0077 |
| [gopinath-1896-page-195](inputs/gopinath-1896-page-195.png) | 7 / 10 | 1 | 30 / 2 / 7 | 12 | 4,731 (1.27%) | 0 | 0 | $0.0077 |
| [gopinath-1896-page-267](inputs/gopinath-1896-page-267.png) | 4 / 7 | 1 | 23 / 1 / 1 | 15 | 1,479 (0.45%) | 0 | 0 | $0.0072 |
| [gopinath-1896-page-339](inputs/gopinath-1896-page-339.png) | 7 / 10 | 2 | 36 / 1 / 5 | 12 | 2,169 (0.39%) | 4 | 6 | $0.0078 |
| [gopinath-1896-page-411](inputs/gopinath-1896-page-411.png) | 17 / 19 | 1 | 30 / 1 / 4 | 9 | 10,309 (3.15%) | 0 | 0 | $0.0091 |
| [gopinath-1914-page-049](inputs/gopinath-1914-page-049.png) | 3 / 5 | 0 | 29 / 1 / 19 | 7 | 47,052 (13.30%) | 2 | 0 | $0.0070 |
| [gopinath-1914-page-119](inputs/gopinath-1914-page-119.png) | 7 / 9 | 2 | 29 / 1 / 14 | 11 | 63,524 (13.47%) | 6 | 0 | $0.0076 |
| [gopinath-1914-page-189](inputs/gopinath-1914-page-189.png) | 6 / 8 | 1 | 31 / 1 / 10 | 18 | 35,916 (9.08%) | 0 | 1 | $0.0073 |
| [gopinath-1914-page-258](inputs/gopinath-1914-page-258.png) | 5 / 7 | 0 | 21 / 1 / 8 | 22 | 72,407 (18.91%) | 0 | 0 | $0.0070 |
| [gopinath-1914-page-328](inputs/gopinath-1914-page-328.png) | 7 / 9 | 3 | 24 / 1 / 21 | 3 | 76,579 (16.05%) | 3 | 0 | $0.0074 |
| [gopinath-1914-page-398](inputs/gopinath-1914-page-398.png) | 15 / 18 | 1 | 29 / 1 / 11 | 13 | 55,725 (15.85%) | 5 | 0 | $0.0089 |
| [cole-1903-page-001](inputs/cole-1903-page-001.png) | 10 / 13 | 0 | 39 / 1 / 0 | 1 | 37 (0.01%) | 0 | 1 | $0.0103 |
| [cole-1903-page-002](inputs/cole-1903-page-002.png) | 8 / 11 | 0 | 43 / 1 / 0 | 0 | 0 (0.00%) | 0 | 1 | $0.0100 |
| [cole-1903-page-003](inputs/cole-1903-page-003.png) | 12 / 15 | 0 | 53 / 1 / 0 | 10 | 860 (0.26%) | 0 | 0 | $0.0106 |
| [cole-1903-page-004](inputs/cole-1903-page-004.png) | 19 / 22 | 0 | 37 / 1 / 0 | 8 | 385 (0.16%) | 0 | 0 | $0.0117 |
| [dutt-mahabharata-13f-chapter-221-1-page-002](inputs/dutt-mahabharata-13f-chapter-221-1-page-002.png) | 35 / 37 | 15 | 86 / 0 / 0 | 0 | 0 (0.00%) | 0 | 0 | $0.0152 |
| [dutt-mahabharata-14f-chapter-225-page-002](inputs/dutt-mahabharata-14f-chapter-225-page-002.png) | 30 / 32 | 6 | 85 / 0 / 0 | 0 | 0 (0.00%) | 0 | 0 | $0.0143 |
| [dutt-mahabharata-15f-chapter-239-page-002](inputs/dutt-mahabharata-15f-chapter-239-page-002.png) | 29 / 31 | 0 | 31 / 14 / 0 | 0 | 0 (0.00%) | 0 | 18 | $0.0142 |
| [dutt-mahabharata-17f-chapter-154-page-002](inputs/dutt-mahabharata-17f-chapter-154-page-002.png) | 30 / 32 | 0 | 84 / 0 / 0 | 0 | 0 (0.00%) | 0 | 0 | $0.0145 |
| [dutt-mahabharata-19f-chapter-034-page-002](inputs/dutt-mahabharata-19f-chapter-034-page-002.png) | 22 / 24 | 0 | 83 / 0 / 0 | 0 | 0 (0.00%) | 0 | 0 | $0.0130 |
| [dutt-mahabharata-20f-chapter-337-page-002](inputs/dutt-mahabharata-20f-chapter-337-page-002.png) | 29 / 31 | 3 | 84 / 0 / 0 | 0 | 0 (0.00%) | 0 | 0 | $0.0144 |

Against the six proposed references, summed over kept passages:

| Page | Terra boxes: other passages' ink / own ink left out / separator pixels | Method 033 polygons: other / own / separator | Method 033 ownership check |
| --- | --- | --- | ---: |
| Telang 108 | 58 / 88 / 0 | 0 / 0 / 0 | 0 |
| Vavilla 34 | 0 / 0 / 0 | 0 / 0 / 0 | 0 |
| Nītiśataka 1896, page 123 | 613 / 541 / 0 | 0 / 0 / 0 | 0 |
| Nītiśataka 1914, page 258 | 0 / 0 / 0 | 0 / 0 / 0 | 0 |
| Dutt 14F 225, page 2 | 0 / 24 / 0 | 0 / 0 / 0 | 0 |
| Cole page 3 | 123 / 346 / 0 | 0 / 0 / 0 | 1,208 |

Terra's grouping matches every reference at the finest unit: no kept passage is missing and no region holds two kept passages. On Cole page 3, the 1,208 pixels in the ownership check are the "[Dec.," half of the running header. Terra returned it as a second running-header region, and the reference has one header passage.

The references leave frames, borders and specks unlabeled, so the scores above do not count them. Unlabeled ink inside kept regions, Terra boxes against method 033 polygons:

| Page | Unlabeled ink | Inside kept boxes | Inside kept polygons |
| --- | ---: | ---: | ---: |
| Telang 108 | 209 | 83 | 98 |
| Vavilla 34 | 277 | 95 | 69 |
| Nītiśataka 1896, page 123 | 75,090 | 364 | 1,294 |
| Nītiśataka 1914, page 258 | 111,035 | 8,734 | 28,112 |
| Dutt 14F 225, page 2 | 8,654 | 14 | 14 |
| Cole page 3 | 866 | 806 | 658 |

On Nītiśataka 1914 page 258, both counts include the 8,604-pixel word मुष्टिभिरेव. It is verse text that the line finder put on no line, and it lies inside both the verse box and the verse polygon. The remaining difference is border ornament.

Failures and weaknesses seen in the overlays and diagnostics:

- **Columns not found: Dutt 15F 239, page 2.** The line finder found one column on this page and two on the other five Dutt pages. Its 45 lines span both columns. Fourteen were split between regions; the other 31 went whole to the box holding the largest share, often about half the line. As a result, 19 of the 31 regions own ink in the other column, and 18 come out in several pieces. For example, region 9, a left-column paragraph, owns 12,558 pixels in the right column. Whole-line assignments where the owner box holds under 75% of the line's ink while another box holds a substantial share occur on this page (20 lines) and on Telang page 50 (26 lines), and nowhere else.
- **Sideways table: Telang page 50.** The rotated text is read as 113 short lines, 36 marks are dropped and 6 regions come out in several pieces. The outlines are unusable; the model's box is the better region here.
- **Frames and ornament borders.** The line finder classes long frame bars as large non-text, but it attaches shorter frame and ornament pieces to text lines, and ownership then gives them to text regions.
  - On Nītiśataka 1896 page 339, regions 4, 5, 6, 8, 9 and 10 each have a second piece in the right margin beyond the frame (x 1482–1580). It comes from scanner-edge marks that are close to frame pieces on the same line, so the isolation rule did not drop them. Four other marks at the page edges were dropped.
  - On page 411, the page-number region owns part of the top frame line, and its outline spans x 191–570.
  - On the 1914 edition, outlines bulge into the ornament border wherever a border piece joined a text line. Its unassigned share of 9–19% is mostly border pieces on lines of their own, which no box covers; that part is correct.
- **Loose outlines next to short lines.** Where a region's ink leaves empty space inside its padded rectangle, such as a verse whose number sits at the right margin (Vavilla 34, 227, 275), the nearest-ink partition fills that space with spiky boundaries. The outlines contain no other ink, but they are not tight.
- **Ink on no line.** Large merged glyphs (Nītiśataka 1914), long dashes (Vavilla 130) and display fragments (Cole) stay unassigned. Where they lie inside a region's padded rectangle, the outline still covers them.

In the contact sheets, owned ink is colored by region, outlines are drawn in the region's color, the model's boxes are thin gray rectangles, unassigned text ink is red and separators are black.

![Method 033 overlays, Kale (1913)](outputs/surveys/033-gpt-6.1-terra-none-line-polygons/cross-book-kale-1913.png)

![Method 033 overlays, Telang](outputs/surveys/033-gpt-6.1-terra-none-line-polygons/cross-book-telang-dli.png)

![Method 033 overlays, Vavilla](outputs/surveys/033-gpt-6.1-terra-none-line-polygons/cross-book-vavilla.png)

![Method 033 overlays, Nītiśataka 1896](outputs/surveys/033-gpt-6.1-terra-none-line-polygons/cross-book-gopinath-1896.png)

![Method 033 overlays, Nītiśataka 1914](outputs/surveys/033-gpt-6.1-terra-none-line-polygons/cross-book-gopinath-1914.png)

![Method 033 overlays, Dutt](outputs/surveys/033-gpt-6.1-terra-none-line-polygons/cross-book-dutt-mahabharata.png)

![Method 033 overlays, Cole (1903)](outputs/surveys/033-gpt-6.1-terra-none-line-polygons/cross-book-cole-1903.png)

### Method 035 — GPT-6.1 Terra without reasoning + line ownership with side-by-side reassignment and in-box isolation, polygon regions: 46 pages

**Method:** [035-gpt-6.1-terra-none-column-margin-ownership](methods/035-gpt-6.1-terra-none-column-margin-ownership/README.md). This is method 033 with two changes to ownership, made after the method 033 cross-book test above:
- **Side-by-side reassignment.** After each line's decision, a component lying wholly to the left or right of its assigned box moves to another box under two conditions. The other box must hold at least half of the component's pixels, and it must overlap the assigned box horizontally by less than 10% of the narrower width.
- **Isolation beyond all boxes.** For a component lying wholly beyond the outermost left or right edge of all boxes, the outlier rule measures its distance to the line's components that some box holds, rather than to any component on the line. All other settings are method 033's.

**Tests:** method 033's seven synthetic tests plus two new ones, all passing:
- two columns that the line finder reads as one line;
- a scanner-edge mark close to a frame piece beyond the text.

Both new tests fail under method 033's ownership code.

**Development note:** the first version of the isolation change measured distance only to components held by the owner's box, on every line. A robustness sweep on the nine referenced pages showed it was less robust than method 033 when boxes were perturbed. For example, with all coordinates scaled by 0.97, Kale page 113 had 2,561 error pixels against 159. On shared page-number and footnote lines, glyphs that no perturbed box held had fallen back to the nearest note and were then dropped. The rule was restricted to components beyond all boxes. Every output of the first version, made 18:33–18:39 UTC, was deleted, and all outputs below were regenerated.

**Source results:** Terra 025 on the 46 pages (Kale 17, 97 and 113, and the 43 above), plus the repeat requests below.

**Run:** 2026-11-04 18:43:39–18:45:40 UTC (run-001 sources) and 18:45:46–18:47:40 UTC (run-002 sources). Reference evaluations ran 18:48:04–18:48:36 UTC and the cross-book summary at 18:48:54 UTC: `outputs/surveys/035-gpt-6.1-terra-none-column-margin-ownership/cross-book.json`, with overlay contact sheets. No API call was made.

Ownership differs from method 033's on six of the 46 pages:

| Page | Ink pixels whose owner changed | Components moved beside | Marks dropped, 033 → 035 | Regions in several pieces, 033 → 035 | Lines split, 033 → 035 |
| --- | ---: | ---: | --- | --- | --- |
| Dutt 15F 239, page 2 | 118,267 | 708 | 0 → 0 | 18 → 0 | 14 → 41 |
| Telang page 50 (sideways table) | 30,362 | 273 | 36 → 0 | 6 → 3 | 0 → 64 |
| Nītiśataka 1914, page 119 | 5,247 | 0 | 6 → 10 | 0 → 0 | 1 → 1 |
| Nītiśataka 1896, page 339 | 1,123 | 0 | 4 → 21 | 6 → 0 | 1 → 1 |
| Nītiśataka 1914, page 328 | 765 | 0 | 3 → 4 | 0 → 0 | 1 → 1 |
| Nītiśataka 1914, page 49 | 210 | 0 | 2 → 5 | 0 → 0 | 1 → 1 |

On Dutt 15F 239, content regions now own 15 ink pixels across the column gutter (x = 1044), against tens of thousands under method 033; every paragraph and verse has one color in the overlay. The newly dropped marks on the Nītiśataka pages all lie at the page edges, at x ≥ 1429 on pages 1,548–1,620 pixels wide: scanner-edge marks and border ornaments beyond the frame. No previously dropped mark is kept. Telang page 50 is still unusable, now with fewer dropped marks. On the other 40 pages, ownership is identical to method 033's.

Against the nine passage references, method 035 gives 0 other passages' ink, 0 own ink left out and 0 separator pixels on every page, exactly as method 033 does. The ownership check is 0 everywhere except Cole page 3, where it is 1,208, also as in method 033: the running header that Terra split in two.

**Robustness:** `sweep.py` was run on the nine referenced pages twice, with method 035's recipe and with method 033's (`--recipe-dir`), on identical trials. The generator is reseeded for each page, and the method 033 recipe reproduced the original Kale results of the method 033 sweep exactly. Run started 2026-11-04 18:47:54 UTC. Outputs: `robustness.json` and `robustness-recipe-033-gpt-6.1-terra-none-line-polygons.json` in the method 035 survey folder.

The two recipes give identical results in 149 of the 153 page–condition pairs (nine pages × 17 perturbation conditions). The source sweep, 49 saved box results on the nine pages, is also identical. The four differences all come at perturbations where both recipes already fail:
- On Kale page 97, independent edge moves within ±30 px leave 8 of 20 trials clean, against 9 for method 033; within ±40 px, 4 against 5. In the trial that changed at ±30 px, footnote 6's moved box covers the first footnote line. Method 033 gives footnotes 1–3 to footnote 4's region; method 035 moves part of them to footnote 6's.
- Kale page 97 at ±60 px and page 17 shifted 40 px up differ by at most 2% in error pixels.

Method 035 on the six new referenced pages (clean trials out of 20, and the largest error in pixels; single trials give error pixels):

| Perturbation | Telang 108 | Vavilla 34 | Nītiśataka 1896 p. 123 | Nītiśataka 1914 p. 258 | Dutt 14F 225 | Cole 3 |
| --- | --- | --- | --- | --- | --- | --- |
| Character height | 34 px | 33 px | 39 px | 37 px | 31 px | 21 px |
| Each edge moved independently within ±10 px | 20 / 20 | 20 / 20 | 20 / 20 | 20 / 20 | 20 / 20 | max 1,256 |
| Within ±20 px | 14 / 20, max 228 | 16 / 20, max 183 | 19 / 20, max 2,708 | 20 / 20 | 20 / 20 | max 5,836 |
| Within ±30 px | 9 / 20, max 8,185 | 15 / 20, max 183 | 13 / 20, max 3,217 | 20 / 20 | 14 / 20, max 16,331 | max 10,998 |
| All boxes shifted 20 px up / down | 228 / 330 | 0 / 183 | 2,708 / 0 | 0 / 0 | 0 / 0 | 12,360 / 1,537 |
| All boxes shifted 20 px left / right | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 1,208 / 1,256 |
| All coordinates scaled by 0.97 / 1.03 | 2,170 / 0 | 183 / 0 | 11,319 / 0 | 0 / 0 | 21,840 / 10,309 | 8,788 / 77 |

On Cole page 3 every trial counts the 1,208 pixels of the running header that Terra returned as two regions, so no trial can be clean. Its character height is 21 px, so ±10 px is half a character height there. Scaling by 1.03 happens to put the header's two pieces in one region. Dutt's scaling errors come from boxes moving by up to about 40 px vertically at the top and bottom of a tall page, close to a full line pitch. Shared lines remain the weak point under horizontal error, as on the Kale pages. The new pages have none except Cole's header line, so horizontal shifts are clean on them.

![Method 035 overlays, Dutt](outputs/surveys/035-gpt-6.1-terra-none-column-margin-ownership/cross-book-dutt-mahabharata.png)

![Method 035 overlays, Nītiśataka 1896](outputs/surveys/035-gpt-6.1-terra-none-column-margin-ownership/cross-book-gopinath-1896.png)

### Method 025 — GPT-6.1 Terra without reasoning, individual footnotes: repeat request on the 43 pages

**Method:** [025-gpt-6.1-terra-none-footnotes](methods/025-gpt-6.1-terra-none-footnotes/README.md), unchanged. One more request per page, saved to `outputs/<input_id>/025-gpt-6.1-terra-none-footnotes/run-002/`.

**Run:** 2026-11-04 18:37:18–18:38:35 UTC, four requests at a time, about 24 minutes after the first requests. All 43 returned HTTP 200 with status `completed`, with no validation warnings. Of 217,342 input tokens, 217,213 were read from the provider's prompt cache, written by the first requests within the default 30-minute lifetime. The estimated cost was therefore $0.0966 in total, about a quarter of the first pass. Zero reasoning tokens. API wall time summed to 270.7 s, at most 13.4 s per request. The requests returned 523 regions, against 558 the first time, and flagged 37 as uncertain.

**Grouping stability**, from method 035 run on both passes and compared ink pixel by ink pixel (`stability.py` in method 035; output `stability.json` in its survey folder, written 2026-11-04 18:51:58 UTC). Regions are matched one to one, greedily by shared owned ink. The table counts a region as split or merged only when at least 5% of its ink, and at least 500 pixels, goes to each counterpart.

Pages where the two passes differ:

| Page | Regions, first / repeat | Owned ink with a corresponding owner | Difference |
| --- | --- | ---: | --- |
| Kale page 1 (contents) | 28 / 6 | 20.3% | The first pass made each heading and contents entry its own region (27 "other" and a lead-in). The repeat grouped them into 5 blocks and one commentary region. |
| Dutt 13F 221_1, page 2 | 37 / 25 | 79.0% | The repeat put consecutive verses together: 8 of its regions each hold 2–4 verses that the first pass kept separate. |
| Nītiśataka 1914, page 119 | 9 / 6 | 91.0% | The repeat joined the footnote, the note paragraph and the quoted verse into one region. That region also covered 3,287 pixels that the first pass left unowned. |
| Telang page 50 (sideways table) | 8 / 10 | 92.8% | The sideways notes were divided differently. |
| Cole page 4 | 22 / 20 | 95.8% | The repeat joined two displayed formulas and the word "and" between them into one region. |
| Vavilla page 227 | 7 / 8 | 98.8% | The repeat made the lead-in तदुक्तं भगवता— a region of its own. |
| Nītiśataka 1896, page 339 | 10 / 11 | 99.9% | The repeat made the "Cf.—" before the quoted verses a lead-in region of its own. |
| Vavilla page 179 | 8 / 8 | 100% | The printer's signature number is kept in one pass and excluded in the other. |

On the other 35 pages, ownership and keep flags are identical between the passes. On two of them some types differ:
- Cole page 3: "commentary" against "lead_in";
- Nītiśataka 1914 page 328: "other" against "verse" for the three quoted verses.

On all 43 pages, reading order among matched kept regions is identical. Apart from the one keep flag and the type labels, every difference is in granularity, joining or separating adjacent units; neither pass moved text into a non-adjacent region.

On the six referenced new pages, the repeat request again matched every reference at the finest unit, and method 035 again gave 0 / 0 / 0. The raw repeat boxes included other passages' ink and left out own ink as follows: 48 / 43 on Telang 108, 0 / 3 on Vavilla 34, 1,561 / 587 on Nītiśataka 1896 page 123, 0 / 0 on Nītiśataka 1914 page 258, 0 / 29 on Dutt 14F 225 and 86 / 376 on Cole page 3. Cole's ownership check is again 1,208 pixels, from the running header split in two.

### Passage references after the user's review: version 2 of four references

**Review:** on 2026-11-04 the user looked at the `review.png` of the six proposed references, version 1 (linked in "Proposed passage references" above).
- **Dutt 14F 225, page 2:** looks good, but with every label in the left margin, the right column is hard to read.
- **Nītiśataka 1896, page 123:** a tiny bit of the decorative frame at the top is labeled verse-54.
- **Nītiśataka 1914, page 258:** an entire word of verse 81 is missing.
- **Cole page 3:** display-4 is missing part of one ≡ sign and all of the next. Pieces of the footnote rule are labeled as the ink of display-4 and of the footnote.

The user's notes did not mention Telang page 108 or Vavilla page 34. Those two references are unchanged.

**Cause:** the builder labels components by their detected line, and the method 032 line finder leaves some ink on no line. On the 1914 page this was the word मुष्टिभिरेव, one merged component of 240 × 87 pixels; on the Cole page, four bars of the two ≡ signs. The line finder also attaches thin pieces of the frame (1896) and of the broken left end of the footnote rule (Cole) to text lines. Version 1 recorded the unlabeled word and the rule pieces in its notes. Split rules divide a line only by x, so they cannot pick out a thin piece that shares x positions with text on its line.

**Check of all unlabeled ink:** before building version 2, Claude looked at a crop of every unlabeled text component on all nine references, 33 crops in all. Ornament-border pieces on the 1914 page and frame bars on the 1896 page were left out of the crops, since they are frame by position. Claude also listed every labeled component that is thin and at least a character height long on the five pages with frames or columns. Beyond the user's findings, this turned up five more glyphs on no line, all on these three pages:
- the "e" of "done" (1896);
- the apostrophe of "women's" (1914);
- on the Cole page, the minus sign before 23.157 and the four dots after 23.193 in display-2.

The other unlabeled components are specks, scanner-edge marks, a blot in the Vavilla margin, and a blob on the dark band at the bottom edge of Kale page 113. The thin-component listing found only the 1896 frame piece and a dash in Vavilla's commentary, which is text.

**Builder:** `reference.py` in [method 035](methods/035-gpt-6.1-terra-none-column-margin-ownership/README.md), a copy of method 033's builder with two additions. Line finder, ink mask and settings are unchanged.
- **Component rules:** a rule labels every component (other than specks of role "none") that lies wholly inside a given box. It can label them with a passage, as unlabeled, or as separator, and it overrides the line and separator rules.
- **Right-margin labels:** in `review.png`, passages starting right of the page center are labeled in a margin added to the right of the page.

Run on the nine version 1 specs, it reproduced all nine label images byte for byte.

**Built:** 2026-11-04 19:56:38–19:56:43 UTC. Version 1's four files were moved into a `version-1/` folder inside each reference folder, and every reference folder that was revised has a README describing both versions. No API call was made.

| Page | Component rules in version 2 | Pixels whose label changed |
| --- | --- | --- |
| Nītiśataka 1896, page 123 | The frame piece on line 1 (x 586–672, y 261–267) becomes unlabeled; the "e" of "done" becomes note-cf-a. | verse-54 → unlabeled 438; unlabeled → note-cf-a 174 |
| Nītiśataka 1914, page 258 | मुष्टिभिरेव becomes verse-81; the apostrophe of "women's" becomes note-comment. | unlabeled → verse-81 8,604; unlabeled → note-comment 60 |
| Cole page 3 | The six bars of the ≡ signs on rows 2 and 3 become display-4; the minus sign and four dots become display-2; every piece of the footnote rule becomes separator. | unlabeled → display-4 561; unlabeled → display-2 242; display-4 → separator 124; footnote → separator 133; unlabeled → separator 57 |
| Dutt 14F 225, page 2 | None. The spec differs only in its status text. | None: the label image is byte-identical to version 1. |

On the Cole page, no text component is now unlabeled.

**Second review:** later on 2026-11-04 the user confirmed version 2 of the three corrected references (Nītiśataka 1896 page 123, Nītiśataka 1914 page 258, Cole page 3) and said that version 1 of Telang page 108 and Vavilla page 34 was fine. All nine references are now reviewed. The user also confirmed the version 2 review image of Dutt 14F 225, with right-column labels on the right. The `status` text inside each spec and `passages.json` predates the review and is left unchanged, because evaluations record their hashes.

![Reference version 2, Nītiśataka 1896 page 123](references/gopinath-1896-page-123/review.png)

![Reference version 2, Nītiśataka 1914 page 258](references/gopinath-1914-page-258/review.png)

![Reference version 2, Cole page 3](references/cole-1903-page-003/review.png)

![Reference version 2, Dutt 14F chapter 225 page 2, with right-column labels on the right](references/dutt-mahabharata-14f-chapter-225-page-002/review.png)

### Methods 025, 033 and 035 against the revised references

**Evaluation:** `evaluate.py` of method 035, unchanged, on the three pages whose labels changed. For the first Terra request it scored Terra 025's raw boxes, method 033's polygons and method 035's polygons. For the repeat request it scored Terra 025's run-002 boxes and method 035's run-002 polygons. The outputs went to new folders, `reference-evaluation-version-2/` beside each version 1 `reference-evaluation/`. Run 2026-11-04 19:57:16–19:57:24 UTC. No API call was made.

Other passages' ink / own ink left out / separator pixels, against version 1 and version 2:

| Page | Result | Version 1 | Version 2 |
| --- | --- | --- | --- |
| Cole page 3 | Terra 025 boxes, first request | 123 / 346 / 0 | 123 / 89 / 0 |
| | Method 033 polygons | 0 / 0 / 0 | 0 / 208 / 314 |
| | Method 035 polygons | 0 / 0 / 0 | 0 / 208 / 314 |
| | Terra 025 boxes, repeat request | 86 / 376 / 0 | 86 / 119 / 0 |
| | Method 035 polygons, repeat request | 0 / 0 / 0 | 0 / 208 / 314 |
| Nītiśataka 1896, page 123 | Terra 025 boxes, first request | 613 / 541 / 0 | 613 / 103 / 0 |
| | Methods 033 and 035 polygons | 0 / 0 / 0 | 0 / 0 / 0 |
| | Terra 025 boxes, repeat request | 1,561 / 587 / 0 | 1,561 / 149 / 0 |
| | Method 035 polygons, repeat request | 0 / 0 / 0 | 0 / 0 / 0 |
| Nītiśataka 1914, page 258 | Terra 025 boxes, both requests | 0 / 0 / 0 | 0 / 0 / 0 |
| | Methods 033 and 035 polygons, and method 035 on the repeat request | 0 / 0 / 0 | 0 / 137 / 0 |

Methods 033 and 035 give identical scores on all three pages, and so do method 035's results from the two requests.
- **Raw boxes look better.** Version 1 had counted ink against them that was not text. On the 1896 page, 438 of the 541 pixels left out were the frame piece that version 1 labeled verse-54. On the Cole page, 257 of the 346 were footnote-rule pieces labeled display-4 and footnote.
- **Polygons look worse.** The ownership step and the outlines inherit the line finder's view of the page, as version 1 did, so the correction exposes errors in them:
  - **Cole page 3, own ink left out:** the 208 pixels are two bars of the ≡ sign that begins row 3 of display-4. They are on no line, so no region owns them, and the region's outline passes through the sign.
  - **Cole page 3, separator pixels:** method 033 and 035 regions own the rule pieces attached to lines 47 and 49, so display-4's outline takes in 124 separator pixels and the footnote's 190.
  - **Nītiśataka 1914, own ink left out:** the 137 pixels are the lower-left tail of मुष्टिभिरेव. The word owns no region, but verse 81's outline still covers all but its tail.
  - **Nītiśataka 1896:** the outline of note-cf-a covers the "e" of "done", although the "e" is on no line.
- **Ownership check:** this counts reference ink owned by a region other than the passage's main owner, or by none. It rose from 1,208 to 2,011 pixels on the Cole page, from 0 to 174 on the 1896 page and from 0 to 8,664 on the 1914 page. In every case the increase is exactly the ink that version 2 newly labels as text on no line, which no region owns.

![Method 035 polygons on Cole page 3 against reference version 2](outputs/cole-1903-page-003/035-gpt-6.1-terra-none-column-margin-ownership/reference-evaluation-version-2/comparison.png)

**Robustness:** method 035's `sweep.py`, unchanged, was run again on the nine referenced pages with method 035's recipe and with method 033's (`--recipe-dir`), now against reference version 2, on the same trials. Run started 2026-11-04 19:58:05 UTC. Outputs: `robustness.json` and `robustness-recipe-033-gpt-6.1-terra-none-line-polygons.json` in `outputs/surveys/035-gpt-6.1-terra-none-column-margin-ownership/references-version-2/`. No API call was made.
- **Unchanged references.** On the six pages whose labels did not change, including Dutt, every result is identical to the version 1 sweep.
- **The three revised pages.** Every trial now has a constant error: the ink that version 2 newly labels as text on no line, which no box owns in any trial. That is 803 pixels on the Cole page, 174 on the 1896 page and 8,664 on the 1914 page, so no trial on these pages is clean any more.
  - Beyond that constant, no condition's median or maximum error went up.
  - Some went down, by at most 438 pixels: the frame piece and rule pieces that version 1 counted as text.
- **Recipes.** The two recipes again give identical results in 149 of 153 page–condition pairs. The four differences are the same Kale page 17 and 97 conditions as before.

### Method 036 — GPT-6.1 Terra without reasoning + line ownership with ink on no line and rule pieces, polygon regions: 46 pages

**Method:** [036-gpt-6.1-terra-none-unlined-ink-ownership](methods/036-gpt-6.1-terra-none-unlined-ink-ownership/README.md). This is method 035 with two additions to ownership. Both were made after the version 2 references exposed method 035's errors (entry above). No API call; the sources are the saved Terra 025 results of both requests.
- **Rule pieces:** before ownership, a thin text component is reclassified as a rule piece if it continues a printed rule. That means at most 0.25 character heights tall, within 3 character heights of the rule's ink or of pieces already joined, and within the rows that ink occupies. For the rule itself, only rows its ink crosses in at least half of its nearby columns count. Rule pieces are never owned and act as separators in the outlines.
- **Ink on no line:** after the isolation check, a text component on no line joins the region whose box holds it and whose owned ink is nearest, within 2 character heights. Attachments may chain. The component counts with the region's line that spans its vertical center.

**Settings were chosen by measurement before the run.** With method 035's ownership, every unowned text component on no line that some box holds was listed on all 46 pages with its gap to the nearest region's ink.
- The glyphs newly labeled in reference version 2 have gaps of 0.05–1.6 character heights. So the limit was set at 2, the isolation rule's distance.
- Of the 53 components within 2 character heights, Claude looked at a crop of each of the 29 with at least 40 pixels outside the three revised pages. All are text: letters of a word that the line finder missed, commas, periods, dashes after lead-ins, ≡ bars, and a page-number bracket. None is a frame piece or margin mark.

**Development note:** the first version of the rule-piece step took each rule's whole bounding box as its band. Across the 46 pages it reclassified 53 pieces, two of them wrongly:
- on Kale page 113, a vowel sign's top below the skewed footnote rule, whose bounding box is tall;
- on Kale page 58, a period beside the footnote rule, which there is fused with footnote glyphs into one large component.

The band was changed to the nearby rule ink's rows, and then to rule-like rows only. The final step reclassifies 44 pieces on 8 pages. Claude looked at all of them: pieces of broken rules on Cole pages 2–4, Nītiśataka 1914 page 119 and Kale page 43, and specks in a frame or ornament border on three Nītiśataka pages. The 1896 frame piece that reference version 2 leaves unlabeled is no longer reclassified, because it lies below the frame's rule-like rows. These checks used the method's code in memory; no output was written before the final version.

**Tests:** method 035's nine synthetic tests plus two new ones, all passing:
- a merged word and an ellipsis on no line, with a margin mark in no box;
- a broken rule end that the line finder attaches to a text line.

Under method 035's ownership code, both new tests fail: the word is not owned, and the outlines contain 398 rule pixels.

**Run:** 2026-11-04 20:35:19–20:36:30 UTC, on the 46 pages for the first Terra request and the 43 cross-book pages for the repeat request. Reference evaluations ran 20:37:09–20:37:42 UTC, the cross-book summary at 20:38:13 UTC and the stability comparison at 20:38:15 UTC, all in `outputs/surveys/036-gpt-6.1-terra-none-unlined-ink-ownership/`.

**Changes from method 035:** ownership changed on 24 of the 46 pages for the first request.
- **Attached:** 56 components with 15,898 pixels. Three of them were attached in a second pass, through a chain. Seventeen are specks under 40 pixels inside a box next to text.
- **Rule pieces:** 44, with 1,619 pixels.
- **Telang page 50:** the regions' outlines on the sideways table took in 302 more separator pixels, 4,864 against 4,562. That page was already unusable.
- **Unchanged:** on every other page, separator pixels inside outlines, own ink outside them and other regions' ink inside them are unchanged. So is the number of regions in several pieces. Kale pages 17, 97 and 113 and all six Dutt pages are unchanged.

| Page | Ink pixels whose owner changed | Attached | Rule pieces | Unassigned text pixels, 035 → 036 |
| --- | ---: | --- | --- | --- |
| Nītiśataka 1914, page 258 | 8,681 | मुष्टिभिरेव and an apostrophe, 8,664 px | 1 ornament speck | 72,407 → 63,726 (the rest is the ornament border) |
| Telang page 50 (sideways table) | 1,641 | 8 pieces of the table, 1,641 px | — | 1,831 → 190 |
| Cole page 4 | 1,143 | 2 ≡ bars, 268 px | 23 pieces of two broken rules, 875 px | 385 → 0 |
| Cole page 3 | 1,117 | 9: ≡ bars, a minus sign and an ellipsis, 803 px | 12 pieces of the footnote rule, 314 px | 860 → 0 |
| Vavilla page 130 | 1,074 | 4 dashes, 1,074 px | — | 1,110 → 36 |
| Nītiśataka 1896, page 267 | 1,037 | 7 letters of "snares", 1,019 px | 1 speck by the frame | 1,479 → 442 |
| Nītiśataka 1914, page 119 | 882 | 4 letters and letter pieces, 710 px | 3 rule pieces, 172 px | 68,771 → 68,061 |
| Other 17 pages | 10–415 each | 1–3 letters, dashes, punctuation marks or specks each | 0–2 | |

![Method 036 overlays, Cole](outputs/surveys/036-gpt-6.1-terra-none-unlined-ink-ownership/cross-book-cole-1903.png)

**References:** Against all nine references (version 2 where revised), method 036 gives 0 other passages' ink, 0 own ink left out and 0 separator pixels, for both Terra requests. Method 035 against the same references gives 0 / 208 / 314 on Cole page 3 and 0 / 137 / 0 on Nītiśataka 1914 page 258, and 0 / 0 / 0 elsewhere. The ownership check for method 036 is 0 on every page except Cole page 3. There it is 1,208 pixels, the running header that Terra returned as two regions, which is a grouping difference. For method 035 the check was 2,011, 174 and 8,664 pixels on the three revised pages.

**Stability:** the two Terra requests give identical ownership and keep flags on 34 of 43 pages, against 35 under method 035. The page that differs is Telang page 108. There a 14-pixel speck was attached under the repeat request but not the first, because the two requests' boxes differ. On five other pages the share of owned ink with a corresponding owner changed by at most 0.003. Reading order is identical on all 43 pages.

**Robustness:** method 036's `sweep.py` was run on the nine referenced pages (version 2 where revised) twice, with method 036's recipe and with method 035's (`--recipe-dir`), on identical trials. Run started 2026-11-04 20:37:54 UTC. Outputs: `robustness.json` and `robustness-recipe-035-gpt-6.1-terra-none-column-margin-ownership.json` in the method 036 survey folder. Run through this script, method 035's recipe reproduced its earlier version 2 sweep exactly.
- **Perturbation:** method 036 is identical to method 035 in 107 of the 153 page–condition pairs. It is better in the other 46, all on the three revised pages, and worse in none.
  - **Nītiśataka 1914, page 258:** with each edge moved within ±10 or ±20 px, 20 of 20 trials are clean, against 0. Within ±30 px it is 14 of 20.
  - **Nītiśataka 1896, page 123:** within ±10 px, 20 of 20 against 0; within ±20 px, 15 of 20.
  - **Cole page 3:** every trial still counts the 1,208 pixels of Terra's split header. The median error within ±10 px is 1,208 against 2,011.
- **Source sweep:** of the 49 saved box results on the referenced pages, from 27 methods, method 036 is identical on 46. It is better on 3, Terra 025's results on the three revised pages, and worse on none. Results whose polygons are clean on all three measures rose from 34 to 36. The two newly clean results are Terra's on the 1914 page and on Cole page 3. On the 1896 page, Terra's polygons were already clean, and only the ownership check improved.

**Observation after the run, found by the user:** on Nītiśataka 1914 page 119, the italic word "sarvasvam" at the start of the first note's second line is split between two regions by method 036, and by method 038 on both requests. "sa" and the final "m" go to the note, and "rvasva" goes to the paragraph below. Claude's check of the attached components had confirmed that each was text, not that each went to the right region. The cause is in the line finder (method 032's `geometry.py`, unchanged in every later method):
- **Main glyphs.** A line's horizontal extent comes from its main components, those of normal height. On this line, those are only the Devanagari in parentheses, which start at x = 418.
- **Short glyphs.** These join the nearest line whose extent, widened by one character height, covers them, if that line's band is within 1.2 character heights. The italic lowercase letters are below main height.
- **"rvasva".** These six letter pieces, centers x 280–354, fall within the extent of the next line ("This śloka…"), 26 px below. They were put on it, so methods 033 and 035 already gave them to the paragraph.
- **"s", "a" and "m".** "s" and "a" lie beyond every line's extent and were on no line. They were unassigned in methods 033 and 035, and method 036 attached them to the note, whose box holds them. "m" was on the note's line throughout.

A search of all 46 pages for text components that the line finder put on one line while their center lies within another line's band found 154. Only 46 of them end up, under method 036, with a different owner, or none, from the line they sit in. Of those 46:
- 25 are on Telang's sideways table;
- 9 are unassigned border pieces or marks at page edges;
- the letters of "sarvasvam";
- a closing quotation mark on Nītiśataka 1896 page 123, which Claude judged owned correctly at the time. That was wrong: the reference itself labeled it with the wrong passage (see the method 039 entry);
- a small dash-like mark between two entries of Kale's contents page;
- three specks of 15–24 pixels.

"sarvasvam" is the only word affected. None of the nine reference pages is affected beyond specks.

### Method 037 — GPT-6.1 Terra without reasoning, explicit units and book-neutral types: 46 pages, two requests each

**Method:** [037-gpt-6.1-terra-none-explicit-units](methods/037-gpt-6.1-terra-none-explicit-units/README.md). This is method 025 with a new prompt; model, settings, coordinates and accounting are unchanged. The prompt asks for the finest unit that the page sets apart visually, and defines a book-neutral type for each kind of unit:
- **verse:** one verse with all its lines and its number or end mark. Never two verses in one region; each part of an interrupted verse is separate.
- **paragraph:** prose, including translations and commentary.
- **heading:** including speaker lines.
- **lead_in.**
- **list_item:** for lists, contents and indexes.
- **formula:** lines that continue one another form one formula.
- **note:** footnotes, endnotes, marginal notes and apparatus entries, separated even when they share a printed line. A paragraph or verse set apart within the notes area is its own region.
- **table, figure and caption.**
- **Furniture:** running headers, page numbers, signature marks and catchwords are keep=false.

Columns are read one at a time. The rules were written from the granularity differences that method 025's two requests showed, described in book-neutral terms.

**Inputs:** the 46 pages: Kale pages 17, 97 and 113, and the 43 cross-book pages.

**Run:** first requests 2026-11-04 21:20:28–21:21:58 UTC, repeat requests 21:22:13–21:23:42 UTC, four at a time. All 92 returned HTTP 200 with status `completed` and no validation warnings.
- **Tokens:** each pass used 244,066 input tokens. The repeat read 243,928 of them from the prompt cache. Each pass returned 19,763 output tokens, with zero reasoning tokens.
- **Cost:** estimated $0.4039 for the first pass and $0.1112 for the repeat.
- **Time:** API wall time summed to 316.4 s and 313.4 s, at most 21.1 s per request.
- **Regions:** each pass returned 614 regions, flagging 7 and 11 as uncertain.
- **Types used:** 181 paragraph, about 144 verse, about 115 note, 27 list_item, about 21 heading, 17 lead_in, 12 formula and 1 table, plus furniture.

No two of the 92 outputs are byte-identical between passes, but the region counts agree on 41 of 46 pages.

**Grouping compared with method 025's first requests** (through methods 036 and 038, owned ink pixel by pixel, with the stability script's matching): grouping is identical on 37 of the 46 pages, including Kale's contents page (28 entries) and every Dutt page but one.
- **Dutt 20F:** method 037 splits four of method 025's two-line blocks at the verse number. Each of those blocks ran from the end of one verse (॥११॥) into the start of the next, so this is a correction.
- **Nītiśataka 1896, page 195:** method 037 keeps a note made of "Cf.—", a quoted verse and its source as one region, where method 025 made three.
- **Telang pages 79 and 108:** method 037 splits apparatus entries into their individual readings ((a), (b), (c), …) and into line pieces. On page 79, 12 regions become 18. Method 025 gave one region per entry, keyed by the verse's Roman numeral, which is the reference's unit. The prompt's "one entry of an apparatus of readings … separate neighboring notes even when they share a printed line" was evidently read as one region per reading.
- **Nītiśataka 1896, page 339:** the first request splits each quoted verse's source citation in the notes into a region of its own.
- **Small differences** elsewhere: one keep flag (Vavilla 179's signature mark is now keep=false), and the sideways table on Telang page 50.

**Stability between the two requests** (method 038's `stability.py`, output `stability.json` in `outputs/surveys/038-gpt-6.1-terra-none-explicit-units-line-polygons/`):

| | Method 025 → 036 | Method 037 → 038 |
| --- | --- | --- |
| Pages | 43 | 43 (46 with Kale 17, 97, 113) |
| Ownership and keep flags identical | 34 | 36 (39 of 46) |
| Mean share of owned ink with a corresponding owner | 0.972 | 0.998 |
| Lowest page | 0.204 (Kale contents, 28 / 6 regions) | 0.962 (Nītiśataka 1896 page 339, 13 / 10 regions) |
| Keep-flag differences | 1 | 0 |
| Type differences between requests | 7, on 4 pages | 6, on 3 pages |
| Reading order of matched kept regions identical | 43 of 43 | 46 of 46 |

The large granularity differences of method 025 are gone. Kale contents now gives 28 / 28 regions, Dutt 13F 37 / 37 and Cole page 4 22 / 22; Nītiśataka 1914 page 119 gives 8 / 9 regions, against 9 / 6 before.

Method 037's remaining differences between requests:
- **Nītiśataka 1896, page 339:** source citations split off in one request only.
- **Telang pages 79 and 108:** apparatus readings divided differently, 18 / 20 and 11 / 10 regions.
- **Nītiśataka 1914, pages 119 and 189:** in one request only, a source citation is joined to its quoted verse (page 119), or a quoted verse is separated from its note (page 189).

![Method 038 overlays, Telang](outputs/surveys/038-gpt-6.1-terra-none-explicit-units-line-polygons/cross-book-telang-dli.png)

### Method 038 — GPT-6.1 Terra without reasoning, explicit units + line ownership with ink on no line and rule pieces, polygon regions: 46 pages

**Method:** [038-gpt-6.1-terra-none-explicit-units-line-polygons](methods/038-gpt-6.1-terra-none-explicit-units-line-polygons/README.md), method 036's recipe unchanged, pinned to method 037's boxes. Run 2026-11-04 21:24:22–21:25:38 UTC on both requests for the 46 pages. Reference evaluations ran 21:25:45–21:26:12 UTC. No API call was made.

**References** (other passages' ink / own ink left out / separator pixels; boxes are method 037's raw boxes):

| Page | Method 037 boxes, first / repeat | Method 038 polygons, first / repeat |
| --- | --- | --- |
| Kale page 17 | 131 / 80 / 11; 278 / 9 / 176 | 0 / 0 / 0; 0 / 0 / 0 |
| Kale page 97 | 0 / 0 / 44; 0 / 16 / 123 | 0 / 0 / 0; 0 / 0 / 0 |
| Kale page 113 | 2,465 / 270 / 466; 2,705 / 201 / 204 | 0 / 0 / 0; 0 / 0 / 0 |
| Telang page 108 | 17 / 6,747 / 0; 15 / 36 / 0 | 0 / 6,714 / 0; 0 / 6,714 / 0 |
| Vavilla page 34 | 0 / 0 / 0; 0 / 3 / 0 | 0 / 0 / 0; 0 / 0 / 0 |
| Nītiśataka 1896, page 123 | 720 / 123 / 0; 814 / 161 / 0 | 0 / 0 / 0; 0 / 0 / 0 |
| Nītiśataka 1914, page 258 | 0 / 0 / 0; 0 / 0 / 0 | 0 / 0 / 0; 0 / 0 / 0 |
| Dutt 14F 225, page 2 | 0 / 3 / 0; 0 / 66 / 0 | 0 / 0 / 0; 0 / 0 / 0 |
| Cole page 3 | 101 / 48 / 0; 86 / 147 / 0 | 0 / 0 / 0; 0 / 0 / 0 |

No result merges two kept reference passages or misses one.
- **Telang page 108:** the 6,714 pixels are a grouping difference. Both requests split apparatus-79 into three regions: readings (c) and (d), and the wrapped end of (d), which the first request flagged uncertain. The ownership check there is also 6,714.
- **Cole page 3:** the ownership check is 1,208 pixels, the running header again returned as two regions.
- **Elsewhere:** the ownership check is 0 on the other pages.

Method 036 on method 025's boxes gives 0 / 0 / 0 on all nine.

**Split check, after the user judged either granularity acceptable for the apparatus:** on Telang page 108, the regions that divide apparatus-79 hold only apparatus-79's ink, and they are consecutive in reading order.
- **First request:** regions 6, 7 and 8 own 8,080, 5,023 and 1,691 pixels, at reading orders 5, 6 and 7.
- **Repeat request:** regions 6 and 7 own 8,080 and 6,714 pixels, at orders 5 and 6. Its second region is reading (d) with its wrapped end.

No ink is lost and no other passage's ink is mixed in, so the 6,714 pixels counted as own ink left out are a scoring artifact. The evaluation charges a split to the passage's main region, while a merge is only reported.

A reading-order check of the kept regions on Telang pages 79 and 108 and Nītiśataka 1896 page 339, both requests, found the pieces in text order. It flagged two pairs; both are a two-line box overlapping the previous region, with the text still in order.

### Method 039 — GPT-6.1 Terra without reasoning, explicit units + line ownership with band-chained short glyphs, ink on no line and rule pieces, polygon regions: 46 pages

**Method:** [039-gpt-6.1-terra-none-explicit-units-band-chained-lines](methods/039-gpt-6.1-terra-none-explicit-units-band-chained-lines/README.md). This is method 038 (method 036's recipe on method 037's boxes) with one change to the line finder, made after the user found "sarvasvam" split on Nītiśataka 1914 page 119. A short glyph whose center lies in a line's core band, but outside that line's extent, joins the line if it chains to the line's glyphs through gaps of at most one character height. If the glyph is on another line, it moves only if the band line's glyphs are nearer to it than its current line's in-band glyphs. No API call.

**Development:** three versions were tried, all in memory or on outputs that were deleted before any result was recorded.
- **First version, with no nearness condition.** It fixed "sarvasvam", and moved a closing quotation mark on Nītiśataka 1896 page 123 from the "(H. S. Brown)." line to the verse (b) line. That move scored as a 103-pixel error against reference version 2.
- **Second version.** A nearness test against all of the current line's glyphs kept the quote in place, but also kept "sarvasvam" on the wrong line. The word's own letters, all on the wrong line, were each other's nearest neighbors.
- **Final version.** The test uses only the current line's glyphs that lie within its band.
- **The quote.** Looking at the page showed it closes verse (b): "…दुर्ग्रहः ”". So the first version was right, and reference version 2 was wrong; it inherited the old line finder's choice.

**Reference version 3** of Nītiśataka 1896 page 123 (2026-11-04 22:16 UTC; see its README) labels the quote note-cf-b. Version 2 is kept in `version-2/`. A search of all nine references for glyphs labeled differently from the line band they sit in found only this quote and a 15-pixel speck in Telang page 108's margin, which was left as it is.

**Split-aware scoring:** this method's `evaluate.py` also reports totals beyond reading-order splits. A passage whose other regions hold only its ink, and whose regions are consecutive in reading order, is split as a grouping difference. Earlier totals are unchanged.

**Run:** 2026-11-04 22:16:57–22:18:13 UTC on both requests for the 46 pages. Reference evaluations ran 22:18:32–22:19:13 UTC. Methods 035, 036 and 038 were re-scored on the 1896 page against version 3, in new `reference-evaluation-version-3` folders.

**Tests:** method 038's eleven synthetic tests, all passing; no test was added for the line-finder change. The two real cases are "sarvasvam" and the quote.

**Changes from method 038**, both requests:
- **Pages changed:** 3 of the 46.
  - "sarvasvam" on Nītiśataka 1914 page 119 (1,086 pixels), now whole in the note.
  - The quote on the 1896 page (103 pixels), now with verse (b).
  - A 16–17-pixel speck on Kale page 146 or 246, now joined to the line it ends.
- **Glyphs moved:** 96 short glyphs moved line; most moves stay within one region.

**References:** method 039 gives 0 other passages' ink, 0 own ink left out beyond reading-order splits and 0 separator pixels on all nine references, for both requests. The ownership check beyond splits is 0 everywhere except Cole page 3's split running header, 1,208 pixels.
- **Telang page 108:** the reading-order split of apparatus-79 into 2–3 regions is reported as a grouping difference.
- **Against version 3, the old line finder is now charged:** on the 1896 page, methods 035, 036 and 038 each give 103 / 103 / 0, the quote in the wrong passage.

**Robustness:** each method's own `sweep.py` was run on identical trials, against the current references, for methods 038 and 039. Run started 2026-11-04 22:19:27 UTC. Outputs: `robustness.json` in each method's survey folder.
- **Perturbation:** method 039 is identical to method 038 in 124 of 153 page–condition pairs, better in 28 (the 1896 quote on that page, plus Cole page 3 and Nītiśataka 1914 page 258) and worse in 1. That one is all boxes shifted 40 px down on the 1914 page: 22,762 against 21,631 error pixels, a condition where both fail.
- **Saved box results:** of the 58 on the referenced pages, the only change is on the 1896 page, where Terra 025's and 037's results each go from 103 error pixels to 0.

## Held-out test: 54 fresh pages from ten books

### Test pages

**Inputs:** 54 pages listed in `inputs/pages-fresh.json` and rendered by `inputs/render_pages.py inputs/pages-fresh.json`, each with a provenance record. The renderer now takes the list file as an optional argument; its default is unchanged. Each book's selection rule was fixed on 2026-11-04 before any model saw these pages, and none of the pages was used to write a prompt or a local rule.
- **Telang, Vavilla, and the 1896 and 1914 Nītiśataka editions:** the six pages of the method 032 survey's 12-page sample that the cross-book test skipped.
- **Dutt:** page 2 of the six survey chapter files the cross-book test did not use (14F 069, 15F 080, 17F 001, 18F 087_1, 20F 187, 21F 101).
- **Kale:** pages 22, 64, 106, 148, 190 and 232, the midpoints between the earlier evenly spaced pages and the last page.
- **Three new books:** six pages each, evenly spaced from 10% to 90% of the file.
  - **Hertel's edition of the Pañcatantra** (360 pages): Sanskrit prose and verse with margin line numbers and a two-tier running header.
  - **A. W. Ryder's 1929 Bhagavad-Gita** (`Ryder-BG-orig.pdf`, 96 pages): photographed two-page spreads on a gray background, with page curvature.
  - **Ryder's 1927 Ten Princes, part 1** (69 pages): photographed two-page spreads of English prose, with skew.

Telang and Hertel render at the scan's native 96 dpi equivalent. The Ryder spreads render at about 150 dpi, so each of their pages is only about 800 pixels wide.

**Cole (1903)** has no further pages; all four were used before.

### Passage references for the fresh sample

**Chosen by rule:** the third page of each new book's list, plus the third Kale and the third Dutt page: `hertel-panchatantra-page-152`, `ryder-gita-1929-page-041`, `ryder-ten-princes-1927-page-030`, `kale-1913-page-106` and `dutt-mahabharata-17f-chapter-001-page-002`.

**Built:** 2026-11-04 22:24–22:29 UTC with method 035's `reference.py`. The Terra requests for the sample had already been sent, but no model or method output for these pages was opened until all references were built. Each was checked for glyphs labeled differently from the line band they sit in. No API call was made.

| Page | Lines | Passages (kept) | Notes |
| --- | ---: | --- | --- |
| Hertel page 152 | 25 | 11 (8): running header with its tale line, page number, three prose blocks, verses 345–348, the lead-in किं च ।, margin line numbers | Component rules label the margin line numbers, which are on text lines or on no line, and three header pieces on no line. |
| Ten Princes page 30 (spread) | 59, in two columns, one per page | 8 (4): two running headers, two page numbers, four paragraphs | Line 28 merges two printed lines of the same paragraph. |
| Kale page 106 | 31 | 13 (11): running header, page number, commentary 19's end, verses 20–22 with commentaries, four footnotes on one line | A component rule labels the whole broken footnote rule separator; seven pieces are attached to text lines. Another leaves an isolated speck unlabeled. |
| Dutt 17F 001, page 2 | 85, in two columns | 29 (27): page number, running header, verses 11–25, ten translation paragraphs, two speaker headings | None. |

**Review:** later on 2026-11-04, the user reviewed the four review images above, together with version 3 of Nītiśataka 1896 page 123, and confirmed all five.

**Ryder Gita page 41: no reference.** The method 032 hysteresis ink mask fails on all three Gita pages tried (11, 41 and 71). Its global thresholds, strong 127–139 and weak 191–197, turn the unevenly lit gray paper into ink: 64–78% of each page is masked, and 57–74% of each page is in large components. The line finder found only 14 lines on page 41, on part of the right page. A component-level reference on that mask would be meaningless, and the local ownership methods cannot work on these pages either.

The Ten Princes spreads, photographed the same way but more evenly lit, mask cleanly: 18–20% ink, 5–7% in large components, and about 60 lines per spread.

![Proposed reference, Hertel page 152](references/hertel-panchatantra-page-152/review.png)

![Proposed reference, Ten Princes page 30](references/ryder-ten-princes-1927-page-030/review.png)

![Proposed reference, Kale page 106](references/kale-1913-page-106/review.png)

![Proposed reference, Dutt 17F 001 page 2](references/dutt-mahabharata-17f-chapter-001-page-002/review.png)

### Methods 025 and 037 — GPT-6.1 Terra without reasoning, footnotes prompt and explicit-units prompt: 54 fresh pages, two requests each

**Methods:** [025-gpt-6.1-terra-none-footnotes](methods/025-gpt-6.1-terra-none-footnotes/README.md) and [037-gpt-6.1-terra-none-explicit-units](methods/037-gpt-6.1-terra-none-explicit-units/README.md), unchanged. Both prompts were frozen before these pages were chosen.

**Run:** 2026-11-04, four at a time:
- method 025, first requests 22:22:25–22:24:12 UTC;
- method 037, first requests 22:24:20–22:26:04;
- method 025, repeat requests 22:26:12–22:27:56;
- method 037, repeat requests 22:28:04–22:29:50.

All 216 returned HTTP 200 with status `completed` and no validation warnings, with zero reasoning tokens.

| | Method 025, first | 025, repeat | Method 037, first | 037, repeat |
| --- | ---: | ---: | ---: | ---: |
| Input tokens | 261,519 | 261,519 (261,357 cached) | 279,286 | 279,231 (275,978 cached) |
| Output tokens | 21,424 | 21,327 | 21,212 | 21,459 |
| Regions returned | 655 | 652 | 657 | 665 |
| Estimated cost | $0.4340 | $0.1199 | $0.4551 | $0.1251 |
| API wall time, sum / maximum | 366.7 s / 12.5 s | 354.7 s / 12.5 s | 349.0 s / 12.2 s | 362.6 s / 18.1 s |

### Methods 036, 038 and 039 on the 54 fresh pages

**Methods:**
- [036](methods/036-gpt-6.1-terra-none-unlined-ink-ownership/README.md) on method 025's boxes;
- [038](methods/038-gpt-6.1-terra-none-explicit-units-line-polygons/README.md) and [039](methods/039-gpt-6.1-terra-none-explicit-units-band-chained-lines/README.md) on method 037's boxes.

All unchanged, run on both requests: 2026-11-04 22:30:23–22:34:27 UTC. Reference evaluations used method 039's split-aware `evaluate.py`, 22:34:27–22:35:14 UTC, written to each fresh reference page's `039-…/reference-evaluation/` and `run-002/reference-evaluation/`. The stability comparisons, in `held-out/` folders under methods 036 and 039 in `outputs/surveys/`, ran at 22:35:56 and 22:36:01 UTC. Method 039's cross-book summary and contact sheets, `crossbook.py --pages inputs/pages-fresh.json`, ran at 22:36:08 UTC. No API call was made.

**References** (other passages' ink / own ink left out beyond reading-order splits / separator pixels; first request, then repeat):

| Page | 025 boxes | 036 polygons | 037 boxes | 038 polygons | 039 polygons |
| --- | --- | --- | --- | --- | --- |
| Hertel 152 | 0/18/0; 0/0/0 | 0/0/0; 0/0/0 | 0/18/0; 0/212/0 | 2,303/0/0; 0/0/0 | 2,303/0/0; 0/0/0 |
| Ten Princes 30 | 182/3/0; 153/47/0 | 0/0/0; 0/0/0 | 101/28/0; 69/38/0 | 0/0/0; 0/0/0 | 0/0/0; 0/0/0 |
| Kale 106 | 175/142/0; 245/162/0 | 0/0/0; 0/0/0 | 178/5/0; 214/21/0 | 0/0/0; 0/0/0 | 0/0/0; 0/0/0 |
| Dutt 17F 001, page 2 | 0/28/0; 0/7/0 | 0/0/0; 0/0/0 | 0/47/0; 0/35/0 | 0/0/0; 0/0/0 | 0/0/0; 0/0/0 |

No result merges two kept reference passages or misses one, under either prompt.
- **Hertel 152, 2,303 pixels:** method 037's first request returned no regions for the margin line numbers. The line-based ownership then gives each numeral to the region of the text line it sits on, inside prose 1, verse 345 and prose 2. Method 037's raw boxes stop just short of the numerals.
- **Hertel 152, other requests:** Terra returned one non-kept region per margin number. Every result splits the running header from its tale line, which the reference keeps as one non-kept passage. These two grouping differences make up the ownership check of about 8,000 pixels on this page.

**Stability between the two requests:**

| | Method 025 → 036 | Method 037 → 039 |
| --- | --- | --- |
| Pages with identical ownership and keep flags | 48 of 54 | 48 of 54 |
| Mean share of owned ink with a corresponding owner | 0.997 | 0.996 |
| Lowest page | 0.882 (Telang 64) | 0.908 (Telang 64) |
| Keep-flag / type differences | 0 / 2 | 0 / 3 |
| Reading order of matched kept regions identical | 54 of 54 | 54 of 54 |

Telang's apparatus pages vary under both prompts. Every Dutt, Kale, Vavilla and Ten Princes page is identical under both. The Gita pages count as identical only because their ink mask is broken (below).

**The two prompts compared** (first requests, through methods 036 and 038, which share one local recipe): grouping is identical on 43 of the 54 pages. Of the eleven that differ, five differ only slightly, with ink agreement 0.997 or more:
- **Hertel pages 94, 152 and 209:** margin numbers.
- **Nītiśataka 1896 page 303:** method 037 joins a short "Cf.—" lead-in to its verse.
- **Kale page 64:** the header box takes in one line more under method 025.

The others:
- **Telang 64, 93 and 122:** method 037 again splits apparatus entries into readings and line pieces; on page 93, 9 regions become 18. Method 025 gives one region per numbered entry.
- **Nītiśataka 1914 page 154 and 1896 page 87:** method 037 separates source citations after quoted verses, and a lead-in sentence in the notes, into regions of their own.
- **Hertel 267:** method 037 returns the margin line numbers as non-kept regions, while method 025 omits them.

Method 037's types are the book-neutral ones throughout: paragraph, verse, heading, lead_in, note, list_item, formula, table.

**Method 039 against method 038 on the fresh pages:** ownership differs on 5 pages per request.
- **Short glyphs rejoined:** "genius." on Nītiśataka 1914 page 84 and "follows :--" on 1896 page 375 return to their own lines. Each had produced a region in two pieces.
- **Smaller changes:** small marks and specks on Kale page 64, Hertel page 152 and Gita page 11.

Regions in several pieces, outside the Gita pages, fall from 4 to 2: on Hertel page 324, where the outline takes in the left-margin bracket, and on Telang page 35. Telang page 35 is also where all 6,866 separator pixels inside outlines come from: Terra returned its ruled table as one table region, which contains the rules.

**Two-page spreads:** on the six Ten Princes spreads, both prompts group each page's paragraphs, header and page number correctly, in page order. The line finder treats the two pages as two columns, with about 60 lines per spread, and every local method scores 0 / 0 / 0 on the reference spread.

**Photographed Gita spreads:** the local outlines are meaningless, because most of each page is masked as large components. Terra's raw boxes follow the stanzas, headings and marginal notes, so they are the only usable regions there.

![Method 039 overlays, Hertel's Pañcatantra, fresh pages](outputs/surveys/039-gpt-6.1-terra-none-explicit-units-band-chained-lines/held-out/cross-book-hertel-panchatantra.png)

![Method 039 overlays, Ryder's Ten Princes, fresh pages](outputs/surveys/039-gpt-6.1-terra-none-explicit-units-band-chained-lines/held-out/cross-book-ryder-ten-princes-1927.png)

![Method 039 overlays, Ryder's Gita, fresh pages, showing the failed ink mask](outputs/surveys/039-gpt-6.1-terra-none-explicit-units-band-chained-lines/held-out/cross-book-ryder-gita-1929.png)

## Continuation flags: seven four-page runs

### Test pages and continuation truth

**Inputs:** the 28 pages of `inputs/pages-runs.json`, seven runs of four consecutive pages, each starting at a page with a passage reference: Kale 106–109, Hertel 152–155, Ten Princes 30–33 (two-page spreads), Cole 1–4, Telang 108–111, Dutt 17F chapter 1 pages 1–4, and Nītiśataka 1914 258–261. The rule was fixed on 2026-11-04 before any model saw the 18 pages not used before; those were rendered with `inputs/render_pages.py inputs/pages-runs.json`, and the 10 earlier pages keep their renders.

**Truth:** [references/continuations/truth.json](references/continuations/README.md), written by Claude from the page images before any method 040 output was opened. The user reviewed it on 2026-11-05 through the truth-only review images and found every answer right for regions. Three breaks also fall inside a larger unit that the edges do not record, and that unit continues: the speech that quotes verse 348 on Hertel pages 152–153; the lead-in + verse + commentary group on Kale pages 107–108 and 108–109; and the set of verses 25 and 26 with its translation on Dutt pages 2–3. `truth.json` is unchanged, so its own note still says it is unreviewed.
- **Edges (103, of which 35 continue):** the first and last unit of each stream (body, or notes) in each page or column, and whether it continues from an earlier region or into a later one.
- **Links (13):** 11 in the body, including two from a Ten Princes spread's left page to its right page, and 2 through Telang's critical apparatus.
- **Control:** Nītiśataka 1914 258–261 has no continuations.
- **Anchors:** line ids of the method 032 line finder with an ink-centroid point. A visual check of all anchors showed border ornaments pulling three Nītiśataka 1914 centroids. Those were corrected before any output was scored, and one of them (the notes start on page 260) had the wrong line id.

### Methods 040 and 037 — GPT-6.1 Terra without reasoning, explicit units with and without continuation flags: 28 run pages, two requests each

**Methods:**
- [040-gpt-6.1-terra-none-explicit-units-continuations](methods/040-gpt-6.1-terra-none-explicit-units-continuations/README.md) is method 037's prompt with two booleans per region, `continues_from_earlier` and `continues_later`, defined in one added prompt rule with examples, and required by the schema.
- [037-gpt-6.1-terra-none-explicit-units](methods/037-gpt-6.1-terra-none-explicit-units/README.md), unchanged, ran on the 18 new pages for comparison; the other 10 already had two method 037 requests.

**Run:** 2026-11-04, four at a time: method 040 first requests 23:00:55–23:02:03 UTC (start times), method 037 first requests 23:02:24–23:02:55, method 040 repeat requests 23:03:10–23:04:18, method 037 repeat requests 23:04:38–23:05:10. All 92 returned HTTP 200 with status `completed` and no validation warnings, with zero reasoning tokens.

| | Method 040, first | 040, repeat | Method 037 (18 pages), first | 037, repeat |
| --- | ---: | ---: | ---: | ---: |
| Input tokens | 169,510 | 169,577 (161,352 cached) | 101,894 | 101,894 (101,840 cached) |
| Output tokens | 20,173 | 20,126 | 8,303 | 8,458 |
| Regions returned | 420 | 419 | 259 | 264 |
| Estimated cost | $0.3127 | $0.1190 | $0.1689 | $0.0474 |
| API wall time, sum / maximum | 288.3 s / 18.6 s | 288.7 s / 20.0 s | 135.2 s / 12.9 s | 136.1 s / 13.7 s |

The 92 requests cost an estimated $0.65 in all. On the same 28 pages, method 037's two requests (the 10 earlier pages' from the earlier tests) returned 12,804 and 13,176 output tokens for 399 and 411 regions, 32 tokens per region; method 040's return 48 per region, about 55% more. Its estimated cost per first request is $0.0112 against $0.0096 per page.

### Method 040's flags and the book-level linker

**Linker:** `link.py` in method 040, local, run at 2026-11-05 00:54:55 UTC into `outputs/surveys/040-gpt-6.1-terra-none-explicit-units-continuations/continuations/`.
- **Streams:** kept note regions form the notes stream; other kept regions the body stream (figures and captions would form their own).
- **Rule:** in page order and then reading order, each region is paired with the next region of its stream on the same or the next page. The pair is linked if the first has `continues_later` and the second `continues_from_earlier`. This rule ("both") was fixed before scoring, and three looser rules are reported beside it.
- **Mapping:** each truth anchor maps to the smallest kept model box containing its point, within 15 pixels. Every anchor found a region.

**Flags at the 103 truth edges:**

| | First request | Repeat request |
| --- | ---: | ---: |
| Correct | 95 | 94 |
| Continues, flagged (of 35) | 32 | 31 |
| Does not continue, flagged anyway (of 68) | 5 | 5 |

Flags that were always false, as method 037 implicitly has, would score 68. Per run (first request): Ten Princes and Cole 16 of 16; Dutt and Nītiśataka 1914 15 of 16; Kale 14 of 16; Hertel 7 of 8; Telang 12 of 15 (11 in the repeat).

**Links:**

| Rule | Truth links found, first / repeat | Wrong links, first / repeat |
| --- | --- | --- |
| both (primary) | 11 / 11 of 13 | 0 / 0 |
| later only | 11 / 11 | 0 / 0 |
| earlier only | 12 / 12 | 5 / 5 |
| either | 12 / 12 | 5 / 5 |

- **Found:** all 11 body links in both requests, including both left-to-right page continuations inside the Ten Princes spreads, a hyphenated word at a Kale page break, and Dutt's last right-column paragraph continuing onto the next page.
- **Missed:** both links through Telang's critical apparatus. The entry for verse LXXXII at the foot of page 108 ends "K. Bo. G. N." and continues with "(c) …" at the top of page 109's apparatus, and likewise LXXXVI from page 109 to 110. The model flagged the continued entry at the top of the next page in three of six results (pages 108–110, two requests), but never the last entry at the foot of a page. The "earlier only" rule recovers one of the two links, at the cost of five wrong ones.
- **Unscored links:** the first request also joins two pieces of Kale page 108's footnote 3, which the model split into its first line, shared with footnotes 1 and 2, and the rest, and 11 pairs of line pieces in Telang page 110's apparatus, which that request returned line by line (28 regions). Neither kind is in the truth, which scores only page and column edges.

**The five false flags**, the same five in both requests, are all `continues_from_earlier` on the first region of a page. None produced a wrong link under the primary rule, because the previous page's last region was not flagged as continuing.
- **Kale pages 108 and 109:** a commentary that begins at the top of the page, after its verse ended on the previous page. The model seems to treat verse and commentary as one unit; that is a relation the transcription schema should hold, not a continuation.
- **Nītiśataka 1914 page 261:** a new verse (84) after the previous page's complete English note. A plain error.
- **Dutt 17F chapter 1, page 3:** verse 26, which continues the sentence of verse 25 at the foot of page 2: it has no verb of its own and adds comparisons to verse 25's. The two verses are translated together, in one paragraph after verse 26. Under the prompt's rule of one verse per region, verse 26 begins its own unit, but the sentence does continue.
- **Hertel page 153:** prose resuming after verse 348, which is quoted at the foot of page 152 in the middle of a speech. The prompt counts a unit that resumes after an interruption as continuing, so this flag is defensible, and the truth may be wrong here. Even so, the linker could not make the link, because the paragraph it continues is before the verse in the same stream.

**Streams by type:** on Nītiśataka 1914, the English notes under the rule were typed paragraph in every result, so they join the body stream. With no continuations on those pages, no flag or link was affected.

![Continuation flags and links, Ten Princes 30–33, method 040's first request](outputs/surveys/040-gpt-6.1-terra-none-explicit-units-continuations/continuations/ryder-ten-princes-1927-030-run-001.png)

![Continuation flags and links, Telang 108–111, method 040's first request](outputs/surveys/040-gpt-6.1-terra-none-explicit-units-continuations/continuations/telang-dli-108-run-001.png)

In these sheets, kept boxes are blue (body) or orange (notes), labeled with reading order and type. An up arrow before the label marks `continues_from_earlier` and a down arrow after it `continues_later`. Truth anchors are circled green if the flag was right and red if not, with T or F for the truth.

### Method 041 — GPT-6.1 Terra without reasoning, explicit units with continuation flags + line ownership with band-chained short glyphs, ink on no line and rule pieces, polygon regions: 28 run pages

**Method:** [041-gpt-6.1-terra-none-explicit-units-continuations-band-chained-lines](methods/041-gpt-6.1-terra-none-explicit-units-continuations-band-chained-lines/README.md) is method 039's recipe on method 040's boxes. Region records also carry the two flags. Its `stability.py` adds `--pages`, `--method` and `--against`. Method 039 was also run on method 037's results for the 18 new pages.

**Run:** 2026-11-05 00:49:26–00:51:49 UTC on both requests (method 039 on the new pages within the same span). Some first-request jobs were refused by the overwrite guard, because their repeat-request job had already created the output folder. Those 26 were re-run one at a time, with the repeat folder moved aside and then restored. Reference evaluations ran 00:52:21–00:52:46 UTC; stability comparisons 00:54:05–00:54:10 UTC, in `outputs/surveys/041-gpt-6.1-terra-none-explicit-units-continuations-band-chained-lines/runs/`. No API call was made.

**References** (other passages' ink / own ink left out beyond reading-order splits / separator pixels; first request, then repeat):

| Page | 040 boxes | 041 polygons | 039 polygons |
| --- | --- | --- | --- |
| Kale 106 | 184/6/0; 314/203/0 | 0/0/0; 0/0/0 | 0/0/0; 0/0/0 |
| Hertel 152 | 22/55/0; 0/0/0 | 0/0/0; 0/0/0 | 2,303/0/0; 0/0/0 |
| Ten Princes 30 | 97/40/0; 31/54/0 | 0/0/0; 0/0/0 | 0/0/0; 0/0/0 |
| Cole 3 | 54/73/0; 86/144/0 | 0/0/0; 0/0/0 | 0/0/0; 0/0/0 |
| Telang 108 | 67/65/0; 26/187/0 | 0/0/0; 0/0/0 | 0/0/0; 0/0/0 |
| Nītiśataka 1914, 258 | 0/0/0; 0/0/0 | 0/0/0; 0/0/0 | 0/0/0; 0/0/0 |
| Dutt 17F 001, page 2 | 0/0/0; 0/26/0 | 0/0/0; 0/0/0 | 0/0/0; 0/0/0 |

- **Merges and misses:** no result merges two kept reference passages or misses one.
- **Ownership checks:** the same as method 039's apart from Hertel 152. There, 8,115 pixels from the header and margin numbers in each request, against 7,843 and 8,115 under method 039.
- **Splits in reading order:** Telang 108's repeat request splits three apparatus entries in reading order, against one under method 039.

**Stability on the 28 run pages:**

| | Method 037 → 039 | Method 040 → 041 |
| --- | --- | --- |
| Pages with identical ownership and keep flags between requests | 20 of 28 | 23 of 28 |
| Mean share of owned ink with a corresponding owner | 0.990 | 0.978 |
| Lowest page | 0.894 (Telang 110) | 0.786 (Telang 110) |
| Keep-flag / type differences | 0 / 4 | 0 / 4 |
| Reading order of matched kept regions identical | 28 of 28 | 28 of 28 |

The lower mean comes from Telang pages 110 and 111, where the two method 040 requests split the apparatus differently: 28 against 16 regions on page 110, 8 against 14 on page 111.

**The two prompts compared**, method 041 against method 039, first request with first request and repeat with repeat:
- **Identical:** ownership and keep flags agree on 21 of 28 pages in each comparison.
- **Telang:** the differences are apparatus granularity.
- **Hertel pages 152–154:** margin numbers.
- **Kale page 108:** a footnote that contains a verse is typed verse in one result and note in another.
- **Other type differences:** Cole regions typed paragraph in one result and heading, lead_in or other in the other, and a Nītiśataka 1914 page 261 note typed paragraph.

These are the same kinds of difference as between two requests under one prompt. Adding the flags did not change grouping beyond that variation.
