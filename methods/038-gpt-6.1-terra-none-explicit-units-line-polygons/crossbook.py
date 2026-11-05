#!/usr/bin/env python3
"""Cross-book summary of saved Terra 025 results and this method's outputs. No API calls.

Reads inputs/pages.json plus the three original Kale test pages, the saved 025 results and this method's, and any
reference evaluations. Writes cross-book.json (per page: model grouping, API usage, line ownership
diagnostics, where text ink ended up, and reference scores) and one overlay contact sheet per book.
"""
import argparse
import hashlib
import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

import analysis

HERE = Path(__file__).resolve().parent
PROJECT_DIR = HERE.parent.parent
SOURCE = json.loads((HERE / "config.json").read_text())["base_method_id"]
METHOD = HERE.name


def digest(data):
    return hashlib.sha256(data).hexdigest()


def page_list():
    spec = json.loads((PROJECT_DIR / "inputs" / "pages.json").read_text())
    pages = [dict(input_id=f"kale-1913-page-{p:03d}", book_id="kale-1913") for p in (17, 97, 113)]
    return pages + [dict(input_id=p["input_id"], book_id=p["book_id"]) for p in spec["pages"]]


def summarize(page):
    out_dir = PROJECT_DIR / "outputs" / page["input_id"]
    src_path, res_path = out_dir / SOURCE / "regions.json", out_dir / METHOD / "regions.json"
    src, res = json.loads(src_path.read_text()), json.loads(res_path.read_text())
    usage = src["api"]["tokens_and_cost"]
    regions = res["regions"]
    owned = np.asarray(Image.open(out_dir / METHOD / "ownership.png"))
    keep_values = [i + 1 for i, r in enumerate(regions) if r["keep"]]
    furniture_values = [i + 1 for i, r in enumerate(regions) if not r["keep"]]
    d = res["diagnostics"]
    kept_ink = int(np.isin(owned, keep_values).sum())
    furniture_ink = int(np.isin(owned, furniture_values).sum())
    row = dict(
        input_id=page["input_id"], book_id=page["book_id"], width=res["input"]["width"], height=res["input"]["height"],
        source=dict(path=str(src_path.relative_to(PROJECT_DIR)), sha256=digest(src_path.read_bytes())),
        result=dict(path=str(res_path.relative_to(PROJECT_DIR)), sha256=digest(res_path.read_bytes())),
        model=dict(regions=len(regions), kept=sum(r["keep"] for r in regions), uncertain=sum(bool(r["uncertain"]) for r in regions),
                   types=dict(Counter(r["type"] for r in regions)),
                   api_wall_seconds=round(src["api"]["api_wall_seconds"], 2), input_tokens=usage["input_tokens"],
                   output_tokens=usage["output_tokens_including_reasoning"], reasoning_tokens=usage["reasoning_tokens"],
                   estimated_cost_usd=usage["estimated_paid_tier_total_cost_usd"]),
        lines=dict(char_h=res["line_analysis"]["char_h"], page_angle_deg=round(res["line_analysis"]["page_angle_deg"], 2),
                   columns=res["line_analysis"]["columns"], lines=d["lines"], whole=d["whole_lines"], split=d["split_lines"],
                   uncovered=d["uncovered_lines"], uncovered_line_ids=d["uncovered_line_ids"]),
        ownership=dict(dropped_components=len(d["dropped_components"]), unassigned_text_pixels=d["unassigned_text_pixels"],
                       text_components_not_on_lines=d["unassigned_text_components_not_on_lines"],
                       ink_owned_by_kept_regions=kept_ink, ink_owned_by_furniture_regions=furniture_ink,
                       unassigned_share_of_text_ink=round(d["unassigned_text_pixels"] / max(1, kept_ink + furniture_ink + d["unassigned_text_pixels"]), 4),
                       regions_without_ink=d["regions_without_ink"], regions_with_several_pieces=d["regions_with_several_pieces"],
                       polygon_overlap_pixels=d["polygon_overlap_pixels"], ink_in_polygon_overlaps=d["ink_in_polygon_overlaps"],
                       polygon_vertices=d["polygon_vertices"], local_seconds=res["local_seconds"]["total_including_audit_and_drawing"]))
    ev_path = out_dir / METHOD / "reference-evaluation" / "evaluation.json"
    if ev_path.exists():
        ev = json.loads(ev_path.read_text())
        row["reference"] = dict(path=ev["reference"]["path"], status=ev["reference"]["status"],
                                evaluation=dict(path=str(ev_path.relative_to(PROJECT_DIR)), sha256=digest(ev_path.read_bytes())),
                                results={r["label"]: dict(r["totals"], ownership_errors=(r["ownership"] or {}).get("reference_ink_owned_elsewhere_or_unassigned"))
                                         for r in ev["results"]})
    return row


def sheet(rows, path, height=1000):
    tiles = []
    for row in rows:
        im = Image.open(PROJECT_DIR / "outputs" / row["input_id"] / METHOD / "overlay.png").convert("RGB")
        im = im.resize((round(im.width * height / im.height), height), Image.LANCZOS)
        d = ImageDraw.Draw(im)
        d.rectangle([0, 0, im.width, 30], fill=(255, 255, 255))
        d.text((6, 4), row["input_id"], fill=(0, 0, 0), font=analysis.font(22))
        tiles.append(im)
    per_row = 3
    rows_n = (len(tiles) + per_row - 1) // per_row
    width = max(sum(t.width for t in tiles[i:i + per_row]) for i in range(0, len(tiles), per_row))
    out = Image.new("RGB", (width, rows_n * height), "white")
    for i, t in enumerate(tiles):
        x = sum(u.width for u in tiles[(i // per_row) * per_row:i])
        out.paste(t, (x, (i // per_row) * height))
    out.save(path)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    target = args.output / "cross-book.json"
    if target.exists():
        parser.error("Output already exists.")
    rows = [summarize(p) for p in page_list()]
    args.output.mkdir(parents=True, exist_ok=True)
    books = {}
    for row in rows:
        books.setdefault(row["book_id"], []).append(row)
    for book, items in books.items():
        sheet(items, args.output / f"cross-book-{book}.png")
    totals = dict(pages=len(rows), estimated_cost_usd=round(sum(r["model"]["estimated_cost_usd"] for r in rows), 6),
                  api_wall_seconds=round(sum(r["model"]["api_wall_seconds"] for r in rows), 1))
    record = dict(created_at_utc=datetime.now(timezone.utc).isoformat(), api_calls=0, source_method=SOURCE, method=METHOD,
                  totals=totals, pages=rows, contact_sheets=[f"cross-book-{b}.png" for b in books],
                  code_sha256={n: digest((HERE / n).read_bytes()) for n in ["crossbook.py", "run.py", "ownership.py", "analysis.py"]})
    target.write_text(json.dumps(record, indent=1, ensure_ascii=False) + "\n")
    print(json.dumps(totals))
    print("page | regions kept/all | types | lines whole/split/uncovered | not on lines | unassigned px (share) | dropped | several pieces | cost")
    for r in rows:
        m, l, o = r["model"], r["lines"], r["ownership"]
        print(f"{r['input_id']} | {m['kept']}/{m['regions']} | {m['types']} | {l['whole']}/{l['split']}/{l['uncovered']} | {o['text_components_not_on_lines']} | "
              f"{o['unassigned_text_pixels']} ({o['unassigned_share_of_text_ink']:.2%}) | {o['dropped_components']} | {o['regions_with_several_pieces']} | {m['estimated_cost_usd']:.4f}")


if __name__ == "__main__":
    main()
