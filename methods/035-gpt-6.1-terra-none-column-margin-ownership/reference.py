#!/usr/bin/env python3
"""Build a component-level passage reference from a passage spec and the line segmentation.

Copied from method 033, which extended method 032's builder: a split rule whose passage
is null leaves those components unlabeled, for example scanner-edge marks that the line
finder attached to a text line. This copy adds two things:

1. Component rules ("components_in_boxes" in the spec). Each rule names a box and either a
   passage, null (unlabeled) or "separator": true. It applies to every component, other
   than specks of role "none", whose bounding box lies wholly inside the box, and it
   overrides the line and separator rules. This covers ink that the line finder leaves off
   every line (a merged word, the bars of a sign, an ellipsis), frame pieces that it
   attaches to a text line, and broken pieces of a printed rule. A rule that matches no
   component is an error.
2. In review.png, a passage whose box starts right of the page center is labeled in a white
   margin added to the right of the page, so the labels of a right-hand column sit next to
   it. Labels are otherwise drawn as before. The label image is not affected.

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
    """Hashes of the files that determine a reference: this builder, the line code and its settings."""
    return {n: digest((HERE / n).read_bytes()) for n in ["reference.py", "analysis.py", "geometry.py", "line-config.json"]}


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
                    comp_passage[k] = 0 if rule["passage"] is None else index[rule["passage"]]
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
    applied = []
    for rule in spec.get("components_in_boxes", []):
        x0, y0, x1, y1 = rule["box"]
        inside = ((stats[:, 0] >= x0) & (stats[:, 1] >= y0) & (stats[:, 0] + stats[:, 2] <= x1) & (stats[:, 1] + stats[:, 3] <= y1)
                  & (comp["role"] != "none"))
        inside[0] = False
        ks = np.flatnonzero(inside)
        if not len(ks):
            raise SystemExit(f"Component rule {rule['box']} matches no component.")
        if rule.get("separator"):
            comp_passage[ks] = SEPARATOR
        else:
            comp_passage[ks] = 0 if rule["passage"] is None else index[rule["passage"]]
        applied.append(dict(box=rule["box"], label="separator" if rule.get("separator") else rule["passage"],
                            components=[dict(component_id=int(k), box=[int(stats[k, 0]), int(stats[k, 1]), int(stats[k, 0] + stats[k, 2]), int(stats[k, 1] + stats[k, 3])],
                                             area=int(stats[k, 4]), role=str(comp["role"][k]), line=int(seg["line_of"][k])) for k in ks]))
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
    return label_image, legend, unlabeled, detail, applied


def draw_review(rgb, label_image, legend):
    out = (255 - (255 - rgb.astype(np.int32)) * 0.2).astype(np.uint8)
    for item in legend:
        out[label_image == item["value"]] = analysis.PALETTE[(item["value"] - 1) % len(analysis.PALETTE)]
    out[label_image == SEPARATOR] = [0, 0, 0]
    H, W = label_image.shape
    f = analysis.font(18)
    right = [item for item in legend if item["box"] and item["type"] != "footnote" and item["box"][0] > W / 2]
    margin = max((int(ImageDraw.Draw(Image.new("RGB", (1, 1))).textlength(item["passage"], font=f)) + 16 for item in right), default=0)
    img = Image.new("RGB", (W + margin, H), "white")
    img.paste(Image.fromarray(out), (0, 0))
    d = ImageDraw.Draw(img)
    for item in legend:
        if item["box"]:
            x0, y0, x1, y1 = item["box"]
            color = tuple(analysis.PALETTE[(item["value"] - 1) % len(analysis.PALETTE)])
            if item["type"] == "footnote":
                d.text((x0, y1 + 4), item["passage"].replace("footnote-", "fn "), fill=color, font=f)
            elif item in right:
                d.text((W + 8, (y0 + y1) / 2 - 9), item["passage"], fill=color, font=f)
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
    config = json.loads((HERE / "line-config.json").read_text())
    data = args.input.read_bytes()
    rgb = np.asarray(Image.open(args.input).convert("RGB"))
    gray = np.asarray(Image.open(args.input).convert("L"))
    label_image, legend, unlabeled, detail, applied = build(gray, spec, config)
    Image.fromarray(label_image).save(targets[0])
    record = dict(
        input_id=spec["input_id"], input_sha256=digest(data), version=spec.get("version", 1), status=spec["status"],
        created_at_utc=datetime.now(timezone.utc).isoformat(),
        spec_sha256=digest(args.spec.read_bytes()), labels_png_sha256=digest(targets[0].read_bytes()),
        label_values=dict(unlabeled=0, separator=SEPARATOR, passages="1..N, see passages"),
        ink_mask=dict(method="method 032 hysteresis mask", **detail["thresholds"]),
        passages=legend, unlabeled_components=unlabeled, component_rules_applied=applied,
        separator_pixels=int((label_image == SEPARATOR).sum()),
        builder=str(HERE.relative_to(HERE.parent.parent) / "reference.py"),
        method_files_sha256=code_hashes())
    targets[1].write_text(json.dumps(record, indent=2, ensure_ascii=False) + "\n")
    draw_review(rgb, label_image, legend).save(targets[2])
    print(json.dumps(dict((k, record[k]) for k in ["input_id", "status", "separator_pixels"]), ensure_ascii=False))
    for item in legend:
        print(item["passage"], item["pixels"], item["components"], item["box"])
    print("unlabeled", unlabeled)
    for rule in applied:
        print("component rule", rule["box"], "->", rule["label"], [(c["component_id"], c["box"], c["line"]) for c in rule["components"]])


if __name__ == "__main__":
    main()
