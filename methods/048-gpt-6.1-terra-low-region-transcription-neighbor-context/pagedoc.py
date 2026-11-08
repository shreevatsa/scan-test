"""Turn method 044's parsed response into a page document of the draft book schema (schema/README.md). Local only.

Line text goes onto method 043's line pieces by position. Units, flows and relations are taken as returned, with
region ids made page-qualified. Nothing is repaired: whatever breaks the schema's rules is reported by
schema/book.py, and the report is saved with the result."""
import re
import sys
from pathlib import Path

PROJECT_DIR = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT_DIR / "schema"))
import book as bk  # noqa: E402

DIGITS = str.maketrans("०१२३४५६७८९", "0123456789")
HYPHENS = ("-", "‐", "‑", "­")


def join_pieces(pieces):
    """A unit's text from its (text, end) pieces in order."""
    out = ""
    for i, (text, end) in enumerate(pieces):
        out += text
        if i == len(pieces) - 1:
            break
        if end == "hyphen":
            if out.endswith(HYPHENS):
                out = out[:-1]
        elif end == "line":
            out += "\n"
        elif end != "join":
            out += " "
    return out


def page_label(regions):
    for r in regions:
        if r["type"] == "page_number":
            digits = re.sub(r"\D", "", "".join(L.get("text", "") for L in r["lines"]).translate(DIGITS))
            if digits:
                return digits
    return None


def build(pid, record, tl, sent, parsed, source):
    """sent: [{rid, region (method 043 record), line_ids}] in request order. Returns (document, problems)."""
    problems, regions, omitted = [], [], []
    returned = parsed.get("regions", {})
    kept_ids, line_ids = set(), {}
    for s in sent:
        rid, src = s["rid"], s["region"]
        o = returned.get(rid)
        if o is None:
            problems.append(f"{rid}: not returned")
            continue
        lines = o["lines"]
        aligned = len(lines) == len(s["line_ids"])
        if not aligned:
            problems.append(f"{rid}: {len(lines)} lines returned for {len(s['line_ids'])} line pieces; no line text kept")
        elif [L["n"] for L in lines] != list(range(1, len(lines) + 1)):
            problems.append(f"{rid}: line numbers {[L['n'] for L in lines]}; text kept by position")
        rtype = o["type"]
        if rtype not in tl["types"]:
            omitted.append(dict(region=rid, type=rtype, text=[L["text"] for L in lines]))
            continue
        polys = {L["line_id"]: L["polygons"] for L in src["lines"] if L.get("polygons")}
        recs = []
        for k, lid in enumerate(s["line_ids"]):
            rec = dict(line=lid, polygons=polys[lid])
            if aligned:
                rec["text"] = lines[k]["text"]
                if lines[k]["end"] != "space":
                    rec["end"] = lines[k]["end"]
            recs.append(rec)
        info = dict(method=source["regions_method"], region_id=src["region_id"], method_type=src["type"],
                    region_class=src["region_class"], keep=src["keep"], uncertain=src["uncertain"],
                    continues_from_earlier=src["continues_from_earlier"], continues_later=src["continues_later"],
                    model_box=src["model_box"],
                    transcription=dict(uncertain=o["uncertain"], note=o["note"]))
        if rtype != src["type"]:
            info["retyped_from"] = src["type"]
        if not aligned:
            info["transcription"]["lines"] = lines
        regions.append(dict(id=rid, type=rtype, polygons=src["polygons"], lines=recs, order=src["reading_order"], source=info))
        kept_ids.add(rid)
        line_ids[rid] = s["line_ids"]
    omitted_ids = {o["region"] for o in omitted}
    units = []
    for u in parsed.get("units", []):
        children = []
        for c in u["children"]:
            if c in omitted_ids:
                problems.append(f"unit {u['id']}: child {c} is of type other and left out")
            elif c in kept_ids or re.fullmatch(r"r\d+", c):
                children.append({"region": f"{pid}#{c}"})
            else:
                children.append({"unit": c})
        d = dict(id=u["id"], type=u["type"])
        if u["number"] is not None:
            d["number"] = u["number"]
        if u["label"] is not None:
            d["label"] = u["label"]
        if u["open_start"] or u["open_end"]:
            d["open"] = {k: True for k, v in (("start", u["open_start"]), ("end", u["open_end"])) if v}
        d["children"] = children
        units.append(d)
    flows = {}
    for f in parsed.get("flows", []):
        flows.setdefault(f["flow"], []).extend(f["units"])
    relations = []
    texts = {r["id"]: r["lines"] for r in regions}
    for rel in parsed.get("relations", []):
        frm = {"region": f"{pid}#{rel['region']}"}
        n = rel["line"]
        if rel["region"] in line_ids and 1 <= n <= len(line_ids[rel["region"]]):
            piece = texts[rel["region"]][n - 1]
            frm["line"] = piece["line"]
            if rel["marker"]:
                at = piece.get("text", "").find(f"[{rel['marker']}]")
                if at >= 0:
                    frm.update(start=at, end=at + len(rel["marker"]) + 2)
                else:
                    problems.append(f"relation to {rel['to']}: marker [{rel['marker']}] not in {rel['region']} line {n}")
        else:
            problems.append(f"relation to {rel['to']}: no line {n} in {rel['region']}")
        if rel["marker"]:
            frm["marker"] = rel["marker"]
        relations.append({"type": rel["type"], "from": frm, "to": {"unit": rel["to"]}})
    page = dict(id=pid, image=record["image"], image_sha256=record["image_sha256"], width=record["width"], height=record["height"])
    label = page_label(regions)
    if label:
        page["label"] = label
    page.update(regions=regions, source=dict(regions=source["regions_path"], regions_sha256=source["regions_sha256"]))
    doc = dict(format="page", schema_version="0.1", book_id=tl["book_id"], page=page, units=units, flows=flows,
               relations=relations, source=dict(source, omitted_regions=omitted, problems=problems))
    return doc, problems


