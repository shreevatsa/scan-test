#!/usr/bin/env python3
"""Page documents (schema 0.2) for a digital PDF from its typography: method 058's converted text layer, arranged into
the units of the book's type list by font, size, indent and the PDF's footnote rules. No API calls.

Method 060 is method 059 with these changes (each from a page the user reviewed, 2026-11-06):
- text that is not printed is left out: a span with no ink under it in the rendered page (white text, or text under a
  white box, such as the hidden page numbers of the front matter), or one that a fill or an image drawn later covers
  (the running header under a chapter's ornament box); a page whose running header is hidden takes its label from it;
- the PDF's images are figures (a figure unit with a region and no lines), in their place among the lines; a label
  for a known image (by the sha256 of its stream) comes from the profile;
- the left margin is the page's own (the leftmost x at which two body lines start), not the book's, for deciding
  whether a line is indented;
- a line in a heading font below the heading size is a heading only if centered; one ending with a danda is a verse,
  and one neither is body text;
- lines and figures before a chapter's start on its page (an invocation, an ornament) belong to that chapter;
- a vertical gap wider than block_gap times the font size ends a heading or a paragraph;
- lines standing in two columns (a run of at least two lines, each with one gap of at least column_gap_min times the
  font size, whose right parts align at the left, the right or the center, and are not just page numbers) are split:
  the left column, then the right, each its own unit; lines just above or below that lie within one column join it;
- a superscript that is not a note number (as the "nd" of 2nd) is kept as text with a superscript span;
- per-font text replacements from the profile (font_text), for symbols the converter does not know (₹);
- a footnote may start with * (or † ‡) as well as a number, and its marker is linked to it;
- lines of method 058 that stand on one baseline are one line, their spans in order of x (058 keeps a word apart when
  it falls in a wide gap of a justified line, and puts it before the line); a line printed twice in the same place
  (the same text and position) is read once;
- digits in a span at most 0.7 times the line's main size are a note marker even when the PDF does not flag them as
  superscript (²ಕಾಲ); and a note marker inside a word does not put a space into it (ಶತಾಯು³ಗಳಾದರೂ, where method 059
  wrote ಶತಾಯು ಗಳಾದರೂ).

Book-specific choices are in profile-<book_id>.json. Lines are classified as:
- furniture: the running header (the top line in its font; its digits are the page's label), a page number alone;
- footnotes: every line below a footnote rule (a short horizontal line drawn in the lower part of the page); a line
  starting with a number starts a footnote;
- heading: a line at the heading size, or a centered line in a heading font; a chapter's number (digits alone) or a
  heading at the chapter size starts a chapter;
- verse: a line set entirely in verse fonts, or a heading-font line ending with a danda; a verse ends at a line ending
  with ॥;
- body: a numbered saying starts at "N." near the left margin; after it, lines at its hanging indent continue it and a
  further-indented line starts a new paragraph of it; elsewhere an indented first line starts a paragraph.
A verse inside a paragraph or saying (one that the text goes on after) is a child unit of it. Units open at a page's
edges are marked from the neighboring pages. Note markers are linked to the page's footnote with the same number.
Where a word runs on to the next line without a hyphen is decided from the book's own vocabulary, as in method 059.

Usage: uv run --offline python methods/060-…/run.py --book vachana --pages inputs/pages-vachana-book.json --text-run book-002 --run book-001
"""
import argparse
import collections
import copy
import hashlib
import json
import os
import re
import sys
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

import fitz
import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
PROJECT_DIR = HERE.parents[1]
METHOD_ID = HERE.name
M058 = "058-pdf-text-layer-kannada-converter"
sys.path.insert(0, str(PROJECT_DIR / "schema"))
import book as bk  # noqa: E402

PUNCT = "“”‘’\"',.;:!?()[]।॥-–"
NUMBER = re.compile(r"^(\d{1,3})\.\s")
DANDA_END = re.compile(r"[।॥]\s*[\d೦-೯]*\s*$")
NOTE_SIGN = re.compile(r"\s*[\d*†‡]+\s*")
PAGE_NUMBER = re.compile(r"[\divxlc]+")


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def core(w):
    return w.strip(PUNCT)


def text_of(spans, z):
    """A line's plain text from its spans, as method 058 makes it: superscripts left out, a space where spans stand apart."""
    plain, prev = "", None
    for s in spans:
        t = s["text"]
        if prev is not None and t and not t[0].isspace() and plain and not plain[-1].isspace() and (s["bbox_px"][0] - prev["bbox_px"][2]) / z > 0.2 * s["size"]:
            plain += " "
        if not s["superscript"]:
            plain += t
        prev = s
    return " ".join(plain.split())


def box_of(spans):
    return [min(s["bbox_px"][0] for s in spans), min(s["bbox_px"][1] for s in spans), max(s["bbox_px"][2] for s in spans), max(s["bbox_px"][3] for s in spans)]


