"""Text-line skew, curvature and boundary-separability measurements.

All coordinates are original-image pixel coordinates (x right, y down) unless a
name says "rotated". The "rotated" frame is the original frame rotated by the
negative page text angle, so text lines are approximately horizontal in it.
Nothing here resamples the image: rotations are applied to pixel coordinates.
"""
import math

import cv2
import numpy as np


def ink_components(gray, config):
    """Hysteresis ink mask and connected components with role labels.

    Strong ink is at or below the Otsu threshold (OpenCV's Otsu threshold is the
    largest background-excluded value, which is 0 for a pure 0/255 bilevel page).
    Weak ink is darker than the midpoint between that threshold and white, and is
    kept only when its 8-connected component also contains strong ink.
    """
    otsu, _ = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    strong_threshold = min(float(otsu), config["maximum_strong_threshold"])
    weak_threshold = (strong_threshold + 255) / 2
    weak = (gray < weak_threshold).astype(np.uint8)
    strong = gray <= strong_threshold
    count, labels, stats, _ = cv2.connectedComponentsWithStats(weak, 8)
    has_strong = np.zeros(count, bool)
    has_strong[np.unique(labels[strong])] = True
    has_strong[0] = False
    height, width = gray.shape
    area, comp_w, comp_h = stats[:, 4], stats[:, 2], stats[:, 3]
    base_speck = max(4, int(height * width * config["speck_area_page_fraction"]))
    candidates = np.flatnonzero(has_strong & (area >= base_speck) & (comp_h < height * .05))
    if len(candidates) == 0:
        char_h = height * .015
    else:
        order = np.argsort(comp_h[candidates])
        cumulative = np.cumsum(area[candidates][order])
        char_h = float(comp_h[candidates][order][np.searchsorted(cumulative, cumulative[-1] / 2)])
    speck = max(base_speck, int((config["speck_size_char_fraction"] * char_h) ** 2))
    role = np.full(count, "none", dtype=object)
    valid = has_strong & (area >= speck)
    role[valid] = "text"
    rule = valid & (comp_w >= config["rule_minimum_aspect"] * comp_h) & (comp_h < config["rule_maximum_height_char"] * char_h) & (comp_w > config["rule_minimum_width_char"] * char_h)
    large = valid & ~rule & ((comp_h > config["large_component_height_char"] * char_h) | (comp_w > config["large_component_width_page"] * width))
    role[rule] = "rule"
    role[large] = "large"
    role[0] = "background"
    return dict(labels=labels, stats=stats, role=role, char_h=char_h,
                strong_threshold=strong_threshold, weak_threshold=weak_threshold, speck_area=speck)


def rotate(xs, ys, angle_deg):
    """Rotate coordinates so that a line with the given image angle becomes horizontal."""
    a = math.radians(angle_deg)
    return xs * math.cos(a) + ys * math.sin(a), -xs * math.sin(a) + ys * math.cos(a)


def unrotate(rx, ry, angle_deg):
    a = math.radians(angle_deg)
    return rx * math.cos(a) - ry * math.sin(a), rx * math.sin(a) + ry * math.cos(a)


def profile_sharpness(xs, ys, angle_deg):
    _, ry = rotate(xs, ys, angle_deg)
    hist = np.bincount(np.floor(ry - ry.min()).astype(np.int64))
    return float(np.square(hist.astype(np.float64)).sum())


def estimate_angle(xs, ys, low, high, coarse_step, fine_step):
    """Angle maximizing horizontal projection-profile sharpness (projection-profile method)."""
    xs = xs.astype(np.float64)
    ys = ys.astype(np.float64)
    coarse = np.arange(low, high + coarse_step / 2, coarse_step)
    scores = [profile_sharpness(xs, ys, a) for a in coarse]
    best = float(coarse[int(np.argmax(scores))])
    fine = np.arange(best - coarse_step * 1.5, best + coarse_step * 1.5 + fine_step / 2, fine_step)
    fine_scores = [profile_sharpness(xs, ys, a) for a in fine]
    best = float(fine[int(np.argmax(fine_scores))])
    zero = profile_sharpness(xs, ys, 0.0)
    return best, dict(sharpness_ratio_vs_zero=float(max(fine_scores) / zero) if zero else None)


