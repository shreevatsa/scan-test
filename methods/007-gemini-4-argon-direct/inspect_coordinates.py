#!/usr/bin/env python3
"""Inspect the recorded Argon response assuming its coordinates are in y/x order."""
import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image

from regions import digest, display_path, draw_overlay, validate_and_scale, write_json

METHOD_DIR = Path(__file__).resolve().parent
PROJECT_DIR = METHOD_DIR.parent.parent


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("run_dir", type=Path)
    args = parser.parse_args()
    run_dir = args.run_dir.resolve()
    source_path = run_dir/"parsed-regions.json"
    result_path = run_dir/"regions.json"
    raw = json.loads(source_path.read_text())
    source = json.loads(result_path.read_text())
    output = run_dir/"coordinate-order-check"
    if output.exists() and (not output.is_dir() or any(output.iterdir())):
        parser.error("Coordinate inspection output already exists.")
    converted = {"regions":[]}
    for region in raw["regions"]:
        a,b,c,d = region["box_1000"]
        converted["regions"].append(dict(region, box_1000=[b,a,d,c]))
    regions, warnings = validate_and_scale(converted, source["input"]["width"], source["input"]["height"])
    for region, original in zip(regions, raw["regions"], strict=True):
        region["returned_box_1000"] = original["box_1000"]
    input_path = PROJECT_DIR/source["input"]["path"]
    assert digest(input_path.read_bytes()) == source["input"]["sha256"]
    with Image.open(input_path) as image:
        rgb = np.asarray(image.convert("RGB")).copy()
    with Image.open(run_dir/"ink-mask.png") as image:
        mask = (np.asarray(image) > 0).astype(np.uint8)
    output.mkdir(parents=True, exist_ok=True)
    draw_overlay(rgb, regions, mask).save(output/"overlay.png")
    record = {
        "description":"Diagnostic view interpreting returned coordinates as [y1,x1,y2,x2].",
        "source": {
            "parsed_regions":display_path(source_path),
            "parsed_regions_sha256":digest(source_path.read_bytes()),
            "regions":display_path(result_path),
            "regions_sha256":digest(result_path.read_bytes()),
            "response_sha256":digest((run_dir/"response.json").read_bytes()),
        },
        "transformation": {
            "requested_order":"x1,y1,x2,y2",
            "assumed_returned_order":"y1,x1,y2,x2",
            "permutation":[1,0,3,2],
            "pixel_conversion":"x*width/1000, y*height/1000",
            "boundary_adjustment":False,
        },
        "input":source["input"],
        "regions":regions,
        "validation_warnings":warnings,
        "files_sha256": {
            name:digest((METHOD_DIR/name).read_bytes())
            for name in ["inspect_coordinates.py","regions.py","diagnostics.py"]
        },
    }
    write_json(output/"regions.json", record)
    print(json.dumps({"output_dir":display_path(output),"regions":len(regions),"warnings":warnings},indent=2))


if __name__ == "__main__":
    main()
