#!/usr/bin/env python3
"""Book-level continuation linker for this method's regions, scored against the continuation truth. No API calls.

Method 042: method 040's linker, with streams taken from each region's region_class (book types such as footnote
have class note), and with --runs to score only some runs of the truth (those of books with a type list).

The linker works on the saved regions.json of each page in a run of consecutive pages (inputs/pages-runs.json):
- Streams: kept regions of type note form the notes stream; figures and captions form their own stream; every other
  kept region is body. Regions not kept (running headers, page numbers, margin furniture) are in no stream.
- Order: pages in run order, then kept regions in reading order.
- Candidates: each region R and the next region T of its stream, if T is on the same page or the next page.
- Rule (fixed before any output was scored): link R to T if R.continues_later and T.continues_from_earlier ("both").
  Three looser rules are reported for comparison: "later" (R's flag alone), "earlier" (T's flag alone) and "either".

Scoring uses references/continuations/truth.json. Each truth edge's anchor point is mapped to the smallest kept model
box containing it, allowing a margin of TOLERANCE_PX:
- the edge is scored on that region's continues_from_earlier flag (for a start edge) or continues_later flag (for an end edge);
- a truth link is found if the linker links the region of its end edge to the region of its start edge;
- a predicted link is wrong if it is not a truth link but leaves a region that holds a truth end edge or enters one
  that holds a truth start edge, and unscored otherwise (such as a sentence that continues past a displayed formula).
"""
import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
PROJECT_DIR = HERE.parent.parent
TOLERANCE_PX = 15
RULES = ("both", "later", "earlier", "either")


def digest(data):
    return hashlib.sha256(data).hexdigest()


def stream_of(region):
    if not region["keep"]:
        return None
    cls = region.get("region_class", region["type"])
    if cls == "note":
        return "notes"
    if cls in ("figure", "caption"):
        return "figure"
    return "body"


def load_page(method, page, request):
    path = PROJECT_DIR / "outputs" / page / method / ("run-002" if request == "run-002" else "") / "regions.json"
    data = json.loads(path.read_text())
    regions = [dict(r, page=page, stream=stream_of(r)) for r in data["regions"]]
    return path, regions


def ordered(regions):
    kept = [r for r in regions if r["stream"]]
    return sorted(kept, key=lambda r: (r["reading_order"] if r["reading_order"] is not None else 10**6, r["region_id"]))


def candidates(pages, by_page):
    """Consecutive same-stream pairs (R, T) with T on the same page as R or on the next page."""
    sequence = [(i, r) for i, page in enumerate(pages) for r in ordered(by_page[page])]
    pairs = []
    for stream in ("body", "notes", "figure"):
        items = [(i, r) for i, r in sequence if r["stream"] == stream]
        for (i, a), (j, b) in zip(items, items[1:]):
            if j - i <= 1:
                pairs.append((a, b))
    return pairs


def decide(rule, a, b):
    later, earlier = bool(a.get("continues_later")), bool(b.get("continues_from_earlier"))
    return dict(both=later and earlier, later=later, earlier=earlier, either=later or earlier)[rule]


def region_at(regions, point):
    x, y = point
    hits = []
    for r in regions:
        if not r["stream"]:
            continue
        x0, y0, x1, y1 = r["box"]
        if x0 - TOLERANCE_PX <= x <= x1 + TOLERANCE_PX and y0 - TOLERANCE_PX <= y <= y1 + TOLERANCE_PX:
            hits.append(((x1 - x0) * (y1 - y0), r))
    return min(hits, key=lambda h: h[0])[1] if hits else None


def key(r):
    return (r["page"], r["region_id"]) if r else None


def score_run(name, run, method, request):
    pages = sorted({e["page"] for e in run["edges"]})
    by_page, paths = {}, {}
    for page in pages:
        paths[page], by_page[page] = load_page(method, page, request)
    edges = []
    for e in run["edges"]:
        r = region_at(by_page[e["page"]], e["anchor"]["point"])
        flag = None if r is None else bool(r.get("continues_from_earlier" if e["edge"] == "start" else "continues_later"))
        edges.append(dict(page=e["page"], stream=e["stream"], edge=e["edge"], line=e["anchor"]["line"], truth=e["continues"],
                          region=key(r), region_type=r["type"] if r else None, region_stream=r["stream"] if r else None,
                          flag=flag, correct=flag == e["continues"]))
    by_anchor = {(e["page"], e["line"], e["edge"]): e for e in edges}
    truth_links = []
    for link in run["links"]:
        a = by_anchor[(link["from"]["page"], link["from"]["line"], "end")]["region"]
        b = by_anchor[(link["to"]["page"], link["to"]["line"], "start")]["region"]
        truth_links.append(dict(stream=link["stream"], from_region=a, to_region=b))
    truth_pairs = {(t["from_region"], t["to_region"]) for t in truth_links}
    end_regions = {e["region"] for e in edges if e["edge"] == "end"}
    start_regions = {e["region"] for e in edges if e["edge"] == "start"}
    pairs = candidates(pages, by_page)
    links = {}
    for rule in RULES:
        predicted = [(key(a), key(b)) for a, b in pairs if decide(rule, a, b)]
        found = [t for t in truth_links if (t["from_region"], t["to_region"]) in set(predicted)]
        wrong = [p for p in predicted if p not in truth_pairs and (p[0] in end_regions or p[1] in start_regions)]
        unscored = [p for p in predicted if p not in truth_pairs and p not in wrong]
        links[rule] = dict(predicted=predicted, found=len(found), truth=len(truth_links), wrong=wrong, unscored=unscored)
    sources = {page: dict(path=str(paths[page].relative_to(PROJECT_DIR)), sha256=digest(paths[page].read_bytes())) for page in pages}
    return dict(run=name, request=request, edges=edges, truth_links=truth_links, links=links, sources=sources), by_page


