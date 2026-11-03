---
license: apache-2.0
library_name: onnx
tags:
  - onnx
  - object-detection
  - layout-analysis
  - document-understanding
  - paddleocr
base_model: PaddlePaddle/PP-DocLayoutV3_safetensors
---

# PP-DocLayoutV3 — ONNX export

ONNX export of [PaddlePaddle/PP-DocLayoutV3_safetensors](https://huggingface.co/PaddlePaddle/PP-DocLayoutV3_safetensors), the layout-detection model used in the PaddleOCR-VL-1.5 pipeline.

This export preserves all four model heads: classification logits, bounding boxes, instance-segmentation masks, and reading-order logits. The original PaddlePaddle release outputs polygon points and reading order via a postprocessor that consumes these four tensors.

## Files

| file | size | purpose |
|---|---|---|
| `PP-DocLayoutV3.onnx` | ~5 MB | model graph (references external weights) |
| `PP-DocLayoutV3.onnx.data` | ~137 MB | weight tensors (must sit alongside `.onnx`) |
| `config.json` | — | original model config (HuggingFace-style) |
| `preprocessor_config.json` | — | image preprocessing parameters (800×800 resize, normalize) |
| `inference.yml` | — | original PaddlePaddle inference config (reference only) |

## Inputs / outputs

**Input** (single tensor):

| name | shape | dtype | notes |
|---|---|---|---|
| `pixel_values` | `(B, 3, 800, 800)` | `float32` | Resize image to 800×800, rescale by `1/255`, mean=`[0,0,0]`, std=`[1,1,1]` (matches `preprocessor_config.json`). |

**Outputs** (four tensors):

| name | shape | notes |
|---|---|---|
| `logits` | `(B, 300, 25)` | per-query class logits over 25 layout classes |
| `pred_boxes` | `(B, 300, 4)` | normalized `(cx, cy, w, h)` — convert via standard DETR decoding |
| `out_masks` | `(B, 300, 200, 200)` | per-query instance-segmentation masks; cv2 contour extraction yields polygon points |
| `order_logits` | `(B, 300, 300)` | per-query permutation logits for reading order; argmax / Sinkhorn for ordering |

## Postprocessing

The official postprocessor lives in `transformers.models.pp_doclayout_v3.image_processing_pp_doclayout_v3.PPDocLayoutV3ImageProcessor.post_process_object_detection`. It takes the four output tensors plus a `target_sizes` tensor and returns:

```
{
  "scores":         (N,)      float32
  "labels":         (N,)      int64
  "boxes":          (N, 4)    float32 — axis-aligned (x1, y1, x2, y2) in target coords
  "polygon_points": list[N]   each (P, 2) int polygon vertices in target coords
  "order_seq":      (N,)      int64   — reading-order index
}
```

You can use that postprocessor directly (`transformers >= 5.4`, requires `torch` and `cv2`) or port it to numpy + cv2 for a torch-free runtime.

## Loading

```python
import onnxruntime as ort
import numpy as np

sess = ort.InferenceSession("PP-DocLayoutV3.onnx", providers=["CPUExecutionProvider"])
# preprocess to 800x800 RGB float32, normalize per preprocessor_config.json
pixel_values = ...  # shape (1, 3, 800, 800), float32
logits, pred_boxes, out_masks, order_logits = sess.run(
    ["logits", "pred_boxes", "out_masks", "order_logits"],
    {"pixel_values": pixel_values},
)
```

The `.onnx.data` sidecar is loaded automatically by onnxruntime via the relative `location` reference embedded in the graph. Both files must sit in the same directory.

## How this was exported

1. `pip install transformers==5.6.2 torch==2.11 onnx==1.21 onnxscript`
2. `model = AutoModelForObjectDetection.from_pretrained("PaddlePaddle/PP-DocLayoutV3_safetensors").eval()`
3. Wrap the model so `forward(pixel_values)` returns `(logits, pred_boxes, out_masks, order_logits)`.
4. `torch.onnx.export(wrapped, (pixel_values,), "PP-DocLayoutV3.onnx", opset_version=18, dynamo=True, dynamic_axes={"pixel_values": {0: "batch"}})`
5. Re-save with `onnx.save(..., save_as_external_data=True, location="PP-DocLayoutV3.onnx.data")` to standardize the sidecar filename.

Numerical parity vs torch (random `(1, 3, 800, 800)` input):

| output | max absolute diff |
|---|---|
| `logits` | 1.32e-4 |
| `pred_boxes` | 1.57e-5 |
| `out_masks` | 1.62e-3 |
| `order_logits` | 3.96e-2 |

The `order_logits` deviation reflects accumulated floating-point drift in the decoder's attention; argmax-based reading order is unaffected on the test images we checked.

## Inference speed

CPU (Apple M-series, single page, 800×800 input): **~480 ms/page** with `CPUExecutionProvider`.

## Source

- Original weights: [PaddlePaddle/PP-DocLayoutV3_safetensors](https://huggingface.co/PaddlePaddle/PP-DocLayoutV3_safetensors)
- Original PaddlePaddle release: [PaddlePaddle/PP-DocLayoutV3](https://huggingface.co/PaddlePaddle/PP-DocLayoutV3)
- Paper: [PaddleOCR-VL-1.5 (arXiv:2601.21957)](https://arxiv.org/abs/2601.21957)

## License

Apache-2.0 (inherited from PaddlePaddle/PP-DocLayoutV3_safetensors).
