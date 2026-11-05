#!/usr/bin/env python3
"""Robustness of line ownership to box quality, against the passage references. No API calls.

1. Source sweep: apply this method's ownership and outline recipe, in memory, to every saved
   box result on each referenced page, and score raw boxes and resulting polygons alike.
2. Perturbation: move the pinned source's (Terra 025) box edges at random, shift all boxes
   together, or scale all coordinates, and count reference ink the ownership step gets wrong.

Ownership errors separate geometry from grouping: each reference passage's main owner is the
region owning most of its ink, errors are its ink owned by anything else, and a region that
is the main owner of several kept passages is reported as a merge (a grouping difference).
"""
import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from PIL import Image

import analysis
import ownership as own
from evaluate import score

HERE = Path(__file__).resolve().parent
PROJECT_DIR = HERE.parent.parent
PAGES = ["kale-1913-page-017", "kale-1913-page-097", "kale-1913-page-113"]


def digest(data):
    return hashlib.sha256(data).hexdigest()


def ownership_errors(owner_px, ref, legend, line_px):
    main, pixels, lines = {}, 0, set()
    for p in legend:
        ink = ref == p["value"]
        values, counts = np.unique(owner_px[ink], return_counts=True)
        assigned = values >= 0
        m = int(values[assigned][np.argmax(counts[assigned])]) if assigned.any() else -1
        main[p["passage"]] = m
        if m >= 0:
            wrong = ink & (owner_px != m)
            pixels += int(wrong.sum())
            lines |= {int(v) for v in np.unique(line_px[wrong]) if v >= 0}
    kept = [main[p["passage"]] for p in legend if p["keep"] and main[p["passage"]] >= 0]
    return dict(pixels=pixels, lines=sorted(lines),
                merged_region_indices=sorted({m for m in kept if kept.count(m) > 1}),
                passages_without_owner=[n for n, m in main.items() if m < 0])


