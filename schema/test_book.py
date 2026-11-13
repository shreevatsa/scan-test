#!/usr/bin/env python3
"""Tests for schema/book.py. Local only. Usage: uv run --offline python schema/test_book.py"""
import copy
import json
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import book as bk  # noqa: E402
import inline  # noqa: E402

SQUARE = [[[0, 0], [10, 0], [10, 10], [0, 10]]]
TYPES = {
    "format": "types", "schema_version": "0.1", "book_id": "toy", "title": "Toy book",
    "flows": {"main": "text", "notes": "notes"},
    "types": {
        "story": {"description": "a story", "contains": ["paragraph"], "flow": "main"},
        "paragraph": {"description": "prose", "region": "paragraph", "contains": ["verse"]},
        "verse": {"description": "a verse", "region": "verse"},
        "footnote": {"description": "a note", "region": "note", "flow": "notes"},
        "page_number": {"description": "folio", "role": "furniture", "region": "page_number"},
    },
    "relations": {"note": "marker to note"},
}


def page(pid, regions, units, flows, relations=()):
    return {"format": "page", "schema_version": "0.1", "book_id": "toy",
            "page": {"id": pid, "image": f"{pid}.png", "width": 100, "height": 100,
                     "regions": [{"id": r, "type": t, "polygons": SQUARE, "order": i + 1} for i, (r, t) in enumerate(regions)]},
            "units": units, "flows": flows, "relations": list(relations)}


def two_pages():
    """A story whose paragraph quotes a verse at the foot of page 1 and resumes on page 2."""
    p1 = page("p1", [("r1", "paragraph"), ("r2", "verse"), ("r3", "page_number"), ("r4", "footnote")],
              [{"id": "s", "type": "story", "children": [{"unit": "para"}], "open": {"end": True}},
               {"id": "para", "type": "paragraph", "children": [{"region": "p1#r1"}, {"unit": "v"}], "open": {"end": True}},
               {"id": "v", "type": "verse", "number": "1", "children": [{"region": "p1#r2"}]},
               {"id": "n", "type": "footnote", "children": [{"region": "p1#r4"}]}],
              {"main": ["s"], "notes": ["n"]},
              [{"type": "note", "from": {"region": "p1#r1", "marker": "1"}, "to": {"unit": "n"}}])
    p2 = page("p2", [("r1", "paragraph"), ("r2", "paragraph")],
              [{"id": "s", "type": "story", "children": [{"unit": "a"}, {"unit": "b"}], "open": {"start": True}},
               {"id": "a", "type": "paragraph", "children": [{"region": "p2#r1"}], "open": {"start": True}},
               {"id": "b", "type": "paragraph", "children": [{"region": "p2#r2"}]}],
              {"main": ["s"]})
    return p1, p2


def errors_of(doc):
    return bk.validate(doc) or bk.check_document(doc, TYPES)[0]


