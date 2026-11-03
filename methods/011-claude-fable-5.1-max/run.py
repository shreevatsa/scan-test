#!/usr/bin/env python3
"""Send one fresh layout-region request to Claude Fable 5.1 and preserve its artifacts."""
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
from schema_adapter import to_api_schema

METHOD_DIR = Path(__file__).resolve().parent
PROJECT_DIR = METHOD_DIR.parent.parent
METHOD_ID = METHOD_DIR.name
ENDPOINT = "https://api.anthropic.com/v1/messages"
SOURCE_FILES = ["run.py", "regions.py", "diagnostics.py", "schema_adapter.py", "prompt.txt",
                "response-schema.json", "api-response-schema.json", "config.json",
                "pricing.json", "requirements.txt"]


def credential(key_name):
    if os.environ.get("ANTHROPIC_API_KEY"):
        return os.environ["ANTHROPIC_API_KEY"], "ANTHROPIC_API_KEY"
    try:
        result = subprocess.run(["llm", "keys", "get", key_name],
                                capture_output=True, text=True, timeout=10)
    except (OSError, subprocess.TimeoutExpired) as error:
        raise RuntimeError("Set ANTHROPIC_API_KEY or configure the anthropic key using llm keys.") from error
    if result.returncode or not result.stdout.strip():
        raise RuntimeError("No Anthropic API key is available.")
    return result.stdout.strip(), "llm stored key: "+key_name


