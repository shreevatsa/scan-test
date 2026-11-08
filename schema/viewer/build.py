#!/usr/bin/env python3
"""Build a static, read-only viewer for a run's page documents (schema 0.1 or 0.2). Local only.

One HTML file per page and an index, written to OUT_DIR. Each page shows the page image with every region's outline
(colored by type) and every line piece's outline, next to the page's units in reading order with their text, line by
line. Hovering a line of text highlights its outline on the image and the reverse; clicking a region scrolls to its
text. Note markers are shown as superscript links to their notes (from the page's note relations): hovering a marker
highlights its note in the text and on the image, clicking it scrolls to the note, and each note lists its markers.
Open ends are marked (↑ begun on an earlier page, ↓ goes on on a later page), and the page's problems and schema check
are shown. In schema 0.2 documents, formatting spans are shown as formatting (bold, italic, small capitals, …), note
markers come from note-marker spans and relations find them by anchor. The files open directly from disk: images are referenced by relative path, and the data is
embedded in each page.

Usage: build.py OUT_DIR --title TITLE --types TYPES.json [--report DIR] PAGE.json [PAGE.json …]   (pages in order)
--report: a directory with method 047's book_report.py output (report.txt, labels.json) and method 044's assemble output
(book/assembly.json), shown on the index; pages whose printed number is out of sequence are marked.
"""
import argparse
import html
import json
import os
import re
import sys
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
PROJECT_DIR = HERE.parents[1]
sys.path.insert(0, str(PROJECT_DIR / "schema"))
import book as bk  # noqa: E402

PALETTE = ["#d62728", "#1f77b4", "#2ca02c", "#9467bd", "#ff7f0e", "#17becf", "#8c564b", "#e377c2", "#bcbd22",
           "#7f7f7f", "#393b79", "#637939", "#8c6d31", "#843c39", "#7b4173"]

CSS = """
body{margin:0;font:15px/1.5 -apple-system,Helvetica,Arial,sans-serif;color:#222}
header{position:sticky;top:0;z-index:5;background:#f6f6f2;border-bottom:1px solid #ccc;padding:6px 12px;display:flex;gap:14px;align-items:center;flex-wrap:wrap}
header a{color:#1f4e9e;text-decoration:none} header .bad{color:#b00;font-weight:600} header .ok{color:#2a7a2a}
main{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:0;height:calc(100vh - 44px)}
#img{overflow:auto;background:#ddd;position:relative}
#img .wrap{position:relative;width:100%} #img img{width:100%;display:block}
#img svg{position:absolute;left:0;top:0;width:100%;height:100%}
svg .reg{fill-opacity:.06;stroke-width:3;cursor:pointer} svg .reg.furn{stroke-dasharray:8 6;stroke-opacity:.6}
svg .ln{fill:none;stroke:none} svg .ln.hl{fill:#ffd400;fill-opacity:.35;stroke:#e6a800;stroke-width:2}
svg .reg.hl{fill-opacity:.22;stroke-width:5}
#text{overflow:auto;padding:10px 18px 60px}
.unit{margin:4px 0 4px 14px;border-left:3px solid #ddd;padding-left:8px}
.uhead{font-size:12px;color:#555;font-family:Menlo,monospace}
.uhead .open{color:#b05a00;font-weight:600}
.reg-text{margin:3px 0 8px;padding:3px 6px;border-radius:4px;font-size:17px}
.reg-text .rid{font:11px Menlo,monospace;color:#888;margin-right:6px}
.reg-text.hl{background:#fff6cc}
.l{border-radius:2px} .l:hover,.l.hl{background:#ffe680}
.furn{color:#666;font-size:14px}
sup.mk{color:#1f4e9e;cursor:pointer;font-weight:600;padding:0 1px;border-radius:3px} sup.mk.hl{background:#ffd400}
sup.mk.none{color:#b00} sup.mk.guess{text-decoration:underline dashed} .sc{font-variant:small-caps} .spc{letter-spacing:.15em} .ifm{background:#eef3ff} .backrefs{font:11px Menlo,monospace;color:#1f4e9e;margin-left:8px;cursor:pointer}
.reg-text.note-hl{background:#fff1a8} svg .reg.note-hl{fill-opacity:.35;stroke-width:6}
.problems{background:#fff0f0;border:1px solid #f3c0c0;padding:6px 10px;border-radius:4px;font-size:13px;margin-bottom:10px}
.legend span{display:inline-block;margin-right:10px;font-size:12px}
.legend i{display:inline-block;width:10px;height:10px;margin-right:3px;vertical-align:middle}
table{border-collapse:collapse} td,th{padding:2px 8px;border-bottom:1px solid #eee;text-align:left;font-size:13px}
pre{background:#f7f7f7;padding:8px;overflow:auto;font-size:12px}
"""

