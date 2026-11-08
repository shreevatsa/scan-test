#!/usr/bin/env python3
"""Report on a whole-book run of methods 042 + 043 + 047. Local only.

Usage: book_report.py OUT_DIR RUN PAGE_ID [PAGE_ID …]   (pages in order)
       TRANSCRIPTION=<method id> book_report.py …   (another transcription method, such as 052-…)
       PAGE_DIRS=<file.json> book_report.py …       (a map from page id to the output directory of its transcription,
                                                     for books whose pages come from more than one method)

Also writes OUT_DIR/labels.json: the printed page numbers checked against their neighbors. A page is flagged when the
pages on both sides have numbers that agree on what its number should be (one more than the previous, one less than
the next) and its own number is something else, or is missing; the expected number is given. A part that restarts
its numbering is not flagged, because there the neighbors disagree.

Also writes OUT_DIR/characters.json: every character of the transcribed text outside the scripts a book of this kind
uses (Devanagari, Latin with its diacritics, combining marks, general punctuation, ‸), with its page, region and line.

Writes OUT_DIR/pages.json (per page: validity, errors, problems, counts, the units open at the top and the bottom,
cost and time of both calls), OUT_DIR/numbers.json (for each top-level unit of the assembled book, the numbers of
its numbered units in order, with gaps, repeats and restarts; top-level units without child units, such as
footnotes, are counted by type and number) and prints a summary. Assembly itself is method 044's
assemble.py, run separately into OUT_DIR/book."""
import json
import os
import sys
import unicodedata
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
PROJECT_DIR = HERE.parents[1]
M042 = "042-gpt-6.1-terra-none-book-types-continuations"
M047 = os.environ.get("TRANSCRIPTION", HERE.name)
PAGE_DIRS = json.loads(Path(os.environ["PAGE_DIRS"]).read_text()) if os.environ.get("PAGE_DIRS") else {}
ALLOWED = [(0x20, 0x7E), (0xA0, 0x24F), (0x300, 0x36F), (0x900, 0x97F), (0x1CD0, 0x1CFF), (0x1E00, 0x1EFF),
           (0x2000, 0x206F), (0xA8E0, 0xA8FF)]


def foreign(text):
    return [ch for ch in text if not any(a <= ord(ch) <= b for a, b in ALLOWED) and ch not in "\n"]


def open_chain(doc, side):
    units = {u["id"]: u for u in doc["units"]}
    out = []
    for u in doc["units"]:
        if u.get("open", {}).get(side):
            out.append(f"{u['type']}{' ' + u['number'] if u.get('number') else ''}")
    return out


def runs(numbers):
    """Gaps and repeats in a list of number strings that should mostly increase by one."""
    vals = []
    for n in numbers:
        try:
            vals.append(int(n))
        except (TypeError, ValueError):
            vals.append(None)
    gaps, repeats, restarts = [], [], []
    for a, b in zip(vals, vals[1:]):
        if a is None or b is None:
            continue
        if b == a:
            repeats.append(a)
        elif b < a:
            restarts.append((a, b))
        elif b > a + 1:
            gaps.append((a, b))
    return dict(count=len(numbers), first=numbers[:1], last=numbers[-1:], gaps=gaps, repeats=repeats, restarts=restarts)


