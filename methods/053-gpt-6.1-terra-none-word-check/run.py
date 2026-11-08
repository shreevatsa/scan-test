#!/usr/bin/env python3
"""Check the words of a transcription that Tesseract reads differently, with one call per page. Method 053.

Input: a page document from a transcription method (default: method 046's first request) and its page image.
1. Each line piece whose text has Devanagari is cut out with its polygons and read by Tesseract (script/Devanagari,
   --psm 7, TSV output with word boxes).
2. The model's words and Tesseract's are aligned (difflib on word lists, dandas as words, note markers removed). Each
   stretch where they differ and the model has words becomes an item: the model's reading (A), Tesseract's (B), and
   the stretch's box, from Tesseract's word boxes (or the gap between its neighbors when Tesseract has no words there).
3. One request (GPT-6.1 Terra, reasoning none, strict JSON Schema) shows each item as an enlarged crop of the stretch
   and the whole line with the stretch boxed in red, with A and B, and asks for the printed letters, the printed text
   and a verdict (A, B, neither, unclear).
4. The corrected line replaces each item's stretch with the returned text, except for items judged unclear, which are
   left as A and listed for a person. corrected-lines.json holds every checked line before and after.

Local steps use Tesseract, numpy and Pillow; the request settings and accounting are method 042's."""
import argparse
import base64
import difflib
from datetime import datetime, timezone
import hashlib
import io
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import time
import unicodedata
import urllib.error
import urllib.request
import uuid

from PIL import Image, ImageDraw

from costs import usage_breakdown

METHOD_DIR = Path(__file__).resolve().parent
PROJECT_DIR = METHOD_DIR.parent.parent
METHOD_ID = METHOD_DIR.name
ENDPOINT = "https://api.openai.com/v1/responses"
DEV = re.compile("[ऀ-ॿ]")
METHOD_FILES = ["run.py", "prompt.txt", "config.json", "pricing.json", "costs.py", "requirements.txt"]


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


def credential():
    if os.environ.get("OPENAI_API_KEY"):
        return os.environ["OPENAI_API_KEY"], "OPENAI_API_KEY"
    result = subprocess.run(["llm", "keys", "get", "openai"], capture_output=True, text=True, timeout=10)
    if result.returncode or not result.stdout.strip():
        raise RuntimeError("No OpenAI API key is available.")
    return result.stdout.strip(), "llm stored key: openai"


def clean(s):
    """Method 044's no-markers normalization of a line, before splitting into words."""
    s = re.sub(r"\s+", " ", unicodedata.normalize("NFC", s)).strip()
    s = re.sub(r"[’‘ʼ`´]", "'", s).replace("।।", "॥")
    s = re.sub(r"\[[^\]\s]{1,4}\]", "", s)
    return re.sub(r"[*†]", "", s)


def words(s):
    return clean(s).replace("।", " । ").replace("॥", " ॥ ").split()


def line_image(im, polys, pad=6):
    xs = [p[0] for r in polys for p in r]
    ys = [p[1] for r in polys for p in r]
    x1, y1 = max(0, min(xs) - pad), max(0, min(ys) - pad)
    x2, y2 = min(im.width, max(xs) + pad + 1), min(im.height, max(ys) + pad + 1)
    m = Image.new("L", (x2 - x1, y2 - y1), 0)
    d = ImageDraw.Draw(m)
    for r in polys:
        d.polygon([(x - x1, y - y1) for x, y in r], fill=255, outline=255)
    crop = im.crop((x1, y1, x2, y2)).convert("RGB")
    return Image.composite(crop, Image.new("RGB", crop.size, (255, 255, 255)), m)


def tesseract_words(img, lang, tmp):
    f = tmp / "line.png"
    img.save(f)
    out = subprocess.run(["tesseract", str(f), "-", "-l", lang, "--psm", "7", "tsv"], capture_output=True, text=True).stdout
    found = []
    for row in out.splitlines()[1:]:
        cols = row.split("\t")
        if len(cols) == 12 and cols[0] == "5" and cols[11].strip():
            left, top, w, h = map(int, cols[6:10])
            for k, wd in enumerate(words(cols[11])):
                found.append(dict(text=wd, box=[left, top, left + w, top + h]))
    return found


