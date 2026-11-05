# 032-line-skew-separability: text-line skew, curvature and boundary separability

This is a local measurement method, not a region detector. It makes no API calls and never resamples the image: rotations are applied to pixel coordinates. It answers three questions about a page: how much the text lines are rotated and bent, whether neighboring lines or passages can be separated by crop rectangles at all, and how saved model boxes compare with what rectangles could achieve.

## Measurements

**Ink mask.** Hysteresis threshold: strong ink is at or below the Otsu threshold (capped at 200), and weak ink is darker than the midpoint between that threshold and white. A weak 8-connected component is kept only if it contains strong ink. For a pure 0/255 page, OpenCV's Otsu threshold is 0, which is why the comparison is inclusive. Components smaller than max(4 px, page area × 5e-7, (0.1 × character height)²) are specks. Thin components (width ≥ 10 × height, height < 0.4 character heights, width > 3 character heights) are rules. Components taller than 3 character heights or wider than 60% of the page are large non-text, such as borders, long rules, stamps and figures. Character height is the area-weighted median height of components shorter than 5% of the page.

**Page text angle.** This uses the projection-profile method on text pixels, subsampled to at most 400,000. It finds the angle maximizing the sum of squared row counts after rotation: a 0.1° grid over ±6°, then 0.01° steps. Angles are image angles with y downward, so a negative angle means lines rise to the right.

**Lines.** In the page-rotated frame, the image is split into columns at full-height empty gutters (≥ 1.5 character heights wide, with ≥ 10% of text on each side). Within each column, main components (0.55–2.2 character heights tall) are sorted by rotated center and split at gaps of more than 0.35 character heights. Other text components (detached marks, matras, dots, punctuation) join the nearest line band in the same column, within 1.2 character heights. Components whose rotated extent covers two line centers are reported as bridging.

**Line shape.** This is computed only for lines at least 60% of the column width and 10 character heights long. The line is split into 2–10 segments about 5 character heights wide. Each segment's vertical offset is the subpixel peak of its row profile cross-correlated with the whole line's row profile. A linear fit gives the line's own angle. A quadratic fit gives the bow: the quadratic term × (span/2)², positive when the middle of the line is higher than its ends.

**Separability of two pixel sets A above B.** Every test uses pixel centers. Two pixels conflict if their centers are less than one pixel apart in the tested direction, which on the integer grid is exactly the inclusive tight-box test.

| Representation | Test |
| --- | --- |
| Axis-aligned rectangle | Does the tight axis-aligned box of either set contain pixels of the other? |
| Rectangle at the page text angle | The same, in the page-rotated frame. |
| Straight cut at any angle | Is there a line within ±6° (0.01° steps) with all of A's per-column lowest pixels at least one pixel above all of B's per-column highest pixels? |
| Per-column (staircase) cut | In every image column containing both sets, is B's highest pixel below A's lowest? If so, a rectilinear staircase boundary, and hence a polygon, separates them. |

The **line-pair survey** applies these tests to consecutive lines in the same column, provided they overlap horizontally by at least 2 character heights and each has at least one character-height square of ink. A paragraph or verse boundary is one such pair. A non-separable pair means that a tight box around everything above that boundary must contain some ink from below it, or the reverse.

**Passage evaluation** (`evaluate.py`) uses a component-level passage reference. For each kept passage it reports the other passages' ink that is unavoidably inside the tight axis-aligned rectangle, the tight rectangle at the page angle, and the best tight rectangle at any single angle (0.05° steps). For each pair of adjacent passages it runs the tests above and finds the best placement of a single shared edge, with the other edges tight, in the axis-aligned and page-rotated frames. Cost is own ink left out plus other ink included. Saved model boxes are scored the same way, overall and per boundary.

## Run

```sh
uv run --offline python methods/032-line-skew-separability/test_geometry.py
uv run --offline python methods/032-line-skew-separability/analyze_page.py inputs/kale-1913-page-113.png outputs/kale-1913-page-113/032-line-skew-separability
uv run --offline python methods/032-line-skew-separability/reference.py inputs/kale-1913-page-113.png references/kale-1913-page-113/passage-spec.json
uv run --offline python methods/032-line-skew-separability/evaluate.py inputs/kale-1913-page-113.png references/kale-1913-page-113 outputs/kale-1913-page-113/032-line-skew-separability/passage-boundaries \
  --result "GPT-6.1 Terra without reasoning (025)=outputs/kale-1913-page-113/025-gpt-6.1-terra-none-footnotes/regions.json" \
  --result "GPT-6 Astra low reasoning (020)=outputs/kale-1913-page-113/020-gpt-6-astra-low-footnotes/regions.json"
cd methods/032-line-skew-separability && uv run --offline python survey.py ../../outputs/surveys/032-line-skew-separability --workers 8
```