def subsample(xs, ys, limit):
    if len(xs) <= limit:
        return xs, ys
    step = int(math.ceil(len(xs) / limit))
    return xs[::step], ys[::step]


def find_columns(rx, char_h, config):
    """Split the rotated x-range at full-height empty gutters."""
    lo, hi = float(rx.min()), float(rx.max())
    hist = np.bincount(np.floor(rx - lo).astype(np.int64))
    empty = hist == 0
    minimum = config["gutter_minimum_width_char"] * char_h
    cuts = []
    total = len(rx)
    cumulative = np.cumsum(hist)
    start = None
    for i, e in enumerate(np.append(empty, False)):
        if e and start is None:
            start = i
        elif not e and start is not None:
            if i - start >= minimum:
                left = cumulative[start - 1] if start > 0 else 0
                right = total - cumulative[i - 1]
                if min(left, right) >= config["gutter_minimum_side_fraction"] * total:
                    cuts.append(lo + (start + i) / 2)
            start = None
    edges = [lo - 1] + cuts + [hi + 1]
    return [(edges[i], edges[i + 1]) for i in range(len(edges) - 1)]


def per_label_extent(values, labels, count):
    low = np.full(count, np.inf)
    high = np.full(count, -np.inf)
    np.minimum.at(low, labels, values)
    np.maximum.at(high, labels, values)
    return low, high


