#!/usr/bin/env python3
"""Review sheets for the continuation truth, one per run, showing only the truth (no model output). Local only.

For each stream (body, then notes) and each page or column in order, the sheet shows a crop around the first line
(top of the stream on that page) and the last line (bottom), so the bottom of one page sits directly above the top
of the next. The anchor line is outlined, and the header states the truth in words. Line boxes come from the
method 032 line finder as copied into method 035, the same one the anchors' line ids refer to.

Usage: uv run --offline python references/continuations/review.py
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
PROJECT_DIR = HERE.parent.parent
LINES_DIR = PROJECT_DIR / "methods" / "035-gpt-6.1-terra-none-column-margin-ownership"
sys.path.insert(0, str(LINES_DIR))
import analysis  # noqa: E402

WIDTH = 1300
CONTINUES = (200, 90, 0)
COMPLETE = (70, 70, 70)


def line_boxes(page, config):
    gray = np.asarray(Image.open(PROJECT_DIR / "inputs" / f"{page}.png").convert("L"))
    _, arrays = analysis.analyze(gray, config)
    st, line_of = arrays["comp"]["stats"], arrays["seg"]["line_of"]
    boxes, columns = {}, {}
    for L in arrays["seg"]["lines"]:
        ks = np.flatnonzero(line_of == L["line_id"])
        boxes[L["line_id"]] = (st[ks, 0], st[ks, 1], st[ks, 0] + st[ks, 2], st[ks, 1] + st[ks, 3])
        columns[L["line_id"]] = L["column"]
    return boxes, float(arrays["comp"]["char_h"]), columns


def anchor_box(boxes, anchor):
    x0, y0, x1, y1 = boxes[anchor["line"]]
    if "x" in anchor:
        cx = (x0 + x1) / 2
        keep = (cx >= anchor["x"][0]) & (cx <= anchor["x"][1])
        x0, y0, x1, y1 = x0[keep], y0[keep], x1[keep], y1[keep]
    return int(x0.min()), int(y0.min()), int(x1.max()), int(y1.max())


def describe(edge, links, short, side):
    where = "top" if edge["edge"] == "start" else "bottom"
    stream = "main text" if edge["stream"] == "body" else "notes"
    head = f"{short(edge['page'])}, {stream}, {where} of {side or 'page'}"
    line = edge["anchor"]["line"]
    if edge["edge"] == "start":
        if not edge["continues"]:
            return head, "TRUTH: this unit STARTS here (does not continue from earlier)"
        src = [l for l in links if l["to"]["page"] == edge["page"] and l["to"]["line"] == line and l["stream"] == edge["stream"]]
        frm = ("from the left column of this image" if src and src[0]["from"]["page"] == edge["page"]
               else f"from {short(src[0]['from']['page'])}" if src else "from a page before this run")
        return head, f"TRUTH: this unit CONTINUES {frm}"
    if not edge["continues"]:
        return head, "TRUTH: this unit ENDS here (does not continue later)"
    dst = [l for l in links if l["from"]["page"] == edge["page"] and l["from"]["line"] == line and l["stream"] == edge["stream"]]
    to = ("in the right column of this image" if dst and dst[0]["to"]["page"] == edge["page"]
          else f"on {short(dst[0]['to']['page'])}" if dst else "on a page after this run")
    return head, f"TRUTH: this unit CONTINUES {to}"


def main():
    truth = json.loads((HERE / "truth.json").read_text())
    config = json.loads((LINES_DIR / "line-config.json").read_text())
    font = ImageFont.load_default(size=26)
    small = ImageFont.load_default(size=22)
    for name, run in truth["runs"].items():
        pages = sorted({e["page"] for e in run["edges"]})
        short = lambda p: "page " + p.rsplit("-page-", 1)[1].lstrip("0")
        cache = {p: line_boxes(p, config) for p in pages}
        widths = {p: Image.open(PROJECT_DIR / "inputs" / f"{p}.png").width for p in pages}

        def column(e):
            """The line finder's column, then left or right half for anchors restricted to an x range."""
            col = cache[e["page"]][2][e["anchor"]["line"]]
            half = int("x" in e["anchor"] and e["anchor"]["point"][0] > widths[e["page"]] / 2)
            return col, half

        order = sorted(run["edges"], key=lambda e: (e["stream"] != "body", pages.index(e["page"]), column(e), e["edge"] != "start"))
        tiles = []
        for e in order:
            boxes, char_h, _ = cache[e["page"]]
            im = Image.open(PROJECT_DIR / "inputs" / f"{e['page']}.png").convert("RGB")
            ax0, ay0, ax1, ay1 = anchor_box(boxes, e["anchor"])
            lx0, _, lx1, _ = anchor_box(boxes, {"line": e["anchor"]["line"]})
            span = 3.2 * char_h * 1.6
            if e["edge"] == "start":
                y0, y1 = ay0 - 1.2 * char_h, ay1 + span
            else:
                y0, y1 = ay0 - span, ay1 + 1.2 * char_h
            # Crop to the column: every line of the anchor's column that overlaps the crop band. An x range wider
            # than 40% of the page marks a text column on a page the line finder did not split, so clip to it.
            col = cache[e["page"]][2][e["anchor"]["line"]]
            near = [anchor_box(boxes, {"line": i}) for i in boxes if cache[e["page"]][2][i] == col]
            near = [b for b in near if b[3] >= y0 and b[1] <= y1 and b[2] - b[0] > 2 * char_h]
            x0 = min([b[0] for b in near] + [ax0, lx0]) - char_h
            x1 = max([b[2] for b in near] + [ax1, lx1]) + char_h
            if "x" in e["anchor"] and e["anchor"]["x"][1] - e["anchor"]["x"][0] > 0.4 * im.width:
                x0, x1 = max(x0, e["anchor"]["x"][0]), min(x1, e["anchor"]["x"][1])
            box = tuple(int(v) for v in (max(0, x0), max(0, y0), min(im.width, x1), min(im.height, y1)))
            crop = im.crop(box)
            d = ImageDraw.Draw(crop)
            color = CONTINUES if e["continues"] else COMPLETE
            d.rectangle((ax0 - box[0] - 6, ay0 - box[1] - 4, ax1 - box[0] + 6, ay1 - box[1] + 4), outline=color, width=4)
            scale = min(1.5, (WIDTH - 20) / crop.width)
            crop = crop.resize((int(crop.width * scale), int(crop.height * scale)), Image.LANCZOS)
            keys = sorted({column(x) for x in run["edges"] if x["page"] == e["page"] and x["stream"] == e["stream"]})
            side = None if len(keys) < 2 else ("left column", "right column")[keys.index(column(e))]
            head, verdict = describe(e, run["links"], short, side)
            note = f"   ({e['note']})" if e.get("note") else ""
            tile = Image.new("RGB", (WIDTH, crop.height + 74), "white")
            td = ImageDraw.Draw(tile)
            td.rectangle((0, 0, WIDTH, 68), fill=(255, 240, 215) if e["continues"] else (232, 232, 232))
            td.text((10, 4), head + note, fill=(0, 0, 0), font=small)
            td.text((10, 34), verdict, fill=color, font=font)
            tile.paste(crop, (10, 72))
            tiles.append(tile)
        H = sum(t.height + 14 for t in tiles) + 60
        sheet = Image.new("RGB", (WIDTH, H), (150, 150, 150))
        ImageDraw.Draw(sheet).text((10, 14), f"Continuation truth, {name} (main text, then notes). Check each orange or gray verdict against the text.", fill=(255, 255, 255), font=font)
        y = 60
        for t in tiles:
            sheet.paste(t, (0, y))
            y += t.height + 14
        out = HERE / f"review-{name}.png"
        sheet.save(out)
        print(out.relative_to(PROJECT_DIR), sheet.size, len(tiles))


if __name__ == "__main__":
    main()
