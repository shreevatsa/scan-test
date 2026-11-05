#!/usr/bin/env python3
"""Check, assemble and print documents of the draft book schema (schema/schema.json). Local only, no API calls.

  uv run --offline python schema/book.py check FILE...            validate type lists, page documents or books
  uv run --offline python schema/book.py assemble PAGE... -o BOOK  join page documents, in order, into a book
  uv run --offline python schema/book.py tree BOOK                 print a book's unit tree and its page breaks

Page documents name their book; its type list is read from schema/types/<book_id>.json unless --types is given.
JSON Schema validation covers the subset of the standard that schema.json uses, since no validator package is
installed; the rules JSON Schema cannot express (references, the tree, types, open ends) are checked separately.
"""
import argparse
import copy
import hashlib
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SCHEMA = json.loads((HERE / "schema.json").read_text())
PY_TYPES = {"object": dict, "array": list, "string": str, "boolean": bool, "null": type(None)}


# ---------------------------------------------------------------- JSON Schema subset

def _resolve(ref):
    assert ref.startswith("#/$defs/"), ref
    return SCHEMA["$defs"][ref[len("#/$defs/"):]]


def _type_ok(value, t):
    if t == "integer":
        return isinstance(value, int) and not isinstance(value, bool)
    if t == "number":
        return isinstance(value, (int, float)) and not isinstance(value, bool)
    return isinstance(value, PY_TYPES[t])


def _discriminates(value, schema):
    """True if a oneOf branch's required keys are present and its const properties match (picks the branch to report)."""
    schema = _resolve(schema["$ref"]) if "$ref" in schema else schema
    if not isinstance(value, dict):
        return False
    props = schema.get("properties", {})
    return all(k in value for k in schema.get("required", [])) and all(
        value.get(k) == p["const"] for k, p in props.items() if "const" in p and k in value)


def validate(value, schema=SCHEMA, path="$"):
    if "$ref" in schema:
        return validate(value, _resolve(schema["$ref"]), path)
    if "oneOf" in schema:
        results = [validate(value, s, path) for s in schema["oneOf"]]
        passing = [r for r in results if not r]
        if len(passing) == 1:
            return []
        if passing:
            return [f"{path}: matches more than one alternative"]
        likely = [r for s, r in zip(schema["oneOf"], results) if _discriminates(value, s)]
        return min(likely or results, key=len)
    if "const" in schema and value != schema["const"]:
        return [f"{path}: must be {schema['const']!r}"]
    if "enum" in schema and value not in schema["enum"]:
        return [f"{path}: {value!r} is not one of {schema['enum']}"]
    if "type" in schema:
        types = schema["type"] if isinstance(schema["type"], list) else [schema["type"]]
        if not any(_type_ok(value, t) for t in types):
            return [f"{path}: expected {' or '.join(types)}"]
    errors = []
    if isinstance(value, str) and "pattern" in schema and not re.search(schema["pattern"], value):
        errors.append(f"{path}: {value!r} does not match {schema['pattern']}")
    if _type_ok(value, "number") and "minimum" in schema and value < schema["minimum"]:
        errors.append(f"{path}: below {schema['minimum']}")
    if isinstance(value, list):
        if len(value) < schema.get("minItems", 0):
            errors.append(f"{path}: fewer than {schema['minItems']} items")
        if len(value) > schema.get("maxItems", len(value)):
            errors.append(f"{path}: more than {schema['maxItems']} items")
        if "items" in schema:
            for i, item in enumerate(value):
                errors += validate(item, schema["items"], f"{path}[{i}]")
    if isinstance(value, dict):
        errors += [f"{path}: missing {k}" for k in schema.get("required", []) if k not in value]
        props, extra = schema.get("properties", {}), schema.get("additionalProperties", True)
        for k, v in value.items():
            if "propertyNames" in schema:
                errors += validate(k, schema["propertyNames"], f"{path}.{k} (name)")
            if k in props:
                errors += validate(v, props[k], f"{path}.{k}")
            elif extra is False:
                errors.append(f"{path}: unexpected property {k}")
            elif isinstance(extra, dict):
                errors += validate(v, extra, f"{path}.{k}")
    return errors


