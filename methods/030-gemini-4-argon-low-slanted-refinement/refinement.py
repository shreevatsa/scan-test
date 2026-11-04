"""Component completion with padding constrained by detected slanted separators."""
import numpy as np
from completion import refine_regions as complete_and_pad,cut_components


def refine_regions(regions,mask,labels,stats,settings,rules=()):
    refined,summary,warnings=complete_and_pad(regions,mask,labels,stats,settings,())
    trims=[]
    unresolved=[]
    gap=settings["separator_gap_pixels"]
    for original,item in zip(regions,refined,strict=True):
        before=list(item["box"])
        protected=[c["box"] for c in item["boundary_refinement"]["assigned_components"]]
        a,b,c,d=item["boundary_refinement"]["rounded_original_box"]
        ys,xs=np.where(mask[b:d,a:c]>0)
        if len(xs):protected.append([int(xs.min()+a),int(ys.min()+b),int(xs.max()+a+1),int(ys.max()+b+1)])
        if not protected:
            continue
        top=min(p[1] for p in protected)
        bottom=max(p[3] for p in protected)
        applied=[]
        for rule in rules:
            columns=np.asarray(rule["columns_x"])
            selected=(columns>=item["box"][0])&(columns<item["box"][2])
            if not np.any(selected):continue
            rule_top=int(np.asarray(rule["top_by_column"])[selected].min())
            rule_bottom=int(np.asarray(rule["bottom_exclusive_by_column"])[selected].max())
            if bottom<=rule_top:
                bound=max(bottom,rule_top-gap)
                if item["box"][3]>bound:
                    item["box"][3]=bound
                    applied.append({"separator_id":rule["separator_id"],"edge":"bottom","bound":bound})
            elif top>=rule_bottom:
                bound=min(top,rule_bottom+gap)
                if item["box"][1]<bound:
                    item["box"][1]=bound
                    applied.append({"separator_id":rule["separator_id"],"edge":"top","bound":bound})
            elif item["box"][1]<rule_bottom and item["box"][3]>rule_top:
                unresolved.append({"region_id":item["region_id"],"separator_id":rule["separator_id"],
                                   "reason":"protected text spans separator height"})
        for p in protected:
            assert item["box"][0]<=p[0] and item["box"][1]<=p[1] and item["box"][2]>=p[2] and item["box"][3]>=p[3],"Separator trim would remove protected text."
        item["box_xyxy_1000"]=[item["box"][0]*1000/mask.shape[1],item["box"][1]*1000/mask.shape[0],
                               item["box"][2]*1000/mask.shape[1],item["box"][3]*1000/mask.shape[0]]
        item["boundary_refinement"]["separator_constraints"]=applied
        item["boundary_refinement"]["box_before_separator_constraints"]=before
        item["boundary_refinement"]["cut_components_after"]=cut_components(item["box"],labels,stats)
        if applied:trims.append({"region_id":item["region_id"],"before":before,"after":item["box"],"constraints":applied})
    summary.update(
        detected_separator_components=len(rules),separator_constrained_regions=len(trims),
        separator_adjustments=trims,unresolved_separator_regions=unresolved,
        content_cut_component_instances_after=sum(len(r["boundary_refinement"]["cut_components_after"]) for r in refined if r["keep"]),
        changed_boxes=sum(r["box"]!=r["source_box"] for r in refined))
    if unresolved:warnings.append(f"{len(unresolved)} region/separator relationships need inspection.")
    return refined,summary,warnings
