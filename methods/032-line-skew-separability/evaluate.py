#!/usr/bin/env python3
"""Compare region representations and saved model boxes against a passage reference.

For each kept reference passage this measures the unavoidable inclusion of other
passages' ink for (1) a tight axis-aligned rectangle, (2) a tight rectangle aligned
to the page text angle, and (3) the best tight rectangle at any single angle. For
each pair of adjacent passages it tests a straight boundary at any angle and a
per-column staircase boundary, and finds the best single edge placement for an
axis-aligned and a page-rotated box. Saved model boxes are then scored against the
same reference: own ink left outside and other passages' ink included.
"""
import argparse
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

import analysis
import geometry as g
from reference import SEPARATOR, code_hashes, digest

HERE = Path(__file__).resolve().parent


def pixel_sets(label_image, legend):
    sets = {}
    for item in legend:
        ys, xs = np.nonzero(label_image == item["value"])
        sets[item["passage"]] = (xs, ys)
    return sets


def rect_foreign(xs, ys, others, angle):
    """Foreign pixels inside the tight rectangle of (xs, ys) at the given angle."""
    rx, ry = g.rotate(xs.astype(float), ys.astype(float), angle)
    x0, x1, y0, y1 = rx.min() - 1, rx.max() + 1, ry.min() - 1, ry.max() + 1
    found = {}
    for name, (ox, oy) in others.items():
        orx, ory = g.rotate(ox.astype(float), oy.astype(float), angle)
        n = int(((orx > x0) & (orx < x1) & (ory > y0) & (ory < y1)).sum())
        if n:
            found[name] = n
    corners = [(rx.min() - .5, ry.min() - .5), (rx.max() + .5, ry.min() - .5), (rx.max() + .5, ry.max() + .5), (rx.min() - .5, ry.max() + .5)]
    poly = [tuple(map(float, g.unrotate(np.array(a), np.array(b), angle))) for a, b in corners]
    return found, poly


def best_edge(ax, ay, bx, by, angle):
    """Best bottom edge for A's box and best top edge for B's box, other edges tight, in a frame."""
    arx, ary = g.rotate(ax.astype(float), ay.astype(float), angle)
    brx, bry = g.rotate(bx.astype(float), by.astype(float), angle)
    out = {}
    lo = math.floor(min(ary.min(), bry.min())) - 1
    hi = math.ceil(max(ary.max(), bry.max())) + 1
    edges = np.arange(lo, hi + 1) + 0.5
    # A's bottom edge e: A pixels below e are left out; B pixels in A's x-range between A's top and e are included.
    in_a_cols = (brx > arx.min() - 1) & (brx < arx.max() + 1) & (bry > ary.min() - 1)
    a_sorted = np.sort(ary)
    b_sorted = np.sort(bry[in_a_cols])
    missing = len(a_sorted) - np.searchsorted(a_sorted, edges, side="right")
    included = np.searchsorted(b_sorted, edges, side="right")
    cost = missing + included
    j = int(np.argmin(cost))
    out["upper_box_bottom_edge"] = dict(cost=int(cost[j]), own_left_out=int(missing[j]), other_included=int(included[j]))
    in_b_cols = (arx > brx.min() - 1) & (arx < brx.max() + 1) & (ary < bry.max() + 1)
    b_all = np.sort(bry)
    a_sel = np.sort(ary[in_b_cols])
    missing = np.searchsorted(b_all, edges, side="left")
    included = len(a_sel) - np.searchsorted(a_sel, edges, side="left")
    cost = missing + included
    j = int(np.argmin(cost))
    out["lower_box_top_edge"] = dict(cost=int(cost[j]), own_left_out=int(missing[j]), other_included=int(included[j]))
    return out


def score_box(box, label_image, legend, sets):
    x1, y1, x2, y2 = box
    xa, ya = max(0, int(math.floor(x1))), max(0, int(math.floor(y1)))
    xb, yb = min(label_image.shape[1], int(math.ceil(x2))), min(label_image.shape[0], int(math.ceil(y2)))
    crop = label_image[ya:yb, xa:xb]
    values, counts = np.unique(crop, return_counts=True)
    inside = {int(v): int(c) for v, c in zip(values, counts) if v != 0}
    by_value = {item["value"]: item for item in legend}
    content = {v: c for v, c in inside.items() if v != SEPARATOR}
    if not content:
        return dict(matched_passage=None)
    own = max(content, key=content.get)
    name = by_value[own]["passage"]
    xs, ys = sets[name]
    outside = (xs < xa) | (xs >= xb) | (ys < ya) | (ys >= yb)
    return dict(matched_passage=name, own_pixels=by_value[own]["pixels"], own_left_out=int(outside.sum()),
                other_included={by_value[v]["passage"]: c for v, c in content.items() if v != own},
                separator_included=inside.get(SEPARATOR, 0), pixel_box=[xa, ya, xb, yb])


