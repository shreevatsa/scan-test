#!/usr/bin/env python3
"""Build the worked examples of the draft book schema from method 041 regions and hand-written unit trees. Local only.

Each example directory holds a hand-written `tree.txt`: for each page, which method 041 regions form which units.
This script turns it into one page document per page (`pages/<page>.json`), assembles them with schema/book.py
into `book.json`, and writes the printed tree to `tree-printed.txt`. The generated files are rewritten on each run;
they depend only on tree.txt, the method 041 outputs and the input records.

tree.txt syntax, one item per line, '#' starts a comment:
  book <book_id>                       method <method id>
  page <input id> [label=<printed page number>]
  furniture r1 page_number, r12-r17 line_number    (furniture regions and their types)
  omit r18 r19                          (regions with no ink, left out)
  flow <name>                           (flow for the following top-level units)
  <type> [number] ["label"] [id=x] [open=start,end] [: r3 r4]   (a unit; indent two spaces per level)
  r8                                    (one of the enclosing unit's own regions, in reading order)
  relation <type> <region or unit id> [marker=x] -> <unit id>

Usage: uv run --offline python schema/examples/build.py schema/examples/<name>
"""
import hashlib
import json
import re
import shlex
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SCHEMA_DIR = HERE.parent
PROJECT_DIR = SCHEMA_DIR.parent
sys.path.insert(0, str(SCHEMA_DIR))
import book as bk  # noqa: E402


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def region_ids(text):
    out = []
    for tok in re.split(r"[\s,]+", text.strip()):
        if not tok:
            continue
        m = re.fullmatch(r"r(\d+)(?:-r(\d+))?", tok)
        if not m:
            raise ValueError(f"not a region: {tok}")
        a, b = int(m[1]), int(m[2] or m[1])
        out += [f"r{i}" for i in range(a, b + 1)]
    return out


def parse(path):
    """Return (header, pages); each page has its units, flows, furniture, omissions and relations."""
    header, pages, stack = {}, [], []
    for n, raw in enumerate(Path(path).read_text().splitlines(), 1):
        line = raw.split("#", 1)[0].rstrip() if not raw.lstrip().startswith("#") else ""
        if not line.strip():
            continue
        indent = (len(line) - len(line.lstrip())) // 2
        words = line.split()
        key = words[0]
        if indent == 0 and key in ("book", "method"):
            header[key] = words[1]
        elif indent == 0 and key == "page":
            page = dict(id=words[1], units=[], flows={}, furniture={}, omit=[], relations=[], flow=None, counts={})
            for w in words[2:]:
                k, v = w.split("=", 1)
                page[k] = v
            pages.append(page)
            stack = []
        elif indent == 0 and key == "furniture":
            for item in line[len("furniture"):].split(","):
                regs, kind = item.rsplit(None, 1)
                for r in region_ids(regs):
                    page["furniture"][r] = kind
        elif indent == 0 and key == "omit":
            page["omit"] += region_ids(line[len("omit"):])
        elif indent == 0 and key == "flow":
            page["flow"] = words[1]
            page["flows"].setdefault(words[1], [])
            stack = []
        elif indent == 0 and key == "relation":
            m = re.fullmatch(r"relation (\w+) (\S+)(?: marker=(\S+))? -> (\S+)", line.strip())
            if not m:
                raise ValueError(f"{path}:{n}: bad relation")
            src = {"region": m[2]} if re.fullmatch(r"r\d+", m[2]) else {"unit": m[2]}
            if m[3]:
                src["marker"] = m[3]
            page["relations"].append(dict(type=m[1], **{"from": src}, to={"unit": m[4]}))
        else:
            stack = stack[:indent]
            if indent and not stack:
                raise ValueError(f"{path}:{n}: indented line with no parent")
            if re.fullmatch(r"r\d+", line.strip()):
                stack[-1]["children"].append({"region": line.strip()})
                continue
            m = re.fullmatch(r"\s*(\w+)(.*?)(?::\s*(r[\d\s,r-]*))?", line)
            kind, rest, regs = m[1], m[2], m[3]
            unit = dict(type=kind, children=[])
            for tok in shlex.split(rest):
                if tok.startswith("id="):
                    unit["id"] = tok[3:]
                elif tok.startswith("open="):
                    unit["open"] = {k: True for k in tok[5:].split(",")}
                elif " " in tok or "–" in tok or not re.fullmatch(r"[0-9]+[a-z]?", tok):
                    unit["label"] = tok
                else:
                    unit["number"] = tok
            if "id" not in unit:
                base = f"{kind}-{unit['number']}" if "number" in unit else f"{kind}-{page['counts'].get(kind, 0) + 1}"
                page["counts"][kind] = page["counts"].get(kind, 0) + 1
                unit["id"] = base
            if regs:
                unit["children"] += [{"region": r} for r in region_ids(regs)]
            page["units"].append(unit)
            if stack:
                stack[-1]["children"].append({"unit": unit["id"]})
            else:
                page["flows"][page["flow"]].append(unit["id"])
            stack.append(unit)
    return header, pages


