#!/usr/bin/env python3
"""Method 101: method 097's region request sent to Gemini 4 Hydrogen (Vertex AI) on the nine public passage references,
scored with method 043's evaluator and compared with 097 (reference-001) and 042 (method 094's regression-001).
Derived from methods/097-terra-regions-proposing-types/benchmark.py. One call at a time; a failed call is retried at most twice.
Needs TOKEN (gcloud auth print-access-token) and PROJECT in the environment; neither is written to disk."""
import argparse
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
METHOD = "101-hydrogen-low-regions"
BASELINE_042 = "094-illumination-flattened-ink"  # saved 042 regions with the current local step, regression-001
BASELINE_097 = Path("outputs/surveys/097-terra-regions-proposing-types/reference-001/comparison.json")
ESTIMATE = 0.08  # reserve per call before sending; a Hydrogen region call is expected to cost a few cents


def execute(fixture, output, environment):
    pid = fixture["page"]
    output.mkdir(parents=True, exist_ok=False)
    with tempfile.TemporaryDirectory(prefix="region-benchmark-") as temporary:
        gray = Path(temporary) / "page.gray"
        gray.write_bytes(Image.open(Path("inputs") / f"{pid}.png").convert("L").tobytes())
        process = subprocess.run(["node", str(HERE / "run.mjs"), pid, str(output), str(gray)], env=environment, text=True, capture_output=True)
    try:
        report = json.loads(process.stdout)
    except json.JSONDecodeError:
        report = {"page": pid, "status": "failed", "cost_usd": None, "error": "Runner failed before reporting: " + process.stderr[-500:]}
        (output / "failure.json").write_text(json.dumps(report, indent=1) + "\n")
    if report["status"] == "completed":
        evaluation = output / "reference-evaluation"
        subprocess.run([sys.executable, "methods/043-gpt-6.1-terra-none-book-types-continuations-band-chained-lines/evaluate.py",
                        f"inputs/{pid}.png", fixture["reference"], str(evaluation), "--result", f"{METHOD}={output / 'regions.json'}"],
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


def compare(survey, finals, attempts, spend, thinking, box_order, replay):
    earlier = {page["page"]: page for page in json.loads(BASELINE_097.read_text())["pages"]}
    pages = []
    for report in sorted(finals, key=lambda value: value["page"]):
        pid = report["page"]
        base = Path("outputs") / pid / BASELINE_042 / "regression-001"
        entry = {"page": pid, "status": report["status"], "attempts": sum(1 for a in attempts if a["page"] == pid),
                 "cost_usd": sum(a["cost_usd"] or 0 for a in attempts if a["page"] == pid), "seconds": report.get("seconds"),
                 "finish_reason": report.get("finish_reason"), "usage": report.get("usage"),
                 "totals_042": json.loads((base / "reference-evaluation" / "evaluation.json").read_text())["results"][0]["totals"],
                 "types_042": types_of(base / "regions.json"),
                 "totals_097": earlier[pid].get("totals_097"), "types_097": earlier[pid].get("types_097"), "cost_usd_097": earlier[pid]["cost_usd"]}
        if report["status"] == "completed":
            entry.update(totals_101=report["totals"], types_101=types_of(report["result"]), proposals=report["proposals"],
                         plain_other_101=report["other_regions"], warnings=report.get("warnings"))
        else:
            entry["error"] = report.get("error")
        pages.append(entry)
    (survey / "comparison.json").write_text(json.dumps({"method": METHOD, "model": "gemini-4-hydrogen", "thinking": thinking, "box_order": box_order, "replayed_from": replay,
        "baselines": {"097": str(BASELINE_097), "042": "042 regions, 094 local step (regression-001)"},
        "known_cost_usd": spend, "pages": pages}, indent=1, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run", default="low-001")
    parser.add_argument("--thinking", default="LOW", choices=["LOW", "MINIMAL", "MEDIUM", "HIGH"])
    parser.add_argument("--limit", type=float, default=1.0, help="stop before a call that could take this run's spend past the limit")
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--pages", nargs="+")
    parser.add_argument("--box-order", default="xyxy", choices=["xyxy", "yxyx"], help="yxyx reads the answer's boxes as [y1,x1,y2,x2]")
    parser.add_argument("--replay", help="score the saved answers of this earlier run instead of calling (no cost)")
    args = parser.parse_args()
    os.chdir(ROOT)
    fixtures = json.loads(Path("outputs/surveys/063-fragment-band-lines/regression-001/summary.json").read_text())["pages"]
    if args.pages:
        fixtures = [fixture for fixture in fixtures if fixture["page"] in args.pages]
    survey = Path("outputs/surveys") / METHOD / args.run
    if survey.exists():
        parser.error(f"Survey directory is occupied: {survey}")
    if args.check:
        print(f"{len(fixtures)} planned calls at thinking {args.thinking}. Spend limit ${args.limit:.2f}.")
        sys.exit(0)
    if not args.replay and (not os.environ.get("TOKEN") or not os.environ.get("PROJECT")):
        parser.error("Set TOKEN and PROJECT")
    environment = dict(os.environ, THINKING=args.thinking, BOX_ORDER=args.box_order)
    saved = {}
    if args.replay:
        for report in json.loads((Path("outputs/surveys") / METHOD / args.replay / "summary.json").read_text())["attempts"]:
            call = Path("outputs/surveys") / METHOD / args.replay / report["page"] / f"attempt-{report['attempt']}" / "vertex-call.json"
            if call.exists() and json.loads(call.read_text()).get("text"):
                saved[report["page"]] = str(call)  # the last attempt with an answer
        fixtures = [fixture for fixture in fixtures if fixture["page"] in saved]
    survey.mkdir(parents=True)
    attempts, finals, spend = [], [], 0.0
    for fixture in fixtures:
        for attempt in range(1, 4):  # first call and at most two retries
            if spend + ESTIMATE > args.limit:
                print(f"Stopping: ${spend:.4f} spent, limit ${args.limit:.2f}", flush=True)
                break
            if args.replay:
                environment["REPLAY"] = saved[fixture["page"]]
            report = execute(fixture, survey / fixture["page"] / f"attempt-{attempt}", environment)
            report["attempt"] = attempt
            attempts.append(report)
            spend += report["cost_usd"] or 0
            (survey / "summary.json").write_text(json.dumps({"attempts": attempts, "known_cost_usd": spend}, indent=1) + "\n")
            print(report["page"], attempt, report["status"], report["cost_usd"], report.get("seconds"), report.get("finish_reason"),
                  report.get("totals", {}).get("other_passages_ink_included"), report.get("error", "")[:200], flush=True)
            if report["status"] == "completed" or args.replay:
                break
        if attempts and attempts[-1]["page"] == fixture["page"]:
            finals.append(attempts[-1])
        if spend + ESTIMATE > args.limit:
            break
    compare(survey, finals, attempts, spend, args.thinking, args.box_order, args.replay)
    print(f"Completed {sum(r['status'] == 'completed' for r in finals)}/{len(fixtures)} pages, {len(attempts)} calls. Known cost ${spend:.4f}", flush=True)
