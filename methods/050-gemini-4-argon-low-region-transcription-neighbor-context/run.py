#!/usr/bin/env python3
"""Transcribe one page on method 043's regions with GPT-6.1 Terra, and build the page's unit tree.

Method 044: a second call after the region step (method 042 + 043). The request holds the prompt generated from the
book's type list (prompt.py), the page with every region outlined and labeled (cutouts.overview), and for each region
its id, type and line count followed by a cut-out of it with its line pieces numbered (cutouts.cutout). The strict
response schema asks for exactly one entry per region with one line per line piece, a flat list of units, the flows
and, for books with relation types, relations. pagedoc.py turns the response into a page document of the draft book
schema, which schema/book.py then checks. Request settings and accounting are those of method 042.

Method 046: method 044 with context for the open ends. After the region cut-outs, the request holds the last
context_lines line pieces of the previous page's last region of the main text and of the notes, and the first
context_lines line pieces of the next page's first regions, cut out from those pages' method 043 regions
(cutouts.context). The neighbors are the inputs whose ids end in the page number one less and one more, when they
have method 043 regions; --previous and --next name them instead, and "none" leaves a side out.

Methods 048-050: method 047's request sent to another reader, set in config.json: "provider" openai (OpenAI
Responses API, model and reasoning_effort) or gemini (Google Interactions API, model, thinking_level and
image_resolution). The prompt, images, schema and page document are method 047's.

Method 047: method 046 with --run NAME, for whole books. The page's regions and its neighbors' are then read from
outputs/<input>/043-…/NAME/regions.json, and the default output directory is outputs/<input>/047-…/NAME. Requests are
otherwise built exactly as by method 046."""
import argparse
import base64
from datetime import datetime, timezone
import hashlib
import importlib.metadata
import io
import json
import os
import re
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
ENDPOINTS = {"openai": "https://api.openai.com/v1/responses",
             "gemini": "https://generativelanguage.googleapis.com/v1beta/interactions"}
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


def credential(provider):
    names, key_name = (["OPENAI_API_KEY"], "openai") if provider == "openai" else (["GEMINI_API_KEY", "GOOGLE_API_KEY"], "gemini")
    for name in names:
        if os.environ.get(name):
            return os.environ[name], name
    try:
        result = subprocess.run(["llm", "keys", "get", key_name], capture_output=True, text=True, timeout=10)
    except (OSError, subprocess.TimeoutExpired) as error:
        raise RuntimeError(f"Set {names[0]} or configure a {key_name} key using llm keys.") from error
    if result.returncode or not result.stdout.strip():
        raise RuntimeError(f"No {key_name} API key is available.")
    return result.stdout.strip(), "llm stored key: " + key_name


def gemini_usage(usage, pricing):
    """Method 017's usage normalization and cost estimate for the Interactions API."""
    names = ["total_input_tokens", "total_output_tokens", "total_thought_tokens"]
    if not all(type(usage.get(name)) is int for name in names):
        return {"available": False, "reason": "Expected token-count fields were not returned."}
    incoming, outgoing, thought = (usage[name] for name in names)
    cached = usage.get("total_cached_tokens", 0)
    billable_output = outgoing + thought
    out = {"available": True, "input_tokens": incoming, "cached_input_tokens": cached, "text_output_tokens": outgoing,
           "thinking_tokens": thought, "billable_output_tokens_including_thinking": billable_output,
           "total_token_count_matches": usage.get("total_tokens") == incoming + billable_output}
    if not out["total_token_count_matches"] or usage.get("total_tool_use_tokens", 0):
        out["estimate_unavailable_reason"] = "Usage categories need inspection before pricing."
        return out
    input_cost = ((incoming - cached) * pricing["input_per_million_usd"] + cached * pricing["cached_input_per_million_usd"]) / 1_000_000
    output_cost = billable_output * pricing["output_per_million_usd"] / 1_000_000
    out.update(estimated_paid_tier_input_cost_usd=input_cost, estimated_paid_tier_output_cost_usd=output_cost,
               estimated_paid_tier_total_cost_usd=input_cost + output_cost, pricing=pricing)
    return out


def gemini_payload(config, content, schema):
    """The same content in the Interactions API's form."""
    items = []
    for c in content:
        if c["type"] == "input_text":
            items.append({"type": "text", "text": c["text"]})
        else:
            items.append({"type": "image", "data": c["image_url"].split(",", 1)[1], "mime_type": "image/png",
                          "resolution": config["image_resolution"]})
    return {"model": config["model"], "input": items,
            "generation_config": {"thinking_level": config["thinking_level"], "thinking_summaries": "none",
                                  "max_output_tokens": config["max_output_tokens"]},
            "response_format": {"type": "text", "mime_type": "application/json", "schema": schema},
            "service_tier": "standard", "store": False}


def regions_path(input_id, base_method_id, run):
    return PROJECT_DIR / "outputs" / input_id / base_method_id / (run or "") / "regions.json"


