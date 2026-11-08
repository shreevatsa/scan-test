#!/usr/bin/env python3
"""Score method 055's formatting against the formatting references, and compare its plain text with method 052's. Local only.

Formatting: the page document's formatting spans are joined into runs across line pieces (schema/inline.py,
formatted_runs). Each reference span (references/<page>/formatting.json) is matched to an unused predicted run of the
same kind: exactly, after Unicode NFC, collapsed spaces and surrounding punctuation are removed; or nearly, with a
difflib ratio of at least 0.8 (the text was misread, but the formatting is right). A predicted run left unmatched is a
false mark. Kinds outside the reference's kinds (superscript, subscript, underline, spaced) are listed separately.

Text: for each line piece that method 052's page document of the same page and run also has (the same region id, as both
use method 043's regions, and the same line id), the edit distance between 052's text with its [x] markers removed and 055's plain text.

Usage: evaluate_formatting.py OUT.json PAGE_ID:RUN [PAGE_ID:RUN …]
"""
import difflib
import json
import re
import sys
import unicodedata
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
PROJECT_DIR = HERE.parents[1]
sys.path.insert(0, str(PROJECT_DIR / "schema"))
sys.path.append(str(PROJECT_DIR / "methods" / "044-gpt-6.1-terra-none-region-transcription"))
import inline  # noqa: E402
from evaluate import edits  # noqa: E402

METHOD = HERE.name
BASELINE = "052-gemini-4-argon-low-region-transcription-neighbor-context-region-list"
SCORED = {"bold", "italic", "small_caps"}
EDGE = re.compile(r"^[\s\W_]+|[\s\W_]+$")


def norm(s):
    s = unicodedata.normalize("NFC", " ".join(s.split()))
    return EDGE.sub("", s)


def runs_of(doc):
    out = []
    for r in doc["page"]["regions"]:
        for kind, text in inline.formatted_runs(r.get("lines", [])):
            out.append(dict(region=r["id"], kind=kind, text=text))
    return out


def score_page(pid, run):
    doc = json.loads((PROJECT_DIR / "outputs" / pid / METHOD / run / "page.json").read_text())
    ref = json.loads((PROJECT_DIR / "references" / pid / "formatting.json").read_text())
    pred = runs_of(doc)
    used = set()
    c, rows = Counter(), []
    for want in ref["spans"]:
        best, how = None, "missed"
        for k, p in enumerate(pred):
            if k in used or p["kind"] != want["kind"]:
                continue
            if norm(p["text"]) == norm(want["text"]):
                best, how = k, "exact"
                break
        if best is None:
            ratios = [(difflib.SequenceMatcher(None, norm(p["text"]), norm(want["text"])).ratio(), k)
                      for k, p in enumerate(pred) if k not in used and p["kind"] == want["kind"]]
            if ratios and max(ratios)[0] >= 0.8:
                best, how = max(ratios)[1], "near"
        if best is not None:
            used.add(best)
        c["reference spans"] += 1
        c[how] += 1
        rows.append(dict(kind=want["kind"], reference=want["text"], found=pred[best]["text"] if best is not None else None, match=how))
    extra = [p for k, p in enumerate(pred) if k not in used and p["kind"] in SCORED]
    other = [p for p in pred if p["kind"] not in SCORED]
    c["predicted runs"] = sum(p["kind"] in SCORED for p in pred)
    c["false marks"] = len(extra)
    c["other kinds"] = len(other)

    base = json.loads((PROJECT_DIR / "outputs" / pid / BASELINE / run / "page.json").read_text())
    old = {}
    for r in base["page"]["regions"]:
        for L in r.get("lines", []):
            if "text" in L:
                old[(r["id"], L["line"])] = inline.MARKER.sub("", L["text"])
    diffs = []
    for r in doc["page"]["regions"]:
        for L in r.get("lines", []):
            key = (r["id"], L["line"])
            if "text" in L and key in old:
                e = edits(old[key], L["text"])
                c["shared line pieces"] += 1
                c["shared characters (052)"] += len(old[key])
                c["text edits from 052"] += e
                c["line pieces that differ"] += e > 0
                if e:
                    diffs.append(dict(region=r["id"], line=L["line"], text_052=old[key], text_055=L["text"], edits=e))
    markers = sum(s["kind"] == "note_marker" for r in doc["page"]["regions"] for L in r.get("lines", []) for s in L.get("spans", []))
    rels = doc.get("relations", [])
    c["note markers"] = markers
    c["relations"] = len(rels)
    c["relations anchored"] = sum("anchor" in rel["from"] for rel in rels)
    return dict(counts=dict(c), spans=rows, false_marks=extra, other_kinds=other, text_differences=diffs)


def main():
    out = Path(sys.argv[1])
    pages, total = {}, Counter()
    for arg in sys.argv[2:]:
        pid, run = arg.split(":")
        pages[pid] = score_page(pid, run)
        total += Counter(pages[pid]["counts"])
        print(pid, pages[pid]["counts"])
    print("TOTAL", dict(total))
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(dict(method=METHOD, baseline=BASELINE, pages=pages, total=dict(total)), indent=1, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()
