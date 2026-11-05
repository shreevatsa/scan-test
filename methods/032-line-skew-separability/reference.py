#!/usr/bin/env python3
"""Build a component-level passage reference from a passage spec and the line segmentation.

Writes passage-labels.png (8-bit: 0 unlabeled, 1..N passage index, 255 separator),
passages.json (legend and provenance) and review.png (colored overlay for review).
"""
import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

import analysis

HERE = Path(__file__).resolve().parent
SEPARATOR = 255


def digest(data):
    return hashlib.sha256(data).hexdigest()


def code_hashes():
    return {p.name: digest(p.read_bytes()) for p in sorted(HERE.glob("*.py")) if not p.name.startswith("test_")} | {"config.json": digest((HERE / "config.json").read_bytes())}


def build(gray, spec, config):
    detail, arrays = analysis.analyze(gray, config)
    comp, seg = arrays["comp"], arrays["seg"]
    stats, labels = comp["stats"], comp["labels"]
    names = [p["passage"] for p in spec["passages"]]
    index = {n: i + 1 for i, n in enumerate(names)}
    line_to_passage = {}
    for p in spec["passages"]:
        if "lines" in p:
            for line in range(p["lines"][0], p["lines"][1] + 1):
                line_to_passage[line] = p["passage"]
    comp_passage = np.zeros(len(stats), np.uint8)
    for k in np.flatnonzero(seg["line_of"] >= 0):
        line = int(seg["line_of"][k])
        cx = stats[k, 0] + stats[k, 2] / 2
        if str(line) in spec.get("split_lines_by_x", {}):
            for rule in spec["split_lines_by_x"][str(line)]:
                if "below_x" not in rule or cx < rule["below_x"]:
                    comp_passage[k] = index[rule["passage"]]
                    break
        elif line in line_to_passage:
            comp_passage[k] = index[line_to_passage[line]]
        else:
            raise SystemExit(f"Line {line} is not assigned by the spec.")
    comp_passage[np.flatnonzero(comp["role"] == "rule")] = SEPARATOR
    for k in np.flatnonzero(comp["role"] == "large"):
        x, y, w, h, _ = stats[k]
        if h < 0.05 * gray.shape[0] and w > 0.3 * gray.shape[1]:
            comp_passage[k] = SEPARATOR
    comp_passage[0] = 0
    label_image = comp_passage[labels]
    unlabeled = [dict(component_id=int(k), box=[int(stats[k, 0]), int(stats[k, 1]), int(stats[k, 0] + stats[k, 2]), int(stats[k, 1] + stats[k, 3])], area=int(stats[k, 4]), role=str(comp["role"][k]))
                 for k in range(1, len(stats)) if comp_passage[k] == 0 and comp["role"][k] != "none"]
    legend = []
    for i, p in enumerate(spec["passages"]):
        ys, xs = np.nonzero(label_image == i + 1)
        legend.append(dict(value=i + 1, passage=p["passage"], type=p["type"], keep=p["keep"], pixels=int(len(xs)),
                           components=int((comp_passage == i + 1).sum()),
                           box=[int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1] if len(xs) else None))
    return label_image, legend, unlabeled, detail


def draw_review(rgb, label_image, legend):
    out = (255 - (255 - rgb.astype(np.int32)) * 0.2).astype(np.uint8)
    for item in legend:
        out[label_image == item["value"]] = analysis.PALETTE[(item["value"] - 1) % len(analysis.PALETTE)]
    out[label_image == SEPARATOR] = [0, 0, 0]
    img = Image.fromarray(out)
    d = ImageDraw.Draw(img)
    f = analysis.font(18)
    for item in legend:
        if item["box"]:
            x0, y0, x1, y1 = item["box"]
            color = tuple(analysis.PALETTE[(item["value"] - 1) % len(analysis.PALETTE)])
            if item["type"] == "footnote":
                d.text((x0, y1 + 4), item["passage"].replace("footnote-", "fn "), fill=color, font=f)
            else:
                d.text((4, (y0 + y1) / 2 - 9), item["passage"], fill=color, font=f)
    return img


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    parser.add_argument("spec", type=Path)
    args = parser.parse_args()
    spec = json.loads(args.spec.read_text())
    out_dir = args.spec.parent
    targets = [out_dir / n for n in ["passage-labels.png", "passages.json", "review.png"]]
    if any(t.exists() for t in targets):
        parser.error("Reference output already exists.")
    config = json.loads((HERE / "config.json").read_text())
    data = args.input.read_bytes()
    rgb = np.asarray(Image.open(args.input).convert("RGB"))
    gray = np.asarray(Image.open(args.input).convert("L"))
    label_image, legend, unlabeled, detail = build(gray, spec, config)
    Image.fromarray(label_image).save(targets[0])
    record = dict(
        input_id=spec["input_id"], input_sha256=digest(data), status=spec["status"],
        created_at_utc=datetime.now(timezone.utc).isoformat(),
        spec_sha256=digest(args.spec.read_bytes()), labels_png_sha256=digest(targets[0].read_bytes()),
        label_values=dict(unlabeled=0, separator=SEPARATOR, passages="1..N, see passages"),
        ink_mask=dict(method="method 032 hysteresis mask", **detail["thresholds"]),
        passages=legend, unlabeled_components=unlabeled,
        separator_pixels=int((label_image == SEPARATOR).sum()),
        method_files_sha256=code_hashes())
    targets[1].write_text(json.dumps(record, indent=2, ensure_ascii=False) + "\n")
    draw_review(rgb, label_image, legend).save(targets[2])
    print(json.dumps(dict((k, record[k]) for k in ["input_id", "status", "separator_pixels"]), ensure_ascii=False))
    for item in legend:
        print(item["passage"], item["pixels"], item["components"], item["box"])
    print("unlabeled", unlabeled)


if __name__ == "__main__":
    main()
