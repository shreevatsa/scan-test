// Project stored v1 structure into the page-document interface used by the reader.
import { boxRing } from "./ops.js";

export function effectiveEnd(line, kind) {
  if (line.end != null) return line.end;
  if (kind === "verse" || kind === "table") return "line";
  return /[-‐]$/u.test(line.text || "") ? "hyphen" : "space";
}

const unitAttrs = ({ number, label, lang, style, open }) =>
  Object.fromEntries(Object.entries({ number, label, lang, style, open }).filter(([, v]) => v !== undefined));

function pageTypes(book) {
  const types = Object.fromEntries(Object.entries(book.types).map(([name, { kind, furniture, ...type }]) => [
    name, { ...structuredClone(type), ...(kind !== undefined ? { region: kind } : {}), ...(furniture ? { role: "furniture" } : {}) },
  ]));
  return { types, flows: structuredClone(book.flows ?? { main: {} }), relations: structuredClone(book.relations ?? {}) };
}

export function toPageDocs(book) {
  if (book.chaya !== 1) throw new Error("Expected a Chaya version 1 book.");
  const types = pageTypes(book), docs = [];
  const containers = new Map(), targets = new Map(), continuing = new Map(), links = [];
  const regionRefs = new Map();
  let nextUnit = 0;

  // A stored unit is projected once. Put the complete subtree on the page where its root starts,
  // with qualified references to any regions on later pages. No open flags need to simulate its joins.
  function addUnit(fragment, type, parent, flow, doc) {
    const owner = parent?.owner ?? doc;
    const unit = { id: `u${++nextUnit}`, type, ...structuredClone(unitAttrs(fragment)), children: [] };
    owner.units.push(unit);
    if (parent) parent.unit.children.push({ unit: unit.id });
    else (owner.flows[flow] ||= []).push(unit.id);
    return { owner, unit };
  }

  book.pages.forEach((page, index) => {
    if (page.skip) return;
    if (!page.regions) { docs.push(null); return; }
    const id = page.id ?? String(index + 1), [width, height] = page.size ?? [10000, 10000];
    const pixels = ([x0, y0, x1, y1]) => [Math.round(x0 * width), Math.round(y0 * height), Math.round(x1 * width), Math.round(y1 * height)];
    const doc = { schema_version: "0.3", page: { id, width, height, regions: [], ...(page.label != null ? { label: page.label } : {}) },
      units: [], flows: Object.fromEntries(Object.keys(types.flows).map(flow => [flow, []])), relations: [] };
    docs.push(doc);

    let order = 0;
    for (const region of page.regions) {
      const { type } = region;
      if (type === "?" || region.out) continue;
      const definition = book.types[type] ?? {};
      const ref = `${index + 1}/${region.id}`, oldRef = `${id}#${region.id}`;
      regionRefs.set(ref, oldRef);
      const box = pixels(region.box);
      const lines = (region.lines ?? []).map(({ box, spans, ...line }, lineIndex) => {
        const oldLine = { ...structuredClone(line), line: lineIndex + 1, end: effectiveEnd(line, definition.kind) };
        if (box) oldLine.polygons = [boxRing(pixels(box))];
        if (spans) oldLine.spans = spans.map(({ to, link, ...span }, spanIndex) => {
          if (span.kind === "note_marker") {
            span.id ??= `m-${region.id}-${lineIndex + 1}-${spanIndex + 1}`;
            if (to) {
              const marker = link?.marker === null ? undefined : link?.marker ?? span.marker;
              links.push({ type: "note", from: { anchor: `${id}#${span.id}`, ...(marker !== undefined ? { marker } : {}) },
                source: link?.source, order: link?.order, to });
            }
          }
          return structuredClone(span);
        });
        return oldLine;
      });
      doc.page.regions.push({ id: region.id, type, box, polygons: [boxRing(box)], lines, order: definition.furniture ? null : ++order });
      if (definition.furniture) continue;

      const path = region.in ?? [];
      const root = path.length ? book.containers?.[path[0]] : region;
      if (!root) throw new Error(`Missing container ${path[0]}.`);
      const typeOfRoot = path.length ? root.type : region.unit_type ?? type;
      const flow = root.flow ?? book.types[typeOfRoot]?.flow ?? "main";
      let parent;
      for (const name of path) {
        if (!containers.has(name)) {
          const data = book.containers?.[name];
          if (!data) throw new Error(`Missing container ${name}.`);
          containers.set(name, addUnit(data, data.type, parent, flow, doc));
        }
        parent = containers.get(name);
      }

      let unit = parent;
      if (!region.direct) {
        const unitType = region.unit_type ?? type;
        const key = JSON.stringify([parent?.unit.id ?? null, flow, unitType]);
        unit = continuing.get(key) ?? addUnit(region, unitType, parent, flow, doc);
        if (region.continues) continuing.set(key, unit);
        else continuing.delete(key);
      }
      if (!unit) throw new Error(`Direct region ${ref} has no container.`);
      unit.unit.children.push({ region: oldRef });
      targets.set(ref, unit);

      for (const link of region.links ?? []) {
        links.push({ type: link.type, from: { region: oldRef, ...(link.line != null ? { line: link.line + 1 } : {}),
          ...(Object.hasOwn(link, "marker") ? { marker: link.marker } : {}) }, to: link.to, order: link.order });
      }
    }
  });

  if (continuing.size) throw new Error("A region marked as continuing has no next region in its unit.");
  // assemble qualifies a relation's target using the page that contains that unit. Its source is already qualified.
  links.sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity));
  for (const { type, from, to, source } of links) {
    if (source?.region != null) {
      if (!regionRefs.has(source.region)) throw new Error(`Missing source region ${source.region} for a ${type} link.`);
      from.region = regionRefs.get(source.region);
    }
    if (source?.line != null) from.line = source.line + 1;
    const target = targets.get(to) ?? containers.get(to);
    if (!target) throw new Error(`Missing target ${to} for a ${type} link.`);
    target.owner.relations.push({ type, from, to: { unit: target.unit.id } });
  }
  return { docs, types };
}
