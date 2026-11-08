#!/usr/bin/env python3
"""Put a book folder's source PDF into it, as source.pdf, and record it in book.json. Local only.

  uv run --offline python webapp/tools/add_source_pdf.py OUT_DIR [OUT_DIR …]

The PDF is found from the pages' input records (inputs/<page id>.json: source_pdf, source_pdf_sha256, pdf_page).
All pages must come from one PDF, whose sha256 must match the records. The PDF is hard-linked (copied if that fails).
book.json gains pdf: {path, name, sha256, page_count}, and each page its pdf_page. Folders whose pages have no input
record with a PDF are left as they are.
"""
import hashlib
import json
import os
import shutil
import sys
from pathlib import Path

PROJECT_DIR = Path(__file__).resolve().parents[2]


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def attach_pdf(folder):
    """Hard-link the source PDF into `folder` and record it; returns a one-line report."""
    folder = Path(folder)
    manifest = json.loads((folder / "book.json").read_text())
    records = []
    for p in manifest["pages"]:
        path = PROJECT_DIR / "inputs" / f"{p['id']}.json"
        rec = json.loads(path.read_text()) if path.exists() else {}
        if not rec.get("source_pdf"):
            return f"{folder}: page {p['id']} has no source PDF in its input record; left as it is"
        records.append(rec)
    pdfs = {(r["source_pdf"], r["source_pdf_sha256"]) for r in records}
    if len(pdfs) != 1:
        return f"{folder}: its pages come from {len(pdfs)} PDFs; left as it is"
    (name, digest), = pdfs
    src = Path(os.path.expanduser(name))
    src = src if src.is_absolute() else PROJECT_DIR / src
    if sha256(src) != digest:
        sys.exit(f"{src} is not the PDF the pages were rendered from (sha256 differs)")
    dst = folder / "source.pdf"
    if not (dst.exists() and os.path.samefile(src, dst)):
        if dst.exists():
            dst.unlink()
        try:
            os.link(src, dst)
        except OSError:
            shutil.copyfile(src, dst)
    manifest["pdf"] = dict(path="source.pdf", name=src.name, sha256=digest, page_count=records[0].get("pdf_page_count"))
    for p, r in zip(manifest["pages"], records):
        p["pdf_page"] = r["pdf_page"]
    (folder / "book.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1) + "\n")
    return f"{folder}: source.pdf is {src.name} ({len(records)} pages from it)"


if __name__ == "__main__":
    for d in sys.argv[1:]:
        print(attach_pdf(d))