def segment_lines(comp, angle, config):
    """Group text components into lines in the rotated frame."""
    labels, stats, role, char_h = comp["labels"], comp["stats"], comp["role"], comp["char_h"]
    count = len(stats)
    text_ids = np.flatnonzero(role == "text")
    is_text = np.zeros(count, bool)
    is_text[text_ids] = True
    ys, xs = np.nonzero(is_text[labels])
    lab = labels[ys, xs]
    rx, ry = rotate(xs.astype(np.float64), ys.astype(np.float64), angle)
    ry_low, ry_high = per_label_extent(ry, lab, count)
    rx_low, rx_high = per_label_extent(rx, lab, count)
    with np.errstate(invalid="ignore"):
        cy = (ry_low + ry_high) / 2
        cx = (rx_low + rx_high) / 2
    columns = find_columns(rx, char_h, config) if len(rx) else []
    column_of = np.full(count, -1)
    for ci, (a, b) in enumerate(columns):
        column_of[text_ids[(cx[text_ids] > a) & (cx[text_ids] <= b)]] = ci
    rh = ry_high - ry_low + 1
    main = is_text & (rh >= config["main_minimum_height_char"] * char_h) & (rh <= config["main_maximum_height_char"] * char_h)
    line_of = np.full(count, -1)
    lines = []
    for ci in range(len(columns)):
        ids = np.flatnonzero(main & (column_of == ci))
        if len(ids) == 0:
            continue
        order = ids[np.argsort(cy[ids])]
        gaps = np.diff(cy[order])
        groups = np.split(order, np.flatnonzero(gaps > config["line_split_gap_char"] * char_h) + 1)
        for g in groups:
            line_of[g] = len(lines)
            lines.append(dict(line_id=len(lines), column=ci, main_components=len(g),
                              rx0=float(rx_low[g].min()), rx1=float(rx_high[g].max()),
                              core_top=float(ry_low[g].min()), core_bottom=float(ry_high[g].max()),
                              center=float(np.median(cy[g]))))
    # Some detached glyph parts pass the main-component height threshold. Join their
    # smaller, sparser bands before assigning the remaining marks to line bands.
    if config.get("fragment_maximum_height_ratio") is not None:
        parents = list(range(len(lines)))
        band_pad = config["fragment_band_padding_char"] * char_h
        horizontal_pad = config["assign_horizontal_pad_char"] * char_h
        for i, fragment in enumerate(lines):
            height = fragment["core_bottom"] - fragment["core_top"] + 1
            candidates = []
            for j, host in enumerate(lines):
                host_height = host["core_bottom"] - host["core_top"] + 1
                if host["column"] != fragment["column"]:
                    continue
                if height > config["fragment_maximum_height_ratio"] * host_height:
                    continue
                if fragment["main_components"] > config["fragment_maximum_component_ratio"] * host["main_components"]:
                    continue
                if not host["core_top"] - band_pad <= fragment["center"] <= host["core_bottom"] + band_pad:
                    continue
                if fragment["rx1"] < host["rx0"] - horizontal_pad or fragment["rx0"] > host["rx1"] + horizontal_pad:
                    continue
                candidates.append((abs(fragment["center"] - host["center"]), j))
            if candidates:
                parents[i] = min(candidates)[1]
        groups = {}
        for i in range(len(lines)):
            root = i
            while parents[root] != root:
                root = parents[root]
            groups.setdefault(root, []).append(i)
        merged = []
        original_line_of = line_of.copy()
        for root, aliases in groups.items():
            members = np.flatnonzero(main & np.isin(original_line_of, aliases))
            line_of[members] = len(merged)
            merged.append(dict(line_id=len(merged), column=lines[root]["column"], main_components=len(members),
                               rx0=float(rx_low[members].min()), rx1=float(rx_high[members].max()),
                               core_top=float(ry_low[members].min()), core_bottom=float(ry_high[members].max()),
                               center=float(np.median(cy[members])), anchor_line_id=root, previous_line_ids=aliases))
        lines = merged
    # Detached marks and other non-main text components go to the nearest line band.
    pad = config["assign_horizontal_pad_char"] * char_h
    limit = config["assign_maximum_distance_char"] * char_h
    for k in np.flatnonzero(is_text & ~main):
        best, best_d = -1, np.inf
        for L in lines:
            if L["column"] != column_of[k] or cx[k] < L["rx0"] - pad or cx[k] > L["rx1"] + pad:
                continue
            d = 0.0 if L["core_top"] <= cy[k] <= L["core_bottom"] else min(abs(cy[k] - L["core_top"]), abs(cy[k] - L["core_bottom"]))
            if d < best_d:
                best, best_d = L["line_id"], d
        if best >= 0 and best_d <= limit:
            line_of[k] = best
    # Method 039: a short glyph (below main height) whose center lies in a line's core band, but
    # outside that line's horizontal extent, joins the line if it chains to the line's members
    # through gaps of at most band_chain_gap_char character heights. Examples are an italic
    # lowercase word before the line's first normal-height glyph, or punctuation after its last.
    # It replaces no line at all, or an assignment to a neighboring line whose band the glyph
    # lies outside, but only if this line's glyphs are nearer to it than that line's glyphs that
    # lie within its own band (so a whole word put on the wrong line does not hold itself there).
    # A glyph already within its own line's band is never moved.
    band_chained = []

    def nearest_gap(k, ids):
        ids = ids[ids != k]
        if not len(ids):
            return np.inf
        dx = np.maximum(0, np.maximum(rx_low[ids] - rx_high[k], rx_low[k] - rx_high[ids]))
        dy = np.maximum(0, np.maximum(ry_low[ids] - ry_high[k], ry_low[k] - ry_high[ids]))
        return float(np.hypot(dx, dy).min())

    if config.get("band_chain_gap_char") is not None:
        gap_limit = config["band_chain_gap_char"] * char_h
        short = is_text & ~main & (rh < config["main_minimum_height_char"] * char_h)
        tops = np.array([L["core_top"] for L in lines] + [0.0])
        bottoms = np.array([L["core_bottom"] for L in lines] + [-1.0])
        for L in lines:
            i = L["line_id"]
            with np.errstate(invalid="ignore"):
                inside = (cy >= L["core_top"]) & (cy <= L["core_bottom"])
                current = np.where(line_of >= 0, line_of, len(lines))
                own_band = (cy >= tops[current]) & (cy <= bottoms[current])
            pool = [int(k) for k in np.flatnonzero(short & inside & ~own_band & ((column_of == L["column"]) | (column_of < 0)))]
            members = np.flatnonzero(line_of == i)
            lo, hi = float(rx_low[members].min()), float(rx_high[members].max())
            grew = True
            while grew and pool:
                grew = False
                for k in list(pool):
                    if max(rx_low[k] - hi, lo - rx_high[k], 0.0) > gap_limit:
                        continue
                    if line_of[k] >= 0:
                        c = line_of[k]
                        with np.errstate(invalid="ignore"):
                            anchored = np.flatnonzero((line_of == c) & (cy >= lines[c]["core_top"]) & (cy <= lines[c]["core_bottom"]))
                        if nearest_gap(k, np.flatnonzero(line_of == i)) >= nearest_gap(k, anchored):
                            continue
                    band_chained.append(dict(component_id=k, from_line=int(line_of[k]), to_line=i))
                    line_of[k] = i
                    lo, hi = min(lo, float(rx_low[k])), max(hi, float(rx_high[k]))
                    pool.remove(k)
                    grew = True
    # Components whose rotated extent covers the centers of two lines touch across lines.
    bridging = []
    for k in np.flatnonzero(line_of >= 0):
        hits = [L["line_id"] for L in lines if L["column"] == column_of[k]
                and ry_low[k] <= L["center"] <= ry_high[k]
                and rx_high[k] >= L["rx0"] and rx_low[k] <= L["rx1"]]
        if len(hits) >= 2:
            bridging.append(dict(component_id=int(k), lines=hits))
    # Order lines by column then rotated center.
    order = sorted(range(len(lines)), key=lambda i: (lines[i]["column"], lines[i]["center"]))
    remap = np.full(len(lines) + 1, -1)
    for new, old in enumerate(order):
        remap[old] = new
    lines = [dict(lines[old], line_id=new) for new, old in enumerate(order)]
    line_of = np.where(line_of >= 0, remap[line_of], -1)
    for b in bridging:
        b["lines"] = sorted(int(remap[i]) for i in b["lines"])
    for b in band_chained:
        b["from_line"] = int(remap[b["from_line"]]) if b["from_line"] >= 0 else -1
        b["to_line"] = int(remap[b["to_line"]])
    return dict(lines=lines, line_of=line_of, columns=columns, column_of=column_of, bridging=bridging, band_chained=band_chained)


