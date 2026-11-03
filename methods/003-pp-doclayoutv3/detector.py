"""PP-DocLayoutV3 inference, rectangle decoding and predicted reading order."""
import os
os.environ["ORT_DISABLE_TELEMETRY"] = "1"

import cv2
import numpy as np
import onnxruntime as ort
from scipy.special import expit
ort.disable_telemetry_events()


def session(path):
    opts = ort.SessionOptions()
    opts.intra_op_num_threads = 2
    opts.inter_op_num_threads = 1
    opts.log_severity_level = 3
    return ort.InferenceSession(str(path), sess_options=opts,
                               providers=['CPUExecutionProvider'])


def v3_detect(sess,rgb,labels,threshold=.3):
    h,w=rgb.shape[:2]
    x=cv2.resize(rgb,(800,800),interpolation=cv2.INTER_CUBIC).astype(np.float32)/255
    # Masks are not requested: this experiment compares axis-aligned rectangles.
    logits,boxes,order_logits=sess.run(['logits','pred_boxes','order_logits'],
                                     {'pixel_values':np.transpose(x,(2,0,1))[None].copy()})
    scores=expit(logits[0]); top=np.argsort(scores.ravel())[-300:][::-1]
    q,cls=top//scores.shape[1],top%scores.shape[1]
    os=expit(order_logits[0])
    # NumPy translation of the official Hugging Face pairwise order-vote rule.
    votes=np.triu(os,1).sum(0)+np.tril(1-os.T,-1).sum(0)
    order=np.empty(300,int);order[np.argsort(votes,kind='stable')]=np.arange(300)
    items=[]
    for qi,ci in zip(q,cls):
        score=float(scores[qi,ci])
        if score < .2:
            continue
        cx,cy,bw,bh=boxes[0,qi]
        box=[float((cx-bw/2)*w),float((cy-bh/2)*h),
             float((cx+bw/2)*w),float((cy+bh/2)*h)]
        items.append(dict(box=box,label=labels[str(ci)],score=score,
                          model_order=int(order[qi]),query_id=int(qi)))
    items.sort(key=lambda a:a['model_order'])
    return [a for a in items if a['score'] >= threshold],items