def draw_page(rgb, label_image, legend, floors, scale=.5):
    base = (255 - (255 - rgb.astype(np.int32)) * 0.35).astype(np.uint8)
    panels = []
    for key, title in [("axis_aligned", "Tight axis-aligned rectangles"), ("page_rotated", "Tight rectangles at the page text angle")]:
        out = base.copy()
        for name, f in floors.items():
            value = next(i["value"] for i in legend if i["passage"] == name)
            for other in f[key]["other_included"]:
                ov = next(i["value"] for i in legend if i["passage"] == other)
                poly = f[key]["polygon"]
                mask = Image.new("L", (rgb.shape[1], rgb.shape[0]), 0)
                ImageDraw.Draw(mask).polygon(poly, fill=1)
                sel = (np.asarray(mask) > 0) & (label_image == ov)
                out[sel] = [235, 40, 65]
        img = Image.fromarray(out)
        d = ImageDraw.Draw(img)
        for name, f in floors.items():
            value = next(i["value"] for i in legend if i["passage"] == name)
            d.polygon(f[key]["polygon"], outline=tuple(analysis.PALETTE[(value - 1) % len(analysis.PALETTE)]), width=3)
        d.text((20, 20), title, fill=(0, 0, 0), font=analysis.font(34))
        panels.append(img.resize((int(img.width * scale), int(img.height * scale)), Image.LANCZOS))
    sheet = Image.new("RGB", (sum(p.width for p in panels) + 20, panels[0].height), "white")
    sheet.paste(panels[0], (0, 0))
    sheet.paste(panels[1], (panels[0].width + 20, 0))
    return sheet