class Tests(unittest.TestCase):
    def test_types_and_pages_valid(self):
        self.assertEqual(bk.validate(TYPES) + bk.check_types(TYPES), [])
        for p in two_pages():
            self.assertEqual(errors_of(p), [])

    def test_assembly_merges_each_open_level(self):
        book, warnings = bk.assemble(list(two_pages()), TYPES)
        self.assertEqual(warnings, [])
        self.assertEqual(errors_of(book), [])
        units = {u["id"]: u for u in book["units"]}
        self.assertEqual(book["flows"]["main"], ["p1#s"])
        self.assertEqual(units["p1#s"]["children"], [{"unit": "p1#para"}, {"unit": "p2#b"}])
        self.assertEqual(units["p1#para"]["children"], [{"region": "p1#r1"}, {"unit": "p1#v"}, {"region": "p2#r1"}])
        self.assertNotIn("p2#a", units)
        self.assertNotIn("open", units["p1#s"])
        self.assertEqual(book["relations"][0]["to"], {"unit": "p1#n"})
        lines = bk.tree_lines(book)
        self.assertIn("page p1 → p2: story, paragraph", lines)

    def test_schema_rejects_bad_shapes(self):
        p1, _ = two_pages()
        bad = copy.deepcopy(p1)
        bad["page"]["regions"][0]["polygons"] = [[[0, 0], [1, 1]]]
        self.assertTrue(bk.validate(bad))
        bad = copy.deepcopy(p1)
        bad["units"][0]["children"] = []
        self.assertTrue(bk.validate(bad))
        bad = copy.deepcopy(p1)
        bad["units"][2]["colour"] = "red"
        self.assertTrue(bk.validate(bad))

    def test_rules(self):
        p1, p2 = two_pages()
        cases = {
            "owned by": lambda d: d["units"][2]["children"].append({"region": "p1#r1"}),
            "owns region": lambda d: d["units"][2]["children"].append({"region": "p1#r4"}),
            "may not contain": lambda d: d["units"][0]["children"].append({"unit": "v"}),
            "furniture owned": lambda d: d["units"][1]["children"].insert(0, {"region": "p1#r3"}),
            "owned by no unit": lambda d: d["page"]["regions"].append({"id": "r9", "type": "verse", "polygons": SQUARE}),
            "not the last child": lambda d: (d["page"]["regions"].append({"id": "r9", "type": "paragraph", "polygons": SQUARE}),
                                             d["units"].append({"id": "para2", "type": "paragraph", "children": [{"region": "p1#r9"}]}),
                                             d["units"][0]["children"].append({"unit": "para2"})),
            "unknown type": lambda d: d["relations"][0].update(type="cites"),
        }
        for expected, change in cases.items():
            doc = copy.deepcopy(p1)
            change(doc)
            found = errors_of(doc)
            self.assertTrue(any(expected in e for e in found), (expected, found))
        doc = copy.deepcopy(p2)
        doc["units"][0]["open"] = {}
        self.assertTrue(any("its parent" in e for e in errors_of(doc)))

    def test_unmatched_open_end_warns(self):
        p1, p2 = two_pages()
        p2["units"][0]["type"] = "story"
        p2["units"][1]["open"] = {}
        p2["units"][0]["open"] = {}
        book, warnings = bk.assemble([p1, p2], TYPES)
        self.assertTrue(warnings)

    def test_examples(self):
        for book_path in sorted((HERE / "examples").glob("*/book.json")):
            doc = json.loads(book_path.read_text())
            self.assertEqual(bk.validate(doc) + bk.check_document(doc, doc["types"])[0], [], book_path)


PLAIN = {
    "format": "types", "schema_version": "0.1", "book_id": "toy", "title": "Toy book", "flows": {"main": "text"},
    "types": {
        "paragraph": {"description": "prose", "region": "paragraph", "flow": "main"},
        "verse": {"description": "a verse", "region": "verse", "flow": "main"},
        "figure": {"description": "an illustration", "region": "figure", "flow": "main"},
        "caption": {"description": "a caption", "region": "caption", "flow": "main"},
        "page_number": {"description": "folio", "role": "furniture", "region": "page_number"},
    },
}
CHAPTERS = copy.deepcopy(PLAIN)
CHAPTERS["types"] = {"chapter": {"description": "a chapter", "contains": ["paragraph", "verse", "figure", "caption"], "flow": "main"},
                     **{k: {kk: vv for kk, vv in v.items() if kk != "flow"} for k, v in PLAIN["types"].items()}}


def plain_page(n, *units, chapter=None):
    """Page n with one region per unit, (type, open) in reading order; with chapter=open, inside a chapter."""
    pid = f"p{n}"
    regions = [(f"r{i + 1}", t) for i, (t, _) in enumerate(units)]
    us = [dict(id=f"u{i + 1}", type=t, children=[{"region": f"{pid}#r{i + 1}"}], **({"open": o} if o else {}))
          for i, (t, o) in enumerate(units)]
    tops = [u["id"] for u in us]
    if chapter is not None and us:
        us.insert(0, dict(id="c", type="chapter", children=[{"unit": t} for t in tops], **({"open": chapter} if chapter else {})))
        tops = ["c"]
    return page(pid, regions, us, {"main": tops} if tops else {})


END, START, BOTH = {"end": True}, {"start": True}, {"start": True, "end": True}
PLATE = (("figure", None), ("caption", None))


