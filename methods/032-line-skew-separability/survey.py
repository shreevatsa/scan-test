#!/usr/bin/env python3
"""Cross-book survey of text-line skew, curvature and line-pair separability.

Pages are rendered from the PDFs in books.json at 300 dpi, or at the embedded
page image's native resolution when that is lower, as grayscale without alpha.
No rendered page is saved except the downscaled contact-sheet overlays.
"""
import argparse
import glob
import hashlib
import json
import os
from concurrent.futures import ProcessPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

import fitz
import numpy as np
from PIL import Image, ImageDraw

import analysis
from reference import code_hashes

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def resolve(p):
    p = os.path.expanduser(p)
    return p if os.path.isabs(p) else str(ROOT / p)


def display(p):
    """Repository-relative path, or ~/... for files outside the repository."""
    p = os.path.abspath(p)
    if p.startswith(str(ROOT) + os.sep):
        return os.path.relpath(p, ROOT)
    home = os.path.expanduser("~")
    return "~/" + os.path.relpath(p, home) if p.startswith(home + os.sep) else p


def page_jobs(book, settings):
    """List of (pdf_path, page_index) for a book."""
    if "path_glob" in book:
        files = sorted(f for f in glob.glob(resolve(book["path_glob"])))
        picks = np.unique(np.round(np.linspace(settings["sample_range"][0] * (len(files) - 1), settings["sample_range"][1] * (len(files) - 1), settings["sample_pages"])).astype(int))
        jobs = []
        for i in picks:
            n = fitz.open(files[i]).page_count
            jobs.append((files[i], min(1, n - 1)))
        return jobs
    path = resolve(book["path"])
    n = fitz.open(path).page_count
    if book["pages"] == "all":
        return [(path, i) for i in range(n)]
    picks = np.unique(np.round(np.linspace(settings["sample_range"][0] * (n - 1), settings["sample_range"][1] * (n - 1), settings["sample_pages"])).astype(int))
    return [(path, int(i)) for i in picks]


def render(path, index, dpi):
    doc = fitz.open(path)
    page = doc[index]
    zoom = dpi / 72
    images = page.get_images(full=True)
    native = None
    if images:
        big = max(images, key=lambda im: im[2] * im[3])
        native = (big[2], big[3])
        zoom = min(zoom, big[2] / page.rect.width)
    pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), colorspace=fitz.csGRAY, alpha=False)
    gray = np.frombuffer(pix.samples, np.uint8).reshape(pix.height, pix.width)
    return gray.copy(), dict(zoom=zoom, effective_dpi=round(zoom * 72, 2), width=pix.width, height=pix.height, native_image_size=native, page_size_points=[page.rect.width, page.rect.height])


def work(args):
    path, index, dpi, config, overlay_height = args
    gray, info = render(path, index, dpi)
    detail, arrays = analysis.analyze(gray, config)
    row = dict(pdf=display(path), page_index=index, pdf_page=index + 1, render=info, summary=detail["summary"])
    if detail["summary"].get("status") == "ok":
        row["pairs"] = [dict(upper_line=p["upper_line"], lower_line=p["lower_line"], both_long=p["both_long"], pitch_px=round(p["pitch_px"], 1),
                             separable=p["separable"], straight_best_margin_px=round(p["straight"]["best_margin_px"], 2),
                             axis_conflict_px=p["axis_aligned"]["b_in_a"] + p["axis_aligned"]["a_in_b"],
                             rotated_conflict_px=p["page_rotated"]["b_in_a"] + p["page_rotated"]["a_in_b"],
                             column_minimum_gap_px=p["column"]["minimum_gap_px"]) for p in detail["pairs"]]
        row["line_shapes"] = [dict(line_id=L["line_id"], box=L.get("box"), angle_deg=L["shape"]["angle_deg"], bow_px=L["shape"].get("bow_px")) for L in detail["lines"] if L["shape"]]
    thumb = None
    if overlay_height:
        rgb = np.stack([gray] * 3, axis=-1)
        img = analysis.draw_overlay(rgb, detail, arrays) if detail["summary"].get("status") == "ok" else Image.fromarray(rgb)
        thumb = img.resize((int(img.width * overlay_height / img.height), overlay_height), Image.LANCZOS)
    return row, thumb


