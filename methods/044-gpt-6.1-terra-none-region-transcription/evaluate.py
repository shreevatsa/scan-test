#!/usr/bin/env python3
"""Score method 044 page documents against a transcription reference. Local only.

The reference (references/<input>/transcription.json) gives the text of each passage of the reviewed passage
reference, line by line. Each line piece of the page document is assigned to the passage that owns most of the
labeled ink inside its polygons (passage-labels.png), so the score does not depend on how the region step grouped the
page. A passage's transcribed text is its pieces' text in reading order (region order, then line order).

Character error rate = edit distance / reference length, at three levels:
- exact: Unicode NFC, runs of whitespace as one space;
- normalized: also apostrophe variants as ', two single dandas as ॥, the abbreviation sign variants as ॰ (° and a Devanagari zero right after a letter), the caret
  variants as ‸, and no space before or after a danda, double danda, apostrophe, comma or period;
- no_markers: normalized, and note markers removed: [x] with up to four characters inside, * and †.
Totals are given over all passages and over the kept passages only (keep=true in the passage reference, so not
running headers, page numbers or margin numbers). Line-level: for passages with as many non-empty pieces as reference lines, the number of lines equal when normalized.

Usage: evaluate.py OUT.json --page label=outputs/<input>/044-…/page.json [--page …] [--reference REF.json]
"""
import argparse
import json
import re
import unicodedata
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

PROJECT_DIR = Path(__file__).resolve().parents[2]


def nfc(s):
    return re.sub(r"\s+", " ", unicodedata.normalize("NFC", s)).strip()


def normalized(s):
    s = nfc(s)
    s = re.sub(r"[’‘ʼ`´]", "'", s)
    s = s.replace("।।", "॥").replace("||", "॥")
    s = s.replace("°", "॰")
    s = re.sub(r"(?<=[\u0901-\u0963])०(?=\s|$|[।॥])", "॰", s)
    s = s.replace("^", "‸").replace("̭", "‸")
    s = re.sub(r"\s*([।॥',.])\s*", r"\1", s)
    return s


def no_markers(s):
    s = re.sub(r"\[[^\]\s]{1,4}\]", "", normalized(s))
    return re.sub(r"[*†]", "", s)


LEVELS = {"exact": nfc, "normalized": normalized, "no_markers": no_markers}


def edits(a, b):
    """Levenshtein distance between strings a and b."""
    if len(a) < len(b):
        a, b = b, a
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


def piece_mask(polygons, shape):
    m = Image.new("L", (shape[1], shape[0]), 0)
    d = ImageDraw.Draw(m)
    for ring in polygons:
        if len(ring) >= 3:
            d.polygon([tuple(p) for p in ring], fill=255, outline=255)
    return np.asarray(m) > 0


def assign(doc, labels, legend):
    """[(passage or None, order key, text)] for every line piece of the document."""
    out = []
    for r in doc["page"]["regions"]:
        key = (r.get("order") is None, r.get("order") or 0, r["id"])
        for k, L in enumerate(r["lines"]):
            inside = labels[piece_mask(L["polygons"], labels.shape)]
            inside = inside[(inside > 0) & (inside < 255)]
            passage = legend[int(np.bincount(inside).argmax())] if inside.size else None
            out.append(dict(passage=passage, key=key + (k,), region=r["id"], line=L["line"], text=L.get("text"), type=r["type"]))
    return out


def score(doc, ref, labels, legend, kept):
    pieces = assign(doc, labels, legend)
    by = {}
    for p in sorted(pieces, key=lambda p: p["key"]):
        by.setdefault(p["passage"], []).append(p)
    rows, totals, text_totals = [], {lv: [0, 0] for lv in LEVELS}, {lv: [0, 0] for lv in LEVELS}
    lines_equal = lines_compared = 0
    for name, spec in ref["passages"].items():
        got = [p for p in by.get(name, []) if p["text"]]
        hyp = "\n".join(p["text"] for p in got)
        want = "\n".join(spec["lines"])
        row = dict(passage=name, regions=sorted({p["region"] for p in got}), reference=want, transcription=hyp)
        for lv, f in LEVELS.items():
            e, n = edits(f(want), f(hyp)), len(f(want))
            row[lv] = dict(edits=e, length=n, cer=round(e / n, 4) if n else None)
            totals[lv][0] += e
            totals[lv][1] += n
            if kept.get(name):
                text_totals[lv][0] += e
                text_totals[lv][1] += n
        if len(got) == len(spec["lines"]):
            eq = sum(normalized(a) == normalized(p["text"]) for a, p in zip(spec["lines"], got))
            row["lines_equal"] = f"{eq}/{len(got)}"
            lines_equal += eq
            lines_compared += len(got)
        else:
            row["lines_equal"] = f"{len(got)} pieces for {len(spec['lines'])} lines"
        rows.append(row)
    extra = [dict(region=p["region"], line=p["line"], text=p["text"]) for p in pieces
             if p["text"] and p["passage"] not in ref["passages"]]
    missing_text = [dict(region=p["region"], line=p["line"]) for p in pieces if p["text"] is None]
    return dict(passages=rows, extra_pieces=extra, pieces_without_text=missing_text,
                totals={lv: dict(edits=e, length=n, cer=round(e / n, 4) if n else None) for lv, (e, n) in totals.items()},
                text_totals={lv: dict(edits=e, length=n, cer=round(e / n, 4) if n else None) for lv, (e, n) in text_totals.items()},
                lines=dict(equal=lines_equal, compared=lines_compared))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("out", type=Path)
    parser.add_argument("--page", action="append", required=True, help="label=path to page.json")
    parser.add_argument("--reference", type=Path)
    args = parser.parse_args()
    results = {}
    for item in args.page:
        label, path = item.split("=", 1)
        doc = json.loads(Path(path).read_text())
        pid = doc["page"]["id"]
        ref_dir = PROJECT_DIR / "references" / pid
        ref_path = args.reference or ref_dir / "transcription.json"
        ref = json.loads(ref_path.read_text())
        labels = np.asarray(Image.open(ref_dir / "passage-labels.png"))
        passages = json.loads((ref_dir / "passages.json").read_text())["passages"]
        legend = {p["value"]: p["passage"] for p in passages}
        res = score(doc, ref, labels, legend, {p["passage"]: p["keep"] for p in passages})
        res.update(page=str(path), reference=str(ref_path.relative_to(PROJECT_DIR)))
        results[label] = res
        t, x = res["totals"], res["text_totals"]
        print(f"{label}: kept passages: CER exact {x['exact']['cer']:.4f} ({x['exact']['edits']}/{x['exact']['length']}), "
              f"normalized {x['normalized']['cer']:.4f} ({x['normalized']['edits']}), no markers {x['no_markers']['cer']:.4f} ({x['no_markers']['edits']})")
        print(f"{label}: all passages: CER exact {t['exact']['cer']:.4f} ({t['exact']['edits']}/{t['exact']['length']}), "
              f"normalized {t['normalized']['cer']:.4f} ({t['normalized']['edits']}), no markers {t['no_markers']['cer']:.4f} "
              f"({t['no_markers']['edits']}); lines equal {res['lines']['equal']}/{res['lines']['compared']}; "
              f"extra pieces {len(res['extra_pieces'])}, pieces without text {len(res['pieces_without_text'])}")
        for row in res["passages"]:
            if row["normalized"]["edits"]:
                print(f"  {row['passage']}: {row['normalized']['edits']} edits ({row['lines_equal']})")
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(results, indent=1, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()
