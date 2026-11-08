// The browser port of method 043's local step against the Python method: the page analysis, and the outlines and
// line pieces recomputed from each region's model box, compared with those saved in the page documents.
// Run from the repository root:  node --test webapp/test/local.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { analyzePage } from "../js/local/ink.js";
import { regionsFromBoxes } from "../js/local/regions.js";
import { LINES, OWNERSHIP } from "../js/local/config.js";

const ROOT = new URL("../..", import.meta.url).pathname;
const M43 = join(ROOT, "methods/043-gpt-6.1-terra-none-book-types-continuations-band-chained-lines");
const py = (...args) => execFileSync("uv", ["run", "--offline", "python", "webapp/test/py_reference.py", ...args], { cwd: ROOT, maxBuffer: 1 << 28, encoding: "utf8" });
const TMP = mkdtempSync(join(tmpdir(), "local-"));

// Pixels whose centers are inside any ring (even-odd per ring, union over rings).
function rasterize(rings, W, H) {
  const m = new Uint8Array(W * H);
  for (const ring of rings) {
    const n = ring.length;
    if (n < 3) { for (const [x, y] of ring) if (x >= 0 && y >= 0 && x < W && y < H) m[y * W + x] = 1; continue; }
    let ylo = Infinity, yhi = -Infinity;
    for (const [, y] of ring) { ylo = Math.min(ylo, y); yhi = Math.max(yhi, y); }
    for (let y = Math.max(0, Math.ceil(ylo)); y <= Math.min(H - 1, Math.floor(yhi)); y++) {
      const xs = [];
      for (let i = 0; i < n; i++) {
        const [ax, ay] = ring[i], [bx, by] = ring[(i + 1) % n];
        if ((ay <= y && by > y) || (by <= y && ay > y)) xs.push(ax + ((y - ay) * (bx - ax)) / (by - ay));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) for (let x = Math.max(0, Math.ceil(xs[k])); x <= Math.min(W - 1, Math.floor(xs[k + 1])); x++) m[y * W + x] = 1;
      for (const [x, yy] of ring) if (yy === y) m[y * W + x] = 1;
    }
  }
  return m;
}

const iou = (a, b) => { let i = 0, u = 0; for (let k = 0; k < a.length; k++) { if (a[k] && b[k]) i++; if (a[k] || b[k]) u++; } return u ? i / u : 1; };

test("the settings are method 043's", () => {
  assert.deepEqual(OWNERSHIP, JSON.parse(readFileSync(join(M43, "config.json"), "utf8")));
  assert.deepEqual(LINES, JSON.parse(readFileSync(join(M43, "line-config.json"), "utf8")));
});

const PAGES = [["kale-1913-book-002", "kale-1913-page-106"], ["kale-1913-book-002", "kale-1913-page-166"], ["kale-1913-book-002", "kale-1913-page-002"],
  ["telang-dli-book-001", "telang-dli-book-page-108"], ["telang-dli-book-001", "telang-dli-book-page-013"], ["telang-dli-book-001", "telang-dli-book-page-036"]];