JS = """
const D = JSON.parse(document.getElementById('data').textContent);
function hl(sel, on){document.querySelectorAll(sel).forEach(e=>e.classList.toggle('hl', on));}
document.querySelectorAll('[data-line]').forEach(e=>{
  const k=e.dataset.line;
  e.addEventListener('mouseenter',()=>hl('[data-line="'+k+'"]',true));
  e.addEventListener('mouseleave',()=>hl('[data-line="'+k+'"]',false));
});
document.querySelectorAll('[data-reg]').forEach(e=>{
  const k=e.dataset.reg;
  e.addEventListener('mouseenter',()=>hl('[data-reg="'+k+'"]',true));
  e.addEventListener('mouseleave',()=>hl('[data-reg="'+k+'"]',false));
  if(e.tagName==='polygon'||e.tagName==='path') e.addEventListener('click',()=>{
    const t=document.querySelector('.reg-text[data-reg="'+k+'"]'); if(t) t.scrollIntoView({behavior:'smooth',block:'center'});});
});
function nhl(k,on){document.querySelectorAll('[data-noteunit="'+k+'"]').forEach(e=>e.classList.toggle('note-hl',on));hl('sup[data-note="'+k+'"]',on);}
document.querySelectorAll('[data-note]').forEach(e=>{
  const k=e.dataset.note;
  e.addEventListener('mouseenter',()=>nhl(k,true)); e.addEventListener('mouseleave',()=>nhl(k,false));
  e.addEventListener('click',ev=>{ev.stopPropagation();const t=document.querySelector('.reg-text[data-noteunit="'+k+'"]'); if(t) t.scrollIntoView({behavior:'smooth',block:'center'});});
});
document.querySelectorAll('.reg-text[data-noteunit]').forEach(e=>{
  const k=e.dataset.noteunit;
  e.addEventListener('mouseenter',()=>nhl(k,true)); e.addEventListener('mouseleave',()=>nhl(k,false));
});
document.querySelectorAll('.backrefs [data-goto]').forEach(e=>e.addEventListener('click',()=>{
  const t=document.querySelector('sup[data-mk="'+e.dataset.goto+'"]'); if(t) t.scrollIntoView({behavior:'smooth',block:'center'});}));
document.addEventListener('keydown',ev=>{
  if(ev.key==='ArrowLeft'&&D.prev) location.href=D.prev;
  if(ev.key==='ArrowRight'&&D.next) location.href=D.next;
});
"""


def esc(s):
    return html.escape(s or "", quote=True)


def path_d(rings):
    """SVG path data for rings in pixel-center coordinates (add 0.5 for SVG)."""
    return " ".join("M" + " L".join(f"{x + .5:.1f},{y + .5:.1f}" for x, y in ring) + " Z" for ring in rings if len(ring) >= 3)


FORMAT_TAGS = {"bold": ("<b>", "</b>"), "italic": ("<i>", "</i>"), "small_caps": ('<span class="sc">', "</span>"),
               "superscript": ("<sup>", "</sup>"), "subscript": ("<sub>", "</sub>"), "underline": ("<u>", "</u>"),
               "spaced": ('<span class="spc">', "</span>")}


