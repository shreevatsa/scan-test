#!/usr/bin/env python3
"""Render frozen interactive vision proposals alongside saved V3 detections.

No model API calls, credentials, or OCR are used by this script.
"""
from pathlib import Path
import io
import json
import hashlib

import cv2
import fitz
import numpy as np
from PIL import Image
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet,ParagraphStyle
from reportlab.platypus import SimpleDocTemplate,Paragraph,Spacer,Table,TableStyle

ROOT=Path(__file__).resolve().parent
OUT=ROOT/'output';OUT.mkdir(exist_ok=True)
pilot=json.loads((ROOT/'vision-regions.json').read_text())
old=json.loads((ROOT/'input/regions.json').read_text())


def mask_for(rgb):
    gray=cv2.cvtColor(rgb,cv2.COLOR_RGB2GRAY);h,w=gray.shape
    b=(gray<175).astype(np.uint8)
    b[:int(.025*h)]=0;b[int(.94*h):]=0;b[:,:int(.025*w)]=0;b[:,int(.98*w):]=0
    n,labs,st,_=cv2.connectedComponentsWithStats(b,8)
    keep=np.ones(n,np.uint8);keep[0]=0
    keep[st[:,4]<max(5,int(h*w/500000))]=0
    keep[(st[:,3]>.12*h)&(st[:,2]<.012*w)]=0
    keep[(st[:,2]>.4*w)&(st[:,3]<.008*h)]=0
    mask=keep[labs]
    rules=cv2.morphologyEx(mask,cv2.MORPH_OPEN,cv2.getStructuringElement(cv2.MORPH_RECT,(max(31,int(w*.4)),1)))
    mask[rules>0]=0
    return mask


def diagnostics(items,mask):
    h,w=mask.shape;counts=np.zeros((h,w),np.uint16)
    for a in items:
        x1,y1,x2,y2=a['box']
        x1=max(0,int(np.floor(x1)));y1=max(0,int(np.floor(y1)))
        x2=min(w,int(np.ceil(x2)));y2=min(h,int(np.ceil(y2)))
        counts[y1:y2,x1:x2]+=1
    ink=int(mask.sum())
    return {'ink_pixels':ink,'covered_fraction':float(((counts>0)&(mask>0)).sum()/ink),
            'overlapped_ink_fraction':float(((counts>1)&(mask>0)).sum()/ink)},counts


def draw_panel(page,source,pn,rect,items,rgb,mask,color):
    sp=source[pn-1]
    scale=min(rect.width/sp.rect.width,rect.height/sp.rect.height)
    placed=fitz.Rect(rect.x0+(rect.width-sp.rect.width*scale)/2,rect.y0,
                     rect.x0+(rect.width+sp.rect.width*scale)/2,rect.y0+sp.rect.height*scale)
    page.show_pdf_page(placed,source,pn-1)
    h,w=rgb.shape[:2];metric,counts=diagnostics(items,mask)
    tint=np.zeros((h,w,4),np.uint8)
    tint[(counts==0)&(mask>0)]=[224,32,61,230]
    tint[(counts>1)&(mask>0)]=[222,137,12,210]
    if tint[:,:,3].any():
        buf=io.BytesIO();Image.fromarray(tint).save(buf,format='PNG')
        page.insert_image(placed,stream=buf.getvalue())
    sx=placed.width/w;sy=placed.height/h
    for i,a in enumerate(items):
        x1,y1,x2,y2=a['box']
        box=fitz.Rect(placed.x0+x1*sx,placed.y0+y1*sy,placed.x0+x2*sx,placed.y0+y2*sy)
        page.draw_rect(box,color=color,width=.8)
        if a.get('type') in ['page_number','running_header']:
            label='H'
        else:label=str(a.get('reading_order') or i+1)
        fs=7;tw=fitz.get_text_length(label,fontname='hebo',fontsize=fs)+5
        lab=fitz.Rect(max(placed.x0,box.x0),max(placed.y0,box.y0-10),max(placed.x0,box.x0)+tw,max(placed.y0,box.y0-10)+10)
        page.draw_rect(lab,color=color,fill=color,width=0)
        page.insert_text((lab.x0+2,lab.y0+8),label,fontsize=fs,fontname='hebo',color=(1,1,1))
    return metric