for (const [book, pid] of PAGES) {
  const folder = join(ROOT, "outputs/books", book);
  test(`local step: ${pid}`, { skip: !existsSync(join(folder, "book.json")) }, () => {
    const doc = JSON.parse(readFileSync(join(folder, "pages", `${pid}.json`), "utf8"));
    const img = join(folder, "images", doc.page.image), W = doc.page.width, H = doc.page.height;
    const raw = join(TMP, `${pid}.gray`);
    py("gray", img, raw);
    const gray = new Uint8Array(readFileSync(raw));
    assert.equal(gray.length, W * H);
    const want = JSON.parse(py("analysis", img));
    const t0 = Date.now();
    const a = analyzePage(gray, W, H, LINES);
    const t1 = Date.now();
    assert.equal(a.status, want.status);
    assert.equal(a.comp.strongThreshold, want.thresholds.strong, "strong threshold");
    assert.equal(a.comp.count, want.components, "components");
    assert.equal(a.charH, want.char_h, "character height");
    assert.ok(Math.abs(a.angle - want.angle) < 1e-9, `angle ${a.angle} vs ${want.angle}`);
    assert.equal(a.seg.lines.length, want.lines.length, "lines");
    a.seg.lines.forEach((L, i) => { assert.equal(L.column, want.lines[i].column); assert.ok(Math.abs(L.center - want.lines[i].center) < 1e-6, `line ${i} center`); });
    const regions = doc.page.regions.filter(r => r.source?.model_box);
    const { geometry } = regionsFromBoxes(a, regions.map(r => r.source.model_box), OWNERSHIP);
    const t2 = Date.now();
    const rows = [];
    regions.forEach((r, k) => {
      const g = geometry[k];
      const ri = iou(rasterize(r.polygons, W, H), rasterize(g.rings, W, H));
      const mine = g.lines.map(L => L.line_id), theirs = (r.lines || []).filter(L => L.polygons).map(L => L.line);
      const li = g.lines.filter(L => theirs.includes(L.line_id)).map(L => iou(rasterize(r.lines.find(x => x.line === L.line_id).polygons, W, H), rasterize(L.rings, W, H)));
      rows.push({ region: r.id, iou: +ri.toFixed(4), lines_same: JSON.stringify(mine) === JSON.stringify(theirs), min_line_iou: li.length ? +Math.min(...li).toFixed(4) : null });
    });
    console.log(pid, `analysis ${t1 - t0} ms, regions ${t2 - t1} ms`, JSON.stringify(rows));
    for (const row of rows) {
      assert.ok(row.lines_same, `${pid} ${row.region}: the same line pieces`);
      assert.ok(row.iou >= 0.97, `${pid} ${row.region}: outline overlap ${row.iou}`);
    }
  });
}

test("recomputed outlines keep each line's text", { skip: !existsSync(join(ROOT, "outputs/books/kale-1913-book-002/book.json")) }, async () => {
  const ops = await import("../js/ops.js");
  const { makeValidator, checkPage } = await import("../js/schema.js");
  const folder = join(ROOT, "outputs/books/kale-1913-book-002"), pid = "kale-1913-page-106";
  const doc = JSON.parse(readFileSync(join(folder, "pages", `${pid}.json`), "utf8"));
  const tl = JSON.parse(readFileSync(join(folder, "types.json"), "utf8"));
  const validate = makeValidator(JSON.parse(readFileSync(join(ROOT, "webapp/schema.json"), "utf8")));
  const W = doc.page.width, H = doc.page.height;
  const raw = join(TMP, `${pid}.gray`);
  py("gray", join(folder, "images", doc.page.image), raw);
  const a = analyzePage(new Uint8Array(readFileSync(raw)), W, H, LINES);
  const texts = d => d.page.regions.map(r => (r.lines || []).filter(L => L.text).map(L => `${L.line}:${L.text}`).join("|"));
  // The same boxes give the same line pieces, with the same text.
  const same = ops.clone(doc);
  ops.applyGeometry(same, regionsFromBoxes(a, ops.boxesOf(same), OWNERSHIP).geometry);
  assert.deepEqual(texts(same), texts(doc));
  assert.deepEqual(checkPage(validate, same, tl)[0], []);
  // Shrinking the first commentary's box to its top half moves its lower lines out; their text stays as pieces
  // without an outline, and nothing is lost.
  const r = doc.page.regions.find(x => x.type === "commentary");
  const k = doc.page.regions.indexOf(r);
  const d2 = ops.clone(doc);
  const [x1, y1, x2, y2] = d2.page.regions[k].box;
  ops.setBox(d2, r.id, [x1, y1, x2, (y1 + y2) / 2]);
  ops.applyGeometry(d2, regionsFromBoxes(a, ops.boxesOf(d2), OWNERSHIP).geometry);
  const before = doc.page.regions.flatMap(x => (x.lines || []).map(L => L.text || "")).filter(Boolean).sort();
  const after = d2.page.regions.flatMap(x => (x.lines || []).map(L => L.text || "")).filter(Boolean).sort();
  assert.deepEqual(after, before, "no text lost");
  const moved = d2.page.regions[k].lines.filter(L => !L.polygons);
  assert.ok(moved.length > 0, "some pieces lost their outline");
  assert.deepEqual(checkPage(validate, d2, tl)[0], []);
  // Putting the box back gives the original line pieces again.
  ops.setBox(d2, r.id, [x1, y1, x2, y2]);
  ops.applyGeometry(d2, regionsFromBoxes(a, ops.boxesOf(d2), OWNERSHIP).geometry);
  assert.deepEqual(texts(d2), texts(doc));
});