class PageJoinTests(unittest.TestCase):
    """A unit open at its end joins the unit of its type open at its start on a later page, past pages with no unit of
    that type in the flow and no open end of their own (blank pages, plates). The same cases as webapp/test/page-joins."""

    def assemble(self, docs, tl=PLAIN):
        for d in docs:
            if d is not None:
                self.assertEqual(bk.validate(d) + bk.check_document(d, tl)[0], [], d["page"]["id"])
        book, warnings = bk.assemble(docs, tl)
        return {u["id"]: u for u in book["units"]}, book["flows"]["main"], warnings

    def test_blank_page(self):
        for blank in (plain_page(2), dict(plain_page(2), flows={"main": []})):
            units, flow, warnings = self.assemble([plain_page(1, ("paragraph", END)), blank, plain_page(3, ("paragraph", START))])
            self.assertEqual(warnings, [])
            self.assertEqual(flow, ["p1#u1"])
            self.assertEqual(units["p1#u1"]["children"], [{"region": "p1#r1"}, {"region": "p3#r1"}])
            self.assertNotIn("open", units["p1#u1"])

    def test_plate_keeps_its_figure_after_the_paragraph(self):
        for plate in (PLATE[:1], PLATE):
            units, flow, warnings = self.assemble([plain_page(1, ("paragraph", END)), plain_page(2, *plate), plain_page(3, ("paragraph", START))])
            self.assertEqual(warnings, [])
            self.assertEqual(flow, ["p1#u1", *(f"p2#u{i + 1}" for i in range(len(plate)))])
            self.assertEqual([c["region"] for c in units["p1#u1"]["children"]], ["p1#r1", "p3#r1"])

    def test_chain_across_a_plate_and_a_blank_page(self):
        units, flow, warnings = self.assemble([plain_page(1, ("paragraph", END)), plain_page(2, ("paragraph", BOTH)),
                                               plain_page(3, *PLATE), plain_page(4), plain_page(5, ("paragraph", START))])
        self.assertEqual(warnings, [])
        self.assertEqual(flow, ["p1#u1", "p3#u1", "p3#u2"])
        self.assertEqual([c["region"] for c in units["p1#u1"]["children"]], ["p1#r1", "p2#r1", "p5#r1"])

    def test_a_page_with_its_own_paragraph_stops_the_join(self):
        units, flow, warnings = self.assemble([plain_page(1, ("paragraph", END)), plain_page(2, ("figure", None), ("paragraph", None)),
                                               plain_page(3, ("paragraph", START))])
        self.assertEqual(flow, ["p1#u1", "p2#u1", "p2#u2", "p3#u1"])
        self.assertEqual(warnings, ["page p2, flow main: open ends do not match (p1#u1, [])",
                                    "page p3, flow main: open ends do not match (p2#u2, [p3#u1])"])

    def test_other_types(self):
        # A verse goes on past a page of prose (no verse there); the prose stays after it in the flow.
        units, flow, warnings = self.assemble([plain_page(1, ("paragraph", None), ("verse", END)), plain_page(2, ("paragraph", None)),
                                               plain_page(3, ("verse", START), ("paragraph", None))])
        self.assertEqual(warnings, [])
        self.assertEqual(flow, ["p1#u1", "p1#u2", "p2#u1", "p3#u2"])
        # A paragraph and a verse do not join, across a plate as on adjacent pages.
        units, flow, warnings = self.assemble([plain_page(1, ("paragraph", END)), plain_page(2, *PLATE), plain_page(3, ("verse", START))])
        self.assertEqual(warnings, ["page p3, flow main: open ends do not match (p1#u1, [p3#u1])"])
        # Prose going on from page 2 to 3 is page 2's own open end: the verse stops there.
        units, flow, warnings = self.assemble([plain_page(1, ("verse", END)), plain_page(2, ("paragraph", END)), plain_page(3, ("paragraph", START))])
        self.assertEqual(warnings, ["page p2, flow main: open ends do not match (p1#u1, [])"])
        self.assertEqual(flow, ["p1#u1", "p2#u1"])

    def test_open_start_with_nothing_to_join(self):
        # The earlier side named is the nearest page with a unit of its type, not the plate between.
        _, _, warnings = self.assemble([plain_page(1, ("paragraph", None)), plain_page(2, *PLATE), plain_page(3, ("paragraph", START))])
        self.assertEqual(warnings, ["page p3, flow main: open ends do not match (p1#u1, [p3#u1])"])
        _, _, warnings = self.assemble([plain_page(1, ("verse", None)), plain_page(2, ("paragraph", START))])
        self.assertEqual(warnings, ["page p2, flow main: open ends do not match (p1#u1, [p2#u1])"])
        _, _, warnings = self.assemble([None, plain_page(2, ("paragraph", START))])
        self.assertEqual(warnings, [])

    def test_nothing_joins_across_a_page_not_there(self):
        units, flow, warnings = self.assemble([plain_page(1, ("paragraph", END)), None, plain_page(3, ("paragraph", START))])
        self.assertEqual(warnings, [])
        self.assertEqual(flow, ["p1#u1", "p3#u1"])
        self.assertEqual((units["p1#u1"]["open"], units["p3#u1"]["open"]), (END, START))

    def test_in_chapters(self):
        units, flow, warnings = self.assemble([plain_page(1, ("paragraph", END), chapter=END), plain_page(2, *PLATE, chapter=BOTH),
                                               plain_page(3, ("paragraph", START), chapter=START)], CHAPTERS)
        self.assertEqual(warnings, [])
        self.assertEqual(flow, ["p1#c"])
        self.assertEqual(units["p1#c"]["children"], [{"unit": "p1#u1"}, {"unit": "p2#u1"}, {"unit": "p2#u2"}])
        self.assertEqual([c["region"] for c in units["p1#u1"]["children"]], ["p1#r1", "p3#r1"])
        _, _, warnings = self.assemble([plain_page(1, ("paragraph", None), chapter=END), plain_page(2, *PLATE, chapter=BOTH),
                                        plain_page(3, ("paragraph", START), chapter=START)], CHAPTERS)
        self.assertEqual(warnings, ["p1#c + p3#c: inner open ends do not match (p1#u1, p3#u1)"])