class Page:
    def __init__(self, record, layer, rules_y, images, ink, covered, profile):
        self.record, self.profile = record, profile
        self.z = z = layer["zoom"]
        self.rules_y = rules_y
        self.center = record["width"] / z / 2
        self.dropped, self.merged, self.small_markers = [], [], []
        P = profile
        lines = []
        for L in copy.deepcopy(layer["lines"]):
            changed = False
            keep = []
            for s in L["spans"]:
                why = None if not s["text"].strip() else "no ink" if not self.inked(ink, s["bbox_px"]) else "covered" if covered([v / z for v in s["bbox_px"]]) else None
                if why:
                    self.dropped.append(dict(line=L["n"], text=s["text"], font=s["font"], why=why, y_pt=round(s["bbox_px"][1] / z, 1)))
                    changed = True
                    continue
                for a, b in P.get("font_text", {}).get(s["font"], {}).items():
                    if a in s["text"]:
                        s["text"] = s["text"].replace(a, b)
                        changed = True
                keep.append(s)
            if not any(s["text"].strip() for s in keep):
                continue
            L["spans"] = keep
            if changed:
                L["text"], L["bbox_px"] = text_of(keep, z), box_of(keep)
            lines.append(L)
        lines = self.merge_baselines(lines)
        for L in lines:
            big = max((s["size"] for s in L["spans"] if s["text"].strip()), default=0)
            small = [s for s in L["spans"] if not s["superscript"] and s["size"] <= 0.7 * big and NOTE_SIGN.fullmatch(s["text"])]
            for sp in small:
                sp["superscript"] = True
                self.small_markers.append(dict(line=L["n"], text=sp["text"], size=sp["size"]))
            if small:
                L["text"] = text_of(L["spans"], z)
            self.measure(L)
        self.lines = self.split_columns(lines)
        self.figures = []
        for im in images:
            x0, y0, x1, y1 = [v * z for v in im["bbox"]]
            box = [max(0, x0), max(0, y0), min(record["width"] - 1, x1), min(record["height"] - 1, y1)]
            if box[2] - box[0] < 4 or box[3] - box[1] < 4 or not self.inked(ink, box, 20):
                continue
            self.figures.append(dict(kind="figure", n=None, bbox_px=[round(v) for v in box], pt=[v / z for v in box], sha256=im["sha256"], xref=im["xref"],
                                     label=P.get("figure_labels", {}).get(im["sha256"])))
        self.classify()

    def merge_baselines(self, lines):
        out = []
        for L in lines:
            ly, lh = (L["bbox_px"][1] + L["bbox_px"][3]) / 2, L["bbox_px"][3] - L["bbox_px"][1]
            for M in out[-3:]:
                my, mh = (M["bbox_px"][1] + M["bbox_px"][3]) / 2, M["bbox_px"][3] - M["bbox_px"][1]
                if abs(ly - my) < 0.3 * max(lh, mh):
                    if L["text"] == M["text"] and abs(L["bbox_px"][0] - M["bbox_px"][0]) <= 2 * self.z:
                        self.dropped.append(dict(line=L["n"], text=L["text"], font=L["spans"][0]["font"], why="printed twice", y_pt=round(L["bbox_px"][1] / self.z, 1)))
                    else:
                        M["spans"] = sorted(M["spans"] + L["spans"], key=lambda s: s["bbox_px"][0])
                        M["text"], M["bbox_px"] = text_of(M["spans"], self.z), box_of(M["spans"])
                        self.merged.append([M["n"], L["n"]])
                    break
            else:
                out.append(L)
        return out

    @staticmethod
    def inked(ink, box, least=3):
        x0, y0, x1, y1 = [int(round(v)) for v in box]
        return int(ink[max(0, y0):y1 + 1, max(0, x0):x1 + 1].sum()) >= least

    def measure(self, L):
        z = self.z
        L["pt"] = [v / z for v in L["bbox_px"]]
        fonts = collections.Counter()
        for s in L["spans"]:
            if not s["superscript"] and s["text"].strip():
                fonts[s["font"]] += len(s["text"].strip())
        L["font"] = fonts.most_common(1)[0][0] if fonts else ""
        L["size"] = max((s["size"] for s in L["spans"] if s["font"] == L["font"]), default=0)
        L["fonts"] = set(fonts)

    def split_columns(self, lines):
        """Lines in two columns, split into a left and a right piece and put in reading order (see the docstring)."""
        P, z = self.profile, self.z
        cut = {}
        for k, L in enumerate(lines):
            sp = [s for s in L["spans"] if s["text"].strip() and not s["superscript"]]
            best = None
            for j in range(1, len(sp)):
                g = (sp[j]["bbox_px"][0] - sp[j - 1]["bbox_px"][2]) / z
                if g >= P["column_gap_min"] * sp[j]["size"] and (best is None or g > best[1]):
                    best = (sp[j]["bbox_px"][0], g)
            if best:
                left = [s for s in L["spans"] if s["bbox_px"][0] < best[0]]
                right = [s for s in L["spans"] if s["bbox_px"][0] >= best[0]]
                if not PAGE_NUMBER.fullmatch(text_of(right, z).replace(" ", "")):
                    cut[k] = (left, right)
        runs, k = [], 0
        while k < len(lines):
            if k in cut:
                j = k
                while j + 1 in cut:
                    j += 1
                if j > k:
                    rights = [box_of(cut[i][1]) for i in range(k, j + 1)]
                    aligned = any(max(v) - min(v) <= P["column_align"] * z for v in ([b[0] for b in rights], [b[2] for b in rights], [(b[0] + b[2]) / 2 for b in rights]))
                    if aligned:
                        runs.append([k, j])
                k = j + 1
            else:
                k += 1
        if not runs:
            return lines
        out, done = [], set()
        for k, j in runs:
            left = [dict(lines[i], spans=cut[i][0]) for i in range(k, j + 1)]
            right = [dict(lines[i], spans=cut[i][1]) for i in range(k, j + 1)]
            for piece in left + right:
                piece["text"], piece["bbox_px"] = text_of(piece["spans"], z), box_of(piece["spans"])
                self.measure(piece)
            lx1 = max(p["pt"][2] for p in left)
            rx0 = min(p["pt"][0] for p in right)
            # Lines just above or below the run that lie within one column join it.
            def near(a, b):
                return abs(b["pt"][1] - a["pt"][3]) <= P["block_gap"] * max(a["size"], b["size"]) or abs(a["pt"][1] - b["pt"][3]) <= P["block_gap"] * max(a["size"], b["size"])
            lo, hi = k, j
            while lo - 1 >= 0 and lo - 1 not in done and lo - 1 not in cut and lines[lo - 1]["pt"][1] > self.profile["header_max_y"]:
                M = lines[lo - 1]
                if M["pt"][0] >= rx0 - 3 and near(M, right[0]):
                    right.insert(0, M)
                elif M["pt"][2] <= lx1 + 3 and near(M, left[0]):
                    left.insert(0, M)
                else:
                    break
                lo -= 1
            while hi + 1 < len(lines) and hi + 1 not in cut:
                M = lines[hi + 1]
                if M["pt"][0] >= rx0 - 3 and near(right[-1], M):
                    right.append(M)
                elif M["pt"][2] <= lx1 + 3 and near(left[-1], M):
                    left.append(M)
                else:
                    break
                hi += 1
            for p in (left[0], right[0]):
                p["new_block"] = True
            if hi + 1 < len(lines):
                lines[hi + 1]["new_block"] = True
            runs_out = (lo, hi, left, right)
            out.append(runs_out)
            done.update(range(lo, hi + 1))
        result, i = [], 0
        starts = {lo: (hi, left, right) for lo, hi, left, right in out}
        while i < len(lines):
            if i in starts:
                hi, left, right = starts[i]
                for p in left + right:
                    p["column"] = "left" if any(p is q for q in left) else "right"
                result += left + right
                i = hi + 1
            else:
                result.append(lines[i])
                i += 1
        return result

    def classify(self):
        P = self.profile
        rule = min((y for y in self.rules_y if y > P["footnote_rule_min_y"]), default=None)
        for k, L in enumerate(self.lines):
            x0, y0, x1 = L["pt"][0], L["pt"][1], L["pt"][2]
            text = L["text"].strip()
            centered = abs((x0 + x1) / 2 - self.center) <= P["center_tolerance"] and "column" not in L
            danda = bool(DANDA_END.search(text)) and not text.startswith("॥")
            if k == 0 and y0 < P["header_max_y"] and (L["font"] in P["header_fonts"] or re.fullmatch(r"[ivxlc]+", text)):
                L["kind"] = "header" if L["font"] in P["header_fonts"] else "pagenum"
            elif re.fullmatch(r"[ivxlc]+|\d+", text) and L["font"] in P["latin_fonts"] and (y0 < P["header_max_y"] or y0 > P["footer_min_y"]):
                L["kind"] = "pagenum"
            elif rule is not None and y0 > rule:
                L["kind"] = "footnote"
            elif L["size"] >= P["heading_min_size"] or (L["font"] in P["heading_fonts"] and centered and not danda):
                L["kind"] = "chapter_number" if re.fullmatch(r"\d+", text) else "heading"
                L["big"] = L["size"] >= P["chapter_heading_min_size"]
            elif L["fonts"] and (L["fonts"] <= set(P["verse_fonts"]) or (L["fonts"] <= set(P["heading_fonts"]) | set(P["verse_fonts"]) and danda)):
                L["kind"] = "verse"
            else:
                L["kind"] = "body"
            L["centered"] = centered
        # A run of lines in one heading or verse font and size below the heading size, starting at one x, is a verse
        # if any of them ends with a danda (a verse's odd lines may end without one).
        k = 0
        while k < len(self.lines):
            L = self.lines[k]
            j = k
            fonts = set(P["heading_fonts"]) | set(P["verse_fonts"])
            if L["font"] in fonts and L["size"] < P["heading_min_size"] and L["kind"] in ("heading", "verse", "body"):
                while (j + 1 < len(self.lines) and self.lines[j + 1]["font"] == L["font"] and abs(self.lines[j + 1]["size"] - L["size"]) < 0.1
                       and abs(self.lines[j + 1]["pt"][0] - L["pt"][0]) <= 2 and self.lines[j + 1]["kind"] in ("heading", "verse", "body")):
                    j += 1
                run = self.lines[k:j + 1]
                if j > k and any(DANDA_END.search(M["text"]) and not M["text"].strip().startswith("॥") for M in run):
                    for M in run:
                        M["kind"] = "verse"
            k = j + 1
        self.label = self.label_from = None
        for L in self.lines:
            if L["kind"] == "header":
                m = re.search(r"\d+", L["text"])
                self.label = m.group(0) if m else None
                self.label_from = "running header"
        if self.label is None:
            for d in self.dropped:
                m = re.search(r"\d+", d["text"])
                if d["font"] in P["header_fonts"] and d["y_pt"] < P["header_max_y"] and m:
                    self.label, self.label_from = m.group(0), "hidden running header"
                    break
        # The page's own left margin: the leftmost x at which two body lines start, on a page with no numbered
        # sayings (whose hanging indent would pass for a margin); else the book's.
        xs = collections.Counter(round(L["pt"][0]) for L in self.lines if L["kind"] == "body" and "column" not in L and not NUMBER.match(L["text"]))
        cands = sorted(x for x, c in xs.items() if c >= 2)
        items = any(L["kind"] == "body" and NUMBER.match(L["text"]) and L["pt"][0] < P["margin_x"] + P["item_number_max_offset"] for L in self.lines)
        self.margin = cands[0] if cands and not items and cands[0] > P["margin_x"] + 2 else P["margin_x"]

    @property
    def right(self):
        """The right edge of the page's text: the rightmost x at which two body lines end, if it is in the right
        quarter of the book's text block (a page set narrower); else the book's."""
        P = self.profile
        xs = collections.Counter(round(L["pt"][2]) for L in self.lines if L["kind"] in ("body", "footnote") and "column" not in L)
        cands = sorted((x for x, c in xs.items() if c >= 2), reverse=True)
        least = P["right_x"] - (P["right_x"] - P["margin_x"]) / 4
        return cands[0] if cands and cands[0] >= least else P["right_x"]

    @property
    def column_lines(self):
        return {L["n"] for L in self.lines if "column" in L}

    def content(self):
        """Content lines and figures in reading order: each figure before the first line that starts below its top."""
        lines = [L for L in self.lines if L["kind"] in ("heading", "chapter_number", "verse", "body")]
        out, figs = [], sorted(self.figures, key=lambda f: f["pt"][1])
        for L in lines:
            while figs and figs[0]["pt"][1] <= L["pt"][1] and "column" not in L:
                out.append(figs.pop(0))
            out.append(L)
        return out + figs


