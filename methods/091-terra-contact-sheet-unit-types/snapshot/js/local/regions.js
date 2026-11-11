// Line ownership and region outlines of method 043's local step, ported from methods/043-…/ownership.py: rule
// pieces (prepare), each line's ink given to the model boxes (assign, with reassign_beside, drop_isolated_outliers
// and attach_unlined), and outlines from the nearest-ink partition (outline_regions), as polygon rings in page
// pixel indices. The distance transform is a 5×5 chamfer transform with OpenCV's weights; contours are traced
// and simplified (Douglas–Peucker) as cv2.findContours and cv2.approxPolyDP do, so vertices may differ slightly
// from the Python results while the outlines agree.

import { ROLE, components, rotate, unrotate } from "./ink.js";

export const UNASSIGNED = -1;

// Index bounds [xa, xb) × [ya, yb) of the pixels whose centers lie in a float xyxy box (ownership.pixel_box).
export function pixelBox([x1, y1, x2, y2], W, H) {
  const xa = Math.max(0, Math.ceil(x1 - 0.5)), ya = Math.max(0, Math.ceil(y1 - 0.5));
  const xb = Math.min(W, Math.floor(x2 - 0.5) + 1), yb = Math.min(H, Math.floor(y2 - 0.5) + 1);
  return [xa, ya, Math.max(xa, xb), Math.max(ya, yb)];
}

// Thin text pieces continuing a printed rule become rule pieces (ownership.prepare). Returns {role, lineOf, pieces}.
export function prepare(comp, seg, cfg) {
  const { labels, x0, y0, x1, y1, role: role0, charH, count, W, H } = comp;
  const h = k => y1[k] - y0[k], w = k => x1[k] - x0[k];
  const anchors = [], candidates = [];
  for (let k = 0; k < count; k++) {
    if (role0[k] === ROLE.rule || (role0[k] === ROLE.large && h(k) < 0.05 * H && w(k) > 0.3 * W)) anchors.push(k);
    if (k > 0 && role0[k] === ROLE.text && h(k) <= cfg.rule_piece_max_height_char * charH) candidates.push(k);
  }
  const tol = cfg.rule_piece_band_tolerance_char * charH, reach = cfg.rule_piece_gap_char * charH;
  const pieces = new Map();
  for (const a of anchors) {
    const xs = [], ys = [];
    for (let y = y0[a]; y < y1[a]; y++) for (let x = x0[a]; x < x1[a]; x++) if (labels[y * W + x] === a) { xs.push(x); ys.push(y); }
    const ymin = Math.min(...ys), ymax = Math.max(...ys);
    const pool = candidates.filter(k => y1[k] >= ymin - charH && y0[k] <= ymax + charH);
    const taken = [];
    let grew = true;
    while (grew) {
      grew = false;
      for (const k of pool) {
        if (taken.includes(k)) continue;
        const lo = x0[k] - reach, hi = x1[k] + reach;
        let rows = [];
        const nearY = [], nearX = new Set();
        for (let i = 0; i < xs.length; i++) if (xs[i] >= lo && xs[i] < hi) { nearY.push(ys[i]); nearX.add(xs[i]); }
        if (nearY.length) {
          const yb = Math.min(...nearY);
          const counts = new Map();
          for (const y of nearY) counts.set(y - yb, (counts.get(y - yb) || 0) + 1);
          const full = [...counts].filter(([, c]) => c >= 0.5 * nearX.size).map(([d]) => d + yb);
          if (full.length) rows = [Math.min(...full), Math.max(...full) + 1];
        }
        for (const t of taken) if (x1[t] > lo && x0[t] < hi) rows.push(y0[t], y1[t]);
        if (rows.length && y0[k] >= Math.min(...rows) - tol && y1[k] <= Math.max(...rows) + tol) { taken.push(k); grew = true; }
      }
    }
    for (const k of [...taken].sort((p, q) => p - q)) if (!pieces.has(k)) pieces.set(k, a);
  }
  const role = Uint8Array.from(role0), lineOf = Int32Array.from(seg.lineOf);
  for (const k of pieces.keys()) { role[k] = ROLE.rule; lineOf[k] = -1; }
  return { role, lineOf, pieces: [...pieces].sort((p, q) => p[0] - q[0]).map(([k, a]) => ({ component_id: k, rule_component_id: a })) };
}

