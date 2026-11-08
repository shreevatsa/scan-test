#!/usr/bin/env python3
"""Assemble method 044 page documents into a book document with schema/book.py, and write a readable transcript.
Local only.

Usage: assemble.py OUT_DIR PAGE.json [PAGE.json …]   (pages in reading order)
Pages whose own document breaks the schema's rules are left out and listed. Writes OUT_DIR/book.json, tree-printed.txt (book.py's tree), transcript.txt (each unit's text, page by page
references) and assembly.json (warnings and errors)."""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
PROJECT_DIR = HERE.parents[1]
sys.path.insert(0, str(PROJECT_DIR / "schema"))
import book as bk  # noqa: E402
from pagedoc import join_pieces  # noqa: E402


def transcript(book, tl):
    units = {u["id"]: u for u in book["units"]}
    regions = {f"{p['id']}#{r['id']}": (p, r) for p in book["pages"] for r in p["regions"]}
    out = []

    def show(uid, depth):
        u = units[uid]
        pad = "  " * depth
        flags = [k for k in ("start", "end") if u.get("open", {}).get(k)]
        out.append(pad + " ".join(x for x in [u["type"], u.get("number", ""), repr(u["label"]) if "label" in u else "",
                                              f"(open {'+'.join(flags)})" if flags else ""] if x))
        for c in u["children"]:
            if "unit" in c:
                show(c["unit"], depth + 1)
            else:
                p, r = regions[c["region"]]
                text = join_pieces([(L.get("text", "?"), L.get("end", "space")) for L in r["lines"] if L.get("text") != ""])
                where = f"[p.{p.get('label', '?')} {r['id']}]"
                out.append(f"{pad}  {where} " + text.replace("\n", "\n" + pad + " " * (len(where) + 3)))

    for flow, ids in book["flows"].items():
        out.append(f"flow {flow}")
        for uid in ids:
            show(uid, 1)
    return "\n".join(out) + "\n"


def main():
    out_dir = Path(sys.argv[1])
    paths = sys.argv[2:]
    docs = [json.loads(Path(p).read_text()) for p in paths]
    tl = json.loads((PROJECT_DIR / "schema" / "types" / f"{docs[0]['book_id']}.json").read_text())
    left_out = {}
    for path, doc in zip(paths, docs):
        errors = bk.validate(doc) or bk.check_document(doc, tl)[0]
        if errors:
            left_out[doc["page"]["id"]] = errors
    docs = [d for d in docs if d["page"]["id"] not in left_out]
    book, warnings = bk.assemble(docs, tl)
    errors = bk.validate(book) or bk.check_document(book, tl)[0]
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "book.json").write_text(json.dumps(book, ensure_ascii=False, separators=(",", ":")) + "\n")
    printed = "\n".join(bk.tree_lines(book)) + "\n"
    (out_dir / "tree-printed.txt").write_text(printed)
    (out_dir / "transcript.txt").write_text(transcript(book, tl))
    (out_dir / "assembly.json").write_text(json.dumps(dict(pages=paths, left_out_invalid_pages=left_out, warnings=warnings, errors=errors,
                                                           units=len(book["units"])), indent=1, ensure_ascii=False) + "\n")
    print(f"{out_dir}: {len(book['units'])} units; invalid pages left out {left_out}; warnings {warnings}; errors {errors}")
    print(printed)


if __name__ == "__main__":
    main()
