"""Assign line ink to model regions, then outline each region by a nearest-ink partition.

Every step is a sum, a sort, a comparison, a distance transform or a contour trace, so the
recipe can be ported to browser code without image-processing libraries beyond those.
"""
import math

import cv2
import numpy as np

import geometry as g

UNASSIGNED = -1


def pixel_box(box, width, height):
    """Index bounds [xa, xb) x [ya, yb) of the pixels whose centers lie in a float xyxy box."""
    x1, y1, x2, y2 = box
    xa, ya = max(0, math.ceil(x1 - 0.5)), max(0, math.ceil(y1 - 0.5))
    xb, yb = min(width, math.floor(x2 - 0.5) + 1), min(height, math.floor(y2 - 0.5) + 1)
    return xa, ya, max(xa, xb), max(ya, yb)


def assign(comp, seg, boxes, config):
    """Owner region index per component (UNASSIGNED otherwise), one decision per line, and dropped components.

    A line normally goes whole to the box holding the largest share of its ink. A box that is
    narrower than the line and holds most of its own line ink on this line is line-local (for
    example, one of several footnotes sharing a printed line). Line-local boxes claim the
    components they hold, smallest box first; a wider box may then claim a substantial
    remainder (a note continuing from the previous line); anything left joins the claimed
    component on the line with the smallest horizontal edge-to-edge gap.
    """
    labels, stats = comp["labels"], comp["stats"]
    count, n_boxes = len(stats), len(boxes)
    area = stats[:, 4].astype(np.float64)
    inside = np.zeros((count, n_boxes), np.int64)
    for r, (xa, ya, xb, yb) in enumerate(boxes):
        inside[:, r] = np.bincount(labels[ya:yb, xa:xb].ravel(), minlength=count)
    held = inside >= config["component_in_box_fraction"] * np.maximum(area, 1)[:, None]
    box_area = np.array([(xb - xa) * (yb - ya) for xa, ya, xb, yb in boxes], np.float64)
    line_of = seg["line_of"]
    members = [np.flatnonzero(line_of == i) for i in range(len(seg["lines"]))]
    by_line = np.array([inside[m].sum(0) for m in members]).reshape(len(members), n_boxes)
    box_line_ink = by_line.sum(0)
    cx = stats[:, 0] + stats[:, 2] / 2
    owner = np.full(count, UNASSIGNED)
    decisions = []
    for i, m in enumerate(members):
        line_ink = area[m].sum()
        lx0, lx1 = stats[m, 0].min(), (stats[m, 0] + stats[m, 2]).max()
        local = []
        for r in np.flatnonzero(by_line[i] > 0):
            xa, _, xb, _ = boxes[r]
            coverage = max(0, min(xb, lx1) - max(xa, lx0)) / max(1, lx1 - lx0)
            if coverage < config["local_box_maximum_line_coverage"] and by_line[i, r] >= config["local_box_minimum_ink_share"] * box_line_ink[r]:
                local.append(int(r))
        local.sort(key=lambda r: box_area[r])
        claim = np.full(len(m), UNASSIGNED)
        for r in local:
            claim[(claim == UNASSIGNED) & held[m, r]] = r
        if (claim != UNASSIGNED).any():
            mode = "split"
            rest = claim == UNASSIGNED
            if rest.any() and n_boxes:
                remainder = inside[m[rest]].sum(0)
                remainder[local] = 0
                r = int(np.argmax(remainder))
                if remainder[r] >= config["remainder_minimum_line_share"] * line_ink:
                    claim[rest & held[m, r]] = r
            rest = claim == UNASSIGNED
            if rest.any():
                done = np.flatnonzero(~rest)
                d0, d1 = stats[m[done], 0], stats[m[done], 0] + stats[m[done], 2]
                for j in np.flatnonzero(rest):
                    x0, x1 = stats[m[j], 0], stats[m[j], 0] + stats[m[j], 2]
                    edge_gap = np.maximum(0, np.maximum(d0 - x1, x0 - d1))
                    nearest = np.lexsort((np.abs(cx[m[done]] - cx[m[j]]), edge_gap))[0]
                    claim[j] = claim[done[nearest]]
            if len(set(claim.tolist())) == 1:
                mode = "whole"
        else:
            shares = by_line[i] / max(line_ink, 1)
            r = int(np.argmax(shares)) if n_boxes else -1
            if n_boxes and shares[r] >= config["minimum_line_share"]:
                mode = "whole"
                claim[:] = r
            else:
                mode = "uncovered"
        owner[m] = claim
        decisions.append(dict(line_id=i, mode=mode, region_indices=sorted({int(c) for c in claim if c != UNASSIGNED}),
                              ink_pixels=int(line_ink), line_local_box_indices=local,
                              box_ink_shares={str(int(r)): round(float(by_line[i, r] / max(line_ink, 1)), 4) for r in np.flatnonzero(by_line[i] > 0)}))
    dropped = drop_isolated_outliers(comp, owner, line_of, boxes, config)
    return owner, decisions, dropped


