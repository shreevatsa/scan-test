// The page image with its regions' and line pieces' outlines. Click a region to select it; a selected region shows
// its editable box with handles (drag a corner or an edge to resize, the middle to move). In drawing mode, drag a
// rectangle to add a region.

import { bbox, pathD } from "./render.js";

// Figures use the full image crop in Read and HTML export. Text outlines describe detected ink.
export function regionPath(region, regionClass) {
  if (regionClass === "figure") {
    const [x1, y1, x2, y2] = region.box || region.model_box || bbox(region.polygons);
    return `M${x1},${y1} H${x2} V${y2} H${x1} Z`;
  }
  return pathD(region.polygons);
}

const SVGNS = "http://www.w3.org/2000/svg";
const svgEl = (tag, attrs = {}) => {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) el.setAttribute(k, v);
  return el;
};

export class PageView {
  constructor(el, { onSelectRegion, onSelectOmitted, onBox, onDraw, onHoverLine, onHoverRegion, editable = true }) {
    this.el = el;
    this.cb = { onSelectRegion, onSelectOmitted, onBox, onDraw, onHoverLine, onHoverRegion };
    this.zoom = 1;
    this.fit = "width";        // "width", "height" (kept as the pane or the page changes), or null after zooming
    this.drawing = false;
    this.editable = editable;
    el.innerHTML = "";
    this.wrap = document.createElement("div");
    this.wrap.className = "pv-wrap";
    this.img = document.createElement("img");
    this.img.alt = "page image";
    this.img.draggable = false;
    this.svg = svgEl("svg", { preserveAspectRatio: "none" });
    this.wrap.append(this.img, this.svg);
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
    el.addEventListener("wheel", e => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      this.setZoom(this.zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15), e);
    }, { passive: false });
    this.svg.addEventListener("pointerdown", e => this.pointerDown(e));
    this.resizeObserver = new ResizeObserver(() => { if (this.fit === "height") this.fitHeight(); });
    this.resizeObserver.observe(el);
  }

  destroy() { this.resizeObserver.disconnect(); }

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
    if (this.img.getAttribute("src") !== imageUrl) this.img.src = imageUrl;
    const { width: W, height: H } = doc.page;
    this.svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    this.wrap.style.aspectRatio = `${W} / ${H}`;
    if (this.fit === "height") this.fitHeight();
    this.redraw();
  }

  redraw() {
    const svg = this.svg, doc = this.doc;
    svg.replaceChildren();
    svg.append(hatchPattern("pv-omitted-hatch"));
    this.regionEls = {};
    for (const r of doc.page.regions) {
      const col = this.colors[r.type] || "#888";
      const g = svgEl("g", { "data-rid": r.id });
      const title = svgEl("title"); title.textContent = `${r.id} · ${r.type}`; g.append(title);
      const p = svgEl("path", { d: regionPath(r, this.types?.types[r.type]?.region), class: "pv-reg" + (this.furniture.has(r.type) ? " furn" : ""), stroke: col, fill: col });
      g.append(p);
      // The region's whole box, drawn only while the region is hovered, selected or highlighted: the filled outline above
      // follows the ink that was found, which can be only part of what the finder boxed.
      const wide = r.box || r.model_box;
      if (wide) g.append(svgEl("rect", { x: wide[0], y: wide[1], width: wide[2] - wide[0], height: wide[3] - wide[1], class: "pv-regbox", stroke: col }));
      (r.lines || []).forEach((L, i) => {
        if (L.polygons) g.append(svgEl("path", { d: pathD(L.polygons), class: "pv-ln", "data-line": `${r.id}:${i}` }));
      });
      g.addEventListener("click", e => { if (!this.drawing) { e.stopPropagation(); this.cb.onSelectRegion(r.id); } });
      g.addEventListener("pointerenter", event => {
        this.cb.onHoverRegion?.(r.id, true);
        this.tooltip.textContent = `${r.id} · ${r.type}`;
        this.tooltip.hidden = false;
        this.positionTooltip(event);
      });
      g.addEventListener("pointermove", event => this.positionTooltip(event));
      g.addEventListener("pointerleave", () => { this.cb.onHoverRegion?.(r.id, false); this.tooltip.hidden = true; });
      g.addEventListener("mouseover", e => { const k = e.target.dataset?.line; if (k) this.cb.onHoverLine(k, true); });
      g.addEventListener("mouseout", e => { const k = e.target.dataset?.line; if (k) this.cb.onHoverLine(k, false); });
      svg.append(g);
      this.regionEls[r.id] = g;
    }
    for (const [index, omitted] of (doc.source?.omitted_regions || []).entries()) if (omitted.box) {
      const [x1, y1, x2, y2] = omitted.box;
      const rect = svgEl("rect", { x: x1, y: y1, width: x2 - x1, height: y2 - y1, class: "pv-omitted", fill: "url(#pv-omitted-hatch)", "data-omitted": index });
      const title = svgEl("title"); title.textContent = `${omitted.region} needs a type${omitted.proposed_type ? ` (proposed: ${omitted.proposed_type})` : ""}`; rect.append(title);
      rect.addEventListener("click", event => { event.stopPropagation(); this.cb.onSelectOmitted?.(index); });
      svg.append(rect);
    }
    this.boxLayer = svgEl("g", { class: "pv-box" });
    svg.append(this.boxLayer);
    this.lineLayer = svgEl("g", { class: "pv-linebox-layer" });
    svg.append(this.lineLayer);
    this.drawLineBox();
    this.select(this.selected);
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

  select(rid) {
    this.selected = rid;
    for (const [id, g] of Object.entries(this.regionEls || {})) g.classList.toggle("sel", id === rid);
    this.boxLayer.replaceChildren();
    const r = rid && this.doc.page.regions.find(x => x.id === rid);
    if (!r || !this.editable) return;
    const box = r.box || boundsOf(r.polygons);
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
    if (!handle) return;
    e.preventDefault();
    e.stopPropagation();
    const r = this.doc.page.regions.find(x => x.id === this.selected);
    const start = this.toPage(e), box0 = [...(r.box || boundsOf(r.polygons))];
    let box = box0;
    const move = ev => {
      const [x, y] = this.toPage(ev), dx = x - start[0], dy = y - start[1];
      let [x1, y1, x2, y2] = box0;
      if (handle === "move") { x1 += dx; x2 += dx; y1 += dy; y2 += dy; }
      if (handle.includes("w")) x1 += dx;
      if (handle.includes("e")) x2 += dx;
      if (handle.includes("n") && handle !== "move") y1 += dy;
      if (handle.includes("s")) y2 += dy;
      box = [x1, y1, x2, y2];
      this.drawBox([Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2)]);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (box !== box0) this.cb.onBox(this.selected, box);
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
    const g = this.regionEls?.[rid];
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

function hatchPattern(id) {
  const defs = svgEl("defs"), pattern = svgEl("pattern", { id, width: 10, height: 10, patternUnits: "userSpaceOnUse" });
  pattern.append(svgEl("path", { d: "M-2,2 L2,-2 M0,10 L10,0 M8,12 L12,8", stroke: "#b77916", "stroke-width": 1 }));
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