def main():
    srcpath=ROOT/'input/Kale-1913-pp21-272.pdf'
    assert hashlib.sha256(srcpath.read_bytes()).hexdigest()==old['source_sha256']
    source=fitz.open(srcpath)
    report=fitz.open()
    pages=[]
    for rec in pilot['pages']:
        pn=rec['pdf_page'];baseline=next(r for r in old['records'] if r['pdf_page']==pn)
        pix=source[pn-1].get_pixmap(matrix=fitz.Matrix(300/72,300/72),alpha=False)
        rgb=np.frombuffer(pix.samples,np.uint8).reshape(pix.height,pix.width,3).copy()
        mask=mask_for(rgb)
        assert int(mask.sum())==baseline['metrics']['large']['ink_pixels'],'Mask must match previous test'
        w,h=rec['image_size']
        proposed=[dict(a,box=[a['box_pixels'][0]/w*pix.width,a['box_pixels'][1]/h*pix.height,
                               a['box_pixels'][2]/w*pix.width,a['box_pixels'][3]/h*pix.height]) for a in rec['regions']]
        page=report.new_page(width=1000,height=930)
        page.insert_text((30,34),f'Whole-block vision pilot / PDF page {pn}',fontname='hebo',fontsize=22,color=(.06,.24,.30))
        page.insert_text((30,55),'Frozen interactive proposals. Red = uncovered ink; amber = ink covered by overlapping boxes.',fontsize=10,color=(.31,.40,.44))
        page.insert_text((30,83),'Saved PP-DocLayoutV3 / threshold 0.30',fontname='hebo',fontsize=13,color=(.05,.40,.57))
        page.insert_text((520,83),'Current assistant / interactive vision pass',fontname='hebo',fontsize=13,color=(.03,.40,.27))
        metric_v3=draw_panel(page,source,pn,fitz.Rect(30,113,480,805),baseline['regions']['large'],rgb,mask,(.03,.48,.68))
        metric_vlm=draw_panel(page,source,pn,fitz.Rect(520,113,970,805),proposed,rgb,mask,(.02,.48,.30))
        page.insert_text((30,101),f"{len(baseline['regions']['large'])} boxes | {metric_v3['covered_fraction']*100:.2f}% measured ink covered",fontsize=9,color=(.30,.37,.42))
        page.insert_text((520,101),f"{len(proposed)} boxes | {sum(a['type']=='verse' for a in proposed)} whole verse blocks | {metric_vlm['covered_fraction']*100:.2f}% measured ink covered",fontsize=9,color=(.30,.37,.42))
        notes={17:'Two whole verses, two lead-ins, two commentary passages and a footnote. The visual pass keeps the verses together, while the detector splits several lines and misses part of the upper verse.',
               97:'Two whole verses, one lead-in, two commentary passages and a footnote. The model can use typographic and textual context to group a complete stanza, instead of treating each line independently.',
               113:'Three whole verses alternating with commentary. The estimated rectangles overlap slightly at crowded verse/commentary boundaries. Grouping can improve while exact localization still needs refinement.'}
        page.draw_line((30,822),(970,822),color=(.77,.83,.86),width=.6)
        rem=page.insert_textbox(fitz.Rect(30,835,970,884),notes[pn],fontsize=11,lineheight=1.35,color=(.13,.25,.30));assert rem>=0
        page.insert_text((30,912),'Interactive demonstration, not a blind or repeatable API benchmark. H = furniture; content numbers show proposed reading order.',fontsize=9,color=(.37,.44,.47))
        pages.append({'pdf_page':pn,'vision_region_count':len(proposed),'whole_verse_blocks':sum(a['type']=='verse' for a in proposed),'v3_region_count':len(baseline['regions']['large']),'v3_diagnostics':metric_v3,'vision_diagnostics':metric_vlm})
    metrics={'method':pilot['method'],'model':pilot['model'],'independent_api_calls':False,'blind_evaluation':False,'source_sha256':old['source_sha256'],'pages':pages}
    (OUT/'Kale-vision-pilot-metrics.json').write_text(json.dumps(metrics,indent=2))
    # Compact findings page. Coverage is diagnostic only and ignores the same
    # explicit margin/watermark bands used in the previous experiment.
    styles=getSampleStyleSheet();styles.add(ParagraphStyle(name='BodyX',fontName='Helvetica',fontSize=10.5,leading=15,spaceAfter=11,textColor=colors.HexColor('#243c47')))
    story=[]
    def p(text,style='BodyX'):story.append(Paragraph(text,styles[style]))
    p('A general vision model can help with grouping','Title')
    p('Three-page pilot on the Kale scan','Heading2')
    p('The current chat assistant inspected the original images of PDF pages <b>17, 97 and 113</b> and proposed semantic regions. All seven verse passages were proposed as complete multi-line blocks. Commentary, short lead-ins, footnotes and running furniture were separated.')
    p('<b>What this demonstrates:</b> asking a general vision-language model for whole passages gives a useful alternative to a detector trained to propose page elements. In these examples, it can keep a verse together where the detector fragments it into lines.')
    p('<b>What it does not establish:</b> this was an interactive pass in the ongoing conversation, with access to the previous investigation. It was not a fresh, independent API invocation. The assistant estimated the rectangles visually and has not measured repeatability, per-page API cost, latency, or cross-book accuracy. No Claude or Gemini calls were made.')
    rows=[['PDF page','V3 boxes','Vision boxes','Whole verse blocks']]+[[str(a['pdf_page']),str(a['v3_region_count']),str(a['vision_region_count']),str(a['whole_verse_blocks'])] for a in pages]
    t=Table(rows,colWidths=[95,100,105,165],hAlign='LEFT');t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#185266')),('TEXTCOLOR',(0,0),(-1,0),colors.white),('FONTNAME',(0,0),(-1,0),'Helvetica-Bold'),('FONTSIZE',(0,0),(-1,-1),10),('TOPPADDING',(0,0),(-1,-1),9),('BOTTOMPADDING',(0,0),(-1,-1),9),('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.HexColor('#eef5f6'),colors.white])]))
    story.extend([t,Spacer(1,14)])
    p('Region counts are descriptive, not accuracy scores. Header/watermark policies and grouping granularity differ. Red and amber overlays reveal unassigned and duplicated foreground; the mask uses the exclusions documented in the earlier experiment.')
    p('<b>Practical design:</b> use the vision model to propose passage groups and reading order, then use pixels or detected lines to refine the boundaries. Show editable boxes, especially at close verse/commentary transitions. The crowded page 113 illustrates why semantic grouping and exact cropping need separate checks.')
    p('The supplement includes the source PDF, the three input renders, frozen proposals, metrics, a reusable prompt, the previous experiment archive, and a local handoff. No API keys are required to inspect or reproduce these diagrams. A fresh automated provider comparison needs configured model access.')
    SimpleDocTemplate(str(OUT/'summary-temp.pdf'),pagesize=A4,leftMargin=49,rightMargin=49,topMargin=43,bottomMargin=43).build(story)
    summary=fitz.open(OUT/'summary-temp.pdf');assert len(summary)==1
    for i in range(len(report)):
        panel=summary.new_page(width=report[i].rect.width,height=report[i].rect.height)
        panel.show_pdf_page(panel.rect,report,i)
    summary.set_metadata({'title':'Kale general-vision grouping pilot','subject':'Interactive three-page pilot; not an independent API benchmark'})
    summary.save(OUT/'Kale-vision-pilot.pdf',garbage=0,deflate=True)
    summary.close()
    summary=fitz.open(OUT/'Kale-vision-pilot.pdf')
    assert len(summary)==4
    (OUT/'summary-temp.pdf').unlink()
    for i in range(len(summary)):
        summary[i].get_pixmap(matrix=fitz.Matrix(1.2,1.2),alpha=False).save(ROOT/'tmp'/f'report-{i+1}.png')
    print(json.dumps(metrics,indent=2))


if __name__=='__main__':main()
