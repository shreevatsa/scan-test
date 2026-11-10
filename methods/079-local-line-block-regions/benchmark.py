#!/usr/bin/env python3
"""Run and score the nine public region references. Output directories are immutable."""
import argparse
import json
import subprocess
import sys
from pathlib import Path

from run import HERE, ROOT, run

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--run", default="reference-001")
parser.add_argument("--tesseract-results", type=Path)
args = parser.parse_args()
method = "080-tesseract-paragraph-regions" if args.tesseract_results else HERE.name
survey = ROOT / "outputs/surveys" / method / args.run
if survey.exists():
    parser.error(f"Output directory already exists: {survey}")
fixtures = json.loads((ROOT / "outputs/surveys/063-fragment-band-lines/regression-001/summary.json").read_text())["pages"]
recognized = json.loads(args.tesseract_results.read_text()) if args.tesseract_results else {}
summary = {"method": method, "api_calls": 0, "pages": []}
for fixture in fixtures:
    pid = fixture["page"]
    metadata = json.loads((ROOT / "inputs" / f"{pid}.json").read_text())
    image = Path("inputs") / f"{pid}.png"
    types = Path("schema/types") / f"{metadata['book_id']}.json"
    output = Path("outputs") / pid / method / args.run
    block_path = None
    if args.tesseract_results:
        raw_dir = survey / "recognition"
        raw_dir.mkdir(parents=True, exist_ok=True)
        raw = recognized[pid]
        (raw_dir / f"{pid}.json").write_text(json.dumps(raw, ensure_ascii=False, indent=1) + "\n")
        block_path = raw_dir / f"{pid}.blocks.json"
        block_path.write_text(json.dumps(raw["blocks"], ensure_ascii=False, indent=1) + "\n")
    result = run(image, types, output, block_path, method)
    if args.tesseract_results:
        result["recognition_seconds"] = recognized[pid]["seconds"]
        result["seconds"] += result["recognition_seconds"]
        (output / "regions.json").write_text(json.dumps(result, ensure_ascii=False, indent=1) + "\n")
    evaluation_dir = output / "reference-evaluation"
    subprocess.run([sys.executable, "methods/043-gpt-6.1-terra-none-book-types-continuations-band-chained-lines/evaluate.py",
                    str(image), fixture["reference"], str(evaluation_dir), "--result", f"{method}={output / 'regions.json'}"], check=True, stdout=subprocess.DEVNULL)
    evaluation = json.loads((evaluation_dir / "evaluation.json").read_text())["results"][0]
    summary["pages"].append({"page": pid, "result": str(output / "regions.json"), "reference": fixture["reference"],
                             "regions": len(result["regions"]), "untyped": sum(region["type"] == "other" for region in result["regions"]),
                             "seconds": result["seconds"], "totals": evaluation["totals"]})
    print(pid, len(result["regions"]), evaluation["totals"], flush=True)
survey.mkdir(parents=True, exist_ok=True)
(survey / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=1) + "\n")
