#!/usr/bin/env python3
"""Page documents (schema 0.2) for a digital PDF from its typography: method 058's converted text layer, arranged into
the units of the book's type list by font, size, indent and the PDF's footnote rules. No API calls.

Book-specific choices are in profile-<book_id>.json: which fonts are the running header, headings, verses, and bold or
italic inside running text; the size from which a heading starts a chapter. Lines are classified as:
- furniture: the running header (the top line in its font; its digits are the page's label), a page number alone;
- footnotes: every line below a footnote rule (a short horizontal line drawn in the lower part of the page); a line
  starting with a number starts a footnote;
- heading: a line in a heading font; a chapter's number (digits alone) or a heading at the chapter size starts a chapter;
- verse: a line set entirely in verse fonts; a verse ends at a line ending with ॥;
- body: a numbered saying starts at "N." near the left margin; after it, lines at its hanging indent continue it and a
  further-indented line starts a new paragraph of it; elsewhere an indented first line starts a paragraph.
A verse inside a paragraph or saying (one that the text goes on after) is a child unit of it. Units open at a page's
edges are marked from the neighboring pages (a page that begins with a continued line, a chapter that goes on). Note
markers (superscript spans) are linked to the page's footnote with the same number. Where a word runs on to the next
line without a hyphen is decided from the book's own vocabulary (words inside lines): the lines are joined if the joined
form occurs, or if the next line's first word ends at least two other words and never stands alone (a word's ending,
such as ವಾಗಿದೆ or ಕೊಂಡು, rather than a rare whole word). In a chapter headed as a table of contents (profile:
contents_headings), each body line is a contents entry.

Usage: uv run --offline python methods/059-…/run.py --book vachana --pages inputs/pages-vachana-book.json --text-run book-002 --run book-001
"""
import argparse
import collections
import hashlib
import json
import os
import re
import sys
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

import fitz

HERE = Path(__file__).resolve().parent
PROJECT_DIR = HERE.parents[1]
METHOD_ID = HERE.name
M058 = "058-pdf-text-layer-kannada-converter"
sys.path.insert(0, str(PROJECT_DIR / "schema"))
import book as bk  # noqa: E402

PUNCT = "“”‘’\"',.;:!?()[]।॥-–"
NUMBER = re.compile(r"^(\d{1,3})\.\s")


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def core(w):
    return w.strip(PUNCT)


class Page:
    def __init__(self, record, layer, rules_y, profile):
        self.record, self.layer, self.profile = record, layer, profile
        self.z = layer["zoom"]
        self.rules_y = rules_y
        self.lines = layer["lines"]
        for L in self.lines:
            L["pt"] = [v / self.z for v in L["bbox_px"]]
            fonts = collections.Counter()
            for s in L["spans"]:
                if not s["superscript"] and s["text"].strip():
                    fonts[s["font"]] += len(s["text"].strip())
            L["font"] = fonts.most_common(1)[0][0] if fonts else ""
            L["size"] = max((s["size"] for s in L["spans"] if s["font"] == L["font"]), default=0)
            L["fonts"] = set(fonts)
        self.classify()

    def classify(self):
        P = self.profile
        rule = min((y for y in self.rules_y if y > P["footnote_rule_min_y"]), default=None)
        for k, L in enumerate(self.lines):
            x0, y0 = L["pt"][0], L["pt"][1]
            text = L["text"].strip()
            if k == 0 and y0 < P["header_max_y"] and (L["font"] in P["header_fonts"] or re.fullmatch(r"[ivxlc]+", text)):
                L["kind"] = "header" if L["font"] in P["header_fonts"] else "pagenum"
            elif re.fullmatch(r"[ivxlc]+|\d+", text) and L["font"] in P["latin_fonts"] and (y0 < P["header_max_y"] or y0 > P["footer_min_y"]):
                L["kind"] = "pagenum"
            elif rule is not None and y0 > rule:
                L["kind"] = "footnote"
            elif L["font"] in P["heading_fonts"] or L["size"] >= P["heading_min_size"]:
                L["kind"] = "chapter_number" if re.fullmatch(r"\d+", text) else "heading"
                L["big"] = L["size"] >= P["chapter_heading_min_size"]
            elif L["fonts"] and L["fonts"] <= set(P["verse_fonts"]):
                L["kind"] = "verse"
            else:
                L["kind"] = "body"
        self.label = None
        for L in self.lines:
            if L["kind"] == "header":
                m = re.search(r"\d+", L["text"])
                self.label = m.group(0) if m else None

    def content(self):
        return [L for L in self.lines if L["kind"] in ("heading", "chapter_number", "verse", "body")]