def check(doc, tl):
    errors = bk.validate(doc)
    if errors:
        return errors, []
    return bk.check_document(doc, tl)


def transcript(doc, tl):
    """A readable listing: each flow's units depth-first with their text, then the furniture."""
    units = {u["id"]: u for u in doc["units"]}
    regions = {f"{doc['page']['id']}#{r['id']}": r for r in doc["page"]["regions"]}
    out, seen = [], set()

    def text(r):
        return join_pieces([(L.get("text", "?"), L.get("end", "space")) for L in r["lines"]])

    def show(uid, depth):
        u = units.get(uid)
        pad = "  " * depth
        if u is None:
            out.append(f"{pad}?? unknown unit {uid}")
            return
        if uid in seen:
            out.append(f"{pad}?? {uid} again")
            return
        seen.add(uid)
        flags = [k for k in ("start", "end") if u.get("open", {}).get(k)]
        head = " ".join(x for x in [u["type"], u.get("number", ""), repr(u["label"]) if "label" in u else "",
                                    f"(open {'+'.join(flags)})" if flags else "", f"[{uid}]"] if x)
        out.append(pad + head)
        for c in u["children"]:
            if "unit" in c:
                show(c["unit"], depth + 1)
            else:
                r = regions.get(c["region"])
                if r is None:
                    out.append(f"{pad}  ?? unknown region {c['region']}")
                    continue
                body = text(r).replace("\n", "\n" + pad + "     ")
                out.append(f"{pad}  {r['id']}: {body}")

    for flow, ids in doc["flows"].items():
        out.append(f"flow {flow}")
        for uid in ids:
            show(uid, 1)
    rest = [u["id"] for u in doc["units"] if u["id"] not in seen]
    if rest:
        out.append("units in no flow and no unit: " + ", ".join(rest))
    furn = [r for r in doc["page"]["regions"] if tl["types"].get(r["type"], {}).get("role") == "furniture"]
    if furn:
        out.append("furniture")
        out += [f"  {r['id']} {r['type']}: {text(r)}" for r in furn]
    for o in doc["source"].get("omitted_regions", []):
        out.append(f"left out: {o['region']} {o['type']}: {' / '.join(o['text'])}")
    return "\n".join(out) + "\n"