# ---------------------------------------------------------------- rules beyond JSON Schema

def check_types(tl):
    errors, types = [], tl["types"]
    for name, t in types.items():
        furniture = t.get("role") == "furniture"
        if furniture and ("contains" in t or "flow" in t or "region" not in t):
            errors.append(f"type {name}: furniture needs a region class and no contains or flow")
        if not furniture and "region" not in t and not t.get("contains"):
            errors.append(f"type {name}: neither printed as regions nor a container")
        for c in t.get("contains", []):
            if c not in types or types[c].get("role") == "furniture":
                errors.append(f"type {name}: contains unknown or furniture type {c}")
        if "flow" in t and t["flow"] not in tl["flows"]:
            errors.append(f"type {name}: unknown flow {t['flow']}")
    for f in tl["flows"]:
        if not any(t.get("flow") == f for t in types.values()):
            errors.append(f"flow {f}: no type can stand at its top level")
    return errors


def depth_first(units, flows):
    """Yield (flow, unit_id, depth) for each unit, and (flow, region_ref, depth) for each region, in reading order."""
    def walk(flow, uid, depth):
        yield flow, ("unit", uid), depth
        for c in units[uid]["children"]:
            if "unit" in c:
                yield from walk(flow, c["unit"], depth + 1)
            else:
                yield flow, ("region", c["region"]), depth + 1
    for flow, tops in flows.items():
        for uid in tops:
            yield from walk(flow, uid, 0)


