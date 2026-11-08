#!/usr/bin/env python3
"""Score method 053's corrections against the transcription references. Local only.

For each checked line that maps one to one to a reference line (through method 044's passage assignment), the edit
distance to the reference before and after the corrections, on the word-split, marker-free text that method 053
works on. A line is fixed if it was wrong and is now right, broken if it was right and is now wrong.

Usage: evaluate_check.py OUT.json OUTPUT_DIR [OUTPUT_DIR …]   (method 053 output directories)
"""
import json
import sys
from collections import Counter
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
PROJECT_DIR = HERE.parents[1]
sys.path.append(str(PROJECT_DIR / "methods" / "044-gpt-6.1-terra-none-region-transcription"))
from evaluate import assign, edits  # noqa: E402
from run import words  # noqa: E402


def main():
    out, dirs = Path(sys.argv[1]), [Path(d) for d in sys.argv[2:]]
    results, total = {}, Counter()
    for d in dirs:
        res = json.loads((d / "result.json").read_text())
        pid = res["input"]
        doc = json.loads((PROJECT_DIR / res["source_page"]["path"]).read_text())
        ref = json.loads((PROJECT_DIR / "references" / pid / "transcription.json").read_text())
        labels = np.asarray(Image.open(PROJECT_DIR / "references" / pid / "passage-labels.png"))
        passages = json.loads((PROJECT_DIR / "references" / pid / "passages.json").read_text())["passages"]
        legend = {p["value"]: p["passage"] for p in passages}
        kept = {p["passage"] for p in passages if p["keep"]}
        by = {}
        for p in sorted(assign(doc, labels, legend), key=lambda p: p["key"]):
            if p["text"]:
                by.setdefault(p["passage"], []).append(p)
        ref_line = {}
        for name, spec in ref["passages"].items():
            got = by.get(name, [])
            if name in kept and len(got) == len(spec["lines"]):
                for p, want in zip(got, spec["lines"]):
                    ref_line[(p["region"], p["line"])] = want
        c, rows = Counter(), []
        for line in json.loads((d / "corrected-lines.json").read_text()):
            want = ref_line.get((line["region"], line["line"]))
            if want is None:
                c["lines without a reference line"] += 1
                continue
            w = " ".join(words(want))
            eb, ea = edits(w, line["before"]), edits(w, line["after"])
            c["lines"] += 1
            c["reference characters"] += len(w)
            c["edits before"] += eb
            c["edits after"] += ea
            c["lines wrong before"] += eb > 0
            c["lines wrong after"] += ea > 0
            c["fixed"] += eb > 0 and ea == 0
            c["improved, not fixed"] += 0 < ea < eb
            c["broken"] += eb == 0 and ea > 0
            c["made worse"] += 0 < eb < ea
            if eb or ea:
                rows.append(dict(region=line["region"], line=line["line"], reference=w, before=line["before"], after=line["after"],
                                 edits_before=eb, edits_after=ea))
        c["items"] = res["summary"]["items"]
        c["unclear"] = len(res["unclear"])
        for v, n in res["verdicts"].items():
            c["verdict " + v] = n
        results[pid] = dict(counts=dict(c), lines=rows)
        total += c
        print(pid, dict(c))
    print("TOTAL", dict(total))
    out.write_text(json.dumps(dict(pages=results, total=dict(total)), indent=1, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()