def neighbor(input_id, step, base_method_id, run=None):
    """(input id, image path, regions path) of the page whose id ends in the page number plus step, if it has regions."""
    m = re.fullmatch(r"(.*-)(\d+)", input_id)
    if not m or int(m[2]) + step < 0:
        return None
    nid = f"{m[1]}{int(m[2]) + step:0{len(m[2])}d}"
    img, reg = PROJECT_DIR / "inputs" / f"{nid}.png", regions_path(nid, base_method_id, run)
    return (nid, img, reg) if img.exists() and reg.exists() else None


def edge_regions(base, tl, which):
    """The last (which="last") or first text region of each stream in reading order: main text and notes."""
    furniture = {n for n, t in tl["types"].items() if t.get("role") == "furniture"}
    cand = [r for r in base["regions"] if r["status"] == "ok" and r["polygons"] and r["reading_order"] is not None
            and r["type"] not in furniture and r["type"] != "other" and cutouts.line_pieces(r)]
    out = {}
    for stream in ("main", "notes"):
        rs = [r for r in cand if (r["region_class"] == "note") == (stream == "notes")]
        if rs:
            out[stream] = (max if which == "last" else min)(rs, key=lambda r: r["reading_order"])
    return out


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
    parser.add_argument("--run", help="name of the method 043 run to read the page's and its neighbors' regions from, and of the output run")
    parser.add_argument("--previous", help="input id of the previous page, or none; default: the page number minus one")
    parser.add_argument("--next", help="input id of the next page, or none; default: the page number plus one")
    parser.add_argument("--check", action="store_true", help="build the request and print a summary, without an API call or writes")
    parser.add_argument("--preview-dir", type=Path, help="with --check, also write the request's images here")
    args = parser.parse_args()
    config = json.loads((METHOD_DIR / "config.json").read_text())
    pricing = json.loads((METHOD_DIR / "pricing.json").read_text())
    provider = config["provider"]
    ENDPOINT = ENDPOINTS[provider]
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
    base_path = (args.base_regions or regions_path(input_id, config["base_method_id"], args.run)).resolve()
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
    context, context_images = [], []
    content.append({"type": "input_text", "text": "Context from the neighboring pages, not part of this page:"})
    for side, which, step, given in (("previous", "last", -1, args.previous), ("next", "first", 1, args.next)):
        if given == "none":
            nb = None
        elif given:
            nb = (given, PROJECT_DIR / "inputs" / f"{given}.png", regions_path(given, config["base_method_id"], args.run))
        else:
            nb = neighbor(input_id, step, config["base_method_id"], args.run)
        if nb is None:
            content.append({"type": "input_text", "text": f"No {side} page is available."})
            continue
        nid, nimg, nreg = nb
        nbase = json.loads(nreg.read_text())
        nrgb = np.asarray(Image.open(nimg).convert("RGB"))
        edges = edge_regions(nbase, tl, which)
        if not edges:
            content.append({"type": "input_text", "text": f"The {side} page has no text regions."})
        for stream, r in edges.items():
            img, info = cutouts.context(nrgb, r, nbase["line_analysis"]["char_h"], config, which, config["context_lines"])
            data = png_bytes(img)
            name = f"{side}-{stream}"
            context_images.append((name, data))
            context.append(dict(side=side, page=nid, stream=stream, region_id=r["region_id"], type=r["type"],
                                regions=display(nreg), regions_sha256=digest(nreg.read_bytes()), sha256=digest(data), **info))
            what = "end" if side == "previous" else "start"
            content.append({"type": "input_text", "text": f"The {what} of the {side} page's {'main text' if stream == 'main' else 'notes'} (from a {r['type']} region):"})
            content.append({"type": "input_image", "image_url": "data:image/png;base64," + base64.b64encode(data).decode(),
                            "detail": config["image_detail"]})
    if provider == "openai":
        payload = {"model": config["model"], "input": [{"role": "user", "content": content}],
                   "reasoning": {"effort": config["reasoning_effort"]},
                   "text": {"format": {"type": "json_schema", "name": "page_transcription", "strict": True, "schema": schema}},
                   "max_output_tokens": config["max_output_tokens"], "store": config["store"]}
    else:
        payload = gemini_payload(config, content, schema)
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode()
    if args.check:
        if args.preview_dir:
            args.preview_dir.mkdir(parents=True, exist_ok=True)
            (args.preview_dir / "overview.png").write_bytes(view_png)
            for rid, data in images + context_images:
                (args.preview_dir / f"{rid}.png").write_bytes(data)
            (args.preview_dir / "prompt.txt").write_text(prompt)
            write_json(args.preview_dir / "response-schema.json", schema)
        print(json.dumps(dict(input_id=input_id, regions_sent=len(sent), skipped=skipped,
                              line_pieces=sum(len(s["line_ids"]) for s in sent), request_bytes=len(body),
                              context=[(c["side"], c["page"], c["stream"], c["type"], c["line_ids"]) for c in context],
                              prompt_sha256=digest(prompt.encode()), type_list=display(types_path)), indent=1))
        return

    output = (args.output_dir or PROJECT_DIR / "outputs" / input_id / METHOD_ID / (args.run or "")).resolve()
    if output.exists() and (not output.is_dir() or any(output.iterdir())):
        parser.error("Output location is occupied; choose a fresh --output-dir.")
    key, key_source = credential(provider)
    output.mkdir(parents=True, exist_ok=True)
    (output / "request.json").write_bytes(body)
    (output / "prompt.txt").write_text(prompt)
    write_json(output / "response-schema.json", schema)
    (output / "type-list.json").write_bytes(types_bytes)
    (output / "overview.png").write_bytes(view_png)
    (output / "cutouts").mkdir()
    for rid, data in images:
        (output / "cutouts" / f"{rid}.png").write_bytes(data)
    (output / "context").mkdir()
    for name, data in context_images:
        (output / "context" / f"{name}.png").write_bytes(data)
    files = {name: digest((METHOD_DIR / name).read_bytes()) for name in METHOD_FILES}
    state = {"status": "requesting", "started_at_utc": datetime.now(timezone.utc).isoformat(), "endpoint": ENDPOINT,
             "credential_source": key_source, "client_request_id": str(uuid.uuid4()), "request_sha256": digest(body),
             "method_id": METHOD_ID, "settings": config, "files_sha256": files,
             "type_list": {"path": display(types_path), "sha256": digest(types_bytes), "book_id": tl["book_id"]},
             "source_regions": {"path": display(base_path), "sha256": digest(base_bytes)},
             "prompt_sha256": digest(prompt.encode())}
    write_json(output / "run.json", state)
    headers = ({"Authorization": "Bearer " + key, "Content-Type": "application/json", "X-Client-Request-Id": state["client_request_id"]}
               if provider == "openai" else {"x-goog-api-key": key, "Content-Type": "application/json"})
    request = urllib.request.Request(ENDPOINT, data=body, method="POST", headers=headers)
    print(f"Submitting one fresh {config['model']} transcription request with neighbor context for {input_id} ({len(sent)} regions).", flush=True)
    api_start = time.perf_counter()
    try:
        try:
            with urllib.request.urlopen(request, timeout=900) as response:
                state["response_headers_seconds"] = time.perf_counter() - api_start
                state["http_status"] = response.status
                state["request_id"] = response.headers.get("x-request-id") or response.headers.get("x-goog-request-id")
                raw = response.read()
                state["api_wall_seconds"] = time.perf_counter() - api_start
        except urllib.error.HTTPError as error:
            state["http_status"] = error.code
            state["request_id"] = error.headers.get("x-request-id")
            raw = error.read()
            (output / "response.json").write_bytes(raw.replace(key.encode(), b"[REDACTED]"))
            raise RuntimeError(f"{provider} API returned HTTP " + str(error.code) + "; response saved.") from error
        (output / "response.json").write_bytes(raw)
        response = json.loads(raw)
        if provider == "gemini":
            response = response.get("interaction", response)
        state.update({"response_id": response.get("id"), "returned_model": response.get("model"),
                      "response_status": response.get("status"), "usage": response.get("usage")})
        write_json(output / "run.json", state)
        if response.get("status") != "completed":
            raise RuntimeError("API response status is " + str(response.get("status")))
        if provider == "openai":
            text = "".join(c["text"] for item in response.get("output", []) if item.get("type") == "message"
                           for c in item.get("content", []) if c.get("type") == "output_text")
        else:
            text = "".join(c["text"] for step in response.get("steps", []) if step.get("type") == "model_output"
                           for c in step.get("content", []) if c.get("type") == "text")
            text = text or "".join(o["text"] for o in response.get("outputs", []) if o.get("type") == "text")
        if not text:
            raise RuntimeError("Completed response contains no output text.")
        (output / "model-output.txt").write_text(text)
        parsed = json.loads(text)
        write_json(output / "parsed-response.json", parsed)
        cost = (usage_breakdown(response.get("usage") or {}, pricing, response.get("service_tier")) if provider == "openai"
                else gemini_usage(response.get("usage") or {}, pricing))
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
            regions_skipped=skipped, context=context, problems=problems, check=dict(errors=errors, warnings=warnings, valid=not errors),
            counts=dict(regions=len(doc["page"]["regions"]), units=len(doc["units"]), relations=len(doc["relations"]),
                        line_pieces=sum(len(r["lines"]) for r in doc["page"]["regions"]),
                        retyped=[r["id"] for r in doc["page"]["regions"] if "retyped_from" in r["source"]],
                        uncertain=[r["id"] for r in doc["page"]["regions"] if r["source"]["transcription"]["uncertain"]]),
            artifacts=dict(request="request.json", raw_response="response.json", prompt="prompt.txt", schema="response-schema.json",
                           overview="overview.png", cutouts="cutouts/", context="context/", page_document="page.json", transcript="transcript.txt"),
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
