#!/usr/bin/env python3
"""Send one fresh page-region request to Gemini 3.5 Flash-Lite and preserve its artifacts."""
import argparse
import base64
from collections import Counter
from datetime import datetime, timezone
import importlib.metadata
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
from diagnostics import make_mask, metrics
from regions import digest, display_path, write_json, validate_and_scale, draw_overlay

METHOD_DIR = Path(__file__).resolve().parent
PROJECT_DIR = METHOD_DIR.parent.parent
METHOD_ID = METHOD_DIR.name
ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions"


def credential(key_name):
    for name in ["GEMINI_API_KEY", "GOOGLE_API_KEY"]:
        if os.environ.get(name):
            return os.environ[name], name
    try:
        result = subprocess.run(["llm", "keys", "get", key_name],
                                capture_output=True, text=True, timeout=10)
    except (OSError, subprocess.TimeoutExpired) as error:
        raise RuntimeError("Set GEMINI_API_KEY or configure a Gemini key using llm keys.") from error
    if result.returncode or not result.stdout.strip():
        raise RuntimeError("No Gemini API key is available.")
    return result.stdout.strip(), "llm stored key: "+key_name


def usage_breakdown(usage, pricing):
    names = ["total_input_tokens", "total_output_tokens", "total_thought_tokens"]
    if not all(type(usage.get(name)) is int for name in names):
        return {"available":False, "reason":"Expected token-count fields were not returned."}
    incoming, outgoing, thought = (usage[name] for name in names)
    cached = usage.get("total_cached_tokens", 0)
    billable_output = outgoing + thought
    normalized = {
        "available":True, "input_tokens":incoming, "cached_input_tokens":cached,
        "text_output_tokens":outgoing, "thinking_tokens":thought,
        "billable_output_tokens_including_thinking":billable_output,
        "total_token_count_matches":usage.get("total_tokens") == incoming+billable_output,
    }
    if not normalized["total_token_count_matches"] or usage.get("total_tool_use_tokens", 0):
        normalized["estimate_unavailable_reason"] = "Usage categories need inspection before pricing."
        return normalized
    input_cost = ((incoming-cached)*pricing["input_per_million_usd"] +
                  cached*pricing["cached_input_per_million_usd"])/1_000_000
    output_cost = billable_output*pricing["output_per_million_usd"]/1_000_000
    normalized.update({"estimated_paid_tier_input_cost_usd":input_cost,
                       "estimated_paid_tier_output_cost_usd":output_cost,
                       "estimated_paid_tier_total_cost_usd":input_cost+output_cost,
                       "pricing":pricing})
    return normalized


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    parser.add_argument("--output-dir", type=Path)
    parser.add_argument("--llm-key-name", default="gemini")
    parser.add_argument("--check", action="store_true", help="Validate request locally without a call or file writes")
    args = parser.parse_args()
    input_path = args.input.resolve()
    image_bytes = input_path.read_bytes()
    with Image.open(input_path) as source:
        if source.format != "PNG":
            parser.error("This method accepts PNG input.")
        rgb = np.asarray(source.convert("RGB")).copy()
    height, width = rgb.shape[:2]
    input_id = input_path.stem
    prompt = (METHOD_DIR/"prompt.txt").read_text()
    schema = json.loads((METHOD_DIR/"response-schema.json").read_text())
    config = json.loads((METHOD_DIR/"config.json").read_text())
    pricing = json.loads((METHOD_DIR/"pricing.json").read_text())
    if config["model"] != "gemini-3.5-flash-lite":
        parser.error("This method is pinned to gemini-3.5-flash-lite.")
    payload = {
        "model":config["model"],
        "input":[
            {"type":"text", "text":prompt},
            {"type":"image", "data":base64.b64encode(image_bytes).decode(),
             "mime_type":"image/png", "resolution":config["image_resolution"]},
        ],
        "generation_config":{
            "thinking_level":config["thinking_level"],
            "thinking_summaries":config["thinking_summaries"],
            "max_output_tokens":config["max_output_tokens"],
        },
        "response_format":{"type":"text", "mime_type":"application/json", "schema":schema},
        "service_tier":"standard", "store":False,
    }
    body = json.dumps(payload, ensure_ascii=False, separators=(",",":")).encode()
    if args.check:
        print(json.dumps({"model":config["model"], "input_id":input_id, "image_size":[width,height],
                          "input_sha256":digest(image_bytes), "prompt_sha256":digest(prompt.encode()),
                          "request_bytes":len(body), "thinking_level":config["thinking_level"],
                          "image_resolution":config["image_resolution"]}, indent=2))
        return
    output = (args.output_dir or PROJECT_DIR/"outputs"/input_id/METHOD_ID).resolve()
    if output.exists() and (not output.is_dir() or any(output.iterdir())):
        parser.error("Output location is occupied; choose a fresh --output-dir.")
    key, key_source = credential(args.llm_key_name)
    output.mkdir(parents=True, exist_ok=True)
    (output/"request.json").write_bytes(body)
    (output/"prompt.txt").write_text(prompt)
    state = {"status":"requesting", "started_at_utc":datetime.now(timezone.utc).isoformat(),
             "endpoint":ENDPOINT, "credential_source":key_source,
             "client_request_id":str(uuid.uuid4()), "request_sha256":digest(body),
             "method_id":METHOD_ID, "settings":config,
             "files_sha256":{name:digest((METHOD_DIR/name).read_bytes()) for name in
                             ["run.py","regions.py","diagnostics.py","prompt.txt",
                              "response-schema.json","config.json","pricing.json","requirements.txt"]}}
    write_json(output/"run.json", state)
    request = urllib.request.Request(ENDPOINT, data=body, method="POST", headers={
        "x-goog-api-key":key, "Content-Type":"application/json",
    })
    print("Submitting one fresh gemini-3.5-flash-lite request for "+input_id+".", flush=True)
    api_start = time.perf_counter()
    try:
        try:
            with urllib.request.urlopen(request, timeout=600) as response:
                state["response_headers_seconds"] = time.perf_counter()-api_start
                state["http_status"] = response.status
                state["request_id"] = response.headers.get("x-request-id") or response.headers.get("x-goog-request-id")
                header_names = ["date", "content-type", "content-length", "server-timing",
                                "x-request-id", "x-goog-request-id", "retry-after"]
                headers = {name:response.headers.get(name) for name in header_names
                           if response.headers.get(name) is not None}
                first_byte = response.read(1)
                state["response_first_body_byte_seconds"] = time.perf_counter()-api_start if first_byte else None
                raw = first_byte + response.read()
                state["api_wall_seconds"] = time.perf_counter()-api_start
            write_json(output/"response-headers.json", headers)
        except urllib.error.HTTPError as error:
            state["http_status"] = error.code
            state["request_id"] = error.headers.get("x-request-id") or error.headers.get("x-goog-request-id")
            raw = error.read()
            (output/"response.json").write_bytes(raw.replace(key.encode(), b"[REDACTED]"))
            raise RuntimeError("Gemini API returned HTTP "+str(error.code)+"; response saved.") from error
        state.setdefault("api_wall_seconds", time.perf_counter()-api_start)
        (output/"response.json").write_bytes(raw)
        response = json.loads(raw)
        interaction = response.get("interaction", response)
        state.update({"response_id":interaction.get("id"), "returned_model":interaction.get("model"),
                      "response_status":interaction.get("status"), "usage":interaction.get("usage")})
        write_json(output/"run.json", state)
        if interaction.get("status") != "completed":
            raise RuntimeError("API response status is "+str(interaction.get("status")))
        pieces = [content["text"] for step in interaction.get("steps", []) if step.get("type") == "model_output"
                  for content in step.get("content", []) if content.get("type") == "text"]
        if not pieces:
            pieces = [item["text"] for item in interaction.get("outputs", [])
                      if item.get("type") == "text"]
        if not pieces:
            raise RuntimeError("Completed response contains no output text.")
        output_text = "".join(pieces)
        (output/"model-output.txt").write_text(output_text)
        parsed = json.loads(output_text)
        write_json(output/"parsed-regions.json", parsed)
        regions, warnings = validate_and_scale(parsed, width, height)
        mask, labels, stats, character_height, rules = make_mask(rgb)
        counts = dict(Counter(r["type"] for r in regions))
        all_metrics = metrics(regions, mask, labels, stats)
        kept_metrics = metrics([r for r in regions if r["keep"]], mask, labels, stats)
        usage = interaction.get("usage") or {}
        tokens_and_cost = usage_breakdown(usage, pricing)
        result = {
            "schema_version":1, "started_at_utc":state["started_at_utc"],
            "method":{"id":METHOD_ID, "name":"Gemini 3.5 Flash-Lite low thinking, individual footnotes, native coordinates", "settings":config,
                      "files_sha256":{name:digest((METHOD_DIR/name).read_bytes()) for name in
                                      ["run.py","regions.py","diagnostics.py","prompt.txt",
                                       "response-schema.json","config.json","pricing.json","requirements.txt"]}},
            "input":{"id":input_id, "path":display_path(input_path), "sha256":digest(image_bytes),
                     "width":width, "height":height},
            "api":{"endpoint":ENDPOINT, "requested_model":config["model"],
                   "returned_model":interaction.get("model"), "response_id":interaction.get("id"),
                   "request_id":state["request_id"], "client_request_id":state["client_request_id"],
                   "api_wall_seconds":state["api_wall_seconds"],
                   "response_headers_seconds":state.get("response_headers_seconds"),
                   "response_first_body_byte_seconds":state.get("response_first_body_byte_seconds"),
                   "usage":usage,
                   "tokens_and_cost":tokens_and_cost,
                   "response_sha256":digest(raw), "request_sha256":digest(body)},
            "coordinates":{"raw":"[ymin,xmin,ymax,xmax] normalized to 0..1000",
                           "derived":"[x1,y1,x2,y2] in input-image pixels; origin top-left",
                           "conversion":"Swap y/x order, then x*width/1000 and y*height/1000; clamp only to image bounds."},
            "regions":regions, "region_types":counts,
            "uncertain_region_count":sum(r["uncertain"] for r in regions),
            "metrics":all_metrics, "kept_regions_metrics":kept_metrics,
            "validation_warnings":warnings,
            "environment":{"python":platform.python_version(), "platform":platform.platform(),
                           "packages":{name:importlib.metadata.version(name) for name in
                                       ["numpy","Pillow","opencv-python-headless"]}},
            "artifacts":{"request":"request.json","raw_response":"response.json",
                         "response_headers":"response-headers.json",
                         "parsed_response":"parsed-regions.json","overlay":"overlay.png","measurement_mask":"ink-mask.png"},
        }
        draw_overlay(rgb, regions, mask).save(output/"overlay.png")
        Image.fromarray(mask*255).save(output/"ink-mask.png")
        write_json(output/"regions.json", result)
        state["status"] = "completed"
        write_json(output/"run.json", state)
        print(json.dumps({"output_dir":display_path(output), "returned_model":interaction.get("model"),
                          "region_types":counts, "warnings":warnings,
                          "api_wall_seconds":state["api_wall_seconds"],"usage":usage,
                          "tokens_and_cost":tokens_and_cost}, indent=2))
    except Exception as error:
        state["status"] = "failed"
        state.setdefault("api_wall_seconds", time.perf_counter()-api_start)
        state["error"] = {"type":type(error).__name__, "message":str(error).replace(key,"[REDACTED]")}
        write_json(output/"run.json", state)
        raise SystemExit(state["error"]["message"])


if __name__ == "__main__":
    main()
