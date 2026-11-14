// The transcription call's images, drawn on a canvas as method 055's cutouts.py draws them with Pillow:
// - overview: the page with each region's outline in color and a tag with its id beside it;
// - cutout: one region cut out of the page, white outside its polygons, with a gray strip at the left numbering its
//   line pieces 1, 2, … at their heights;
// - context: the first or last line pieces of a neighboring page's region, cut out the same way, with no strip.
// Returned as PNG data URLs.

import { linePieces } from "./steps.js?v=20261113-moveon-2";

const PALETTE = [[220, 50, 47], [38, 139, 210], [133, 153, 0], [211, 54, 130], [42, 161, 152], [203, 75, 22], [108, 113, 196], [181, 137, 0], [0, 128, 64], [160, 80, 0]];
const rgb = c => `rgb(${c[0]},${c[1]},${c[2]})`;
const FONT = px => `${px}px Arial, Helvetica, sans-serif`;

export async function toDataUrl(canvas) {
  const blob = await canvas.convertToBlob({ type: "image/png" });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return "data:image/png;base64," + btoa(s);
}

// The page region [X1, Y1, X2, Y2) with everything outside the rings white (rings in page pixel centers).
function maskedCrop(bitmap, rings, X1, Y1, X2, Y2) {
  const w = X2 - X1, h = Y2 - Y1;
  const crop = new OffscreenCanvas(w, h), c = crop.getContext("2d");
  c.drawImage(bitmap, X1, Y1, w, h, 0, 0, w, h);
  const path = new Path2D();
  for (const ring of rings) {
    ring.forEach(([x, y], i) => (i ? path.lineTo(x - X1 + 0.5, y - Y1 + 0.5) : path.moveTo(x - X1 + 0.5, y - Y1 + 0.5)));
    path.closePath();
  }
  // Pixels inside or on the rings, as Pillow's polygon with an outline.
  const mask = new OffscreenCanvas(w, h), m = mask.getContext("2d");
  m.fillStyle = m.strokeStyle = "#000";
  m.lineWidth = 1.5;
  m.fill(path);
  m.stroke(path);
  c.globalCompositeOperation = "destination-in";
  c.drawImage(mask, 0, 0);
  const out = new OffscreenCanvas(w, h), o = out.getContext("2d");
  o.fillStyle = "#fff";
  o.fillRect(0, 0, w, h);
  o.drawImage(crop, 0, 0);
  return out;
}

export async function cutout(bitmap, region, charH, cfg) {
  const [x1, y1, x2, y2] = region.bounds;
  const pad = Math.round(cfg.cutout_padding_char * charH);
  const X1 = Math.max(0, x1 - pad), Y1 = Math.max(0, y1 - pad), X2 = Math.min(bitmap.width, x2 + pad), Y2 = Math.min(bitmap.height, y2 + pad);
  const crop = maskedCrop(bitmap, region.polygons, X1, Y1, X2, Y2);
  const gutter = Math.max(cfg.gutter_min_px, Math.round(cfg.gutter_width_char * charH));
  const out = new OffscreenCanvas(gutter + crop.width, crop.height), d = out.getContext("2d");
  d.fillStyle = "#fff"; d.fillRect(0, 0, out.width, out.height);
  d.drawImage(crop, gutter, 0);
  d.fillStyle = "rgb(222,222,222)"; d.fillRect(0, 0, gutter - 3, out.height);
  d.fillStyle = "rgb(40,40,40)";
  d.font = FONT(Math.max(cfg.gutter_font_min_px, Math.round(cfg.gutter_font_char * charH)));
  d.textAlign = "center"; d.textBaseline = "middle";
  linePieces(region).forEach(([, top, bottom], n) => d.fillText(String(n + 1), (gutter - 4) / 2, (top + bottom) / 2 - Y1));
  return toDataUrl(out);
}

export async function overview(bitmap, regions, charH, cfg) {
  const W = bitmap.width, H = bitmap.height;
  const canvas = new OffscreenCanvas(W, H), d = canvas.getContext("2d");
  d.drawImage(bitmap, 0, 0);
  d.lineWidth = cfg.overview_outline_px;
  regions.forEach(([, r], i) => {
    d.strokeStyle = rgb(PALETTE[i % PALETTE.length]);
    for (const ring of r.polygons) {
      d.beginPath();
      ring.forEach(([x, y], k) => (k ? d.lineTo(x + 0.5, y + 0.5) : d.moveTo(x + 0.5, y + 0.5)));
      d.closePath();
      d.stroke();
    }
  });
  const px = Math.max(cfg.overview_label_min_px, Math.round(cfg.overview_label_char * charH));
  d.font = FONT(px);
  const boxes = regions.map(([, r]) => r.bounds), placed = [];
  regions.forEach(([rid, r], i) => {
    const color = rgb(PALETTE[i % PALETTE.length]);
    const [x1, y1, x2] = r.bounds;
    const w = Math.ceil(d.measureText(rid).width) + 8, h = px + 6;
    const cands = [[x1 - w - 4, y1], [x2 + 4, y1], [x1, y1 - h - 2], [x1, y1]];
    const free = ([x, y]) => {
      if (x < 0 || y < 0 || x + w > W || y + h > H) return false;
      const others = [...boxes.filter((_, j) => j !== i), ...placed];
      return !others.some(b => x < b[2] && b[0] < x + w && y < b[3] && b[1] < y + h);
    };
    const [x, y] = cands.find(free) || cands[cands.length - 1];
    placed.push([x, y, x + w, y + h]);
    d.fillStyle = "#fff"; d.fillRect(x, y, w, h);
    d.strokeStyle = color; d.lineWidth = 2; d.strokeRect(x, y, w, h);
    d.fillStyle = color; d.textBaseline = "top"; d.textAlign = "left";
    d.fillText(rid, x + 4, y + 3);
  });
  return toDataUrl(canvas);
}

export async function context(bitmap, region, charH, cfg, which, n) {
  let pieces = linePieces(region);
  pieces = which === "first" ? pieces.slice(0, n) : pieces.slice(-n);
  if (!pieces.length) return null;
  const ids = new Set(pieces.map(p => p[0]));
  const polys = region.lines.filter(L => ids.has(L.line_id)).flatMap(L => L.polygons);
  const xs = polys.flat().map(p => p[0]), ys = polys.flat().map(p => p[1]);
  const pad = Math.round(cfg.cutout_padding_char * charH);
  const X1 = Math.max(0, Math.min(...xs) - pad), Y1 = Math.max(0, Math.min(...ys) - pad);
  const X2 = Math.min(bitmap.width, Math.max(...xs) + pad + 1), Y2 = Math.min(bitmap.height, Math.max(...ys) + pad + 1);
  const out = maskedCrop(bitmap, polys, X1, Y1, X2, Y2), d = out.getContext("2d");
  d.strokeStyle = "rgb(150,150,150)"; d.lineWidth = 2;
  d.strokeRect(1, 1, out.width - 2, out.height - 2);
  return toDataUrl(out);
}
