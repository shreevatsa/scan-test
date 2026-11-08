#!/usr/bin/env python3
"""Compare method 056's converted text layer with method 057's reading of the rendered page. Local only.

Both texts are normalized the same way: Unicode NFC, zero-width joiners and non-joiners removed (counted
separately), note markers in square brackets removed, spaces collapsed. Lines are aligned by dynamic programming
(a matched pair costs one minus its difflib similarity, an unmatched line costs one). For each matched pair the
character edit distance is counted and the differing words are listed. For review, each line that differs is
cropped from the page image (method 056's line box) into OUT_DIR/crops/.

Usage: uv run --offline python methods/056-…/compare.py OUT_DIR PAGE_ID [PAGE_ID …]
"""
import difflib
import json
import re
import sys
import unicodedata
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
PROJECT_DIR = HERE.parents[1]
M057 = "057-gemini-4-argon-low-page-lines"
JOINERS = re.compile("[‌‍]")
MARKERS = re.compile(r"\[[^\]\s]{1,4}\]")


def norm(s):
    return " ".join(JOINERS.sub("", MARKERS.sub("", unicodedata.normalize("NFC", s))).split())


def edits(a, b):
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


def align(A, B):
    """Pairs (i, j) with None for an unmatched line, in order."""
    n, m = len(A), len(B)
    cost = [[0.0] * (m + 1) for _ in range(n + 1)]
    for i in range(1, n + 1):
        cost[i][0] = i
    for j in range(1, m + 1):
        cost[0][j] = j
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            sim = difflib.SequenceMatcher(None, A[i - 1], B[j - 1], autojunk=False).ratio()
            cost[i][j] = min(cost[i - 1][j - 1] + (1 - sim), cost[i - 1][j] + 1, cost[i][j - 1] + 1)
    pairs, i, j = [], n, m
    while i or j:
        if i and j and abs(cost[i][j] - (cost[i - 1][j - 1] + 1 - difflib.SequenceMatcher(None, A[i - 1], B[j - 1], autojunk=False).ratio())) < 1e-9:
            pairs.append((i - 1, j - 1)); i -= 1; j -= 1
        elif i and abs(cost[i][j] - (cost[i - 1][j] + 1)) < 1e-9:
            pairs.append((i - 1, None)); i -= 1
        else:
            pairs.append((None, j - 1)); j -= 1
    return pairs[::-1]


def word_diffs(a, b):
    out = []
    sm = difflib.SequenceMatcher(None, a.split(), b.split(), autojunk=False)
    for op, i1, i2, j1, j2 in sm.get_opcodes():
        if op != "equal":
            out.append([" ".join(a.split()[i1:i2]), " ".join(b.split()[j1:j2])])
    return out


def main():
    out_dir = Path(sys.argv[1])
    (out_dir / "crops").mkdir(parents=True, exist_ok=True)
    pages, total = {}, dict(characters_056=0, edits=0, lines_056=0, lines_057=0, matched=0, identical=0, unmatched_056=0, unmatched_057=0, joiners_056=0, joiners_057=0)
    for pid in sys.argv[2:]:
        layer = json.loads((PROJECT_DIR / "outputs" / pid / HERE.name / "text-layer.json").read_text())
        read = json.loads((PROJECT_DIR / "outputs" / pid / M057 / "lines.json").read_text())
        record = json.loads((PROJECT_DIR / "inputs" / f"{pid}.json").read_text())
        img = Image.open(PROJECT_DIR / "inputs" / record["image"]).convert("RGB")
        A = [norm(L["text"]) for L in layer["lines"]]
        B = [norm(t) for t in read]
        c = dict(characters_056=sum(map(len, A)), edits=0, lines_056=len(A), lines_057=len(B), matched=0, identical=0, unmatched_056=0, unmatched_057=0,
                 joiners_056=sum(len(JOINERS.findall(L["text"])) for L in layer["lines"]), joiners_057=sum(len(JOINERS.findall(t)) for t in read))
        rows = []
        for i, j in align(A, B):
            if i is None:
                c["unmatched_057"] += 1
                rows.append(dict(line_056=None, line_057=j + 1, text_057=B[j]))
                continue
            if j is None:
                c["unmatched_056"] += 1
                c["edits"] += len(A[i])
                rows.append(dict(line_056=i + 1, line_057=None, text_056=A[i]))
                continue
            e = edits(A[i], B[j])
            c["matched"] += 1
            c["identical"] += e == 0
            c["edits"] += e
            if e:
                x0, y0, x1, y1 = layer["lines"][i]["bbox_px"]
                crop = f"crops/{pid}-line{i + 1:02d}.png"
                img.crop((max(0, x0 - 8), max(0, y0 - 8), min(img.width, x1 + 8), min(img.height, y1 + 8))).save(out_dir / crop)
                rows.append(dict(line_056=i + 1, line_057=j + 1, edits=e, text_056=A[i], text_057=B[j], words=word_diffs(A[i], B[j]), crop=crop))
        c["agreement"] = round(1 - c["edits"] / max(1, c["characters_056"]), 5)
        pages[pid] = dict(counts=c, differences=rows)
        for k in total:
            total[k] += c[k]
        print(pid, json.dumps(c, ensure_ascii=False))
    total["agreement"] = round(1 - total["edits"] / max(1, total["characters_056"]), 5)
    print("TOTAL", json.dumps(total))
    (out_dir / "comparison.json").write_text(json.dumps(dict(pages=pages, total=total), ensure_ascii=False, indent=1) + "\n")


if __name__ == "__main__":
    main()
