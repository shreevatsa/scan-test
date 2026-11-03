#!/usr/bin/env python3
"""Render exact uncovered foreground pixels and enlarged context for the page-17 result."""
import argparse
import hashlib
import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

from diagnostics import rasterize_boxes

PROJECT_DIR = Path(__file__).resolve().parent.parent.parent
RED = (225, 25, 60)
TEAL = (24, 95, 117)
TEXT = (35, 53, 65)


def union(items):
    return [min(a["box"][0] for a in items), min(a["box"][1] for a in items),
            max(a["box"][2] for a in items), max(a["box"][3] for a in items)]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("result", type=Path)
    args = parser.parse_args()
    result_path = args.result.resolve()
    result = json.loads(result_path.read_text())
    directory = result_path.parent
    paths = [directory / name for name in
             ["uncovered-highlight.png", "uncovered-mask.png", "uncovered-details.json"]]
    if any(path.exists() for path in paths):
        parser.error("Diagnostic outputs already exist; preserve the existing view.")
    input_path = PROJECT_DIR / result["input"]["path"]
    if hashlib.sha256(input_path.read_bytes()).hexdigest() != result["input"]["sha256"]:
        parser.error("Input checksum differs from recorded result.")
    source = Image.open(input_path).convert("RGB")
    w, h = source.size
    mask = np.asarray(Image.open(directory / "ink-mask.png")) > 0
    missed = mask & (rasterize_boxes(result["regions"], mask.shape) == 0)
    total = int(missed.sum())
    if total != result["metrics"]["uncovered_ink_pixels"]:
        raise ValueError("Uncovered count differs from the recorded measurement.")
    count, labels, stats, centers = cv2.connectedComponentsWithStats(missed.astype(np.uint8), 8)
    components = [{"id":i, "box":[int(x),int(y),int(x+bw),int(y+bh)], "pixels":int(area)}
                  for i,(x,y,bw,bh,area) in enumerate(stats) if i]
    horizontal = [c for c in components if c["box"][1] > h*0.85
                  and c["box"][2]-c["box"][0] > w*0.15
                  and c["box"][3]-c["box"][1] < h*0.01]
    if not horizontal:
        raise ValueError("Expected lower-page horizontal components for this diagnostic.")
    horizontal_ids = {c["id"] for c in horizontal}
    groups = []
    for component in sorted((c for c in components if c["id"] not in horizontal_ids),
                            key=lambda c:(c["box"][1],c["box"][0])):
        a = component["box"]
        for group in groups:
            b = union(group)
            dx = max(b[0]-a[2], a[0]-b[2], 0)
            dy = max(b[1]-a[3], a[1]-b[3], 0)
            if dx <= 50 and dy <= 15:
                group.append(component)
                break
        else:
            groups.append([component])
    if len(groups) > 6:
        raise ValueError("More than six detail groups; adjust the figure layout.")
    rule_pixels = sum(c["pixels"] for c in horizontal)
    views = [{"label":"A", "description":"Footnote separator",
              "box":union(horizontal), "pixels":rule_pixels,
              "component_ids":sorted(horizontal_ids)}]
    for index, group in enumerate(groups):
        views.append({"label":chr(ord("B")+index), "description":"Small component context",
                      "box":union(group), "pixels":sum(c["pixels"] for c in group),
                      "component_ids":[c["id"] for c in group]})

    # Fade the scan; only the exact measured uncovered pixels receive red.
    rgb = np.asarray(source)
    faded = np.rint(rgb.astype(float)*0.35 + 255*0.65).astype(np.uint8)
    faded[missed] = RED
    highlighted = Image.fromarray(faded)
    page = highlighted.copy()
    d = ImageDraw.Draw(page)
    page_font = ImageFont.load_default(size=25)
    for view in views:
        x1,y1,x2,y2 = view["box"]
        if view["label"] == "A":
            rect = (x1-8,y1-9,x2+8,y2+9)
            d.rectangle(rect,outline=TEAL,width=2)
            tx,ty = x1-40,y1-9
        else:
            cx,cy = (x1+x2)/2,(y1+y2)/2
            d.ellipse((cx-13,cy-13,cx+13,cy+13),outline=TEAL,width=2)
            tx,ty = cx+18,cy-20
        d.text((tx,ty),view["label"],font=page_font,fill=TEAL)

    canvas_w, canvas_h = w+900, h+150
    canvas = Image.new("RGB",(canvas_w,canvas_h),"white")
    draw = ImageDraw.Draw(canvas)
    title_font = ImageFont.load_default(size=34)
    body_font = ImageFont.load_default(size=23)
    small_font = ImageFont.load_default(size=20)
    draw.text((32,20),"GPT-6 Astra: uncovered foreground pixels",font=title_font,fill=TEXT)
    draw.text((32,68),f"Red = exact counted pixels outside all 14 boxes. Total: {total:,}. Teal = detail markers.",font=body_font,fill=TEXT)
    page_x,page_y = 20,115
    canvas.paste(page,(page_x,page_y))
    side_x = w+65
    draw.text((side_x,125),f"A: {rule_pixels:,} pixels ({100*rule_pixels/total:.1f}%)",font=title_font,fill=TEXT)
    draw.text((side_x,174),"Horizontal separator above the footnotes",font=body_font,fill=TEXT)
    x1,y1,x2,y2 = views[0]["box"]
    crop = highlighted.crop((max(0,x1-15),max(0,y1-22),min(w,x2+15),min(h,y2+38)))
    crop.thumbnail((790,170),Image.Resampling.NEAREST)
    canvas.paste(crop,(side_x,219))
    draw.text((side_x,365),f"B-G: remaining {total-rule_pixels} pixels in {len(components)-len(horizontal)} components",font=body_font,fill=TEXT)
    draw.text((side_x,400),"Context enlarged 5x; red pixels are not expanded.",font=small_font,fill=TEXT)

    for index, view in enumerate(views[1:]):
        column,row = index%2,index//2
        tx,ty = side_x+column*410,465+row*430
        x1,y1,x2,y2 = view["box"]
        cx,cy = (x1+x2)/2,(y1+y2)/2
        crop_w,crop_h = 76,60
        crop_box = [int(cx-crop_w/2),int(cy-crop_h/2),int(cx+crop_w/2),int(cy+crop_h/2)]
        crop = highlighted.crop(crop_box).resize((380,300),Image.Resampling.NEAREST)
        draw.text((tx,ty),f'{view["label"]}: {view["pixels"]} pixels',font=body_font,fill=TEXT)
        canvas.paste(crop,(tx,ty+40))
        draw.rectangle((tx-1,ty+39,tx+380,ty+340),outline=(210,219,225),width=1)
        draw.text((tx,ty+350),f'x {x1}-{x2-1}, y {y1}-{y2-1}',font=small_font,fill=TEXT)
        view["crop_box"] = crop_box

    draw.text((side_x,1825),"The original boxes and their coordinates are unchanged.",font=small_font,fill=TEXT)
    draw.text((side_x,1860),"Gray: source image context. Red: uncovered mask pixels.",font=small_font,fill=TEXT)
    draw.text((side_x,1895),"Zooms use nearest-neighbor enlargement.",font=small_font,fill=TEXT)
    canvas.save(paths[0])
    Image.fromarray(missed.astype(np.uint8)*255).save(paths[1])
    details = {
        "source_result":str(result_path.relative_to(PROJECT_DIR)),
        "source_result_sha256":hashlib.sha256(result_path.read_bytes()).hexdigest(),
        "input_sha256":result["input"]["sha256"],
        "script_sha256":hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        "uncovered_pixels":total,
        "components":components,
        "footnote_separator_pixels":rule_pixels,
        "other_pixels":total-rule_pixels,
        "views":views,
        "rendering":{"red":"exact uncovered pixels","context_opacity":0.35,
                     "small_detail_scale":5,"detail_resampling":"nearest-neighbor"},
    }
    paths[2].write_text(json.dumps(details,indent=2)+"\n")
    print(json.dumps({"uncovered_pixels":total,"footnote_separator_pixels":rule_pixels,
                      "other_pixels":total-rule_pixels,
                      "output":str(paths[0].relative_to(PROJECT_DIR))},indent=2))


if __name__ == "__main__":
    main()
