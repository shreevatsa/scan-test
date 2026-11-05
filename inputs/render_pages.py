#!/usr/bin/env python3
"""Render the test pages listed in pages.json (or the list file given as the argument) to unannotated RGB PNGs with provenance records.

Each page is rendered with PyMuPDF at 300 dpi, or at the scan's native resolution when that is lower
(the largest embedded image's width divided by the page width), RGB, no alpha. This matches the Kale
inputs, which are 300 dpi renders of 600 dpi scans, and the method 032 survey's resolution rule.
Existing PNGs are never overwritten.
"""
import hashlib
import json
import os
import sys
from pathlib import Path

import fitz

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def main():
    spec_path = Path(sys.argv[1]) if len(sys.argv) > 1 else HERE / "pages.json"
    spec = json.loads(spec_path.read_text())
    pdf_hashes = {}
    for page in spec["pages"]:
        out_png = HERE / (page["input_id"] + ".png")
        out_json = HERE / (page["input_id"] + ".json")
        if out_png.exists() or out_json.exists():
            print("exists, skipped:", page["input_id"])
            continue
        source = page["source_pdf"]
        path = os.path.expanduser(source) if source.startswith("~") else str(ROOT / source)
        if path not in pdf_hashes:
            pdf_hashes[path] = sha256(path)
        doc = fitz.open(path)
        pdf_page = doc[page["pdf_page"] - 1]
        zoom = spec["dpi"] / 72
        images = pdf_page.get_images(full=True)
        native = None
        if images:
            big = max(images, key=lambda im: im[2] * im[3])
            native = [big[2], big[3]]
            zoom = min(zoom, big[2] / pdf_page.rect.width)
        pix = pdf_page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), colorspace=fitz.csRGB, alpha=False)
        pix.save(str(out_png))
        record = {
            "input_id": page["input_id"],
            "image": out_png.name,
            "image_sha256": sha256(out_png),
            "width": pix.width,
            "height": pix.height,
            "book_id": page["book_id"],
            "source_pdf": source,
            "source_pdf_sha256": pdf_hashes[path],
            "pdf_page": page["pdf_page"],
            "pdf_page_index": page["pdf_page"] - 1,
            "pdf_page_count": doc.page_count,
            "pdf_page_size_points": [pdf_page.rect.width, pdf_page.rect.height],
            "selection": page["selection"],
            "render": {"library": "PyMuPDF", "version": fitz.VersionBind, "dpi": spec["dpi"],
                       "zoom": zoom, "effective_dpi": round(zoom * 72, 2), "native_image_size": native,
                       "colorspace": "RGB", "alpha": False, "script": "inputs/render_pages.py",
                       "page_list": str(spec_path.resolve().relative_to(ROOT))},
        }
        out_json.write_text(json.dumps(record, indent=2, ensure_ascii=False) + "\n")
        print(page["input_id"], pix.width, pix.height, round(zoom * 72, 1), "dpi")


if __name__ == "__main__":
    sys.exit(main())
