#!/usr/bin/env python3
"""Apply method 004 to a page image and saved PP-DocLayoutV3 detections."""
import argparse
from datetime import datetime, timezone
import hashlib
import importlib.metadata
import json
from pathlib import Path
import platform
import time

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

from diagnostics import make_mask, metrics, rasterize_boxes
from refinement import hybrid_regions

METHOD_DIR = Path(__file__).resolve().parent
PROJECT_DIR = METHOD_DIR.parent.parent
METHOD_ID = METHOD_DIR.name
BASE_METHOD_ID = "003-pp-doclayoutv3"


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
        if region["origin"] == "unassigned_ink":
            color = "#c56c06"
        elif region["label"] in furniture:
            color = "#7a55ad"
        else:
            color = "#087db2"
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


def numpy_json_default(value):
    if isinstance(value, np.generic):
        return value.item()
    raise TypeError("Unsupported JSON value: " + type(value).__name__)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path, help="Source image; filename stem becomes the input ID")
    parser.add_argument("--base-regions", type=Path, help="Saved method-3 regions.json; defaults to its indexed output")
    parser.add_argument("--output-dir", type=Path, help="Defaults to outputs/<input_id>/004-pp-doclayoutv3-pixel-refinement")
    args = parser.parse_args()
    input_path = args.input.resolve()
    if not input_path.is_file():
        parser.error("Input image does not exist: " + str(input_path))
    input_id = input_path.stem
    output_dir = (args.output_dir or PROJECT_DIR / "outputs" / input_id / METHOD_ID).resolve()
    if output_dir.exists() and (not output_dir.is_dir() or any(output_dir.iterdir())):
        parser.error("Output location is occupied; choose a fresh --output-dir.")
    base_path = (args.base_regions or PROJECT_DIR / "outputs" / input_id / BASE_METHOD_ID / "regions.json").resolve()
    if not base_path.is_file():
        parser.error("Run method 003-pp-doclayoutv3 on this input first, or supply --base-regions.")
    base_bytes = base_path.read_bytes()
    base = json.loads(base_bytes)
    input_hash = sha256(input_path)
    if base["input"]["sha256"] != input_hash:
        parser.error("Base detections belong to a different input image.")
    if (base["method"]["id"] != BASE_METHOD_ID or
            base["method"]["settings"]["confidence_threshold"] != 0.30):
        parser.error("Expected method 003-pp-doclayoutv3 detections at confidence threshold 0.30.")
    source_regions = [{key: value for key, value in region.items() if key != "reading_order"}
                      for region in base["regions"]]

    started_at = datetime.now(timezone.utc).isoformat()
    start = time.perf_counter()
    with Image.open(input_path) as source:
        rgb = np.asarray(source.convert("RGB")).copy()
    loaded_at = time.perf_counter()
    h, w = rgb.shape[:2]
    if (w, h) != (base["input"]["width"], base["input"]["height"]):
        parser.error("Base detection dimensions differ from the image.")
    mask, labels, stats, character_height, rules = make_mask(rgb)
    masked_at = time.perf_counter()
    refined = hybrid_regions(source_regions, mask, labels, stats, character_height, rules)
    refined_at = time.perf_counter()
    diagnostics = metrics(refined, mask, labels, stats)
    base_diagnostics = metrics(source_regions, mask, labels, stats)
    measured_at = time.perf_counter()
    overlay = draw_overlay(rgb, refined, mask)
    drawn_at = time.perf_counter()
    regions = [dict(region, reading_order=order) for order, region in enumerate(refined, 1)]
    retained_model = sum(r["origin"] == "model_refined" for r in regions)
    recovered = sum(r["origin"] == "unassigned_ink" for r in regions)

    result = {
        "schema_version": 1,
        "started_at_utc": started_at,
        "method": {
            "id": METHOD_ID, "name": "PP-DocLayoutV3 + pixel refinement",
            "files_sha256": {name: sha256(METHOD_DIR / name) for name in
                             ["refinement.py", "diagnostics.py", "run.py", "requirements.txt"]},
            "settings": {
                "base_confidence_threshold": 0.30,
                "exclude_boxes_starting_below_height_fraction": 0.94,
                "component_intersection_minimum": "max(2 pixels, 20% of component area)",
                "component_extension_limit": {"x_width_fraction": 0.025, "y_height_fraction": 0.018},
                "padding_pixels": 2,
                "residual_component_minimum_area": 5,
                "residual_uncovered_threshold": "strictly greater than max(3 pixels, 15% of component area)",
                "recovered_box_filter": "discard when width < 2.5% of image width AND height < estimated character height",
                "reading_order": "top-to-bottom, then left-to-right",
            },
        },
        "input": {"id": input_id, "path": display_path(input_path),
                  "sha256": input_hash, "width": w, "height": h},
        "base_result": {
            "path": display_path(base_path), "sha256": hashlib.sha256(base_bytes).hexdigest(),
            "started_at_utc": base["started_at_utc"], "method": base["method"],
            "input": base["input"],
        },
        "coordinates": {"format": "[x1, y1, x2, y2]", "units": "input-image pixels",
                        "origin": "top-left", "rasterization": "floor top-left, ceil bottom-right; exclusive right/bottom"},
        "estimated_character_height_px": character_height,
        "base_regions": base["regions"],
        "regions": regions,
        "base_metrics": base_diagnostics,
        "metrics": diagnostics,
        "refinement_counts": {
            "base_regions": len(source_regions), "retained_model_regions": retained_model,
            "discarded_model_regions": len(source_regions) - retained_model,
            "recovered_regions": recovered,
        },
        "timings_seconds": {
            "image_loading": loaded_at - start, "mask_creation": masked_at - loaded_at,
            "pixel_refinement": refined_at - masked_at,
            "diagnostics": measured_at - refined_at, "overlay_drawing": drawn_at - measured_at,
            "total_before_file_writes": drawn_at - start,
        },
        "environment": {
            "python": platform.python_version(), "platform": platform.platform(),
            "packages": {name: importlib.metadata.version(name) for name in
                         ["numpy", "Pillow", "opencv-python-headless", "scipy"]},
            "opencv_threads": cv2.getNumThreads(),
        },
        "artifacts": {"overlay": "overlay.png", "measurement_mask": "ink-mask.png"},
    }
    result_text = json.dumps(result, indent=2, default=numpy_json_default) + "\n"
    output_dir.mkdir(parents=True, exist_ok=True)
    overlay.save(output_dir / "overlay.png")
    Image.fromarray(mask * 255).save(output_dir / "ink-mask.png")
    (output_dir / "regions.json").write_text(result_text)
    print(json.dumps({"input_id": input_id, "method_id": METHOD_ID,
                      "output_dir": display_path(output_dir),
                      "refinement_counts": result["refinement_counts"], **diagnostics}, indent=2))


if __name__ == "__main__":
    main()
