#!/usr/bin/env python3
"""Package a run's page documents as a book folder for the web app (webapp/README.md, "Book folders"). Local only.

  uv run --offline python webapp/tools/make_book_folder.py OUT_DIR --title TITLE --types TYPES.json PAGE_DIR [PAGE_DIR …]
  uv run --offline python webapp/tools/make_book_folder.py OUT_DIR --title TITLE --types TYPES.json --page-dirs PAGE_DIRS.json

PAGE_DIR is a method output directory holding page.json (as method 052, 054 or 055 write them), in page order;
PAGE_DIRS.json maps page ids to such directories, in page order. Each page document is copied into OUT_DIR/pages/:
a 0.1 document is upgraded to 0.2 with schema/inline.py (markers move out of the text into note-marker spans), and
each region gets `box`, the region step's box (source.model_box) rounded to whole pixels, as the editable rectangle.
The original documents are not changed. Page images are hard-linked (copied if that fails) from inputs/ into
OUT_DIR/images/. OUT_DIR/edits/ is left for the app, which saves the user's corrected page documents there. With --style, a style
sheet (schema 0.3) is copied as style.json and named in book.json, for the app's "as printed" reading and HTML export.
The book's source PDF is hard-linked into the folder as source.pdf (add_source_pdf.py), when the pages' input records
name one PDF.
"""
import argparse
import copy
import hashlib
import json
import os
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
PROJECT_DIR = HERE.parents[1]
sys.path.insert(0, str(PROJECT_DIR / "schema"))
import book as bk  # noqa: E402
import inline  # noqa: E402


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def package_page(doc, origin):
    doc = copy.deepcopy(doc)
    if doc.get("schema_version", "0.1") == "0.1":
        doc = inline.upgrade_page(doc)
    boxes = 0
    for r in doc["page"]["regions"]:
        mb = r.get("source", {}).get("model_box")
        if "box" not in r and mb:
            r["box"] = [round(v) for v in mb]
            boxes += 1
    doc.setdefault("source", {})["packaged"] = dict(
        by="webapp/tools/make_book_folder.py", from_path=str(Path(origin).relative_to(PROJECT_DIR)),
        from_sha256=sha256(origin), boxes_from_model_box=boxes)
    return doc


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("out", type=Path)
    ap.add_argument("dirs", nargs="*", type=Path)
    ap.add_argument("--title", help="default: the type list's title")
    ap.add_argument("--types", type=Path, required=True)
    ap.add_argument("--page-dirs", type=Path)
    ap.add_argument("--style", type=Path, help="a style sheet (schema 0.3, format 'style'), copied as style.json")
    args = ap.parse_args()
    dirs = [Path(d) for d in json.loads(args.page_dirs.read_text()).values()] if args.page_dirs else args.dirs
    tl = json.loads(args.types.read_text())
    for sub in ("pages", "images", "edits"):
        (args.out / sub).mkdir(parents=True, exist_ok=True)
    shutil.copyfile(args.types, args.out / "types.json")
    if args.style:
        problems = bk.validate(json.loads(args.style.read_text()))
        if problems:
            sys.exit(f"The style sheet is not valid: {problems[:3]}")
        shutil.copyfile(args.style, args.out / "style.json")
    pages, bad = [], 0
    for d in dirs:
        origin = (d / "page.json").resolve()
        doc = package_page(json.loads(origin.read_text()), origin)
        pid = doc["page"]["id"]
        errors = bk.validate(doc) or bk.check_document(doc, tl)[0]
        bad += bool(errors)
        (args.out / "pages" / f"{pid}.json").write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")) + "\n")
        src = PROJECT_DIR / "inputs" / doc["page"]["image"]
        dst = args.out / "images" / doc["page"]["image"]
        if not dst.exists():
            try:
                os.link(src, dst)
            except OSError:
                shutil.copyfile(src, dst)
        pages.append(dict(id=pid, image=f"images/{doc['page']['image']}", document=f"pages/{pid}.json",
                          label=doc["page"].get("label"), valid=not errors))
    manifest = dict(format="book-folder", version=1, schema_version="0.3" if args.style else "0.2", book_id=tl["book_id"], title=args.title or tl["title"],
                    types="types.json", **(dict(style="style.json") if args.style else {}), pages=pages,
                    source=dict(packaged_by="webapp/tools/make_book_folder.py",
                                packaged_at_utc=datetime.now(timezone.utc).isoformat(),
                                types_sha256=sha256(args.types), types_path=str(args.types.resolve().relative_to(PROJECT_DIR))))
    (args.out / "book.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1) + "\n")
    print(f"{args.out}: {len(pages)} pages, {bad} not valid")
    # The book's source PDF, from the pages' input records.
    sys.path.insert(0, str(HERE))
    from add_source_pdf import attach_pdf
    print(attach_pdf(args.out))


if __name__ == "__main__":
    main()