def check_document(doc, tl):
    """Rules for a page document or a book document. Returns (errors, warnings)."""
    errors, warnings, types = [], [], tl["types"]
    pages = [doc["page"]] if doc["format"] == "page" else doc["pages"]
    regions = {}
    for p in pages:
        for r in p["regions"]:
            ref = f"{p['id']}#{r['id']}"
            if ref in regions:
                errors.append(f"region {ref}: duplicate id")
            regions[ref] = r
            if r["type"] not in types:
                errors.append(f"region {ref}: unknown type {r['type']}")
    units = {}
    for u in doc["units"]:
        if u["id"] in units:
            errors.append(f"unit {u['id']}: duplicate id")
        units[u["id"]] = u
    owner, parent = {}, {}
    for uid, u in units.items():
        t = types.get(u["type"])
        if t is None or t.get("role") == "furniture":
            errors.append(f"unit {uid}: unknown or furniture type {u['type']}")
            continue
        for c in u["children"]:
            if "region" in c:
                ref = c["region"]
                if ref not in regions:
                    errors.append(f"unit {uid}: unknown region {ref}")
                    continue
                if doc["format"] == "page" and not ref.startswith(doc["page"]["id"] + "#"):
                    errors.append(f"unit {uid}: region {ref} is on another page")
                if "region" not in t:
                    errors.append(f"unit {uid}: type {u['type']} is a container and owns no regions")
                if regions[ref]["type"] != u["type"]:
                    errors.append(f"unit {uid}: owns region {ref} of type {regions[ref]['type']}")
                if ref in owner:
                    errors.append(f"region {ref}: owned by {owner[ref]} and {uid}")
                owner[ref] = uid
            else:
                cid = c["unit"]
                if cid not in units:
                    errors.append(f"unit {uid}: unknown child unit {cid}")
                    continue
                if units[cid]["type"] not in t.get("contains", []):
                    errors.append(f"unit {uid}: type {u['type']} may not contain {units[cid]['type']}")
                if cid in parent:
                    errors.append(f"unit {cid}: child of {parent[cid]} and {uid}")
                parent[cid] = uid
    for ref, r in regions.items():
        furniture = types.get(r["type"], {}).get("role") == "furniture"
        if furniture and ref in owner:
            errors.append(f"region {ref}: furniture owned by unit {owner[ref]}")
        if not furniture and ref not in owner:
            errors.append(f"region {ref}: text region owned by no unit")
    in_flow = {}
    for flow, tops in doc["flows"].items():
        if flow not in tl["flows"]:
            errors.append(f"flow {flow}: not in the type list")
        for uid in tops:
            if uid not in units:
                errors.append(f"flow {flow}: unknown unit {uid}")
                continue
            if uid in parent:
                errors.append(f"flow {flow}: {uid} is a child of {parent[uid]}")
            if uid in in_flow:
                errors.append(f"unit {uid}: in flows {in_flow[uid]} and {flow}")
            in_flow[uid] = flow
            if types.get(units[uid]["type"], {}).get("flow") != flow:
                errors.append(f"flow {flow}: type {units[uid]['type']} may not stand at its top level")
    for uid in units:
        if uid not in parent and uid not in in_flow:
            errors.append(f"unit {uid}: neither a child nor in a flow")
    if errors:
        return errors, warnings
    seen = [x for _, x, _ in depth_first(units, doc["flows"]) if x[0] == "unit"]
    if len(seen) != len(set(seen)) or len(seen) != len(units):
        errors.append("units do not form a tree")
    for uid, u in units.items():
        siblings = units[parent[uid]]["children"] if uid in parent else None
        for end, index, word in (("start", 0, "first"), ("end", -1, "last")):
            if not u.get("open", {}).get(end):
                continue
            if siblings is None:
                tops = doc["flows"][in_flow[uid]]
                if end == "end" and tops[-1] != uid:
                    errors.append(f"unit {uid}: open at the end but not the last unit of flow {in_flow[uid]}")
                if end == "start" and sum(units[t].get("open", {}).get("start", False) for t in tops) > 1:
                    errors.append(f"flow {in_flow[uid]}: more than one unit open at the start")
                continue
            if siblings[index].get("unit") != uid:
                errors.append(f"unit {uid}: open at the {end} but not the {word} child of {parent[uid]}")
            if not units[parent[uid]].get("open", {}).get(end):
                errors.append(f"unit {uid}: open at the {end} but its parent {parent[uid]} is not")
    for i, rel in enumerate(doc.get("relations", [])):
        if rel["type"] not in tl.get("relations", {}):
            errors.append(f"relation {i}: unknown type {rel['type']}")
        for side in ("from", "to"):
            if "unit" in rel[side] and rel[side]["unit"] not in units:
                errors.append(f"relation {i}: unknown {side} unit {rel[side]['unit']}")
        if "region" in rel["from"] and rel["from"]["region"] not in regions:
            errors.append(f"relation {i}: unknown region {rel['from']['region']}")
        if not ("unit" in rel["from"] or "region" in rel["from"]):
            errors.append(f"relation {i}: from needs a unit or a region")
    for p in pages:
        if doc["format"] != "page":
            break
        for flow in doc["flows"]:
            orders = [regions[x[1]].get("order") for f, x, _ in depth_first(units, doc["flows"]) if f == flow and x[0] == "region"]
            orders = [o for o in orders if o is not None]
            if orders != sorted(orders):
                warnings.append(f"page {p['id']}, flow {flow}: units read regions in the order {orders}, not the region step's order")
    return errors, warnings


def load_type_list(doc, types_path=None):
    if doc["format"] == "book":
        return doc["types"]
    path = types_path or HERE / "types" / f"{doc['book_id']}.json"
    return json.loads(Path(path).read_text())


def check_file(path, types_path=None):
    doc = json.loads(Path(path).read_text())
    errors = validate(doc)
    warnings = []
    if not errors:
        if doc["format"] == "types":
            errors = check_types(doc)
        else:
            tl = load_type_list(doc, types_path)
            errors = [f"type list: {e}" for e in validate(tl) + check_types(tl)]
            if doc["format"] == "page" and tl["book_id"] != doc["book_id"]:
                errors.append(f"type list is for {tl['book_id']}, not {doc['book_id']}")
            if not errors:
                errors, warnings = check_document(doc, tl)
    return doc, errors, warnings


