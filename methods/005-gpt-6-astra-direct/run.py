#!/usr/bin/env python3
"""Send one fresh page-region request to GPT-6 Astra and preserve its artifacts."""
import argparse
import base64
from collections import Counter
from datetime import datetime, timezone
import hashlib
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
from PIL import Image, ImageDraw, ImageFont
from diagnostics import make_mask, metrics, rasterize_boxes

METHOD_DIR = Path(__file__).resolve().parent
PROJECT_DIR = METHOD_DIR.parent.parent
METHOD_ID = METHOD_DIR.name
ENDPOINT = "https://api.openai.com/v1/responses"


def digest(data):
    return hashlib.sha256(data).hexdigest()


def display_path(path):
    try:
        return path.relative_to(PROJECT_DIR).as_posix()
    except ValueError:
        return str(path)


def write_json(path, value):
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n")


def credential(key_name):
    if os.environ.get("OPENAI_API_KEY"):
        return os.environ["OPENAI_API_KEY"], "OPENAI_API_KEY"
    try:
        result = subprocess.run(["llm", "keys", "get", key_name],
                                capture_output=True, text=True, timeout=10)
    except (OSError, subprocess.TimeoutExpired) as error:
        raise RuntimeError("Set OPENAI_API_KEY or configure an OpenAI key using llm keys.") from error
    if result.returncode or not result.stdout.strip():
        raise RuntimeError("No OpenAI API key is available.")
    return result.stdout.strip(), "llm stored key: " + key_name


def validate_and_scale(parsed, width, height):
    if not isinstance(parsed, dict) or set(parsed) != {"regions"} or not isinstance(parsed["regions"], list):
        raise ValueError("Expected an object containing a regions array.")
    required = {"type", "box_1000", "keep", "reading_order", "uncertain"}
    allowed = {"verse", "commentary", "lead_in", "footnote", "running_header", "page_number", "other"}
    regions, warnings = [], []
    for index, region in enumerate(parsed["regions"], 1):
        if not isinstance(region, dict) or set(region) != required or region["type"] not in allowed:
            raise ValueError("Invalid region fields or type at region " + str(index))
        box = region["box_1000"]
        if (not isinstance(box, list) or len(box) != 4 or
                any(type(value) is not int or not 0 <= value <= 1000 for value in box) or
                box[0] >= box[2] or box[1] >= box[3]):
            raise ValueError("Invalid normalized rectangle at region " + str(index))
        if type(region["keep"]) is not bool or type(region["uncertain"]) is not bool:
            raise ValueError("Invalid boolean flag at region " + str(index))
        order = region["reading_order"]
        if order is not None and (type(order) is not int or order < 1):
            raise ValueError("Invalid reading order at region " + str(index))
        if region["keep"] and order is None:
            warnings.append("Kept region " + str(index) + " has no reading order.")
        if region["type"] in {"running_header", "page_number"} and region["keep"]:
            warnings.append("Furniture region " + str(index) + " is marked keep=true.")
        regions.append(dict(region, region_id=index, label=region["type"],
                            box=[box[0]*width/1000, box[1]*height/1000,
                                 box[2]*width/1000, box[3]*height/1000]))
    orders = [r["reading_order"] for r in regions if r["keep"] and r["reading_order"] is not None]
    if sorted(orders) != list(range(1, len(orders)+1)):
        warnings.append("Kept-region reading orders are not unique and consecutive.")
    return regions, warnings