def items_for_line(llm_text, tess, width, height):
    a = words(llm_text)
    b = [t["text"] for t in tess]
    out = []
    for op, i1, i2, j1, j2 in difflib.SequenceMatcher(None, a, b, autojunk=False).get_opcodes():
        if op == "equal" or i1 == i2:
            continue
        if j1 < j2:
            boxes = [tess[j]["box"] for j in range(j1, j2)]
            box = [min(x[0] for x in boxes), min(x[1] for x in boxes), max(x[2] for x in boxes), max(x[3] for x in boxes)]
        else:
            left = tess[j1 - 1]["box"][2] if j1 > 0 else 0
            right = tess[j1]["box"][0] if j1 < len(tess) else width
            box = [left, 0, max(right, left + 10), height]
        out.append(dict(i1=i1, i2=i2, a=" ".join(a[i1:i2]), b=" ".join(b[j1:j2]), box=box))
    return a, out


def enlarged(img, box, target_h=110, pad=8):
    x1, y1, x2, y2 = box
    c = img.crop((max(0, x1 - pad), 0, min(img.width, x2 + pad), img.height))
    s = max(1.0, target_h / max(1, c.height))
    return c.resize((int(c.width * s), int(c.height * s)), Image.LANCZOS)


def boxed(img, box, max_w=1600):
    c = img.copy()
    d = ImageDraw.Draw(c)
    x1, y1, x2, y2 = box
    d.rectangle([max(0, x1 - 3), 1, min(c.width - 1, x2 + 3), c.height - 2], outline=(220, 0, 0), width=3)
    if c.width > max_w:
        c = c.resize((max_w, int(c.height * max_w / c.width)), Image.LANCZOS)
    return c