def drop_isolated_outliers(comp, owner, line_of, boxes, config):
    """Unassign components far outside their owner's box and far from the rest of their line.

    This catches scanner-edge marks and marginal notes that the line finder grouped with a text
    line, while keeping a word the model's box merely cut off.
    """
    stats, char_h = comp["stats"], comp["char_h"]
    outside_limit = config["maximum_outside_gap_char"] * char_h
    isolation_limit = config["isolation_gap_char"] * char_h
    dropped = []
    for k in np.flatnonzero(owner != UNASSIGNED):
        xa, ya, xb, yb = boxes[owner[k]]
        x, y, w, h = (int(v) for v in stats[k, :4])
        gap = max(xa - (x + w), x - xb, ya - (y + h), y - yb, 0)
        if gap <= outside_limit:
            continue
        others = np.flatnonzero((line_of == line_of[k]) & (np.arange(len(stats)) != k))
        if len(others):
            ox0, ox1 = stats[others, 0], stats[others, 0] + stats[others, 2]
            neighbor_gap = float(np.maximum(0, np.maximum(ox0 - (x + w), x - ox1)).min())
        else:
            neighbor_gap = math.inf
        if neighbor_gap > isolation_limit:
            dropped.append(dict(component_id=int(k), region_index=int(owner[k]), line_id=int(line_of[k]),
                                outside_box_px=int(gap), gap_to_line_px=None if math.isinf(neighbor_gap) else int(neighbor_gap),
                                box=[x, y, x + w, y + h], area=int(stats[k, 4])))
    for d in dropped:
        owner[d["component_id"]] = UNASSIGNED
    return dropped


def nearest_site(site_mask, mask_size):
    """For every pixel, the index (into the site pixel list) of its nearest site pixel."""
    src = np.where(site_mask, 0, 255).astype(np.uint8)
    _, lab = cv2.distanceTransformWithLabels(src, cv2.DIST_L2, mask_size, labelType=cv2.DIST_LABEL_PIXEL)
    ys, xs = np.nonzero(site_mask)
    site_labels = lab[ys, xs]
    if len(np.unique(site_labels)) != len(xs):
        raise RuntimeError("Distance transform did not give each site pixel its own label.")
    lut = np.zeros(int(lab.max()) + 1, np.int64)
    lut[site_labels] = np.arange(len(xs))
    return lut[lab], ys, xs


def envelope(xs, ys, angle, pad, shape):
    """Mask of the rectangle at the page angle around pixel centers, padded, with its pixel bounds."""
    rx, ry = g.rotate(xs.astype(np.float64), ys.astype(np.float64), angle)
    corners = [(rx.min() - pad, ry.min() - pad), (rx.max() + pad, ry.min() - pad), (rx.max() + pad, ry.max() + pad), (rx.min() - pad, ry.max() + pad)]
    pts = np.array([g.unrotate(np.array(a), np.array(b), angle) for a, b in corners], np.float64)
    h, w = shape
    x0, y0 = max(0, int(math.floor(pts[:, 0].min()))), max(0, int(math.floor(pts[:, 1].min())))
    x1, y1 = min(w, int(math.ceil(pts[:, 0].max())) + 1), min(h, int(math.ceil(pts[:, 1].max())) + 1)
    mask = np.zeros((y1 - y0, x1 - x0), np.uint8)
    cv2.fillPoly(mask, [np.round((pts - [x0, y0]) * 16).astype(np.int32)], 1, lineType=cv2.LINE_8, shift=4)
    return mask.astype(bool), (x0, y0, x1, y1)


