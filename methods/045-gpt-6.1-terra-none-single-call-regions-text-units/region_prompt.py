#!/usr/bin/env python3
"""Generate method 042's region prompt and response schema from a book's type list (schema/types/<book_id>.json).

The region types offered to the model are the book's types that are printed as regions: those with a region class,
and page furniture. Each is described by the book's own description, followed by the rule for its region class
(method 040's wording for that neutral type). Larger units, which have no regions of their own, are listed for
context only. A catch-all type "other" is always added. Everything else in the prompt is method 040's.

Usage: uv run --offline python methods/042-…/prompt.py schema/types/kale-1913.json [--schema]
"""
import argparse
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent

# The rule for each region class, from method 040's type definitions.
CLASS_RULES = {
    "verse": "Include all its lines and its number or end mark. Never one region per line, and never two verses in one region, even when consecutive verses are set with no space between them. If other material interrupts a verse, each printed part is its own region.",
    "paragraph": "One region per paragraph, including one continued from the previous page or onto the next.",
    "heading": "",
    "lead_in": "It often ends in a dash or colon.",
    "list_item": "One region per entry.",
    "formula": "Lines that continue one another (for example a chain of = or ≡) form one region; displays separated by prose or by space are separate.",
    "note": "Include its marker. Separate neighboring notes even when they share a printed line.",
    "table": "One region per table, including any rotated text in it.",
    "figure": "One region per illustration, without its caption.",
    "caption": "One region per caption.",
    "running_header": "",
    "page_number": "",
    "other": "",
}
OTHER = "other"
OTHER_DESCRIPTION = "Anything else on the page that none of the types above describes. Printer's signature marks and catchwords are other, keep=false."


def region_types(tl):
    """The book's types that are printed as regions, in the type list's order: (name, definition)."""
    return [(name, t) for name, t in tl["types"].items() if "region" in t or t.get("role") == "furniture"]


def type_enum(tl):
    names = [name for name, _ in region_types(tl)]
    return names + ([] if OTHER in names else [OTHER])


def classes(tl):
    """Region class of each offered type; furniture without a class is other."""
    out = {name: t.get("region", OTHER) for name, t in region_types(tl)}
    out.setdefault(OTHER, OTHER)
    return out


def furniture(tl):
    return {name for name, t in region_types(tl) if t.get("role") == "furniture"}


def type_lines(tl):
    lines = []
    for name, t in region_types(tl):
        rule = CLASS_RULES.get(t.get("region", OTHER), "")
        text = t["description"].rstrip()
        if rule:
            text += " " + rule
        if t.get("role") == "furniture":
            text += " Page furniture, keep=false."
        lines.append(f"- {name}: {text}")
    if OTHER not in tl["types"]:
        lines.append(f"- {OTHER}: {OTHER_DESCRIPTION}")
    return "\n".join(lines)


def nesting_rule(tl):
    """A rule for region types that contain other region types, such as Hertel's paragraph quoting a verse."""
    offered = dict(region_types(tl))
    pairs = [(outer, inner) for outer, t in offered.items() for inner in t.get("contains", []) if inner in offered]
    if not pairs:
        return ""
    outer, inner = pairs[0]
    others = ", ".join(f"a {i} inside a {o}" for o, i in pairs[1:])
    return ("- A region holds the text of one unit only. Where one unit contains another, as with a "
            f"{inner} inside a {outer}" + (f" (or {others})" if others else "") +
            ", the inner unit is its own region, and the outer unit's text before it and after it are separate regions of the outer unit.\n")


def larger_units(tl):
    big = [(name, t) for name, t in tl["types"].items() if "region" not in t and t.get("role") != "furniture"]
    if not big:
        return ""
    lines = ["Larger units of this book are made of the regions above. They are listed so that you know the book's structure; never return them as regions:"]
    lines += [f"- {name}: {t['description'].rstrip()}" for name, t in big]
    return "\n".join(lines) + "\n\n"


def build_prompt(tl):
    template = (HERE / "prompt-template.txt").read_text()
    book = tl["title"].rstrip(".") + ". " + tl.get("description", "").strip()
    return (template.replace("<<BOOK>>", book.strip())
            .replace("<<TYPES>>", type_lines(tl))
            .replace("<<LARGER_UNITS>>\n", larger_units(tl))
            .replace("<<NESTING>>\n", nesting_rule(tl))
            .replace("<<TYPE_ENUM>>", "|".join(type_enum(tl))))


def build_schema(tl):
    schema = json.loads((HERE / "response-schema-template.json").read_text())
    schema["properties"]["regions"]["items"]["properties"]["type"]["enum"] = type_enum(tl)
    return schema


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("types", type=Path)
    parser.add_argument("--schema", action="store_true", help="print the response schema instead of the prompt")
    args = parser.parse_args()
    tl = json.loads(args.types.read_text())
    print(json.dumps(build_schema(tl), indent=2, ensure_ascii=False) if args.schema else build_prompt(tl), end="")


if __name__ == "__main__":
    main()