def png(img):
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    parser.add_argument("--page", type=Path, help="page document to check; default method 046's first request")
    parser.add_argument("--output-dir", type=Path)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    config = json.loads((METHOD_DIR / "config.json").read_text())
    pricing = json.loads((METHOD_DIR / "pricing.json").read_text())
    input_path = args.input.resolve()
    input_id = input_path.stem
    page_path = (args.page or PROJECT_DIR / "outputs" / input_id / config["source_method_id"] / "page.json").resolve()
    page_bytes = page_path.read_bytes()
    doc = json.loads(page_bytes)
    im = Image.open(input_path).convert("RGB")
    tmp = Path(tempfile.mkdtemp())
    lines, items, images = [], [], []
    for r in doc["page"]["regions"]:
        for L in r["lines"]:
            text = L.get("text", "")
            if not DEV.search(text):
                continue
            img = line_image(im, L["polygons"])
            tess = tesseract_words(img, config["tesseract_lang"], tmp)
            a, found = items_for_line(text, tess, img.width, img.height)
            rec = dict(region=r["id"], line=L["line"], text=text, words=a, tesseract=" ".join(t["text"] for t in tess), items=[])
            for it in found:
                iid = f"w{len(items) + 1}"
                it.update(id=iid, region=r["id"], line=L["line"])
                items.append(it)
                rec["items"].append(iid)
                images.append((iid, png(enlarged(img, it["box"])), png(boxed(img, it["box"]))))
            lines.append(rec)
    prompt = (METHOD_DIR / "prompt.txt").read_text()
    content = [{"type": "input_text", "text": prompt}]
    for it, (iid, big, line) in zip(items, images):
        content.append({"type": "input_text", "text": f"{iid}: A = {it['a']} | B = {it['b'] or '(nothing)'}"})
        content.append({"type": "input_image", "image_url": "data:image/png;base64," + base64.b64encode(big).decode(), "detail": config["image_detail"]})
        content.append({"type": "input_image", "image_url": "data:image/png;base64," + base64.b64encode(line).decode(), "detail": config["image_detail"]})
    schema = {"type": "object", "additionalProperties": False, "required": ["items"], "properties": {"items": {
        "type": "array", "items": {"type": "object", "additionalProperties": False,
                                   "required": ["id", "spelling", "text", "verdict"],
                                   "properties": {"id": {"type": "string", "enum": [it["id"] for it in items] or ["none"]},
                                                  "spelling": {"type": "string"}, "text": {"type": "string"},
                                                  "verdict": {"enum": ["A", "B", "neither", "unclear"]}}}}}}
    payload = {"model": config["model"], "input": [{"role": "user", "content": content}],
               "reasoning": {"effort": config["reasoning_effort"]},
               "text": {"format": {"type": "json_schema", "name": "word_check", "strict": True, "schema": schema}},
               "max_output_tokens": config["max_output_tokens"], "store": config["store"]}
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode()
    words_total = sum(len(x["words"]) for x in lines)
    summary = dict(input_id=input_id, page=display(page_path), lines=len(lines), words=words_total, items=len(items),
                   words_in_items=sum(it["i2"] - it["i1"] for it in items), request_bytes=len(body))
    if args.check:
        print(json.dumps(summary, indent=1))
        return
    output = (args.output_dir or PROJECT_DIR / "outputs" / input_id / METHOD_ID).resolve()
    if output.exists() and any(output.iterdir()):
        parser.error("Output location is occupied; choose a fresh --output-dir.")
    output.mkdir(parents=True, exist_ok=True)
    (output / "items").mkdir()
    for iid, big, line in images:
        (output / "items" / f"{iid}-enlarged.png").write_bytes(big)
        (output / "items" / f"{iid}-line.png").write_bytes(line)
    (output / "request.json").write_bytes(body)
    write_json(output / "items.json", dict(summary, items=items, lines=lines))
    key, key_source = credential()
    state = dict(status="requesting", started_at_utc=datetime.now(timezone.utc).isoformat(), credential_source=key_source,
                 client_request_id=str(uuid.uuid4()), method_id=METHOD_ID, settings=config,
                 files_sha256={n: digest((METHOD_DIR / n).read_bytes()) for n in METHOD_FILES},
                 source_page=dict(path=display(page_path), sha256=digest(page_bytes)))
    write_json(output / "run.json", state)
    if not items:
        parsed, response, raw, cost = {"items": []}, {}, b"", {}
        state["api_wall_seconds"] = 0.0
    else:
        request = urllib.request.Request(ENDPOINT, data=body, method="POST", headers={
            "Authorization": "Bearer " + key, "Content-Type": "application/json", "X-Client-Request-Id": state["client_request_id"]})
        t0 = time.perf_counter()
        try:
            with urllib.request.urlopen(request, timeout=900) as resp:
                raw = resp.read()
        except urllib.error.HTTPError as error:
            (output / "response.json").write_bytes(error.read())
            state.update(status="failed", http_status=error.code)
            write_json(output / "run.json", state)
            raise SystemExit("HTTP " + str(error.code))
        state["api_wall_seconds"] = time.perf_counter() - t0
        (output / "response.json").write_bytes(raw)
        response = json.loads(raw)
        text = "".join(c["text"] for item in response.get("output", []) if item.get("type") == "message"
                       for c in item.get("content", []) if c.get("type") == "output_text")
        parsed = json.loads(text)
        cost = usage_breakdown(response.get("usage") or {}, pricing, response.get("service_tier"))
    write_json(output / "parsed-response.json", parsed)
    answers = {x["id"]: x for x in parsed["items"]}
    unclear, corrected = [], []
    by_id = {it["id"]: it for it in items}
    for rec in lines:
        new = list(rec["words"])
        for iid in sorted(rec["items"], key=lambda i: -by_id[i]["i1"]):
            it, ans = by_id[iid], answers.get(iid)
            if ans is None or ans["verdict"] == "unclear":
                unclear.append(iid)
                continue
            new[it["i1"]:it["i2"]] = words(ans["text"])
        corrected.append(dict(region=rec["region"], line=rec["line"], before=" ".join(rec["words"]), after=" ".join(new),
                              items=rec["items"]))
    write_json(output / "corrected-lines.json", corrected)
    result = dict(method=dict(id=METHOD_ID, settings=config), input=input_id, source_page=state["source_page"],
                  summary=summary, verdicts={v: sum(1 for x in parsed["items"] if x["verdict"] == v) for v in ["A", "B", "neither", "unclear"]},
                  unanswered=[it["id"] for it in items if it["id"] not in answers], unclear=unclear,
                  api=dict(usage=response.get("usage"), tokens_and_cost=cost, api_wall_seconds=state["api_wall_seconds"]))
    write_json(output / "result.json", result)
    state["status"] = "completed"
    write_json(output / "run.json", state)
    print(json.dumps(dict(output=display(output), **summary, verdicts=result["verdicts"], unanswered=len(result["unanswered"]),
                          cost=cost.get("estimated_paid_tier_total_cost_usd")), indent=1, ensure_ascii=False))


if __name__ == "__main__":
    main()
