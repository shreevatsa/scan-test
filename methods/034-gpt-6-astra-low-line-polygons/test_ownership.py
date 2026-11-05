#!/usr/bin/env python3
"""Synthetic checks for line ownership and polygon outlines. Run: uv run --offline python test_ownership.py"""
import json
import math
import unittest
from pathlib import Path

import cv2
import numpy as np

import analysis
import ownership as own

HERE = Path(__file__).resolve().parent
CONFIG = json.loads((HERE / "config.json").read_text())
LINE_CONFIG = json.loads((HERE / "line-config.json").read_text())
W, H = 1400, 2000
PITCH, WORD_H = 60, 30


def word(img, x, y, w, t, tag, tags, value):
    """A dark word with a headline, drawn along slope t, recorded in the tag image."""
    pts = np.array([[x, y], [x + w, y + t * w], [x + w, y + t * w + WORD_H], [x, y + WORD_H]], np.int32)
    cv2.fillPoly(img, [pts], 0)
    cv2.fillPoly(tags, [pts], value)
    tag.append(value)


def page(rows, angle=0.0, seed=1):
    """rows: list of (passage_id, x_start, x_end) runs per printed line; returns image and passage tags."""
    rng = np.random.default_rng(seed)
    img = np.full((H, W), 255, np.uint8)
    tags = np.zeros((H, W), np.uint8)
    t = math.tan(math.radians(angle))
    for i, runs in enumerate(rows):
        y0 = 200 + i * PITCH
        for pid, xs, xe in runs:
            x = xs
            while x < xe - 40:
                w = int(min(rng.integers(60, 140), xe - x))
                word(img, x, int(y0 + t * (x - W / 2)), w, t, [], tags, pid)
                x += w + int(rng.integers(18, 30))
    return img, tags


def run(img, boxes):
    detail, arrays = analysis.analyze(img, LINE_CONFIG)
    comp, seg = arrays["comp"], arrays["seg"]
    pix = [own.pixel_box(b, W, H) for b in boxes]
    owner, decisions, dropped = own.assign(comp, seg, pix, CONFIG)
    geo = own.outline_regions(img.shape, comp, seg, owner, detail["summary"]["page_angle_deg"], len(boxes), CONFIG)
    owner_px = np.where(comp["labels"] > 0, owner[comp["labels"]], own.UNASSIGNED)
    return detail, comp, owner_px, decisions, dropped, geo


def tight(tags, pid, pad=0):
    ys, xs = np.nonzero(tags == pid)
    return [xs.min() - pad, ys.min() - pad, xs.max() + 1 + pad, ys.max() + 1 + pad]


