"""Page-level skew, line-shape and line-pair separability analysis."""
import math

import numpy as np
from PIL import Image, ImageDraw, ImageFont

import geometry as g

PALETTE = [(230, 25, 75), (60, 160, 75), (0, 110, 200), (245, 130, 48), (145, 30, 180), (0, 150, 150), (170, 110, 40), (128, 128, 0)]


def fit_rule(comp, k):
    labels, stats = comp["labels"], comp["stats"]
    x, y, w, h, _ = map(int, stats[k])
    ys, xs = np.nonzero(labels[y:y + h, x:x + w] == k)
    slope, intercept = np.polyfit(xs + x, ys + y, 1)
    return dict(component_id=int(k), box=[x, y, x + w, y + h], angle_deg=float(math.degrees(math.atan(slope))))


def summarize(values):
    v = np.asarray([x for x in values if x is not None], float)
    if len(v) == 0:
        return None
    return dict(n=int(len(v)), median=float(np.median(v)), p10=float(np.percentile(v, 10)), p90=float(np.percentile(v, 90)),
                minimum=float(v.min()), maximum=float(v.max()))


def analyze(gray, config):
    comp = g.ink_components(gray, config)
    char_h = comp["char_h"]
    role = comp["role"]
    text = np.zeros(len(role), bool)
    text[np.flatnonzero(role == "text")] = True
    ys, xs = np.nonzero(text[comp["labels"]])
    if len(xs) < config["minimum_text_pixels_char2"] * char_h * char_h:
        return dict(status="too_little_text", char_h=char_h), None
    sx, sy = g.subsample(xs, ys, config["angle_sample_limit"])
    angle, angle_info = g.estimate_angle(sx, sy, -config["angle_search_deg"], config["angle_search_deg"], config["angle_coarse_step_deg"], config["angle_fine_step_deg"])
    seg = g.segment_lines(comp, angle, config)
    lx, ly, lid = g.line_pixels(comp, seg["line_of"])
    lines = seg["lines"]
    order = np.argsort(lid, kind="stable")
    lx, ly, lid = lx[order], ly[order], lid[order]
    bounds = np.searchsorted(lid, np.arange(len(lines) + 1))
    column_widths = {}
    for L in lines:
        column_widths[L["column"]] = max(column_widths.get(L["column"], 0), L["rx1"] - L["rx0"])
    for L in lines:
        a, b = bounds[L["line_id"]], bounds[L["line_id"] + 1]
        L["pixels"] = int(b - a)
        if b > a:
            L["box"] = [int(lx[a:b].min()), int(ly[a:b].min()), int(lx[a:b].max()) + 1, int(ly[a:b].max()) + 1]
        L["long"] = bool((L["rx1"] - L["rx0"]) >= config["long_line_column_fraction"] * column_widths[L["column"]] and (L["rx1"] - L["rx0"]) >= config["long_line_minimum_char"] * char_h)
        L["shape"] = g.fit_line_shape(lx[a:b], ly[a:b], angle, char_h, config) if L["long"] and b - a > 0 else None
    pairs = []
    for L, M in zip(lines, lines[1:]):
        if L["column"] != M["column"]:
            continue
        overlap = min(L["rx1"], M["rx1"]) - max(L["rx0"], M["rx0"])
        if overlap < config["pair_minimum_overlap_char"] * char_h:
            continue
        a0, a1 = bounds[L["line_id"]], bounds[L["line_id"] + 1]
        b0, b1 = bounds[M["line_id"]], bounds[M["line_id"] + 1]
        minimum = config["pair_minimum_pixels_char2"] * char_h * char_h
        if a1 - a0 < minimum or b1 - b0 < minimum:
            continue
        sep = g.pair_separability(lx[a0:a1], ly[a0:a1], lx[b0:b1], ly[b0:b1], angle, config)
        pairs.append(dict(upper_line=L["line_id"], lower_line=M["line_id"], both_long=bool(L["long"] and M["long"]),
                          pitch_px=float(M["center"] - L["center"]), **sep))
    rules = [fit_rule(comp, k) for k in np.flatnonzero(role == "rule")]
    long_shapes = [L["shape"] for L in lines if L["shape"]]
    def frac(key, sel):
        sel = [p for p in pairs if sel(p)]
        return dict(pairs=len(sel), not_separable=sum(not p["separable"][key] for p in sel)) if sel else dict(pairs=0, not_separable=0)
    summary = dict(
        status="ok", char_h=char_h, page_angle_deg=angle, **angle_info,
        columns=len(seg["columns"]), lines=len(lines), long_lines=sum(L["long"] for L in lines),
        bridging_components=len(seg["bridging"]),
        unassigned_text_components=int(((seg["line_of"] < 0) & text).sum()),
        line_angle_deg=summarize([s["angle_deg"] for s in long_shapes]),
        line_bow_px=summarize([s.get("bow_px") for s in long_shapes]),
        rules=rules,
        pair_counts={key: frac(key, lambda p: True) for key in ["axis_aligned", "page_rotated", "straight_any_angle", "column_staircase"]},
        long_pair_counts={key: frac(key, lambda p: p["both_long"]) for key in ["axis_aligned", "page_rotated", "straight_any_angle", "column_staircase"]},
    )
    detail = dict(summary=summary, lines=lines, pairs=pairs, columns=[list(c) for c in seg["columns"]], bridging=seg["bridging"],
                  thresholds=dict(strong=comp["strong_threshold"], weak=comp["weak_threshold"], speck_area=comp["speck_area"]))
    arrays = dict(comp=comp, seg=seg, lx=lx, ly=ly, lid=lid)
    return detail, arrays


def font(size):
    for name in ["/System/Library/Fonts/Supplemental/Arial.ttf", "/System/Library/Fonts/Helvetica.ttc"]:
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            pass
    return ImageFont.load_default()


def draw_overlay(rgb, detail, arrays):
    """Lines in cycling colors; rules black; unassigned text gray; pair markers at left."""
    comp, seg = arrays["comp"], arrays["seg"]
    out = (255 - (255 - rgb.astype(np.int32)) * 0.25).astype(np.uint8)
    role = comp["role"]
    labels = comp["labels"]
    text = np.isin(labels, np.flatnonzero(role == "text"))
    out[text] = [150, 150, 150]
    out[np.isin(labels, np.flatnonzero(role == "rule"))] = [0, 0, 0]
    out[np.isin(labels, np.flatnonzero(role == "large"))] = [90, 90, 90]
    colors = np.array([PALETTE[i % len(PALETTE)] for i in range(max(1, len(detail["lines"])))], np.uint8)
    out[arrays["ly"], arrays["lx"]] = colors[arrays["lid"]]
    for b in seg["bridging"]:
        out[labels == b["component_id"]] = [0, 0, 0]
    img = Image.fromarray(out)
    d = ImageDraw.Draw(img)
    s = max(6, int(detail["summary"]["char_h"] * .35))
    for p in detail["pairs"]:
        L = detail["lines"][p["upper_line"]]
        M = detail["lines"][p["lower_line"]]
        y = (L["box"][3] + M["box"][1]) / 2
        x = max(2, min(L["box"][0], M["box"][0]) - 3 * s)
        sep = p["separable"]
        if sep["axis_aligned"]:
            color = (200, 200, 200)
        elif sep["page_rotated"]:
            color = (255, 160, 0)
        elif sep["straight_any_angle"]:
            color = (235, 40, 65)
        elif sep["column_staircase"]:
            color = (140, 0, 160)
        else:
            color = (0, 0, 0)
        d.rectangle([x, y - s / 2, x + s, y + s / 2], fill=color)
    return img