def main():
    out_dir, run, pages = Path(sys.argv[1]), sys.argv[2], sys.argv[3:]
    out_dir.mkdir(parents=True, exist_ok=True)
    rows, total, strange = [], Counter(), []
    for pid in pages:
        d42 = PROJECT_DIR / "outputs" / pid / M042 / run
        d47 = Path(PAGE_DIRS[pid]) if pid in PAGE_DIRS else PROJECT_DIR / "outputs" / pid / M047 / run
        row = dict(page=pid)
        try:
            r42 = json.loads((d42 / "regions.json").read_text())
            c42 = r42["api"]["tokens_and_cost"]["estimated_paid_tier_total_cost_usd"]
            row.update(regions_call=dict(cost=c42, seconds=round(r42["api"]["api_wall_seconds"], 1), types=r42["region_types"]))
            total["cost_042"] += c42
        except (OSError, KeyError) as e:
            row["regions_call"] = f"missing: {e}"
        try:
            r47 = json.loads((d47 / "result.json").read_text())
            doc = json.loads((d47 / "page.json").read_text())
            c47 = r47["api"]["tokens_and_cost"]["estimated_paid_tier_total_cost_usd"]
            total["cost_047"] += c47
            total["valid"] += r47["check"]["valid"]
            total["pages_047"] += 1
            usage = r47["api"]["usage"] or {}
            row.update(label=doc["page"].get("label"), valid=r47["check"]["valid"], errors=r47["check"]["errors"],
                       problems=r47["problems"], counts=r47["counts"], open_start=open_chain(doc, "start"),
                       open_end=open_chain(doc, "end"), transcription_call=dict(cost=c47, seconds=round(r47["api"]["api_wall_seconds"], 1),
                                                                               output_tokens=usage.get("output_tokens", usage.get("total_output_tokens"))))
            for r in doc["page"]["regions"]:
                for L in r["lines"]:
                    bad = foreign(L.get("text", ""))
                    if bad:
                        strange.append(dict(page=pid, region=r["id"], line=L["line"], text=L["text"],
                                            characters=[f"U+{ord(ch):04X} {unicodedata.name(ch, '?')}" for ch in bad]))
        except (OSError, KeyError) as e:
            row["transcription"] = f"missing: {e}"
        rows.append(row)
    (out_dir / "pages.json").write_text(json.dumps(rows, indent=1, ensure_ascii=False) + "\n")
    (out_dir / "characters.json").write_text(json.dumps(strange, indent=1, ensure_ascii=False) + "\n")
    labels = [r.get("label") for r in rows]
    nums = [int(x) if isinstance(x, str) and x.isdigit() else None for x in labels]
    flagged = []
    for i in range(1, len(rows) - 1):
        a, b = nums[i - 1], nums[i + 1]
        if a is not None and b is not None and a + 2 == b and nums[i] != a + 1:
            flagged.append(dict(page=rows[i]["page"], label=labels[i], expected=str(a + 1)))
    (out_dir / "labels.json").write_text(json.dumps(dict(labels={r["page"]: r.get("label") for r in rows}, flagged=flagged),
                                                    indent=1, ensure_ascii=False) + "\n")
    book_path = out_dir / "book" / "book.json"
    numbers = {}
    if book_path.exists():
        book = json.loads(book_path.read_text())
        units = {u["id"]: u for u in book["units"]}

        def walk(uid, acc):
            u = units[uid]
            if u.get("number") is not None or u["type"] in ("verse", "translated_stanza", "stanza_note", "group"):
                acc.setdefault(u["type"], []).append(u.get("number"))
            for c in u["children"]:
                if "unit" in c:
                    walk(c["unit"], acc)

        for flow, ids in book["flows"].items():
            leaves = {}
            for uid in ids:
                u = units[uid]
                if not any("unit" in c for c in u["children"]):
                    leaves.setdefault(u["type"], []).append(u.get("number"))
                    continue
                acc = {}
                walk(uid, acc)
                key = f"{flow}: {u['type']} {u.get('label', '')} [{uid}]"
                numbers[key] = {t: runs(v) for t, v in acc.items()}
            for t, v in leaves.items():
                numbers[f"{flow}: top-level {t} units"] = {t: dict(count=len(v), values=dict(Counter(map(str, v))))}
        (out_dir / "numbers.json").write_text(json.dumps(numbers, indent=1, ensure_ascii=False) + "\n")
    print(f"pages {len(rows)}, transcribed {total['pages_047']}, valid {total['valid']}; "
          f"cost: regions ${total['cost_042']:.2f}, transcription ${total['cost_047']:.2f}")
    print(f"page numbers out of sequence: {len(flagged)}")
    for x in flagged:
        print(f"  {x['page']}: printed number read as {x['label']}, neighbors suggest {x['expected']}")
    print(f"lines with characters outside the expected scripts: {len(strange)}")
    for x in strange[:10]:
        print(f"  {x['page']} {x['region']}: {x['characters']} in {x['text'][:60]!r}")
    bad = [r for r in rows if r.get("valid") is False]
    for r in bad:
        print(f"  invalid {r['page']}: {r['errors'][:2]}")
    for key, by_type in numbers.items():
        print(key)
        for t, s in by_type.items():
            if "values" in s:
                print(f"   {t}: {s['count']}, numbers {s['values']}")
            else:
                print(f"   {t}: {s['count']}, first {s['first']}, last {s['last']}, gaps {s['gaps'][:8]}, repeats {s['repeats'][:8]}, restarts {s['restarts'][:8]}")


if __name__ == "__main__":
    main()
