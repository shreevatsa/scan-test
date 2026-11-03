"""Preserved geometry grouping and pixel-refinement functions."""
import cv2
import numpy as np
from scipy.ndimage import gaussian_filter1d
from diagnostics import runs, rasterize_boxes


def geom_regions(mask, char_h, rule_rows=()):
    """Group line bands using blank gaps, indentation and width changes."""
    h, w = mask.shape
    ys, xs = np.where(mask)
    if len(xs) == 0:
        return []
    left, right = float(np.percentile(xs, 1)), float(np.percentile(xs, 99))
    body_w = max(1, right-left)
    # A few stray pixels must not bridge otherwise separate lines. Identify
    # strong line bands, then restore whole connected components to the nearest
    # band so the threshold does not cut off accents/descenders.
    active = gaussian_filter1d(mask.sum(1).astype(float),.8) >= max(5,w*.02)
    bands = runs(active)
    bands=[(a,b) for a,b in bands if b-a>=max(3,char_h*.25)]
    if not bands:
        return []
    centers=np.array([(a+b)/2 for a,b in bands])
    n,labs,st,centroids=cv2.connectedComponentsWithStats(mask,8)
    assigned=[[] for b in bands]
    for stat,center in zip(st[1:],centroids[1:]):
        x,y,bw,bh,area=stat
        bi=int(np.argmin(abs(centers-center[1])))
        if area>=5 and abs(centers[bi]-center[1])<=max(char_h*1.7,bh):
            assigned[bi].append([int(x),int(y),int(x+bw),int(y+bh)])
    lines = []
    for members in assigned:
        if not members:
            continue
        a=np.array(members)
        x1,y1,x2,y2=int(a[:,0].min()),int(a[:,1].min()),int(a[:,2].max()),int(a[:,3].max())
        centered = (x1-left > .045*body_w and right-x2 > .035*body_w
                    and x2-x1 < .89*body_w)
        lines.append(dict(box=[x1,y1,x2,y2], centered=centered))
    if not lines:
        return []
    gaps = [b['box'][1]-a['box'][3] for a,b in zip(lines,lines[1:])]
    typical_gap = float(np.percentile(gaps, 40)) if gaps else char_h*.3
    gap_limit = max(.65*char_h, 1.7*typical_gap)
    groups = []
    current = [lines[0]]
    for line in lines[1:]:
        a, b = current[-1]['box'], line['box']
        gap = b[1]-a[3]
        ruled = any(a[3]-2 <= (r1+r2)/2 <= b[1]+2 for r1,r2 in rule_rows)
        indent_new = (b[0]-left > .045*body_w and right-a[2] > .08*body_w
                      and not current[-1]['centered'] and not line['centered'])
        changed = current[-1]['centered'] != line['centered']
        # Avoid subdividing verse merely for a slightly wider last line.
        if gap > gap_limit or ruled or indent_new or changed:
            groups.append(current)
            current = []
        current.append(line)
    groups.append(current)
    result=[]
    for group in groups:
        a=np.array([l['box'] for l in group])
        box=[int(a[:,0].min()),int(a[:,1].min()),int(a[:,2].max()),int(a[:,3].max())]
        label='verse_like' if sum(l['centered'] for l in group) > len(group)/2 else 'text_block'
        if box[3] < .12*h:
            label='header'
        elif any((r1+r2)/2 < box[1] and (r1+r2)/2 > .7*h for r1,r2 in rule_rows):
            label='footnote'
        result.append(dict(box=box,label=label,score=None))
    return result


def hybrid_regions(items,mask,labs,st,char_h,rules):
    h,w=mask.shape
    cleaned=[]
    for item in items:
        x1,y1,x2,y2=item['box']
        if y1 > .94*h:
            continue
        # Pull intersecting connected components wholly inside the crop,
        # provided the required extension is small. This preserves diacritics.
        ia=np.array([max(0,int(x1)),max(0,int(y1)),min(w,int(np.ceil(x2))),min(h,int(np.ceil(y2)))])
        if ia[2]<=ia[0] or ia[3]<=ia[1]:
            continue
        ids,counts=np.unique(labs[ia[1]:ia[3],ia[0]:ia[2]],return_counts=True)
        for ci,ct in zip(ids,counts):
            if ci==0 or ct < max(2,st[ci,4]*.2):
                continue
            sx,sy,sw,sh,area=st[ci]
            if sx < x1-.025*w or sy < y1-.018*h or sx+sw > x2+.025*w or sy+sh > y2+.018*h:
                continue
            x1=min(x1,sx);y1=min(y1,sy);x2=max(x2,sx+sw);y2=max(y2,sy+sh)
        a=dict(item);a['box']=[max(0,x1-2),max(0,y1-2),min(w,x2+2),min(h,y2+2)]
        a['origin']='model_refined';cleaned.append(a)
    covered=rasterize_boxes(cleaned,mask.shape)
    # Include whole components if any substantial part was missed.
    residual=np.zeros_like(mask)
    for ci in range(1,len(st)):
        x,y,bw,bh,area=st[ci]
        cm=(labs[y:y+bh,x:x+bw]==ci)
        if area>=5 and (cm & (covered[y:y+bh,x:x+bw]==0)).sum() > max(3,area*.15):
            residual[y:y+bh,x:x+bw][cm]=1
    added=geom_regions(residual,char_h,rules)
    for a in added:
        if (a['box'][2]-a['box'][0]) < .025*w and (a['box'][3]-a['box'][1]) < char_h:
            continue
        a['origin']='unassigned_ink';a['label']='recovered'
        cleaned.append(a)
    return sorted(cleaned,key=lambda a:(a['box'][1],a['box'][0]))
