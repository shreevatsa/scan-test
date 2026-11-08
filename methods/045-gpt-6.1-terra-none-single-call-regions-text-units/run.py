#!/usr/bin/env python3
"""One call for regions, per-line text and the unit tree, then method 043's local step and a page document.

Method 045: the single-call variant of methods 042 + 043 + 044. One request to GPT-6.1 Terra (method 042's settings,
with 32,768 output tokens) sends the raw page and the prompt generated from the type list (prompt.py), and gets back
method 042's regions (box, type, keep, reading order, uncertainty, continuation flags), each with its printed lines'
text, and the unit tree, flows and relations in method 044's form.

Local steps, in order:
1. the boxes are validated and scaled by regions.py (a byte copy of method 042's) and written as a method 042-style
   regions.json;
2. method 043's run.py, unchanged, computes polygons and line pieces from them into local/;
3. each region's lines are aligned with its line pieces: by position when the counts are equal; when there are more
   pieces than lines, the smallest pieces get empty text if each has under a quarter of the median piece's ink
   (detached marks); otherwise no text is put on the pieces and the region's lines are kept in its source;
4. pagedoc.py (a byte copy of method 044's) writes the page document, which schema/book.py checks."""
import argparse
import base64
from datetime import datetime, timezone
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import platform
import statistics
import subprocess
import sys
import time
import urllib.error
import urllib.request
import uuid

from PIL import Image

import pagedoc
import prompt as sprompt
import region_prompt as rp
from costs import usage_breakdown
from regions import validate_and_scale

METHOD_DIR = Path(__file__).resolve().parent
PROJECT_DIR = METHOD_DIR.parent.parent
METHOD_ID = METHOD_DIR.name
ENDPOINT = "https://api.openai.com/v1/responses"
METHOD_FILES = ["run.py", "prompt.py", "prompt-template.txt", "region_prompt.py", "transcription_prompt.py", "regions.py",
                "diagnostics.py", "pagedoc.py", "costs.py", "config.json", "pricing.json", "requirements.txt"]
REGION_FIELDS = ["type", "box_1000", "keep", "reading_order", "uncertain", "continues_from_earlier", "continues_later"]
STRAY_INK_FRACTION = 0.25


def digest(data):
    return hashlib.sha256(data).hexdigest()


def display(path):
    path = Path(path).resolve()
    try:
        return path.relative_to(PROJECT_DIR).as_posix()
    except ValueError:
        return str(path)


def write_json(path, value):
    path.write_text(json.dumps(value, indent=1, ensure_ascii=False) + "\n")


def credential(key_name):
    if os.environ.get("OPENAI_API_KEY"):
        return os.environ["OPENAI_API_KEY"], "OPENAI_API_KEY"
    try:
        result = subprocess.run(["llm", "keys", "get", key_name], capture_output=True, text=True, timeout=10)
    except (OSError, subprocess.TimeoutExpired) as error:
        raise RuntimeError("Set OPENAI_API_KEY or configure an OpenAI key using llm keys.") from error
    if result.returncode or not result.stdout.strip():
        raise RuntimeError("No OpenAI API key is available.")
    return result.stdout.strip(), "llm stored key: " + key_name