class InlineTests(unittest.TestCase):
    """Schema 0.2: inline spans, note markers and anchors (schema/inline.py and the checks in book.py)."""

    def test_parse_line(self):
        plain, spans, still, nxt = inline.parse_line("the <i>Supreme Ens</i>, which")
        self.assertEqual(plain, "the Supreme Ens, which")
        self.assertEqual(spans, [dict(start=4, end=15, kind="italic")])
        self.assertEqual((still, nxt), ((), 1))

    def test_markers_leave_the_text(self):
        plain, spans, _, nxt = inline.parse_line("कचसंचये च[१] वदने")
        self.assertEqual(plain, "कचसंचये च वदने")
        self.assertEqual(spans, [dict(start=9, end=9, kind="note_marker", id="m1", marker="१")])
        self.assertEqual(nxt, 2)

    def test_tag_across_lines(self):
        a, sa, still, n = inline.parse_line("made use of the <i>Variæ")
        b, sb, still2, _ = inline.parse_line("lectiones e codicibus</i> collected", still, n)
        self.assertEqual((still, still2), (("italic",), ()))
        runs = inline.formatted_runs([dict(text=a, spans=sa), dict(text=b, spans=sb)])
        self.assertEqual(runs, [("italic", "Variæ lectiones e codicibus")])

    def page02(self):
        doc = page("p1", [("r1", "paragraph"), ("r2", "footnote")],
                   [{"id": "s", "type": "story", "children": [{"unit": "para"}]},
                    {"id": "para", "type": "paragraph", "children": [{"region": "p1#r1"}]},
                    {"id": "fn", "type": "footnote", "number": "1", "children": [{"region": "p1#r2"}]}],
                   {"main": ["s"], "notes": ["fn"]},
                   [{"type": "note", "from": {"region": "p1#r1", "line": 1, "start": 5, "end": 8, "marker": "1"}, "to": {"unit": "fn"}}])
        doc["page"]["regions"][0]["lines"] = [{"line": 1, "polygons": SQUARE, "text": "Some[1] text"}]
        doc["page"]["regions"][1]["lines"] = [{"line": 2, "polygons": SQUARE, "text": "1 A note."}]
        return doc

    def test_upgrade_and_anchor(self):
        old = self.page02()
        old["page"]["regions"][0]["lines"][0]["text"] = "Some [1] text"
        new = inline.upgrade_page(old)
        line = new["page"]["regions"][0]["lines"][0]
        self.assertEqual(line["text"], "Some  text")
        self.assertEqual(line["spans"], [dict(start=5, end=5, kind="note_marker", id="m1", marker="1")])
        self.assertEqual(new["relations"][0]["from"]["anchor"], "p1#m1")
        self.assertEqual(bk.validate(new) + bk.check_document(new, TYPES)[0], [])

    def test_span_rules(self):
        doc = inline.upgrade_page(self.page02())
        spans = doc["page"]["regions"][0]["lines"][0].setdefault("spans", [])
        spans.append(dict(start=2, end=40, kind="italic"))
        spans.append(dict(start=1, end=2, kind="note_marker", id="m9"))
        spans.append(dict(start=0, end=1, kind="sparkly"))
        doc["relations"].append({"type": "note", "from": {"anchor": "p1#m77"}, "to": {"unit": "fn"}})
        errors = bk.check_document(doc, TYPES)[0]
        for expected in ["outside the text", "must be zero-width", "unknown kind sparkly", "unknown anchor p1#m77"]:
            self.assertTrue(any(expected in e for e in errors), (expected, errors))


if __name__ == "__main__":
    unittest.main(verbosity=1)
