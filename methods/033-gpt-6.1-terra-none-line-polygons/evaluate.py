#!/usr/bin/env python3
"""Score saved region results against a component-level passage reference. No API calls.

Each result's regions become pixel masks: polygons when a region has them, otherwise the
pixels touching its box (method 032's inclusion rule, so raw-box numbers match method 032).
Each reference passage is matched to the region containing most of its ink. For kept
passages this reports own ink left outside the matched region, other passages' ink inside
it, and separator pixels inside it; and, at each boundary between consecutive non-footnote
passages, the ink each side's region takes from the other.
"""
import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

import analysis
import ownership as own

HERE = Path(__file__).resolve().parent
SEPARATOR = 255
RED, MAGENTA = (235, 40, 65), (200, 0, 200)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def region_masks(result, shape):
    masks, kinds = [], []
    for r in result["regions"]:
        if "polygons" in r:
            masks.append(own.rasterize(r["polygons"], shape))
            kinds.append("polygon")
        else:
            masks.append(own.box_mask(r["box"], shape))
            kinds.append("box")
    return masks, kinds


def score(result, labels, legend, shape):
    masks, kinds = region_masks(result, shape)
    by_value = {p["value"]: p for p in legend}
    passage_px = {p["value"]: labels == p["value"] for p in legend}
    match = {}
    for p in legend:
        overlaps = [int((m & passage_px[p["value"]]).sum()) for m in masks]
        match[p["passage"]] = int(np.argmax(overlaps)) if max(overlaps, default=0) > 0 else None
    passages = {}
    for p in legend:
        if not p["keep"]:
            continue
        r = match[p["passage"]]
        if r is None:
            passages[p["passage"]] = dict(matched_region_id=None, own_left_out=p["pixels"])
            continue
        m = masks[r]
        inside = labels[m]
        values, counts = np.unique(inside[(inside != 0) & (inside != SEPARATOR) & (inside != p["value"])], return_counts=True)
        passages[p["passage"]] = dict(
            matched_region_id=result["regions"][r].get("region_id", r + 1), region_kind=kinds[r],
            own_left_out=int((passage_px[p["value"]] & ~m).sum()),
            other_included={by_value[int(v)]["passage"]: int(c) for v, c in zip(values, counts)},
            separator_included=int((inside == SEPARATOR).sum()))
    kept = [p for p in legend if p["keep"]]
    regions_used = [match[p["passage"]] for p in kept if match[p["passage"]] is not None]
    totals = dict(
        other_passages_ink_included=int(sum(sum(v.get("other_included", {}).values()) for v in passages.values())),
        own_ink_left_out=int(sum(v["own_left_out"] for v in passages.values())),
        separator_pixels_included=int(sum(v.get("separator_included", 0) for v in passages.values())),
        kept_passages_without_region=[n for n, v in passages.items() if v["matched_region_id"] is None],
        regions_matched_by_several_kept_passages=sorted({result["regions"][r].get("region_id", r + 1) for r in regions_used if regions_used.count(r) > 1}))
    body = [p for p in kept if p["type"] != "footnote"]
    boundaries = []
    for a, b in zip(body, body[1:]):
        ra, rb = match[a["passage"]], match[b["passage"]]
        boundaries.append(dict(upper=a["passage"], lower=b["passage"],
                               upper_region_takes_lower_ink=int((masks[ra] & passage_px[b["value"]]).sum()) if ra is not None else None,
                               lower_region_takes_upper_ink=int((masks[rb] & passage_px[a["value"]]).sum()) if rb is not None else None))
    return dict(totals=totals, passages=passages, boundaries=boundaries), masks, match


def ownership_check(result_path, labels, legend):
    """For polygon results with an ownership label image: reference ink owned by a region other than the passage's main owner."""
    path = result_path.parent / "ownership.png"
    if not path.exists():
        return None
    owned = np.asarray(Image.open(path))
    out, total = {}, 0
    for p in legend:
        ink = labels == p["value"]
        values, counts = np.unique(owned[ink], return_counts=True)
        main = values[np.argmax(counts)]
        wrong = int(counts[values != main].sum())
        out[p["passage"]] = dict(main_owner_value=int(main), pixels_owned_elsewhere_or_unassigned=wrong)
        total += wrong
    return dict(reference_ink_owned_elsewhere_or_unassigned=total, passages=out, ownership_png_sha256=digest(path.read_bytes()))


