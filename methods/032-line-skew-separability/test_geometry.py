#!/usr/bin/env python3
"""Synthetic checks for the method 032 measurements. Run: uv run --offline python test_geometry.py"""
import json
import math
import unittest
from pathlib import Path

import cv2
import numpy as np

import analysis
import geometry as g
from evaluate import best_edge

CONFIG = json.loads((Path(__file__).resolve().parent / "config.json").read_text())


def text_page(angle_deg, lines=12, width=1400, height=1100, pitch=60, word_h=30, bilevel=True, dots=False, seed=1):
    """White page with dark 'words' (rectangles with a headline bar) along lines at angle_deg."""
    rng = np.random.default_rng(seed)
    img = np.full((height, width), 255, np.uint8)
    t = math.tan(math.radians(angle_deg))
    for i in range(lines):
        y0 = 120 + i * pitch
        x = 100
        while x < width - 200:
            w = int(rng.integers(60, 160))
            cy = y0 + t * (x - width / 2)
            pts = np.array([[x, cy], [x + w, cy + t * w], [x + w, cy + t * w + word_h], [x, cy + word_h]], np.int32)
            cv2.fillPoly(img, [pts], 0)
            if dots:
                cv2.circle(img, (x + w // 2, int(cy - 9)), 3, 0, -1)
            x += w + int(rng.integers(20, 40))
    if not bilevel:
        img = cv2.GaussianBlur(img, (3, 3), 0)
    return img


def points(mask):
    ys, xs = np.nonzero(mask)
    return xs, ys


class AngleAndLines(unittest.TestCase):
    def test_recovers_known_angles(self):
        for angle in [-1.43, 0.0, 0.8, 2.5]:
            gray = text_page(angle)
            detail, _ = analysis.analyze(gray, CONFIG)
            self.assertAlmostEqual(detail["summary"]["page_angle_deg"], angle, delta=0.05, msg=angle)

    def test_bilevel_zero_one_page_has_ink(self):
        # OpenCV's Otsu threshold on a pure 0/255 page is 0; ink must still be found.
        comp = g.ink_components(text_page(0.0, bilevel=True), CONFIG)
        self.assertEqual(comp["strong_threshold"], 0.0)
        self.assertGreater(int((comp["role"] == "text").sum()), 50)

    def test_line_count_and_detached_marks(self):
        gray = text_page(-1.2, lines=10, dots=True)
        detail, arrays = analysis.analyze(gray, CONFIG)
        self.assertEqual(detail["summary"]["lines"], 10)
        seg, comp = arrays["seg"], arrays["comp"]
        text = comp["role"] == "text"
        self.assertEqual(int(((seg["line_of"] < 0) & text).sum()), 0)
        # Each dot sits above its own word and must join that word's line.
        stats = comp["stats"]
        for k in np.flatnonzero(text & (stats[:, 4] < 60)):
            below = [j for j in np.flatnonzero(text & (stats[:, 4] > 500))
                     if stats[j, 0] <= stats[k, 0] <= stats[j, 0] + stats[j, 2] and 0 < stats[j, 1] - stats[k, 1] < 25]
            self.assertTrue(below)
            self.assertEqual(seg["line_of"][k], seg["line_of"][below[0]])

    def test_curved_lines_report_bow(self):
        img = np.full((2000, 1400), 255, np.uint8)  # book-like height; characters are < 5% of it
        xs = np.arange(100, 1300)
        for x in xs:
            if x % 110 >= 95:  # 15 px word gaps; wider gaps on a one-line page would read as column gutters
                continue
            y = 200 + 1.5e-5 * (x - 700) ** 2  # ends 5.4 px lower than the middle
            img[int(round(y)):int(round(y)) + 28, x] = 0
        detail, _ = analysis.analyze(img, CONFIG)
        shapes = [L["shape"] for L in detail["lines"] if L["shape"]]
        self.assertEqual(len(shapes), 1)
        self.assertGreater(shapes[0]["bow_px"], 3)


class Separability(unittest.TestCase):
    def test_horizontal_gap_is_separable_everywhere(self):
        a = np.zeros((200, 600), bool); a[20:60, 50:550] = True
        b = np.zeros((200, 600), bool); b[70:110, 50:550] = True
        sep = g.pair_separability(*points(a), *points(b), 0.0, CONFIG)["separable"]
        self.assertTrue(all(sep.values()))

    def test_adjacent_rows_are_separable_but_shared_row_is_not(self):
        a = np.zeros((100, 100), bool); a[10:20, 10:90] = True
        b = np.zeros((100, 100), bool); b[20:30, 10:90] = True
        self.assertTrue(g.pair_separability(*points(a), *points(b), 0.0, CONFIG)["separable"]["axis_aligned"])
        b[19, 50] = True
        sep = g.pair_separability(*points(a), *points(b), 0.0, CONFIG)
        self.assertFalse(sep["separable"]["axis_aligned"])
        self.assertFalse(sep["separable"]["column_staircase"])

    def test_skewed_tight_lines_need_rotation(self):
        angle = -1.5
        t = math.tan(math.radians(angle))
        a = np.zeros((400, 1200), bool); b = np.zeros((400, 1200), bool)
        for x in range(100, 1100):
            ya = 150 + t * (x - 600)
            a[int(ya):int(ya) + 30, x] = True
            b[int(ya) + 38:int(ya) + 68, x] = True
        sep = g.pair_separability(*points(a), *points(b), angle, CONFIG)
        self.assertFalse(sep["separable"]["axis_aligned"])
        self.assertTrue(sep["separable"]["page_rotated"])
        self.assertTrue(sep["separable"]["straight_any_angle"])
        self.assertAlmostEqual(sep["straight"]["best_angle_deg"], angle, delta=0.1)

    def test_interlocking_marks_need_a_staircase(self):
        a = np.zeros((200, 600), bool); b = np.zeros((200, 600), bool)
        a[50:80, 50:550] = True
        b[95:125, 50:550] = True
        a[80:92, 100:110] = True   # descender of A dips below B's ascender top
        b[85:95, 300:310] = True   # ascender of B rises above A's descender bottom
        sep = g.pair_separability(*points(a), *points(b), 0.0, CONFIG)
        self.assertFalse(sep["separable"]["axis_aligned"])
        self.assertFalse(sep["separable"]["straight_any_angle"])
        self.assertTrue(sep["separable"]["column_staircase"])

    def test_best_edge_counts_unavoidable_conflict(self):
        a = np.zeros((100, 100), bool); a[10:30, 10:90] = True; a[30:34, 20:22] = True
        b = np.zeros((100, 100), bool); b[32:50, 10:90] = True
        out = best_edge(*points(a), *points(b), 0.0)
        # Either leave A's 4-pixel descender stub rows out (8 px) or include B's two top rows (160 px).
        self.assertEqual(out["upper_box_bottom_edge"]["cost"], 4)
        self.assertEqual(out["upper_box_bottom_edge"]["own_left_out"], 4)


if __name__ == "__main__":
    unittest.main()
