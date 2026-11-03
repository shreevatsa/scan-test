#!/usr/bin/env python3
"""Summarize saved layout diagnostics; no inference, network, or third-party imports."""
import argparse
import csv
import hashlib
import io
import json
import math
from pathlib import Path
import statistics
import struct
import zipfile

ROOT = Path(__file__).resolve().parent
METHODS = {
    "geometry": "Custom geometry",
    "small": "PP-DocLayout-S (0.30)",
    "large": "PP-DocLayoutV3 (0.30)",
    "large_default05": "PP-DocLayoutV3 (0.50)",
    "hybrid": "V3 + pixel recovery",
}
STRATA = {
    "Opening / contents": [1, 2, 3],
    "Sanskrit verse / commentary": [9, 17, 25, 33, 49, 57, 65, 81, 97, 113],
    "English translation": [114, 121, 137, 145, 161],
    "Notes / final page": [169, 177, 193, 209, 233, 252],
}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def metrics_for(record, method):
    if method == "large_default05":
        return record["large_default05_metrics"], record["large_default05_regions"]
    return record["metrics"][method], record["regions"][method]


def summarize(records, method):
    metrics = [metrics_for(record, method)[0] for record in records]
    ink = sum(m["ink_pixels"] for m in metrics)
    missed = sum(m["uncovered_ink_pixels"] for m in metrics)
    return {
        "pages": len(records),
        "regions": sum(m["regions"] for m in metrics),
        "ink_pixels": ink,
        "uncovered_ink_pixels": missed,
        "pooled_ink_coverage": 1 - missed / ink,
        "mean_page_ink_coverage": statistics.mean(m["ink_coverage"] for m in metrics),
        "minimum_page_ink_coverage": min(m["ink_coverage"] for m in metrics),
    }


def table(headers, rows):
    return "\n".join(
        ["| " + " | ".join(headers) + " |", "| " + " | ".join("---" for _ in headers) + " |"]
        + ["| " + " | ".join(str(value) for value in row) + " |" for row in rows]
    )