def draw_overlay(rgb, regions, mask):
    pixels = rgb.copy()
    covered = rasterize_boxes(regions, mask.shape)
    pixels[(mask > 0) & (covered == 0)] = [235, 40, 65]
    image = Image.fromarray(pixels)
    draw = ImageDraw.Draw(image)
    font = ImageFont.load_default(size=max(18, image.width // 48))
    occupied = []
    for region in regions:
        x1, y1, x2, y2 = region["box"]
        color = "#087db2" if region["keep"] else "#7a55ad"
        draw.rectangle((x1, y1, x2, y2), outline=color, width=max(2, image.width // 450))
        label = ("H" if region["type"] == "running_header" else
                 "PN" if region["type"] == "page_number" else
                 str(region["reading_order"]) if region["reading_order"] is not None else "F")
        left, top, right, bottom = draw.textbbox((0, 0), label, font=font)
        width, height = right-left+12, bottom-top+10
        tx, ty = max(0, x1-width-5), min(max(0, y1), image.height-height-1)
        while any(tx < b[2] and tx+width > b[0] and ty < b[3] and ty+height > b[1] for b in occupied):
            if ty+2*height+4 < image.height:
                ty += height+3
            else:
                tx += width+3
        occupied.append((tx, ty, tx+width, ty+height))
        draw.rectangle((tx, ty, tx+width, ty+height), fill=color)
        draw.text((tx+6-left, ty+5-top), label, fill="white", font=font)
    return image


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    parser.add_argument("--output-dir", type=Path)
    parser.add_argument("--llm-key-name", default="openai")
    parser.add_argument("--check", action="store_true", help="Validate input/config and show a summary without an API call or file writes")
    args = parser.parse_args()
    input_path = args.input.resolve()
    image_bytes = input_path.read_bytes()
    with Image.open(input_path) as source:
        if source.format != "PNG":
            parser.error("This method accepts PNG input.")
        rgb = np.asarray(source.convert("RGB")).copy()
    height, width = rgb.shape[:2]
    input_id = input_path.stem
    prompt = (METHOD_DIR / "prompt.txt").read_text()
    schema = json.loads((METHOD_DIR / "response-schema.json").read_text())
    config = json.loads((METHOD_DIR / "config.json").read_text())
    if config["model"] != "gpt-6-astra":
        parser.error("This method is pinned to gpt-6-astra.")
    payload = {
        "model": config["model"],
        "input": [{"role": "user", "content": [
            {"type": "input_text", "text": prompt},
            {"type": "input_image", "image_url": "data:image/png;base64,"+base64.b64encode(image_bytes).decode(),
             "detail": config["image_detail"]},
        ]}],
        "reasoning": {"effort": config["reasoning_effort"]},
        "text": {"format": {"type": "json_schema", "name": "page_regions", "strict": True, "schema": schema}},
        "max_output_tokens": config["max_output_tokens"],
        "store": config["store"],
    }
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode()
    if args.check:
        print(json.dumps({"model": config["model"], "input_id": input_id, "image_size": [width, height],
                          "input_sha256": digest(image_bytes), "prompt_sha256": digest(prompt.encode()),
                          "request_bytes": len(body), "reasoning": config["reasoning_effort"],
                          "image_detail": config["image_detail"]}, indent=2))
        return

    output = (args.output_dir or PROJECT_DIR / "outputs" / input_id / METHOD_ID).resolve()
    if output.exists() and (not output.is_dir() or any(output.iterdir())):
        parser.error("Output location is occupied; choose a fresh --output-dir.")
    key, key_source = credential(args.llm_key_name)
    output.mkdir(parents=True, exist_ok=True)
    (output / "request.json").write_bytes(body)
    (output / "prompt.txt").write_text(prompt)
    state = {
        "status": "requesting", "started_at_utc": datetime.now(timezone.utc).isoformat(),
        "endpoint": ENDPOINT, "credential_source": key_source,
        "client_request_id": str(uuid.uuid4()), "request_sha256": digest(body),
    }
    write_json(output / "run.json", state)
    request = urllib.request.Request(ENDPOINT, data=body, method="POST", headers={
        "Authorization": "Bearer "+key, "Content-Type": "application/json",
        "X-Client-Request-Id": state["client_request_id"],
    })
    print("Submitting one fresh gpt-6-astra request for " + input_id + ".", flush=True)
    api_start = time.perf_counter()
    try:
        try:
            with urllib.request.urlopen(request, timeout=600) as response:
                raw = response.read()
                state["http_status"] = response.status
                state["request_id"] = response.headers.get("x-request-id")
        except urllib.error.HTTPError as error:
            state["http_status"] = error.code
            state["request_id"] = error.headers.get("x-request-id")
            raw = error.read()
            (output / "response.json").write_bytes(raw.replace(key.encode(), b"[REDACTED]"))
            raise RuntimeError("OpenAI API returned HTTP " + str(error.code) + "; response saved.") from error
        state["api_wall_seconds"] = time.perf_counter()-api_start
        (output / "response.json").write_bytes(raw)
        response = json.loads(raw)
        state.update({"response_id": response.get("id"), "returned_model": response.get("model"),
                      "response_status": response.get("status"), "usage": response.get("usage")})
        write_json(output / "run.json", state)
        if response.get("status") != "completed":
            raise RuntimeError("API response status is " + str(response.get("status")))
        pieces = [content["text"] for item in response.get("output", []) if item.get("type") == "message"
                  for content in item.get("content", []) if content.get("type") == "output_text"]
        if not pieces:
            raise RuntimeError("Completed response contains no output text.")
        output_text = "".join(pieces)
        (output / "model-output.txt").write_text(output_text)
        parsed = json.loads(output_text)
        write_json(output / "parsed-regions.json", parsed)
        regions, warnings = validate_and_scale(parsed, width, height)
        mask, labels, stats, character_height, rules = make_mask(rgb)
        all_metrics = metrics(regions, mask, labels, stats)
        kept_metrics = metrics([r for r in regions if r["keep"]], mask, labels, stats)
        counts = dict(Counter(r["type"] for r in regions))
        result = {
            "schema_version": 1, "started_at_utc": state["started_at_utc"],
            "method": {"id": METHOD_ID, "name": "GPT-6 Astra direct regions", "settings": config,
                       "files_sha256": {name:digest((METHOD_DIR/name).read_bytes()) for name in
                                        ["run.py","diagnostics.py","prompt.txt","response-schema.json","config.json","requirements.txt"]}},
            "input": {"id": input_id, "path": display_path(input_path), "sha256": digest(image_bytes),
                      "width": width, "height": height},
            "api": {"endpoint": ENDPOINT, "requested_model": config["model"],
                    "returned_model": response.get("model"), "response_id": response.get("id"),
                    "request_id": state["request_id"], "client_request_id": state["client_request_id"],
                    "api_wall_seconds": state["api_wall_seconds"], "usage": response.get("usage"),
                    "response_sha256": digest(raw), "request_sha256": digest(body)},
            "coordinates": {"raw": "[x1,y1,x2,y2] normalized to 0..1000",
                            "derived": "[x1,y1,x2,y2] in input-image pixels; origin top-left",
                            "conversion": "x*width/1000, y*height/1000; no boundary adjustment"},
            "regions": regions, "region_types": counts,
            "uncertain_region_count": sum(r["uncertain"] for r in regions),
            "metrics": all_metrics, "kept_regions_metrics": kept_metrics,
            "validation_warnings": warnings,
            "environment": {"python": platform.python_version(), "platform": platform.platform(),
                            "packages": {name:importlib.metadata.version(name) for name in
                                         ["numpy","Pillow","opencv-python-headless"]}},
            "artifacts": {"request":"request.json","raw_response":"response.json",
                          "parsed_response":"parsed-regions.json","overlay":"overlay.png","measurement_mask":"ink-mask.png"},
        }
        draw_overlay(rgb, regions, mask).save(output / "overlay.png")
        Image.fromarray(mask*255).save(output / "ink-mask.png")
        write_json(output / "regions.json", result)
        state["status"] = "completed"
        write_json(output / "run.json", state)
        print(json.dumps({"output_dir":display_path(output), "returned_model":response.get("model"),
                          "region_types":counts, "metrics":all_metrics, "warnings":warnings,
                          "api_wall_seconds":state["api_wall_seconds"],"usage":response.get("usage")}, indent=2))
    except Exception as error:
        state["status"] = "failed"
        state.setdefault("api_wall_seconds", time.perf_counter()-api_start)
        state["error"] = {"type":type(error).__name__, "message":str(error).replace(key,"[REDACTED]")}
        write_json(output / "run.json", state)
        raise SystemExit(state["error"]["message"])


if __name__ == "__main__":
    main()
