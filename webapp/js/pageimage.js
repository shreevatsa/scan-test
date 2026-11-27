// The page image with its regions' and line pieces' outlines. Click a region to select it (shift-click adds it to the
// selection); a selected region shows its editable box with handles (drag a corner or an edge to resize, the middle to
// move). Drag across the scan to select every region in a box. In drawing mode, drag a rectangle to add a region.
// Over the scan: a "!" beside each region (or line) a check is about (setChecks), and on the region under the pointer
// or selected an × that leaves it out of the book; an area left out stays on the scan, grey, with a ↺ that brings it
// back.

import { bbox, pathD } from "./render.js?v=20261127-check-in-card";

// Figures use the full image crop in Read and HTML export. Text outlines describe detected ink.
export function regionPath(region, regionClass) {
  if (regionClass === "figure") {
    const [x1, y1, x2, y2] = region.box || region.model_box || bbox(region.polygons);
    return `M${x1},${y1} H${x2} V${y2} H${x1} Z`;
  }
  return pathD(region.polygons);
}

let viewSequence = 0;
const SVGNS = "http://www.w3.org/2000/svg";
const svgEl = (tag, attrs = {}) => {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) el.setAttribute(k, v);
  return el;
};

export class PageView {
  constructor(el, { onSelectRegion, onSelectOmitted, onSelectIgnored, onSelectMany, onBox, onDraw, onHoverLine, onHoverRegion, onLeaveOut, onRestore, onCheck,
    editable = true, typeLabel = null, hatchFurniture = false }) {
    this.el = el;
    this.cb = { onSelectRegion, onSelectOmitted, onSelectIgnored, onSelectMany, onBox, onDraw, onHoverLine, onHoverRegion, onLeaveOut, onRestore, onCheck };
    this.checks = [];
    this.many = { regions: [], omitted: [] };
    this.zoom = 1;
    this.fit = "width";        // "width", "height" (kept as the pane or the page changes), or null after zooming
    this.drawing = false;
    this.editable = editable;
    this.typeLabel = typeLabel;
    this.hatchFurniture = hatchFurniture;
    this.id = ++viewSequence;
    el.innerHTML = "";
    this.wrap = document.createElement("div");
    this.wrap.className = "pv-wrap";
    this.img = document.createElement("img");
    this.img.alt = "page image";
    this.img.draggable = false;
    this.svg = svgEl("svg", { preserveAspectRatio: "none" });
    // The "!" of the checks and the one ×/↺ button, over the scan; placed in percentages of the page, so they follow the zoom.
    this.marks = document.createElement("div");
    this.marks.className = "pv-marks";
    this.tool = document.createElement("button");
    this.tool.className = "pv-tool";
    this.tool.hidden = true;
    this.tool.addEventListener("pointerenter", () => clearTimeout(this.toolTimer));
    this.tool.addEventListener("pointerleave", () => this.hideTool());
    this.tool.addEventListener("pointerdown", event => event.stopPropagation());
    this.tool.addEventListener("click", event => {
      event.stopPropagation();
      const target = this.toolTarget;
      this.tool.hidden = true;
      this.tooltip.hidden = true;
      if (target?.restore !== undefined) this.cb.onRestore?.(target.restore);
      else if (target) this.cb.onLeaveOut?.(target.region ? { regions: [target.region] } : { omitted: [target.omitted] });
    });
    this.wrap.append(this.img, this.svg, this.marks);
    this.tooltip = document.createElement("div");
    this.tooltip.className = "pv-tooltip";
    this.tooltip.setAttribute("role", "tooltip");
    this.tooltip.hidden = true;
    el.append(this.wrap, this.tooltip);
    el.addEventListener("pointerdown", event => {
      this.clearOnClick = !this.drawing && !event.target.closest("[data-rid], [data-omitted], .pv-box");
    });
    el.addEventListener("click", () => {
      if (this.clearOnClick) this.cb.onSelectRegion(null);
      this.clearOnClick = false;
    });
    // The click that ends a drag across the scan (a box selection) selects nothing more.
    el.addEventListener("click", event => { if (this.dragged) { event.stopPropagation(); this.dragged = false; } }, true);
    el.addEventListener("wheel", e => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      this.setZoom(this.zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15), e);
    }, { passive: false });
    this.svg.addEventListener("pointerdown", e => this.pointerDown(e));
    this.resizeObserver = new ResizeObserver(() => { if (this.fit === "height") this.fitHeight(); });
    this.resizeObserver.observe(el);
  }

  destroy() { clearTimeout(this.toolTimer); this.resizeObserver.disconnect(); }

  // The whole page's width in the pane (zoom 1: the image is as wide as the pane).
  fitWidth() {
    this.setZoom(1, null, true);
    this.fit = "width";
  }

  // The whole page's height in the pane: the zoom at which the image is as tall as the pane's visible height.
  fitHeight() {
    this.fit = "height";
    const { width: W, height: H } = this.doc?.page || {};
    const cw = this.el.clientWidth, ch = this.el.clientHeight;
    if (!W || !H || !cw || !ch) return;
    this.setZoom((ch - 2) * W / (cw * H), null, true);
    this.el.scrollTop = 0;
  }

  setZoom(z, around, keepFit = false) {
    if (!keepFit) this.fit = null;
    const old = this.zoom;
    this.zoom = Math.max(0.3, Math.min(6, z));
    const el = this.el, r = el.getBoundingClientRect();
    const fx = around ? (around.clientX - r.left + el.scrollLeft) / (this.wrap.offsetWidth || 1) : 0.5;
    const fy = around ? (around.clientY - r.top + el.scrollTop) / (this.wrap.offsetHeight || 1) : 0;
    this.wrap.style.width = `${this.zoom * 100}%`;
    if (around) {
      el.scrollLeft = fx * this.wrap.offsetWidth - (around.clientX - r.left);
      el.scrollTop = fy * this.wrap.offsetHeight - (around.clientY - r.top);
    }
    return old;
  }

  show(doc, imageUrl, colors, furniture, types) {
    this.tooltip.hidden = true;
    this.doc = doc;
    this.colors = colors;
    this.furniture = furniture;
    this.types = types;
    if (imageUrl && this.img.getAttribute("src") !== imageUrl) this.img.src = imageUrl;
    if (!imageUrl) this.img.removeAttribute("src");
    const { width: W, height: H } = doc.page;
    this.svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    this.wrap.style.aspectRatio = `${W} / ${H}`;
    if (this.fit === "height") this.fitHeight();
    this.redraw();
  }

  redraw() {
    const svg = this.svg, doc = this.doc;
    svg.replaceChildren();
    const omittedHatch = `pv-omitted-hatch-${this.id}`, ignoredHatch = `pv-ignored-hatch-${this.id}`;
    svg.append(hatchPattern(omittedHatch), hatchPattern(ignoredHatch, "#8d8d93"));
    this.regionEls = {};
    this.areaEls = {};
    for (const r of doc.page.regions) {
      const col = this.colors[r.type] || "#888";
      const g = svgEl("g", { "data-rid": r.id });
      const label = this.typeLabel ? this.typeLabel(r.type) : `${r.id} · ${r.type}`;
      const title = svgEl("title"); title.textContent = label; g.append(title);
      const p = svgEl("path", { d: regionPath(r, this.types?.types[r.type]?.region), class: "pv-reg" + (this.furniture.has(r.type) ? " furn" : ""), stroke: col, fill: this.hatchFurniture && this.furniture.has(r.type) ? `url(#${ignoredHatch})` : col });
      g.append(p);
      // The region's whole box, drawn only while the region is hovered, selected or highlighted: the filled outline above
      // follows the ink that was found, which can be only part of what the finder boxed.
      const wide = r.box || r.model_box;
      if (wide) g.append(svgEl("rect", { x: wide[0], y: wide[1], width: wide[2] - wide[0], height: wide[3] - wide[1], class: "pv-regbox", stroke: col }));
      (r.lines || []).forEach((L, i) => {
        if (L.polygons) g.append(svgEl("path", { d: pathD(L.polygons), class: "pv-ln", "data-line": `${r.id}:${i}` }));
      });
      g.addEventListener("click", e => { if (!this.drawing) { e.stopPropagation(); this.cb.onSelectRegion(r.id, { add: e.shiftKey || e.metaKey || e.ctrlKey }); } });
      g.addEventListener("pointerenter", event => {
        this.cb.onHoverRegion?.(r.id, true);
        this.tooltip.textContent = label;
        this.tooltip.hidden = false;
        this.positionTooltip(event);
        this.showTool({ region: r.id }, r.box || boundsOf(r.polygons));
      });
      g.addEventListener("pointermove", event => this.positionTooltip(event));
      g.addEventListener("pointerleave", () => { this.cb.onHoverRegion?.(r.id, false); this.tooltip.hidden = true; this.hideTool(); });
      g.addEventListener("mouseover", e => { const k = e.target.dataset?.line; if (k) this.cb.onHoverLine(k, true); });
      g.addEventListener("mouseout", e => { const k = e.target.dataset?.line; if (k) this.cb.onHoverLine(k, false); });
      svg.append(g);
      this.regionEls[r.id] = g;
    }
    for (const [index, omitted] of (doc.source?.omitted_regions || []).entries()) if (omitted.box) {
      const [x1, y1, x2, y2] = omitted.box;
      const rect = svgEl("rect", { x: x1, y: y1, width: x2 - x1, height: y2 - y1, class: "pv-omitted", fill: `url(#${omittedHatch})`, "data-omitted": index });
      const title = svgEl("title"); title.textContent = omitted.label ?? (this.typeLabel ? "Area without a type" : `${omitted.region} needs a type${omitted.proposed_type ? ` (proposed: ${omitted.proposed_type})` : ""}`); rect.append(title);
      rect.addEventListener("click", event => { event.stopPropagation(); this.cb.onSelectOmitted?.(index, { add: event.shiftKey || event.metaKey || event.ctrlKey }); });
      if (omitted.region) this.areaEls[omitted.region] = rect;
      rect.addEventListener("pointerenter", () => {
        this.cb.onHoverRegion?.(omitted.region, true);
        this.showTool({ omitted: index }, omitted.box);
      });
      rect.addEventListener("pointerleave", () => { this.cb.onHoverRegion?.(omitted.region, false); this.hideTool(); });
      if (this.many.omitted.includes(index)) rect.classList.add("sel");
      svg.append(rect);
    }
    // The areas left out of the book: grey, under a ↺ that brings each back.
    for (const [index, area] of (doc.source?.ignored_regions || []).entries()) if (area.box && this.editable) {
      const [x1, y1, x2, y2] = area.box;
      const rect = svgEl("rect", { x: x1, y: y1, width: x2 - x1, height: y2 - y1, class: "pv-ignored", fill: `url(#${ignoredHatch})` });
      const title = svgEl("title"); title.textContent = "Left out of the book"; rect.append(title);
      if (area.region) this.areaEls[area.region] = rect;
      if (this.cb.onSelectIgnored) rect.addEventListener("click", event => {
        event.stopPropagation();
        this.cb.onSelectIgnored(index, { add: event.shiftKey || event.metaKey || event.ctrlKey });
      });
      rect.addEventListener("pointerenter", () => {
        if (area.region) this.cb.onHoverRegion?.(area.region, true);
        this.showTool({ restore: index }, area.box);
      });
      rect.addEventListener("pointerleave", () => { if (area.region) this.cb.onHoverRegion?.(area.region, false); this.hideTool(); });
      svg.insertBefore(rect, svg.querySelector("g[data-rid]"));
    }
    this.boxLayer = svgEl("g", { class: "pv-box" });
    svg.append(this.boxLayer);
    this.lineLayer = svgEl("g", { class: "pv-linebox-layer" });
    svg.append(this.lineLayer);
    this.drawLineBox();
    this.select(this.selected, this.many, this.selectedOmitted);
    this.drawChecks();
  }

  // The checks to mark on the scan: [{ key, box, count, title }]. A click on one's "!" calls onCheck(key, element).
  setChecks(checks) {
    this.checks = checks;
    this.drawChecks();
  }

  drawChecks() {
    if (!this.doc) return;
    const { width: W, height: H } = this.doc.page;
    this.marks.replaceChildren(this.tool, ...this.checks.filter(check => check.box).map(check => {
      const [x1, y1] = check.box;
      const badge = document.createElement("button");
      badge.className = "pv-badge" + (x1 / W < 0.04 ? " inside" : "");
      badge.textContent = "!";
      badge.title = check.title;
      badge.setAttribute("aria-label", `Check: ${check.title}`);
      badge.style.left = `${100 * x1 / W}%`;
      badge.style.top = `${100 * y1 / H}%`;
      badge.dataset.key = check.key;
      badge.addEventListener("pointerdown", event => event.stopPropagation());
      badge.addEventListener("click", event => { event.stopPropagation(); this.cb.onCheck?.(check.key, badge); });
      return badge;
    }));
  }

  // The × (leave out) or ↺ (bring back) button at the top right of the region, area or left-out area under the pointer;
  // after the pointer leaves, the selected region's ×, if one is selected.
  showTool(target, box) {
    clearTimeout(this.toolTimer);
    if (!this.editable || this.drawing || !box || !this.cb.onLeaveOut) return;
    const { width: W, height: H } = this.doc.page, restore = target.restore !== undefined;
    this.toolTarget = target;
    this.tool.textContent = restore ? "↺" : "×";
    this.tool.title = restore ? "Bring this back into the book" : "Leave this out of the book (Delete)";
    this.tool.setAttribute("aria-label", this.tool.title);
    this.tool.classList.toggle("restore", restore);
    this.tool.classList.toggle("inside", box[2] / W > 0.95);
    this.tool.style.left = `${100 * box[2] / W}%`;
    this.tool.style.top = `${100 * box[1] / H}%`;
    this.tool.hidden = false;
  }

  hideTool() {
    clearTimeout(this.toolTimer);
    this.toolTimer = setTimeout(() => {
      const r = this.selected && !this.many.regions.length && this.doc.page.regions.find(x => x.id === this.selected);
      if (r) this.showTool({ region: r.id }, r.box || boundsOf(r.polygons));
      else this.tool.hidden = true;
    }, 350);
  }

  // A printed line outside all regions: a dashed outline of its box, while hovered (`hover`) or kept after a click
  // (`pinned`). Passing null for `hover` falls back to the kept one.
  markLine({ hover, pinned } = {}) {
    if (hover !== undefined) this.hoverBox = hover;
    if (pinned !== undefined) this.pinnedBox = pinned;
    this.drawLineBox();
  }

  drawLineBox() {
    if (!this.lineLayer) return;
    this.lineLayer.replaceChildren();
    const box = this.hoverBox || this.pinnedBox;
    if (!box) return;
    this.lineLayer.append(svgEl("rect", { x: box[0] - 4, y: box[1] - 4, width: box[2] - box[0] + 8, height: box[3] - box[1] + 8, class: "pv-linebox" }));
  }

  revealBox(box) {
    const scale = this.wrap.offsetHeight / this.doc.page.height, top = box[1] * scale - 40;
    if (top < this.el.scrollTop || top > this.el.scrollTop + this.el.clientHeight - 80) this.el.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  }

  // Select one region (its box with handles), or several (`many`: { regions, omitted }, outlined, no handles).
  select(rid, many = null, omitted = null) {
    this.selected = rid;
    this.selectedOmitted = omitted;
    this.many = { regions: many?.regions || [], omitted: many?.omitted || [] };
    for (const [id, g] of Object.entries(this.regionEls || {})) g.classList.toggle("sel", id === rid || this.many.regions.includes(id));
    this.svg.querySelectorAll(".pv-omitted").forEach(rect => rect.classList.toggle("sel", this.many.omitted.includes(Number(rect.dataset.omitted))));
    this.boxLayer.replaceChildren();
    const area = this.doc.source?.omitted_regions?.[omitted];
    const r = (rid && this.doc.page.regions.find(x => x.id === rid)) || area;
    if (!r || !this.editable) { if (this.toolTarget?.region) this.tool.hidden = true; return; }
    const box = r.box || boundsOf(r.polygons);
    if (!this.many.regions.length) this.showTool(area ? { omitted } : { region: r.id }, box);
    this.drawBox(box);
  }

  drawBox([x1, y1, x2, y2]) {
    const layer = this.boxLayer;
    layer.replaceChildren();
    const s = Math.max(6, (this.doc.page.width / (this.el.clientWidth || 800)) * 7 / this.zoom);
    layer.append(svgEl("rect", { x: x1, y: y1, width: x2 - x1, height: y2 - y1, class: "pv-boxrect" }));
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    const handles = { nw: [x1, y1], n: [mx, y1], ne: [x2, y1], e: [x2, my], se: [x2, y2], s: [mx, y2], sw: [x1, y2], w: [x1, my], move: [mx, my] };
    for (const [k, [x, y]] of Object.entries(handles)) {
      layer.append(svgEl(k === "move" ? "circle" : "rect", k === "move"
        ? { cx: x, cy: y, r: s, class: "pv-handle move", "data-h": k }
        : { x: x - s, y: y - s, width: 2 * s, height: 2 * s, class: `pv-handle ${k}`, "data-h": k }));
    }
  }

  toPage(e) {
    const pt = this.svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const p = pt.matrixTransform(this.svg.getScreenCTM().inverse());
    return [Math.max(0, Math.min(this.doc.page.width, p.x)), Math.max(0, Math.min(this.doc.page.height, p.y))];
  }

  pointerDown(e) {
    this.clearOnClick = false;
    if (!this.editable) return;
    const handle = e.target.dataset?.h;
    if (this.drawing) return this.startDraw(e);
    if (!handle) return this.startSelect(e);
    e.preventDefault();
    e.stopPropagation();
    const area = this.doc.source?.omitted_regions?.[this.selectedOmitted];
    const r = area ?? this.doc.page.regions.find(x => x.id === this.selected);
    if (!r) return;
    const start = this.toPage(e), box0 = [...(r.box || boundsOf(r.polygons))];
    let box = box0;
    const move = ev => {
      const [x, y] = this.toPage(ev), dx = x - start[0], dy = y - start[1];
      let [x1, y1, x2, y2] = box0;
      if (handle === "move") {
        const sx = Math.max(-x1, Math.min(this.doc.page.width - x2, dx));
        const sy = Math.max(-y1, Math.min(this.doc.page.height - y2, dy));
        x1 += sx; x2 += sx; y1 += sy; y2 += sy;
      } else {
        if (handle.includes("w")) x1 += dx;
        if (handle.includes("e")) x2 += dx;
        if (handle.includes("n")) y1 += dy;
        if (handle.includes("s")) y2 += dy;
      }
      box = [x1, y1, x2, y2];
      this.drawBox([Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2)]);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (box !== box0) this.cb.onBox(area?.region ?? this.selected, box);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  // A drag across the scan (from anywhere but a handle) selects the regions and areas mostly inside the box it makes;
  // a press that hardly moves is a click.
  startSelect(e) {
    if (e.button !== 0) return;
    const start = this.toPage(e), x0 = e.clientX, y0 = e.clientY;
    let rect = null, end = start;
    const move = ev => {
      if (!rect && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return;
      if (!rect) { rect = svgEl("rect", { class: "pv-marquee" }); this.svg.append(rect); this.tooltip.hidden = true; this.tool.hidden = true; }
      end = this.toPage(ev);
      rect.setAttribute("x", Math.min(start[0], end[0])); rect.setAttribute("y", Math.min(start[1], end[1]));
      rect.setAttribute("width", Math.abs(end[0] - start[0])); rect.setAttribute("height", Math.abs(end[1] - start[1]));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (!rect) return;
      rect.remove();
      this.dragged = true;
      setTimeout(() => { this.dragged = false; }, 0);
      const box = [Math.min(start[0], end[0]), Math.min(start[1], end[1]), Math.max(start[0], end[0]), Math.max(start[1], end[1])];
      const inside = b => b && shareInside(b, box) >= 0.5;
      const regions = this.doc.page.regions.filter(r => inside(r.box || boundsOf(r.polygons))).map(r => r.id);
      const omitted = (this.doc.source?.omitted_regions || []).map((area, index) => inside(area.box) ? index : null).filter(index => index !== null);
      this.cb.onSelectMany?.({ regions, omitted });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  setDrawing(on) {
    if (!this.editable) return;
    this.drawing = on;
    this.el.classList.toggle("drawing", on);
  }

  startDraw(e) {
    e.preventDefault();
    const start = this.toPage(e);
    const rect = svgEl("rect", { class: "pv-draw", x: start[0], y: start[1], width: 0, height: 0 });
    this.svg.append(rect);
    let end = start;
    const move = ev => {
      end = this.toPage(ev);
      rect.setAttribute("x", Math.min(start[0], end[0])); rect.setAttribute("y", Math.min(start[1], end[1]));
      rect.setAttribute("width", Math.abs(end[0] - start[0])); rect.setAttribute("height", Math.abs(end[1] - start[1]));
    };
    const up = ev => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      rect.remove();
      const box = [Math.min(start[0], end[0]), Math.min(start[1], end[1]), Math.max(start[0], end[0]), Math.max(start[1], end[1])];
      if (box[2] - box[0] > 4 && box[3] - box[1] > 4) this.cb.onDraw(box, ev);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  highlightLine(key, on) {
    this.svg.querySelectorAll(`[data-line="${CSS.escape(key)}"]`).forEach(p => p.classList.toggle("hl", on));
  }

  highlightRegion(rid, on) {
    const g = this.regionEls?.[rid] ?? this.areaEls?.[rid];
    if (g) g.classList.toggle("hl", on);
  }

  positionTooltip(event) {
    const bounds = this.el.getBoundingClientRect();
    this.tooltip.style.left = `${this.el.scrollLeft + Math.max(4, Math.min(event.clientX - bounds.left + 12, this.el.clientWidth - this.tooltip.offsetWidth - 8))}px`;
    this.tooltip.style.top = `${this.el.scrollTop + Math.max(4, Math.min(event.clientY - bounds.top + 12, this.el.clientHeight - this.tooltip.offsetHeight - 8))}px`;
  }

  // Scroll so that a region is in view.
  reveal(rid) {
    const r = this.doc.page.regions.find(x => x.id === rid);
    if (!r) return;
    const [, y1] = r.box || boundsOf(r.polygons);
    const scale = this.wrap.offsetHeight / this.doc.page.height;
    const top = y1 * scale - 40;
    if (top < this.el.scrollTop || top > this.el.scrollTop + this.el.clientHeight - 80) this.el.scrollTo({ top, behavior: "smooth" });
  }
}

// The share of box `a` inside box `b`.
function shareInside(a, b) {
  const w = Math.min(a[2], b[2]) - Math.max(a[0], b[0]), h = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
  const area = (a[2] - a[0]) * (a[3] - a[1]);
  return w > 0 && h > 0 && area > 0 ? w * h / area : 0;
}

function hatchPattern(id, color = "#b77916") {
  const defs = svgEl("defs"), pattern = svgEl("pattern", { id, width: 10, height: 10, patternUnits: "userSpaceOnUse" });
  pattern.append(svgEl("path", { d: "M-2,2 L2,-2 M0,10 L10,0 M8,12 L12,8", stroke: color, "stroke-width": 1 }));
  defs.append(pattern);
  return defs;
}

export function regionBoxes(doc, colors) {
  const svg = svgEl("svg", { class: "stage-boxes", viewBox: `0 0 ${doc.page.width} ${doc.page.height}`, "aria-hidden": "true" });
  const id = `omitted-${doc.page.id.replace(/[^\w-]/g, "_")}`;
  svg.append(hatchPattern(id));
  const draw = (box, color, omitted = false) => {
    if (!box) return;
    const [x1, y1, x2, y2] = box;
    svg.append(svgEl("rect", { x: x1, y: y1, width: x2 - x1, height: y2 - y1,
      stroke: color, fill: omitted ? `url(#${id})` : "none", "stroke-width": 1, "vector-effect": "non-scaling-stroke" }));
  };
  for (const region of doc.page.regions) draw(region.box || boundsOf(region.polygons), colors[region.type] || "#888");
  for (const omitted of doc.source?.omitted_regions || []) draw(omitted.box, "#b77916", true);
  return svg;
}

export function boundsOf(rings) {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const r of rings) for (const [x, y] of r) { x1 = Math.min(x1, x); y1 = Math.min(y1, y); x2 = Math.max(x2, x); y2 = Math.max(y2, y); }
  return [x1, y1, x2 + 1, y2 + 1];
}
