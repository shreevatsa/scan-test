#!/usr/bin/env python3
"""Compare method 044's unit trees with the hand-written example trees of schema/examples/. Local only.

The examples are page documents over method 041 regions; method 044's are over method 043 regions. Each example
region is matched to the method 044 region whose polygons share most pixels with its own. A unit is then described
by its type and the set of (matched) regions under it, and its open ends. For each example unit the comparison
reports whether method 044 has a unit of the same type over the same regions, and whether its open ends agree.

Usage: tree.py OUT.json --page label=outputs/<input>/044-…/page.json [--page …]
"""
import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

PROJECT_DIR = Path(__file__).resolve().parents[2]


def mask(polygons, shape):
    m = Image.new("L", (shape[1], shape[0]), 0)
    d = ImageDraw.Draw(m)
    for ring in polygons:
        if len(ring) >= 3:
            d.polygon([tuple(p) for p in ring], fill=255, outline=255)
    return np.asarray(m) > 0


def descendants(doc):
    """unit id -> frozenset of region ids under it (local ids)."""
    units = {u["id"]: u for u in doc["units"]}
    memo = {}

    def walk(uid, seen=()):
        if uid in memo:
            return memo[uid]
        if uid in seen or uid not in units:
            return frozenset()
        out = set()
        for c in units[uid]["children"]:
            if "region" in c:
                out.add(c["region"].split("#", 1)[1])
            else:
                out |= walk(c["unit"], seen + (uid,))
        memo[uid] = frozenset(out)
        return memo[uid]

    return {uid: walk(uid) for uid in units}


def find_example(pid):
    for path in sorted((PROJECT_DIR / "schema" / "examples").glob(f"*/pages/{pid}.json")):
        return path
    return None


def compare(doc, ex):
    shape = (doc["page"]["height"], doc["page"]["width"])
    ours = {r["id"]: mask(r["polygons"], shape) for r in doc["page"]["regions"]}
    region_map, region_rows = {}, []
    for r in ex["page"]["regions"]:
        m = mask(r["polygons"], shape)
        best, overlap = None, 0
        for rid, om in ours.items():
            k = int((m & om).sum())
            if k > overlap:
                best, overlap = rid, k
        region_map[r["id"]] = best
        mine = next((x for x in doc["page"]["regions"] if x["id"] == best), None)
        region_rows.append(dict(example=r["id"], example_type=r["type"], matched=best,
                                type=mine["type"] if mine else None, share=round(overlap / max(1, int(m.sum())), 3)))
    ex_desc, our_desc = descendants(ex), descendants(doc)
    ours_by_key = {}
    for u in doc["units"]:
        ours_by_key.setdefault((u["type"], our_desc[u["id"]]), []).append(u)
    rows = []
    for u in ex["units"]:
        regs = frozenset(region_map.get(r) for r in ex_desc[u["id"]])
        hits = ours_by_key.get((u["type"], regs), [])
        row = dict(example=u["id"], type=u["type"], number=u.get("number"), regions=sorted(r or "?" for r in regs),
                   example_open=u.get("open", {}), matched=[h["id"] for h in hits])
        if hits:
            row["open"] = hits[0].get("open", {})
            row["open_agrees"] = {k: bool(row["open"].get(k)) == bool(row["example_open"].get(k)) for k in ("start", "end")}
            row["number_agrees"] = (hits[0].get("number") or None) == (u.get("number") or None)
        rows.append(row)
    matched = [r for r in rows if r["matched"]]
    extra = [u["id"] for u in doc["units"] if not any(u["id"] in r["matched"] for r in rows)]
    return dict(units=rows, regions=region_rows, extra_units=extra,
                summary=dict(example_units=len(rows), matched=len(matched),
                             open_agrees=sum(all(r["open_agrees"].values()) for r in matched),
                             number_agrees=sum(r["number_agrees"] for r in matched),
                             region_types_agree=sum(r["type"] == r["example_type"] for r in region_rows),
                             example_regions=len(region_rows), method_units=len(doc["units"])))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("out", type=Path)
    parser.add_argument("--page", action="append", required=True, help="label=path to page.json")
    args = parser.parse_args()
    results = {}
    for item in args.page:
        label, path = item.split("=", 1)
        doc = json.loads(Path(path).read_text())
        ex_path = find_example(doc["page"]["id"])
        if ex_path is None:
            print(f"{label}: no example tree for {doc['page']['id']}")
            continue
        res = compare(doc, json.loads(ex_path.read_text()))
        res.update(page=path, example=str(ex_path.relative_to(PROJECT_DIR)))
        results[label] = res
        s = res["summary"]
        print(f"{label}: {s['matched']}/{s['example_units']} example units matched (open ends agree on {s['open_agrees']}, "
              f"numbers on {s['number_agrees']}); region types {s['region_types_agree']}/{s['example_regions']}; "
              f"method units {s['method_units']}, unmatched {res['extra_units']}")
        for r in res["units"]:
            if not r["matched"] or not all(r.get("open_agrees", {}).values()):
                print(f"   {r['example']} {r['type']} {r.get('number') or ''} over {r['regions']}: "
                      f"{'matched ' + str(r['matched']) if r['matched'] else 'no match'}"
                      + (f", open {r.get('open')} vs example {r['example_open']}" if r["matched"] else ""))
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(results, indent=1, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()