def line_piece(L, P, kind):
    """{line, polygons, text, spans} for a line: plain text, note markers, superscripts, and bold or italic where a font says so."""
    text, spans, markers = "", [], []
    prev = None

    def apart(a, b):
        return a is not None and b["bbox_px"][0] - a["bbox_px"][2] > 0.2 * b["size"] * L.get("_z", 1)

    for s in L["spans"]:
        t = s["text"]
        if s["superscript"] and NOTE_SIGN.fullmatch(t):
            # A space before the marker if it stands apart from the text before it (58. ¹“…), none if it touches it.
            if text and not text[-1].isspace() and apart(prev, dict(s, size=L["size"] if "size" in L else s["size"])):
                text += " "
            markers.append((len(text), t.strip()))
            prev = s
            continue
        if s["superscript"] and not t.strip():
            continue
        if prev is not None and text and t and not t[0].isspace() and not text[-1].isspace() and apart(prev, s) and not s["superscript"]:
            text += " "
        start = len(text)
        text += t
        style = "superscript" if s["superscript"] else P["span_styles"].get(s["font"]) if kind in ("body", "footnote") else None
        if style and t.strip():
            a = start + (len(t) - len(t.lstrip()))
            spans.append(dict(start=a, end=a + len(t.strip()), kind=style))
        prev = s
    # Collapse spaces, moving offsets with them.
    out, pos_map = [], {}
    for j, c in enumerate(text):
        pos_map[j] = len(out)
        if c.isspace():
            if not out or out[-1] == " ":
                continue
            out.append(" ")
        else:
            out.append(c)
    pos_map[len(text)] = len(out)
    while out and out[-1] == " ":
        out.pop()
    if out and out[0] == " ":
        out.pop(0)
        pos_map = {k: max(0, v - 1) for k, v in pos_map.items()}
    plain = "".join(out)
    n = len(plain)
    sp = [dict(sx, start=min(n, pos_map[sx["start"]]), end=min(n, pos_map[sx["end"]])) for sx in spans]
    sp = [s for s in sp if s["end"] > s["start"]]
    for k, (at, sign) in enumerate(markers):
        sp.append(dict(start=min(n, pos_map.get(at, n)), end=min(n, pos_map.get(at, n)), kind="note_marker", marker=sign))
    x0, y0, x1, y1 = L["bbox_px"]
    piece = dict(line=L["n"], polygons=[[[x0, y0], [x1, y0], [x1, y1], [x0, y1]]], text=unicodedata.normalize("NFC", plain))
    if sp:
        piece["spans"] = sorted(sp, key=lambda s: (s["start"], s["end"]))
    return piece