Every command refuses to overwrite existing output. Provenance note, found on 2026-11-04: the per-page outputs, the page-113 passage evaluation and the page-113 reference hash every script in this directory, and `survey.py` was edited after they were written, so their recorded `survey.py` hash is stale. `survey.py` does not take part in those outputs; the hashes of `geometry.py`, `analysis.py`, `evaluate.py`, `reference.py` and `config.json` match. `books.json` lists the survey books, their sampling and a documented exclusion. The survey renders pages at 300 dpi, or at the embedded page image's native resolution when that is lower. It renders grayscale without alpha using PyMuPDF 1.26.6, and saves only downscaled contact-sheet overlays, not page images. Each output records SHA-256 hashes of the input or PDFs and of this method's code and configuration.

Nine synthetic tests passed on 2026-11-04. They cover recovery of known angles (−1.43°, 0°, 0.8°, 2.5°), ink detection on a pure 0/255 page, line counts and assignment of detached marks, bow detection, adjacent-row separability, skewed tight lines that need rotation, interlocking marks that need a staircase, and best-edge cost.

## Artifacts

- `outputs/<input>/032-line-skew-separability/lines.json` and `lines.png`. Lines appear in cycling colors, rules in black, large non-text in dark gray and unassigned text in light gray. A square left of each line pair gives the most constrained representation that separates it: light gray means an axis-aligned rectangle suffices; orange means a rectangle at the page angle is needed; red means a straight cut at another angle; purple means a staircase; black means none of these.
- `references/kale-1913-page-113/`: the proposed passage reference (see its README).
- `outputs/kale-1913-page-113/032-line-skew-separability/passage-boundaries/`:
  - `boundaries.json`: floors, pair tests, best edges and model scores.
  - `representations.png`: tight axis-aligned rectangles and rectangles at the page angle, with other passages' ink inside them in red.
  - One `boundary-*.png` per verse/commentary boundary. Each compares the tight axis-aligned rectangles, the rectangles at the page angle, Terra 025 and Astra 020. Red marks the other passage's ink inside a box, and magenta marks a box's own ink outside it.
- `outputs/surveys/032-line-skew-separability/`: `summary.json`, a `<book>-pages.jsonl` per book with one row per page, and a `<book>-contact.png` per book with six sampled line overlays.

## Recorded results

### Test pages, 2026-11-04 07:09 UTC

| Page | Page text angle | Long-line angles (min … max, excluding line 0) | Median bow | Line pairs not separable: axis-aligned / page angle / any straight cut / staircase |
| --- | ---: | --- | ---: | --- |
| 17 | −0.05° | −0.19° … +0.41° | 2.1 px | 10 / 10 / 6 / 0 of 29 |
| 97 | −0.57° | −0.94° … −0.36° | 1.9 px | 8 / 5 / 2 / 0 of 27 |
| 113 | −1.43° | −1.69° … −1.14° | 2.2 px | 26 / 17 / 12 / 0 of 29 |

Character height is 40, 43 and 40 px, so typical bows are about 5% of a character height. On page 113, line 0 combines the page number with the running header, so its fitted angle and bow are not a real line shape. The detected rules have different angles from the text: −1.09° for page 113's short centered rule, against −1.43° for its text. On page 97 the rule is at −1.21° and the text at −0.57°. A rule's angle is therefore not a reliable estimate of text angle.

### Page 113 passage evaluation, 2026-11-04 07:09 UTC

The reference was proposed by Claude and confirmed correct by the user after this run, on 2026-11-04. This table gives other passages' ink unavoidably inside tight rectangles that enclose all of each passage's own ink, summed over the 12 kept passages:

| Representation | Pixels |
| --- | ---: |
| Axis-aligned rectangles | 3,966 |
| Rectangles at the page angle (−1.43°) | 614 |
| Best single angle per passage | 283 |
| Terra 025, as returned | 3,053 included; 210 own pixels left out; 378 separator pixels |
| Astra 020, as returned | 3,930 included; 94 own pixels left out; 491 separator pixels |

Best single-edge cost (own ink left out plus other ink included) at each verse/commentary boundary. Each cell gives the upper box's bottom edge and then the lower box's top edge:

| Boundary | Best axis-aligned | Best at page angle | Terra 025 | Astra 020 | Straight cut at any angle | Staircase minimum gap |
| --- | --- | --- | --- | --- | --- | ---: |
| verse 42 / commentary 42 | 522 / 564 | 67 / 67 | 601 / 1,141 | 1,644 / 905 | no (−5.8 px) | 10 px |
| commentary 42 / verse 43 | 172 / 60 | 0 / 0 | 334 / 84 | 243 / 60 | yes | 15 px |
| verse 43 / commentary 43 | 0 / 0 | 19 / 19 | 36 / 173 | 7 / 337 | yes (1.0 px) | 7 px |
| commentary 43 / verse 44 | 46 / 24 | 0 / 0 | 201 / 50 | 66 / 25 | yes | 12 px |
| verse 44 / commentary 44 | 182 / 258 | 10 / 10 | 342 / 301 | 217 / 520 | no (0.85 px) | 13 px |

The boundary between commentary 44 and the footnotes, and every boundary between neighboring footnotes, can be separated with axis-aligned rectangles.

### Survey, 2026-11-04 07:14–07:15 UTC

| Book | Pages analyzed | Median abs. page angle | 90th percentile | Maximum | Pages ≥ 0.5° | Line pairs | Not separable: axis-aligned / page angle / any straight cut / staircase |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| kale-1913 | 252 of 252 | 0.06° | 0.34° | 1.43° (p113) | 18 | 7,349 | 18.3% / 17.2% / 10.8% / 0.1% |
| telang-dli | 11 of 12 | 0.01° | 0.10° | 0.15° | 0 | 301 | 15.0% / 15.3% / 12.0% / 0.0% |
| vavilla | 12 of 12 | 0.01° | 0.10° | 0.24° | 0 | 108 | 17.6% / 18.5% / 17.6% / 0.0% |
| gopinath-1896 | 12 of 12 | 0.08° | 0.09° | 0.11° | 0 | 278 | 26.3% / 27.3% / 21.9% / 0.4% |
| gopinath-1914 | 12 of 12 | 0.03° | 0.10° | 0.33° | 0 | 254 | 48.8% / 49.6% / 43.3% / 0.4% (unreliable; see limitations) |
| dutt-mahabharata | 12 of 12 | 0.08° | 0.11° | 0.19° | 0 | 922 | 1.5% / 1.5% / 0.2% / 0.0% |
| cole-1903 | 4 of 4 | 0.01° | 0.01° | 0.01° | 0 | 130 | 13.1% / 13.8% / 12.3% / 0.0% |

Kale's pages with an absolute angle of at least 1° are 113 (−1.43°), 146 (+1.20°), 58 (−1.15°) and 246 (+1.06°).

On Kale's 18 pages at 0.5° or more:
- Line pairs not separable by axis-aligned rectangles fall from 48.3% to 23.2% at the page angle.
- Conflicts larger than a quarter character-height square fall from 22.2% to 5.3%.

On Kale's other 234 pages:
- 15.9% of line pairs are not separable by axis-aligned rectangles, against 16.8% at the page angle.
- 5.0% have conflicts larger than a quarter character-height square, against 4.9% at the page angle.

## Limitations

- Line segmentation is heuristic. Its thresholds were chosen while inspecting Kale page 113 and the first survey contact sheets.
- Gopinath 1914 has a border of small repeated ornaments. Those components join text lines, so that book's line-pair statistics are not reliable.
- Telang PDF page 50 is a sideways table and is excluded from its summary. The ±6° angle search cannot represent a 90° rotation, and an automatic profile check did not detect this page.
- On a page with only one or two lines, a wide word gap can look like a full-height column gutter.
- Line-pair separability is a proxy. A passage boundary can involve ink from earlier lines where the boundary line is short.
- Nothing here measures whether a crop boundary is semantically correct. Only the page-113 reference does that, and it covers one page.
