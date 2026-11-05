#!/usr/bin/env python3
"""Line ownership and polygon regions from one saved single-pass model result. No API calls.

Method 036: rule pieces are separated before ownership, and text on no line is attached after it
(see ownership.prepare and ownership.attach_unlined)."""
import argparse
import hashlib
import importlib.metadata
import json
import platform
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

import analysis
import ownership as own

HERE = Path(__file__).resolve().parent
PROJECT_DIR = HERE.parent.parent
METHOD_ID = HERE.name
COORDINATES = ("Polygon rings are in input-image pixel indices, outer boundary only, largest piece first. "
               "Vertex (x, y) is the center of pixel column x and row y, and a region is its closed polygon "
               "including boundary pixels. In a corner-based system such as SVG with the image at (0, 0), "
               "add 0.5 to both coordinates. model_box is the source result's derived box, unchanged.")


def digest(data):
    return hashlib.sha256(data).hexdigest()


def display(path):
    path = Path(path).resolve()
    try:
        return str(path.relative_to(PROJECT_DIR))
    except ValueError:
        return str(path)


def code_hashes():
    return {p.name: digest(p.read_bytes()) for p in sorted(HERE.iterdir())
            if p.suffix in (".py", ".json") and not p.name.startswith("test_")}


def audit(region_masks, owner_px, n_regions, separator_px, unassigned_px):
    """Ink inside and outside each region mask, by owner."""
    out = []
    for r, mask in enumerate(region_masks):
        inside = owner_px[mask]
        other = {str(int(v)): int(c) for v, c in zip(*np.unique(inside[(inside >= 0) & (inside != r)], return_counts=True))}
        out.append(dict(own_ink_outside=int(((owner_px == r) & ~mask).sum()),
                        other_regions_ink_inside=other,
                        separator_pixels_inside=int((mask & separator_px).sum()),
                        unassigned_text_pixels_inside=int((mask & unassigned_px).sum())))
    return out