def book_summary(rows, exclusions):
    ok = [r for r in rows if r["summary"].get("status") == "ok" and r["summary"]["lines"] >= 5 and str(r["pdf_page"]) not in exclusions]
    def stats(v):
        v = np.asarray(v, float)
        return dict(n=int(len(v)), median=round(float(np.median(v)), 3), p90=round(float(np.percentile(v, 90)), 3), maximum=round(float(v.max()), 3)) if len(v) else None
    angles = [r["summary"]["page_angle_deg"] for r in ok]
    spreads = [r["summary"]["line_angle_deg"]["p90"] - r["summary"]["line_angle_deg"]["p10"] for r in ok if r["summary"]["line_angle_deg"] and r["summary"]["line_angle_deg"]["n"] >= 5]
    bows = [max(abs(r["summary"]["line_bow_px"]["p10"]), abs(r["summary"]["line_bow_px"]["p90"])) / r["summary"]["char_h"] for r in ok if r["summary"]["line_bow_px"] and r["summary"]["line_bow_px"]["n"] >= 5]
    keys = ["axis_aligned", "page_rotated", "straight_any_angle", "column_staircase"]
    def pair_fraction(sel, pages=None):
        chosen = ok if pages is None else pages
        pairs = [(p, r["summary"]["char_h"]) for r in chosen for p in r["pairs"] if sel(p)]
        out = dict(pairs=len(pairs), **{f"{k}_not_separable": round(sum(not p["separable"][k] for p, _ in pairs) / len(pairs), 3) if pairs else None for k in keys})
        # Severity: conflicts larger than a quarter of a character-height square (about one small mark).
        for key in ["axis", "rotated"]:
            out[f"{key}_conflict_over_quarter_char2"] = round(sum(p[f"{key}_conflict_px"] > .25 * h * h for p, h in pairs) / len(pairs), 3) if pairs else None
        return out
    skewed = [r for r in ok if abs(r["summary"]["page_angle_deg"]) >= .5]
    return dict(pages=len(rows), pages_analyzed=len(ok), pages_skipped=len(rows) - len(ok), excluded_pages=exclusions,
                abs_page_angle_deg=stats(np.abs(angles)), signed_page_angle_deg=stats(angles),
                pages_abs_angle_at_least_0_5_deg=int(sum(abs(a) >= .5 for a in angles)),
                pages_abs_angle_at_least_1_deg=int(sum(abs(a) >= 1 for a in angles)),
                within_page_line_angle_p10_p90_spread_deg=stats(spreads),
                within_page_abs_bow_p90_char_heights=stats(bows),
                char_h_px=stats([r["summary"]["char_h"] for r in ok]),
                all_line_pairs=pair_fraction(lambda p: True),
                long_line_pairs=pair_fraction(lambda p: p["both_long"]),
                line_pairs_on_pages_abs_angle_at_least_0_5_deg=pair_fraction(lambda p: True, skewed),
                line_pairs_on_pages_abs_angle_below_0_5_deg=pair_fraction(lambda p: True, [r for r in ok if abs(r["summary"]["page_angle_deg"]) < .5]))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output_dir", type=Path)
    parser.add_argument("--books", nargs="*", help="book ids to run (default: all)")
    parser.add_argument("--workers", type=int, default=6)
    args = parser.parse_args()
    if args.output_dir.exists() and any(args.output_dir.iterdir()):
        parser.error("Output directory already exists and is not empty.")
    settings = json.loads((HERE / "books.json").read_text())
    config = json.loads((HERE / "config.json").read_text())
    args.output_dir.mkdir(parents=True, exist_ok=True)
    started = datetime.now(timezone.utc).isoformat()
    overall = dict(started_at_utc=started, render=dict(dpi=settings["render_dpi"], colorspace="gray", library="PyMuPDF", version=fitz.VersionBind),
                   books={}, method_files_sha256=code_hashes() | {"books.json": hashlib.sha256((HERE / "books.json").read_bytes()).hexdigest()})
    for book in settings["books"]:
        if args.books and book["book_id"] not in args.books:
            continue
        jobs = page_jobs(book, settings)
        sheet_every = max(1, len(jobs) // settings["contact_sheet_pages"])
        tasks = [(p, i, settings["render_dpi"], config, 640 if (k % sheet_every == 0 and k // sheet_every < settings["contact_sheet_pages"]) else 0) for k, (p, i) in enumerate(jobs)]
        with ProcessPoolExecutor(max_workers=args.workers) as pool:
            results = list(pool.map(work, tasks))
        rows = [r for r, _ in results]
        thumbs = [(r, t) for r, t in results if t is not None]
        pdfs = sorted({r["pdf"] for r in rows})
        hashes = {p: sha256_file(resolve(p)) for p in pdfs}
        for r in rows:
            r["pdf_sha256"] = hashes[r["pdf"]]
        with open(args.output_dir / f"{book['book_id']}-pages.jsonl", "w") as f:
            for r in rows:
                f.write(json.dumps(r, ensure_ascii=False) + "\n")
        if thumbs:
            label_h = 22
            sheet = Image.new("RGB", (sum(t.width for _, t in thumbs) + 10 * (len(thumbs) - 1), thumbs[0][1].height + label_h), "white")
            x = 0
            d = ImageDraw.Draw(sheet)
            for r, t in thumbs:
                sheet.paste(t, (x, label_h))
                s = r["summary"]
                text = f"p{r['pdf_page']}" + (f"  {s['page_angle_deg']:+.2f} deg" if s.get("status") == "ok" else "  skipped")
                if "path_glob" in book:
                    text = Path(r["pdf"]).stem.replace("_Chapter_", " ch") + text[text.index("  "):] if "  " in text else text
                d.text((x + 2, 2), text, fill=(0, 0, 0), font=analysis.font(15))
                x += t.width + 10
            sheet.save(args.output_dir / f"{book['book_id']}-contact.png")
        summary = book_summary(rows, settings.get("summary_exclusions", {}).get(book["book_id"], {}))
        overall["books"][book["book_id"]] = dict(description=book["description"], caveat=book.get("caveat"), pdfs=hashes,
                                                 page_indices=[r["page_index"] for r in rows] if "path_glob" not in book else None,
                                                 summary=summary)
        print(book["book_id"], json.dumps(summary))
    overall["finished_at_utc"] = datetime.now(timezone.utc).isoformat()
    (args.output_dir / "summary.json").write_text(json.dumps(overall, indent=2, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()
