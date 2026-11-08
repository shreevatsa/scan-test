#!/usr/bin/env python3
"""Generate method 044's transcription prompt and response schema from a book's type list and a page's regions.

The prompt describes the book, its conventions, all its unit types (with what each contains and which flows it may
stand at the top of), its furniture, flows and relations. The response schema has one required entry per region of
the page, in the order the regions are sent, each with exactly as many lines as the region has line pieces; and a
flat list of units whose children are region and unit ids.

Usage: uv run --offline python methods/044-…/prompt.py schema/types/kale-1913.json
"""
import argparse
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
OTHER = "other"
ENDS = ["space", "hyphen", "join", "line"]


def furniture(tl):
    return [name for name, t in tl["types"].items() if t.get("role") == "furniture"]


def unit_types(tl):
    return [name for name, t in tl["types"].items() if t.get("role") != "furniture"]


def region_types(tl):
    """Types a region may have: printed types, furniture, and the region step's catch-all other."""
    names = [name for name, t in tl["types"].items() if "region" in t or t.get("role") == "furniture"]
    return names + ([] if OTHER in names else [OTHER])


def type_lines(tl):
    lines = []
    for name, t in tl["types"].items():
        if t.get("role") == "furniture":
            continue
        kind = ["printed as regions" if "region" in t else "a larger unit, made of other units"]
        if t.get("contains"):
            kind.append("contains " + ", ".join(t["contains"]))
        if t.get("flow"):
            kind.append("may stand at the top of flow " + t["flow"])
        lines.append(f"- {name} ({'; '.join(kind)}): {t['description'].rstrip()}")
    return "\n".join(lines)


def relation_lines(tl):
    rel = tl.get("relations") or {}
    if not rel:
        return ""
    out = ["- relations: only those whose both ends are on this page. For a note marker you wrote in square brackets, a relation "
           "of type note from the region and the line number n where the marker stands, with the marker as written without "
           "the brackets, to the id of the note's unit. Use an empty marker for a relation without one. The book's relation types:"]
    out += [f"  - {name}: {text}" for name, text in rel.items()]
    return "\n".join(out) + "\n"


def build_prompt(tl):
    template = (HERE / "prompt-template.txt").read_text()
    book = tl["title"].rstrip(".") + ". " + tl.get("description", "").strip()
    conventions = tl.get("conventions") or ["Transcribe as printed, in Unicode NFC."]
    return (template.replace("<<BOOK>>", book.strip())
            .replace("<<CONVENTIONS>>", "\n".join("  - " + c for c in conventions))
            .replace("<<TYPES>>", type_lines(tl))
            .replace("<<FURNITURE>>", ", ".join(furniture(tl)) or "none in this book")
            .replace("<<FLOWS>>", "\n".join(f"  - {k}: {v}" for k, v in tl["flows"].items()))
            .replace("<<RELATIONS>>\n", relation_lines(tl)))


def region_caption(rid, rtype, n_lines):
    return f"{rid}: {rtype}, {n_lines} line{'s' if n_lines != 1 else ''}"


def build_schema(tl, regions, fixed_line_counts=True):
    """regions: [(id, number of lines)] in the order they are sent. Method 051: with fixed_line_counts false, the
    lines array has no minItems/maxItems (Gemini refuses the fixed counts of a page with many regions as too complex)."""
    def region_schema(n):
        counts = {"minItems": n, "maxItems": n} if fixed_line_counts else {}
        return {"type": "object", "additionalProperties": False, "required": ["type", "lines", "uncertain", "note"],
                "properties": {
                    "type": {"enum": region_types(tl)},
                    "lines": {"type": "array", **counts, "items": {
                        "type": "object", "additionalProperties": False, "required": ["n", "text", "end"],
                        "properties": {"n": {"type": "integer"}, "text": {"type": "string"}, "end": {"enum": ENDS}}}},
                    "uncertain": {"type": "boolean"},
                    "note": {"type": ["string", "null"]}}}
    unit = {"type": "object", "additionalProperties": False,
            "required": ["id", "type", "number", "label", "open_start", "open_end", "children"],
            "properties": {"id": {"type": "string"}, "type": {"enum": unit_types(tl)},
                           "number": {"type": ["string", "null"]}, "label": {"type": ["string", "null"]},
                           "open_start": {"type": "boolean"}, "open_end": {"type": "boolean"},
                           "children": {"type": "array", "items": {"type": "string"}}}}
    flow = {"type": "object", "additionalProperties": False, "required": ["flow", "units"],
            "properties": {"flow": {"enum": list(tl["flows"])}, "units": {"type": "array", "items": {"type": "string"}}}}
    props = {"regions": {"type": "object", "additionalProperties": False, "required": [rid for rid, _ in regions],
                         "properties": {rid: region_schema(n) for rid, n in regions}},
             "units": {"type": "array", "items": unit},
             "flows": {"type": "array", "items": flow}}
    if tl.get("relations"):
        props["relations"] = {"type": "array", "items": {
            "type": "object", "additionalProperties": False, "required": ["type", "region", "line", "marker", "to"],
            "properties": {"type": {"enum": list(tl["relations"])}, "region": {"type": "string"}, "line": {"type": "integer"},
                           "marker": {"type": "string"}, "to": {"type": "string"}}}}
    return {"type": "object", "additionalProperties": False, "required": list(props), "properties": props}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("types", type=Path)
    args = parser.parse_args()
    print(build_prompt(json.loads(args.types.read_text())), end="")


if __name__ == "__main__":
    main()
