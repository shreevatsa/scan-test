import { bbox } from "./render.js";

// Printed types use their regions. Container examples include every descendant region on that page.
export function typeExampleIndex(docs, types) {
  const index = new Map(Object.keys(types.types).map(name => [name, []]));
  for (const doc of docs) {
    const page = doc.page, regions = new Map(page.regions.map(region => [region.id, region]));
    const units = new Map(doc.units.map(unit => [unit.id, unit]));
    const descendants = (unit, seen = new Set()) => {
      if (!unit || seen.has(unit.id)) return [];
      const next = new Set([...seen, unit.id]);
      return unit.children.flatMap(child => {
        if (child.unit) return descendants(units.get(child.unit), next);
        const prefix = `${page.id}#`;
        return child.region?.startsWith(prefix) ? [regions.get(child.region.slice(prefix.length))].filter(Boolean) : [];
      });
    };
    const add = (name, members, unit) => {
      const unique = [...new Set(members)];
      const boxes = unique.map(region => region.box || bbox(region.polygons || []));
      const box = [Math.min(...boxes.map(box => box[0])), Math.min(...boxes.map(box => box[1])),
        Math.max(...boxes.map(box => box[2])), Math.max(...boxes.map(box => box[3]))];
      if (!box.every(Number.isFinite) || box[2] <= box[0] || box[3] <= box[1]) return;
      index.get(name)?.push({ page, regions: unique, box, unit,
        provisional: !!unit && doc.source?.layers?.units?.state === "provisional" });
    };
    for (const region of page.regions) if (types.types[region.type]?.region) add(region.type, [region]);
    for (const unit of doc.units) if (types.types[unit.type] && !types.types[unit.type].region) add(unit.type, descendants(unit), unit.id);
  }
  // Show different pages first, then further examples from those pages.
  for (const [name, examples] of index) {
    const pages = new Set(), first = [], rest = [];
    for (const example of examples) {
      (pages.has(example.page.id) ? rest : first).push(example);
      pages.add(example.page.id);
    }
    index.set(name, [...first, ...rest]);
  }
  return index;
}