def marked(text, spans, fmt=()):
    """HTML for a line's text with each marker (start, end, note unit or None, marker id, label) as a superscript link,
    and formatting spans (start, end, kind) as formatting. A 0.1 marker covers its "[x]" in the text (start < end); a
    0.2 marker is zero-width (start == end) and its label is the span's marker. Kinds of the book's own (type list
    "inline") are shown with a tint and their kind as a tooltip."""
    def tags(kind):
        return FORMAT_TAGS.get(kind, (f'<span class="ifm" title="{esc(kind)}">', "</span>"))
    cuts = sorted({0, len(text)} | {a for a, b, _ in fmt} | {b for a, b, _ in fmt} | {m[0] for m in spans} | {m[1] for m in spans})
    cuts = [c for c in cuts if 0 <= c <= len(text)]
    by_start = defaultdict(list)
    for m in sorted(spans):
        by_start[m[0]].append(m)
    out, skip = [], 0
    for k, a in enumerate(cuts):
        for start, end, unit, mid, label in by_start.get(a, []):
            if start < skip:
                continue
            if unit and mid.endswith("?"):
                out.append(f'<sup class="mk guess" data-note="{esc(unit)}" data-mk="{esc(mid[:-1])}" title="note marker → note '
                           f'(matched by the viewer: the relation does not name this marker)">{esc(label)}</sup>')
            elif unit:
                out.append(f'<sup class="mk" data-note="{esc(unit)}" data-mk="{esc(mid)}" title="note marker → note">{esc(label)}</sup>')
            else:
                out.append(f'<sup class="mk none" title="note marker with no relation">{esc(label)}</sup>')
            skip = max(skip, end)
        if k + 1 == len(cuts):
            break
        b = cuts[k + 1]
        if b <= skip:
            continue
        seg = esc(text[max(a, skip):b])
        for kind in [kd for s, e, kd in fmt if s <= a and e >= b]:
            o, c = tags(kind)
            seg = o + seg + c
        out.append(seg)
    return "".join(out)


def region_html(r, color, marks=None, noteunit=None, backrefs=None):
    parts = []
    lines = r["lines"]
    marks = marks or {}
    kept = r["source"].get("transcription", {}).get("lines")
    for k, L in enumerate(lines):
        text = L.get("text")
        if text is None:
            if kept:
                continue
            text = "⟨no text⟩"
        if text == "":
            continue
        end = L.get("end", "space")
        shown = text[:-1] if end == "hyphen" and text.endswith(("-", "‐")) and k < len(lines) - 1 else text
        sep = {"line": "<br>", "join": "", "hyphen": ""}.get(end, " ") if k < len(lines) - 1 else ""
        fmt = [(s["start"], min(s["end"], len(shown)), s["kind"]) for s in L.get("spans", []) if s["kind"] != "note_marker"]
        body = marked(shown, [m for m in marks.get(L["line"], []) if m[1] <= len(shown)], fmt)
        parts.append(f'<span class="l" data-line="{esc(r["id"])}:{L["line"]}" title="line {L["line"]}">{body}</span>{sep}')
    if backrefs:
        parts.append('<span class="backrefs">← ' + " ".join(f'<span data-goto="{esc(m)}">{esc(lbl)}</span>' for m, lbl in backrefs) + "</span>")
    if kept and not any(L.get("text") for L in lines):
        parts = [esc(" / ".join(x["text"] for x in kept)) + ' <span class="rid">⟨text not placed on the line pieces: the line counts differ⟩</span>']
    nu = f' data-noteunit="{esc(noteunit)}"' if noteunit else ""
    return (f'<div class="reg-text" data-reg="{esc(r["id"])}"{nu} style="border-left:4px solid {color}">'
            f'<span class="rid">{esc(r["id"])}</span>{"".join(parts)}</div>')


