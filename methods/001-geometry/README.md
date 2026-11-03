# 001-geometry: Geometry baseline

This method builds page regions from the positions and spacing of dark pixels. It first finds horizontal line bands, then groups adjacent lines into blocks.

## Method

1. Convert the input image to grayscale and mark pixels with intensity below 175 as ink.
2. Exclude the top 2.5%, bottom 6%, left 2.5% and right 2% of the image. Filter small connected components, narrow tall borders and long horizontal rules. Remember the rules' vertical positions.
3. Estimate character height from the median height of the remaining components whose heights fall between 0.4% and 5% of the image height. Estimate the text's left and right edges from the 1st and 99th percentiles of ink-pixel x-coordinates.
4. Count ink pixels in each horizontal row, smooth the counts, and identify runs of rows containing sufficient ink. Assign nearby whole connected components to these bands and enclose each band's components in a line rectangle.
5. Process the lines from top to bottom. Start a new block at a sufficiently large vertical gap, a horizontal rule, an indentation following a short line, or a change in whether a line is classified as centered.
6. Enclose each block in a rectangle. Label it `verse_like` when a majority of its lines are classified as centered, otherwise `text_block`. Apply position-based `header` and `footnote` labels.

The bottom margin setting corresponds to the digitization watermark in this Kale scan.

## Parameters

All dimensions below are in input-image pixels unless given as proportions. Let `W` and `H` be the image width and height, `C` the estimated character height, and `B` the estimated text-body width.

| Operation | Setting |
| --- | --- |
| Component connectivity | 8 neighbors |
| Small-component removal | Area less than `max(5, floor(H × W / 500000))` |
| Tall-border removal | Height greater than `0.12H` and width less than `0.012W` |
| Horizontal-rule component removal | Width greater than `0.4W` and height less than `0.008H` |
| Additional horizontal-rule removal | Morphological opening with a horizontal kernel of length `max(31, floor(0.4W))` |
| Character-height fallback | `0.015H` |
| Row-count smoothing | Gaussian sigma 0.8 |
| Active row threshold | Smoothed count at least `max(5, 0.02W)` |
| Minimum band height | `max(3, 0.25C)` |
| Component assignment | Area at least 5; nearest band center within `max(1.7C, component height)` of the component's vertical centroid |
| Centered-line classification | Left inset greater than `0.045B`, right inset greater than `0.035B`, line width less than `0.89B` |
| Typical line gap | 40th percentile of gaps between consecutive line rectangles |
| Block split by gap | Gap greater than `max(0.65C, 1.7 × typical gap)` |
| Block split by indentation | Both lines classified as non-centered; next line's left inset greater than `0.045B`; preceding line's right inset greater than `0.08B` |
| Block split by rule | A remembered rule center lies between the lines, allowing a 2-pixel tolerance at either end |
| Header label | Block bottom above `0.12H` |
| Footnote label | Block starts below a remembered rule whose center is below `0.7H` |

`geometry.py` contains the extracted mask, grouping and measurement functions from the earlier experiment. Their function bodies are preserved. `run.py` supplies the image-file interface, run metadata and portable output drawing.

## Run

From the project root, create the local Python 3.12 environment and install the pinned dependencies:

```sh
python3.12 -m venv .venv
.venv/bin/python -m pip install -r methods/001-geometry/requirements.txt
```

Run the method on the shared input:

```sh
.venv/bin/python methods/001-geometry/run.py inputs/kale-1913-page-017.png
```

The output directory is derived from the input filename and method directory:

```text
outputs/kale-1913-page-017/001-geometry/
    regions.json
    overlay.png
    ink-mask.png
```

For another run, provide a fresh output directory:

```sh
.venv/bin/python methods/001-geometry/run.py inputs/kale-1913-page-017.png --output-dir outputs/kale-1913-page-017/001-geometry/run-002
```

Existing nonempty output directories are preserved.

## Output

- `regions.json`: boxes, labels, proposed reading order, input and code hashes, dimensions, diagnostic values, stage timings and environment versions.
- `overlay.png`: the source image with numbered rectangles. Purple indicates a header; blue indicates other regions; red marks measured ink outside all boxes.
- `ink-mask.png`: white pixels are the ink included in the diagnostic measurement.

Boxes use `[x1, y1, x2, y2]` in input-image pixels, with the origin at the top left and exclusive right and bottom edges. Labels and reading order are produced by the geometry rules above.

Measured ink coverage is the fraction of white pixels in `ink-mask.png` that lie inside at least one output rectangle. A partially covered component has at least 8 pixels, at least 3 pixels inside the boxes, and at least `max(3, 5% of its area)` outside them. Stage timings are recorded separately for image loading, mask creation, grouping, diagnostics and drawing.