const apart = (a, b, cfg) => {
  const overlap = Math.min(a[2], b[2]) - Math.max(a[0], b[0]);
  const narrower = Math.max(1, Math.min(a[2] - a[0], b[2] - b[0]));
  return overlap < cfg.side_by_side_maximum_overlap_fraction * narrower;
};

// Owner region per component (ownership.assign). boxes are pixel boxes [xa, ya, xb, yb).
export function assign(comp, prep, nLines, boxes, cfg) {
  const { labels, x0, x1, y0, y1, area: area0, count, W, charH } = comp;
  const { role, lineOf } = prep;
  const n = boxes.length;
  const area = k => area0[k];
  const inside = boxes.map(([xa, ya, xb, yb]) => {
    const c = new Int32Array(count);
    for (let y = ya; y < yb; y++) for (let x = xa; x < xb; x++) c[labels[y * W + x]]++;
    return c;
  });
  const held = (k, r) => inside[r][k] >= cfg.component_in_box_fraction * Math.max(area(k), 1);
  const boxArea = boxes.map(([xa, ya, xb, yb]) => (xb - xa) * (yb - ya));
  const members = Array.from({ length: nLines }, () => []);
  for (let k = 0; k < count; k++) if (lineOf[k] >= 0) members[lineOf[k]].push(k);
  const byLine = members.map(m => boxes.map((_, r) => m.reduce((s, k) => s + inside[r][k], 0)));
  const boxLineInk = boxes.map((_, r) => byLine.reduce((s, row) => s + row[r], 0));
  const cx = k => x0[k] + (x1[k] - x0[k]) / 2;
  const owner = new Int32Array(count).fill(UNASSIGNED);
  const decisions = [];
  members.forEach((m, i) => {
    if (!m.length) { decisions.push({ line_id: i, mode: "empty", region_indices: [] }); return; }
    const lineInk = m.reduce((s, k) => s + area(k), 0);
    const lx0 = Math.min(...m.map(k => x0[k])), lx1 = Math.max(...m.map(k => x1[k]));
    let local = [];
    for (let r = 0; r < n; r++) {
      if (!(byLine[i][r] > 0)) continue;
      const [xa, , xb] = boxes[r];
      const coverage = Math.max(0, Math.min(xb, lx1) - Math.max(xa, lx0)) / Math.max(1, lx1 - lx0);
      if (coverage < cfg.local_box_maximum_line_coverage && byLine[i][r] >= cfg.local_box_minimum_ink_share * boxLineInk[r]) local.push(r);
    }
    local = local.map((r, j) => [r, j]).sort((p, q) => boxArea[p[0]] - boxArea[q[0]] || p[1] - q[1]).map(p => p[0]);
    const claim = new Int32Array(m.length).fill(UNASSIGNED);
    for (const r of local) m.forEach((k, j) => { if (claim[j] === UNASSIGNED && held(k, r)) claim[j] = r; });
    let mode;
    if (claim.some(c => c !== UNASSIGNED)) {
      mode = "split";
      let rest = [...claim].map(c => c === UNASSIGNED);
      if (rest.some(Boolean) && n) {
        const remainder = boxes.map((_, r) => (local.includes(r) ? 0 : m.reduce((s, k, j) => s + (rest[j] ? inside[r][k] : 0), 0)));
        let r = 0;
        for (let q = 1; q < n; q++) if (remainder[q] > remainder[r]) r = q;
        if (remainder[r] >= cfg.remainder_minimum_line_share * lineInk) m.forEach((k, j) => { if (rest[j] && held(k, r)) claim[j] = r; });
      }
      rest = [...claim].map(c => c === UNASSIGNED);
      if (rest.some(Boolean)) {
        const done = [];
        rest.forEach((x, j) => { if (!x) done.push(j); });
        const doneClaim = done.map(j => claim[j]);
        rest.forEach((x, j) => {
          if (!x) return;
          const k = m[j];
          let best = 0, bestKey = null;
          done.forEach((d, t) => {
            const kd = m[d];
            const gap = Math.max(0, Math.max(x0[kd] - x1[k], x0[k] - x1[kd]));
            const key = [gap, Math.abs(cx(kd) - cx(k)), t];
            if (!bestKey || key[0] < bestKey[0] || (key[0] === bestKey[0] && (key[1] < bestKey[1] || (key[1] === bestKey[1] && key[2] < bestKey[2])))) { bestKey = key; best = t; }
          });
          claim[j] = doneClaim[best];
        });
      }
      if (new Set(claim).size === 1) mode = "whole";
    } else {
      const shares = byLine[i].map(v => v / Math.max(lineInk, 1));
      let r = 0;
      for (let q = 1; q < n; q++) if (shares[q] > shares[r]) r = q;
      if (n && shares[r] >= cfg.minimum_line_share) { mode = "whole"; claim.fill(r); }
      else mode = "uncovered";
    }
    if (mode !== "uncovered") {
      let moved = 0;
      m.forEach((k, j) => {
        const r = claim[j];
        if (r === UNASSIGNED) return;
        const [xa, , xb] = boxes[r];
        if (!(x1[k] <= xa || x0[k] >= xb)) return;
        const holders = [];
        for (let q = 0; q < n; q++) if (held(k, q) && q !== r && apart(boxes[q], boxes[r], cfg)) holders.push(q);
        if (holders.length) {
          let best = holders[0];
          for (const q of holders) if (inside[q][k] > inside[best][k]) best = q;
          claim[j] = best;
          moved++;
        }
      });
      if (moved && new Set([...claim].filter(c => c !== UNASSIGNED)).size > 1) mode = "split";
    }
    m.forEach((k, j) => { owner[k] = claim[j]; });
    decisions.push({ line_id: i, mode, region_indices: [...new Set([...claim].filter(c => c !== UNASSIGNED))].sort((p, q) => p - q) });
  });
  // drop_isolated_outliers
  const outsideLimit = cfg.maximum_outside_gap_char * charH, isolationLimit = cfg.isolation_gap_char * charH;
  const outerLeft = boxes.length ? Math.min(...boxes.map(b => b[0])) : 0, outerRight = boxes.length ? Math.max(...boxes.map(b => b[2])) : 0;
  const dropped = [];
  for (let k = 0; k < count; k++) {
    if (owner[k] === UNASSIGNED) continue;
    const [xa, ya, xb, yb] = boxes[owner[k]];
    const gap = Math.max(xa - x1[k], x0[k] - xb, ya - y1[k], y0[k] - yb, 0);
    if (gap <= outsideLimit) continue;
    let others = members[lineOf[k]].filter(j => j !== k);
    const beyond = x1[k] <= outerLeft || x0[k] >= outerRight;
    if (beyond) {
      const heldOthers = others.filter(j => boxes.some((_, r) => held(j, r)));
      if (heldOthers.length) others = heldOthers;
    }
    const neighborGap = others.length ? Math.min(...others.map(j => Math.max(0, Math.max(x0[j] - x1[k], x0[k] - x1[j])))) : Infinity;
    if (neighborGap > isolationLimit) dropped.push({ component_id: k, region_index: owner[k] });
  }
  for (const d of dropped) owner[d.component_id] = UNASSIGNED;
  // attach_unlined
  const limit = cfg.unlined_attach_gap_char * charH;
  const effective = Int32Array.from(lineOf);
  let pending = [];
  for (let k = 1; k < count; k++) if (lineOf[k] < 0 && role[k] === ROLE.text && owner[k] === UNASSIGNED) pending.push(k);
  const attached = [];
  const ownedBy = r => { const out = []; for (let k = 0; k < count; k++) if (owner[k] === r) out.push(k); return out; };
  while (pending.length) {
    const found = [];
    const ownedCache = new Map();
    for (const k of pending) {
      let best = null;
      for (let r = 0; r < n; r++) {
        if (!held(k, r)) continue;
        if (!ownedCache.has(r)) ownedCache.set(r, ownedBy(r));
        const ks = ownedCache.get(r);
        if (!ks.length) continue;
        let gj = 0, gmin = Infinity;
        ks.forEach((j, t) => {
          const gx = Math.max(0, Math.max(x0[j] - x1[k], x0[k] - x1[j])), gy = Math.max(0, Math.max(y0[j] - y1[k], y0[k] - y1[j]));
          const g = Math.hypot(gx, gy);
          if (g < gmin) { gmin = g; gj = t; }
        });
        if (best === null || gmin < best[0]) best = [gmin, r, ks[gj]];
      }
      if (best !== null && best[0] <= limit) found.push([k, best]);
    }
    if (!found.length) break;
    const linesNow = new Map();
    for (const [k, [, r, j]] of found) {
      if (!linesNow.has(r)) {
        const ks = (ownedCache.get(r) || ownedBy(r)).filter(q => effective[q] >= 0);
        const byL = new Map();
        for (const q of ks) {
          const L = effective[q];
          const e = byL.get(L) || [L, Infinity, -Infinity];
          e[1] = Math.min(e[1], y0[q]); e[2] = Math.max(e[2], y1[q]);
          byL.set(L, e);
        }
        linesNow.set(r, [...byL.values()].sort((p, q) => p[0] - q[0]));
      }
      const cyk = (y0[k] + y1[k]) / 2;
      let line = null, bestKey = null;
      for (const e of linesNow.get(r)) {
        const key = [e[1] <= cyk && cyk <= e[2] ? 0 : Math.min(Math.abs(cyk - e[1]), Math.abs(cyk - e[2])), e[0] !== effective[j] ? 1 : 0];
        if (!bestKey || key[0] < bestKey[0] || (key[0] === bestKey[0] && key[1] < bestKey[1])) { bestKey = key; line = e[0]; }
      }
      attached.push({ component_id: k, region_index: r, line_id: line });
    }
    for (const a of attached.slice(attached.length - found.length)) { owner[a.component_id] = a.region_index; effective[a.component_id] = a.line_id; }
    pending = pending.filter(k => owner[k] === UNASSIGNED);
  }
  return { owner, decisions, dropped, attached, lineOf: effective };
}

