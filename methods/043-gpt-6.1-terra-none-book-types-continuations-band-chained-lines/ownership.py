"""Assign line ink to model regions, then outline each region by a nearest-ink partition.

Every step is a sum, a sort, a comparison, a distance transform or a contour trace, so the
recipe can be ported to browser code without image-processing libraries beyond those.

Method 036 adds two steps to method 035's recipe:
- prepare(): thin text pieces lying in a printed rule's band and continuing it are reclassified
  as rule pieces before ownership, so they act as separators and belong to no region;
- in assign(), after the isolation check, a text component on no line joins the region whose
  box holds it and whose ink is nearest, if that ink is within a set distance. It is counted
  with the line of that nearest component, and attachments may chain (an ellipsis, dot by dot).
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


def bounds(stats):
    """Exclusive xyxy bounds of every component."""
    return np.c_[stats[:, 0], stats[:, 1], stats[:, 0] + stats[:, 2], stats[:, 1] + stats[:, 3]]


def prepare(comp, seg, shape, config):
    """Copies of comp and seg in which thin text pieces that continue a printed rule are rule pieces.

    Anchors are components of role "rule" and large thin horizontal components (a frame's top
    or bottom, the same test the passage references use for separators). A candidate is a text
    component at most rule_piece_max_height_char character heights tall. It joins an anchor if
    some ink of the anchor, or of pieces already joined, lies within rule_piece_gap_char
    character heights of it horizontally, and the candidate lies within the rows that this
    nearby ink occupies, widened by rule_piece_band_tolerance_char on each side. For the anchor,
    only rule-like rows count: those its ink crosses in at least half of its nearby columns.
    Using nearby rule rows rather than the anchor's bounding box keeps a skewed rule, or a rule
    fused with glyphs, from claiming marks of the text next to it. Pieces join one by one, so a
    broken rule end is collected piece by piece.
    Pieces get role "rule" and no line. Returns (comp, seg, pieces).
    """
    labels, stats, role, char_h = comp["labels"], comp["stats"], comp["role"], comp["char_h"]
    H, W = shape
    b = bounds(stats)
    h, w = stats[:, 3], stats[:, 2]
    anchors = np.flatnonzero((role == "rule") | ((role == "large") & (h < 0.05 * H) & (w > 0.3 * W)))
    candidates = np.flatnonzero((role == "text") & (h <= config["rule_piece_max_height_char"] * char_h))
    candidates = candidates[candidates > 0]
    tolerance = config["rule_piece_band_tolerance_char"] * char_h
    reach = config["rule_piece_gap_char"] * char_h
    pieces = {}
    for a in anchors:
        ys, xs = np.nonzero(labels[b[a, 1]:b[a, 3], b[a, 0]:b[a, 2]] == a)
        ys, xs = ys + b[a, 1], xs + b[a, 0]
        pool = candidates[(b[candidates, 3] >= ys.min() - char_h) & (b[candidates, 1] <= ys.max() + char_h)]
        taken = []
        grew = True
        while grew:
            grew = False
            for k in pool:
                if k in taken:
                    continue
                lo, hi = b[k, 0] - reach, b[k, 2] + reach
                near = (xs >= lo) & (xs < hi)
                rows = []
                if near.any():
                    # Rule-like rows only: those the anchor's ink crosses in at least half of its
                    # columns here, so glyphs fused to a rule do not widen the band.
                    y0 = ys[near].min()
                    counts = np.bincount(ys[near] - y0)
                    full = np.flatnonzero(counts >= 0.5 * len(np.unique(xs[near]))) + y0
                    if len(full):
                        rows = [full.min(), full.max() + 1]
                for t in taken:
                    if b[t, 2] > lo and b[t, 0] < hi:
                        rows += [b[t, 1], b[t, 3]]
                if rows and b[k, 1] >= min(rows) - tolerance and b[k, 3] <= max(rows) + tolerance:
                    taken.append(k)
                    grew = True
        for k in sorted(taken):
            pieces.setdefault(int(k), int(a))
    role = role.copy()
    line_of = seg["line_of"].copy()
    ids = np.array(sorted(pieces), np.int64)
    records = [dict(component_id=int(k), rule_component_id=pieces[k], line_id=int(line_of[k]), box=[int(v) for v in b[k]], area=int(stats[k, 4]))
               for k in ids]
    if len(ids):
        role[ids] = "rule"
        line_of[ids] = -1
    return dict(comp, role=role), dict(seg, line_of=line_of), records


def effective_line_of(line_of, attached):
    """Line per component, with each attached component on the line of its nearest owned neighbor."""
    out = line_of.copy()
    for a in attached:
        out[a["component_id"]] = a["line_id"]
    return out


def assign(comp, seg, boxes, config):
    """Owner region index per component (UNASSIGNED otherwise), one decision per line, dropped and attached components.

    A line normally goes whole to the box holding the largest share of its ink. A box that is
    narrower than the line and holds most of its own line ink on this line is line-local (for
    example, one of several footnotes sharing a printed line). Line-local boxes claim the
    components they hold, smallest box first; a wider box may then claim a substantial
    remainder (a note continuing from the previous line); anything left joins the claimed
    component on the line with the smallest horizontal edge-to-edge gap.

    Method 035 adds one rule after each line's decision: a component lying entirely to the left
    or right of its assigned box, and held by a box that is horizontally apart from the assigned
    box, goes to that box. This keeps a line that spans two columns (when the line finder does
    not separate them) from going whole to one column's region, while marks above or below a
    line, which stacked and skewed boxes can catch, are unaffected.

    Method 036 then attaches text components that are on no line (see attach_unlined). Call
    prepare() first so that rule pieces are not on lines. A line left with no components by
    prepare() is recorded with mode "empty".
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
        if not len(m):
            decisions.append(dict(line_id=i, mode="empty", components_moved_beside=0, region_indices=[], ink_pixels=0,
                                  line_local_box_indices=[], box_ink_shares={}))
            continue
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
        moved = 0
        if mode != "uncovered":
            claim, moved = reassign_beside(claim, m, stats, boxes, held, inside, config)
            if moved and len(set(claim.tolist()) - {UNASSIGNED}) > 1:
                mode = "split"
        owner[m] = claim
        decisions.append(dict(line_id=i, mode=mode, components_moved_beside=moved, region_indices=sorted({int(c) for c in claim if c != UNASSIGNED}),
                              ink_pixels=int(line_ink), line_local_box_indices=local,
                              box_ink_shares={str(int(r)): round(float(by_line[i, r] / max(line_ink, 1)), 4) for r in np.flatnonzero(by_line[i] > 0)}))
    dropped = drop_isolated_outliers(comp, owner, line_of, boxes, config, held)
    attached = attach_unlined(comp, line_of, owner, held, config)
    return owner, decisions, dropped, attached


