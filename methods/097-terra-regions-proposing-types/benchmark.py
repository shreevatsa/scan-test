#!/usr/bin/env python3
"""Method 097 on the nine public passage references, compared with method 042 under the same local step (094). At most two calls at once.
Derived from method 081's benchmark.py."""
import argparse
import concurrent.futures
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
MODELS = [("terra-proposals", "097-terra-regions-proposing-types")]
BASELINE = "094-illumination-flattened-ink"  # saved method 042 regions with the current local step, regression-001


def key(provider):
    variable = "OPENAI_API_KEY" if provider == "openai" else "GEMINI_API_KEY"
    value = os.environ.get(variable)
    if not value:
        result = subprocess.run(["llm", "keys", "get", provider], text=True, capture_output=True, check=True)
        value = result.stdout.strip()
    if not value:
        raise RuntimeError(f"No configured {provider} credential")
    return value


def execute(fixture, profile, method, run_name, environment):
    pid = fixture["page"]
    output = Path("outputs") / pid / method / run_name
    output.mkdir(parents=True, exist_ok=True)
    if any(output.iterdir()):
        raise RuntimeError(f"Output directory is occupied: {output}")
    with tempfile.TemporaryDirectory(prefix="region-benchmark-") as temporary:
        gray = Path(temporary) / "page.gray"
        gray.write_bytes(Image.open(Path("inputs") / f"{pid}.png").convert("L").tobytes())
        process = subprocess.run(["node", str(HERE / "run.mjs"), pid, profile, str(output), str(gray)],
                                 env=environment, text=True, capture_output=True)
    try:
        report = json.loads(process.stdout)
    except json.JSONDecodeError:
        # Transport and runtime errors are retained without dumping environment or credentials.
        report = {"page": pid, "finder": profile, "status": "failed", "cost_usd": None, "error": "Runner failed before reporting a saved call"}
        (output / "failure.json").write_text(json.dumps(report, indent=1) + "\n")
    if report["status"] == "completed":
        evaluation = output / "reference-evaluation"
        subprocess.run([sys.executable, "methods/043-gpt-6.1-terra-none-book-types-continuations-band-chained-lines/evaluate.py",
                        f"inputs/{pid}.png", fixture["reference"], str(evaluation), "--result", f"{method}={output / 'regions.json'}"],
                       check=True, stdout=subprocess.DEVNULL)
        report["totals"] = json.loads((evaluation / "evaluation.json").read_text())["results"][0]["totals"]
        report["result"] = str(output / "regions.json")
    return report


def types_of(path):
    counts = {}
    for region in json.loads(Path(path).read_text())["regions"]:
        name = region["type"] + (f" (proposed {region['proposed_type']})" if region.get("proposed_type") else "")
        counts[name] = counts.get(name, 0) + 1
    return counts


def compare(survey, reports, spend, planned):
    """Region-level agreement with the references and region types, for 097 and for 042 (method 094's regression-001)."""
    pages = []
    for report in sorted(reports, key=lambda value: value["page"]):
        pid = report["page"]
        base = Path("outputs") / pid / BASELINE / "regression-001"
        baseline = json.loads((base / "reference-evaluation" / "evaluation.json").read_text())["results"][0]["totals"]
        entry = {"page": pid, "status": report["status"], "cost_usd": report["cost_usd"], "totals_042": baseline, "types_042": types_of(base / "regions.json")}
        if report["status"] == "completed":
            entry.update(totals_097=report["totals"], types_097=types_of(report["result"]), proposals=report["proposals"], plain_other_097=report["other_regions"])
        pages.append(entry)
    (survey / "comparison.json").write_text(json.dumps({"method": "097-terra-regions-proposing-types", "baseline": "042 regions, 094 local step (regression-001)",
                                                        "known_cost_usd": spend, "planned": planned, "pages": pages}, indent=1, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run", default="reference-001")
    parser.add_argument("--limit", type=float, default=10)
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--models", nargs="+", choices=[profile for profile, method in MODELS])
    parser.add_argument("--pages", nargs="+", help="input page IDs; defaults to all nine references")
    args = parser.parse_args()
    os.chdir(ROOT)
    fixtures = json.loads(Path("outputs/surveys/063-fragment-band-lines/regression-001/summary.json").read_text())["pages"]
    if args.pages:
        known = {fixture["page"] for fixture in fixtures}
        if set(args.pages) - known:
            parser.error("Choose page IDs from the nine public region references")
        fixtures = [fixture for fixture in fixtures if fixture["page"] in args.pages]
    models = [(profile, method) for profile, method in MODELS if not args.models or profile in args.models]
    tasks = [(fixture, profile, method) for profile, method in models for fixture in fixtures]
    survey = Path("outputs/surveys/097-terra-regions-proposing-types") / args.run
    if survey.exists():
        parser.error(f"Survey directory is occupied: {survey}")
    if args.check:
        print(f"{len(tasks)} planned calls across {len(models)} models and {len(fixtures)} pages. Spend threshold ${args.limit:.2f}.")
        sys.exit(0)
    environment = dict(os.environ, OPENAI_API_KEY=key("openai"))
    survey.mkdir(parents=True)
    reports, spend = [], 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        # A Terra region call costs about a cent. Reserve $0.50 before launching a pair.
        for offset in range(0, len(tasks), 2):
            if spend + 0.5 > args.limit or any(report["cost_usd"] is None for report in reports):
                break
            pending = [executor.submit(execute, *task, args.run, environment) for task in tasks[offset:offset + 2]]
            for future in concurrent.futures.as_completed(pending):
                report = future.result()
                reports.append(report)
                if report["cost_usd"] is not None:
                    spend += report["cost_usd"]
                (survey / "summary.json").write_text(json.dumps({"reports": reports, "known_cost_usd": spend, "planned": len(tasks)}, indent=1) + "\n")
                print(report["page"], report["finder"], report["status"], report["cost_usd"], flush=True)
    compare(survey, reports, spend, len(tasks))
    print(f"Completed {len(reports)}/{len(tasks)} attempts. Known cost ${spend:.4f}", flush=True)
