#!/usr/bin/env python3
"""Review text clipping, neighboring crop overlap and detected separator inclusion."""
import argparse,json
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw,ImageFont
from separators import make_refinement_mask
from regions import digest,write_json

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input",type=Path);parser.add_argument("result",type=Path)
    args=parser.parse_args()
    method_dir=Path(__file__).resolve().parent
    settings=json.loads((method_dir/"config.json").read_text())["separator_detection"]
    result=json.loads(args.result.read_text())
    if result["input"]["sha256"]!=digest(args.input.read_bytes()):parser.error("Input hash mismatch.")
    output=args.result.parent/"separator-review"
    if output.exists() and any(output.iterdir()):parser.error("Review output already exists.")
    rgb=np.asarray(Image.open(args.input).convert("RGB")).copy()
    mask,labels,stats,_,rules,rule_mask,_=make_refinement_mask(rgb,settings)
    marked=rgb.copy();records=[];unique=set();instances=0;covered_rules=np.zeros_like(mask)
    kept=[r for r in result["regions"] if r["keep"]]
    def ints(box):return [int(np.floor(box[0])),int(np.floor(box[1])),int(np.ceil(box[2])),int(np.ceil(box[3]))]
    for r in kept:
        x1,y1,x2,y2=ints(r["box"])
        ids,counts=np.unique(labels[y1:y2,x1:x2],return_counts=True)
        cuts=[]
        for ci,count in zip(ids,counts):
            ci,count=int(ci),int(count)
            if ci==0 or count==int(stats[ci,4]):continue
            x,y,w,h,area=map(int,stats[ci])
            cuts.append({"component_id":ci,"box":[x,y,x+w,y+h],"inside":count,"outside":area-count})
            unique.add(ci);instances+=1
            ys,xs=np.where(labels[y:y+h,x:x+w]==ci);xs,ys=xs+x,ys+y
            outside=(xs<x1)|(xs>=x2)|(ys<y1)|(ys>=y2)
            marked[ys[outside],xs[outside]]=[235,40,65]
        count=int(rule_mask[y1:y2,x1:x2].sum())
        covered_rules[y1:y2,x1:x2]|=rule_mask[y1:y2,x1:x2]
        records.append({"region_id":r["region_id"],"type":r["type"],"cuts":cuts,"separator_pixels_inside":count})
    overlaps=[]
    for i,a in enumerate(kept):
        for b in kept[i+1:]:
            rect=[max(a["box"][0],b["box"][0]),max(a["box"][1],b["box"][1]),
                  min(a["box"][2],b["box"][2]),min(a["box"][3],b["box"][3])]
            if rect[2]>rect[0] and rect[3]>rect[1]:
                x1,y1,x2,y2=ints(rect)
                overlaps.append({"region_ids":[a["region_id"],b["region_id"]],"box":rect,
                    "text_pixels_in_overlap":int(mask[y1:y2,x1:x2].sum())})
    shown=Image.fromarray(marked)
    draw=ImageDraw.Draw(shown)
    for r in result["regions"]:draw.rectangle(r["box"],outline="#087db2" if r["keep"] else "#7a55ad",width=1)
    h,w=mask.shape
    first_verse=next(r for r in kept if r["type"]=="verse")
    first_comment=next(r for r in kept if r["type"]=="commentary")
    notes=[r["box"] for r in kept if r["type"]=="footnote"]
    panels=[
      ("First verse / commentary boundary",[min(first_verse["box"][0],first_comment["box"][0])-12,min(first_verse["box"][3],first_comment["box"][1])-45,max(first_verse["box"][2],first_comment["box"][2])+12,max(first_verse["box"][3],first_comment["box"][1])+65]),
      ("Footnotes and separators",[min(b[0] for b in notes)-20,min(b[1] for b in notes)-70,max(b[2] for b in notes)+20,max(b[3] for b in notes)+20])]
    panels=[(title,[max(0,int(np.floor(b[0]))),max(0,int(np.floor(b[1]))),min(w,int(np.ceil(b[2]))),min(h,int(np.ceil(b[3])))]) for title,b in panels]
    plate=Image.new("RGB",(max((b[2]-b[0])*2 for _,b in panels),sum((b[3]-b[1])*2+40 for _,b in panels)+75),"white")
    d=ImageDraw.Draw(plate);font=ImageFont.load_default(size=24)
    d.text((8,5),result["method"]["id"]+" / "+result["input"]["id"],fill="black",font=font)
    d.text((8,35),"2x source pixels. Blue: crop edges. Red: text-mask pixels cut by a crop.",fill="black",font=font)
    yy=75
    for title,b in panels:
        d.text((8,yy+4),title,fill="black",font=font)
        crop=shown.crop(b);crop=crop.resize((crop.width*2,crop.height*2),Image.Resampling.NEAREST)
        plate.paste(crop,(0,yy+35));yy+=crop.height+40
    record={"input_sha256":digest(args.input.read_bytes()),"result_sha256":digest(args.result.read_bytes()),
        "method_id":result["method"]["id"],"detector_settings":settings,"detected_separator_count":len(rules),
        "detected_separators":rules,"unique_cut_text_components":len(unique),"cut_text_component_instances":instances,
        "unique_cut_text_component_ids":sorted(unique),"separator_pixels_inside_kept_boxes":int(covered_rules.sum()),
        "overlapping_kept_region_pairs":overlaps,"overlapping_pairs_with_text":sum(r["text_pixels_in_overlap"]>0 for r in overlaps),
        "regions":records,"detail_panels":[{"caption":t,"crop":b,"scale":2} for t,b in panels],
        "files_sha256":{n:digest((method_dir/n).read_bytes()) for n in ["review.py","separators.py","diagnostics.py","regions.py","config.json"]}}
    output.mkdir(parents=True,exist_ok=True);plate.save(output/"details.png");write_json(output/"audit.json",record)
    print(json.dumps({"input":result["input"]["id"],"method":result["method"]["id"],"cut_text_components":len(unique),
        "overlap_pairs":len(overlaps),"overlaps_with_text":record["overlapping_pairs_with_text"],
        "separator_pixels_inside":record["separator_pixels_inside_kept_boxes"]}))

if __name__=="__main__":main()
