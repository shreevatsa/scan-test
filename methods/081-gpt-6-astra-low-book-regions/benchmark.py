#!/usr/bin/env python3
"""Compare the six new model finders on nine public passage references. At most two calls at once."""
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
MODELS = [
    ("astra-regions", "081-gpt-6-astra-low-book-regions"),
    ("sol-regions", "082-gpt-6.1-sol-low-book-regions"),
    ("argon-low-regions", "083-gemini-4-argon-low-book-regions"),
    ("argon-high-regions", "084-gemini-4-argon-high-book-regions"),
    ("flash-regions", "085-gemini-3.8-flash-low-book-regions"),
    ("flash-lite-regions", "086-gemini-3.5-flash-lite-book-regions"),
]


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
    survey = Path("outputs/surveys/081-gpt-6-astra-low-book-regions") / args.run
    if survey.exists():
        parser.error(f"Survey directory is occupied: {survey}")
    if args.check:
        print(f"{len(tasks)} planned calls across {len(models)} models and {len(fixtures)} pages. Spend threshold ${args.limit:.2f}.")
        sys.exit(0)
    environment = dict(os.environ, OPENAI_API_KEY=key("openai"), GEMINI_API_KEY=key("gemini"))
    survey.mkdir(parents=True)
    reports, spend = [], 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        # A full worst-case Astra output costs under $1 at these page sizes. Reserve $2 before launching a pair.
        for offset in range(0, len(tasks), 2):
            if spend + 2 > args.limit or any(report["cost_usd"] is None for report in reports):
                break
            pending = [executor.submit(execute, *task, args.run, environment) for task in tasks[offset:offset + 2]]
            for future in concurrent.futures.as_completed(pending):
                report = future.result()
                reports.append(report)
                if report["cost_usd"] is not None:
                    spend += report["cost_usd"]
                (survey / "summary.json").write_text(json.dumps({"reports": reports, "known_cost_usd": spend, "planned": len(tasks)}, indent=1) + "\n")
                print(report["page"], report["finder"], report["status"], report["cost_usd"], flush=True)
    print(f"Completed {len(reports)}/{len(tasks)} attempts. Known cost ${spend:.4f}", flush=True)
