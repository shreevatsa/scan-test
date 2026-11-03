#!/usr/bin/env python3
"""Run method 001-geometry on one image and save boxes, diagnostics and an overlay."""
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

from geometry import geom_regions, make_mask, metrics, rasterize_boxes

METHOD_DIR = Path(__file__).resolve().parent
PROJECT_DIR = METHOD_DIR.parent.parent
METHOD_ID = METHOD_DIR.name


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
    for order, region in enumerate(regions, 1):
        x1, y1, x2, y2 = region["box"]
        color = "#7a55ad" if region["label"] == "header" else "#087db2"
        draw.rectangle((x1, y1, x2 - 1, y2 - 1), outline=color, width=stroke)
        label = str(order)
        left, top, right, bottom = draw.textbbox((0, 0), label, font=font)
        width, height = right - left + 12, bottom - top + 10
        tx, ty = max(0, x1 - width - 5), max(0, y1)
        draw.rectangle((tx, ty, tx + width, ty + height), fill=color)
        draw.text((tx + 6 - left, ty + 5 - top), label, fill="white", font=font)
    return image


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path, help="Source page image; its filename stem is the input ID")
    parser.add_argument("--output-dir", type=Path, help="Defaults to outputs/<input_id>/001-geometry")
    args = parser.parse_args()
    input_path = args.input.resolve()
    if not input_path.is_file():
        parser.error("Input image does not exist: " + str(input_path))
    input_id = input_path.stem
    output_dir = (args.output_dir or PROJECT_DIR / "outputs" / input_id / METHOD_ID).resolve()
    if output_dir.exists() and (not output_dir.is_dir() or any(output_dir.iterdir())):
        parser.error("Output location is occupied; choose a new --output-dir for another run.")

    started_at = datetime.now(timezone.utc).isoformat()
    start = time.perf_counter()
    with Image.open(input_path) as source:
        rgb = np.asarray(source.convert("RGB")).copy()
    loaded_at = time.perf_counter()
    mask, labels, stats, character_height, rules = make_mask(rgb)
    masked_at = time.perf_counter()
    regions = geom_regions(mask, character_height, rules)
    grouped_at = time.perf_counter()
    diagnostics = metrics(regions, mask, labels, stats)
    measured_at = time.perf_counter()
    overlay = draw_overlay(rgb, regions, mask)
    drawn_at = time.perf_counter()
    h, w = mask.shape
    for order, region in enumerate(regions, 1):
        region["reading_order"] = order

    result = {
        "schema_version": 1,
        "started_at_utc": started_at,
        "method": {
            "id": METHOD_ID,
            "name": "Geometry baseline",
            "files_sha256": {name: sha256(METHOD_DIR / name) for name in
                             ["geometry.py", "run.py", "requirements.txt"]},
        },
        "input": {
            "id": input_id, "path": display_path(input_path),
            "sha256": sha256(input_path), "width": w, "height": h,
        },
        "coordinates": {
            "format": "[x1, y1, x2, y2]",
            "units": "input-image pixels", "origin": "top-left",
            "right_and_bottom_edges": "exclusive",
        },
        "estimated_character_height_px": character_height,
        "regions": regions,
        "metrics": diagnostics,
        "timings_seconds": {
            "image_loading": loaded_at - start,
            "mask_creation": masked_at - loaded_at,
            "line_grouping": grouped_at - masked_at,
            "diagnostics": measured_at - grouped_at,
            "overlay_drawing": drawn_at - measured_at,
            "total_before_file_writes": drawn_at - start,
        },
        "environment": {
            "python": platform.python_version(), "platform": platform.platform(),
            "packages": {name: importlib.metadata.version(name) for name in
                         ["numpy", "scipy", "Pillow", "opencv-python-headless"]},
            "opencv_threads": cv2.getNumThreads(),
        },
        "artifacts": {"overlay": "overlay.png", "measurement_mask": "ink-mask.png"},
    }
    output_dir.mkdir(parents=True, exist_ok=True)
    overlay.save(output_dir / "overlay.png")
    Image.fromarray(mask * 255).save(output_dir / "ink-mask.png")
    (output_dir / "regions.json").write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps({
        "input_id": input_id, "method_id": METHOD_ID,
        "output_dir": display_path(output_dir), **diagnostics,
    }, indent=2))


if __name__ == "__main__":
    main()