def build_page(spec, header, tl, tree_path):
    pid = spec["id"]
    src_path = PROJECT_DIR / "outputs" / pid / header["method"] / "regions.json"
    src = json.loads(src_path.read_text())
    record = json.loads((PROJECT_DIR / "inputs" / f"{pid}.json").read_text())
    owner_type = {}
    for u in spec["units"]:
        for c in u["children"]:
            if "region" in c:
                owner_type[c["region"]] = u["type"]
    regions, differences = [], []
    for r in src["regions"]:
        rid = f"r{r['region_id']}"
        if rid in spec["omit"]:
            continue
        kind = owner_type.get(rid) or spec["furniture"].get(rid)
        if kind is None:
            raise ValueError(f"{pid} {rid}: not in the tree, not furniture and not omitted")
        if r["polygons"] is None:
            raise ValueError(f"{pid} {rid}: no polygon; omit it")
        cls = tl["types"][kind]["region"]
        if cls != r["type"]:
            differences.append(dict(region=rid, method_class=r["type"], book_type=kind, book_class=cls))
        regions.append(dict(
            id=rid, type=kind, polygons=r["polygons"],
            lines=[dict(line=L["line_id"], polygons=L["polygons"]) for L in r["lines"] if L.get("polygons")],
            order=r["reading_order"],
            source=dict(method=header["method"], region_id=r["region_id"], method_class=r["type"], keep=r["keep"],
                        uncertain=r["uncertain"], continues_from_earlier=r["continues_from_earlier"],
                        continues_later=r["continues_later"], model_box=r["model_box"], status=r["status"])))
    for u in spec["units"]:
        for c in u["children"]:
            if "region" in c:
                c["region"] = f"{pid}#{c['region']}"
    for rel in spec["relations"]:
        if "region" in rel["from"]:
            rel["from"]["region"] = f"{pid}#{rel['from']['region']}"
    page = dict(id=pid, image=record["image"], image_sha256=record["image_sha256"], width=record["width"], height=record["height"])
    if "label" in spec:
        page["label"] = spec["label"]
    page.update(regions=regions, source=dict(regions_json=str(src_path.relative_to(PROJECT_DIR)), regions_sha256=digest(src_path)))
    units = [{k: u[k] for k in ("id", "type", "number", "label", "open", "children") if k in u} for u in spec["units"]]
    doc = dict(format="page", schema_version="0.1", book_id=header["book"], page=page, units=units,
               flows=spec["flows"], relations=spec["relations"],
               source=dict(built_by="schema/examples/build.py", tree=str(tree_path.relative_to(PROJECT_DIR)),
                           tree_sha256=digest(tree_path), omitted_regions=spec["omit"], class_differences=differences,
                           note="Unit tree written by Claude from the page images on 2026-11-05, not yet reviewed by the user."))
    return doc, differences


def dump(value, indent=0):
    """JSON with one line per object member, but coordinate lists kept on one line."""
    compact = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    if len(compact) <= 100 or (isinstance(value, list) and all(isinstance(v, (int, float, list)) for v in value)):
        return compact
    pad = " " * (indent + 1)
    if isinstance(value, dict):
        items = [f"{pad}{json.dumps(k, ensure_ascii=False)}: {dump(v, indent + 1)}" for k, v in value.items()]
        return "{\n" + ",\n".join(items) + "\n" + " " * indent + "}"
    if isinstance(value, list):
        return "[\n" + ",\n".join(pad + dump(v, indent + 1) for v in value) + "\n" + " " * indent + "]"
    return compact


def main():
    out_dir = Path(sys.argv[1]).resolve()
    tree_path = out_dir / "tree.txt"
    header, specs = parse(tree_path)
    tl = json.loads((SCHEMA_DIR / "types" / f"{header['book']}.json").read_text())
    (out_dir / "pages").mkdir(exist_ok=True)
    docs, failed = [], False
    for spec in specs:
        doc, differences = build_page(spec, header, tl, tree_path)
        errors = bk.validate(doc) or bk.check_document(doc, tl)[0]
        warnings = [] if errors else bk.check_document(doc, tl)[1]
        path = out_dir / "pages" / f"{spec['id']}.json"
        path.write_text(dump(doc) + "\n")
        print(f"{path.relative_to(PROJECT_DIR)}: {len(doc['page']['regions'])} regions, {len(doc['units'])} units, "
              f"{'ok' if not errors else errors}; method classes differing from the book types: {differences or 'none'}")
        for w in warnings:
            print("  warning:", w)
        failed |= bool(errors)
        docs.append(doc)
    if failed:
        sys.exit(1)
    book, warnings = bk.assemble(docs, tl)
    errors = bk.validate(book) or bk.check_document(book, tl)[0]
    for w in warnings + errors:
        print(w)
    if errors:
        sys.exit(1)
    (out_dir / "book.json").write_text(dump(book) + "\n")
    printed = "\n".join(bk.tree_lines(book)) + "\n"
    (out_dir / "tree-printed.txt").write_text(printed)
    print(f"{(out_dir / 'book.json').relative_to(PROJECT_DIR)}: {len(book['units'])} units")
    print(printed)


if __name__ == "__main__":
    main()