def page_html(doc, tl, colors, nav, title, check, label_flag=None):
    page = doc["page"]
    regions = {f"{page['id']}#{r['id']}": r for r in page["regions"]}
    units = {u["id"]: u for u in doc["units"]}
    furniture = {n for n, t in tl["types"].items() if t.get("role") == "furniture"}
    seen = set()
    # Note relations: marker spans per (region, line), the note unit of each note region, and back references.
    marks = defaultdict(lambda: defaultdict(list))
    note_of_region, backrefs = {}, defaultdict(list)
    for u in doc["units"]:
        for c in u["children"]:
            if "region" in c:
                note_of_region.setdefault(c["region"].split("#", 1)[1], u["id"])
    lines_of = {(r["id"], L["line"]): L.get("text", "") for r in page["regions"] for L in r["lines"]}
    # Schema 0.2: markers are zero-width note-marker spans; a relation names its marker's span by from.anchor.
    span_at = {f"{page['id']}#{s['id']}": (r["id"], L["line"], s) for r in page["regions"] for L in r["lines"]
               for s in L.get("spans", []) if s["kind"] == "note_marker"}
    anchored = {}
    for rel in doc.get("relations", []):
        if rel["type"] == "note" and rel["from"].get("anchor") in span_at:
            anchored[rel["from"]["anchor"]] = rel["to"]["unit"]
    # A relation without a usable anchor (the model named a marker that is not in its line, or none): matched to a
    # marker span of its region by the marker's text, or else when it is the region's only unmatched relation and
    # marker. Such a match is shown with a dashed underline.
    loose = [rel for rel in doc.get("relations", []) if rel["type"] == "note" and rel["from"].get("anchor") not in span_at
             and "region" in rel["from"]]
    guessed = set()
    for rel in loose:
        rid = rel["from"]["region"].split("#", 1)[1]
        free = [k for k, (r2, _, sp) in span_at.items() if r2 == rid and k not in anchored]
        want = (rel["from"].get("marker") or "").strip("[] ")
        hit = [k for k in free if span_at[k][2]["marker"] == want] if want else []
        if not hit and len(free) == 1 and sum(x["from"]["region"] == rel["from"]["region"] for x in loose) == 1:
            hit = free
        if hit:
            anchored[hit[0]] = rel["to"]["unit"]
            guessed.add(hit[0])
    for key, (rid, lid, sp) in span_at.items():
        unit = anchored.get(key)
        marks[rid][lid].append((sp["start"], sp["end"], unit, sp["id"] + ("?" if key in guessed else ""), sp["marker"]))
        if unit:
            backrefs[unit].append((sp["id"], f"{rid}:{lid}"))
    for i, rel in enumerate(doc.get("relations", [])):
        if rel["type"] != "note" or "region" not in rel["from"] or doc.get("schema_version") == "0.2":
            continue
        rid = rel["from"]["region"].split("#", 1)[1]
        unit, f = rel["to"]["unit"], rel["from"]
        span = None
        if "start" in f and "line" in f:
            span = (f["line"], f["start"], f["end"])
        elif f.get("marker"):
            pat = re.compile(r"\[\s*" + re.escape(f["marker"].strip()) + r"\s*\]")
            cands = [(lid, m.start(), m.end()) for (r2, lid), t in lines_of.items() if r2 == rid and (f.get("line") in (None, lid))
                     for m in pat.finditer(t)]
            used = {(lid, a) for lid, ms in marks[rid].items() for a, _, _, _, _ in ms}
            span = next((c for c in cands if (c[0], c[1]) not in used), None)
        if span:
            mid = f"m{i}"
            marks[rid][span[0]].append((span[1], span[2], unit, mid, lines_of[(rid, span[0])][span[1]:span[2]].strip("[] ")))
            backrefs[unit].append((mid, f"{rid}:{span[0]}"))
    for (rid, lid), t in lines_of.items():
        if doc.get("schema_version") == "0.2":
            continue
        known = {a for a, _, _, _, _ in marks[rid][lid]}
        for m in re.finditer(r"\[[^\]\s]{1,4}\]", t):
            if m.start() not in known and tl["types"].get(next(r["type"] for r in page["regions"] if r["id"] == rid), {}).get("region") != "note":
                marks[rid][lid].append((m.start(), m.end(), None, "", m.group(0).strip("[] ")))

    def unit_html(uid, depth=0):
        u = units.get(uid)
        if u is None or uid in seen or depth > 20:
            return f'<div class="unit"><span class="uhead">?? {esc(uid)}</span></div>'
        seen.add(uid)
        op = u.get("open", {})
        head = " ".join(x for x in [u["type"], u.get("number", ""), f"“{u['label']}”" if u.get("label") else ""] if x)
        head = (("<span class=open title='begun on an earlier page'>↑ </span>" if op.get("start") else "") + esc(head) +
                ("<span class=open title='goes on on a later page'> ↓</span>" if op.get("end") else ""))
        body = []
        for c in u["children"]:
            if "unit" in c:
                body.append(unit_html(c["unit"], depth + 1))
            else:
                r = regions.get(c["region"])
                if r is None:
                    body.append(f"<div>?? {esc(c['region'])}</div>")
                else:
                    is_note = tl["types"].get(r["type"], {}).get("region") == "note"
                    nu = note_of_region.get(r["id"]) if is_note else None
                    body.append(region_html(r, colors.get(r["type"], "#999"), marks.get(r["id"]), nu, backrefs.get(nu)))
        return f'<div class="unit"><div class="uhead">{head}</div>{"".join(body)}</div>'

    flows = []
    for flow, ids in doc["flows"].items():
        flows.append(f'<h4 style="margin:10px 0 2px">flow {esc(flow)}</h4>' + "".join(unit_html(i) for i in ids))
    loose = [u["id"] for u in doc["units"] if u["id"] not in seen]
    if loose:
        flows.append('<h4>units in no flow</h4>' + "".join(unit_html(i) for i in loose))
    furn = [r for r in page["regions"] if r["type"] in furniture]
    if furn:
        flows.append('<h4 style="margin:14px 0 2px">furniture</h4>' + "".join(
            f'<div class="furn reg-text" data-reg="{esc(r["id"])}"><span class="rid">{esc(r["id"])} {esc(r["type"])}</span>'
            + esc(" ".join(L.get("text", "") for L in r["lines"])) + "</div>" for r in furn))
    omitted = doc["source"].get("omitted_regions", [])
    if omitted:
        flows.append('<h4>left out (type other)</h4>' + "".join(f'<div class="furn">{esc(o["region"])}: {esc(" / ".join(o["text"]))}</div>' for o in omitted))
    errors, warnings = check
    problems = list(doc["source"].get("problems", []))
    prob = ""
    if errors or problems:
        prob = '<div class="problems">' + "".join(f"<div>✗ {esc(e)}</div>" for e in errors) + \
               "".join(f"<div>• {esc(p)}</div>" for p in problems) + "</div>"
    W, H = page["width"], page["height"]
    shapes = []
    for r in page["regions"]:
        col = colors.get(r["type"], "#999")
        cls = "reg furn" if r["type"] in furniture else "reg"
        nu = note_of_region.get(r["id"]) if tl["types"].get(r["type"], {}).get("region") == "note" else None
        nattr = f' data-noteunit="{esc(nu)}"' if nu else ""
        shapes.append(f'<path class="{cls}" data-reg="{esc(r["id"])}"{nattr} d="{path_d(r["polygons"])}" stroke="{col}" fill="{col}"><title>{esc(r["id"])} {esc(r["type"])}</title></path>')
        for L in r["lines"]:
            if L.get("polygons"):
                shapes.append(f'<path class="ln" data-line="{esc(r["id"])}:{L["line"]}" d="{path_d(L["polygons"])}"/>')
    legend = "".join(f'<span><i style="background:{c}"></i>{esc(t)}</span>' for t, c in colors.items()
                     if any(r["type"] == t for r in page["regions"]))
    label = esc(page.get("label", "–"))
    if label_flag:
        label += f' <span class="bad" title="the page numbers on both sides suggest another number">— the neighbors suggest {esc(label_flag["expected"])}</span>'
    status = '<span class="bad">invalid</span>' if errors else '<span class="ok">valid</span>'
    return f"""<!DOCTYPE html><html><head><meta charset="utf-8"><title>{esc(title)} — {esc(page['id'])}</title><style>{CSS}</style></head>
<body><header><a href="index.html">↑ {esc(title)}</a>
{'<a href="' + nav['prev'] + '">← previous</a>' if nav['prev'] else ''} <b>{esc(page['id'])}</b> (printed page {label})
{'<a href="' + nav['next'] + '">next →</a>' if nav['next'] else ''} {status} <span class="legend">{legend}</span></header>
<main><div id="img"><div class="wrap"><img src="{esc(nav['image'])}" alt="page image">
<svg viewBox="0 0 {W} {H}" preserveAspectRatio="none">{''.join(shapes)}</svg></div></div>
<div id="text">{prob}{''.join(flows)}</div></main>
<script type="application/json" id="data">{json.dumps(dict(prev=nav['prev'], next=nav['next']))}</script><script>{JS}</script></body></html>"""


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("out", type=Path)
    ap.add_argument("pages", nargs="+", type=Path)
    ap.add_argument("--title", required=True)
    ap.add_argument("--types", type=Path, required=True)
    ap.add_argument("--report", type=Path)
    args = ap.parse_args()
    tl = json.loads(args.types.read_text())
    printed = [t for t, d in tl["types"].items() if "region" in d]
    colors = {t: PALETTE[i % len(PALETTE)] for i, t in enumerate(printed)}
    args.out.mkdir(parents=True, exist_ok=True)
    docs = [json.loads(p.read_text()) for p in args.pages]
    names = [f"{d['page']['id']}.html" for d in docs]
    rows = []
    flags = {}
    if args.report and (args.report / "labels.json").exists():
        flags = {x["page"]: x for x in json.loads((args.report / "labels.json").read_text())["flagged"]}
    for i, (doc, path) in enumerate(zip(docs, args.pages)):
        schema_errors = bk.validate(doc)
        check = (schema_errors, []) if schema_errors else bk.check_document(doc, tl)
        img = PROJECT_DIR / "inputs" / doc["page"]["image"]
        nav = dict(prev=names[i - 1] if i else None, next=names[i + 1] if i + 1 < len(docs) else None,
                   image=os.path.relpath(img, args.out.resolve()))
        (args.out / names[i]).write_text(page_html(doc, tl, colors, nav, args.title, check, flags.get(doc["page"]["id"])))
        tops = [doc["units"][[u["id"] for u in doc["units"]].index(t)]["type"] for ids in doc["flows"].values() for t in ids
                if t in [u["id"] for u in doc["units"]]]
        fl = flags.get(doc["page"]["id"])
        lab = esc(doc["page"].get("label", "")) + (f' <span style="color:#b00">(neighbors: {esc(fl["expected"])})</span>' if fl else "")
        rows.append(f'<tr><td><a href="{names[i]}">{esc(doc["page"]["id"])}</a></td><td>{lab}</td>'
                    f'<td>{esc(", ".join(dict.fromkeys(tops)))}</td><td>{len(doc["page"]["regions"])}</td><td>{len(doc["units"])}</td>'
                    f'<td>{"<b style=color:#b00>invalid</b> " + esc(check[0][0]) if check[0] else "valid"}</td>'
                    f'<td>{esc("; ".join(doc["source"].get("problems", []))[:120])}</td></tr>')
    report = ""
    if args.report:
        rt = args.report / "report.txt"
        if rt.exists():
            report += f"<h3>Book report</h3><pre>{esc(rt.read_text())}</pre>"
        aj = args.report / "book" / "assembly.json"
        if aj.exists():
            a = json.loads(aj.read_text())
            report += "<h3>Assembly</h3><p>Pages left out (invalid): " + esc(", ".join(a.get("left_out_invalid_pages", {})) or "none") + \
                      f"; units: {a.get('units')}</p><ul>" + "".join(f"<li>{esc(w)}</li>" for w in a.get("warnings", [])) + "</ul>"
        tx = args.report / "book" / "transcript.txt"
        if tx.exists():
            report += f'<p>The whole book as text, with page references: <a href="{esc(os.path.relpath(tx, args.out.resolve()))}">transcript.txt</a></p>'
    if flags:
        report = ("<h3>Page numbers out of sequence</h3><p>Pages whose printed number, as transcribed, differs from what the pages on "
                  "both sides suggest (a misreading, damaged print, or no number printed):</p><ul>" +
                  "".join(f'<li><a href="{esc(k)}.html">{esc(k)}</a>: read {esc(v["label"] or "nothing")}, neighbors suggest {esc(v["expected"])}</li>'
                          for k, v in flags.items()) + "</ul>") + report
    legend = "".join(f'<span><i style="background:{c}"></i>{esc(t)}</span>' for t, c in colors.items())
    (args.out / "index.html").write_text(f"""<!DOCTYPE html><html><head><meta charset="utf-8"><title>{esc(args.title)}</title><style>{CSS}
body{{padding:12px 20px}}</style></head><body><h2>{esc(args.title)}</h2>
<p>{len(docs)} pages. Open a page to see the image with its regions next to its units and text; hover a line to see it on the page,
click a region to find its text; ← and → move between pages. ↑ marks a unit begun on an earlier page, ↓ one that goes on on a later page.</p>
<p class="legend">{legend}</p>{report}
<h3>Pages</h3><table><tr><th>page</th><th>printed</th><th>top-level units</th><th>regions</th><th>units</th><th>check</th><th>problems</th></tr>{''.join(rows)}</table>
</body></html>""")
    print(f"{args.out}/index.html: {len(docs)} pages")


if __name__ == "__main__":
    main()