def replace_table(document, name, content):
    begin = "<!-- BEGIN GENERATED " + name + " -->"
    end = "<!-- END GENERATED " + name + " -->"
    require(document.count(begin) == document.count(end) == 1, "Missing or repeated table markers: " + name)
    before, rest = document.split(begin)
    _, after = rest.split(end)
    return before + begin + "\n\n" + content + "\n\n" + end + after


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Verify outputs without writing")
    args = parser.parse_args()
    raw = (ROOT / "input/regions.json").read_bytes()
    notes_raw = (ROOT / "input/review-notes.json").read_bytes()
    data = json.loads(raw)
    source = (ROOT / "input" / data["source"]).read_bytes()
    require(digest(source) == data["source_sha256"], "Source PDF checksum mismatch")
    with zipfile.ZipFile(ROOT / "input/Kale-region-experiment.zip") as archive:
        prefix = "Kale-region-experiment/"
        require(archive.read(prefix + "results/regions.json") == raw, "Archive detections differ")
        require(archive.read(prefix + "results/review-notes.json") == notes_raw, "Archive notes differ")
        manifest = json.loads(archive.read(prefix + "models.json"))
        preview = archive.read(prefix + "Kale-region-preview.png")
    records = data["records"]
    pages = [record["pdf_page"] for record in records]
    require(len(pages) == len(set(pages)), "Repeated input pages")
    require(sorted(pages) == sorted(p for group in STRATA.values() for p in group), "Unexpected page set")
    rows = []
    for record in records:
        denominators = []
        for method in METHODS:
            metric, regions = metrics_for(record, method)
            require(metric["regions"] == len(regions), "Region count mismatch")
            ink = metric["ink_pixels"]
            missed = metric["uncovered_ink_pixels"]
            require(0 <= missed <= ink and ink > 0, "Invalid foreground counts")
            require(math.isclose(metric["ink_coverage"], 1 - missed / ink, abs_tol=1e-12), "Coverage mismatch")
            denominators.append(ink)
            rows.append({
                "pdf_page": record["pdf_page"],
                "method": method,
                "region_count": len(regions),
                "ink_pixels": ink,
                "uncovered_ink_pixels": missed,
                "ink_coverage": metric["ink_coverage"],
                "partially_covered_components": metric["partially_covered_components"],
            })
        require(len(set(denominators)) == 1, "Methods use different measured-ink counts")

    summaries = {key: summarize(records, key) for key in METHODS}
    groups = {
        label: {
            "pdf_pages": members,
            "methods": {key: summarize([r for r in records if r["pdf_page"] in members], key) for key in METHODS},
        }
        for label, members in STRATA.items()
    }
    timings = {}
    for stage in records[0]["timings_seconds"]:
        values = [r["timings_seconds"][stage] for r in records]
        timings[stage] = {
            "mean_seconds": statistics.mean(values),
            "median_seconds": statistics.median(values),
            "minimum_seconds": min(values),
            "maximum_seconds": max(values),
        }
    pilot_path = ROOT / "output/Kale-vision-pilot-metrics.json"
    pilot = json.loads(pilot_path.read_bytes())
    require(pilot["source_sha256"] == data["source_sha256"], "Pilot source differs")
    for page in pilot["pages"]:
        record = next(r for r in records if r["pdf_page"] == page["pdf_page"])
        v3 = record["metrics"]["large"]
        require(page["v3_region_count"] == v3["regions"], "Pilot V3 count differs")
        require(page["v3_diagnostics"]["ink_pixels"] == v3["ink_pixels"], "Pilot mask differs")
        require(math.isclose(page["v3_diagnostics"]["covered_fraction"], v3["ink_coverage"], abs_tol=1e-12), "Pilot V3 coverage differs")

    image_metadata = []
    for page in pilot["pages"]:
        path = ROOT / "pages" / ("page-%03d.png" % page["pdf_page"])
        image = path.read_bytes()
        require(image[:8] == b"\x89PNG\r\n\x1a\n", "Expected source PNG")
        width, height = struct.unpack(">II", image[16:24])
        image_metadata.append({
            "pdf_page": page["pdf_page"], "path": str(path.relative_to(ROOT)),
            "width": width, "height": height, "sha256": digest(image),
        })
    summary = {
        "kind": "saved foreground diagnostics; not region accuracy",
        "source": {key: value for key, value in data.items() if key != "records"},
        "detections_sha256": digest(raw),
        "review_notes_sha256": digest(notes_raw),
        "archive_sha256": digest((ROOT / "input/Kale-region-experiment.zip").read_bytes()),
        "aggregation": "pooled = 1 - sum(uncovered_ink_pixels) / sum(ink_pixels)",
        "pdf_pages": pages,
        "methods": summaries,
        "descriptive_strata": groups,
        "historical_stage_timings": timings,
        "timing_caveat": "Not end-to-end. Threshold refinement did not re-time hybrid cleanup; do not attribute its stored timing to final boxes.",
        "model_download_manifest": manifest,
        "interactive_pilot": pilot,
        "interactive_pilot_metrics_sha256": digest(pilot_path.read_bytes()),
        "pilot_input_images": image_metadata,
    }
    csv_output = io.StringIO(newline="")
    writer = csv.DictWriter(csv_output, fieldnames=list(rows[0]), lineterminator="\n")
    writer.writeheader()
    writer.writerows(rows)
    document_path = ROOT / "COMPARISON.md"
    document = document_path.read_text()
    baseline_table = table(
        ["Method", "Pooled ink covered", "Mean page", "Worst page", "Total boxes"],
        [[METHODS[key], "%.2f%%" % (m["pooled_ink_coverage"] * 100),
          "%.2f%%" % (m["mean_page_ink_coverage"] * 100),
          "%.2f%%" % (m["minimum_page_ink_coverage"] * 100), m["regions"]]
         for key, m in summaries.items()],
    )
    strata_table = table(
        ["Page group", "Pages", "Geometry", "S (0.30)", "V3 (0.30)", "V3 + recovery"],
        [[label, len(group["pdf_pages"])] +
         ["%.2f%%" % (group["methods"][key]["pooled_ink_coverage"] * 100)
          for key in ["geometry", "small", "large", "hybrid"]]
         for label, group in groups.items()],
    )
    pilot_table = table(
        ["PDF page", "V3 boxes", "Pilot boxes", "Proposed verse blocks", "V3 ink covered", "Pilot ink covered"],
        [[p["pdf_page"], p["v3_region_count"], p["vision_region_count"], p["whole_verse_blocks"],
          "%.2f%%" % (p["v3_diagnostics"]["covered_fraction"] * 100),
          "%.2f%%" % (p["vision_diagnostics"]["covered_fraction"] * 100)]
         for p in pilot["pages"]],
    )
    for name, content in [("BASELINES", baseline_table), ("STRATA", strata_table), ("PILOT", pilot_table)]:
        document = replace_table(document, name, content)
    outputs = {
        ROOT / "output/layout-baseline-summary.json": (json.dumps(summary, indent=2, ensure_ascii=False) + "\n").encode(),
        ROOT / "output/layout-baseline-pages.csv": csv_output.getvalue().encode(),
        ROOT / "output/Kale-detector-preview.png": preview,
        document_path: document.encode(),
    }
    stale = []
    for path, content in outputs.items():
        if args.check:
            if not path.exists() or path.read_bytes() != content:
                stale.append(str(path.relative_to(ROOT)))
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(content)
    if stale:
        parser.exit(1, "Outdated outputs: " + ", ".join(stale) + "\n")
    print(("Verified" if args.check else "Updated") + ": 24 pages, 5 baseline variants, 120 CSV rows, 3 pilot pages, source hashes and comparison tables.")


if __name__ == "__main__":
    main()
