# 003-pp-doclayoutv3: PP-DocLayoutV3

This method uses PP-DocLayoutV3 to predict page-layout rectangles, labels, confidence scores and reading order from an image.

## Method

1. Load the complete page as an RGB image.
2. Resize it to 800 × 800 pixels using cubic interpolation and scale pixel values by 1/255.
3. Run the pinned ONNX model on CPU, requesting class scores (`logits`), rectangles (`pred_boxes`) and pairwise reading-order scores (`order_logits`).
4. Apply the sigmoid function to the class scores and select the 300 highest-scoring query/class pairs.
5. Convert each selected query's normalized center, width and height into `[x1, y1, x2, y2]` coordinates in the original image.
6. Apply sigmoid to the order scores, combine the pairwise order votes, and rank the 300 queries with a stable sort. Sort the candidate regions by their query's resulting rank.
7. Save candidates with confidence at least 0.20 and retain those with confidence at least 0.30 as the output regions.

Each query can contribute more than one class prediction. All retained query/class pairs are preserved, including overlapping or coincident rectangles. The exported category mapping supplies the label for each class.

| Parameter | Value |
| --- | --- |
| Model input | 800 × 800 RGB |
| Resizing | OpenCV INTER_CUBIC |
| Pixel rescaling | 1/255 |
| Selected query/class pairs | Top 300 by sigmoid class score |
| Candidate confidence threshold | 0.20 |
| Output confidence threshold | 0.30 |
| Reading order | Predicted pairwise-order votes |
| Runtime | ONNX Runtime 1.31.1 |
| Execution provider | CPUExecutionProvider |
| Runtime threads | 2 intra-op, 1 inter-op |

The order calculation uses `P = sigmoid(order_logits)` and `votes = triu(P, 1).sum(0) + tril(1 - P.T, -1).sum(0)`. A stable ascending sort of these votes determines each query's rank. The saved `model_order` is this rank; `reading_order` numbers the retained output regions consecutively.

`detector.py` preserves the session setup and PP-DocLayoutV3 inference/postprocessing functions from the earlier experiment. `diagnostics.py` preserves the foreground-mask and coverage functions used by the preceding methods. `run.py` supplies the image interface, artifact recording and overlay drawing.

## Model

The upstream model is [PaddlePaddle/PP-DocLayoutV3_safetensors](https://huggingface.co/PaddlePaddle/PP-DocLayoutV3_safetensors). This run uses the community ONNX export [Bei0001/PP-DocLayoutV3-ONNX](https://huggingface.co/Bei0001/PP-DocLayoutV3-ONNX/tree/ff677269004f03007705f3e7f1bc8d0f4546d299), revision `ff677269004f03007705f3e7f1bc8d0f4546d299`.

| Model file | Bytes | SHA-256 |
| --- | --- | --- |
| PP-DocLayoutV3.onnx | 5,088,167 | `c0721928ff08741bb208ebed539c77170db5234a68cb7e546e6cc9bc172a695b` |
| PP-DocLayoutV3.onnx.data | 136,774,480 | `34df3e4b79d7bbbf82abce1b4f3cde3d540fa57ad42ec8905c352b97c408d437` |

Both files are stored together in `models/v3/`. The model uses the Apache-2.0 license. `models.json` records the pinned download URLs, sizes and checksums for the graph, external weights, category configuration, preprocessing configuration, inference configuration and upstream README.

## Run

From the project root, install the dependencies in the existing Python 3.12 environment and fetch the pinned model:

```sh
.venv/bin/python -m pip install -r methods/003-pp-doclayoutv3/requirements.txt
.venv/bin/python methods/003-pp-doclayoutv3/download_models.py
```

Run it on the shared input:

```sh
.venv/bin/python methods/003-pp-doclayoutv3/run.py inputs/kale-1913-page-017.png
```

The runner verifies every downloaded file against the manifest before loading the model. It applies the same OS network restriction as method 002 before importing inference libraries: macOS `sandbox-exec` with `deny network*`, or Linux libseccomp denying socket creation and connection/send syscalls. It verifies the restriction with IPv4 and IPv6 TCP/UDP probes, sets `ORT_DISABLE_TELEMETRY=1`, and calls `onnxruntime.disable_telemetry_events()`.

Outputs are indexed by input and method:

```text
outputs/kale-1913-page-017/003-pp-doclayoutv3/
    regions.json
    overlay.png
    ink-mask.png
```

For a repeat run, choose a fresh directory:

```sh
.venv/bin/python methods/003-pp-doclayoutv3/run.py inputs/kale-1913-page-017.png --output-dir outputs/kale-1913-page-017/003-pp-doclayoutv3/run-002
```

Existing nonempty output directories are preserved.

## Output

- `regions.json`: retained boxes, labels, confidence scores, query IDs, model order and consecutive reading order; candidates down to confidence 0.20; settings, input/model/code checksums, measurements, stage timings and environment metadata.
- `overlay.png`: numbered rectangles over the source image. Purple marks page-furniture predictions; blue marks other predictions; red marks measured ink outside all output boxes.
- `ink-mask.png`: the foreground pixels used for coverage measurements, shown in white.

Coordinates are `[x1, y1, x2, y2]` in original-image pixels, with the origin at the top left. Measurement rounds top-left coordinates down and bottom-right coordinates up, using exclusive right and bottom edges. Number tags are shifted when necessary to display overlapping predictions' labels.

The measurement mask uses grayscale intensity below 175, excludes the top 2.5%, bottom 6%, left 2.5% and right 2% of the image, and filters small components, narrow tall borders and long horizontal rules. Coverage is the fraction of mask pixels inside at least one retained box. The detector receives the complete RGB image. Model loading, preprocessing/inference, diagnostics and drawing have separate recorded timings.
