#!/usr/bin/env python3
"""Run method 003-pp-doclayoutv3 on one image."""
import argparse
from datetime import datetime, timezone
import hashlib
import importlib.metadata
import json
from pathlib import Path
import platform
import time

from offline import enter_network_sandbox

NETWORK_RESTRICTION = enter_network_sandbox()

import cv2
import numpy as np
import onnxruntime as ort
from PIL import Image, ImageDraw, ImageFont

from detector import session, v3_detect
from diagnostics import make_mask, metrics, rasterize_boxes

METHOD_DIR = Path(__file__).resolve().parent
PROJECT_DIR = METHOD_DIR.parent.parent
METHOD_ID = METHOD_DIR.name
THRESHOLD = 0.30


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def display_path(path):
    try:
        return path.relative_to(PROJECT_DIR).as_posix()
    except ValueError:
        return str(path)


def draw_overlay(rgb, regions, mask):
    pixels = rgb.copy()
    covered = rasterize_boxes(regions, mask.shape)
    pixels[(mask > 0) & (covered == 0)] = [235, 40, 65]
    image = Image.fromarray(pixels)
    draw = ImageDraw.Draw(image)
    font = ImageFont.load_default(size=max(18, image.width // 48))
    stroke = max(2, image.width // 450)
    furniture = {"header", "number", "footer", "header_image", "footer_image"}
    label_rectangles = []
    for order, region in enumerate(regions, 1):
        x1, y1, x2, y2 = region["box"]
        color = "#7a55ad" if region["label"] in furniture else "#087db2"
        draw.rectangle((x1, y1, x2, y2), outline=color, width=stroke)
        label = str(order)
        left, top, right, bottom = draw.textbbox((0, 0), label, font=font)
        width, height = right - left + 12, bottom - top + 10
        tx, ty = max(0, x1 - width - 5), min(max(0, y1), image.height - height - 1)
        while any(tx < b[2] and tx + width > b[0] and ty < b[3] and ty + height > b[1] for b in label_rectangles):
            if ty + 2 * height + 4 < image.height:
                ty += height + 3
            else:
                tx += width + 3
        label_rectangles.append((tx, ty, tx + width, ty + height))
        draw.rectangle((tx, ty, tx + width, ty + height), fill=color)
        draw.text((tx + 6 - left, ty + 5 - top), label, fill="white", font=font)
    return image


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path, help="Source image; filename stem becomes the input ID")
    parser.add_argument("--output-dir", type=Path, help="Default: outputs/<input_id>/003-pp-doclayoutv3")
    args = parser.parse_args()
    input_path = args.input.resolve()
    if not input_path.is_file():
        parser.error("Input image does not exist: " + str(input_path))
    input_id = input_path.stem
    output_dir = (args.output_dir or PROJECT_DIR / "outputs" / input_id / METHOD_ID).resolve()
    if output_dir.exists() and (not output_dir.is_dir() or any(output_dir.iterdir())):
        parser.error("Output location is occupied; choose a fresh --output-dir.")

    manifest = json.loads((METHOD_DIR / "models.json").read_text())
    for asset in manifest["files"]:
        path = METHOD_DIR / asset["path"]
        if not path.is_file():
            parser.error("Run this method's download_models.py before inference.")
        if path.stat().st_size != asset["size_bytes"] or sha256(path) != asset["sha256"]:
            parser.error("Pinned checksum mismatch: " + asset["path"])
    entry = next(item for item in manifest["files"] if item["path"].endswith(".onnx"))
    model_path = METHOD_DIR / entry["path"]
    category_labels = json.loads((model_path.parent / "config.json").read_text())["id2label"]

    started_at = datetime.now(timezone.utc).isoformat()
    start = time.perf_counter()
    with Image.open(input_path) as source:
        rgb = np.asarray(source.convert("RGB")).copy()
    loaded_at = time.perf_counter()
    mask, labels, stats, character_height, rules = make_mask(rgb)
    masked_at = time.perf_counter()
    sess = session(model_path)
    model_loaded_at = time.perf_counter()
    regions, candidates = v3_detect(sess, rgb, category_labels, threshold=THRESHOLD)
    detected_at = time.perf_counter()
    diagnostics = metrics(regions, mask, labels, stats)
    measured_at = time.perf_counter()
    overlay = draw_overlay(rgb, regions, mask)
    drawn_at = time.perf_counter()
    regions = [dict(region, reading_order=order) for order, region in enumerate(regions, 1)]
    h, w = mask.shape

    result = {
        "schema_version": 1,
        "started_at_utc": started_at,
        "method": {
            "id": METHOD_ID, "name": "PP-DocLayoutV3",
            "files_sha256": {name: sha256(METHOD_DIR / name) for name in
                             ["detector.py", "diagnostics.py", "run.py", "offline.py",
                              "download_models.py", "models.json", "requirements.txt"]},
            "settings": {
                "model_input_size": [800, 800], "resize": "OpenCV INTER_CUBIC",
                "rescale": "1/255", "confidence_threshold": THRESHOLD,
                "candidate_confidence_threshold": 0.20, "top_query_class_pairs": 300,
                "reading_order": "predicted pairwise-order votes with stable sorting",
                "overlapping_predictions": "retained",
            },
            "model_files": manifest["files"],
        },
        "input": {"id": input_id, "path": display_path(input_path),
                  "sha256": sha256(input_path), "width": w, "height": h},
        "coordinates": {"format": "[x1, y1, x2, y2]", "units": "input-image pixels",
                        "origin": "top-left", "rasterization": "floor top-left, ceil bottom-right; exclusive right/bottom"},
        "regions": regions,
        "candidates": candidates,
        "metrics": diagnostics,
        "timings_seconds": {
            "image_loading": loaded_at - start, "mask_creation": masked_at - loaded_at,
            "model_loading": model_loaded_at - masked_at,
            "preprocessing_and_inference": detected_at - model_loaded_at,
            "diagnostics": measured_at - detected_at, "overlay_drawing": drawn_at - measured_at,
            "total_before_file_writes": drawn_at - start,
        },
        "environment": {
            "python": platform.python_version(), "platform": platform.platform(),
            "packages": {name: importlib.metadata.version(name) for name in
                         ["numpy", "Pillow", "opencv-python-headless", "onnxruntime", "scipy"]},
            "onnxruntime_providers": sess.get_providers(),
            "intra_op_threads": 2, "inter_op_threads": 1,
            "opencv_threads": cv2.getNumThreads(),
            "network_restriction": NETWORK_RESTRICTION,
            "ORT_DISABLE_TELEMETRY": "1", "disable_telemetry_events_called": True,
        },
        "artifacts": {"overlay": "overlay.png", "measurement_mask": "ink-mask.png"},
    }
    output_dir.mkdir(parents=True, exist_ok=True)
    overlay.save(output_dir / "overlay.png")
    Image.fromarray(mask * 255).save(output_dir / "ink-mask.png")
    (output_dir / "regions.json").write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps({"input_id": input_id, "method_id": METHOD_ID,
                      "output_dir": display_path(output_dir), **diagnostics}, indent=2))


if __name__ == "__main__":
    main()