// For every pixel, the linear index of its nearest site pixel, by a 5×5 chamfer distance transform with OpenCV's
// DIST_L2 weights (a = 1, b = 1.4, c = 2.1969). Sites are the pixels where site[i] is true.
export function nearestSite(site, W, H) {
  const A = 1, B = 1.4, C = 2.1969;
  const dist = new Float32Array(W * H).fill(Infinity), lab = new Int32Array(W * H).fill(-1);
  for (let i = 0; i < W * H; i++) if (site[i]) { dist[i] = 0; lab[i] = i; }
  const fwd = [[-1, 0, A], [-1, -1, B], [0, -1, A], [1, -1, B], [-2, -1, C], [-1, -2, C], [1, -2, C], [2, -1, C]];
  const bwd = fwd.map(([dx, dy, w]) => [-dx, -dy, w]);
  const pass = (mask, y0, y1, ys, x0, x1, xs) => {
    for (let y = y0; y !== y1; y += ys) for (let x = x0; x !== x1; x += xs) {
      const i = y * W + x;
      let d = dist[i], l = lab[i];
      for (const [dx, dy, w] of mask) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = ny * W + nx, nd = dist[j] + w;
        if (nd < d) { d = nd; l = lab[j]; }
      }
      dist[i] = d; lab[i] = l;
    }
  };
  pass(fwd, 0, H, 1, 0, W, 1);
  pass(bwd, H - 1, -1, -1, W - 1, -1, -1);
  return lab;
}

