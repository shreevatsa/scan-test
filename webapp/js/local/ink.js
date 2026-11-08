// Page analysis of method 043's local step, ported from methods/043-…/geometry.py (ink_components, estimate_angle,
// segment_lines): the ink mask and its connected components with roles, the page's text angle, and the text lines.
// Images are grayscale Uint8Arrays in row-major order. Coordinates are pixel indices (x right, y down); the
// "rotated" frame is the page rotated by the negative text angle, so lines are about horizontal in it.

export const ROLE = { background: 0, text: 1, rule: 2, large: 3, none: 4 };

// OpenCV's Otsu threshold for 8-bit images (getThreshVal_Otsu_8u).
export function otsu(gray) {
  const hist = new Float64Array(256);
  for (let i = 0; i < gray.length; i++) hist[gray[i]]++;
  const scale = 1 / gray.length;
  let mu = 0;
  for (let i = 0; i < 256; i++) mu += i * hist[i];
  mu *= scale;
  let mu1 = 0, q1 = 0, maxSigma = 0, maxVal = 0;
  const EPS = 1.1920928955078125e-7;
  for (let i = 0; i < 256; i++) {
    const p = hist[i] * scale;
    mu1 *= q1;
    q1 += p;
    const q2 = 1 - q1;
    if (Math.min(q1, q2) < EPS || Math.max(q1, q2) > 1 - EPS) continue;
    mu1 = (mu1 + i * p) / q1;
    const mu2 = (mu - q1 * mu1) / q2;
    const sigma = q1 * q2 * (mu1 - mu2) * (mu1 - mu2);
    if (sigma > maxSigma) { maxSigma = sigma; maxVal = i; }
  }
  return maxVal;
}

// 8-connected components of a 0/1 mask. Labels are numbered from 1 in the raster order of each component's first
// pixel; 0 is the background. Returns {count (including the background), labels, x0, y0, x1, y1 (exclusive), area}.
export function components(mask, W, H) {
  const labels = new Int32Array(W * H);
  const parent = [0];
  const find = a => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  const union = (a, b) => { a = find(a); b = find(b); if (a !== b) { if (a < b) parent[b] = a; else parent[a] = b; } return Math.min(a, b); };
  let next = 1;
  for (let y = 0; y < H; y++) {
    const row = y * W;
    for (let x = 0; x < W; x++) {
      const i = row + x;
      if (!mask[i]) continue;
      let l = 0;
      const look = j => { const m = labels[j]; if (m) l = l ? union(l, m) : find(m); };
      if (x > 0) look(i - 1);
      if (y > 0) {
        if (x > 0) look(i - W - 1);
        look(i - W);
        if (x + 1 < W) look(i - W + 1);
      }
      if (!l) { l = next++; parent.push(l); }
      labels[i] = l;
    }
  }
  const final = new Int32Array(next);
  let count = 1;
  for (let i = 0; i < W * H; i++) {
    const l = labels[i];
    if (!l) continue;
    const r = find(l);
    if (!final[r]) final[r] = count++;
    labels[i] = final[r];
  }
  const x0 = new Int32Array(count).fill(W), y0 = new Int32Array(count).fill(H), x1 = new Int32Array(count), y1 = new Int32Array(count), area = new Int32Array(count);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const l = labels[y * W + x];
    if (!l) continue;
    area[l]++;
    if (x < x0[l]) x0[l] = x; if (x + 1 > x1[l]) x1[l] = x + 1;
    if (y < y0[l]) y0[l] = y; if (y + 1 > y1[l]) y1[l] = y + 1;
  }
  area[0] = W * H - area.reduce((a, b) => a + b, 0);
  x0[0] = 0; y0[0] = 0; x1[0] = W; y1[0] = H;
  return { count, labels, x0, y0, x1, y1, area };
}

