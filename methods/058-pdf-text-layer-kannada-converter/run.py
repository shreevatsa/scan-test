#!/usr/bin/env python3
"""A digital PDF page's text from its text layer, converted from a legacy Kannada font encoding to Unicode. No API calls.

The PDF's text layer is read with PyMuPDF: its lines, each with its spans (font, size, flags, text) and its box. Lines
that PyMuPDF keeps apart but that stand on one printed line (such as a list number and its text) are joined, and
lines are put in reading order, top to bottom. The text of spans in the book's Kannada fonts (font names starting
with "TT", which the PDF's Distiller run gave to its TrueType fonts) is in a Nudi/Baraha-style ASCII encoding; it is
converted with this method's own converter, nudi.py (written for this repository from the PDF's glyphs; no
outside code). Spans in other fonts (Palatino, Times) are English and kept as they are. A span
flagged as superscript is kept as a note marker, written [x] in the marked text and left out of the plain text.

PyMuPDF gives the byte 0xB5 of these fonts as U+03BC (Greek mu) rather than U+00B5 (micro sign); nudi.py maps it back.
Characters still outside the Kannada block after conversion (other than spaces, digits and punctuation), and the
glyph pieces nudi.py could not place, are listed as unconverted.

Method 058 is method 056 with its own converter in place of knconverter, and a space between spans that the PDF
sets apart without one (such as a list number in Times and the Kannada after it).

Usage: uv run --offline python methods/058-…/run.py inputs/vachana-page-061.json [--run NAME]
Writes outputs/<input id>/056-…/[<run>/]: text-layer.json (lines with boxes in page-image pixels, spans and text),
text.txt (the plain text, one printed line per line) and result.json.
"""
import argparse
import hashlib
import json
import os
import platform
import subprocess
import sys
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

import fitz

import nudi

HERE = Path(__file__).resolve().parent
PROJECT_DIR = HERE.parents[1]
METHOD_ID = HERE.name
def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def legacy(font):
    return font.startswith("TT")


def convert(texts):
    """Unicode Kannada for each legacy-encoded text, and the glyph pieces that could not be placed."""
    out, unplaced = [], []
    for t in texts:
        u, bad = nudi.convert(t)
        # Keep the span's own leading and trailing spaces.
        out.append(t[:len(t) - len(t.lstrip())] + u.strip() + t[len(t.rstrip()):])
        unplaced.append(bad)
    return out, unplaced