// The padded rectangle at the page angle around pixel centers, as a mask over its crop (ownership.envelope).
function envelope(xs, ys, angle, pad, W, H) {
  let rx0 = Infinity, rx1 = -Infinity, ry0 = Infinity, ry1 = -Infinity;
  for (let i = 0; i < xs.length; i++) {
    const [rx, ry] = rotate(xs[i], ys[i], angle);
    if (rx < rx0) rx0 = rx; if (rx > rx1) rx1 = rx; if (ry < ry0) ry0 = ry; if (ry > ry1) ry1 = ry;
  }
  const pts = [[rx0 - pad, ry0 - pad], [rx1 + pad, ry0 - pad], [rx1 + pad, ry1 + pad], [rx0 - pad, ry1 + pad]].map(([a, b]) => unrotate(a, b, angle));
  const cx0 = Math.max(0, Math.floor(Math.min(...pts.map(p => p[0])))), cy0 = Math.max(0, Math.floor(Math.min(...pts.map(p => p[1]))));
  const cx1 = Math.min(W, Math.ceil(Math.max(...pts.map(p => p[0]))) + 1), cy1 = Math.min(H, Math.ceil(Math.max(...pts.map(p => p[1]))) + 1);
  const w = cx1 - cx0, h = cy1 - cy0;
  const mask = new Uint8Array(Math.max(0, w * h));
  // Vertices at 1/16 pixel, as cv2.fillPoly with shift 4, which rounds edge positions to the nearest pixel: rows
  // from the rounded top to the rounded bottom, and in each row the pixels from the rounded left edge to the
  // rounded right edge.
  const q = pts.map(([x, y]) => [Math.round((x - cx0) * 16) / 16, Math.round((y - cy0) * 16) / 16]);
  const qy0 = Math.min(...q.map(p => p[1])), qy1 = Math.max(...q.map(p => p[1]));
  for (let y = Math.max(0, Math.round(qy0)); y <= Math.min(h - 1, Math.round(qy1)); y++) {
    const yy = Math.min(qy1, Math.max(qy0, y));
    let lo = Infinity, hi = -Infinity;
    for (let e = 0; e < 4; e++) {
      const [ax, ay] = q[e], [bx, by] = q[(e + 1) % 4];
      if ((ay <= yy && yy <= by) || (by <= yy && yy <= ay)) {
        if (ay === by) { lo = Math.min(lo, ax, bx); hi = Math.max(hi, ax, bx); }
        else { const x = ax + ((yy - ay) * (bx - ax)) / (by - ay); lo = Math.min(lo, x); hi = Math.max(hi, x); }
      }
    }
    for (let x = Math.max(0, Math.round(lo)); x <= Math.min(w - 1, Math.round(hi)); x++) mask[y * w + x] = 1;
  }
  return { mask, x0: cx0, y0: cy0, x1: cx1, y1: cy1, w, h };
}

