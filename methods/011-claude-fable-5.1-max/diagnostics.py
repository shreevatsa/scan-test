"""Foreground-mask and coverage functions shared by the experiment definitions."""
import cv2
import numpy as np


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
