# 002-pp-doclayout-s: PP-DocLayout-S

This method uses PP-DocLayout-S to predict page-layout rectangles, labels and confidence scores from an image.

## Method

1. Load the page as an RGB image.
2. Resize it to 480 × 480 pixels using cubic interpolation.
3. Scale pixel values by 1/255, subtract the RGB means [0.485, 0.456, 0.406], and divide by the standard deviations [0.229, 0.224, 0.225].
4. Run the pinned ONNX model on CPU. Supply the resize factors so its output boxes use the original image coordinates.
5. Keep predictions with confidence at least 0.30.
6. Process predictions in descending confidence order. Suppress a prediction when its intersection-over-union with an already retained box exceeds 0.55, comparing across all classes.
7. Sort the retained boxes by their top edge, then their left edge, and number them in that order.

The ONNX export includes its own suppression of overlapping detections. Step 6 applies an additional pass across classes. Cubic resizing follows the upstream preprocessing configuration's `interp: 2` setting.

| Parameter | Value |
| --- | --- |
| Model input | 480 × 480 RGB |
| Confidence threshold | 0.30 |
| Overlap-suppression threshold | IoU 0.55, across classes |
| Runtime | ONNX Runtime 1.31.1 |
| Execution provider | CPUExecutionProvider |
| Runtime threads | 2 intra-op, 1 inter-op |

`detector.py` preserves the session setup, preprocessing, inference and suppression functions from the earlier experiment. `diagnostics.py` preserves the same foreground-mask and coverage functions used for the geometry result. `run.py` supplies the image-file interface, artifact recording and overlay drawing.

## Model

The upstream model is [PaddlePaddle/PP-DocLayout-S](https://huggingface.co/PaddlePaddle/PP-DocLayout-S). This run uses the community ONNX export [stefanj0/PP-DocLayout-S-ONNX](https://huggingface.co/stefanj0/PP-DocLayout-S-ONNX/tree/7e851b9e5ad66613d7318a3213ab3336ebe0a514), revision `7e851b9e5ad66613d7318a3213ab3336ebe0a514`.

- Model size: 4,917,852 bytes.
- Model SHA-256: `33688dbee1c23e34b81777e97cb428eb40f24b242c02b5f623484959e830aec8`.
- License: Apache-2.0.

`models.json` records the exact URLs, sizes and checksums for the model, its upstream README and the preprocessing configuration. `download_models.py` verifies all three files before saving them under `models/`.

## Run

From the project root, install this method's dependencies in the existing Python 3.12 environment and fetch the pinned model:

```sh
.venv/bin/python -m pip install -r methods/002-pp-doclayout-s/requirements.txt
uv run --offline python methods/002-pp-doclayout-s/download_models.py
```

Run it on the shared input:

```sh
uv run --offline python methods/002-pp-doclayout-s/run.py inputs/kale-1913-page-017.png
```

The runner applies an OS network restriction before importing the inference libraries and verifies it using IPv4 and IPv6 TCP/UDP probes. On macOS it uses `sandbox-exec` with `deny network*`; on Linux it uses libseccomp to deny socket creation and connection/send syscalls. It sets `ORT_DISABLE_TELEMETRY=1` and calls `onnxruntime.disable_telemetry_events()`. The network restriction and probe results are recorded with each run. Dependency installation and model download are separate commands.

The output directory is indexed by input and method:

```text
outputs/kale-1913-page-017/002-pp-doclayout-s/
    regions.json
    overlay.png
    ink-mask.png
```

For a repeat run, use a fresh directory:

```sh
uv run --offline python methods/002-pp-doclayout-s/run.py inputs/kale-1913-page-017.png --output-dir outputs/kale-1913-page-017/002-pp-doclayout-s/run-002
```

Existing nonempty output directories are preserved.

## Output

- `regions.json`: boxes, model labels, confidence scores, proposed order, settings, input/model/code checksums, measurements, stage timings and environment metadata.
- `overlay.png`: numbered rectangles over the source image. Purple marks predictions labelled as page furniture; blue marks other predictions; red marks measured ink outside all boxes.
- `ink-mask.png`: the foreground pixels used for coverage measurements, shown in white.

Box coordinates are `[x1, y1, x2, y2]` in original-image pixels, with the origin at the top left. For measurement, top-left coordinates are rounded down and bottom-right coordinates up; right and bottom edges are exclusive.

The measurement mask uses grayscale intensity below 175, excludes the top 2.5%, bottom 6%, left 2.5% and right 2% of the image, and filters small components, narrow tall borders and long horizontal rules. Coverage is the fraction of mask pixels inside at least one retained box. The mask is used to measure the output; the detector receives the complete RGB page image. Model loading, preprocessing/inference, diagnostics and drawing have separate recorded timings.