def line_piece(L, P, kind):
    """{line, polygons, text, spans} for a line: plain text, note markers, and bold or italic where a font says so."""
    text, spans, markers = "", [], []
    prev = None
    for s in L["spans"]:
        t = s["text"]
        if s["superscript"]:
            markers.append((len(text), t.strip()))
            continue
        if prev is not None and text and t and not t[0].isspace() and not text[-1].isspace() and s["bbox_px"][0] - prev["bbox_px"][2] > 0.2 * s["size"] * L.get("_z", 1):
            text += " "
        start = len(text)
        text += t
        style = P["span_styles"].get(s["font"]) if kind in ("body", "footnote") else None
        if style and t.strip():
            a = start + (len(t) - len(t.lstrip()))
            spans.append(dict(start=a, end=a + len(t.strip()), kind=style))
        prev = s
    # Collapse spaces, moving offsets with them.
    out, pos_map, i = [], {}, 0
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
    pages = []
    for item in spec["pages"]:
        pid = item["input_id"]
        record = json.loads((PROJECT_DIR / "inputs" / f"{pid}.json").read_text())
        layer_path = PROJECT_DIR / "outputs" / pid / M058 / args.text_run / "text-layer.json"
        layer = json.loads(layer_path.read_text())
        rules = [d["rect"].y0 for d in pdf[record["pdf_page"] - 1].get_drawings()
                 if d["rect"].height < 2 and profile["footnote_rule_width"][0] <= d["rect"].width <= profile["footnote_rule_width"][1]]
        pg = Page(record, layer, rules, profile)
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

    def continues(btype, hanging, verse_open, L0):
        """Whether a page's first content line goes on with the previous page's last block (or verse)."""
        if L0["kind"] == "verse":
            return verse_open
        if L0["kind"] != "body" or NUMBER.match(L0["text"]):
            return False
        if btype == "saying":
            return L0["pt"][0] >= (hanging - 3 if hanging else profile["hanging_min_x"])
        if btype == "paragraph":
            return L0["pt"][0] <= profile["margin_x"] + profile["indent_min"]
        return False

    # Pass over the book: units per page, with the state carried from page to page.
    state = dict(block=None, verse_open=False, hanging=None, chapter_seen=False)
    docs, stats = [], collections.Counter()
    first_kinds = []
    for pg in pages:
        c = pg.content()
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
        cur_heading = None
        content = pg.content()
        cont_start = bool(content) and state["chapter_seen"] and continues(state["block"], state["hanging"], state["verse_open"], content[0])

        def ensure_chapter():
            nonlocal chapter
            if chapter is None:
                chapter = new_unit("chapter", flow="main")
                if state["chapter_seen"]:
                    chapter["open"] = {"start": True}
            return chapter

        # Furniture first.
        for L in pg.lines:
            if L["kind"] in ("header", "pagenum"):
                new_region(None, "running_header" if L["kind"] == "header" else "page_number", L, "furniture")
        for k, L in enumerate(content):
            x0 = L["pt"][0]
            kind = L["kind"]
            if kind == "chapter_number" or (kind == "heading" and L.get("big") and not (cur_heading and cur_heading[2] == k - 1)):
                if cur_heading and cur_heading[2] == k - 1 and kind == "heading":
                    pass
                else:
                    chapter = new_unit("chapter", flow="main", number=L["text"].strip() if kind == "chapter_number" else None)
                    state["chapter_seen"] = True
                    cur_heading = None
                    block, verse = None, None
                    state.update(block=None, hanging=None, verse_open=False)
            if kind in ("heading", "chapter_number"):
                ensure_chapter()
                if cur_heading and cur_heading[2] == k - 1:
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
            if block and block[0]["type"] == "saying" and hanging is None and len(block[1]["lines"]) == 1 and block[1]["lines"][0]["line"] == content[k - 1]["n"] if k else False:
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
            indented = x0 > profile["margin_x"] + profile["indent_min"]
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
            m = NUMBER.match(L["text"]) or re.match(r"^(\d{1,3})\s", L["text"])
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
            for piece in r["lines"]:
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
        nxt_content = nxt_page.content() if nxt_page else []
        nxt_starts_chapter = bool(nxt_content) and (nxt_content[0]["kind"] == "chapter_number" or nxt_content[0]["kind"] == "heading" and nxt_content[0].get("big"))
        if chapter is not None and nxt_page and not nxt_starts_chapter and state["chapter_seen"]:
            chapter.setdefault("open", {})["end"] = True
            last = chapter["children"][-1] if chapter["children"] else None
            # The last block goes on if the next page begins with a continued line.
            if last and "unit" in last and nxt_content:
                lu = byid[last["unit"]]
                L0 = nxt_content[0]
                goes_on = lu["type"] in ("paragraph", "saying") and L0["kind"] == "body" and continues(lu["type"], state["hanging"], False, L0)
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
        # Ends of lines inside regions.
        for r in regions:
            if r["type"] in ("verse", "running_header", "page_number"):
                continue
            for a, b in zip(r["lines"], r["lines"][1:]):
                e = end_of(a["text"], b["text"])
                stats[f"line ends {e}"] += 1
                if e != "space":
                    a["end"] = e
        # Fix the open flags so that the page document is consistent: a unit open at the start is the first child of a
        # parent open at the start (and likewise at the end).
        for u in units:
            u.pop("_contents", None)
            if "open" in u and not u["open"]:
                del u["open"]
        for r in regions:
            xs = [p for L in r["lines"] for ring in L["polygons"] for p in ring]
            x0, y0, x1, y1 = min(p[0] for p in xs) - 2, min(p[1] for p in xs) - 2, max(p[0] for p in xs) + 2, max(p[1] for p in xs) + 2
            r["polygons"] = [[[x0, y0], [x1, y0], [x1, y1], [x0, y1]]]
            r["box"] = [x0, y0, x1 + 1, y1 + 1]
            r["source"] = dict(method=METHOD_ID)
        page = dict(id=pid, image=pg.record["image"], image_sha256=pg.record["image_sha256"], width=pg.record["width"], height=pg.record["height"])
        if pg.label:
            page["label"] = pg.label
        page["regions"] = regions
        rels = [dict(type=r["type"], **{"from": r["from_"]}, to=r["to"]) for r in relations]
        doc = dict(format="page", schema_version="0.2", book_id=args.book, page=page, units=units, flows={k: v for k, v in flows.items() if v},
                   relations=rels, source=dict(method=METHOD_ID, text_layer=str(pg.layer_path.relative_to(PROJECT_DIR)), text_layer_sha256=pg.layer_sha,
                                                profile=f"profile-{args.book}.json", created_at_utc=started.isoformat(), problems=[]))
        errors = bk.validate(doc) or bk.check_document(doc, tl)[0]
        stats["pages"] += 1
        stats["valid pages"] += not errors
        if errors:
            doc["source"]["problems"] = errors[:5]
        out = PROJECT_DIR / "outputs" / pid / METHOD_ID / args.run
        out.mkdir(parents=True, exist_ok=True)
        (out / "page.json").write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")) + "\n")
        docs.append((pid, errors))
    survey = PROJECT_DIR / "outputs" / "surveys" / METHOD_ID / args.run
    survey.mkdir(parents=True, exist_ok=True)
    summary = dict(method=METHOD_ID, book=args.book, run=args.run, text_run=args.text_run, created_at_utc=started.isoformat(),
                   counts=dict(stats), invalid={pid: e[:3] for pid, e in docs if e}, code_sha256=sha256(__file__),
                   profile_sha256=sha256(HERE / f"profile-{args.book}.json"))
    (survey / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=1) + "\n")
    print(json.dumps(dict(stats), ensure_ascii=False))
    for pid, e in docs:
        if e:
            print(pid, e[:2])


if __name__ == "__main__":
    main()
