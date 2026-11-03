"""PP-DocLayout-S preprocessing, inference and overlap suppression."""
import os
os.environ["ORT_DISABLE_TELEMETRY"] = "1"

import cv2
import numpy as np
import onnxruntime as ort
ort.disable_telemetry_events()

SMALL_LABELS = ['paragraph_title', 'image', 'text', 'number', 'abstract',
                'content', 'figure_title', 'formula', 'table', 'table_title',
                'reference', 'doc_title', 'footnote', 'header', 'algorithm',
                'footer', 'seal', 'chart_title', 'chart', 'formula_number',
                'header_image', 'footer_image', 'aside_text']


def session(path):
    opts = ort.SessionOptions()
    opts.intra_op_num_threads = 2
    opts.inter_op_num_threads = 1
    opts.log_severity_level = 3
    return ort.InferenceSession(str(path), sess_options=opts,
                               providers=['CPUExecutionProvider'])


def nms_class_agnostic(items, threshold=.55):
    keep=[]
    for item in sorted(items,key=lambda a:a['score'],reverse=True):
        a=np.array(item['box'],float)
        skip=False
        for other in keep:
            b=np.array(other['box'],float)
            inter=np.maximum(0,np.minimum(a[2:],b[2:])-np.maximum(a[:2],b[:2])).prod()
            area_a=np.maximum(0,a[2:]-a[:2]).prod()
            area_b=np.maximum(0,b[2:]-b[:2]).prod()
            if inter/max(1,area_a+area_b-inter) > threshold:
                skip=True;break
        if not skip:
            keep.append(item)
    return keep


def small_detect(sess,rgb,threshold=.3):
    h,w=rgb.shape[:2]
    x=cv2.resize(rgb,(480,480),interpolation=cv2.INTER_CUBIC).astype(np.float32)/255
    x=(x-np.array([.485,.456,.406],np.float32))/np.array([.229,.224,.225],np.float32)
    dets,n=sess.run(None,{'image':np.transpose(x,(2,0,1))[None].copy(),
                          'scale_factor':np.array([[480/h,480/w]],np.float32)})
    items=[]
    for cls,score,x1,y1,x2,y2 in dets.reshape(-1,6)[:int(n.reshape(-1)[0])]:
        if score < threshold:
            continue
        items.append(dict(box=[float(x1),float(y1),float(x2),float(y2)],
                          label=SMALL_LABELS[int(cls)],score=float(score)))
    items=nms_class_agnostic(items)
    return sorted(items,key=lambda a:(a['box'][1],a['box'][0]))
