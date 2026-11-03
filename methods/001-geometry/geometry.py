"""Geometry baseline: preserved mask, grouping and diagnostic functions."""

import cv2
import numpy as np
from scipy.ndimage import gaussian_filter1d


def runs(active):
    d = np.diff(np.pad(np.asarray(active, np.int8), (1, 1)))
    return list(zip(np.where(d == 1)[0].tolist(), np.where(d == -1)[0].tolist()))


def make_mask(rgb):
    """Remove speckles, scan borders, long rules, and the watermark band.

    The bottom 6% exclusion is explicit and book-specific: it contains the
    Google digitization mark, not the actual body/footnotes on inspected pages.
    Metrics are restricted to this declared analysis window.
    """
    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    h, w = gray.shape
    binary = (gray < 175).astype(np.uint8)
    binary[:int(.025*h)] = 0
    binary[int(.94*h):] = 0
    binary[:, :int(.025*w)] = 0
    binary[:, int(.98*w):] = 0
    n, labs, st, centroids = cv2.connectedComponentsWithStats(binary, 8)
    rule_rows=[(int(y),int(y+bh)) for x,y,bw,bh,area in st[1:]
               if bw>.4*w and bh<.008*h]
    keep = np.ones(n, np.uint8)
    keep[0] = 0
    keep[st[:, cv2.CC_STAT_AREA] < max(5, int(h*w/500000))] = 0
    keep[(st[:, 3] > .12*h) & (st[:, 2] < .012*w)] = 0
    keep[(st[:, 2] > .4*w) & (st[:, 3] < .008*h)] = 0
    mask = keep[labs]
    # Rules may touch a glyph, so remove the remaining very thin horizontal runs.
    rules = cv2.morphologyEx(mask, cv2.MORPH_OPEN,
                            cv2.getStructuringElement(cv2.MORPH_RECT, (max(31, int(w*.4)), 1)))
    rule_rows += runs(rules.sum(1) > .35*w)
    mask[rules > 0] = 0
    n, labs, st, centroids = cv2.connectedComponentsWithStats(mask, 8)
    useful = st[1:]
    hs = useful[(useful[:, 3] >= .004*h) & (useful[:, 3] < .05*h), 3]
    char_h = float(np.median(hs)) if len(hs) else h*.015
    return mask, labs, st, char_h, rule_rows


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


def rasterize_boxes(items,shape):
    h,w=shape
    out=np.zeros(shape,np.uint8)
    for a in items:
        x1,y1,x2,y2=a['box']
        x1=max(0,int(np.floor(x1)));y1=max(0,int(np.floor(y1)))
        x2=min(w,int(np.ceil(x2)));y2=min(h,int(np.ceil(y2)))
        if x2>x1 and y2>y1:
            out[y1:y2,x1:x2]=1
    return out


def metrics(items,mask,labs,st):
    cover=rasterize_boxes(items,mask.shape)
    ink=int(mask.sum());miss=int((mask & (cover==0)).sum())
    h,w=mask.shape
    partial=0
    for ci in range(1,len(st)):
        x,y,bw,bh,area=st[ci]
        if area<8:
            continue
        cm=labs[y:y+bh,x:x+bw]==ci
        inside=int((cm & (cover[y:y+bh,x:x+bw]>0)).sum())
        if inside >= 3 and area-inside >= max(3,area*.05):
            partial+=1
    return dict(regions=len(items),ink_pixels=ink,uncovered_ink_pixels=miss,
                ink_coverage=1-miss/max(1,ink),partially_covered_components=partial)