def align(lines, pieces):
    """lines: the model's [{text, end}]; pieces: [(line_id, ink_pixels)]. Returns (aligned lines with n, the position
    of each model line among the pieces, or None) and a note."""
    n, m = len(lines), len(pieces)
    if n == m:
        return [dict(L, n=k + 1) for k, L in enumerate(lines)], list(range(m)), "equal"
    if m > n and n > 0:
        median = statistics.median(ink for _, ink in pieces)
        drop = sorted(sorted(range(m), key=lambda k: pieces[k][1])[:m - n])
        if all(pieces[k][1] < STRAY_INK_FRACTION * median for k in drop):
            out, where, it = [], [], iter(lines)
            for k in range(m):
                if k in drop:
                    out.append(dict(text="", end="join", n=k + 1))
                else:
                    out.append(dict(next(it), n=k + 1))
                    where.append(k)
            return out, where, f"stray pieces {[pieces[k][0] for k in drop]} given empty text"
    return [dict(L, n=k + 1) for k, L in enumerate(lines)], None, f"{n} lines for {m} pieces"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    parser.add_argument("--output-dir", type=Path)
    parser.add_argument("--types", type=Path)
    parser.add_argument("--llm-key-name", default="openai")
    parser.add_argument("--check", action="store_true", help="build the request and print a summary, without an API call or writes")
    args = parser.parse_args()
    config = json.loads((METHOD_DIR / "config.json").read_text())
    pricing = json.loads((METHOD_DIR / "pricing.json").read_text())
    if config["model"] != "gpt-6.1-terra":
        parser.error("This method is pinned to gpt-6.1-terra.")
    input_path = args.input.resolve()
    input_id = input_path.stem
    record = json.loads(input_path.with_suffix(".json").read_text())
    types_path = (args.types or PROJECT_DIR / "schema" / "types" / (record["book_id"] + ".json")).resolve()
    if not types_path.exists():
        parser.error("No type list for this book: " + display(types_path))
    types_bytes = types_path.read_bytes()
    tl = json.loads(types_bytes)
    image_bytes = input_path.read_bytes()
    with Image.open(input_path) as im:
        if im.format != "PNG":
            parser.error("This method accepts PNG input.")
        width, height = im.size
    prompt = sprompt.build_prompt(tl)
    schema = sprompt.build_schema(tl)
    payload = {"model": config["model"], "input": [{"role": "user", "content": [
        {"type": "input_text", "text": prompt},
        {"type": "input_image", "image_url": "data:image/png;base64," + base64.b64encode(image_bytes).decode(),
         "detail": config["image_detail"]}]}],
        "reasoning": {"effort": config["reasoning_effort"]},
        "text": {"format": {"type": "json_schema", "name": "page_regions_text_units", "strict": True, "schema": schema}},
        "max_output_tokens": config["max_output_tokens"], "store": config["store"]}
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode()
    if args.check:
        print(json.dumps(dict(input_id=input_id, request_bytes=len(body), prompt_sha256=digest(prompt.encode()),
                              type_list=display(types_path)), indent=1))
        return

    output = (args.output_dir or PROJECT_DIR / "outputs" / input_id / METHOD_ID).resolve()
    if output.exists() and (not output.is_dir() or any(output.iterdir())):
        parser.error("Output location is occupied; choose a fresh --output-dir.")
    key, key_source = credential(args.llm_key_name)
    output.mkdir(parents=True, exist_ok=True)
    (output / "request.json").write_bytes(body)
    (output / "prompt.txt").write_text(prompt)
    write_json(output / "response-schema.json", schema)
    (output / "type-list.json").write_bytes(types_bytes)
    files = {name: digest((METHOD_DIR / name).read_bytes()) for name in METHOD_FILES}
    state = {"status": "requesting", "started_at_utc": datetime.now(timezone.utc).isoformat(), "endpoint": ENDPOINT,
             "credential_source": key_source, "client_request_id": str(uuid.uuid4()), "request_sha256": digest(body),
             "method_id": METHOD_ID, "settings": config, "files_sha256": files,
             "type_list": {"path": display(types_path), "sha256": digest(types_bytes), "book_id": tl["book_id"]},
             "prompt_sha256": digest(prompt.encode())}
    write_json(output / "run.json", state)
    request = urllib.request.Request(ENDPOINT, data=body, method="POST", headers={
        "Authorization": "Bearer " + key, "Content-Type": "application/json", "X-Client-Request-Id": state["client_request_id"]})
    print(f"Submitting one fresh gpt-6.1-terra single-call request for {input_id}.", flush=True)
    api_start = time.perf_counter()
    try:
        try:
            with urllib.request.urlopen(request, timeout=900) as response:
                state["http_status"] = response.status
                state["request_id"] = response.headers.get("x-request-id")
                raw = response.read()
                state["api_wall_seconds"] = time.perf_counter() - api_start
        except urllib.error.HTTPError as error:
            state["http_status"] = error.code
            state["request_id"] = error.headers.get("x-request-id")
            raw = error.read()
            (output / "response.json").write_bytes(raw.replace(key.encode(), b"[REDACTED]"))
            raise RuntimeError("OpenAI API returned HTTP " + str(error.code) + "; response saved.") from error
        (output / "response.json").write_bytes(raw)
        response = json.loads(raw)
        state.update({"response_id": response.get("id"), "returned_model": response.get("model"),
                      "response_status": response.get("status"), "usage": response.get("usage")})
        write_json(output / "run.json", state)
        if response.get("status") != "completed":
            raise RuntimeError("API response status is " + str(response.get("status")))
        text = "".join(c["text"] for item in response.get("output", []) if item.get("type") == "message"
                       for c in item.get("content", []) if c.get("type") == "output_text")
        (output / "model-output.txt").write_text(text)
        parsed = json.loads(text)
        write_json(output / "parsed-response.json", parsed)
        cost = usage_breakdown(response.get("usage") or {}, pricing, response.get("service_tier"))

        # 1. Boxes, as method 042 would have them.
        boxes = {"regions": [{k: r[k] for k in REGION_FIELDS} for r in parsed["regions"]]}
        regions, warnings = validate_and_scale(boxes, width, height, rp.classes(tl), rp.furniture(tl))
        regions_doc = dict(schema_version=1, method=dict(id=METHOD_ID, note="method 042-style boxes from the single call"),
                           input=dict(id=input_id, path=display(input_path), sha256=digest(image_bytes), width=width, height=height),
                           regions=regions, validation_warnings=warnings)
        write_json(output / "regions.json", regions_doc)
        # 2. Method 043's local step, unchanged.
        local_dir = PROJECT_DIR / "methods" / config["local_method_id"]
        t0 = time.perf_counter()
        proc = subprocess.run([sys.executable, str(local_dir / "run.py"), str(input_path), "--base-regions",
                               str(output / "regions.json"), "--output-dir", str(output / "local")],
                              capture_output=True, text=True, cwd=local_dir)
        (output / "local-step.log").write_text(proc.stdout + proc.stderr)
        if proc.returncode:
            raise RuntimeError("Method 043's local step failed; see local-step.log")
        local_seconds = time.perf_counter() - t0
        local_path = output / "local" / "regions.json"
        local_bytes = local_path.read_bytes()
        local = json.loads(local_bytes)
        # 3. Align each region's lines with its line pieces.
        sent, skipped, alignment, by_rid = [], [], {}, {}
        for rec, model in zip(local["regions"], parsed["regions"]):
            rid = f"r{rec['region_id']}"
            pieces = [(L["line_id"], L["ink_pixels"]) for L in rec["lines"] if L.get("polygons")]
            if rec["status"] != "ok" or not rec["polygons"] or not pieces:
                skipped.append(dict(region=rid, type=rec["type"], status=rec["status"], line_pieces=len(pieces),
                                    lines=[L["text"] for L in model["lines"]]))
                continue
            lines, where, note = align(model["lines"], pieces)
            alignment[rid] = dict(model_lines=len(model["lines"]), pieces=len(pieces), result=note)
            by_rid[rid] = dict(type=model["type"], lines=lines, uncertain=model["uncertain"], note=model["note"])
            sent.append(dict(rid=rid, region=rec, line_ids=[p[0] for p in pieces], where=where))
        relations = []
        for rel in parsed.get("relations", []):
            s = next((x for x in sent if x["rid"] == rel["region"]), None)
            if s and s["where"] is not None and 1 <= rel["line"] <= len(s["where"]):
                rel = dict(rel, line=s["where"][rel["line"] - 1] + 1)
            relations.append(rel)
        as044 = dict(regions=by_rid, units=parsed["units"], flows=parsed["flows"], relations=relations)
        # 4. The page document.
        source = dict(method=METHOD_ID, regions_method=METHOD_ID + " (local step: " + config["local_method_id"] + ")",
                      regions_path=display(local_path), regions_sha256=digest(local_bytes), type_list_sha256=digest(types_bytes),
                      response_id=response.get("id"), model=response.get("model"), created_at_utc=state["started_at_utc"])
        doc, problems = pagedoc.build(input_id, record, tl, sent, as044, source)
        errors, check_warnings = pagedoc.check(doc, tl)
        (output / "page.json").write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")) + "\n")
        (output / "transcript.txt").write_text(pagedoc.transcript(doc, tl))
        aligned = sum(1 for a in alignment.values() if a["result"] == "equal" or a["result"].startswith("stray"))
        result = dict(
            schema_version=1, method=dict(id=METHOD_ID, name=config["name"], settings=config, files_sha256=files),
            input=dict(id=input_id, path=display(input_path), sha256=digest(image_bytes)), type_list=state["type_list"],
            api=dict(endpoint=ENDPOINT, returned_model=response.get("model"), response_id=response.get("id"),
                     request_id=state.get("request_id"), api_wall_seconds=state["api_wall_seconds"], usage=response.get("usage"),
                     tokens_and_cost=cost, request_sha256=digest(body), response_sha256=digest(raw)),
            box_validation_warnings=warnings, local_step=dict(method=config["local_method_id"], seconds=round(local_seconds, 2),
                                                              diagnostics=local["diagnostics"]),
            alignment=alignment, regions_aligned=aligned, regions_with_pieces=len(alignment), regions_skipped=skipped,
            problems=problems, check=dict(errors=errors, warnings=check_warnings, valid=not errors),
            counts=dict(regions=len(doc["page"]["regions"]), units=len(doc["units"]), relations=len(doc["relations"]),
                        line_pieces=sum(len(r["lines"]) for r in doc["page"]["regions"])),
            environment=dict(python=platform.python_version(), packages={n: importlib.metadata.version(n) for n in ["numpy", "Pillow"]}))
        write_json(output / "result.json", result)
        state["status"] = "completed"
        write_json(output / "run.json", state)
        print(json.dumps(dict(output=display(output), valid=not errors, errors=errors[:10], problems=problems[:10],
                              aligned=f"{aligned}/{len(alignment)}", skipped=len(skipped), counts=result["counts"],
                              api_wall_seconds=round(state["api_wall_seconds"], 1),
                              cost=cost.get("estimated_paid_tier_total_cost_usd"), usage=response.get("usage")), indent=1, ensure_ascii=False))
    except Exception as error:
        state["status"] = "failed"
        state.setdefault("api_wall_seconds", time.perf_counter() - api_start)
        state["error"] = {"type": type(error).__name__, "message": str(error).replace(key, "[REDACTED]")}
        write_json(output / "run.json", state)
        raise SystemExit(state["error"]["message"])


if __name__ == "__main__":
    main()
