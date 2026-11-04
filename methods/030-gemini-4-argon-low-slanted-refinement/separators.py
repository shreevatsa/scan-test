"""Detect thin, nearly straight separator components before crop refinement."""
import math
import cv2
import numpy as np
from diagnostics import make_mask


def detect_separators(rgb, settings):
    gray=cv2.cvtColor(rgb,cv2.COLOR_RGB2GRAY)
    height,width=gray.shape
    binary=(gray<175).astype(np.uint8)
    binary[:int(.025*height)]=0
    binary[int(.94*height):]=0
    binary[:,:int(.025*width)]=0
    binary[:,int(.98*width):]=0
    count,labels,stats,_=cv2.connectedComponentsWithStats(binary,8)
    combined=np.zeros_like(binary)
    records=[]
    minimum_span=max(settings["minimum_span_pixels"],math.ceil(width*settings["minimum_span_width_fraction"]))
    thickness_limit=max(3,math.ceil(height*settings["median_thickness_height_fraction"]))
    residual_limit=max(1.5,height*settings["fit_residual_height_fraction"])
    for ci in range(1,count):
        x,y,w,h,area=map(int,stats[ci])
        if w<minimum_span or h>height*settings["maximum_height_fraction"] or w/max(1,h)<settings["minimum_aspect_ratio"]:
            continue
        component=labels[y:y+h,x:x+w]==ci
        ys,xs=np.where(component)
        columns=np.bincount(xs,minlength=w)
        filled=np.flatnonzero(columns)
        if len(filled)<settings["minimum_filled_column_fraction"]*w:continue
        low=np.full(w,h,np.int32);high=np.full(w,-1,np.int32)
        np.minimum.at(low,xs,ys);np.maximum.at(high,xs,ys)
        spans=high[filled]-low[filled]+1
        if np.median(spans)>thickness_limit or max(spans)>2*thickness_limit:continue
        centers=(low[filled]+high[filled])/2+y
        slope,intercept=np.polyfit(filled+x,centers,1)
        residual=np.abs(centers-(slope*(filled+x)+intercept))
        if abs(slope)>settings["maximum_absolute_slope"] or np.percentile(residual,95)>residual_limit:continue
        combined[y:y+h,x:x+w][component]=1
        records.append({"separator_id":len(records)+1,"raw_component_id":ci,
            "box":[x,y,x+w,y+h],"area":area,"slope":float(slope),
            "intercept":float(intercept),"median_column_thickness":float(np.median(spans)),
            "maximum_column_thickness":int(max(spans)),
            "fit_residual_p95":float(np.percentile(residual,95)),
            "columns_x":(filled+x).tolist(),"top_by_column":(low[filled]+y).tolist(),
            "bottom_exclusive_by_column":(high[filled]+y+1).tolist()})
    return combined,records


def make_refinement_mask(rgb, settings):
    original,_,_,char_height,_=make_mask(rgb)
    separator_mask,records=detect_separators(rgb,settings)
    text_mask=original.copy()
    text_mask[separator_mask>0]=0
    _,labels,stats,_=cv2.connectedComponentsWithStats(text_mask,8)
    return text_mask,labels,stats,char_height,records,separator_mask,original
