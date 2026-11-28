// Store geometry, transcription and structure from a page-document reading as Chaya v1.
import { effectiveEnd } from "./chaya-book.js?v=20261127-credential-links";
import { bbox } from "./render.js?v=20261127-credential-links";

const pick = (object, keys) => Object.fromEntries(keys.filter(key => Object.hasOwn(object, key)).map(key => [key, object[key]]));
const unitAttrs = unit => pick(unit, ["number", "label", "lang", "style", "open"]);
export const regionKey = (page, region) => `${page}#${region}`;
const polygonBox = polygons => polygons?.some(ring => ring.length) ? bbox(polygons) : undefined;
export const regionBox = region => region.box ?? region.model_box ?? polygonBox(region.polygons);
export const validBox = box => box?.length === 4 && box.every(Number.isFinite);
export function writeRegion(region, asFraction, types, ownerKind, type = region.type) {
  const box = regionBox(region);
  if (!validBox(box)) throw new Error(`Region ${region.id} has no usable box.`);
  const out = { id: region.id, type, box: asFraction(box), lines: (region.lines ?? []).map(line => {
    const result = pick(line, ["text", "spans", "style"]);
    if (result.spans) result.spans = structuredClone(result.spans);
    const box = polygonBox(line.polygons) ?? line.box;
    if (validBox(box)) result.box = asFraction(box);
    // This is the old reader's fallback, including prose hyphens that it kept before v1.
    const end = line.end || (["verse", "table"].includes(ownerKind) ? "line" : "space");
    if (end !== effectiveEnd(result, types[type])) result.end = end;
    return result;
  }) };
  const source = region.source;
  if (source?.proposed_type) out.proposed = source.proposed_type;
  if (source?.transcription?.uncertain) out.uncertain = true;
  if (source?.transcription?.note != null) out.note = source.transcription.note;
  return out;
}

export function collectTree(assembled, oldTypes) {
  const byId = new Map(assembled.units.map(unit => [unit.id, unit]));
  const refInfo = new Map(), destination = new Map(), containers = {};
  let nextContainer = 0;
  function walk(unit, path, flow) {
    const extraFlow = !path.length && (oldTypes[unit.type]?.flow ?? "main") !== flow ? { flow } : {};
    if (unit.children.some(child => child.unit)) {
      const id = `c${++nextContainer}`, nested = [...path, id];
      containers[id] = { type: unit.type, ...unitAttrs(unit), ...extraFlow };
      destination.set(unit.id, { container: id });
      for (const child of unit.children) {
        if (child.unit) walk(byId.get(child.unit), nested, flow);
        else refInfo.set(child.region, { flow, kind: oldTypes[unit.type]?.region, attrs: { in: nested, direct: true } });
      }
      return;
    }
    unit.children.forEach(({ region }, index) => {
      const first = index === 0;
      if (first) destination.set(unit.id, { region });
      const { open, ...attributes } = unitAttrs(unit);
      refInfo.set(region, { flow, kind: oldTypes[unit.type]?.region, unitType: unit.type, attrs: {
        ...(path.length ? { in: path } : {}), ...extraFlow, ...(first ? attributes : {}),
        ...(first && open?.start ? { from_previous: true } : {}),
        ...(index < unit.children.length - 1 ? { continues: true } : open?.end ? { continues: "open" } : {}),
      } });
    });
  }
  for (const [flow, ids] of Object.entries(assembled.flows)) for (const id of ids) walk(byId.get(id), [], flow);
  return { refInfo, containers, destination };
}

// Respect a hand-edited flow order while retaining the page's slots for other flows and furniture.
export function orderRegions(page, refInfo, rank) {
  const regions = [...page.regions].sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity));
  const flow = region => refInfo.get(regionKey(page.id, region.id))?.flow;
  const byFlow = new Map();
  for (const region of regions) if (flow(region) != null) {
    if (!byFlow.has(flow(region))) byFlow.set(flow(region), []);
    byFlow.get(flow(region)).push(region);
  }
  for (const group of byFlow.values()) group.sort((a, b) => rank.get(regionKey(page.id, b.id)) - rank.get(regionKey(page.id, a.id)));
  return regions.map(region => byFlow.get(flow(region))?.pop() ?? region);
}

export function moveLinks(assembled, destination, regions, anchors) {
  const signs = [];
  for (const { type, from, to } of assembled.relations) {
    const dest = destination.get(to.unit);
    const target = dest?.container ?? regions.get(dest?.region)?.address;
    if (!target) throw new Error(`A ${type} relation has no stored target.`);
    const found = regions.get(from.region);
    const line = from.line == null ? null : found?.old.lines?.findIndex(value => value.line === from.line);
    if (from.region != null && (!found || (from.line != null && (line == null || line < 0))))
      throw new Error(`Cannot place source of a ${type} link.`);
    if (type === "note" && from.anchor) {
      const marker = anchors.get(from.anchor);
      if (!marker || marker.span.to) throw new Error(`Cannot attach note relation ${from.anchor} to one note marker.`);
      marker.span.to = target;
      if (from.marker !== marker.span.marker) signs.push({ region: marker.region, line: marker.line,
        position: marker.span.start, printed: marker.span.marker, recorded: from.marker ?? null });
    } else {
      if (!found) throw new Error(`A ${type} link has no source region.`);
      (found.region.links ||= []).push({ type, ...(line != null ? { line } : {}), to: target });
      if (from.marker != null) signs.push({ region: from.region, line, recorded: from.marker, lineLink: true });
    }
  }
  return signs;
}
