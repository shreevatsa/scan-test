#!/usr/bin/env python3
"""Book types of this method's regions against the hand-written unit trees of the schema examples. No API calls.

The schema examples (schema/examples/*/pages/*.json) give a book type to every method 041 region of the first
request on seven pages. Each such region is matched to the region of this method that owns most of its ink
(ownership.png of both methods), and the two types are compared. Regions of this method that own ink but match no
example region, and example regions whose ink this method splits (at least 5% and 500 pixels to a second region),
are listed too, as are regions of this method that hold most of the ink of several example regions (merges).

Usage: uv run --offline python methods/043-…/book_types.py OUTPUT_JSON
"""
import argparse
import hashlib
import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
PROJECT_DIR = HERE.parent.parent
METHOD = HERE.name
EXAMPLE_METHOD = "041-gpt-6.1-terra-none-explicit-units-continuations-band-chained-lines"
MIN_SHARE, MIN_PIXELS = 0.05, 500


def digest(data):
    return hashlib.sha256(data).hexdigest()


def owners(out_dir):
    owned = np.asarray(Image.open(out_dir / "ownership.png")).astype(np.int32)
    owned[owned == 255] = 0
    return owned


def compare(page_doc, request):
    pid = page_doc["page"]["id"]
    ex_types = {int(r["id"][1:]): r["type"] for r in page_doc["page"]["regions"]}
    sub = "run-002" if request == "run-002" else ""
    mine_dir = PROJECT_DIR / "outputs" / pid / METHOD / sub
    mine = json.loads((mine_dir / "regions.json").read_text())["regions"]
    a, b = owners(PROJECT_DIR / "outputs" / pid / EXAMPLE_METHOD), owners(mine_dir)
    ink = (a > 0) | (b > 0)
    table = np.zeros((a.max() + 1, len(mine) + 1), np.int64)
    np.add.at(table, (a[ink], b[ink]), 1)
    rows, used, splits = [], set(), []
    for rid, ex_type in sorted(ex_types.items()):
        row = table[rid, 1:]
        if not row.sum():
            rows.append(dict(region=rid, example_type=ex_type, matched=None, type=None, same=None))
            continue
        j = int(row.argmax())
        used.add(j)
        parts = [int(k) + 1 for k in np.flatnonzero((row >= MIN_SHARE * row.sum()) & (row >= MIN_PIXELS))]
        if len(parts) > 1:
            splits.append(dict(region=rid, into=parts))
        rows.append(dict(region=rid, example_type=ex_type, matched=j + 1, type=mine[j]["type"], same=mine[j]["type"] == ex_type))
    extra = [dict(region=j + 1, type=mine[j]["type"], pixels=int(table[:, j + 1].sum())) for j in range(len(mine))
             if j not in used and table[:, j + 1].sum()]
    by_match = Counter(r["matched"] for r in rows if r["matched"])
    merges = [dict(region=j, type=mine[j - 1]["type"], example_regions=[r["region"] for r in rows if r["matched"] == j])
              for j, n in sorted(by_match.items()) if n > 1]
    return dict(page=pid, request=request, regions=rows, splits=splits, merges=merges, unmatched=extra,
                mismatches=[(r["region"], r["example_type"], r["type"]) for r in rows if r["same"] is False])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    if args.output.exists():
        parser.error("Output already exists.")
    docs = sorted((PROJECT_DIR / "schema" / "examples").glob("*/pages/*.json"))
    results = [compare(json.loads(p.read_text()), request) for request in ("run-001", "run-002") for p in docs]
    summary = {}
    for request in ("run-001", "run-002"):
        rs = [r for r in results if r["request"] == request]
        regs = [x for r in rs for x in r["regions"] if x["same"] is not None]
        summary[request] = dict(example_regions=len(regs), same_type=sum(x["same"] for x in regs),
                                mismatches=Counter(f"{x['example_type']} -> {x['type']}" for x in regs if not x["same"]),
                                splits=sum(len(r["splits"]) for r in rs), merges=sum(len(r["merges"]) for r in rs),
                                unmatched=sum(len(r["unmatched"]) for r in rs))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(dict(
        created_at_utc=datetime.now(timezone.utc).isoformat(), api_calls=0, method=METHOD, example_method=EXAMPLE_METHOD,
        examples=[dict(path=str(p.relative_to(PROJECT_DIR)), sha256=digest(p.read_bytes())) for p in docs],
        script_sha256=digest(Path(__file__).read_bytes()), summary=summary, results=results), indent=1, ensure_ascii=False) + "\n")
    for r in results:
        print(r["request"], r["page"], "mismatches", r["mismatches"], "splits", r["splits"], "merges", [(m["type"], m["example_regions"]) for m in r["merges"]], "unmatched", r["unmatched"])
    print(json.dumps(summary, indent=1))


if __name__ == "__main__":
    main()
