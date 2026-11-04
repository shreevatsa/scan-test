#!/usr/bin/env python3
"""Refine saved model boxes on unchanged pixels, preserving model grouping."""
import argparse
from datetime import datetime,timezone
import importlib.metadata
import json
from pathlib import Path
import platform
import time
import numpy as np
from PIL import Image
from diagnostics import make_mask,metrics
from regions import digest,display_path,write_json,draw_overlay
from refinement import refine_regions

METHOD_DIR=Path(__file__).resolve().parent
PROJECT_DIR=METHOD_DIR.parent.parent
METHOD_ID=METHOD_DIR.name

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input",type=Path)
    parser.add_argument("--base-regions",type=Path)
    parser.add_argument("--output-dir",type=Path)
    parser.add_argument("--check",action="store_true")
    args=parser.parse_args()
    config=json.loads((METHOD_DIR/"config.json").read_text())
    input_path=args.input.resolve()
    image_bytes=input_path.read_bytes()
    image_hash=digest(image_bytes)
    base_path=(args.base_regions or PROJECT_DIR/"outputs"/input_path.stem/config["base_method_id"]/"regions.json").resolve()
    base=json.loads(base_path.read_text())
    if base["method"]["id"]!=config["base_method_id"] or base["input"]["sha256"]!=image_hash:
        parser.error("Base result must match the pinned method and exact image.")
    with Image.open(input_path) as source:
        rgb=np.asarray(source.convert("RGB")).copy()
    height,width=rgb.shape[:2]
    if (width,height)!=(base["input"]["width"],base["input"]["height"]):
        parser.error("Base result dimensions do not match the image.")
    if args.check:
        print(json.dumps({"method_id":METHOD_ID,"input_id":input_path.stem,
            "base_method_id":config["base_method_id"],"image_size":[width,height],
            "image_sha256":image_hash,"base_result_sha256":digest(base_path.read_bytes())},indent=2))
        return
    output=(args.output_dir or PROJECT_DIR/"outputs"/input_path.stem/METHOD_ID).resolve()
    if output.exists() and (not output.is_dir() or any(output.iterdir())):
        parser.error("Output location is occupied; choose a fresh --output-dir.")
    started_at=datetime.now(timezone.utc).isoformat()
    started=time.perf_counter()
    mask,labels,stats,char_height,rules=make_mask(rgb)
    mask_seconds=time.perf_counter()-started
    step=time.perf_counter()
    refined,summary,warnings=refine_regions(base["regions"],mask,labels,stats,config,rules)
    refine_seconds=time.perf_counter()-step
    step=time.perf_counter()
    overlay=draw_overlay(rgb,refined,mask)
    source_overlay=draw_overlay(rgb,base["regions"],mask)
    render_seconds=time.perf_counter()-step
    files=["run.py","refinement.py","diagnostics.py","regions.py","config.json","requirements.txt"]
    record={
        "schema_version":1,"started_at_utc":started_at,
        "method":{"id":METHOD_ID,"name":config["name"],"settings":config,
            "files_sha256":{name:digest((METHOD_DIR/name).read_bytes()) for name in files}},
        "input":{"id":input_path.stem,"path":display_path(input_path),"sha256":image_hash,"width":width,"height":height},
        "base_result":{"path":display_path(base_path),"sha256":digest(base_path.read_bytes()),
            "method":base["method"],"started_at_utc":base["started_at_utc"]},
        "base_regions":base["regions"],"regions":refined,"refinement_summary":summary,
        "validation_warnings":warnings,"region_types":base["region_types"],
        "uncertain_region_count":sum(x["uncertain"] for x in refined),
        "coordinates":{"format":"[xmin,ymin,xmax,ymax] original-image pixels",
            "bounds":"integer top-left inclusive, bottom-right exclusive",
            "base_coordinates":"unchanged originals preserved in base_regions and source_box"},
        "mask":{"gray_threshold":175,"excluded_margin_fractions":{"top":0.025,"bottom_start":0.94,"left":0.025,"right_start":0.98},
            "horizontal_rule_rows":[[int(a),int(b)] for a,b in rules]},
        "metrics":metrics(refined,mask,labels,stats),
        "timings_seconds":{"mask_creation":mask_seconds,"pixel_refinement":refine_seconds,
            "drawing":render_seconds,"total_before_file_writes":time.perf_counter()-started},
        "cost":{"additional_api_calls":0,"additional_api_cost_usd":0,"source_api":base["api"]},
        "environment":{"python":platform.python_version(),
            "packages":{name:importlib.metadata.version(name) for name in ["numpy","Pillow","opencv-python-headless"]}},
        "artifacts":{"overlay":"overlay.png","source_overlay":"source-overlay.png","mask":"ink-mask.png","regions":"regions.json"}
    }
    output.mkdir(parents=True,exist_ok=True)
    overlay.save(output/"overlay.png")
    source_overlay.save(output/"source-overlay.png")
    Image.fromarray(mask*255).save(output/"ink-mask.png")
    write_json(output/"regions.json",record)
    write_json(output/"run.json",{"status":"completed","method_id":METHOD_ID,
        "started_at_utc":started_at,"input_sha256":image_hash,
        "base_result_sha256":record["base_result"]["sha256"],"timings_seconds":record["timings_seconds"],
        "files_sha256":record["method"]["files_sha256"]})
    print(json.dumps({"output_dir":display_path(output),"refinement_summary":summary,
        "warnings":warnings,"timings_seconds":record["timings_seconds"]},indent=2))

if __name__=="__main__":
    main()