def trace(mask, seeds, x0, y0, epsilon):
    """Outer rings of the pieces of mask that contain a seed pixel, simplified, in page pixel indices."""
    count, pieces = cv2.connectedComponents(mask.astype(np.uint8), connectivity=8)
    keep = np.unique(pieces[seeds])
    keep = keep[keep > 0]
    rings = []
    for v in keep:
        contours, _ = cv2.findContours((pieces == v).astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        c = max(contours, key=cv2.contourArea)
        a = cv2.approxPolyDP(c, epsilon, True).reshape(-1, 2)
        rings.append(([[int(x) + x0, int(y) + y0] for x, y in a], int((pieces == v).sum())))
    rings.sort(key=lambda r: -r[1])
    return [r[0] for r in rings]


def outline_regions(shape, comp, seg, owner, angle, n_regions, config):
    """Polygon rings per region and per (line, region) unit from the nearest-ink partition.

    Sites are owned ink plus rules and large non-text components (as one separator class).
    Each region is its partition cell clipped to a padded rectangle at the page angle around
    its own ink; each line unit is its cell clipped to the region and to its own padded rectangle.
    Unit cells refine region cells exactly because both come from the same nearest site pixel.
    """
    labels, role, line_of = comp["labels"], comp["role"], seg["line_of"]
    count = len(comp["stats"])
    separator = n_regions
    region_of_comp = np.full(count, -1)
    region_of_comp[owner != UNASSIGNED] = owner[owner != UNASSIGNED]
    region_of_comp[(role == "rule") | (role == "large")] = separator
    owned = np.flatnonzero(owner != UNASSIGNED)
    unit_keys = sorted({(int(line_of[k]), int(owner[k])) for k in owned})
    unit_index = {key: u for u, key in enumerate(unit_keys)}
    unit_of_comp = np.full(count, -1)
    for k in owned:
        unit_of_comp[k] = unit_index[(int(line_of[k]), int(owner[k]))]
    unit_of_comp[region_of_comp == separator] = len(unit_keys)
    site_region = region_of_comp[labels]
    nearest, sy, sx = nearest_site(site_region >= 0, config["distance_mask_size"])
    region_map = site_region[sy, sx][nearest]
    unit_map = unit_of_comp[labels][sy, sx][nearest]
    pad = config["envelope_padding_char"] * comp["char_h"]
    eps = config["polygon_epsilon_px"]
    owned_px = region_of_comp[labels]
    unit_px = unit_of_comp[labels]
    regions = []
    for r in range(n_regions):
        ys, xs = np.nonzero(owned_px == r)
        if len(xs) == 0:
            regions.append(dict(rings=[], lines=[]))
            continue
        env, (x0, y0, x1, y1) = envelope(xs, ys, angle, pad, shape)
        mask = env & (region_map[y0:y1, x0:x1] == r)
        rings = trace(mask, (ys - y0, xs - x0), x0, y0, eps)
        lines = []
        for u, (line_id, ur) in enumerate(unit_keys):
            if ur != r:
                continue
            uy, ux = np.nonzero(unit_px == u)
            uenv, (u0, v0, u1, v1) = envelope(ux, uy, angle, pad, shape)
            umask = uenv & (unit_map[v0:v1, u0:u1] == u)
            # Clip to the region mask where the two crops overlap.
            clip = np.zeros_like(umask)
            a0, b0, a1, b1 = max(u0, x0), max(v0, y0), min(u1, x1), min(v1, y1)
            clip[b0 - v0:b1 - v0, a0 - u0:a1 - u0] = mask[b0 - y0:b1 - y0, a0 - x0:a1 - x0]
            umask &= clip
            lines.append(dict(line_id=line_id, ink_pixels=int(len(ux)), rings=trace(umask, (uy - v0, ux - u0), u0, v0, eps)))
        regions.append(dict(rings=rings, lines=lines))
    return regions


def rasterize(rings, shape):
    mask = np.zeros(shape, np.uint8)
    if rings:
        cv2.fillPoly(mask, [np.array(r, np.int32) for r in rings], 1, lineType=cv2.LINE_8)
    return mask.astype(bool)


def box_mask(box, shape):
    """Pixels touching a float xyxy box (the inclusion rule of method 032's box scoring)."""
    x1, y1, x2, y2 = box
    mask = np.zeros(shape, bool)
    xa, ya = max(0, int(math.floor(x1))), max(0, int(math.floor(y1)))
    xb, yb = min(shape[1], int(math.ceil(x2))), min(shape[0], int(math.ceil(y2)))
    mask[ya:yb, xa:xb] = True
    return mask
