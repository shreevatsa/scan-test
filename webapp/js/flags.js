import { typeRevision } from "./schema.js?v=20261110-reading-2";
import { regionTypePaths } from "./pipeline/provisional.js?v=20261110-finders-4";

export function orderedRegions(doc, types, furniture = true) {
  return (doc?.page.regions || []).map((region, index) => ({ region, index }))
    .filter(({ region }) => furniture || types.types[region.type]?.role !== "furniture")
    .sort((a, b) => (a.region.order ?? Infinity) - (b.region.order ?? Infinity) || a.index - b.index).map(value => value.region);
}

export function layoutSignature(doc, types) {
  if (!doc) return "";
  const names = orderedRegions(doc, types).map(region => region.type);
  return names.filter((type, index) => type !== names[index - 1]).join(" → ") || "Blank page";
}

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

export function regionFlags(doc, types, { errors = [], previous = null, next = null, frequency = null } = {}) {
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
    const a = regions[i].box, b = regions[j].box;
    if (!a || !b) continue;
    const area = box => Math.max(0, box[2] - box[0]) * Math.max(0, box[3] - box[1]);
    const overlap = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
    if (overlap > 0.2 * Math.min(area(a), area(b))) add("overlap", `${regions[i].id} and ${regions[j].id} overlap by more than a fifth of the smaller box`, regions[i].id);
  }
  for (const error of errors) add("invalid", error);
  const current = flowEdges(doc, types);
  for (const [neighbor, side] of [[previous, "previous"], [next, "next"]]) {
    if (!neighbor?.page.regions.length) continue;
    const other = flowEdges(neighbor, types);
    for (const flow of new Set([...current.keys(), ...other.keys()])) {
      const edge = current.get(flow), matching = other.get(flow);
      const before = side === "previous" ? matching?.last : edge?.last;
      const after = side === "previous" ? edge?.first : matching?.first;
      if (!!before?.source?.continues_later !== !!after?.source?.continues_from_earlier)
        add("continuation", `${flow} continuation does not match the ${side} page`, side === "previous" ? edge?.first.id : edge?.last.id);
    }
  }
  if (frequency !== null && frequency < 3) add("rare-layout", `This layout occurs on ${frequency} ${frequency === 1 ? "page" : "pages"}`);
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
