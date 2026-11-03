#!/usr/bin/env python3
"""Render only valid boxes from the recorded Flash-Lite response, preserving its error."""
import argparse
import json
from pathlib import Path
import numpy as np
from PIL import Image
from diagnostics import make_mask, metrics
from regions import digest, display_path, draw_overlay, validate_and_scale, write_json
from run import usage_breakdown

METHOD_DIR=Path(__file__).resolve().parent
PROJECT_DIR=METHOD_DIR.parent.parent


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("run_dir",type=Path)
    args=parser.parse_args()
    p=args.run_dir.resolve()
    raw=json.loads((p/"parsed-regions.json").read_text())
    state=json.loads((p/"run.json").read_text())
    pricing=json.loads((METHOD_DIR/"pricing.json").read_text())
    output=p/"diagnostic"
    if output.exists() and any(output.iterdir()):
        parser.error("Diagnostic output already exists.")
    accepted,ids,rejected=[],[],[]
    for index,region in enumerate(raw["regions"],1):
        try:
            validate_and_scale({"regions":[region]},1407,2135)
        except ValueError as error:
            rejected.append({"source_region_id":index,"region":region,"error":str(error)})
        else:
            accepted.append(region)
            ids.append(index)
    regions,warnings=validate_and_scale({"regions":accepted},1407,2135)
    for region,index in zip(regions,ids,strict=True):
        region["source_region_id"]=index
    input_path=PROJECT_DIR/"inputs/kale-1913-page-017.png"
    with Image.open(input_path) as image:
        rgb=np.asarray(image.convert("RGB")).copy()
    mask,labels,stats,_,_=make_mask(rgb)
    record={
        "description":"Diagnostic rendering of valid returned rectangles only. Invalid proposals are excluded and preserved below.",
        "raw_region_count":len(raw["regions"]),"rendered_region_count":len(regions),
        "excluded_invalid_regions":rejected,"regions":regions,"validation_warnings":warnings,
        "metrics":metrics(regions,mask,labels,stats),
        "api":{"http_status":state["http_status"],"api_wall_seconds":state["api_wall_seconds"],
               "usage":state["usage"],"tokens_and_cost":usage_breakdown(state["usage"],pricing)},
        "source_sha256":{name:digest((p/name).read_bytes()) for name in ["request.json","response.json","parsed-regions.json","run.json"]},
        "input_sha256":digest(input_path.read_bytes()),
        "files_sha256":{name:digest((METHOD_DIR/name).read_bytes()) for name in ["inspect_response.py","regions.py","diagnostics.py","run.py"]},
    }
    output.mkdir(parents=True,exist_ok=True)
    draw_overlay(rgb,regions,mask).save(output/"overlay.png")
    Image.fromarray(mask*255).save(output/"ink-mask.png")
    write_json(output/"regions.json",record)
    print(json.dumps({"output_dir":display_path(output),"raw_regions":len(raw["regions"]),
                      "rendered":len(regions),"rejected":rejected,"cost":record["api"]["tokens_and_cost"]},indent=2))


if __name__=="__main__":
    main()
