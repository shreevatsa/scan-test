#!/usr/bin/env python3
"""Measure page text angle, per-line angle and bow, and line-pair separability for one input image."""
import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from PIL import Image

import analysis
from reference import code_hashes, digest

HERE = Path(__file__).resolve().parent


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    parser.add_argument("output_dir", type=Path)
    args = parser.parse_args()
    targets = [args.output_dir / "lines.json", args.output_dir / "lines.png"]
    if any(t.exists() for t in targets):
        parser.error("Output already exists.")
    config = json.loads((HERE / "config.json").read_text())
    data = args.input.read_bytes()
    rgb = np.asarray(Image.open(args.input).convert("RGB"))
    gray = np.asarray(Image.open(args.input).convert("L"))
    detail, arrays = analysis.analyze(gray, config)
    args.output_dir.mkdir(parents=True, exist_ok=True)
    record = dict(input=dict(path=str(args.input), sha256=digest(data), width=int(gray.shape[1]), height=int(gray.shape[0])),
                  created_at_utc=datetime.now(timezone.utc).isoformat(), **detail, method_files_sha256=code_hashes())
    targets[0].write_text(json.dumps(record, indent=2, ensure_ascii=False) + "\n")
    analysis.draw_overlay(rgb, detail, arrays).save(targets[1])
    s = detail["summary"]
    print(json.dumps(dict(page_angle_deg=s["page_angle_deg"], lines=s["lines"], line_angle_deg=s["line_angle_deg"], line_bow_px=s["line_bow_px"], pair_counts=s["pair_counts"]), indent=1))


if __name__ == "__main__":
    main()
