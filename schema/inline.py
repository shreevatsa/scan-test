#!/usr/bin/env python3
"""Inline formatting and note markers for schema 0.2 (see schema/README.md, "Inline spans"). Local only.

- parse_line: a line of text as a model writes it, with simple tags (<b>, <i>, <sc>, <sup>, <sub>, <u>) and note
  markers in square brackets ([१], [*]), becomes plain text, formatting spans and zero-width note-marker spans.
  A tag left open at the end of a line is closed there and opened again at the start of the next line of the
  region (pass the returned state on).
- upgrade_page: a 0.1 page document, whose note markers are written into the text as [x], becomes a 0.2 page
  document: the markers move out of the text into note-marker spans with ids, and relations that point at a
  marker's offsets point at its span instead (from.anchor).

Usage: uv run --offline python schema/inline.py upgrade IN.json OUT.json
"""
import copy
import json
import re
import sys
from pathlib import Path

TAGS = {"b": "bold", "i": "italic", "sc": "small_caps", "sup": "superscript", "sub": "subscript", "u": "underline"}
TOKEN = re.compile(r"<(/?)(b|i|sc|sup|sub|u)>|\[([^\]\s]{1,4})\]")


def parse_line(text, open_tags=(), next_marker=1):
    """Returns (plain text, spans, open tags at the end, next marker number).

    spans are dicts with start, end, kind (and id and marker for note markers), ordered by start."""
    out, spans = [], []
    pos = 0
    stack = [[kind, 0] for kind in open_tags]
    for m in TOKEN.finditer(text):
        out.append(text[pos:m.start()])
        pos = m.end()
        here = sum(len(x) for x in out)
        if m.group(3) is not None:
            spans.append(dict(start=here, end=here, kind="note_marker", id=f"m{next_marker}", marker=m.group(3)))
            next_marker += 1
        elif m.group(1) == "":
            stack.append([TAGS[m.group(2)], here])
        else:
            kind = TAGS[m.group(2)]
            for k in range(len(stack) - 1, -1, -1):
                if stack[k][0] == kind:
                    _, start = stack.pop(k)
                    if here > start:
                        spans.append(dict(start=start, end=here, kind=kind))
                    break
    out.append(text[pos:])
    plain = "".join(out)
    still_open = []
    for kind, start in stack:
        if len(plain) > start:
            spans.append(dict(start=start, end=len(plain), kind=kind))
        still_open.append(kind)
    spans.sort(key=lambda s: (s["start"], s["end"]))
    return plain, spans, tuple(still_open), next_marker


def formatted_runs(lines):
    """[(kind, text)] for a region's line pieces, joining a kind's spans that run on from the end of one piece to the
    start of the next. lines: [{text, spans}] in order."""
    runs, open_run = [], {}
    for L in lines:
        text = L.get("text", "")
        spans = [s for s in L.get("spans", []) if s["kind"] != "note_marker"]
        starts = {}
        for s in spans:
            frag = text[s["start"]:s["end"]]
            if s["start"] == 0 and s["kind"] in open_run:
                open_run[s["kind"]][1] += " " + frag
                run = open_run.pop(s["kind"])
            else:
                run = [s["kind"], frag]
                runs.append(run)
            if s["end"] == len(text):
                starts[s["kind"]] = run
        open_run = starts
    return [(k, t.strip()) for k, t in runs]


MARKER = re.compile(r"\[([^\]\s]{1,4})\]")


def upgrade_page(doc):
    """A 0.1 page document with [x] markers in its text, as a 0.2 page document."""
    doc = copy.deepcopy(doc)
    pid = doc["page"]["id"]
    n = 1
    where = {}          # (region id, line id, offset in the old text) -> marker span id
    for r in doc["page"]["regions"]:
        for L in r.get("lines", []):
            text = L.get("text")
            if not text:
                continue
            out, pos, spans = [], 0, list(L.get("spans", []))
            for m in MARKER.finditer(text):
                out.append(text[pos:m.start()])
                here = sum(len(x) for x in out)
                sid = f"m{n}"
                n += 1
                spans.append(dict(start=here, end=here, kind="note_marker", id=sid, marker=m.group(1)))
                where[(r["id"], L.get("line"), m.start())] = sid
                pos = m.end()
            if pos:
                out.append(text[pos:])
                L["text"] = "".join(out)
                L["spans"] = sorted(spans, key=lambda s: (s["start"], s["end"]))
    for rel in doc.get("relations", []):
        f = rel["from"]
        if "region" in f and "line" in f and "start" in f:
            rid = f["region"].split("#", 1)[1]
            sid = where.get((rid, f["line"], f["start"]))
            if sid:
                f["anchor"] = f"{pid}#{sid}"
                del f["start"], f["end"]
    doc["schema_version"] = "0.2"
    doc.setdefault("source", {})["upgraded_from"] = "0.1 by schema/inline.py: [x] markers moved into note-marker spans"
    return doc


def main():
    if len(sys.argv) == 4 and sys.argv[1] == "upgrade":
        doc = upgrade_page(json.loads(Path(sys.argv[2]).read_text()))
        Path(sys.argv[3]).write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")) + "\n")
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main()