class Ownership(unittest.TestCase):
    def assert_owned(self, owner_px, tags, mapping):
        for pid, r in mapping.items():
            ink = tags == pid
            self.assertTrue((owner_px[ink] == r).all(), f"passage {pid} not wholly owned by region {r}")

    def assert_clean_polygons(self, geo, owner_px):
        for r, g_ in enumerate(geo):
            mask = own.rasterize(g_["rings"], owner_px.shape)
            self.assertEqual(int(((owner_px == r) & ~mask).sum()), 0, f"region {r} loses own ink")
            self.assertEqual(int((mask & (owner_px >= 0) & (owner_px != r)).sum()), 0, f"region {r} includes other ink")

    def test_skewed_stacked_passages_with_overlapping_boxes(self):
        rows = [[(1, 150, 1250)]] * 4 + [[(2, 150, 1250)]] * 5
        img, tags = page(rows, angle=-2.0)
        boxes = [tight(tags, 1), tight(tags, 2)]
        self.assertGreater(boxes[0][3], boxes[1][1], "test needs overlapping axis-aligned boxes")
        detail, comp, owner_px, decisions, dropped, geo = run(img, boxes)
        self.assertEqual([d["mode"] for d in decisions], ["whole"] * 9)
        self.assert_owned(owner_px, tags, {1: 0, 2: 1})
        self.assert_clean_polygons(geo, owner_px)

    def test_footnotes_sharing_a_line_split_by_component(self):
        rows = [[(1, 150, 1250)]] * 3 + [[(2, 150, 450), (3, 500, 820), (4, 870, 1250)]]
        img, tags = page(rows)
        # Model boxes slightly off: the middle note's box stops short of its last word.
        b3 = tight(tags, 3)
        b3[2] -= 60
        boxes = [tight(tags, 1), tight(tags, 2), b3, tight(tags, 4)]
        detail, comp, owner_px, decisions, dropped, geo = run(img, boxes)
        self.assertEqual(decisions[3]["mode"], "split")
        self.assert_owned(owner_px, tags, {1: 0, 2: 1, 3: 2, 4: 3})
        self.assert_clean_polygons(geo, owner_px)

    def test_cut_off_period_joins_its_own_note_not_the_next_numeral(self):
        img, tags = page([[(1, 150, 1250)]] * 3)
        y = 200 + 3 * PITCH
        for pid, (x0, x1, y0, y1) in [(2, (150, 440, y, y + WORD_H)),          # note 2: one long word
                                       (2, (444, 450, y + 22, y + 28)),        # its final period
                                       (3, (470, 482, y + 4, y + 26)),         # narrow numeral starting note 3
                                       (3, (494, 700, y, y + WORD_H))]:        # note 3's text
            img[y0:y1, x0:x1] = 0
            tags[y0:y1, x0:x1] = pid
        b2 = tight(tags, 2)
        b2[2] = 441  # the model's box stops before the period
        detail, comp, owner_px, decisions, dropped, geo = run(img, [tight(tags, 1), b2, tight(tags, 3)])
        self.assertEqual(decisions[3]["mode"], "split")
        self.assert_owned(owner_px, tags, {1: 0, 2: 1, 3: 2})

    def test_note_wrapping_onto_the_next_line(self):
        rows = [[(1, 150, 1250)]] * 3 + [[(2, 150, 450), (3, 500, 1250)], [(3, 150, 700), (4, 760, 1250)]]
        img, tags = page(rows)
        boxes = [tight(tags, 1), tight(tags, 2), tight(tags, 3), tight(tags, 4)]  # note 3's box spans both lines
        detail, comp, owner_px, decisions, dropped, geo = run(img, boxes)
        self.assertEqual([d["mode"] for d in decisions[3:]], ["split", "split"])
        self.assert_owned(owner_px, tags, {1: 0, 2: 1, 3: 2, 4: 3})
        self.assert_clean_polygons(geo, owner_px)
        self.assertEqual(len(geo[2]["rings"]), 1, "the wrapped note should be one connected outline")

    def test_cut_off_word_is_kept_and_edge_mark_is_dropped(self):
        rows = [[(1, 150, 1250)]] * 4
        img, tags = page(rows)
        img[260:300, 1392:1400] = 0  # scanner-edge mark on line 1, far right
        box = tight(tags, 1)
        box[2] -= 90  # the model's box cuts off most of the last word on every line
        detail, comp, owner_px, decisions, dropped, geo = run(img, [box])
        self.assert_owned(owner_px, tags, {1: 0})
        self.assertEqual(len(dropped), 1)
        self.assertGreaterEqual(dropped[0]["box"][0], 1390)
        self.assert_clean_polygons(geo, owner_px)

    def test_line_without_a_box_is_left_unassigned(self):
        rows = [[(1, 150, 1250)]] * 3 + [[]] * 2 + [[(9, 150, 1250)]]
        img, tags = page(rows)
        detail, comp, owner_px, decisions, dropped, geo = run(img, [tight(tags, 1)])
        self.assertEqual(decisions[-1]["mode"], "uncovered")
        self.assertTrue((owner_px[tags == 9] == own.UNASSIGNED).all())
        mask = own.rasterize(geo[0]["rings"], img.shape)
        self.assertEqual(int((mask & (tags == 9)).sum()), 0)

    def test_line_outlines_nest_in_region_outline(self):
        rows = [[(1, 150, 1250)]] * 4 + [[(2, 300, 1100)]] * 3
        img, tags = page(rows, angle=0.8)
        detail, comp, owner_px, decisions, dropped, geo = run(img, [tight(tags, 1), tight(tags, 2)])
        for g_ in geo:
            region = own.rasterize(g_["rings"], img.shape)
            self.assertEqual(len(g_["lines"]), 4 if g_ is geo[0] else 3)
            for line in g_["lines"]:
                lm = own.rasterize(line["rings"], img.shape)
                self.assertLessEqual(int((lm & ~region).sum()), 0.01 * lm.sum())


if __name__ == "__main__":
    unittest.main()
