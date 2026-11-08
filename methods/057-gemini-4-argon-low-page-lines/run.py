#!/usr/bin/env python3
"""One page image read line by line by Gemini 4 Argon (low thinking): a plain second reader, to check a page's text
from another source (method 056's converted text layer). One request per page, with the whole page image.

The prompt asks for every printed line, top to bottom, exactly as printed in Unicode, with superscript note markers
in square brackets where they stand. The answer is a list of lines; no regions, units or formatting.

Usage: uv run --offline python methods/057-…/run.py inputs/vachana-page-061.json [--run NAME] [--check]
Writes outputs/<input id>/057-…/[<run>/]: request.json (image data elided), response.json, lines.json, text.txt and result.json.
"""
import argparse
import base64
import hashlib
import json
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
PROJECT_DIR = HERE.parents[1]
METHOD_ID = HERE.name
M055 = PROJECT_DIR / "methods" / "055-gemini-4-argon-low-region-transcription-formatting"
sys.path.insert(0, str(M055))
import run as m055  # noqa: E402  (credential, gemini_usage, ENDPOINTS; method 055's code, unchanged)

PROMPT = """This is one page of a book, typeset digitally{book}. Transcribe every line of text on the page, top to bottom, exactly as printed:
- one entry per printed line, in reading order; a heading, a running header and a page number are lines too;
- in Unicode (NFC), in the script printed; keep digits, punctuation and English words as printed;
- do not correct, normalize or complete anything, and do not join or split lines;
- write a superscript note marker in square brackets where it stands, as in word[1];
- leave out ornaments and pictures.
Return JSON only."""

SCHEMA = {"type": "object", "additionalProperties": False, "required": ["lines"],
          "properties": {"lines": {"type": "array", "items": {"type": "string"}}}}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("record", type=Path)
    ap.add_argument("--run")
    ap.add_argument("--book", default="", help="a short description of the book, added to the prompt")
    ap.add_argument("--check", action="store_true")
    args = ap.parse_args()
    config = json.loads((HERE / "config.json").read_text())
    pricing = json.loads((M055 / "pricing.json").read_text())
    record = json.loads(args.record.read_text())
    image = PROJECT_DIR / "inputs" / record["image"]
    data = image.read_bytes()
    if hashlib.sha256(data).hexdigest() != record["image_sha256"]:
        sys.exit("The image is not the one in its record.")
    out = PROJECT_DIR / "outputs" / record["input_id"] / METHOD_ID / (args.run or "")
    if out.exists() and any(out.iterdir()):
        sys.exit(f"Output directory exists and is not empty: {out}")
    prompt = PROMPT.format(book=f" ({args.book})" if args.book else "")
    payload = {"model": config["model"],
               "input": [{"type": "text", "text": prompt},
                         {"type": "image", "data": base64.b64encode(data).decode(), "mime_type": "image/png", "resolution": config["image_resolution"]}],
               "generation_config": {"thinking_level": config["thinking_level"], "thinking_summaries": "none", "max_output_tokens": config["max_output_tokens"]},
               "response_format": {"type": "text", "mime_type": "application/json", "schema": SCHEMA},
               "service_tier": "standard", "store": False}
    if args.check:
        print(json.dumps(dict(input=record["input_id"], prompt=prompt, request_bytes=len(json.dumps(payload))), ensure_ascii=False, indent=1))
        return
    key, key_source = m055.credential("gemini")
    started = datetime.now(timezone.utc)
    t0 = time.perf_counter()
    req = urllib.request.Request(m055.ENDPOINTS["gemini"], data=json.dumps(payload).encode(), method="POST",
                                 headers={"x-goog-api-key": key, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=900) as r:
            raw = r.read()
    except urllib.error.HTTPError as e:
        sys.exit(f"HTTP {e.code}: {e.read()[:500]!r}")
    seconds = time.perf_counter() - t0
    response = json.loads(raw)
    text = "".join(c["text"] for s in response.get("steps", []) if s.get("type") == "model_output" for c in s.get("content", []) if c.get("type") == "text")
    text = text or "".join(o["text"] for o in response.get("outputs", []) if o.get("type") == "text")
    lines = json.loads(text)["lines"]
    out.mkdir(parents=True, exist_ok=True)
    elided = json.loads(json.dumps(payload))
    elided["input"][1]["data"] = f"<{len(data)} bytes of {record['image']}, sha256 {record['image_sha256']}>"
    (out / "request.json").write_text(json.dumps(elided, ensure_ascii=False, indent=1) + "\n")
    (out / "response.json").write_bytes(raw)
    (out / "lines.json").write_text(json.dumps(lines, ensure_ascii=False, indent=1) + "\n")
    (out / "text.txt").write_text("\n".join(lines) + "\n")
    cost = m055.gemini_usage(response.get("usage") or {}, pricing)
    result = dict(schema_version=1, method=METHOD_ID, input=dict(id=record["input_id"], image=record["image"], sha256=record["image_sha256"]),
                  created_at_utc=started.isoformat(), settings=config, key_source=key_source.split(":")[0], api_seconds=round(seconds, 1),
                  model=response.get("model"), response_id=response.get("id"), lines=len(lines), tokens_and_cost=cost)
    (out / "result.json").write_text(json.dumps(result, ensure_ascii=False, indent=1) + "\n")
    print(record["input_id"], len(lines), "lines", f"${cost.get('estimated_paid_tier_total_cost_usd', 0):.4f}", f"{seconds:.0f} s")


if __name__ == "__main__":
    main()