def panel(rgb, labels, legend, result, masks, match, title):
    base = (255 - (255 - rgb.astype(np.int32)) * 0.35).astype(np.uint8)
    for p in legend:
        if not p["keep"] or match[p["passage"]] is None:
            continue
        m = masks[match[p["passage"]]]
        base[m & (labels != 0) & (labels != SEPARATOR) & (labels != p["value"])] = RED
        base[(labels == p["value"]) & ~m] = MAGENTA
    img = Image.fromarray(base)
    d = ImageDraw.Draw(img)
    for i, (r, m) in enumerate(zip(result["regions"], masks)):
        color = tuple(analysis.PALETTE[i % len(analysis.PALETTE)])
        if "polygons" in r:
            for ring in r["polygons"]:
                d.line([tuple(p) for p in ring + ring[:1]], fill=color, width=2)
        else:
            x1, y1, x2, y2 = r["box"]
            d.rectangle([x1, y1, x2, y2], outline=color, width=2)
    d.text((10, 10), title, fill=(0, 0, 0), font=analysis.font(30))
    return img


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    parser.add_argument("reference", type=Path, help="reference directory with passage-labels.png and passages.json")
    parser.add_argument("output", type=Path)
    parser.add_argument("--result", action="append", required=True, help='"label=path/to/regions.json"')
    args = parser.parse_args()
    if args.output.exists() and any(args.output.iterdir()):
        parser.error("Output directory already exists and is not empty.")
    rgb = np.asarray(Image.open(args.input).convert("RGB"))
    shape = rgb.shape[:2]
    labels = np.asarray(Image.open(args.reference / "passage-labels.png"))
    reference = json.loads((args.reference / "passages.json").read_text())
    legend = reference["passages"]
    results, panels, crops = [], [], []
    for item in args.result:
        name, path = item.split("=", 1)
        path = Path(path)
        result = json.loads(path.read_text())
        scored, masks, match = score(result, labels, legend, shape)
        results.append(dict(label=name, path=str(path), sha256=digest(path.read_bytes()), **scored, ownership=ownership_check(path, labels, legend)))
        panels.append(panel(rgb, labels, legend, result, masks, match, name))
    args.output.mkdir(parents=True, exist_ok=True)
    scale = 0.5
    small = [p.resize((int(p.width * scale), int(p.height * scale)), Image.LANCZOS) for p in panels]
    sheet = Image.new("RGB", (sum(p.width for p in small), small[0].height), "white")
    x = 0
    for p in small:
        sheet.paste(p, (x, 0))
        x += p.width
    sheet.save(args.output / "comparison.png")
    boxes = {p["passage"]: p["box"] for p in legend}
    body = [p for p in legend if p["keep"] and p["type"] != "footnote"]
    for a, b in zip(body, body[1:]):
        ax0, ay0, ax1, ay1 = boxes[a["passage"]]
        bx0, by0, bx1, by1 = boxes[b["passage"]]
        y0, y1 = max(0, by0 - 70), min(shape[0], ay1 + 70)
        x0, x1 = max(0, min(ax0, bx0) - 30), min(shape[1], max(ax1, bx1) + 30)
        strips = [p.crop((x0, y0, x1, y1)) for p in panels]
        out = Image.new("RGB", (x1 - x0, sum(s.height + 34 for s in strips)), "white")
        d = ImageDraw.Draw(out)
        y = 0
        for item, s in zip(args.result, strips):
            d.text((6, y + 6), item.split("=", 1)[0], fill=(0, 0, 0), font=analysis.font(20))
            out.paste(s, (0, y + 34))
            y += s.height + 34
        out.save(args.output / f"boundary-{a['passage']}--{b['passage']}.png")
    record = dict(
        created_at_utc=datetime.now(timezone.utc).isoformat(), api_calls=0,
        input=dict(path=str(args.input), sha256=digest(args.input.read_bytes())),
        reference=dict(path=str(args.reference), status=reference["status"], labels_png_sha256=reference["labels_png_sha256"], spec_sha256=reference["spec_sha256"]),
        rules=dict(box_pixels="pixels touching the box (floor/ceil), as in method 032", polygon_pixels="closed polygon including boundary pixels",
                   match="each reference passage is matched to the region containing most of its ink"),
        results=results,
        code_sha256={n: digest((HERE / n).read_bytes()) for n in ["evaluate.py", "ownership.py", "analysis.py"]})
    (args.output / "evaluation.json").write_text(json.dumps(record, indent=1, ensure_ascii=False) + "\n")
    for r in results:
        t = r["totals"]
        own_check = r["ownership"]["reference_ink_owned_elsewhere_or_unassigned"] if r["ownership"] else "-"
        print(f"{r['label']}: other ink included {t['other_passages_ink_included']}, own left out {t['own_ink_left_out']}, separator {t['separator_pixels_included']}, "
              f"missing {t['kept_passages_without_region']}, merged {t['regions_matched_by_several_kept_passages']}, ownership errors {own_check}")
        for bnd in r["boundaries"]:
            print(f"   {bnd['upper']} / {bnd['lower']}: {bnd['upper_region_takes_lower_ink']} / {bnd['lower_region_takes_upper_ink']}")


if __name__ == "__main__":
    main()
