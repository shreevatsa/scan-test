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