// Neighbor directions, counterclockwise on the screen (y down): E, NE, N, NW, W, SW, S, SE.
const DIRS = [[1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0], [-1, 1], [0, 1], [1, 1]];

// The outer border of one 8-connected piece, by Suzuki and Abe's border following from its first pixel in raster
// order (as cv2.findContours), with straight runs reduced to their end points (CHAIN_APPROX_SIMPLE).
function outerContour(mask, w, h, start) {
  const at = (x, y) => x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x] === 1;
  const sx = start % w, sy = (start - sx) / w;
  let d1 = -1;
  for (let t = 0; t < 8; t++) { const d = (4 - t + 8) % 8; if (at(sx + DIRS[d][0], sy + DIRS[d][1])) { d1 = d; break; } }
  if (d1 < 0) return [[sx, sy]];
  const p1x = sx + DIRS[d1][0], p1y = sy + DIRS[d1][1];
  let cx = sx, cy = sy, back = d1;
  const pts = [];
  for (let guard = 0; guard < 8 * w * h + 16; guard++) {
    pts.push([cx, cy]);
    let d4 = back;
    for (let t = 1; t <= 8; t++) { const d = (back + t) % 8; if (at(cx + DIRS[d][0], cy + DIRS[d][1])) { d4 = d; break; } }
    const nx = cx + DIRS[d4][0], ny = cy + DIRS[d4][1];
    if (nx === sx && ny === sy && cx === p1x && cy === p1y) break;
    back = (d4 + 4) % 8;
    cx = nx; cy = ny;
  }
  const n = pts.length;
  if (n <= 2) return pts;
  const out = [];
  for (let i = 0; i < n; i++) {
    const [px, py] = pts[(i - 1 + n) % n], [qx, qy] = pts[i], [nx, ny] = pts[(i + 1) % n];
    if (qx - px === nx - qx && qy - py === ny - qy) continue;
    out.push(pts[i]);
  }
  return out.length ? out : pts.slice(0, 1);
}

