import { orderedRegions } from "./flags.js?v=20261124-empty-1";
// What the page editor and the reader know about a page's blocks: their type's way of ending lines, the units around them.

const prose = new Set(["paragraph", "note"]);
const printedLines = new Set(["verse", "heading", "table", "formula"]);
export const isProseBlock = (region, types) => prose.has(types.types[region.type]?.region);
export const blockName = type => type ? type[0].toUpperCase() + type.slice(1).replaceAll("_", " ") : "Block";

export function blockLineEnd(line, region, types) {
  if (printedLines.has(types.types[region.type]?.region)) return "line";
  if (isProseBlock(region, types) && /[-‐]$/u.test(line.text || "")) return "hyphen";
  return "space";
}

const ridOf = ref => ref.split("#").pop();
export const textOf = (doc, unit) => unit.children.filter(child => child.region)
  .flatMap(child => doc.page.regions.find(region => region.id === ridOf(child.region))?.lines || [])
  .map(line => line.text || "").join(" ");

export function blockContext(doc) {
  const contexts = new Map(), units = new Map(doc?.units.map(unit => [unit.id, unit]));
  function visit(id, containers) {
    const unit = units.get(id);
    if (!unit) return;
    const path = unit.children.some(child => child.unit) ? [...containers, unit] : containers;
    for (const child of unit.children) {
      if (child.unit) visit(child.unit, path);
      else contexts.set(ridOf(child.region), { unit, containers });
    }
  }
  for (const id of Object.values(doc?.flows || {}).flat()) visit(id, []);
  return contexts;
}

export function pageBlocks(doc, types, context) {
  const regions = orderedRegions(doc, types);
  if (!context?.size) return regions;
  const positions = new Map([...context.keys()].map((id, index) => [id, index]));
  return regions.sort((a, b) => (positions.get(a.id) ?? Infinity) - (positions.get(b.id) ?? Infinity));
}