def draw(rgb, comp, owner, regions, records, unassigned_px, separator_px):
    base = (255 - (255 - rgb.astype(np.int32)) * 0.3).astype(np.uint8)
    owner_px = np.where(comp["labels"] > 0, owner[comp["labels"]], own.UNASSIGNED)
    for r in range(len(records)):
        base[owner_px == r] = analysis.PALETTE[r % len(analysis.PALETTE)]
    base[unassigned_px] = [235, 40, 65]
    base[separator_px] = [0, 0, 0]
    img = Image.fromarray(base)
    d = ImageDraw.Draw(img)
    f = analysis.font(20)
    for r, (geo, rec) in enumerate(zip(regions, records)):
        color = tuple(analysis.PALETTE[r % len(analysis.PALETTE)])
        x1, y1, x2, y2 = rec["model_box"]
        d.rectangle([x1, y1, x2, y2], outline=(150, 150, 150), width=1)
        for ring in geo["rings"]:
            d.line([tuple(p) for p in ring + ring[:1]], fill=color, width=3)
        if geo["rings"] and rec["type"] not in ("footnote", "note"):
            ys = [p[1] for p in geo["rings"][0]]
            name = f"{rec['reading_order']} {rec['type']}" if rec["reading_order"] else rec["type"]
            d.text((4, (min(ys) + max(ys)) / 2 - 10), name, fill=color, font=f)
        elif geo["rings"]:
            xs, ys = [p[0] for p in geo["rings"][0]], [p[1] for p in geo["rings"][0]]
            d.text((min(xs), max(ys) + 4), f"{rec['reading_order']} fn", fill=color, font=f)
    lines_img = Image.fromarray((255 - (255 - rgb.astype(np.int32)) * 0.5).astype(np.uint8))
    d = ImageDraw.Draw(lines_img)
    n = 0
    for geo in regions:
        for line in geo["lines"]:
            color = tuple(analysis.PALETTE[n % len(analysis.PALETTE)])
            n += 1
            for ring in line["rings"]:
                d.line([tuple(p) for p in ring + ring[:1]], fill=color, width=2)
    return img, lines_img


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    parser.add_argument("--base-regions", type=Path, help="saved regions.json of the pinned source method")
    parser.add_argument("--output-dir", type=Path)
    parser.add_argument("--check", action="store_true", help="validate inputs and print the plan without writing")
    args = parser.parse_args()
    config = json.loads((HERE / "config.json").read_text())
    line_config = json.loads((HERE / "line-config.json").read_text())
    stem = args.input.stem
    base_path = (args.base_regions or PROJECT_DIR / "outputs" / stem / config["base_method_id"] / "regions.json").resolve()
    out_dir = (args.output_dir or PROJECT_DIR / "outputs" / stem / METHOD_ID).resolve()
    if not base_path.exists():
        parser.error(f"Source result not found: {display(base_path)}")
    base_bytes = base_path.read_bytes()
    base = json.loads(base_bytes)
    if base.get("method", {}).get("id", config["base_method_id"]) != config["base_method_id"] and not args.base_regions:
        parser.error("Source result is not from the pinned source method.")
    if out_dir.exists() and any(out_dir.iterdir()):
        parser.error(f"Output directory already exists and is not empty: {display(out_dir)}")
    plan = dict(method=METHOD_ID, input=display(args.input), source=display(base_path), output=display(out_dir), regions=len(base["regions"]), api_calls=0)
    if args.check:
        print(json.dumps(plan, indent=2))
        return
    started = datetime.now(timezone.utc)
    t0 = time.perf_counter()
    data = args.input.read_bytes()
    rgb = np.asarray(Image.open(args.input).convert("RGB"))
    gray = np.asarray(Image.open(args.input).convert("L"))
    shape = gray.shape
    detail, arrays = analysis.analyze(gray, line_config)
    if detail["summary"]["status"] != "ok":
        parser.error(f"Line analysis failed: {detail['summary']['status']}")
    comp, seg = arrays["comp"], arrays["seg"]
    angle = detail["summary"]["page_angle_deg"]
    boxes = [own.pixel_box(r["box"], shape[1], shape[0]) for r in base["regions"]]
    t_lines = time.perf_counter()
    comp, seg, rule_pieces = own.prepare(comp, seg, shape, config)
    owner, decisions, dropped, attached = own.assign(comp, seg, boxes, config)
    unlined = seg["line_of"] < 0
    seg = dict(seg, line_of=own.effective_line_of(seg["line_of"], attached))
    t_assign = time.perf_counter()
    geometry = own.outline_regions(shape, comp, seg, owner, angle, len(boxes), config)
    t_outline = time.perf_counter()
    labels, role = comp["labels"], comp["role"]
    owner_px = np.where(labels > 0, owner[labels], own.UNASSIGNED)
    text_px = np.isin(labels, np.flatnonzero(role == "text"))
    separator_px = np.isin(labels, np.flatnonzero((role == "rule") | (role == "large")))
    unassigned_px = text_px & (owner_px == own.UNASSIGNED)
    polygon_masks = [own.rasterize(geo["rings"], shape) for geo in geometry]
    model_masks = [own.box_mask(r["box"], shape) for r in base["regions"]]
    polygon_audit = audit(polygon_masks, owner_px, len(boxes), separator_px, unassigned_px)
    model_audit = audit(model_masks, owner_px, len(boxes), separator_px, unassigned_px)
    coverage = np.sum(polygon_masks, axis=0) if polygon_masks else np.zeros(shape)
    records = []
    for r, (src, geo) in enumerate(zip(base["regions"], geometry)):
        ink = int((owner_px == r).sum())
        line_ids = sorted({int(seg["line_of"][k]) for k in np.flatnonzero(owner == r)})
        if geo["rings"]:
            pts = np.array([p for ring in geo["rings"] for p in ring])
            bounds = [int(pts[:, 0].min()), int(pts[:, 1].min()), int(pts[:, 0].max()) + 1, int(pts[:, 1].max()) + 1]
        else:
            bounds = None
        split_lines = {d["line_id"] for d in decisions if d["mode"] == "split"}
        records.append(dict(
            region_id=src.get("region_id", r + 1), type=src["type"], keep=src["keep"], reading_order=src["reading_order"],
            uncertain=src["uncertain"], model_box=src["box"], status="ok" if ink else "no_ink",
            polygons=geo["rings"], bounds=bounds, ink_pixels=ink, components=int((owner == r).sum()), line_ids=line_ids,
            lines=[dict(line_id=L["line_id"], shared_with_other_regions=L["line_id"] in split_lines, ink_pixels=L["ink_pixels"], polygons=L["rings"]) for L in geo["lines"]],
            vertices=int(sum(len(ring) for ring in geo["rings"])),
            audit=dict(polygons=polygon_audit[r], model_box=model_audit[r])))
    modes = [d["mode"] for d in decisions]
    line_masks_outside = 0
    line_pixels = 0
    for geo, mask in zip(geometry, polygon_masks):
        for L in geo["lines"]:
            lm = own.rasterize(L["rings"], shape)
            line_pixels += int(lm.sum())
            line_masks_outside += int((lm & ~mask).sum())
    diagnostics = dict(
        lines=len(decisions), whole_lines=modes.count("whole"), split_lines=modes.count("split"), uncovered_lines=modes.count("uncovered"),
        empty_lines=modes.count("empty"),
        uncovered_line_ids=[d["line_id"] for d in decisions if d["mode"] == "uncovered"],
        dropped_components=dropped,
        rule_pieces=rule_pieces,
        attached_components=attached,
        unassigned_text_pixels=int(unassigned_px.sum()),
        unassigned_text_components_not_on_lines=int((unlined & (role == "text") & (owner == own.UNASSIGNED)).sum()),
        regions_without_ink=[rec["region_id"] for rec in records if rec["status"] == "no_ink"],
        regions_with_several_pieces=[rec["region_id"] for rec in records if len(rec["polygons"]) > 1],
        polygon_overlap_pixels=int((coverage > 1).sum()),
        ink_in_polygon_overlaps=int(((coverage > 1) & (text_px | separator_px)).sum()),
        own_ink_outside_polygons=int(sum(a["own_ink_outside"] for a in polygon_audit)),
        other_regions_ink_inside_polygons=int(sum(sum(a["other_regions_ink_inside"].values()) for a in polygon_audit)),
        separator_pixels_inside_polygons=int(sum(a["separator_pixels_inside"] for a in polygon_audit)),
        line_polygon_pixels_outside_region_polygons=line_masks_outside, line_polygon_pixels=line_pixels,
        polygon_vertices=int(sum(rec["vertices"] for rec in records)))
    out_dir.mkdir(parents=True, exist_ok=True)
    owner_png = np.zeros(shape, np.uint8)
    owner_png[owner_px >= 0] = owner_px[owner_px >= 0] + 1
    owner_png[separator_px] = 255
    Image.fromarray(owner_png).save(out_dir / "ownership.png")
    overlay, lines_img = draw(rgb, comp, owner, geometry, records, unassigned_px, separator_px)
    overlay.save(out_dir / "overlay.png")
    lines_img.save(out_dir / "lines.png")
    t_end = time.perf_counter()
    result = dict(
        schema_version=1, created_at_utc=started.isoformat(), method=dict(id=METHOD_ID, name=config["name"]),
        input=dict(path=display(args.input), sha256=digest(data), width=shape[1], height=shape[0]),
        source=dict(method_id=config["base_method_id"], regions_path=display(base_path), regions_sha256=digest(base_bytes),
                    note="The source model call is not repeated; its cost and timing are in the source output."),
        api_calls=0, coordinates=COORDINATES,
        line_analysis=dict(char_h=comp["char_h"], page_angle_deg=angle, lines=len(seg["lines"]), columns=len(seg["columns"]),
                           ink_thresholds=detail["thresholds"]),
        settings=config, line_settings=line_config,
        regions=records,
        line_decisions=[dict(d, region_ids=[records[i]["region_id"] for i in d["region_indices"]]) for d in decisions],
        diagnostics=diagnostics,
        ownership_png=dict(path="ownership.png", values="0 unassigned or background, 1..N region index + 1 in source order, 255 rules and large non-text",
                           sha256=digest((out_dir / "ownership.png").read_bytes())),
        local_seconds=dict(line_analysis=round(t_lines - t0, 3), ownership=round(t_assign - t_lines, 3), outlines=round(t_outline - t_assign, 3), total_including_audit_and_drawing=round(t_end - t0, 3)),
        code_sha256=code_hashes(),
        environment=dict(python=platform.python_version(), packages={n: importlib.metadata.version(n) for n in ["numpy", "Pillow", "opencv-python-headless"]}))
    (out_dir / "regions.json").write_text(json.dumps(result, indent=1, ensure_ascii=False) + "\n")
    print(json.dumps(dict(output=display(out_dir), **{k: diagnostics[k] for k in ["lines", "whole_lines", "split_lines", "uncovered_lines", "unassigned_text_pixels", "own_ink_outside_polygons", "other_regions_ink_inside_polygons", "separator_pixels_inside_polygons", "polygon_overlap_pixels", "ink_in_polygon_overlaps", "polygon_vertices", "line_polygon_pixels_outside_region_polygons"]}, dropped=len(dropped), rule_pieces=len(rule_pieces), attached=len(attached), several_pieces=diagnostics["regions_with_several_pieces"], seconds=result["local_seconds"]), indent=1))


if __name__ == "__main__":
    main()
