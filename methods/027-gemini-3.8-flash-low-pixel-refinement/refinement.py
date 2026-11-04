"""Complete nearby foreground components, then pad boxes within neighboring gaps."""
import math
import numpy as np


def pixel_box(box):
    return [math.floor(box[0]), math.floor(box[1]), math.ceil(box[2]), math.ceil(box[3])]


def cut_components(box, labels, stats):
    x1,y1,x2,y2=pixel_box(box)
    ids,counts=np.unique(labels[y1:y2,x1:x2],return_counts=True)
    return [{"component_id":int(ci),"inside_pixels":int(count),"area":int(stats[ci,4])}
            for ci,count in zip(ids,counts) if ci and 0<count<int(stats[ci,4])]


def refine_regions(regions, mask, labels, stats, settings, rules=()):
    height,width=mask.shape
    originals=[pixel_box(r["box"]) for r in regions]
    padding=[math.ceil(width*settings["padding_width_fraction"]),
             math.ceil(height*settings["padding_height_fraction"])]
    limits=[math.ceil(width*settings["maximum_extension_width_fraction"]),
            math.ceil(height*settings["maximum_extension_height_fraction"])]
    n=len(regions)
    owned=[[] for _ in regions]
    overlaps={}
    warnings=[]
    ambiguous=[]
    rejected=[]
    for index,box in enumerate(originals):
        x1,y1,x2,y2=box
        ids,counts=np.unique(labels[y1:y2,x1:x2],return_counts=True)
        for ci,count in zip(ids,counts):
            if ci: overlaps.setdefault(int(ci),[]).append((int(count),index))
    for ci in range(1,len(stats)):
        x,y,w,h,area=map(int,stats[ci])
        component=[x,y,x+w,y+h]
        candidates=overlaps.get(ci,[])
        if candidates:
            best=max(count for count,index in candidates)
            winners=[index for count,index in candidates if count==best]
            if len(winners)!=1:
                ambiguous.append({"component_id":ci,"candidate_region_ids":[regions[i]["region_id"] for i in winners]})
                continue
            owner=winners[0]
            reason="intersects original box"
        else:
            nearby=[]
            for index,(x1,y1,x2,y2) in enumerate(originals):
                dx=max(x1-component[2],component[0]-x2,0)
                dy=max(y1-component[3],component[1]-y2,0)
                distance=(dx/max(1,padding[0]))**2+(dy/max(1,padding[1]))**2
                if distance<=1:
                    nearby.append((distance,index))
            if not nearby: continue
            distance=min(d for d,index in nearby)
            winners=[index for d,index in nearby if abs(d-distance)<1e-9]
            if len(winners)!=1:
                ambiguous.append({"component_id":ci,"candidate_region_ids":[regions[i]["region_id"] for i in winners]})
                continue
            owner=winners[0]
            reason="nearest detached component within padding distance"
        a=originals[owner]
        if (component[0]<a[0]-limits[0] or component[1]<a[1]-limits[1] or
                component[2]>a[2]+limits[0] or component[3]>a[3]+limits[1]):
            rejected.append({"component_id":ci,"region_id":regions[owner]["region_id"],
                             "reason":"component exceeds maximum extension","component_box":component})
            continue
        owned[owner].append({"component_id":ci,"box":component,"reason":reason})
    cores=[]
    for original,components in zip(originals,owned):
        boxes=[original]+[c["box"] for c in components]
        cores.append([min(b[0] for b in boxes),min(b[1] for b in boxes),
                      max(b[2] for b in boxes),max(b[3] for b in boxes)])
    # Padding stops at the midpoint between completed neighboring rectangles.
    caps=[[0,0,width,height] for _ in regions]
    constraints=[[] for _ in regions]
    conflicts=[]
    for i,a in enumerate(cores):
        for j in range(i+1,n):
            b=cores[j]
            axes=[]
            if a[2]<=b[0]: axes.append(((b[0]-a[2])/width,0,i,j,a[2],b[0]))
            if b[2]<=a[0]: axes.append(((a[0]-b[2])/width,0,j,i,b[2],a[0]))
            if a[3]<=b[1]: axes.append(((b[1]-a[3])/height,1,i,j,a[3],b[1]))
            if b[3]<=a[1]: axes.append(((a[1]-b[3])/height,1,j,i,b[3],a[1]))
            if not axes:
                conflicts.append([regions[i]["region_id"],regions[j]["region_id"]])
                continue
            _,axis,earlier,later,end,start=max(axes)
            midpoint=(end+start)/2
            caps[earlier][axis+2]=min(caps[earlier][axis+2],math.floor(midpoint))
            caps[later][axis]=max(caps[later][axis],math.ceil(midpoint))
    # Long horizontal separator rows bound padding, without removing original pixels.
    for index,core in enumerate(cores):
        for top,bottom in rules:
            top,bottom=int(top),int(bottom)
            if bottom<=core[1] and bottom>caps[index][1]:
                caps[index][1]=bottom
            if top>=core[3] and top<caps[index][3]:
                caps[index][3]=top
    refined=[]
    changed=0
    for index,(region,original,core,cap) in enumerate(zip(regions,originals,cores,caps)):
        wanted=[core[0]-padding[0],core[1]-padding[1],
                core[2]+padding[0],core[3]+padding[1]]
        box=[max(wanted[0],cap[0]),max(wanted[1],cap[1]),
             min(wanted[2],cap[2]),min(wanted[3],cap[3])]
        assert box[0]<=core[0] and box[1]<=core[1] and box[2]>=core[2] and box[3]>=core[3]
        item={k:v for k,v in region.items() if k not in ["box_1000","box","box_xyxy_1000","coordinate_adjustment"]}
        item.update(
            source_box=list(region["box"]),box=box,
            box_xyxy_1000=[box[0]*1000/width,box[1]*1000/height,box[2]*1000/width,box[3]*1000/height],
            boundary_refinement={"rounded_original_box":original,"completed_box":core,
                "wanted_padded_box":wanted,"padding_caps":cap,
                "padding_reduced":box!=wanted,"assigned_components":owned[index],
                "cut_components_before":cut_components(region["box"],labels,stats),
                "cut_components_after":cut_components(box,labels,stats)}
        )
        if box!=region["box"]: changed+=1
        refined.append(item)
    if ambiguous: warnings.append(f"{len(ambiguous)} components have tied region assignments.")
    if rejected: warnings.append(f"{len(rejected)} components exceed the extension limit.")
    if conflicts: warnings.append(f"{len(conflicts)} completed rectangle pairs overlap; inspect grouping.")
    summary={
        "base_regions":n,"output_regions":len(refined),"changed_boxes":changed,
        "padding_pixels":padding,"maximum_extension_pixels":limits,
        "content_cut_component_instances_before":sum(len(x["boundary_refinement"]["cut_components_before"]) for x in refined if x["keep"]),
        "content_cut_component_instances_after":sum(len(x["boundary_refinement"]["cut_components_after"]) for x in refined if x["keep"]),
        "ambiguous_components":ambiguous,"rejected_components":rejected,
        "overlapping_completed_region_pairs":conflicts,
    }
    return refined,summary,warnings
