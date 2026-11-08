#!/usr/bin/env python3
"""Transcribe one page on method 043's regions with GPT-6.1 Terra, and build the page's unit tree.

Method 044: a second call after the region step (method 042 + 043). The request holds the prompt generated from the
book's type list (prompt.py), the page with every region outlined and labeled (cutouts.overview), and for each region
its id, type and line count followed by a cut-out of it with its line pieces numbered (cutouts.cutout). The strict
response schema asks for exactly one entry per region with one line per line piece, a flat list of units, the flows
and, for books with relation types, relations. pagedoc.py turns the response into a page document of the draft book
schema, which schema/book.py then checks. Request settings and accounting are those of method 042."""
import argparse
import base64
from datetime import datetime, timezone
import hashlib
import importlib.metadata
import io
import json
import os
from pathlib import Path
import platform
import subprocess
import time
import urllib.error
import urllib.request
import uuid

import numpy as np
from PIL import Image

import cutouts
import pagedoc
import prompt as tprompt
from costs import usage_breakdown

METHOD_DIR = Path(__file__).resolve().parent
PROJECT_DIR = METHOD_DIR.parent.parent
METHOD_ID = METHOD_DIR.name
ENDPOINT = "https://api.openai.com/v1/responses"
METHOD_FILES = ["run.py", "prompt.py", "prompt-template.txt", "cutouts.py", "pagedoc.py", "costs.py", "config.json",
                "pricing.json", "requirements.txt"]


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


def png_bytes(img):
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


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