def line_pixels(comp, line_of):
    """Pixel coordinates of every line-assigned text pixel and its line id."""
    labels = comp["labels"]
    assigned = line_of[labels]
    ys, xs = np.nonzero(assigned >= 0)
    return xs, ys, assigned[ys, xs]


def fit_line_shape(xs, ys, angle, char_h, config):
    """Residual angle and bow of one line from segment profile cross-correlation."""
    rx, ry = rotate(xs.astype(np.float64), ys.astype(np.float64), angle)
    width = rx.max() - rx.min()
    k = int(np.clip(round(width / (config["segment_width_char"] * char_h)), 2, config["maximum_segments"]))
    top = ry.min() - char_h
    bins = int(math.ceil(ry.max() - top + char_h)) + 1
    whole = np.bincount(np.floor(ry - top).astype(np.int64), minlength=bins).astype(np.float64)
    edges = np.linspace(rx.min(), rx.max() + 1e-6, k + 1)
    max_lag = int(math.ceil(config["maximum_segment_offset_char"] * char_h))
    points = []
    for i in range(k):
        sel = (rx >= edges[i]) & (rx < edges[i + 1])
        if sel.sum() < config["minimum_segment_pixels_char2"] * char_h * char_h:
            continue
        seg = np.bincount(np.floor(ry[sel] - top).astype(np.int64), minlength=bins).astype(np.float64)
        lags = np.arange(-max_lag, max_lag + 1)
        scores = np.array([np.dot(np.roll(whole, lag), seg) for lag in lags])
        j = int(np.argmax(scores))
        offset = float(lags[j])
        if 0 < j < len(lags) - 1:
            a, b, c = scores[j - 1], scores[j], scores[j + 1]
            denom = a - 2 * b + c
            if denom != 0:
                offset += 0.5 * (a - c) / denom
        points.append(((edges[i] + edges[i + 1]) / 2, offset))
    if len(points) < 2:
        return None
    p = np.array(points)
    slope = np.polyfit(p[:, 0], p[:, 1], 1)[0]
    result = dict(segments=len(points), residual_angle_deg=float(math.degrees(math.atan(slope))),
                  angle_deg=float(angle + math.degrees(math.atan(slope))), span_px=float(p[:, 0].max() - p[:, 0].min()),
                  segment_offsets_px=[round(float(v), 2) for v in p[:, 1]])
    if len(points) >= 3:
        c2 = np.polyfit(p[:, 0], p[:, 1], 2)[0]
        result["bow_px"] = float(c2 * (result["span_px"] / 2) ** 2)
    return result