def attach_unlined(comp, line_of, owner, held, config):
    """Give text components on no line to the nearest region whose box holds them. Changes owner in place.

    A candidate is an unowned component of role "text" that the line finder put on no line, such
    as a merged word, the bars of a sign, a dash or a stray letter. Among the regions whose boxes
    hold it (at least component_in_box_fraction of its pixels inside), it joins the one with the
    nearest owned component, by the gap between bounding boxes, if that gap is at most
    unlined_attach_gap_char character heights. Each pass attaches every candidate within reach
    of ink owned before the pass; passes repeat until none attaches, so attachments can chain.
    Each attached component is counted with one of the region's lines: the one whose owned ink
    spans the component's vertical center, or else comes nearest to it, preferring the line of
    the nearest owned component on a tie.
    """
    stats, role = comp["stats"], comp["role"]
    limit = config["unlined_attach_gap_char"] * comp["char_h"]
    b = bounds(stats)
    effective = line_of.copy()
    pending = [int(k) for k in np.flatnonzero((line_of < 0) & (role == "text") & (owner == UNASSIGNED)) if k > 0]
    attached = []
    rounds = 0
    while pending:
        rounds += 1
        found = []
        for k in pending:
            best = None
            for r in np.flatnonzero(held[k]):
                ks = np.flatnonzero(owner == r)
                if not len(ks):
                    continue
                gx = np.maximum(0, np.maximum(b[ks, 0] - b[k, 2], b[k, 0] - b[ks, 2]))
                gy = np.maximum(0, np.maximum(b[ks, 1] - b[k, 3], b[k, 1] - b[ks, 3]))
                gaps = np.hypot(gx, gy)
                j = int(np.argmin(gaps))
                if best is None or gaps[j] < best[0]:
                    best = (float(gaps[j]), int(r), int(ks[j]))
            if best is not None and best[0] <= limit:
                found.append((k, best))
        if not found:
            break
        lines_now = {}
        for k, (gap, r, j) in found:
            if r not in lines_now:
                ks = np.flatnonzero((owner == r) & (effective >= 0))
                lines_now[r] = [(int(L), int(b[ks[effective[ks] == L], 1].min()), int(b[ks[effective[ks] == L], 3].max())) for L in np.unique(effective[ks])]
            cy = (b[k, 1] + b[k, 3]) / 2
            line = min(lines_now[r], key=lambda e: (0 if e[1] <= cy <= e[2] else min(abs(cy - e[1]), abs(cy - e[2])), e[0] != effective[j]))[0]
            attached.append(dict(component_id=k, region_index=r, line_id=line, nearest_component_id=j,
                                 gap_px=round(gap, 1), round=rounds, box=[int(v) for v in b[k]], area=int(stats[k, 4])))
        for a in attached[len(attached) - len(found):]:
            owner[a["component_id"]] = a["region_index"]
            effective[a["component_id"]] = a["line_id"]
        pending = [k for k in pending if owner[k] == UNASSIGNED]
    return attached