def select_regions(base):
    """Regions to transcribe, in reading order, then the unordered ones (furniture) by id; and those left out."""
    sent, skipped = [], []
    for r in base["regions"]:
        pieces = cutouts.line_pieces(r)
        if r["status"] != "ok" or not r["polygons"] or not pieces:
            skipped.append(dict(region_id=r["region_id"], type=r["type"], status=r["status"], line_pieces=len(pieces)))
            continue
        sent.append(dict(rid=f"r{r['region_id']}", region=r, line_ids=[p[0] for p in pieces]))
    sent.sort(key=lambda s: (s["region"]["reading_order"] is None, s["region"]["reading_order"] or 0, s["region"]["region_id"]))
    return sent, skipped


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    parser.add_argument("--base-regions", type=Path, help="method 043 regions.json; default outputs/<input>/043…/regions.json")
    parser.add_argument("--output-dir", type=Path)
    parser.add_argument("--types", type=Path, help="type list; default schema/types/<book_id>.json")
    parser.add_argument("--llm-key-name", default="openai")
    parser.add_argument("--check", action="store_true", help="build the request and print a summary, without an API call or writes")
    parser.add_argument("--preview-dir", type=Path, help="with --check, also write the request's images here")
    args = parser.parse_args()
    config = json.loads((METHOD_DIR / "config.json").read_text())
    pricing = json.loads((METHOD_DIR / "pricing.json").read_text())
    if config["model"] != "gpt-6.1-terra":
        parser.error("This method is pinned to gpt-6.1-terra.")
    input_path = args.input.resolve()
    input_id = input_path.stem
    record_path = input_path.with_suffix(".json")
    if not record_path.exists():
        parser.error("No input record beside the image.")
    record = json.loads(record_path.read_text())
    types_path = (args.types or PROJECT_DIR / "schema" / "types" / (record["book_id"] + ".json")).resolve()
    if not types_path.exists():
        parser.error("No type list for this book: " + display(types_path))
    types_bytes = types_path.read_bytes()
    tl = json.loads(types_bytes)
    base_path = (args.base_regions or PROJECT_DIR / "outputs" / input_id / config["base_method_id"] / "regions.json").resolve()
    if not base_path.exists():
        parser.error("Source regions not found: " + display(base_path))
    base_bytes = base_path.read_bytes()
    base = json.loads(base_bytes)
    if base["method"]["id"] != config["base_method_id"]:
        parser.error("Source regions are not from method " + config["base_method_id"])
    image_bytes = input_path.read_bytes()
    if digest(image_bytes) != base["input"]["sha256"]:
        parser.error("The input image is not the one the source regions were computed on.")
    rgb = np.asarray(Image.open(input_path).convert("RGB"))
    char_h = base["line_analysis"]["char_h"]

    sent, skipped = select_regions(base)
    view = cutouts.overview(rgb, [(s["rid"], s["region"]) for s in sent], char_h, config)
    view_png = png_bytes(view)
    images, content = [], []
    prompt = tprompt.build_prompt(tl)
    schema = tprompt.build_schema(tl, [(s["rid"], len(s["line_ids"])) for s in sent])
    content.append({"type": "input_text", "text": prompt})
    content.append({"type": "input_text", "text": "The whole page, with the regions outlined:"})
    content.append({"type": "input_image", "image_url": "data:image/png;base64," + base64.b64encode(view_png).decode(),
                    "detail": config["image_detail"]})
    for s in sent:
        img, info = cutouts.cutout(rgb, s["region"], char_h, config)
        data = png_bytes(img)
        s["cutout"] = dict(info, sha256=digest(data), size=list(img.size))
        images.append((s["rid"], data))
        content.append({"type": "input_text", "text": tprompt.region_caption(s["rid"], s["region"]["type"], len(s["line_ids"]))})
        content.append({"type": "input_image", "image_url": "data:image/png;base64," + base64.b64encode(data).decode(),
                        "detail": config["image_detail"]})
    payload = {"model": config["model"], "input": [{"role": "user", "content": content}],
               "reasoning": {"effort": config["reasoning_effort"]},
               "text": {"format": {"type": "json_schema", "name": "page_transcription", "strict": True, "schema": schema}},
               "max_output_tokens": config["max_output_tokens"], "store": config["store"]}
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode()
    if args.check:
        if args.preview_dir:
            args.preview_dir.mkdir(parents=True, exist_ok=True)
            (args.preview_dir / "overview.png").write_bytes(view_png)
            for rid, data in images:
                (args.preview_dir / f"{rid}.png").write_bytes(data)
            (args.preview_dir / "prompt.txt").write_text(prompt)
            write_json(args.preview_dir / "response-schema.json", schema)
        print(json.dumps(dict(input_id=input_id, regions_sent=len(sent), skipped=skipped,
                              line_pieces=sum(len(s["line_ids"]) for s in sent), request_bytes=len(body),
                              prompt_sha256=digest(prompt.encode()), type_list=display(types_path)), indent=1))
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
    (output / "overview.png").write_bytes(view_png)
    (output / "cutouts").mkdir()
    for rid, data in images:
        (output / "cutouts" / f"{rid}.png").write_bytes(data)
    files = {name: digest((METHOD_DIR / name).read_bytes()) for name in METHOD_FILES}
    state = {"status": "requesting", "started_at_utc": datetime.now(timezone.utc).isoformat(), "endpoint": ENDPOINT,
             "credential_source": key_source, "client_request_id": str(uuid.uuid4()), "request_sha256": digest(body),
             "method_id": METHOD_ID, "settings": config, "files_sha256": files,
             "type_list": {"path": display(types_path), "sha256": digest(types_bytes), "book_id": tl["book_id"]},
             "source_regions": {"path": display(base_path), "sha256": digest(base_bytes)},
             "prompt_sha256": digest(prompt.encode())}
    write_json(output / "run.json", state)
    request = urllib.request.Request(ENDPOINT, data=body, method="POST", headers={
        "Authorization": "Bearer " + key, "Content-Type": "application/json", "X-Client-Request-Id": state["client_request_id"]})
    print(f"Submitting one fresh gpt-6.1-terra transcription request for {input_id} ({len(sent)} regions).", flush=True)
    api_start = time.perf_counter()
    try:
        try:
            with urllib.request.urlopen(request, timeout=900) as response:
                state["response_headers_seconds"] = time.perf_counter() - api_start
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
        if not text:
            raise RuntimeError("Completed response contains no output text.")
        (output / "model-output.txt").write_text(text)
        parsed = json.loads(text)
        write_json(output / "parsed-response.json", parsed)
        cost = usage_breakdown(response.get("usage") or {}, pricing, response.get("service_tier"))
        source = dict(method=METHOD_ID, regions_method=config["base_method_id"], regions_path=display(base_path),
                      regions_sha256=digest(base_bytes), type_list_sha256=digest(types_bytes),
                      response_id=response.get("id"), model=response.get("model"), created_at_utc=state["started_at_utc"])
        doc, problems = pagedoc.build(input_id, record, tl, sent, parsed, source)
        errors, warnings = pagedoc.check(doc, tl)
        (output / "page.json").write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")) + "\n")
        (output / "transcript.txt").write_text(pagedoc.transcript(doc, tl))
        result = dict(
            schema_version=1, method=dict(id=METHOD_ID, name=config["name"], settings=config, files_sha256=files),
            input=dict(id=input_id, path=display(input_path), sha256=digest(image_bytes)),
            type_list=state["type_list"], source_regions=state["source_regions"],
            api=dict(endpoint=ENDPOINT, returned_model=response.get("model"), response_id=response.get("id"),
                     request_id=state.get("request_id"), api_wall_seconds=state["api_wall_seconds"],
                     usage=response.get("usage"), tokens_and_cost=cost, request_sha256=digest(body), response_sha256=digest(raw)),
            regions_sent=[dict(id=s["rid"], region_id=s["region"]["region_id"], type=s["region"]["type"],
                               line_ids=s["line_ids"], cutout=s["cutout"]) for s in sent],
            regions_skipped=skipped, problems=problems, check=dict(errors=errors, warnings=warnings, valid=not errors),
            counts=dict(regions=len(doc["page"]["regions"]), units=len(doc["units"]), relations=len(doc["relations"]),
                        line_pieces=sum(len(r["lines"]) for r in doc["page"]["regions"]),
                        retyped=[r["id"] for r in doc["page"]["regions"] if "retyped_from" in r["source"]],
                        uncertain=[r["id"] for r in doc["page"]["regions"] if r["source"]["transcription"]["uncertain"]]),
            artifacts=dict(request="request.json", raw_response="response.json", prompt="prompt.txt", schema="response-schema.json",
                           overview="overview.png", cutouts="cutouts/", page_document="page.json", transcript="transcript.txt"),
            environment=dict(python=platform.python_version(),
                             packages={n: importlib.metadata.version(n) for n in ["numpy", "Pillow"]}))
        write_json(output / "result.json", result)
        state["status"] = "completed"
        write_json(output / "run.json", state)
        print(json.dumps(dict(output=display(output), valid=not errors, errors=errors[:10], warnings=warnings[:5],
                              problems=problems[:10], counts=result["counts"], api_wall_seconds=round(state["api_wall_seconds"], 1),
                              cost=cost.get("estimated_paid_tier_total_cost_usd"), usage=response.get("usage")),
                         indent=1, ensure_ascii=False))
    except Exception as error:
        state["status"] = "failed"
        state.setdefault("api_wall_seconds", time.perf_counter() - api_start)
        state["error"] = {"type": type(error).__name__, "message": str(error).replace(key, "[REDACTED]")}
        write_json(output / "run.json", state)
        raise SystemExit(state["error"]["message"])


if __name__ == "__main__":
    main()
