#!/usr/bin/env python3
"""Reference results from schema/book.py and schema/inline.py, for the web app's parity tests (parity.test.mjs).

  py_reference.py check BOOK_FOLDER       every page document, and broken copies of a few, with book.py's check
  py_reference.py assemble BOOK_FOLDER    the book assembled by book.py (units, flows, relations, warnings)
  py_reference.py parse                   parse_line and formatted_runs on the JSON cases read from stdin

Output is JSON on stdout. Local only.
"""
import copy
import json
import sys
from pathlib import Path

PROJECT_DIR = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT_DIR / "schema"))
import book as bk  # noqa: E402
import inline  # noqa: E402


def load(folder):
    folder = Path(folder)
    m = json.loads((folder / "book.json").read_text())
    tl = json.loads((folder / m["types"]).read_text())
    docs = [json.loads((folder / p["document"]).read_text()) for p in m["pages"]]
    return tl, docs


def check(doc, tl):
    errors = bk.validate(doc)
    if errors:
        return errors, []
    return bk.check_document(doc, tl)


def mutations(doc, tl):
    """Broken copies of a page document, each with one kind of fault."""
    out = []
    if not doc["units"]:
        return out

    def case(name, f):
        d = copy.deepcopy(doc)
        if f(d) is not False:
            out.append((name, d))

    regs, units = doc["page"]["regions"], doc["units"]
    owned = [u for u in units if any("region" in c for c in u["children"])]
    containers = [u for u in units if any("unit" in c for c in u["children"])]
    marked = [(i, j, k) for i, r in enumerate(regs) for j, L in enumerate(r.get("lines", []))
              for k, s in enumerate(L.get("spans", [])) if s["kind"] == "note_marker"]
    case("unknown region type", lambda d: d["page"]["regions"][0].update(type="no_such_type"))
    case("orphan region", lambda d: d["units"][units.index(owned[0])]["children"].pop(0)
         if owned and len(owned[0]["children"]) > 1 else False)
    case("duplicate unit", lambda d: d["units"].append(copy.deepcopy(d["units"][0])))
    case("unknown anchor", lambda d: d.setdefault("relations", []).append(
        {"type": "note", "from": {"anchor": d["page"]["id"] + "#nothing"}, "to": {"unit": d["units"][0]["id"]}}))
    case("unknown relation type", lambda d: d.setdefault("relations", []).append(
        {"type": "no_such_relation", "from": {"unit": d["units"][0]["id"]}, "to": {"unit": d["units"][-1]["id"]}}))
    if marked:
        i, j, k = marked[0]
        case("wide marker", lambda d: d["page"]["regions"][i]["lines"][j]["spans"][k].update(end=d["page"]["regions"][i]["lines"][j]["spans"][k]["end"] + 1))
        case("marker without id", lambda d: d["page"]["regions"][i]["lines"][j]["spans"][k].pop("id"))
    texted = [(i, j) for i, r in enumerate(regs) for j, L in enumerate(r.get("lines", [])) if L.get("text")]
    if texted:
        i, j = texted[0]
        case("span outside text", lambda d: d["page"]["regions"][i]["lines"][j].setdefault("spans", []).append(
            {"start": 0, "end": len(d["page"]["regions"][i]["lines"][j]["text"]) + 3, "kind": "bold"}))
        case("unknown span kind", lambda d: d["page"]["regions"][i]["lines"][j].setdefault("spans", []).append(
            {"start": 0, "end": 1, "kind": "glowing"}))
    if containers:
        u = containers[0]
        case("open end on a middle child", lambda d: next(x for x in d["units"] if x["id"] == u["children"][0].get("unit", "?")).update(open={"end": True})
             if len(u["children"]) > 1 and "unit" in u["children"][0] else False)
        case("child type not allowed", lambda d: next(x for x in d["units"] if x["id"] == u["id"])["children"].append(
            {"unit": d["units"][0]["id"]}) if d["units"][0]["id"] != u["id"] else False)
    case("unknown flow", lambda d: d["flows"].update(nowhere=[]))
    case("flows reversed", lambda d: [d["flows"].__setitem__(f, list(reversed(v))) for f, v in d["flows"].items()])
    case("region type changed", lambda d: owned and d["page"]["regions"].__getitem__(
        [r["id"] for r in regs].index(owned[-1]["children"][0]["region"].split("#")[1])).update(
        type=next((t for t, v in tl["types"].items() if "region" in v and t != owned[-1]["type"] and v.get("role") != "furniture"), "x")))
    return out