def apart(a, b, config):
    """True if two pixel boxes overlap horizontally by less than a fraction of the narrower width."""
    overlap = min(a[2], b[2]) - max(a[0], b[0])
    narrower = max(1, min(a[2] - a[0], b[2] - b[0]))
    return overlap < config["side_by_side_maximum_overlap_fraction"] * narrower


def reassign_beside(claim, m, stats, boxes, held, inside, config):
    """Move components lying wholly beside their assigned box to a horizontally separate box that holds them."""
    claim = claim.copy()
    moved = 0
    x0s, x1s = stats[m, 0], stats[m, 0] + stats[m, 2]
    for j in range(len(m)):
        r = claim[j]
        if r == UNASSIGNED:
            continue
        xa, _, xb, _ = boxes[r]
        if not (x1s[j] <= xa or x0s[j] >= xb):
            continue
        holders = [int(h) for h in np.flatnonzero(held[m[j]]) if h != r and apart(boxes[h], boxes[r], config)]
        if holders:
            claim[j] = max(holders, key=lambda h: inside[m[j], h])
            moved += 1
    return claim, moved


def drop_isolated_outliers(comp, owner, line_of, boxes, config, held=None):
    """Unassign components far outside their owner's box and far from the rest of their line.

    This catches scanner-edge marks and marginal notes that the line finder grouped with a text
    line, while keeping a word the model's box merely cut off. In method 035, for a component that
    lies wholly beyond the outermost left or right edge of all boxes, the distance is measured to
    the line's components that some box holds, when there are any. A chain of frame pieces in
    the margin then no longer links an edge mark to the text. Components between boxes, such as
    glyphs on a shared footnote line that no box claimed, are judged as in method 033.
    """
    stats, char_h = comp["stats"], comp["char_h"]
    outside_limit = config["maximum_outside_gap_char"] * char_h
    isolation_limit = config["isolation_gap_char"] * char_h
    dropped = []
    outer_left = min((b[0] for b in boxes), default=0)
    outer_right = max((b[2] for b in boxes), default=0)
    for k in np.flatnonzero(owner != UNASSIGNED):
        xa, ya, xb, yb = boxes[owner[k]]
        x, y, w, h = (int(v) for v in stats[k, :4])
        gap = max(xa - (x + w), x - xb, ya - (y + h), y - yb, 0)
        if gap <= outside_limit:
            continue
        others = np.flatnonzero((line_of == line_of[k]) & (np.arange(len(stats)) != k))
        beyond = x + w <= outer_left or x >= outer_right
        if beyond and held is not None and held[others].any():
            others = others[held[others].any(axis=1)]
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