# ---------------------------------------------------------------- assembly

def assemble(page_docs, tl):
    """Join page documents, in page order, into one book document. Returns (book, warnings)."""
    units, start_open, end_open, merged_into, warnings = {}, {}, {}, {}, []
    flows = {f: [] for f in tl["flows"]}

    def final(uid):
        while uid in merged_into:
            uid = merged_into[uid]
        return uid

    def merge(a, b):
        """Append unit b (open at its start, on the later page) to unit a (open at its end)."""
        A, B = units[a], units.pop(b)
        merged_into[b] = a
        kids = B["children"]
        last, first = A["children"][-1], kids[0]
        if "unit" in last and end_open[last["unit"]] or "unit" in first and start_open[first["unit"]]:
            la, fb = last.get("unit"), first.get("unit")
            if la and fb and end_open[la] and start_open[fb] and units[la]["type"] == units[fb]["type"]:
                merge(la, fb)
                kids = kids[1:]
            else:
                warnings.append(f"{a} + {b}: inner open ends do not match ({la}, {fb})")
        A["children"] += kids
        end_open[a] = end_open[b]
        for k in ("number", "label", "lang"):
            if k in B and k not in A:
                A[k] = B[k]

    for pd in page_docs:
        pid = pd["page"]["id"]
        bid = lambda local: f"{pid}#{local}"
        for u in pd["units"]:
            nu = {k: copy.deepcopy(v) for k, v in u.items() if k != "open"}
            nu["id"] = bid(u["id"])
            nu["children"] = [{"unit": bid(c["unit"])} if "unit" in c else dict(c) for c in u["children"]]
            units[nu["id"]] = nu
            start_open[nu["id"]] = u.get("open", {}).get("start", False)
            end_open[nu["id"]] = u.get("open", {}).get("end", False)
        for flow, tops in pd["flows"].items():
            tops = [bid(t) for t in tops]
            prev = flows[flow][-1] if flows[flow] else None
            starts = [t for t in tops if start_open[t]]
            if prev and end_open[prev] and starts and units[prev]["type"] == units[starts[0]]["type"]:
                merge(prev, starts[0])
                tops.remove(starts[0])
            elif prev and end_open[prev] or starts and prev:
                warnings.append(f"page {pid}, flow {flow}: open ends do not match ({prev}, {starts})")
            flows[flow] += tops
    # Units still open at the edges of the page range keep their open flags.
    for uid, u in units.items():
        flags = {k: v for k, v in (("start", start_open[uid]), ("end", end_open[uid])) if v}
        if flags:
            u["open"] = flags
    relations = []
    for pd in page_docs:
        pid = pd["page"]["id"]
        for rel in pd.get("relations", []):
            rel = copy.deepcopy(rel)
            for side in ("from", "to"):
                if "unit" in rel[side]:
                    rel[side]["unit"] = final(f"{pid}#{rel[side]['unit']}")
            relations.append(rel)
    book = dict(format="book", schema_version="0.1", types=tl, pages=[pd["page"] for pd in page_docs],
                units=list(units.values()), flows=flows, relations=relations,
                source=dict(assembled_by="schema/book.py", pages=[pd["page"]["id"] for pd in page_docs],
                            page_sources=[pd.get("source", {}) for pd in page_docs],
                            code_sha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest()))
    return book, warnings


# ---------------------------------------------------------------- printing

def short_page(pid):
    """The page number at the end of an input id such as kale-1913-page-107, else the id itself."""
    return pid.rsplit("-page-", 1)[1].lstrip("0") or "0" if "-page-" in pid else pid


