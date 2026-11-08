#!/usr/bin/env python3
"""Compare two method 044 requests on the same page and the same method 043 regions. Local only.

Text: for each region, the edit distance between the two requests' texts (lines joined by newlines, normalized as in
evaluate.py) and whether every line is equal. Units: each unit as (type, regions under it, open start, open end);
the two requests agree on a unit when both have it.

Usage: stability.py OUT.json PAGE_A.json PAGE_B.json [PAGE_A.json PAGE_B.json …]
"""
import json
import sys
from pathlib import Path

from evaluate import edits, normalized
from tree import descendants


def units(doc):
    desc = descendants(doc)
    return {(u["type"], desc[u["id"]], bool(u.get("open", {}).get("start")), bool(u.get("open", {}).get("end")))
            for u in doc["units"]}


def compare(a, b):
    ra = {r["id"]: r for r in a["page"]["regions"]}
    rb = {r["id"]: r for r in b["page"]["regions"]}
    rows, e_total, n_total, equal_regions = [], 0, 0, 0
    for rid in ra:
        if rid not in rb:
            rows.append(dict(region=rid, missing_in_b=True))
            continue
        ta = "\n".join(normalized(L.get("text", "")) for L in ra[rid]["lines"])
        tb = "\n".join(normalized(L.get("text", "")) for L in rb[rid]["lines"])
        e = edits(ta, tb)
        e_total += e
        n_total += max(len(ta), 1)
        equal_regions += e == 0
        if e:
            rows.append(dict(region=rid, type=ra[rid]["type"], edits=e, a=ta, b=tb))
    ua, ub = units(a), units(b)
    return dict(regions=len(ra), regions_equal=equal_regions, edits=e_total, characters=n_total,
                disagreement=round(e_total / n_total, 4) if n_total else None,
                units_a=len(ua), units_b=len(ub), units_both=len(ua & ub),
                only_a=[f"{t} {sorted(d)} open={s},{e}" for t, d, s, e in sorted(ua - ub, key=str)],
                only_b=[f"{t} {sorted(d)} open={s},{e}" for t, d, s, e in sorted(ub - ua, key=str)],
                differing_regions=rows)


def main():
    out, paths = Path(sys.argv[1]), sys.argv[2:]
    results = {}
    for pa, pb in zip(paths[::2], paths[1::2]):
        a, b = json.loads(Path(pa).read_text()), json.loads(Path(pb).read_text())
        res = compare(a, b)
        res.update(a=pa, b=pb)
        results[a["page"]["id"]] = res
        print(f"{a['page']['id']}: regions with equal text {res['regions_equal']}/{res['regions']}, "
              f"disagreement {res['disagreement']} ({res['edits']} edits); units in both {res['units_both']} "
              f"of {res['units_a']} and {res['units_b']}")
        for x in res["only_a"]:
            print("   only first: " + x)
        for x in res["only_b"]:
            print("   only repeat: " + x)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(results, indent=1, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()
