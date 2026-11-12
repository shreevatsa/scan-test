import { typeRevision } from "./schema.js?v=20261110-reading-2";
import { regionTypePaths } from "./pipeline/provisional.js?v=20261110-finders-4";
import { layerState } from "./layers.js?v=20261110-finders-4";

export function orderedRegions(doc, types, furniture = true) {
  return (doc?.page.regions || []).map((region, index) => ({ region, index }))
    .filter(({ region }) => furniture || types.types[region.type]?.role !== "furniture")
    .sort((a, b) => (a.region.order ?? Infinity) - (b.region.order ?? Infinity) || a.index - b.index).map(value => value.region);
}

// A page's layout, for grouping pages and sorting the rarest first (it is not a flag): the kinds of printed content on
// it, in the type list's order. How many regions of each there are, the order they come in and the page furniture
// do not count, so that ordinary body pages fall into a few groups.
export function layoutSignature(doc, types) {
  if (!doc) return "";
  if (!doc.page.regions.length) return "Blank page";
  const order = Object.keys(types.types), present = new Set(doc.page.regions.map(region => region.type));
  const content = [...present].filter(type => types.types[type]?.role !== "furniture")
    .sort((a, b) => (order.indexOf(a) + 1 || Infinity) - (order.indexOf(b) + 1 || Infinity) || a.localeCompare(b));
  return content.join(" · ") || "Page furniture only";
}

// Layouts on fewer pages than this are offered as a filter in the page grids.
export const RARE_LAYOUT = 3;

export function layoutCounts(docs, types) {
  const counts = new Map();
  for (const doc of docs.filter(Boolean)) {
    const signature = layoutSignature(doc, types);
    counts.set(signature, (counts.get(signature) || 0) + 1);
  }
  return counts;
}

function flowEdges(doc, types) {
  const paths = regionTypePaths(types), edges = new Map();
  for (const region of orderedRegions(doc, types, false)) {
    const path = paths.get(region.type), flow = path && types.types[path[0]].flow;
    if (!flow) continue;
    if (!edges.has(flow)) edges.set(flow, { first: region, last: region });
    edges.get(flow).last = region;
  }
  return edges;
}

// The cells of a grid, every `step` pixels, inside a region's outline (its rings, filled even-odd).
function outlineCells(rings, step = 4) {
  const cells = new Set();
  const key = (x, y) => Math.floor(y / step) * 1e6 + Math.floor(x / step);
  for (const ring of rings || []) {
    if (ring.length < 3) continue;
    const ys = ring.map(point => point[1]), top = Math.min(...ys), bottom = Math.max(...ys);
    for (let y = Math.floor(top / step) * step + step / 2; y < bottom; y += step) {
      const xs = [];
      ring.forEach(([ax, ay], k) => {
        const [bx, by] = ring[(k + 1) % ring.length];
        if ((ay <= y) !== (by <= y)) xs.push(ax + (y - ay) * (bx - ax) / (by - ay));
      });
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2)
        for (let x = Math.ceil((xs[k] - step / 2) / step) * step + step / 2; x < xs[k + 1]; x += step) cells.add(key(x, y));
    }
  }
  return cells;
}

// How much of the smaller of two boxes the other covers.
function boxOverlap(a, b) {
  if (!a || !b) return 0;
  const area = box => Math.max(0, box[2] - box[0]) * Math.max(0, box[3] - box[1]);
  const overlap = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
  return overlap / Math.max(1, Math.min(area(a), area(b)));
}

// How much of the smaller of two regions the other covers: by their outlines where both have them (a region that
// wraps around a neighbor, as a two-line footnote beside one-line footnotes, has a box over it but no shared ink),
// else by their boxes.
export function regionOverlap(a, b) {
  if (a.polygons?.length && b.polygons?.length) {
    const first = outlineCells(a.polygons), second = outlineCells(b.polygons);
    if (first.size && second.size) {
      let shared = 0;
      for (const cell of first) if (second.has(cell)) shared++;
      return shared / Math.min(first.size, second.size);
    }
  }
  return boxOverlap(a.box, b.box);
}

// Units settled by completion or by hand decide a page break themselves (Read checks those joins), so the regions'
// continuation flags are compared only while either page's units are still provisional.
const unitsSettled = doc => { const units = layerState(doc, "units"); return !!units && units.state !== "provisional"; };