def tree_lines(book):
    units = {u["id"]: u for u in book["units"]}
    order = [p["id"] for p in book["pages"]]

    def pages_of(uid):
        out = set()
        for c in units[uid]["children"]:
            out |= pages_of(c["unit"]) if "unit" in c else {c["region"].split("#")[0]}
        return out

    def name(u):
        return u["type"] + (f" {u['number']}" if "number" in u else "") + (f" ({u['label']})" if "label" in u else "")

    def where(ref):
        n = short_page(ref.split("#")[0])
        return f"{'p' if n.isdigit() else ''}{n} {ref.split('#')[1]}"

    lines, current = [], None

    def show(uid, depth):
        u = units[uid]
        span = sorted(pages_of(uid), key=order.index)
        marks = []
        if len(span) > 1:
            marks.append(f"spans pages {short_page(span[0])}–{short_page(span[-1])}")
        if u.get("open", {}).get("start"):
            marks.append("began before this range")
        if u.get("open", {}).get("end"):
            marks.append("goes on after this range")
        mixed = any("unit" in c for c in u["children"])
        own = "" if mixed else ": " + ", ".join(where(c["region"]) for c in u["children"])
        lines.append("  " * depth + name(u) + own + (f"   [{'; '.join(marks)}]" if marks else ""))
        if mixed:
            for c in u["children"]:
                if "unit" in c:
                    show(c["unit"], depth + 1)
                else:
                    lines.append("  " * (depth + 1) + "· " + where(c["region"]))

    for flow, tops in book["flows"].items():
        lines.append(f"flow {flow}")
        for uid in tops:
            show(uid, 1)
    breaks = []
    for a, b in zip(order, order[1:]):
        across = [u for u in units if {a, b} <= pages_of(u)]
        names = [name(units[u]) for u in across]
        breaks.append(f"page {short_page(a)} → {short_page(b)}: " + (", ".join(names) if names else "nothing continues"))
    rels = [f"{r['type']}: {r['from'].get('unit') or r['from'].get('region')}" + (f" marker {r['from']['marker']}" if 'marker' in r['from'] else "") + f" → {r['to']['unit']}" for r in book.get("relations", [])]
    return lines + ["", "Continuing across each page break, outermost first:"] + breaks + (["", "Relations:"] + rels if rels else [])


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)
    c = sub.add_parser("check")
    c.add_argument("files", nargs="+", type=Path)
    c.add_argument("--types", type=Path)
    a = sub.add_parser("assemble")
    a.add_argument("pages", nargs="+", type=Path)
    a.add_argument("-o", "--output", type=Path, required=True)
    a.add_argument("--types", type=Path)
    t = sub.add_parser("tree")
    t.add_argument("book", type=Path)
    args = parser.parse_args()
    if args.command == "check":
        bad = 0
        for f in args.files:
            _, errors, warnings = check_file(f, args.types)
            print(f"{f}: {'ok' if not errors else f'{len(errors)} errors'}" + (f", {len(warnings)} warnings" if warnings else ""))
            for e in errors + [f"warning: {w}" for w in warnings]:
                print("  " + e)
            bad += bool(errors)
        sys.exit(1 if bad else 0)
    if args.command == "assemble":
        docs = []
        for f in args.pages:
            doc, errors, _ = check_file(f, args.types)
            if errors or doc["format"] != "page":
                sys.exit(f"{f}: not a valid page document: {errors[:3]}")
            docs.append(doc)
        tl = load_type_list(docs[0], args.types)
        book, warnings = assemble(docs, tl)
        errors = validate(book) or check_document(book, tl)[0]
        for w in warnings + errors:
            print(w)
        if errors:
            sys.exit(1)
        args.output.write_text(json.dumps(book, ensure_ascii=False, separators=(",", ":")) + "\n")
        print(f"{args.output}: {len(book['pages'])} pages, {len(book['units'])} units")
    if args.command == "tree":
        print("\n".join(tree_lines(json.loads(args.book.read_text()))))


if __name__ == "__main__":
    main()