// Hysteresis ink mask and components with roles (geometry.ink_components).
export function inkComponents(gray, W, H, cfg) {
  const strong = Math.min(otsu(gray), cfg.maximum_strong_threshold);
  const weakT = (strong + 255) / 2;
  const weak = new Uint8Array(W * H);
  for (let i = 0; i < gray.length; i++) weak[i] = gray[i] < weakT ? 1 : 0;
  const c = components(weak, W, H);
  const hasStrong = new Uint8Array(c.count);
  for (let i = 0; i < gray.length; i++) if (gray[i] <= strong) hasStrong[c.labels[i]] = 1;
  hasStrong[0] = 0;
  const w = k => c.x1[k] - c.x0[k], h = k => c.y1[k] - c.y0[k];
  const baseSpeck = Math.max(4, Math.trunc(H * W * cfg.speck_area_page_fraction));
  const cand = [];
  for (let k = 1; k < c.count; k++) if (hasStrong[k] && c.area[k] >= baseSpeck && h(k) < H * 0.05) cand.push(k);
  let charH;
  if (!cand.length) charH = H * 0.015;
  else {
    cand.sort((a, b) => h(a) - h(b));
    const cum = [];
    let s = 0;
    for (const k of cand) { s += c.area[k]; cum.push(s); }
    const half = s / 2;
    let j = 0;
    while (cum[j] < half) j++;
    charH = h(cand[j]);
  }
  const speck = Math.max(baseSpeck, Math.trunc((cfg.speck_size_char_fraction * charH) ** 2));
  const role = new Uint8Array(c.count).fill(ROLE.none);
  for (let k = 1; k < c.count; k++) {
    if (!(hasStrong[k] && c.area[k] >= speck)) continue;
    const rule = w(k) >= cfg.rule_minimum_aspect * h(k) && h(k) < cfg.rule_maximum_height_char * charH && w(k) > cfg.rule_minimum_width_char * charH;
    const large = !rule && (h(k) > cfg.large_component_height_char * charH || w(k) > cfg.large_component_width_page * W);
    role[k] = rule ? ROLE.rule : large ? ROLE.large : ROLE.text;
  }
  role[0] = ROLE.background;
  return { ...c, role, charH, strongThreshold: strong, weakThreshold: weakT, speckArea: speck, W, H };
}

const radians = d => d * (Math.PI / 180);

function sharpness(xs, ys, angle) {
  const a = radians(angle), s = Math.sin(a), co = Math.cos(a);
  const n = xs.length;
  const ry = new Float64Array(n);
  let lo = Infinity;
  for (let i = 0; i < n; i++) { const v = -xs[i] * s + ys[i] * co; ry[i] = v; if (v < lo) lo = v; }
  let maxBin = 0;
  const bins = new Int32Array(n);
  for (let i = 0; i < n; i++) { const b = Math.floor(ry[i] - lo); bins[i] = b; if (b > maxBin) maxBin = b; }
  const counts = new Float64Array(maxBin + 1);
  for (let i = 0; i < n; i++) counts[bins[i]]++;
  let sum = 0;
  for (let i = 0; i <= maxBin; i++) sum += counts[i] * counts[i];
  return sum;
}

// numpy.arange's values, exactly: its length is ceil((stop - start) / step), and it fills start, start + step, then
// start + i * delta with delta = (start + step) - start. (An exact zero would make a projection profile
// artificially sharp, so the grid must match numpy's.)
function arange(start, stop, step) {
  const n = Math.max(0, Math.ceil((stop - start) / step));
  const out = [];
  if (n > 0) out.push(start);
  if (n > 1) out.push(start + step);
  const delta = (start + step) - start;
  for (let i = 2; i < n; i++) out.push(start + i * delta);
  return out;
}

// The angle maximizing the horizontal projection profile's sharpness (geometry.estimate_angle).
export function estimateAngle(xs, ys, low, high, coarseStep, fineStep) {
  const coarse = arange(low, high + coarseStep / 2, coarseStep);
  let best = coarse[0], bestScore = -Infinity;
  for (const a of coarse) { const sc = sharpness(xs, ys, a); if (sc > bestScore) { bestScore = sc; best = a; } }
  const fine = arange(best - coarseStep * 1.5, best + coarseStep * 1.5 + fineStep / 2, fineStep);
  let fbest = fine[0], fScore = -Infinity;
  for (const a of fine) { const sc = sharpness(xs, ys, a); if (sc > fScore) { fScore = sc; fbest = a; } }
  return fbest;
}

export function rotate(x, y, angle) {
  const a = radians(angle);
  return [x * Math.cos(a) + y * Math.sin(a), -x * Math.sin(a) + y * Math.cos(a)];
}

export function unrotate(rx, ry, angle) {
  const a = radians(angle);
  return [rx * Math.cos(a) - ry * Math.sin(a), rx * Math.sin(a) + ry * Math.cos(a)];
}

