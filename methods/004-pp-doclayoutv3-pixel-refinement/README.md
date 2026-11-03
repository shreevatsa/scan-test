# 004-pp-doclayoutv3-pixel-refinement: PP-DocLayoutV3 + pixel refinement

This method applies connected-component boundary refinement and residual-ink recovery to the saved PP-DocLayoutV3 boxes at confidence threshold 0.30.

## Method

1. Load the source image and its saved method-3 detections. Verify that the detections' image checksum matches the input.
2. Construct the foreground mask and connected components using the same mask definition as methods 1–3.
3. Drop a detector box when its top edge lies below 94% of the page height, or when its clipped rectangle has no area.
4. For each retained box, examine the ink components intersecting it. Consider a component when at least `max(2 pixels, 20% of its area)` lies inside the box. Expand the box to enclose that component when the component stays within 2.5% of the image width horizontally and 1.8% of the image height vertically of the current box boundaries.
5. Add two pixels of padding on every side of each retained detector box and clip its coordinates to the image bounds.
6. Rasterize the padded boxes. Include a whole component in a residual mask when its area is at least 5 pixels and its uncovered portion is greater than `max(3 pixels, 15% of its area)`.
7. Group the residual ink into line bands and then regions using the geometry baseline's grouping rules. Discard a recovered region when both its width is less than 2.5% of the page width and its height is less than the estimated character height.
8. Label the added boxes `recovered`. Sort all output boxes by top edge, then left edge, and assign consecutive reading-order numbers.

The foreground mask uses grayscale intensity below 175, excludes the top 2.5%, bottom 6%, left 2.5% and right 2% of the image, and filters small components, narrow tall borders and long horizontal rules.

The residual grouping estimates text margins from the residual mask, smooths horizontal ink counts with Gaussian sigma 0.8, and forms line bands with a count threshold of `max(5, 2% of image width)` and a minimum band height of `max(3, 25% of estimated character height)`. It splits blocks on large line gaps, remembered rules, paragraph indentation, or changes in centered-line classification. These are the same grouping functions used in method 001.

`refinement.py` preserves the original experiment's `geom_regions` and `hybrid_regions` functions. `diagnostics.py` preserves its mask and coverage functions. `run.py` supplies the image/saved-detection interface, input validation, metadata and drawing.

## Inputs

The two inputs are a raw page image and the saved PP-DocLayoutV3 result for that exact image. By default, the latter is read from `outputs/<input_id>/003-pp-doclayoutv3/regions.json`.

The run records the saved detection file's checksum, its source method/settings, original run time and base regions. The PP-DocLayoutV3 inference configuration and pinned model assets are documented in [method 003](../003-pp-doclayoutv3/README.md).

## Run

From the project root, install the dependencies into the existing Python 3.12 environment:

```sh
.venv/bin/python -m pip install -r methods/004-pp-doclayoutv3-pixel-refinement/requirements.txt
```

Create the base detections with method 003 if they have not yet been recorded:

```sh
.venv/bin/python methods/003-pp-doclayoutv3/run.py inputs/kale-1913-page-017.png
```

Apply the refinement:

```sh
.venv/bin/python methods/004-pp-doclayoutv3-pixel-refinement/run.py inputs/kale-1913-page-017.png
```

To refine another saved method-3 run, specify it explicitly and choose a fresh output directory:

```sh
.venv/bin/python methods/004-pp-doclayoutv3-pixel-refinement/run.py inputs/kale-1913-page-017.png --base-regions outputs/kale-1913-page-017/003-pp-doclayoutv3/run-002/regions.json --output-dir outputs/kale-1913-page-017/004-pp-doclayoutv3-pixel-refinement/run-002
```

Existing nonempty output directories are preserved.

## Output

```text
outputs/kale-1913-page-017/004-pp-doclayoutv3-pixel-refinement/
    regions.json
    overlay.png
    ink-mask.png
```

- `regions.json`: base detections and their provenance, refined/recovered regions, source labels and scores where present, new reading order, counts, settings, input/code checksums, measurements and stage timings.
- `overlay.png`: numbered output rectangles. Orange marks recovered regions, purple marks header/page-furniture predictions, blue marks other retained model regions, and red marks uncovered measured ink.
- `ink-mask.png`: the foreground pixels used for coverage measurements, shown in white.

A region's `origin` is `model_refined` or `unassigned_ink`. Model order/query metadata is preserved for retained detections, while `reading_order` follows the final spatial ordering.

Coordinates are `[x1, y1, x2, y2]` in original-image pixels, with the origin at the top left. Measurement rounds top-left coordinates down and bottom-right coordinates up, using exclusive right and bottom edges. Coverage is the fraction of mask pixels inside at least one output box.

Timings cover image loading, mask creation, pixel refinement, diagnostics and drawing for this stage. The saved base run retains its own model-loading and inference timings.

## Recorded page-17 run

The completed page-17 result is saved under `outputs/kale-1913-page-017/004-pp-doclayoutv3-pixel-refinement/run-002/`. The first attempt's image artifacts and JSON-export failure record are retained under `attempt-001/`; the runner now converts NumPy scalar values to standard JSON values before writing any output files.