export function regionFlags(doc, types, { errors = [], previous = null, next = null } = {}) {
  if (!doc) return [];
  const flags = [], add = (code, message, region = null, box = null) => flags.push({ code, message, region, box });
  const regions = doc.page.regions;
  for (const region of regions) {
    if (region.source?.uncertain) add("uncertain", `${region.id} has an uncertain type or boundary`, region.id);
    if (!Object.hasOwn(types.types, region.type)) add("unknown-type", `${region.id} needs a known type`, region.id, region.box);
    if (types.types[region.type]?.role !== "furniture" && !Number.isFinite(region.order)) add("missing-order", `${region.id} has no reading order`, region.id);
    if (region.source?.no_ink) add("no-ink", `${region.id} has no detected ink`, region.id, region.box);
  }
  for (const omitted of doc.source?.omitted_regions || []) add("omitted", `${omitted.region} needs a type`, omitted.region, omitted.box);
  for (const warning of doc.source?.warnings || []) add("region-warning", String(warning));
  for (const skipped of doc.source?.regions_skipped || []) add("no-ink", `Region ${skipped.region_id} was left out (${skipped.status || "no ink"})`);
  for (const line of doc.source?.uncovered_lines || []) add("uncovered", `Printed line ${line.line_id} is outside all regions`, null, line.box);
  for (const problem of doc.source?.provisional_problems || []) add("provisional", problem);
  if (doc.source?.geometry_error) add("geometry", doc.source.geometry_error);
  if (doc.source?.type_review?.regions) add("type-revision", "Find regions again after the figure-class change");
  for (let i = 0; i < regions.length; i++) for (let j = i + 1; j < regions.length; j++) {
    if (boxOverlap(regions[i].box, regions[j].box) > 0.2 && regionOverlap(regions[i], regions[j]) > 0.2)
      add("overlap", `${regions[i].id} and ${regions[j].id} overlap by more than a fifth of the smaller region`, regions[i].id);
  }
  for (const error of errors) add("invalid", error);
  const current = flowEdges(doc, types);
  // A page with no regions (no content) has no continuation to compare, on either side of it.
  for (const [neighbor, side] of [[previous, "previous"], [next, "next"]]) {
    if (!regions.length || !neighbor?.page.regions.length || unitsSettled(doc) && unitsSettled(neighbor)) continue;
    const other = flowEdges(neighbor, types);
    for (const flow of new Set([...current.keys(), ...other.keys()])) {
      const edge = current.get(flow), matching = other.get(flow);
      const before = side === "previous" ? matching?.last : edge?.last;
      const after = side === "previous" ? edge?.first : matching?.first;
      if (!!before?.source?.continues_later !== !!after?.source?.continues_from_earlier)
        add("continuation", `${flow} continuation does not match the ${side} page`, side === "previous" ? edge?.first.id : edge?.last.id);
    }
  }
  return flags;
}

export function textFlags(doc, types) {
  if (!doc?.source?.layers?.text && !doc?.page.regions.some(region => region.lines?.some(line => typeof line.text === "string"))) return [];
  const flags = [];
  for (const region of doc.page.regions) {
    if (types.types[region.type]?.region === "figure") continue;
    const missing = (region.lines || []).filter(line => line.polygons?.length && typeof line.text !== "string").length;
    if (missing) flags.push({ code: "missing-text", message: `${region.id} is missing text on ${missing} line pieces`, region: region.id });
    if (region.source?.transcription?.uncertain) flags.push({ code: "uncertain-text", message: `${region.id} has an uncertain transcription`, region: region.id });
  }
  for (const message of doc.source?.problems || []) if (/line.*(count|mismatch)|missing.*line/i.test(message)) flags.push({ code: "line-count", message });
  if (typeRevision(doc.source?.layers?.text?.types_revision) < typeRevision(types.source?.revision)) flags.push({ code: "earlier-text", message: "Transcribed under an earlier type list" });
  return flags;
}

export function readFlags(doc, errors = [], warnings = [], assembly = []) {
  if (!doc) return [];
  const flags = [...errors, ...warnings, ...assembly].map(message => ({ code: "structure", message }));
  for (const region of doc.page.regions) if (region.source?.uncertain || region.source?.completion?.uncertain)
    flags.push({ code: "uncertain-units", message: `${region.id} has an uncertain completion`, region: region.id });
  if (Object.keys(doc.source?.suggestions || {}).length) flags.push({ code: "suggestion", message: "A model suggestion is waiting" });
  if (doc.source?.type_review?.units) flags.push({ code: "type-revision", message: "Complete units under the revised containment rules" });
  if (doc.source?.type_review?.manual) flags.push({ code: "type-revision", message: "Review protected units under the revised containment rules" });
  return flags;
}