def visual_lines(page, zoom):
    """PyMuPDF's lines, joined where they stand on one printed line, top to bottom; spans left to right."""
    raw = []
    for b in page.get_text("dict")["blocks"]:
        for L in b.get("lines", []):
            spans = [s for s in L["spans"] if s["text"]]
            if spans:
                raw.append(dict(bbox=list(L["bbox"]), spans=spans))
    raw.sort(key=lambda L: (L["bbox"][1], L["bbox"][0]))
    lines = []
    for L in raw:
        x0, y0, x1, y1 = L["bbox"]
        cy, h = (y0 + y1) / 2, y1 - y0
        for M in lines:
            mx0, my0, mx1, my1 = M["bbox"]
            mcy, mh = (my0 + my1) / 2, my1 - my0
            superscript = all(s["flags"] & 1 for s in L["spans"])
            if (abs(cy - mcy) < 0.5 * max(h, mh) or (superscript and my0 - h / 2 <= cy <= my1)) and (x1 <= mx0 + 1 or x0 >= mx1 - 1 or superscript):
                M["spans"] += L["spans"]
                M["bbox"] = [min(mx0, x0), min(my0, y0), max(mx1, x1), max(my1, y1)]
                break
        else:
            lines.append(dict(bbox=list(L["bbox"]), spans=list(L["spans"])))
    for M in lines:
        M["spans"].sort(key=lambda s: s["bbox"][0])
        M["bbox_px"] = [round(v * zoom) for v in M["bbox"]]
    lines.sort(key=lambda M: (M["bbox"][1], M["bbox"][0]))
    return lines


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("record", type=Path)
    ap.add_argument("--run")
    args = ap.parse_args()
    record = json.loads(args.record.read_text())
    pdf_path = os.path.expanduser(record["source_pdf"])
    if sha256(pdf_path) != record["source_pdf_sha256"]:
        sys.exit("The PDF is not the one the input was rendered from.")
    out = PROJECT_DIR / "outputs" / record["input_id"] / METHOD_ID / (args.run or "")
    if out.exists() and any(out.iterdir()):
        sys.exit(f"Output directory exists and is not empty: {out}")
    started = datetime.now(timezone.utc)
    page = fitz.open(pdf_path)[record["pdf_page"] - 1]
    zoom = record["render"]["zoom"] if record["render"]["effective_dpi"] == record["render"]["dpi"] else record["width"] / page.rect.width
    lines = visual_lines(page, zoom)
    spans = [s for L in lines for s in L["spans"]]
    todo = [s for s in spans if legacy(s["font"])]
    converted, unplaced_pieces = convert([s["text"] for s in todo])
    for s, u, bad in zip(todo, converted, unplaced_pieces):
        s["unicode"] = unicodedata.normalize("NFC", u)
        s["unplaced"] = bad
    unconverted, records, text_lines = [], [], []
    for k, L in enumerate(lines):
        plain, marked, recs = "", "", []
        for k2, s in enumerate(L["spans"]):
            t = s.get("unicode", s["text"])
            # A gap between spans with no space in either is a space (the PDF positions such words apart).
            if k2 and t and not t[0].isspace() and plain and not plain[-1].isspace() and s["bbox"][0] - L["spans"][k2 - 1]["bbox"][2] > 0.2 * s["size"]:
                plain += " "; marked += " "
            sup = bool(s["flags"] & 1)
            marked += f"[{t.strip()}]" if sup else t
            if not sup:
                plain += t
            if legacy(s["font"]):
                odd = sorted({c for c in t if not (c.isspace() or "ಀ" <= c <= "೿" or c.isdigit() or unicodedata.category(c)[0] in "PSZ" or c in "‌‍")})
                if odd or s.get("unplaced"):
                    unconverted.append(dict(line=k + 1, font=s["font"], raw=s["text"], unicode=t, characters=odd, unplaced=s.get("unplaced", [])))
            recs.append(dict(font=s["font"], size=round(s["size"], 2), flags=s["flags"], superscript=sup, raw=s["text"],
                             text=t, bbox_px=[round(v * zoom) for v in s["bbox"]]))
        plain, marked = " ".join(plain.split()), " ".join(marked.split())
        records.append(dict(n=k + 1, bbox_px=L["bbox_px"], text=plain, marked=marked, spans=recs))
        text_lines.append(plain)
    out.mkdir(parents=True, exist_ok=True)
    (out / "text-layer.json").write_text(json.dumps(dict(input=record["input_id"], zoom=zoom, lines=records), ensure_ascii=False, indent=1) + "\n")
    (out / "text.txt").write_text("\n".join(text_lines) + "\n")
    fonts = {}
    for s in spans:
        fonts.setdefault(s["font"], dict(characters=0, sizes=set()))
        fonts[s["font"]]["characters"] += len(s["text"])
        fonts[s["font"]]["sizes"].add(round(s["size"], 1))
    result = dict(schema_version=1, method=METHOD_ID, input=dict(id=record["input_id"], pdf=record["source_pdf"], pdf_sha256=record["source_pdf_sha256"],
                  pdf_page=record["pdf_page"], image_sha256=record["image_sha256"]), created_at_utc=started.isoformat(), api_calls=0,
                  converter=dict(module="nudi.py", sha256=sha256(HERE / "nudi.py")),
                  counts=dict(lines=len(records), spans=len(spans), converted_spans=len(todo), superscript_spans=sum(bool(s["flags"] & 1) for s in spans),
                              unconverted_spans=len(unconverted)),
                  fonts={f: dict(characters=v["characters"], sizes=sorted(v["sizes"])) for f, v in fonts.items()},
                  unconverted=unconverted, environment=dict(python=platform.python_version(), pymupdf=fitz.VersionBind),
                  code_sha256=sha256(__file__))
    (out / "result.json").write_text(json.dumps(result, ensure_ascii=False, indent=1) + "\n")
    print(record["input_id"], json.dumps(result["counts"]))


if __name__ == "__main__":
    main()