def cover_test(fp):
    """A test of whether a text box (in points) is covered by a fill or an image that the page draws after the text."""
    log = fp.get_bboxlog()
    covers = [(j, fitz.Rect(r)) for j, (t, r) in enumerate(log) if t in ("fill-path", "fill-image", "fill-imgmask", "fill-shade")]
    trace = [(t["seqno"], fitz.Rect(t["bbox"])) for t in fp.get_texttrace()]
    if not covers:
        return lambda box: False

    def covered(box):
        b = fitz.Rect(box)
        best = max(trace, key=lambda t: (t[1] & b).get_area(), default=None)
        if best is None or (best[1] & b).is_empty:
            return False
        inner = fitz.Rect(b.x0 + 1, b.y0 + 1, b.x1 - 1, b.y1 - 1)
        return any(j > best[0] and r.contains(inner) for j, r in covers)
    return covered


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--book", required=True)
    ap.add_argument("--pages", type=Path, required=True)
    ap.add_argument("--text-run", required=True)
    ap.add_argument("--run", required=True)
    args = ap.parse_args()
    profile = json.loads((HERE / f"profile-{args.book}.json").read_text())
    tl = json.loads((PROJECT_DIR / "schema" / "types" / f"{args.book}.json").read_text())
    spec = json.loads(args.pages.read_text())
    started = datetime.now(timezone.utc)
    pdf = fitz.open(os.path.expanduser(spec["pages"][0]["source_pdf"]))
    image_sha = {}
    pages = []
    for item in spec["pages"]:
        pid = item["input_id"]
        record = json.loads((PROJECT_DIR / "inputs" / f"{pid}.json").read_text())
        layer_path = PROJECT_DIR / "outputs" / pid / M058 / args.text_run / "text-layer.json"
        layer = json.loads(layer_path.read_text())
        fp = pdf[record["pdf_page"] - 1]
        rules = [d["rect"].y0 for d in fp.get_drawings()
                 if d["rect"].height < 2 and profile["footnote_rule_width"][0] <= d["rect"].width <= profile["footnote_rule_width"][1]]
        images = []
        for info in fp.get_image_info(xrefs=True):
            x = info["xref"]
            if x and x not in image_sha:
                image_sha[x] = hashlib.sha256(pdf.extract_image(x)["image"]).hexdigest()
            images.append(dict(xref=x, bbox=list(info["bbox"]), sha256=image_sha.get(x)))
        img = PROJECT_DIR / "inputs" / record["image"]
        ink = np.asarray(Image.open(img).convert("L")) < profile["ink_level"]
        pg = Page(record, layer, rules, images, ink, cover_test(fp), profile)
        pg.layer_path, pg.layer_sha = layer_path, sha256(layer_path)
        pages.append(pg)
    for pg in pages:
        for L in pg.lines:
            L["_z"] = pg.z
    # The book's vocabulary: words inside lines (not a line's first or last word, which may be pieces of a word).
    vocab = collections.Counter()
    for pg in pages:
        for L in pg.lines:
            ws = [core(w) for w in L["text"].split()]
            for w in ws[1:-1]:
                if w:
                    vocab[w] += 1

    endings = collections.Counter()
    for w in vocab:
        for k in range(1, len(w)):
            endings[w[k:]] += 1

    def end_of(a_text, b_text):
        a = a_text.split()[-1] if a_text.split() else ""
        b = b_text.split()[0] if b_text.split() else ""
        if not a or not b:
            return "space"
        if a.endswith("-"):
            return "join"
        if a[-1] in PUNCT or b[0] in PUNCT or b[0].isdigit() or b[0].isascii():
            return "space"
        if (core(a) + core(b)) in vocab:
            return "join"
        return "join" if endings[core(b)] >= 2 and not vocab.get(core(b)) else "space"

    def continues(btype, hanging, verse_open, L0, margin):
        """Whether a page's first content line goes on with the previous page's last block (or verse)."""
        if L0["kind"] == "verse":
            return verse_open
        if L0["kind"] != "body" or NUMBER.match(L0["text"]):
            return False
        if btype == "saying":
            return L0["pt"][0] >= (hanging - 3 if hanging else profile["hanging_min_x"])
        if btype == "paragraph":
            return L0["pt"][0] <= margin + profile["indent_min"]
        return False

    def starts_chapter(L):
        return L["kind"] == "chapter_number" or (L["kind"] == "heading" and L.get("big"))

    # Pass over the book: units per page, with the state carried from page to page.
    state = dict(block=None, verse_open=False, hanging=None, chapter_seen=False)
    docs, stats = [], collections.Counter()
    first_kinds = []
    for pg in pages:
        c = [L for L in pg.content() if L["kind"] != "figure"]
        first_kinds.append(c[0]["kind"] if c else None)
    for idx, pg in enumerate(pages):
        pid = pg.record["input_id"]
        units, regions, flows, relations = [], [], {"main": [], "notes": []}, []
        uid = iter(f"u{i}" for i in range(1, 10000))
        rid = iter(f"r{i}" for i in range(1, 10000))
        byid = {}

        def new_unit(type_, parent=None, flow=None, **kw):
            u = dict(id=next(uid), type=type_, **{k: v for k, v in kw.items() if v is not None}, children=[])
            units.append(u); byid[u["id"]] = u
            if parent:
                parent["children"].append({"unit": u["id"]})
            elif flow:
                flows[flow].append(u["id"])
            return u

        def new_region(unit, type_, L, kind):
            r = dict(id=next(rid), type=type_, lines=[line_piece(L, profile, kind)], order=len(regions) + 1)
            regions.append(r)
            if unit is not None:
                unit["children"].append({"region": f"{pid}#{r['id']}"})
            return r

        chapter = None
        block = None          # (unit, current region) of the paragraph or saying being read
        verse = None          # (unit, region) of the verse being read
        cur_heading = None    # (unit, region, index of its last line)
        content = pg.content()
        text_content = [L for L in content if L["kind"] != "figure"]
        cont_start = bool(text_content) and state["chapter_seen"] and continues(state["block"], state["hanging"], state["verse_open"], text_content[0], pg.margin)
        # Lines and figures before a chapter's start on this page belong to that chapter, if they are only centered
        # headings or verse lines (an invocation) and figures, and do not go on with the previous page.
        first_start = next((k for k, L in enumerate(content) if L["kind"] != "figure" and starts_chapter(L)), None)
        pre = 0
        if first_start and not cont_start and all(L["kind"] == "figure" or (L["kind"] in ("heading", "verse") and L["centered"]) for L in content[:first_start]):
            pre = first_start
            stats["pages with an invocation or figure before a chapter's start"] += 1

        def ensure_chapter():
            nonlocal chapter
            if chapter is None:
                chapter = new_unit("chapter", flow="main")
                chapter["_fresh"] = False
                if state["chapter_seen"]:
                    chapter["open"] = {"start": True}
            return chapter

        def gap_before(k):
            """Whether a wide vertical gap stands between content item k and the one before it."""
            if k == 0 or content[k].get("new_block"):
                return k > 0
            a, b = content[k - 1], content[k]
            if a["kind"] == "figure" or b["kind"] == "figure":
                return True
            return b["pt"][1] - a["pt"][3] > profile["block_gap"] * min(a["size"], b["size"])

        # Furniture first.
        for L in pg.lines:
            if L["kind"] in ("header", "pagenum"):
                new_region(None, "running_header" if L["kind"] == "header" else "page_number", L, "furniture")
        for k, L in enumerate(content):
            kind = L["kind"]
            if k == 0 and pre:
                chapter = new_unit("chapter", flow="main")
                chapter["_fresh"] = True
                state["chapter_seen"] = True
                state.update(block=None, hanging=None, verse_open=False)
            if k < pre and kind == "verse":
                kind = "heading"
            if kind == "figure":
                ensure_chapter()
                fu = new_unit("figure", parent=chapter, label=L["label"])
                r = dict(id=next(rid), type="figure", order=len(regions) + 1, _box=L["bbox_px"], _image=dict(xref=L["xref"], sha256=L["sha256"]))
                regions.append(r)
                fu["children"].append({"region": f"{pid}#{r['id']}"})
                stats["figures"] += 1
                block, verse, cur_heading = None, None, None
                state.update(block=None, hanging=None, verse_open=False)
                continue
            x0 = L["pt"][0]
            if kind != "figure" and starts_chapter(dict(L, kind=kind)):
                if chapter is not None and chapter.get("_fresh"):
                    pass
                else:
                    chapter = new_unit("chapter", flow="main")
                    chapter["_fresh"] = True
                    state["chapter_seen"] = True
                    cur_heading = None
                    block, verse = None, None
                    state.update(block=None, hanging=None, verse_open=False)
                if kind == "chapter_number" and not chapter.get("number"):
                    chapter["number"] = L["text"].strip()
            if kind in ("heading", "chapter_number"):
                ensure_chapter()
                if cur_heading and cur_heading[2] == k - 1 and (not gap_before(k) or content[k - 1]["kind"] == "chapter_number"):
                    cur_heading[1]["lines"].append(line_piece(L, profile, "heading"))
                    cur_heading = (cur_heading[0], cur_heading[1], k)
                else:
                    u = new_unit("heading", parent=chapter)
                    cur_heading = (u, new_region(u, "heading", L, "heading"), k)
                if kind == "heading" and L.get("big") and not chapter.get("label"):
                    chapter["label"] = L["text"].strip()
                if kind == "heading" and L["text"].strip() in profile.get("contents_headings", []):
                    chapter["_contents"] = True
                block, verse = None, None
                state.update(block=None, hanging=None, verse_open=False)
                continue
            ensure_chapter()
            chapter["_fresh"] = False
            if kind == "body" and chapter.get("_contents"):
                m = NUMBER.match(L["text"])
                u = new_unit("contents_entry", parent=chapter, number=m.group(1) if m else None)
                new_region(u, "contents_entry", L, "body")
                block, verse = None, None
                continue
            if kind == "verse":
                if verse and state["verse_open"]:
                    verse[1]["lines"][-1]["end"] = "line"
                    verse[1]["lines"].append(line_piece(L, profile, "verse"))
                else:
                    parent = block[0] if block else chapter
                    vu = new_unit("verse", parent=parent)
                    if k == 0 and cont_start and (chapter.get("open") or {}).get("start"):
                        vu["open"] = {"start": True}
                        if block:
                            block[0].setdefault("open", {})["start"] = True
                    verse = (vu, new_region(vu, "verse", L, "verse"))
                state["verse_open"] = not L["text"].rstrip().rstrip("0123456789 ").endswith("॥")
                stats["verse lines"] += 1
                continue
            # Body text.
            if gap_before(k) and block is not None and not (block[0]["type"] == "saying" and not L.get("new_block")):
                block, verse = None, None
                state["hanging"] = None
                stats["blocks ended by a gap or a column"] += 1
            item = NUMBER.match(L["text"])
            starts_item = bool(item) and x0 < profile["margin_x"] + profile["item_number_max_offset"]
            verse_between = verse is not None and block is not None and verse[0]["id"] in [ch.get("unit") for ch in block[0]["children"]][-1:]
            verse = None
            state["verse_open"] = False
            if starts_item:
                u = new_unit("saying", parent=chapter, number=item.group(1))
                block = (u, new_region(u, "saying", L, "body"))
                state["hanging"] = None
                stats["sayings"] += 1
                continue
            hanging = state["hanging"]
            if block and block[0]["type"] == "saying" and hanging is None and len(block[1]["lines"]) == 1 and block[1]["lines"][0]["line"] == content[k - 1].get("n") if k else False:
                state["hanging"] = hanging = x0
            in_saying = block is not None and block[0]["type"] == "saying" and (hanging is None or x0 >= hanging - 3)
            if in_saying:
                if hanging is not None and x0 > hanging + profile["indent_min"] or verse_between:
                    block = (block[0], new_region(block[0], "saying", L, "body"))
                else:
                    block[1]["lines"].append(line_piece(L, profile, "body"))
                continue
            if block is not None and block[0]["type"] == "saying":
                block = None
                state["hanging"] = None
            indented = x0 > pg.margin + profile["indent_min"] and "column" not in L
            if block is None or indented:
                if block is None and k == 0 and cont_start and state["block"] == "paragraph" and not indented:
                    u = new_unit("paragraph", parent=chapter, open={"start": True})
                elif block is None and k == 0 and cont_start and state["block"] == "saying":
                    u = new_unit("saying", parent=chapter, open={"start": True})
                    state["hanging"] = state["hanging"] or x0
                else:
                    u = new_unit("paragraph", parent=chapter)
                if not (chapter.get("open") or {}).get("start"):
                    u.pop("open", None)
                block = (u, new_region(u, u["type"], L, "body"))
                if u["type"] == "paragraph":
                    stats["paragraphs"] += 1
                if "column" in L:
                    stats["column pieces"] += 1
                continue
            if verse_between:
                block = (block[0], new_region(block[0], block[0]["type"], L, "body"))
            else:
                block[1]["lines"].append(line_piece(L, profile, "body"))
        # Footnotes.
        note = None
        for L in pg.lines:
            if L["kind"] != "footnote":
                continue
            m = NUMBER.match(L["text"]) or re.match(r"^(\d{1,3}|[*†‡])\s", L["text"])
            if m or note is None:
                note = new_unit("footnote", flow="notes", number=m.group(1) if m else None)
                new_region(note, "footnote", L, "footnote")
                stats["footnotes"] += 1
            else:
                note_region = regions[[r["id"] for r in regions].index(note["children"][-1]["region"].split("#")[1])]
                note_region["lines"].append(line_piece(L, profile, "footnote"))
        # Note relations by number.
        notes = {u.get("number"): u for u in units if u["type"] == "footnote"}
        mk = 0
        for r in regions:
            for piece in r.get("lines", []):
                for s in piece.get("spans", []):
                    if s["kind"] == "note_marker":
                        mk += 1
                        s["id"] = f"m{mk}"
                        target = notes.get(s["marker"])
                        stats["note markers"] += 1
                        if target:
                            relations.append(dict(type="note", from_={"anchor": f"{pid}#{s['id']}"}, to={"unit": target["id"]}))
                            stats["note markers linked"] += 1
        # Open ends from the next page with content.
        nxt = next((j for j in range(idx + 1, len(pages)) if first_kinds[j]), None)
        nxt_page = pages[nxt] if nxt is not None else None
        nxt_content = [L for L in nxt_page.content() if L["kind"] != "figure"] if nxt_page else []
        nxt_all = nxt_page.content() if nxt_page else []
        nxt_first_start = next((k for k, L in enumerate(nxt_all) if L["kind"] != "figure" and starts_chapter(L)), None)
        nxt_starts_chapter = bool(nxt_content) and (starts_chapter(nxt_content[0]) or bool(nxt_first_start) and all(
            L["kind"] == "figure" or (L["kind"] in ("heading", "verse") and L["centered"]) for L in nxt_all[:nxt_first_start]))
        if chapter is not None and nxt_page and not nxt_starts_chapter and state["chapter_seen"]:
            chapter.setdefault("open", {})["end"] = True
            last = chapter["children"][-1] if chapter["children"] else None
            # The last block goes on if the next page begins with a continued line.
            if last and "unit" in last and nxt_content:
                lu = byid[last["unit"]]
                L0 = nxt_content[0]
                goes_on = lu["type"] in ("paragraph", "saying") and L0["kind"] == "body" and continues(lu["type"], state["hanging"], False, L0, nxt_page.margin)
                v_last = byid.get(lu["children"][-1].get("unit")) if lu["children"] and "unit" in lu["children"][-1] else None
                if lu["type"] == "verse" and L0["kind"] == "verse" and state["verse_open"]:
                    lu.setdefault("open", {})["end"] = True
                elif v_last and v_last["type"] == "verse" and L0["kind"] == "verse" and state["verse_open"]:
                    lu.setdefault("open", {})["end"] = True
                    v_last.setdefault("open", {})["end"] = True
                elif goes_on:
                    lu.setdefault("open", {})["end"] = True
                    stats["blocks going on to the next page"] += 1
                    # How the page's last line joins the next page's first.
                    last_region = next(r for r in reversed(regions) if f"{pid}#{r['id']}" in [ch.get("region") for ch in lu["children"]])
                    e = end_of(last_region["lines"][-1]["text"], L0["text"])
                    if e != "space":
                        last_region["lines"][-1]["end"] = e
        state["block"] = block[0]["type"] if block else None
        # Ends of lines inside regions: a heading's lines, and a line that stops short of the page's right edge (in an
        # imprint, an address, a column), end with a line break; others as the vocabulary says.
        for r in regions:
            if r["type"] in ("verse", "running_header", "page_number", "figure"):
                continue
            for a, b in zip(r["lines"], r["lines"][1:]):
                x1 = max(p[0] for ring in a["polygons"] for p in ring) / pg.z
                if r["type"] == "heading" or pg.right - x1 > profile["short_line"] or a["line"] in pg.column_lines:
                    e = "line"
                else:
                    e = end_of(a["text"], b["text"])
                stats[f"line ends {e}"] += 1
                if e != "space":
                    a["end"] = e
        for u in units:
            u.pop("_contents", None)
            u.pop("_fresh", None)
            if "open" in u and not u["open"]:
                del u["open"]
        for r in regions:
            if "_box" in r:
                x0, y0, x1, y1 = r.pop("_box")
                r["polygons"] = [[[x0, y0], [x1, y0], [x1, y1], [x0, y1]]]
                r["box"] = [x0, y0, x1 + 1, y1 + 1]
                r["source"] = dict(method=METHOD_ID, pdf_image=r.pop("_image"))
                continue
            xs = [p for L in r["lines"] for ring in L["polygons"] for p in ring]
            x0, y0, x1, y1 = min(p[0] for p in xs) - 2, min(p[1] for p in xs) - 2, max(p[0] for p in xs) + 2, max(p[1] for p in xs) + 2
            r["polygons"] = [[[x0, y0], [x1, y0], [x1, y1], [x0, y1]]]
            r["box"] = [x0, y0, x1 + 1, y1 + 1]
            r["source"] = dict(method=METHOD_ID)
        regions_out = [{k: r[k] for k in ("id", "type", "polygons", "box", "lines", "order", "source") if k in r} for r in regions]
        page = dict(id=pid, image=pg.record["image"], image_sha256=pg.record["image_sha256"], width=pg.record["width"], height=pg.record["height"])
        if pg.label:
            page["label"] = pg.label
        page["regions"] = regions_out
        rels = [dict(type=r["type"], **{"from": r["from_"]}, to=r["to"]) for r in relations]
        src = dict(method=METHOD_ID, text_layer=str(pg.layer_path.relative_to(PROJECT_DIR)), text_layer_sha256=pg.layer_sha,
                   profile=f"profile-{args.book}.json", created_at_utc=started.isoformat(), problems=[])
        if pg.label_from == "hidden running header":
            src["label_from"] = pg.label_from
            stats["labels from a hidden running header"] += 1
        if pg.small_markers:
            src["small_digits_read_as_markers"] = pg.small_markers
            stats["small digits read as note markers"] += len(pg.small_markers)
        if pg.merged:
            src["lines_merged_on_one_baseline"] = pg.merged
            stats["text-layer lines merged into the line on their baseline"] += len(pg.merged)
        if pg.dropped:
            src["text_not_printed"] = pg.dropped
            stats["spans left out as not printed"] += len(pg.dropped)
        if pg.margin != profile["margin_x"]:
            src["left_margin_pt"] = pg.margin
            stats["pages with their own left margin"] += 1
        doc = dict(format="page", schema_version="0.2", book_id=args.book, page=page, units=units, flows={k: v for k, v in flows.items() if v},
                   relations=rels, source=src)
        errors = bk.validate(doc) or bk.check_document(doc, tl)[0]
        stats["pages"] += 1
        stats["valid pages"] += not errors
        if errors:
            doc["source"]["problems"] = errors[:5]
        out = PROJECT_DIR / "outputs" / pid / METHOD_ID / args.run
        if out.exists() and any(out.iterdir()):
            sys.exit(f"Output directory exists and is not empty: {out}")
        out.mkdir(parents=True, exist_ok=True)
        (out / "page.json").write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")) + "\n")
        docs.append((pid, errors))
    survey = PROJECT_DIR / "outputs" / "surveys" / METHOD_ID / args.run
    survey.mkdir(parents=True, exist_ok=True)
    summary = dict(method=METHOD_ID, book=args.book, run=args.run, text_run=args.text_run, created_at_utc=started.isoformat(),
                   counts=dict(stats), invalid={pid: e[:3] for pid, e in docs if e}, code_sha256=sha256(__file__),
                   profile_sha256=sha256(HERE / f"profile-{args.book}.json"), type_list_sha256=sha256(PROJECT_DIR / "schema" / "types" / f"{args.book}.json"))
    (survey / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=1) + "\n")
    print(json.dumps(dict(stats), ensure_ascii=False))
    for pid, e in docs:
        if e:
            print(pid, e[:2])


if __name__ == "__main__":
    main()