def main():
    cmd = sys.argv[1]
    if cmd == "check":
        tl, docs = load(sys.argv[2])
        cases = []
        for d in docs:
            e, w = check(d, tl)
            cases.append(dict(name=d["page"]["id"], errors=e, warnings=w))
        for d in docs[::max(1, len(docs) // 12)]:
            for name, m in mutations(d, tl):
                e, w = check(m, tl)
                cases.append(dict(name=f"{d['page']['id']}: {name}", doc=m, errors=e, warnings=w))
        json.dump(cases, sys.stdout, ensure_ascii=False)
    elif cmd == "assemble":
        tl, docs = load(sys.argv[2])
        book, warnings = bk.assemble(docs, tl)
        json.dump(dict(units=book["units"], flows=book["flows"], relations=book["relations"], warnings=warnings,
                       schema_version=book["schema_version"], errors=bk.validate(book) or bk.check_document(book, tl)[0]),
                  sys.stdout, ensure_ascii=False)
    elif cmd == "gray":
        # The page as method 043 reads it: PIL's grayscale conversion, row-major bytes.
        from PIL import Image
        Path(sys.argv[3]).write_bytes(Image.open(sys.argv[2]).convert("L").tobytes())
    elif cmd == "analysis":
        import numpy as np
        from PIL import Image
        m43 = PROJECT_DIR / "methods" / "043-gpt-6.1-terra-none-book-types-continuations-band-chained-lines"
        sys.path.insert(0, str(m43))
        import analysis as an  # noqa: E402
        gray = np.asarray(Image.open(sys.argv[2]).convert("L"))
        detail, arrays = an.analyze(gray, json.loads((m43 / "line-config.json").read_text()))
        s = detail["summary"]
        json.dump(dict(status=s["status"], char_h=s.get("char_h"), angle=s.get("page_angle_deg"), thresholds=detail.get("thresholds"),
                       components=int(len(arrays["comp"]["stats"])) if arrays else None,
                       lines=[dict(column=L["column"], center=L["center"], rx0=L["rx0"], rx1=L["rx1"]) for L in detail.get("lines", [])]), sys.stdout)
    elif cmd == "prompts":
        # Method 042's and method 055's prompts and schemas for a type list (and region ids for 055's schema).
        import importlib.util
        def load_module(path, name):
            spec = importlib.util.spec_from_file_location(name, path)
            mod = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(mod)
            return mod
        p42 = load_module(PROJECT_DIR / "methods/042-gpt-6.1-terra-none-book-types-continuations/prompt.py", "p42")
        p55 = load_module(PROJECT_DIR / "methods/055-gemini-4-argon-low-region-transcription-formatting/prompt.py", "p55")
        tl = json.loads(Path(sys.argv[2]).read_text())
        ids = sys.argv[3].split(",")
        json.dump(dict(region_prompt=p42.build_prompt(tl), region_schema=p42.build_schema(tl), transcription_prompt=p55.build_prompt(tl),
                       transcription_schema=p55.build_schema(tl, [(i, 3) for i in ids], False, True),
                       caption=p55.region_caption("r2", "verse", 1)), sys.stdout, ensure_ascii=False)
    elif cmd == "parse":
        out = []
        for text, tags, n in json.load(sys.stdin):
            plain, spans, still, nxt = inline.parse_line(text, tuple(tags), n)
            out.append([plain, spans, list(still), nxt])
        json.dump(out, sys.stdout, ensure_ascii=False)


if __name__ == "__main__":
    main()