def column_extremes(xs, ys, x0, x1, lowest):
    """Lowest (or highest) y per image column for a pixel set, as point arrays."""
    width = x1 - x0 + 1
    if lowest:
        ext = np.full(width, -1)
        np.maximum.at(ext, xs - x0, ys)
        sel = ext >= 0
    else:
        ext = np.full(width, np.iinfo(np.int64).max)
        np.minimum.at(ext, xs - x0, ys)
        sel = ext < np.iinfo(np.int64).max
    cols = np.flatnonzero(sel) + x0
    return cols, ext[sel]


def pair_separability(ax, ay, bx, by, page_angle, config):
    """How the boundary between pixel set A (above) and B (below) can be drawn.

    axis_aligned: pixels of the other set inside each set's tight axis-aligned box.
    page_rotated: the same with boxes aligned to the page text angle.
    straight: best straight boundary at any angle in the search range, as a margin
      in pixels between pixel centers (>= separable_margin means a straight cut exists).
    column: smallest per-column vertical gap; >= 1 means a staircase boundary exists.
    """
    out = {}
    def inside(px, py, qx, qy):
        # Pixel centers closer than one pixel to the other set's center box conflict;
        # on the integer grid this is the inclusive tight-box test.
        x0, x1, y0, y1 = qx.min() - 1, qx.max() + 1, qy.min() - 1, qy.max() + 1
        return int(((px > x0) & (px < x1) & (py > y0) & (py < y1)).sum())
    out["axis_aligned"] = dict(b_in_a=inside(bx, by, ax, ay), a_in_b=inside(ax, ay, bx, by))
    arx, ary = rotate(ax.astype(np.float64), ay.astype(np.float64), page_angle)
    brx, bry = rotate(bx.astype(np.float64), by.astype(np.float64), page_angle)
    out["page_rotated"] = dict(b_in_a=inside(brx, bry, arx, ary), a_in_b=inside(arx, ary, brx, bry))
    x0 = int(min(ax.min(), bx.min()))
    x1 = int(max(ax.max(), bx.max()))
    a_cols, a_bottom = column_extremes(ax, ay, x0, x1, lowest=True)
    b_cols, b_top = column_extremes(bx, by, x0, x1, lowest=False)
    angles = np.arange(-config["straight_search_deg"], config["straight_search_deg"] + 1e-9, config["straight_step_deg"])
    rad = np.radians(angles)[:, None]
    pa = a_bottom[None, :] * np.cos(rad) - a_cols[None, :] * np.sin(rad)
    pb = b_top[None, :] * np.cos(rad) - b_cols[None, :] * np.sin(rad)
    margins = pb.min(axis=1) - pa.max(axis=1)
    j = int(np.argmax(margins))
    out["straight"] = dict(best_margin_px=float(margins[j]), best_angle_deg=float(angles[j]),
                           axis_margin_px=float(margins[np.argmin(np.abs(angles))]),
                           page_angle_margin_px=float(margins[np.argmin(np.abs(angles - page_angle))]))
    shared, ia, ib = np.intersect1d(a_cols, b_cols, return_indices=True)
    if len(shared):
        gaps = b_top[ib] - a_bottom[ia]
        out["column"] = dict(shared_columns=int(len(shared)), minimum_gap_px=int(gaps.min()),
                             interleaved_columns=int((gaps < 1).sum()))
    else:
        out["column"] = dict(shared_columns=0, minimum_gap_px=None, interleaved_columns=0)
    tol = config["conflict_pixel_tolerance"]
    margin_needed = config["separable_margin_px"]
    out["separable"] = dict(
        axis_aligned=out["axis_aligned"]["b_in_a"] + out["axis_aligned"]["a_in_b"] <= tol,
        page_rotated=out["page_rotated"]["b_in_a"] + out["page_rotated"]["a_in_b"] <= tol,
        straight_any_angle=out["straight"]["best_margin_px"] >= margin_needed - 1e-9,
        column_staircase=out["column"]["interleaved_columns"] == 0)
    return out