// Douglas–Peucker simplification of a closed polygon.
function approxClosed(pts, eps) {
  const n = pts.length;
  if (n <= 3) return pts;
  const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
  let far = 0;
  for (let i = 1; i < n; i++) if (d2(pts[i], pts[0]) > d2(pts[far], pts[0])) far = i;
  const keep = new Uint8Array(n);
  keep[0] = keep[far] = 1;
  const segDist = (p, a, b) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
    return L === 0 ? Math.hypot(p[0] - a[0], p[1] - a[1]) : Math.abs(dy * (p[0] - a[0]) - dx * (p[1] - a[1])) / L;
  };
  const stack = [[0, far], [far, n]];
  while (stack.length) {
    const [i, j] = stack.pop();
    const a = pts[i], b = pts[j % n];
    let best = -1, bd = 0;
    for (let k = i + 1; k < j; k++) { const d = segDist(pts[k], a, b); if (d > bd) { bd = d; best = k; } }
    if (best >= 0 && bd > eps) { keep[best] = 1; stack.push([i, best], [best, j]); }
  }
  return pts.filter((_, i) => keep[i]);
}

// Outer rings of the pieces of a crop mask that contain a seed pixel, simplified, in page pixel indices, largest
// piece first (ownership.trace).
function trace(mask, w, h, seeds, ox, oy, eps) {
  const pieces = components(mask, w, h);
  const keep = new Set();
  for (const i of seeds) { const v = pieces.labels[i]; if (v > 0) keep.add(v); }
  const first = new Int32Array(pieces.count).fill(-1);
  for (let i = 0; i < w * h; i++) { const v = pieces.labels[i]; if (v > 0 && first[v] < 0) first[v] = i; }
  const rings = [];
  for (const v of [...keep].sort((p, q) => p - q)) {
    const piece = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) piece[i] = pieces.labels[i] === v ? 1 : 0;
    const contour = approxClosed(outerContour(piece, w, h, first[v]), eps);
    rings.push([contour.map(([x, y]) => [x + ox, y + oy]), pieces.area[v]]);
  }
  rings.sort((p, q) => q[1] - p[1]);
  return rings.map(r => r[0]);
}