def draw_boundary(rgb, label_image, legend, sets, upper, lower, floors, results, crop, scale=2):
    """Rows: tight axis-aligned boxes, page-rotated boxes, then each saved result."""
    x0, y0, x1, y1 = crop
    value = {i["passage"]: i["value"] for i in legend}
    rows = []
    f = analysis.font(15)
    def panel(boxes, caption):
        out = (255 - (255 - rgb.astype(np.int32)) * 0.45).astype(np.uint8)
        for name, poly, color in boxes:
            mask = Image.new("L", (rgb.shape[1], rgb.shape[0]), 0)
            ImageDraw.Draw(mask).polygon(poly, fill=1)
            mask = np.asarray(mask) > 0
            other = upper if name == lower else lower
            out[mask & (label_image == value[other])] = [235, 40, 65]
            out[~mask & (label_image == value[name])] = [255, 0, 255]
        img = Image.fromarray(out[y0:y1, x0:x1]).resize(((x1 - x0) * scale, (y1 - y0) * scale), Image.NEAREST)
        d = ImageDraw.Draw(img)
        for name, poly, color in boxes:
            d.polygon([((px - x0) * scale, (py - y0) * scale) for px, py in poly], outline=color, width=2)
        canvas = Image.new("RGB", (img.width, img.height + 22), "white")
        canvas.paste(img, (0, 22))
        ImageDraw.Draw(canvas).text((4, 2), caption, fill=(0, 0, 0), font=f)
        return canvas
    colors = {upper: (0, 110, 200), lower: (245, 130, 48)}
    for key, caption in [("axis_aligned", "Tight axis-aligned rectangles"), ("page_rotated", "Tight rectangles at the page text angle")]:
        rows.append(panel([(n, floors[n][key]["polygon"], colors[n]) for n in (upper, lower)], caption))
    for label, scored in results:
        boxes = []
        for n in (upper, lower):
            match = [r for r in scored if r.get("matched_passage") == n]
            if match:
                bx0, by0, bx1, by1 = match[0]["box"]
                boxes.append((n, [(bx0, by0), (bx1, by0), (bx1, by1), (bx0, by1)], colors[n]))
        rows.append(panel(boxes, label))
    width = max(r.width for r in rows)
    head = Image.new("RGB", (width, 44), "white")
    ImageDraw.Draw(head).text((4, 4), f"{upper} (blue) / {lower} (orange). Red: the other passage's ink inside a box. Magenta: the box's own ink outside it. {scale}x source pixels.", fill=(0, 0, 0), font=f)
    sheet = Image.new("RGB", (width, head.height + sum(r.height for r in rows) + 8 * len(rows)), "white")
    sheet.paste(head, (0, 0))
    y = head.height
    for r in rows:
        sheet.paste(r, (0, y))
        y += r.height + 8
    return sheet


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    parser.add_argument("reference_dir", type=Path)
    parser.add_argument("output_dir", type=Path)
    parser.add_argument("--result", action="append", default=[], help="label=path/to/regions.json")
    args = parser.parse_args()
    if args.output_dir.exists() and any(args.output_dir.iterdir()):
        parser.error("Output directory already exists and is not empty.")
    config = json.loads((HERE / "config.json").read_text())
    data = args.input.read_bytes()
    ref = json.loads((args.reference_dir / "passages.json").read_text())
    if ref["input_sha256"] != digest(data):
        parser.error("Input hash does not match the reference.")
    labels_png = args.reference_dir / "passage-labels.png"
    if digest(labels_png.read_bytes()) != ref["labels_png_sha256"]:
        parser.error("Label image hash does not match passages.json.")
    label_image = np.asarray(Image.open(labels_png))
    rgb = np.asarray(Image.open(args.input).convert("RGB"))
    gray = np.asarray(Image.open(args.input).convert("L"))
    detail, _ = analysis.analyze(gray, config)
    angle = detail["summary"]["page_angle_deg"]
    legend = ref["passages"]
    sets = pixel_sets(label_image, legend)
    kept = [i["passage"] for i in legend if i["keep"]]
    floors = {}
    angles = np.arange(-config["straight_search_deg"], config["straight_search_deg"] + 1e-9, 0.05)
    for name in kept:
        xs, ys = sets[name]
        others = {n: s for n, s in sets.items() if n != name}
        axis, axis_poly = rect_foreign(xs, ys, others, 0.0)
        rot, rot_poly = rect_foreign(xs, ys, others, angle)
        best = None
        for a in angles:
            found, poly = rect_foreign(xs, ys, others, float(a))
            total = sum(found.values())
            if best is None or total < best[0] or (total == best[0] and abs(a - angle) < abs(best[1] - angle)):
                best = (total, float(a), found, poly)
        floors[name] = dict(axis_aligned=dict(other_included=axis, total=sum(axis.values()), polygon=axis_poly),
                            page_rotated=dict(other_included=rot, total=sum(rot.values()), polygon=rot_poly),
                            best_single_angle=dict(angle_deg=round(best[1], 2), other_included=best[2], total=best[0], polygon=best[3]))
    body = [i["passage"] for i in legend if i["keep"] and i["type"] != "footnote"]
    notes = [i["passage"] for i in legend if i["keep"] and i["type"] == "footnote"]
    stacked = list(zip(body, body[1:]))
    pairs = []
    for upper, lower in stacked:
        ax, ay = sets[upper]
        bx, by = sets[lower]
        sep = g.pair_separability(ax, ay, bx, by, angle, config)
        pairs.append(dict(upper=upper, lower=lower, orientation="stacked", **sep,
                          best_edge=dict(axis_aligned=best_edge(ax, ay, bx, by, 0.0), page_rotated=best_edge(ax, ay, bx, by, angle))))
    if notes:
        nx = np.concatenate([sets[n][0] for n in notes])
        ny = np.concatenate([sets[n][1] for n in notes])
        ax, ay = sets[body[-1]]
        sep = g.pair_separability(ax, ay, nx, ny, angle, config)
        pairs.append(dict(upper=body[-1], lower="all footnotes", orientation="stacked", **sep,
                          best_edge=dict(axis_aligned=best_edge(ax, ay, nx, ny, 0.0), page_rotated=best_edge(ax, ay, nx, ny, angle))))
    for left, right in zip(notes, notes[1:]):
        ax, ay = sets[left]
        bx, by = sets[right]
        # Transpose so that "upper" means left; the rectangle tests are unaffected.
        sep = g.pair_separability(ay, ax, by, bx, -angle, config)
        pairs.append(dict(upper=left, lower=right, orientation="side_by_side_transposed", **sep))
    scored_results = []
    for spec in args.result:
        label, path = spec.split("=", 1)
        path = Path(path)
        result = json.loads(path.read_text())
        if result["input"]["sha256"] != digest(data):
            parser.error(f"Input hash mismatch for {path}.")
        scored = []
        for r in result["regions"]:
            if not r["keep"]:
                continue
            s = score_box(r["box"], label_image, legend, sets)
            s.update(region_id=r.get("region_id"), type=r["type"], box=[float(v) for v in r["box"]])
            scored.append(s)
        matched = [s["matched_passage"] for s in scored]
        totals = dict(boxes=len(scored),
                      passages_without_box=[n for n in kept if n not in matched],
                      passages_with_several_boxes=sorted({n for n in matched if n and matched.count(n) > 1}),
                      own_left_out=sum(s.get("own_left_out", 0) for s in scored),
                      other_included=sum(sum(s.get("other_included", {}).values()) for s in scored),
                      separator_included=sum(s.get("separator_included", 0) for s in scored))
        scored_results.append(dict(label=label, path=str(path), result_sha256=digest(path.read_bytes()), totals=totals, boxes=scored))
    boundary_scores = []
    for upper, lower in stacked:
        ax, ay = sets[upper]
        bx, by = sets[lower]
        row = dict(upper=upper, lower=lower,
                   best_axis_aligned=dict(upper_box_bottom_edge=next(p for p in pairs if p["upper"] == upper and p["lower"] == lower)["best_edge"]["axis_aligned"]["upper_box_bottom_edge"]["cost"],
                                          lower_box_top_edge=next(p for p in pairs if p["upper"] == upper and p["lower"] == lower)["best_edge"]["axis_aligned"]["lower_box_top_edge"]["cost"]),
                   best_page_rotated=dict(upper_box_bottom_edge=next(p for p in pairs if p["upper"] == upper and p["lower"] == lower)["best_edge"]["page_rotated"]["upper_box_bottom_edge"]["cost"],
                                          lower_box_top_edge=next(p for p in pairs if p["upper"] == upper and p["lower"] == lower)["best_edge"]["page_rotated"]["lower_box_top_edge"]["cost"]),
                   results={})
        for r in scored_results:
            ub = [b for b in r["boxes"] if b.get("matched_passage") == upper]
            lb = [b for b in r["boxes"] if b.get("matched_passage") == lower]
            entry = {}
            if ub:
                x0, y0, x1, y1 = ub[0]["pixel_box"]
                left_out = int((ay >= y1).sum())
                included = int(((bx >= x0) & (bx < x1) & (by >= y0) & (by < y1)).sum())
                entry["upper_box_bottom_edge"] = dict(cost=left_out + included, own_left_out_below=left_out, other_included=included)
            if lb:
                x0, y0, x1, y1 = lb[0]["pixel_box"]
                left_out = int((by < y0).sum())
                included = int(((ax >= x0) & (ax < x1) & (ay >= y0) & (ay < y1)).sum())
                entry["lower_box_top_edge"] = dict(cost=left_out + included, own_left_out_above=left_out, other_included=included)
            row["results"][r["label"]] = entry
        boundary_scores.append(row)
    args.output_dir.mkdir(parents=True, exist_ok=True)
    floor_totals = {k: sum(f[k]["total"] for f in floors.values()) for k in ["axis_aligned", "page_rotated", "best_single_angle"]}
    record = dict(input_id=ref["input_id"], input_sha256=digest(data), reference_status=ref["status"],
                  reference_labels_sha256=ref["labels_png_sha256"], page_angle_deg=angle,
                  page_summary={k: v for k, v in detail["summary"].items() if k != "rules"}, rules=detail["summary"]["rules"],
                  floors={n: {k: {kk: vv for kk, vv in v.items() if kk != "polygon"} | dict(polygon=[[round(a, 2), round(b, 2)] for a, b in v["polygon"]]) for k, v in f.items()} for n, f in floors.items()},
                  floor_totals=floor_totals, pairs=pairs, boundary_scores=boundary_scores, results=scored_results, method_files_sha256=code_hashes())
    (args.output_dir / "boundaries.json").write_text(json.dumps(record, indent=2, ensure_ascii=False) + "\n")
    draw_page(rgb, label_image, legend, floors).save(args.output_dir / "representations.png")
    for upper, lower in stacked:
        ux = np.concatenate([sets[upper][0], sets[lower][0]])
        reach = int(2.2 * detail["summary"]["char_h"])
        crop = [max(0, int(ux.min()) - 20), max(0, int(sets[upper][1].max()) - reach),
                min(rgb.shape[1], int(ux.max()) + 20), min(rgb.shape[0], int(sets[lower][1].min()) + reach)]
        results = [(r["label"], r["boxes"]) for r in scored_results]
        draw_boundary(rgb, label_image, legend, sets, upper, lower, floors, results, crop).save(args.output_dir / f"boundary-{upper}--{lower}.png")
    print(json.dumps(dict(page_angle_deg=angle, floor_totals=floor_totals), indent=1))
    for n, f in floors.items():
        print(n, {k: (v["total"], v.get("angle_deg")) for k, v in f.items()})
    for p in pairs:
        print(p["upper"], "|", p["lower"], p["separable"], p["straight"]["best_margin_px"], p["column"]["minimum_gap_px"], p.get("best_edge"))
    for b in boundary_scores:
        print(b["upper"], "|", b["lower"], "best axis", b["best_axis_aligned"], "best rotated", b["best_page_rotated"], {k: {e: v["cost"] for e, v in x.items()} for k, x in b["results"].items()})
    for r in scored_results:
        print(r["label"], r["totals"])
        for b in r["boxes"]:
            print("  ", b.get("matched_passage"), b.get("own_left_out"), b.get("other_included"), b.get("separator_included"))


if __name__ == "__main__":
    main()