def usage_breakdown(usage, pricing):
    incoming, outgoing = usage.get("input_tokens"), usage.get("output_tokens")
    created = usage.get("cache_creation_input_tokens", 0)
    cached = usage.get("cache_read_input_tokens", 0)
    if not all(type(v) is int and v >= 0 for v in [incoming, outgoing, created, cached]):
        return {"available":False, "reason":"Expected nonnegative token-count fields were not returned."}
    thinking = (usage.get("output_tokens_details") or {}).get("thinking_tokens")
    normalized = {
        "available":True, "uncached_input_tokens":incoming,
        "cache_creation_input_tokens":created, "cache_read_input_tokens":cached,
        "total_input_tokens":incoming+created+cached,
        "output_tokens_including_thinking":outgoing, "thinking_tokens":thinking,
        "approximate_non_thinking_output_tokens":None if thinking is None else outgoing-thinking,
    }
    if thinking is not None and (type(thinking) not in [int,float] or not 0 <= thinking <= outgoing):
        normalized["estimate_unavailable_reason"] = "Thinking-token breakdown needs inspection."
        return normalized
    creation = usage.get("cache_creation") or {}
    write5 = creation.get("ephemeral_5m_input_tokens", 0)
    write1 = creation.get("ephemeral_1h_input_tokens", 0)
    if write5+write1 != created:
        normalized["estimate_unavailable_reason"] = "Cache creation lifetime breakdown needs inspection."
        return normalized
    if any((usage.get("server_tool_use") or {}).values()):
        normalized["estimate_unavailable_reason"] = "Tool-use charges need inspection."
        return normalized
    if usage.get("speed") not in [None, "standard"] or usage.get("service_tier") not in [None,"standard"]:
        normalized["estimate_unavailable_reason"] = "Returned service selection needs inspection."
        return normalized
    input_cost = (incoming*pricing["input_per_million_usd"]+
                  cached*pricing["cache_read_per_million_usd"]+
                  write5*pricing["cache_write_5m_per_million_usd"]+
                  write1*pricing["cache_write_1h_per_million_usd"])/1_000_000
    output_cost = outgoing*pricing["output_per_million_usd"]/1_000_000
    normalized.update({
        "estimated_paid_tier_input_cost_usd":input_cost,
        "estimated_paid_tier_output_cost_usd":output_cost,
        "estimated_paid_tier_total_cost_usd":input_cost+output_cost,
        "pricing":pricing,
    })
    return normalized


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    parser.add_argument("--output-dir", type=Path)
    parser.add_argument("--llm-key-name", default="anthropic")
    parser.add_argument("--workspace-id", default=os.environ.get("ANTHROPIC_WORKSPACE_ID"))
    parser.add_argument("--check", action="store_true", help="Validate request without a call or file writes")
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
    api_schema = json.loads((METHOD_DIR/"api-response-schema.json").read_text())
    assert api_schema == to_api_schema(schema), "Saved API schema differs from the documented transformation."
    config = json.loads((METHOD_DIR/"config.json").read_text())
    pricing = json.loads((METHOD_DIR/"pricing.json").read_text())
    if config["model"] != "claude-fable-5-1":
        parser.error("This method is pinned to claude-fable-5-1.")
    payload = {
        "model":config["model"],
        "max_tokens":config["max_output_tokens"],
        "messages":[{"role":"user","content":[
            {"type":"text","text":prompt},
            {"type":"image","source":{"type":"base64","media_type":"image/png",
                                     "data":base64.b64encode(image_bytes).decode()}},
        ]}],
        "thinking":{"type":config["thinking"]},
        "output_config":{"effort":config["effort"],
                         "format":{"type":"json_schema","schema":api_schema}},
        "stream":False,
    }
    body = json.dumps(payload, ensure_ascii=False, separators=(",",":")).encode()
    source_hashes = {name:digest((METHOD_DIR/name).read_bytes()) for name in SOURCE_FILES}
    if args.check:
        print(json.dumps({"model":config["model"],"image_size":[width,height],
                          "input_sha256":digest(image_bytes),"prompt_sha256":digest(prompt.encode()),
                          "request_bytes":len(body),"thinking":config["thinking"],"effort":config["effort"],
                          "schema_adaptation":"Unsupported range and array-length constraints moved to descriptions; original constraints validated locally."},indent=2))
        return
    output = (args.output_dir or PROJECT_DIR/"outputs"/input_id/METHOD_ID).resolve()
    if output.exists() and (not output.is_dir() or any(output.iterdir())):
        parser.error("Output location is occupied; choose a fresh --output-dir.")
    key, key_source = credential(args.llm_key_name)
    output.mkdir(parents=True, exist_ok=True)
    (output/"request.json").write_bytes(body)
    (output/"prompt.txt").write_text(prompt)
    (output/"api-response-schema.json").write_bytes((METHOD_DIR/"api-response-schema.json").read_bytes())
    state = {
        "status":"requesting", "started_at_utc":datetime.now(timezone.utc).isoformat(),
        "endpoint":ENDPOINT, "credential_source":key_source,
        "client_request_id":str(uuid.uuid4()), "request_sha256":digest(body),
        "method_id":METHOD_ID, "settings":config, "files_sha256":source_hashes,
        "request_headers":{"anthropic-version":config["api_version"],"Content-Type":"application/json"},
    }
    if args.workspace_id:
        state["request_headers"]["anthropic-workspace-id"] = args.workspace_id
    write_json(output/"run.json",state)
    headers = dict(state["request_headers"])
    headers["Authorization"] = "Bearer "+key
    request = urllib.request.Request(ENDPOINT,data=body,method="POST",headers=headers)
    print("Submitting one fresh claude-fable-5-1 request for "+input_id+".",flush=True)
    api_start = time.perf_counter()
    try:
        try:
            with urllib.request.urlopen(request,timeout=600) as http:
                state["response_headers_seconds"] = time.perf_counter()-api_start
                state["http_status"] = http.status
                state["request_id"] = http.headers.get("request-id") or http.headers.get("x-request-id")
                names = ["date","content-type","content-length","server-timing","request-id","x-request-id","retry-after"]
                response_headers = {name:http.headers.get(name) for name in names if http.headers.get(name) is not None}
                first_byte = http.read(1)
                state["response_first_body_byte_seconds"] = time.perf_counter()-api_start if first_byte else None
                raw = first_byte+http.read()
                state["api_wall_seconds"] = time.perf_counter()-api_start
            write_json(output/"response-headers.json",response_headers)
        except urllib.error.HTTPError as error:
            state["http_status"] = error.code
            state["request_id"] = error.headers.get("request-id") or error.headers.get("x-request-id")
            raw = error.read()
            state["api_wall_seconds"] = time.perf_counter()-api_start
            (output/"response.json").write_bytes(raw.replace(key.encode(),b"[REDACTED]"))
            raise RuntimeError("Claude API returned HTTP "+str(error.code)+"; response saved.") from error
        (output/"response.json").write_bytes(raw)
        response = json.loads(raw)
        state.update({"response_id":response.get("id"),"returned_model":response.get("model"),
                      "stop_reason":response.get("stop_reason"),"usage":response.get("usage")})
        write_json(output/"run.json",state)
        output_text = "".join(block["text"] for block in response.get("content",[]) if block.get("type")=="text")
        (output/"model-output.txt").write_text(output_text)
        thinking = [block.get("thinking","") for block in response.get("content",[]) if block.get("type")=="thinking"]
        if thinking:
            (output/"thinking-output.txt").write_text("\n".join(thinking))
        if response.get("stop_reason") != "end_turn":
            raise RuntimeError("Claude response stop reason is "+str(response.get("stop_reason")))
        if not output_text:
            raise RuntimeError("Completed response contains no output text.")
        parsed = json.loads(output_text)
        write_json(output/"parsed-regions.json",parsed)
        regions,warnings = validate_and_scale(parsed,width,height)
        mask,labels,stats,character_height,rules = make_mask(rgb)
        counts = dict(Counter(r["type"] for r in regions))
        usage = response.get("usage") or {}
        tokens_and_cost = usage_breakdown(usage,pricing)
        result = {
            "schema_version":1,"started_at_utc":state["started_at_utc"],
            "method":{"id":METHOD_ID,"name":"Claude Fable 5.1 max effort",
                      "settings":config,"files_sha256":source_hashes},
            "input":{"id":input_id,"path":display_path(input_path),"sha256":digest(image_bytes),
                     "width":width,"height":height},
            "api":{"endpoint":ENDPOINT,"version":config["api_version"],
                   "requested_model":config["model"],"returned_model":response.get("model"),
                   "response_id":response.get("id"),"request_id":state["request_id"],
                   "client_request_id":state["client_request_id"],"stop_reason":response.get("stop_reason"),
                   "api_wall_seconds":state["api_wall_seconds"],
                   "response_headers_seconds":state["response_headers_seconds"],
                   "response_first_body_byte_seconds":state["response_first_body_byte_seconds"],
                   "usage":usage,"tokens_and_cost":tokens_and_cost,
                   "request_sha256":digest(body),"response_sha256":digest(raw)},
            "coordinates":{"raw":"[x1,y1,x2,y2] normalized to 0..1000",
                           "derived":"[x1,y1,x2,y2] in input-image pixels; origin top-left",
                           "conversion":"x*width/1000, y*height/1000; no boundary adjustment"},
            "regions":regions,"region_types":counts,
            "uncertain_region_count":sum(r["uncertain"] for r in regions),
            "metrics":metrics(regions,mask,labels,stats),
            "kept_regions_metrics":metrics([r for r in regions if r["keep"]],mask,labels,stats),
            "validation_warnings":warnings,
            "environment":{"python":platform.python_version(),"platform":platform.platform(),
                           "packages":{name:importlib.metadata.version(name) for name in
                                       ["numpy","Pillow","opencv-python-headless"]}},
            "artifacts":{"request":"request.json","raw_response":"response.json",
                         "response_headers":"response-headers.json","parsed_response":"parsed-regions.json",
                         "overlay":"overlay.png","measurement_mask":"ink-mask.png"},
        }
        draw_overlay(rgb,regions,mask).save(output/"overlay.png")
        Image.fromarray(mask*255).save(output/"ink-mask.png")
        write_json(output/"regions.json",result)
        state["status"] = "completed"
        write_json(output/"run.json",state)
        print(json.dumps({"output_dir":display_path(output),"returned_model":response.get("model"),
                          "region_types":counts,"warnings":warnings,"api_wall_seconds":state["api_wall_seconds"],
                          "usage":usage,"tokens_and_cost":tokens_and_cost},indent=2))
    except Exception as error:
        state["status"] = "failed"
        state.setdefault("api_wall_seconds",time.perf_counter()-api_start)
        state["error"] = {"type":type(error).__name__,"message":str(error).replace(key,"[REDACTED]")}
        write_json(output/"run.json",state)
        raise SystemExit(state["error"]["message"])


if __name__ == "__main__":
    main()
