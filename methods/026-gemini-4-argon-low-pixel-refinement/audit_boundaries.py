#!/usr/bin/env python3
"""Audit crop-edge component cuts and render exact-pixel edge details."""
import argparse
import json
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw,ImageFont
from diagnostics import make_mask
from regions import digest,write_json

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input",type=Path)
    parser.add_argument("result",type=Path)
    parser.add_argument("--separator-components",nargs="*",type=int,default=[])
    args=parser.parse_args()
    rgb=np.asarray(Image.open(args.input).convert("RGB")).copy()
    result=json.loads(args.result.read_text())
    if result["input"]["sha256"]!=digest(args.input.read_bytes()):
        parser.error("Result and input hashes differ.")
    out=args.result.parent/"boundary-review"
    if out.exists() and any(out.iterdir()):parser.error("Boundary review already exists.")
    mask,labels,stats,_,_=make_mask(rgb)
    marked=rgb.copy()
    records=[]
    unique=set()
    instances=0
    height,width=mask.shape
    for region in result["regions"]:
        if not region["keep"]:continue
        a=region["box"]
        box=[int(np.floor(a[0])),int(np.floor(a[1])),int(np.ceil(a[2])),int(np.ceil(a[3]))]
        x1,y1,x2,y2=box
        ids,counts=np.unique(labels[y1:y2,x1:x2],return_counts=True)
        cuts=[]
        for ci,count in zip(ids,counts):
            ci,count=int(ci),int(count)
            if ci==0 or count==int(stats[ci,4]):continue
            x,y,w,h,area=map(int,stats[ci])
            separator=ci in args.separator_components
            cuts.append({"component_id":ci,"inside_pixels":count,"outside_pixels":area-count,
                         "component_box":[x,y,x+w,y+h],"area":area,
                         "visually_identified_separator":separator})
            if not separator:
                instances+=1
                unique.add(ci)
                ys,xs=np.where(labels[y:y+h,x:x+w]==ci)
                xs,ys=xs+x,ys+y
                outside=(xs<x1)|(xs>=x2)|(ys<y1)|(ys>=y2)
                marked[ys[outside],xs[outside]]=[235,40,65]
        records.append({"region_id":region["region_id"],"type":region["type"],"box":a,"cuts":cuts})
    marked_image=Image.fromarray(marked)
    draw=ImageDraw.Draw(marked_image)
    for region in result["regions"]:
        draw.rectangle(region["box"],outline="#087db2" if region["keep"] else "#7a55ad",width=1)
    first_verse=next(r for r in result["regions"] if r["type"]=="verse")
    first_comment=next(r for r in result["regions"] if r["type"]=="commentary")
    notes=[r["box"] for r in result["regions"] if r["type"]=="footnote"]
    def window(box):
        return [max(0,int(np.floor(box[0]))),max(0,int(np.floor(box[1]))),
                min(width,int(np.ceil(box[2]))),min(height,int(np.ceil(box[3])))]
    panels=[
        ("First verse: upper edge",window([first_verse["box"][0]-15,first_verse["box"][1]-18,first_verse["box"][2]+15,first_verse["box"][1]+65])),
        ("First commentary: upper edge",window([first_comment["box"][0]-15,first_comment["box"][1]-18,first_comment["box"][2]+15,first_comment["box"][1]+65])),
        ("Footnotes: both printed lines",window([min(b[0] for b in notes)-20,min(b[1] for b in notes)-25,max(b[2] for b in notes)+20,max(b[3] for b in notes)+20])),
    ]
    scale=2
    panel_width=max((box[2]-box[0])*scale for _,box in panels)
    total_height=sum((box[3]-box[1])*scale+45 for _,box in panels)+70
    plate=Image.new("RGB",(panel_width,total_height),"white")
    caption=ImageDraw.Draw(plate)
    font=ImageFont.load_default(size=24)
    caption.text((10,10),result["method"]["id"],fill="black",font=font)
    caption.text((10,37),"Blue: returned crop edges. Red: clipped glyph-mask pixels. Detail scale: 2x.",fill="black",font=font)
    y=70
    for title,box in panels:
        caption.text((10,y+5),title,fill="black",font=font)
        crop=marked_image.crop(box)
        crop=crop.resize((crop.width*scale,crop.height*scale),Image.Resampling.NEAREST)
        plate.paste(crop,(0,y+40))
        y+=crop.height+45
    record={
        "input_sha256":digest(args.input.read_bytes()),"result_sha256":digest(args.result.read_bytes()),
        "method_id":result["method"]["id"],
        "analysis":"Connected components of the declared foreground mask crossing individual kept crop boundaries.",
        "separator_review":{"basis":"Visual inspection of the slanted separator above the footnotes on this input.",
            "component_ids":args.separator_components,
            "components":[{"id":ci,"xywh_and_area":stats[ci].tolist()} for ci in args.separator_components]},
        "content_cut_component_instances_without_separator":instances,
        "unique_nonseparator_cut_component_ids":sorted(unique),
        "unique_nonseparator_cut_components":len(unique),
        "regions":records,"detail_panels":[{"caption":title,"crop_xyxy":box,"scale":scale} for title,box in panels],
        "files_sha256":{name:digest((Path(__file__).resolve().parent/name).read_bytes()) for name in ["audit_boundaries.py","diagnostics.py","regions.py"]},
    }
    out.mkdir(parents=True,exist_ok=True)
    plate.save(out/"details.png")
    write_json(out/"audit.json",record)
    print(json.dumps({"method":record["method_id"],"unique_nonseparator_cut_components":len(unique),
        "content_cut_component_instances_without_separator":instances,"output_dir":str(out)}))

if __name__=="__main__":
    main()
