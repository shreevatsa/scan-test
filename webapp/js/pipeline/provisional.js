import { typeRevision } from "../schema.js?v=20261113-description-1";
import { selectPageRegions } from "./split.js";

export function regionTypePaths(types) {
  const definitions = types.types, paths = new Map(), queue = [];
  for (const [name, type] of Object.entries(definitions)) if (type.flow && type.role !== "furniture") {
    paths.set(name, [name]);
    queue.push(name);
  }
  for (let i = 0; i < queue.length; i++) for (const child of definitions[queue[i]].contains || []) {
    if (paths.has(child) || !definitions[child] || definitions[child].role === "furniture") continue;
    paths.set(child, [...paths.get(queue[i]), child]);
    queue.push(child);
  }
  return paths;
}

export function provisionalUnits(pid, regions, types, { firstPage = false, lastPage = false } = {}) {
  const definitions = types.types, paths = regionTypePaths(types);
  const units = [], flows = Object.fromEntries(Object.keys(types.flows).map(flow => [flow, []])), problems = [];
  const stacks = new Map(), pending = new Map(), byId = new Map(), byRegion = new Map();
  const joinedStart = new Set(), joinedEnd = new Set();
  const ordered = regions.map((region, index) => ({ region, index })).filter(({ region }) => definitions[region.type]?.role !== "furniture")
    .sort((a, b) => (a.region.order ?? Infinity) - (b.region.order ?? Infinity) || a.index - b.index);
  const makeUnit = (type, children, stack, flow) => {
    const unit = { id: `u${units.length + 1}`, type, children };
    units.push(unit); byId.set(unit.id, unit);
    if (stack.length) stack[stack.length - 1].children.push({ unit: unit.id });
    else flows[flow].push(unit.id);
    return unit;
  };
  for (const { region } of ordered) {
    const path = paths.get(region.type);
    if (!path) { problems.push(`type ${region.type} has no place in any flow`); continue; }
    const flow = definitions[path[0]].flow, containers = path.slice(0, -1);
    const stack = stacks.get(flow) || [];
    stacks.set(flow, stack);
    const key = JSON.stringify([flow, region.type]), earlier = pending.get(key) || [];
    let unit;
    if (region.source?.continues_from_earlier && earlier.length) {
      const previous = earlier.pop();
      unit = byRegion.get(previous.id);
      unit.children.push({ region: `${pid}#${region.id}` });
      joinedStart.add(region.id); joinedEnd.add(previous.id);
    } else {
      let shared = 0;
      while (shared < containers.length && shared < stack.length && stack[shared].type === containers[shared]) shared++;
      if (shared === containers.length && shared > 0 && definitions[region.type].region === "heading" &&
          stack[shared - 1].children.some(child => definitions[byId.get(child.unit).type].region !== "heading")) shared--;
      stack.length = shared;
      for (const type of containers.slice(shared)) stack.push(makeUnit(type, [], stack, flow));
      unit = makeUnit(region.type, [{ region: `${pid}#${region.id}` }], stack, flow);
    }
    byRegion.set(region.id, unit);
    if (region.source?.continues_later) earlier.push(region);
    pending.set(key, earlier);
  }
  const regionMap = new Map(regions.map(region => [`${pid}#${region.id}`, region]));
  for (const [side, first, last, boundary] of [["start", 0, false, firstPage], ["end", -1, true, lastPage]]) {
    for (const roots of Object.values(flows)) {
      let unit = byId.get(roots.at(first)), allowed = !boundary;
      while (unit) {
        const child = unit.children.at(first), nested = child?.unit && byId.get(child.unit);
        if (nested) {
          const heading = !last && definitions[nested.type].region === "heading";
          allowed = allowed && !heading;
          if (allowed) { unit.open ||= {}; unit.open[side] = true; }
          unit = nested;
        } else {
          const region = regionMap.get(child?.region);
          const flag = last ? "continues_later" : "continues_from_earlier";
          if (allowed && region?.source?.[flag]) {
            unit.open ||= {}; unit.open[side] = true;
            (last ? joinedEnd : joinedStart).add(region.id);
          }
          break;
        }
      }
    }
  }
  for (const { region } of ordered) {
    if (region.source?.continues_from_earlier && !joinedStart.has(region.id)) problems.push(`${region.id}: continuation from earlier could not be placed`);
    if (region.source?.continues_later && !joinedEnd.has(region.id)) problems.push(`${region.id}: continuation to later could not be placed`);
  }
  return { units, flows, problems };
}

export function rebuildProvisional(doc, types, boundary = {}) {
  if (doc.source?.layers?.units?.state !== "provisional") return doc;
  const { units, flows, problems } = provisionalUnits(doc.page.id, doc.page.regions, types, boundary);
  doc.units = units;
  doc.flows = flows;
  doc.source.problems = [...(doc.source.problems || []).filter(problem => !(doc.source.provisional_problems || []).includes(problem)), ...problems];
  doc.source.provisional_problems = problems;
  doc.source.layers.units.types_revision = typeRevision(types.source?.revision);
  return doc;
}

export function provisionalDocument(pid, page, types, record, boundary = {}) {
  const { sent, skipped } = selectPageRegions(record.regions);
  const regions = [], omitted = [];
  for (const { rid, region, line_ids: lineIds } of sent) {
    if (!types.types[region.type]) {
      omitted.push({ region: rid, type: region.type, box: structuredClone(region.model_box), ...(region.proposed_type ? { proposed_type: region.proposed_type } : {}) });
      continue;
    }
    const lines = new Map(region.lines.map(line => [line.line_id, line.polygons]));
    regions.push({ id: rid, type: region.type, polygons: structuredClone(region.polygons), box: region.model_box.map(Math.round),
      order: region.reading_order, lines: lineIds.map(line => ({ line, polygons: structuredClone(lines.get(line)) })),
      source: { region_id: region.region_id, method_type: region.type, region_class: region.region_class, keep: region.keep,
        uncertain: region.uncertain, continues_from_earlier: Boolean(region.continues_from_earlier),
        continues_later: Boolean(region.continues_later), model_box: structuredClone(region.model_box),
        ...(region.proposed_type ? { proposed_type: region.proposed_type } : {}) } });
  }
  const { units, flows, problems } = provisionalUnits(pid, regions, types, boundary);
  const revision = typeRevision(types.source?.revision);
  const source = { method: "provisional-regions-v1", char_h: record.char_h ?? record.line_analysis?.char_h ?? 0,
    page_angle_deg: record.page_angle_deg ?? record.line_analysis?.page_angle_deg ?? 0,
    regions_skipped: structuredClone(skipped), omitted_regions: omitted,
    uncovered_lines: structuredClone(record.uncovered_lines || []),
    warnings: structuredClone(record.warnings || []), problems: [...(record.problems || []), ...problems], provisional_problems: problems,
    layers: { regions: { state: "model", made_by: record.profile?.method || "042+063", types_revision: typeRevision(record.types_revision) }, units: { state: "provisional", types_revision: revision } } };
  if (record.region_call) source.calls = { regions: structuredClone(record.region_call) };
  return { format: "page", schema_version: "0.2", book_id: types.book_id, page: { id: pid, ...structuredClone(page), regions },
    units, flows, relations: [], source };
}