def sheet(run_name, result, by_page, out_path):
    """Thumbnails of a run: kept boxes by stream, flags as arrows, truth anchors green if scored correctly, red if not."""
    pages = sorted(by_page)
    tiles = []
    for page in pages:
        im = Image.open(PROJECT_DIR / "inputs" / f"{page}.png").convert("RGB")
        d = ImageDraw.Draw(im)
        font = ImageFont.load_default(size=max(18, im.height // 60))
        colors = dict(body=(30, 90, 220), notes=(200, 120, 0), figure=(120, 0, 160))
        for r in ordered(by_page[page]):
            x0, y0, x1, y1 = r["box"]
            c = colors[r["stream"]]
            d.rectangle((x0, y0, x1, y1), outline=c, width=4)
            tag = ("↑ " if r.get("continues_from_earlier") else "") + f"{r['reading_order']} {r['type']}" + (" ↓" if r.get("continues_later") else "")
            d.text((x0 + 6, y0 + 4), tag, fill=c, font=font)
        for e, t in zip(result["edges"], [e for e in TRUTH_EDGES[run_name]]):
            if e["page"] != page:
                continue
            x, y = t["anchor"]["point"]
            c = (0, 170, 0) if e["correct"] else (230, 0, 0)
            d.ellipse((x - 16, y - 16, x + 16, y + 16), outline=c, width=6)
            d.text((x + 20, y - 14), f"{e['edge']} {'T' if e['truth'] else 'F'}", fill=c, font=font)
        s = 900 / im.height
        tiles.append(im.resize((int(im.width * s), 900), Image.LANCZOS))
    out = Image.new("RGB", (sum(t.width + 8 for t in tiles), 940), "white")
    d = ImageDraw.Draw(out)
    d.text((6, 4), f"{run_name} {result['request']}: links (both) {result['links']['both']['found']}/{result['links']['both']['truth']}, wrong {len(result['links']['both']['wrong'])}", fill=(0, 0, 0), font=ImageFont.load_default(size=22))
    x = 0
    for t in tiles:
        out.paste(t, (x, 36))
        x += t.width + 8
    out.save(out_path)


TRUTH_EDGES = {}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path, help="new directory for the report")
    parser.add_argument("--method", default=HERE.name, help="method whose saved regions.json files to read")
    parser.add_argument("--truth", type=Path, default=PROJECT_DIR / "references" / "continuations" / "truth.json")
    parser.add_argument("--no-sheets", action="store_true")
    parser.add_argument("--runs", nargs="+", help="truth runs to score (default: all)")
    args = parser.parse_args()
    if args.output.exists() and any(args.output.iterdir()):
        parser.error("Output directory already exists and is not empty.")
    truth_bytes = args.truth.read_bytes()
    truth = json.loads(truth_bytes)
    if args.runs:
        unknown = set(args.runs) - set(truth["runs"])
        if unknown:
            parser.error("Unknown runs: " + ", ".join(sorted(unknown)))
        truth["runs"] = {name: truth["runs"][name] for name in args.runs}
    for name, run in truth["runs"].items():
        TRUTH_EDGES[name] = run["edges"]
    args.output.mkdir(parents=True, exist_ok=True)
    results = []
    for request in ("run-001", "run-002"):
        for name, run in truth["runs"].items():
            result, by_page = score_run(name, run, args.method, request)
            results.append(result)
            if not args.no_sheets:
                sheet(name, result, by_page, args.output / f"{name}-{request}.png")
    summary = {}
    for request in ("run-001", "run-002"):
        rs = [r for r in results if r["request"] == request]
        edges = [e for r in rs for e in r["edges"]]
        summary[request] = dict(
            edges=len(edges), correct=sum(e["correct"] for e in edges), no_region=sum(e["region"] is None for e in edges),
            true_positive=sum(e["truth"] and e["flag"] is True for e in edges), false_negative=sum(e["truth"] and e["flag"] is not True for e in edges),
            false_positive=sum((not e["truth"]) and e["flag"] is True for e in edges), true_negative=sum((not e["truth"]) and e["flag"] is False for e in edges),
            stream_mismatch=sum(e["region_stream"] is not None and e["region_stream"] != e["stream"] for e in edges),
            per_run={r["run"]: dict(correct=sum(e["correct"] for e in r["edges"]), edges=len(r["edges"])) for r in rs},
            links={rule: dict(found=sum(r["links"][rule]["found"] for r in rs), truth=sum(r["links"][rule]["truth"] for r in rs),
                              wrong=sum(len(r["links"][rule]["wrong"]) for r in rs), unscored=sum(len(r["links"][rule]["unscored"]) for r in rs))
                   for rule in RULES})
    record = dict(created_at_utc=datetime.now(timezone.utc).isoformat(), api_calls=0, method=args.method,
                  truth=dict(path=str(args.truth.resolve().relative_to(PROJECT_DIR)), sha256=digest(truth_bytes)),
                  script=dict(path=str(Path(__file__).resolve().relative_to(PROJECT_DIR)), sha256=digest(Path(__file__).read_bytes())),
                  runs=list(truth["runs"]), tolerance_px=TOLERANCE_PX, primary_rule="both", summary=summary, results=results)
    (args.output / "continuations.json").write_text(json.dumps(record, indent=1, ensure_ascii=False) + "\n")
    print(json.dumps(summary, indent=1))


if __name__ == "__main__":
    main()
