import { UNCLASSIFIED } from "../chaya-book.js?v=20261127-unordered-in-place";
import { selectPageRegions } from "./split.js?v=20261127-unordered-in-place";

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
  // The text block placed last in each flow (figures and captions aside): a piece joins the earlier piece of its block
  // only if that is it, so that a paragraph interrupted by a quoted verse stays as printed (paragraph, verse, paragraph).
  const lastText = new Map();
  const isText = type => !["figure", "caption"].includes(definitions[type]?.region);
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
    if (region.source?.continues_from_earlier && earlier.length && earlier.at(-1).id === lastText.get(flow)) {
      const previous = earlier.pop();
      unit = byRegion.get(previous.id);
      unit.children.push({ region: `${pid}#${region.id}` });
      joinedStart.add(region.id); joinedEnd.add(previous.id);
    } else {
      // A piece whose earlier piece is on this page but not just before it (a verse quoted in between): its own unit,
      // the two marks met here.
      if (region.source?.continues_from_earlier && earlier.length) { const previous = earlier.pop(); joinedStart.add(region.id); joinedEnd.add(previous.id); }
      let shared = 0;
      while (shared < containers.length && shared < stack.length && stack[shared].type === containers[shared]) shared++;
      if (shared === containers.length && shared > 0 && definitions[region.type].region === "heading" &&
          stack[shared - 1].children.some(child => definitions[byId.get(child.unit).type].region !== "heading")) shared--;
      stack.length = shared;
      for (const type of containers.slice(shared)) stack.push(makeUnit(type, [], stack, flow));
      unit = makeUnit(region.type, [{ region: `${pid}#${region.id}` }], stack, flow);
    }
    byRegion.set(region.id, unit);
    if (isText(region.type)) lastText.set(flow, region.id);
    if (region.source?.continues_later) earlier.push(region);
    pending.set(key, earlier);
  }
  const regionMap = new Map(regions.map(region => [`${pid}#${region.id}`, region]));
  // A figure or caption at a page's edge floats (assemble.js): the block that goes on to the next page (or comes from
  // the previous one) may stand before (after) it, and is the one marked open.
  const isFloat = id => { const unit = id && byId.get(id); return Boolean(unit) && !isText(unit.type) && !unit.children.some(child => child.unit); };
  const edgeChild = (children, first) => {
    const list = first === 0 ? children : [...children].reverse();
    return list.find(child => !(child.unit && isFloat(child.unit))) || list[0];
  };
  for (const [side, first, last, boundary] of [["start", 0, false, firstPage], ["end", -1, true, lastPage]]) {
    for (const roots of Object.values(flows)) {
      let unit = byId.get(edgeChild(roots.map(id => ({ unit: id })), first)?.unit), allowed = !boundary;
      while (unit) {
        const child = edgeChild(unit.children, first), nested = child?.unit && byId.get(child.unit);
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

export function provisionalDocument(pid, page, types, record) {
  const { sent } = selectPageRegions(record.regions);
  const sentById = new Map(sent.map(entry => [entry.rid, entry]));
  const regions = record.regions.flatMap(region => {
    const id = region.document_region_id || `r${region.region_id}`, reading = sentById.get(id);
    const [x0, y0, x1, y1] = (region.model_box ?? region.bounds ?? []).map(Math.round);
    if (![x0, y0, x1, y1].every(Number.isFinite)) {
      if (reading) throw new Error(`Region ${id} has no usable box.`);
      return [];
    }
    const box = [x0, y0, x1, y1];
    const lines = new Map(region.lines.map(line => [line.line_id, line.polygons]));
    const type = Object.hasOwn(types.types, region.type) ? region.type : UNCLASSIFIED;
    const proposed = region.proposed_type;
    return [{ id, type, box, order: region.reading_order,
      polygons: reading ? structuredClone(region.polygons) : [[[x0, y0], [x1, y0], [x1, y1], [x0, y1]]],
      lines: reading?.line_ids.map(line => ({ line, polygons: structuredClone(lines.get(line)) })) ?? [],
      source: { continues_from_earlier: Boolean(region.continues_from_earlier), continues_later: Boolean(region.continues_later),
        ...(proposed ? { proposed_type: proposed } : {}),
        ...(!reading ? { no_ink: true } : {}) } }];
  });
  return { page: { id: pid, ...page, regions } };
}