def summarize(trials):
    px = np.array([t["pixels"] for t in trials])
    return dict(trials=len(trials), trials_without_errors=int((px == 0).sum()), median_error_pixels=float(np.median(px)),
                max_error_pixels=int(px.max()), max_lines_affected=int(max(len(t["lines"]) for t in trials)),
                trials_with_merges=int(sum(bool(t["merged_region_indices"]) for t in trials)))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    parser.add_argument("--seeds", type=int, default=20)
    args = parser.parse_args()
    if args.output.exists() and any(args.output.iterdir()):
        parser.error("Output directory already exists and is not empty.")
    config = json.loads((HERE / "config.json").read_text())
    line_config = json.loads((HERE / "line-config.json").read_text())
    started = datetime.now(timezone.utc)
    sweep, perturbation, pages = [], {}, {}
    for page in PAGES:
        image_path = PROJECT_DIR / "inputs" / f"{page}.png"
        gray = np.asarray(Image.open(image_path).convert("L"))
        H, W = gray.shape
        detail, arrays = analysis.analyze(gray, line_config)
        comp, seg = arrays["comp"], arrays["seg"]
        labels = comp["labels"]
        line_px = np.where(labels > 0, seg["line_of"][labels], -1)
        ref_dir = PROJECT_DIR / "references" / page
        ref = np.asarray(Image.open(ref_dir / "passage-labels.png"))
        reference = json.loads((ref_dir / "passages.json").read_text())
        legend = reference["passages"]
        pages[page] = dict(input_sha256=digest(image_path.read_bytes()), reference_status=reference["status"], reference_labels_sha256=reference["labels_png_sha256"])

        def apply(boxes_xyxy):
            boxes = [own.pixel_box(b, W, H) for b in boxes_xyxy]
            owner, decisions, dropped = own.assign(comp, seg, boxes, config)
            owner_px = np.where(labels > 0, owner[labels], own.UNASSIGNED)
            return owner, owner_px, decisions

        for path in sorted((PROJECT_DIR / "outputs" / page).glob("*/regions.json")):
            result = json.loads(path.read_text())
            if not result.get("regions") or not all("box" in r for r in result["regions"]):
                continue
            owner, owner_px, decisions = apply([r["box"] for r in result["regions"]])
            geo = own.outline_regions(gray.shape, comp, seg, owner, detail["summary"]["page_angle_deg"], len(result["regions"]), config)
            polygons = dict(regions=[dict(region_id=r.get("region_id", i + 1), polygons=g_["rings"]) for i, (r, g_) in enumerate(zip(result["regions"], geo))])
            raw = score(result, ref, legend, gray.shape)[0]["totals"]
            poly = score(polygons, ref, legend, gray.shape)[0]["totals"]
            errors = ownership_errors(owner_px, ref, legend, line_px)
            sweep.append(dict(page=page, source_method=path.parent.name, regions=len(result["regions"]), regions_sha256=digest(path.read_bytes()),
                              raw_boxes=raw, polygons=poly, ownership_errors=errors,
                              uncovered_lines=[d["line_id"] for d in decisions if d["mode"] == "uncovered"]))
            print(page[-3:], path.parent.name, "raw", raw["other_passages_ink_included"], raw["own_ink_left_out"],
                  "-> polygons", poly["other_passages_ink_included"], poly["own_ink_left_out"], "| ownership errors", errors["pixels"],
                  "lines", errors["lines"], "merged", errors["merged_region_indices"], "unowned", errors["passages_without_owner"])

        base_path = PROJECT_DIR / "outputs" / page / config["base_method_id"] / "regions.json"
        base = [r["box"] for r in json.loads(base_path.read_text())["regions"]]
        rng = np.random.default_rng(20261104)
        conditions = {}
        for d in [10, 20, 30, 40, 60]:
            trials = []
            for _ in range(args.seeds):
                jittered = []
                for x1, y1, x2, y2 in base:
                    a, b, c, e = rng.uniform(-d, d, 4)
                    nx1, ny1, nx2, ny2 = x1 + a, y1 + b, x2 + c, y2 + e
                    jittered.append([min(nx1, nx2 - 2), min(ny1, ny2 - 2), max(nx2, nx1 + 2), max(ny2, ny1 + 2)])
                trials.append(ownership_errors(apply(jittered)[1], ref, legend, line_px))
            conditions[f"each edge moved independently, uniform within ±{d} px"] = summarize(trials)
        for d in [-40, -20, 20, 40]:
            conditions[f"all boxes shifted {d:+d} px vertically"] = summarize([ownership_errors(apply([[x1, y1 + d, x2, y2 + d] for x1, y1, x2, y2 in base])[1], ref, legend, line_px)])
            conditions[f"all boxes shifted {d:+d} px horizontally"] = summarize([ownership_errors(apply([[x1 + d, y1, x2 + d, y2] for x1, y1, x2, y2 in base])[1], ref, legend, line_px)])
        for s in [0.97, 0.99, 1.01, 1.03]:
            cx, cy = W / 2, H / 2
            scaled = [[cx + (x1 - cx) * s, cy + (y1 - cy) * s, cx + (x2 - cx) * s, cy + (y2 - cy) * s] for x1, y1, x2, y2 in base]
            conditions[f"all coordinates scaled by {s} about the page center"] = summarize([ownership_errors(apply(scaled)[1], ref, legend, line_px)])
        perturbation[page] = dict(source=str(base_path.relative_to(PROJECT_DIR)), char_h=comp["char_h"], conditions=conditions)
        for name, c in conditions.items():
            print(page[-3:], name, c)
    args.output.mkdir(parents=True, exist_ok=True)
    record = dict(created_at_utc=started.isoformat(), api_calls=0, seeds=args.seeds, random_generator_seed=20261104, pages=pages,
                  note="Sources are scored with this method's settings; this is an analysis, not new method outputs. Merged regions reflect a source's grouping, not ownership geometry.",
                  source_sweep=sweep, perturbation=perturbation,
                  code_sha256={p.name: digest(p.read_bytes()) for p in sorted(HERE.iterdir()) if p.suffix in (".py", ".json") and not p.name.startswith("test_")})
    (args.output / "robustness.json").write_text(json.dumps(record, indent=1, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()