// Polygon rings per region and per (line, region) unit from the nearest-ink partition (ownership.outline_regions).
export function outlineRegions(comp, prep, owner, lineOf, angle, nRegions, cfg) {
  const { labels, count, W, H, charH } = comp;
  const { role } = prep;
  const separator = nRegions;
  const regionOf = new Int32Array(count).fill(-1);
  for (let k = 0; k < count; k++) {
    if (owner[k] !== UNASSIGNED) regionOf[k] = owner[k];
    if (role[k] === ROLE.rule || role[k] === ROLE.large) regionOf[k] = separator;
  }
  const keys = new Map();
  for (let k = 0; k < count; k++) if (owner[k] !== UNASSIGNED) keys.set(`${lineOf[k]},${owner[k]}`, [lineOf[k], owner[k]]);
  const unitKeys = [...keys.values()].sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  const unitIndex = new Map(unitKeys.map((k, u) => [`${k[0]},${k[1]}`, u]));
  const unitOf = new Int32Array(count).fill(-1);
  for (let k = 0; k < count; k++) {
    if (owner[k] !== UNASSIGNED) unitOf[k] = unitIndex.get(`${lineOf[k]},${owner[k]}`);
    if (regionOf[k] === separator) unitOf[k] = unitKeys.length;
  }
  const site = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) site[i] = regionOf[labels[i]] >= 0 ? 1 : 0;
  const nearest = nearestSite(site, W, H);
  const regionMap = new Int32Array(W * H), unitMap = new Int32Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const s = nearest[i];
    regionMap[i] = s >= 0 ? regionOf[labels[s]] : -1;
    unitMap[i] = s >= 0 ? unitOf[labels[s]] : -1;
  }
  const pad = cfg.envelope_padding_char * charH, eps = cfg.polygon_epsilon_px;
  const pixelsOf = Array.from({ length: nRegions }, () => [[], []]);
  const unitPixels = unitKeys.map(() => [[], []]);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const k = labels[y * W + x];
    if (!k) continue;
    const r = regionOf[k];
    if (r >= 0 && r < nRegions) { pixelsOf[r][0].push(x); pixelsOf[r][1].push(y); }
    const u = unitOf[k];
    if (u >= 0 && u < unitKeys.length) { unitPixels[u][0].push(x); unitPixels[u][1].push(y); }
  }
  const regions = [];
  for (let r = 0; r < nRegions; r++) {
    const [xs, ys] = pixelsOf[r];
    if (!xs.length) { regions.push({ rings: [], lines: [] }); continue; }
    const env = envelope(xs, ys, angle, pad, W, H);
    const mask = new Uint8Array(env.w * env.h);
    for (let y = 0; y < env.h; y++) for (let x = 0; x < env.w; x++) {
      const i = y * env.w + x;
      mask[i] = env.mask[i] && regionMap[(y + env.y0) * W + x + env.x0] === r ? 1 : 0;
    }
    const seeds = xs.map((x, i) => (ys[i] - env.y0) * env.w + (x - env.x0));
    const rings = trace(mask, env.w, env.h, seeds, env.x0, env.y0, eps);
    const lines = [];
    unitKeys.forEach(([lineId, ur], u) => {
      if (ur !== r) return;
      const [ux, uy] = unitPixels[u];
      const ue = envelope(ux, uy, angle, pad, W, H);
      const umask = new Uint8Array(ue.w * ue.h);
      for (let y = 0; y < ue.h; y++) for (let x = 0; x < ue.w; x++) {
        const i = y * ue.w + x;
        if (!ue.mask[i]) continue;
        const px = x + ue.x0, py = y + ue.y0;
        if (unitMap[py * W + px] !== u) continue;
        // Clipped to the region's mask where the two crops overlap.
        const rx = px - env.x0, ry = py - env.y0;
        if (rx < 0 || ry < 0 || rx >= env.w || ry >= env.h || !mask[ry * env.w + rx]) continue;
        umask[i] = 1;
      }
      const useeds = ux.map((x, i) => (uy[i] - ue.y0) * ue.w + (x - ue.x0));
      lines.push({ line_id: lineId, ink_pixels: ux.length, rings: trace(umask, ue.w, ue.h, useeds, ue.x0, ue.y0, eps) });
    });
    regions.push({ rings, lines });
  }
  return regions;
}

// Everything that depends on the boxes: ownership and outlines for the given float xyxy boxes, one per region.
export function regionsFromBoxes(analysis, boxes, cfg) {
  const { comp, seg, angle } = analysis;
  const prep = analysis.prep || (analysis.prep = prepare(comp, seg, cfg));
  const pboxes = boxes.map(b => pixelBox(b, comp.W, comp.H));
  const { owner, decisions, dropped, attached, lineOf } = assign(comp, prep, seg.lines.length, pboxes, cfg);
  const geometry = outlineRegions(comp, prep, owner, lineOf, angle, boxes.length, cfg);
  // Keep the parent's original ID so existing text follows the enlarged line.
  for (const region of geometry) for (const line of region.lines) {
    const band = seg.lines[line.line_id];
    if (band?.previous_line_ids) {
      line.previous_line_ids = band.previous_line_ids;
      line.line_id = band.anchor_line_id;
    }
  }
  const uncovered = uncoveredLines(comp, prep, decisions, owner, seg.lines);
  return { geometry, owner, decisions, dropped, attached, uncovered };
}

export function uncoveredLines(comp, prep, decisions, owner, bands = []) {
  return decisions.filter(decision => decision.mode === "uncovered").flatMap(decision => {
    const members = [];
    for (let index = 1; index < comp.count; index++) if (prep.lineOf[index] === decision.line_id) members.push(index);
    if (!members.length || members.some(index => owner[index] !== UNASSIGNED)) return [];
    return [{ line_id: bands[decision.line_id]?.anchor_line_id ?? decision.line_id,
      box: [Math.min(...members.map(index => comp.x0[index])), Math.min(...members.map(index => comp.y0[index])),
        Math.max(...members.map(index => comp.x1[index])), Math.max(...members.map(index => comp.y1[index]))] }];
  });
}