// Split the rotated x-range at full-height empty gutters (geometry.find_columns).
function findColumns(rx, charH, cfg) {
  let lo = Infinity, hi = -Infinity;
  for (const v of rx) { if (v < lo) lo = v; if (v > hi) hi = v; }
  let maxBin = 0;
  for (const v of rx) maxBin = Math.max(maxBin, Math.floor(v - lo));
  const hist = new Float64Array(maxBin + 1);
  for (const v of rx) hist[Math.floor(v - lo)]++;
  const minimum = cfg.gutter_minimum_width_char * charH, total = rx.length;
  const cum = new Float64Array(hist.length);
  let s = 0;
  for (let i = 0; i < hist.length; i++) { s += hist[i]; cum[i] = s; }
  const cuts = [];
  let start = null;
  for (let i = 0; i <= hist.length; i++) {
    const e = i < hist.length && hist[i] === 0;
    if (e && start === null) start = i;
    else if (!e && start !== null) {
      if (i - start >= minimum) {
        const left = start > 0 ? cum[start - 1] : 0, right = total - cum[i - 1];
        if (Math.min(left, right) >= cfg.gutter_minimum_side_fraction * total) cuts.push(lo + (start + i) / 2);
      }
      start = null;
    }
  }
  const edges = [lo - 1, ...cuts, hi + 1];
  return edges.slice(0, -1).map((e, i) => [e, edges[i + 1]]);
}

function median(values) {
  const v = [...values].sort((a, b) => a - b), n = v.length;
  return n % 2 ? v[(n - 1) / 2] : (v[n / 2 - 1] + v[n / 2]) / 2;
}

