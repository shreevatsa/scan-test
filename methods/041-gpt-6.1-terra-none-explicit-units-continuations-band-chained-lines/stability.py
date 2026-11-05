#!/usr/bin/env python3
"""Grouping stability between two single-pass Terra requests on the same page. No API calls.

Compares this method's ownership images for the run-001 and run-002 sources, ink pixel by ink
pixel. Method 041 adds two options: --pages limits the pages to an input list such as
inputs/pages-runs.json, and --against METHOD compares this method with another local method on the
same request instead (first requests, then repeat requests), to show the effect of a prompt change;
--method runs the same comparisons for another local method's outputs. Regions are matched one to one, greedily by shared ink. For each page it reports:
- region counts;
- the share of owned ink whose owner corresponds in both runs;
- regions that one run splits or merges relative to the other, where a region counts only if at
  least 5% of its ink, and 500 pixels, go to each counterpart;
- keep flag, type and reading-order agreement over matched regions.
"""
import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
PROJECT_DIR = HERE.parent.parent
METHOD = HERE.name
MIN_SHARE, MIN_PIXELS = 0.05, 500


def digest(data):
    return hashlib.sha256(data).hexdigest()


def load(out_dir):
    regions = json.loads((out_dir / "regions.json").read_text())["regions"]
    owned = np.asarray(Image.open(out_dir / "ownership.png")).astype(np.int32)
    owned[owned == 255] = 0
    return regions, owned


def compare(page, a_dir=None, b_dir=None, request=None):
    a_dir = a_dir or PROJECT_DIR / "outputs" / page / METHOD
    b_dir = b_dir or a_dir / "run-002"
    ra, oa = load(a_dir)
    rb, ob = load(b_dir)
    ink = (oa > 0) | (ob > 0)
    na, nb = len(ra), len(rb)
    table = np.zeros((na + 1, nb + 1), np.int64)
    np.add.at(table, (oa[ink], ob[ink]), 1)
    pairs, used_a, used_b = [], set(), set()
    for flat in np.argsort(table[1:, 1:], axis=None)[::-1]:
        i, j = np.unravel_index(flat, (na, nb))
        if table[i + 1, j + 1] == 0:
            break
        if i in used_a or j in used_b:
            continue
        pairs.append((int(i), int(j)))
        used_a.add(i)
        used_b.add(j)
    matched_ink = int(sum(table[i + 1, j + 1] for i, j in pairs))
    owned_either = int(ink.sum())

    def spread(t, regions_from, regions_to):
        out = []
        for i in range(t.shape[0] - 1):
            row = t[i + 1, 1:]
            total = row.sum()
            if not total:
                continue
            parts = [int(j) for j in np.flatnonzero((row >= MIN_SHARE * total) & (row >= MIN_PIXELS))]
            if len(parts) > 1:
                out.append(dict(region=i + 1, type=regions_from[i]["type"], into=[dict(region=j + 1, type=regions_to[j]["type"], pixels=int(row[j])) for j in parts]))
        return out

    splits = spread(table, ra, rb)        # a run-001 region spread over several run-002 regions
    merges = spread(table.T, rb, ra)      # a run-002 region spread over several run-001 regions
    keep_diff = [(i + 1, j + 1) for i, j in pairs if ra[i]["keep"] != rb[j]["keep"]]
    type_diff = [(i + 1, j + 1, ra[i]["type"], rb[j]["type"]) for i, j in pairs if ra[i]["type"] != rb[j]["type"]]
    kept_pairs = [(i, j) for i, j in pairs if ra[i]["keep"] and rb[j]["keep"] and ra[i]["reading_order"] is not None and rb[j]["reading_order"] is not None]
    order_a = [i for i, _ in sorted(kept_pairs, key=lambda p: ra[p[0]]["reading_order"])]
    order_b = [i for i, _ in sorted(kept_pairs, key=lambda p: rb[p[1]]["reading_order"])]
    unmatched_ink_a = [dict(region=i + 1, type=ra[i]["type"], pixels=int(table[i + 1, 1:].sum())) for i in range(na) if i not in used_a and table[i + 1, 1:].sum()]
    unmatched_ink_b = [dict(region=j + 1, type=rb[j]["type"], pixels=int(table[1:, j + 1].sum())) for j in range(nb) if j not in used_b and table[1:, j + 1].sum()]
    return dict(input_id=page, **({"request": request} if request else {}), regions=[na, nb], kept=[sum(r["keep"] for r in ra), sum(r["keep"] for r in rb)],
                ink_owned_in_either_run=owned_either, ink_with_corresponding_owner=matched_ink,
                agreement=round(matched_ink / max(1, owned_either), 5),
                ink_owned_in_one_run_only=[int(table[1:, 0].sum()), int(table[0, 1:].sum())],
                splits=splits, merges=merges, unmatched_regions=[unmatched_ink_a, unmatched_ink_b],
                keep_differences=keep_diff, type_differences=type_diff,
                reading_order_same=order_a == order_b, matched_kept_regions=len(kept_pairs),
                sources=[digest((a_dir / "regions.json").read_bytes()), digest((b_dir / "regions.json").read_bytes())])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    parser.add_argument("--pages", type=Path, help="input list (JSON with a pages list of input_id records)")
    parser.add_argument("--against", help="another local method to compare with, request by request")
    parser.add_argument("--method", help="local method whose outputs to read in place of this one")
    args = parser.parse_args()
    global METHOD
    METHOD = args.method or METHOD
    target = args.output / ((f"stability-{METHOD[:3]}.json" if args.method else "stability.json") if not args.against else f"against-{args.against[:3]}.json")
    if target.exists():
        parser.error("Output already exists.")
    pages = sorted(p.parents[2].name for p in (PROJECT_DIR / "outputs").glob(f"*/{METHOD}/run-002/regions.json"))
    if args.pages:
        listed = [p["input_id"] for p in json.loads(args.pages.read_text())["pages"]]
        pages = [p for p in listed if p in pages]
    if args.against:
        rows = []
        for request, sub in (("run-001", ""), ("run-002", "run-002")):
            for p in pages:
                rows.append(compare(p, PROJECT_DIR / "outputs" / p / METHOD / sub, PROJECT_DIR / "outputs" / p / args.against / sub, request))
    else:
        rows = [compare(p) for p in pages]
    args.output.mkdir(parents=True, exist_ok=True)
    record = dict(created_at_utc=datetime.now(timezone.utc).isoformat(), api_calls=0, method=METHOD, against=args.against,
                  pages_list=str(args.pages) if args.pages else None,
                  rule=dict(matching="one to one, greedy by shared owned ink", split_or_merge_part=f"at least {MIN_SHARE:.0%} of the region's ink and {MIN_PIXELS} pixels"),
                  pages=rows, code_sha256={"stability.py": digest(Path(__file__).read_bytes())})
    target.write_text(json.dumps(record, indent=1, ensure_ascii=False) + "\n")
    for r in rows:
        print(f"{r.get('request', '')} {r['input_id']}: regions {r['regions'][0]}/{r['regions'][1]}, agreement {r['agreement']:.4f}, "
              f"splits {[(s['region'], [i['region'] for i in s['into']]) for s in r['splits']]}, merges {[(s['region'], [i['region'] for i in s['into']]) for s in r['merges']]}, "
              f"keep diff {r['keep_differences']}, type diff {len(r['type_differences'])}, order same {r['reading_order_same']}")


if __name__ == "__main__":
    main()