// Text components grouped into lines in the rotated frame (geometry.segment_lines, without the bridging
// diagnostics). Returns {lines, lineOf (Int32Array per component, -1 for none), columns, columnOf}.
export function segmentLines(comp, angle, cfg) {
  const { labels, role, charH, count, W, H } = comp;
  const isText = k => role[k] === ROLE.text;
  const ryLo = new Float64Array(count).fill(Infinity), ryHi = new Float64Array(count).fill(-Infinity);
  const rxLo = new Float64Array(count).fill(Infinity), rxHi = new Float64Array(count).fill(-Infinity);
  const a = radians(angle), sa = Math.sin(a), ca = Math.cos(a);
  const allRx = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const k = labels[y * W + x];
    if (!k || !isText(k)) continue;
    const rx = x * ca + y * sa, ry = -x * sa + y * ca;
    allRx.push(rx);
    if (ry < ryLo[k]) ryLo[k] = ry; if (ry > ryHi[k]) ryHi[k] = ry;
    if (rx < rxLo[k]) rxLo[k] = rx; if (rx > rxHi[k]) rxHi[k] = rx;
  }
  const cy = new Float64Array(count), cx = new Float64Array(count), rh = new Float64Array(count);
  for (let k = 0; k < count; k++) { cy[k] = (ryLo[k] + ryHi[k]) / 2; cx[k] = (rxLo[k] + rxHi[k]) / 2; rh[k] = ryHi[k] - ryLo[k] + 1; }
  const columns = allRx.length ? findColumns(allRx, charH, cfg) : [];
  const columnOf = new Int32Array(count).fill(-1);
  for (let k = 1; k < count; k++) {
    if (!isText(k)) continue;
    columns.forEach(([lo, hi], ci) => { if (cx[k] > lo && cx[k] <= hi) columnOf[k] = ci; });
  }
  const isMain = k => isText(k) && rh[k] >= cfg.main_minimum_height_char * charH && rh[k] <= cfg.main_maximum_height_char * charH;
  const lineOf = new Int32Array(count).fill(-1);
  let lines = [];
  for (let ci = 0; ci < columns.length; ci++) {
    const ids = [];
    for (let k = 1; k < count; k++) if (isMain(k) && columnOf[k] === ci) ids.push(k);
    if (!ids.length) continue;
    ids.sort((p, q) => cy[p] - cy[q]);
    let group = [ids[0]];
    const flush = g => {
      for (const k of g) lineOf[k] = lines.length;
      lines.push({ line_id: lines.length, column: ci, rx0: Math.min(...g.map(k => rxLo[k])), rx1: Math.max(...g.map(k => rxHi[k])),
                   core_top: Math.min(...g.map(k => ryLo[k])), core_bottom: Math.max(...g.map(k => ryHi[k])), center: median(g.map(k => cy[k])) });
    };
    for (let j = 1; j < ids.length; j++) {
      if (cy[ids[j]] - cy[ids[j - 1]] > cfg.line_split_gap_char * charH) { flush(group); group = []; }
      group.push(ids[j]);
    }
    flush(group);
  }
  // Detached marks and other non-main text components go to the nearest line band.
  const pad = cfg.assign_horizontal_pad_char * charH, limit = cfg.assign_maximum_distance_char * charH;
  for (let k = 1; k < count; k++) {
    if (!isText(k) || isMain(k)) continue;
    let best = -1, bestD = Infinity;
    for (const L of lines) {
      if (L.column !== columnOf[k] || cx[k] < L.rx0 - pad || cx[k] > L.rx1 + pad) continue;
      const d = L.core_top <= cy[k] && cy[k] <= L.core_bottom ? 0 : Math.min(Math.abs(cy[k] - L.core_top), Math.abs(cy[k] - L.core_bottom));
      if (d < bestD) { best = L.line_id; bestD = d; }
    }
    if (best >= 0 && bestD <= limit) lineOf[k] = best;
  }
  // Method 039: short glyphs in a line's core band chain into it.
  if (cfg.band_chain_gap_char !== undefined && cfg.band_chain_gap_char !== null) {
    const gapLimit = cfg.band_chain_gap_char * charH;
    const nearestGap = (k, ids) => {
      let m = Infinity;
      for (const j of ids) {
        if (j === k) continue;
        const dx = Math.max(0, rxLo[j] - rxHi[k], rxLo[k] - rxHi[j]), dy = Math.max(0, ryLo[j] - ryHi[k], ryLo[k] - ryHi[j]);
        m = Math.min(m, Math.hypot(dx, dy));
      }
      return m;
    };
    const membersOf = i => { const out = []; for (let k = 0; k < count; k++) if (lineOf[k] === i) out.push(k); return out; };
    for (const L of lines) {
      const i = L.line_id;
      const pool = [];
      for (let k = 1; k < count; k++) {
        if (!isText(k) || isMain(k) || !(rh[k] < cfg.main_minimum_height_char * charH)) continue;
        if (!(cy[k] >= L.core_top && cy[k] <= L.core_bottom)) continue;
        const cur = lineOf[k];
        const ownBand = cur >= 0 && cy[k] >= lines[cur].core_top && cy[k] <= lines[cur].core_bottom;
        if (ownBand) continue;
        if (columnOf[k] === L.column || columnOf[k] < 0) pool.push(k);
      }
      const members = membersOf(i);
      if (!members.length) continue;
      let lo = Math.min(...members.map(k => rxLo[k])), hi = Math.max(...members.map(k => rxHi[k]));
      let grew = true;
      while (grew && pool.length) {
        grew = false;
        for (const k of [...pool]) {
          if (Math.max(rxLo[k] - hi, lo - rxHi[k], 0) > gapLimit) continue;
          if (lineOf[k] >= 0) {
            const c = lineOf[k];
            const anchored = membersOf(c).filter(j => cy[j] >= lines[c].core_top && cy[j] <= lines[c].core_bottom);
            if (nearestGap(k, membersOf(i)) >= nearestGap(k, anchored)) continue;
          }
          lineOf[k] = i;
          lo = Math.min(lo, rxLo[k]); hi = Math.max(hi, rxHi[k]);
          pool.splice(pool.indexOf(k), 1);
          grew = true;
        }
      }
    }
  }
  // Order lines by column, then rotated center.
  const order = lines.map((_, i) => i).sort((p, q) => lines[p].column - lines[q].column || lines[p].center - lines[q].center || p - q);
  const remap = new Int32Array(lines.length);
  order.forEach((old, nw) => { remap[old] = nw; });
  lines = order.map((old, nw) => ({ ...lines[old], line_id: nw }));
  for (let k = 0; k < count; k++) if (lineOf[k] >= 0) lineOf[k] = remap[lineOf[k]];
  return { lines, lineOf, columns, columnOf };
}

// The whole page analysis (analysis.analyze, without its diagnostics): components, angle and lines, or
// {status: "too_little_text"}.
export function analyzePage(gray, W, H, cfg) {
  const comp = inkComponents(gray, W, H, cfg);
  const xs = [], ys = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const k = comp.labels[y * W + x]; if (k && comp.role[k] === ROLE.text) { xs.push(x); ys.push(y); } }
  if (xs.length < cfg.minimum_text_pixels_char2 * comp.charH * comp.charH) return { status: "too_little_text", charH: comp.charH };
  let sx = xs, sy = ys;
  if (xs.length > cfg.angle_sample_limit) {
    const step = Math.ceil(xs.length / cfg.angle_sample_limit);
    sx = xs.filter((_, i) => i % step === 0); sy = ys.filter((_, i) => i % step === 0);
  }
  const angle = estimateAngle(Float64Array.from(sx), Float64Array.from(sy), -cfg.angle_search_deg, cfg.angle_search_deg, cfg.angle_coarse_step_deg, cfg.angle_fine_step_deg);
  const seg = segmentLines(comp, angle, cfg);
  return { status: "ok", comp, seg, angle, charH: comp.charH };
}
