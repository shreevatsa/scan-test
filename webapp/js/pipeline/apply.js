import { LAYERS, isProtected, layerRecords, layerState, layerView } from "../layers.js?v=20261110-finders-4";
import { canonical } from "../ops.js?v=20261110-finders-4";
import { checkDocument, typeRevision } from "../schema.js?v=20261110-reading-2";
import { checkReading, readingFromDocument, selectPageRegions } from "./split.js";
import { pageLabel, transcribedLines } from "./steps.js?v=20261110-reading-2";

function geometry(doc) {
  return canonical({ id: doc.page.id, image: doc.page.image_sha256, width: doc.page.width, height: doc.page.height,
    regions: doc.page.regions.map(region => ({ id: region.id, polygons: region.polygons,
      lines: (region.lines || []).filter(line => line.polygons?.length).map(line => ({ line: line.line, polygons: line.polygons })) }))
      .sort((a, b) => a.id.localeCompare(b.id)) });
}

function blocked(current, suggestion = true) {
  return { doc: structuredClone(current), taken: [], suggestion };
}

function result(current, doc, taken, suggestion, check) {
  if (check && !check(current)[0].length && check(doc)[0].length) return blocked(current);
  return { doc, taken, suggestion };
}

function setState(doc, layer, profile, revision) {
  doc.source ||= {};
  doc.source.layers ||= layerRecords(doc);
  doc.source.layers[layer] = { state: "model", types_revision: revision };
  if (profile) doc.source.layers[layer].made_by = profile;
}

export function mergeRegions(current, candidate, check) {
  if (!current) return { doc: structuredClone(candidate), taken: ["regions", "units"], suggestion: false };
  if (LAYERS.some(layer => isProtected(current, layer)))
    return blocked(current, LAYERS.some(layer => layerView(current, layer) !== layerView(candidate, layer)));
  const doc = structuredClone(candidate);
  if (layerState(current, "text") && geometry(current) === geometry(candidate)) {
    for (const region of doc.page.regions) {
      const previous = current.page.regions.find(value => value.id === region.id);
      for (const line of region.lines || []) {
        const old = previous.lines.find(value => value.line === line.line);
        if (old.text !== undefined) line.text = old.text;
        if (old.spans) line.spans = structuredClone(old.spans);
        if (old.style) line.style = structuredClone(old.style);
      }
    }
    if (current.page.label !== undefined) doc.page.label = current.page.label;
    doc.source.layers.text = structuredClone(current.source.layers.text);
    if (current.source.calls?.reading) doc.source.calls = { ...doc.source.calls, reading: structuredClone(current.source.calls.reading) };
  }
  return result(current, doc, ["regions", "units"], false, check);
}

function sentRegions(doc, types) {
  return doc.page.regions.map(region => ({ rid: region.id,
    line_ids: types.types[region.type]?.region === "figure" ? []
      : (region.lines || []).filter(line => line.polygons?.length).map(line => line.line) }));
}

function markersOf(doc) {
  const markers = new Map();
  for (const region of doc.page.regions) for (const line of region.lines || []) for (const span of line.spans || []) {
    if (span.kind === "note_marker") markers.set(`${doc.page.id}#${span.id}`,
      { region: `${doc.page.id}#${region.id}`, line: line.line, start: span.start, marker: span.marker });
  }
  return markers;
}

export function mergeText(current, reading, types, check = doc => checkDocument(doc, types)) {
  const sent = sentRegions(current, types);
  let parsed = reading.parsed || reading;
  if (reading.regions_record) {
    const record = reading.regions_record;
    const original = selectPageRegions(record.regions).sent;
    const currentIds = new Set(current.page.regions.map(region => region.id));
    checkReading(parsed, original);
    const source = { page: { id: current.page.id, image_sha256: reading.image_sha256 || current.page.image_sha256,
      width: record.width, height: record.height, regions: original.filter(value => currentIds.has(value.rid) || types.types[value.region.type] || types.source?.aliases?.[value.region.type])
        .map(value => value.region)
        .map(region => ({ id: region.document_region_id || `r${region.region_id}`, polygons: region.polygons,
          lines: (region.lines || []).map(line => ({ line: line.line_id, polygons: line.polygons })) })) } };
    if (geometry(current) !== geometry(source)) return blocked(current);
    parsed = { ...parsed, regions: parsed.regions.filter(region => currentIds.has(region.id)) };
  }
  checkReading(parsed, sent);
  const doc = structuredClone(current);
  let marker = 1;
  for (const region of doc.page.regions) {
    const input = parsed.regions.find(value => value.id === region.id);
    if (!input) continue;
    const ids = sent.find(value => value.rid === region.id).line_ids;
    const polygons = Object.fromEntries(region.lines.map(line => [line.line, line.polygons]));
    const output = transcribedLines(ids, polygons, input.lines, marker);
    marker = output.nextMarker;
    for (const line of output.lines) {
      const target = region.lines.find(value => value.line === line.line);
      target.text = line.text;
      delete target.spans;
      if (line.spans) target.spans = line.spans;
    }
    region.source = { ...region.source, transcription: { uncertain: input.uncertain, note: input.note } };
  }
  const label = pageLabel(doc.page.regions);
  if (label) doc.page.label = label;
  else delete doc.page.label;
  if (isProtected(current, "text")) return blocked(current, layerView(current, "text") !== layerView(doc, "text"));
  if (isProtected(current, "units")) {
    const previous = markersOf(current), next = markersOf(doc);
    if ((current.relations || []).some(relation => relation.from.anchor &&
        canonical(previous.get(relation.from.anchor)) !== canonical(next.get(relation.from.anchor)))) return blocked(current);
  }
  setState(doc, "text", reading.profile?.id, typeRevision(types.source?.revision));
  return result(current, doc, ["text"], false, check);
}

function firstRegion(unit, units, seen = new Set()) {
  if (!unit || seen.has(unit.id)) return null;
  seen.add(unit.id);
  for (const child of unit.children) {
    if (child.region) return child.region;
    const found = firstRegion(units.get(child.unit), units, seen);
    if (found) return found;
  }
  return null;
}

function unitMatches(current, candidate) {
  const oldUnits = new Map(current.units.map(unit => [unit.id, unit]));
  const newUnits = new Map(candidate.units.map(unit => [unit.id, unit])), matches = new Map();
  for (const unit of candidate.units) {
    const region = firstRegion(unit, newUnits);
    const possible = region ? current.units.filter(old => old.type === unit.type && firstRegion(old, oldUnits) === region) : [];
    if (possible.length === 1) matches.set(unit.id, possible[0]);
  }
  return matches;
}

function relationsFor(current, candidate, matches) {
  let omitted = false;
  const regions = new Map(current.page.regions.map(region => [`${current.page.id}#${region.id}`, region]));
  const currentMarkers = markersOf(current), candidateMarkers = markersOf(candidate);
  const markers = new Map();
  for (const [anchor, span] of candidateMarkers) {
    const found = [...currentMarkers].filter(([, value]) => canonical(value) === canonical(span));
    if (found.length === 1) markers.set(anchor, found[0][0]);
  }
  const relations = [];
  for (const value of candidate.relations || []) {
    const relation = structuredClone(value);
    let usable = true;
    for (const side of ["from", "to"]) {
      const endpoint = relation[side];
      if (endpoint.unit && matches) {
        if (matches.has(endpoint.unit)) endpoint.unit = matches.get(endpoint.unit).id;
        else usable = false;
      }
      if (endpoint.region && !regions.has(endpoint.region)) usable = false;
      if (endpoint.anchor) {
        if (markers.has(endpoint.anchor)) endpoint.anchor = markers.get(endpoint.anchor);
        else usable = false;
      }
    }
    if (usable) relations.push(relation);
    else omitted = true;
  }
  return { relations, omitted };
}

function relationSource(relation, markers) {
  const from = relation.from;
  let source = from;
  if (from.anchor) source = { anchor: from.anchor };
  else if (from.unit) source = { unit: from.unit };
  else {
    const possible = [...markers].filter(([, marker]) => marker.region === from.region && marker.line === from.line &&
      (!from.marker || marker.marker === from.marker));
    if (possible.length === 1) source = { anchor: possible[0][0] };
  }
  return canonical({ type: relation.type, from: source });
}

// Unit IDs are model-local. Compare their meaning through the ordered tree and flow paths.
function completionView(doc) {
  const units = new Map(doc.units.map(unit => [unit.id, unit])), paths = new Map();
  const walk = (id, path, seen = new Set()) => {
    const unit = units.get(id);
    if (!unit || seen.has(id)) return { invalid: id };
    const ancestors = new Set(seen).add(id);
    paths.set(id, path);
    return { type: unit.type, number: unit.number ?? null, label: unit.label ?? null, open: unit.open || {},
      children: unit.children.map((child, index) => child.region || walk(child.unit, [...path, index], ancestors)) };
  };
  const flows = Object.fromEntries(Object.entries(doc.flows).map(([flow, roots]) => [flow, roots.map((id, index) => walk(id, [flow, index]))]));
  const endpoint = value => value.unit ? { ...value, unit: paths.get(value.unit) } : value;
  return canonical({ flows, joins: doc.page.regions.map(region => ({ id: region.id,
    lines: (region.lines || []).map(line => [line.line, line.end || "space"]) })),
    relations: (doc.relations || []).map(relation => ({ ...relation, from: endpoint(relation.from), to: endpoint(relation.to) })) });
}

export function mergeCompletion(current, candidate, types, check = doc => checkDocument(doc, types)) {
  if (geometry(current) !== geometry(candidate)) return blocked(current);
  const sent = sentRegions(current, types);
  if (canonical(readingFromDocument(current, sent).regions) !== canonical(readingFromDocument(candidate, sent).regions)) return blocked(current);
  const doc = structuredClone(current), unitsProtected = isProtected(current, "units"), regionsProtected = isProtected(current, "regions");
  const matches = unitMatches(current, candidate);
  const mapped = relationsFor(current, candidate, unitsProtected ? matches : null);
  let suggestion = mapped.omitted;
  if (unitsProtected) {
    for (const unit of candidate.units) {
      const target = matches.get(unit.id);
      if (!target) continue;
      for (const field of ["number", "label"]) if ((target[field] === undefined || target[field] === null || target[field] === "") &&
          unit[field] !== undefined && unit[field] !== null && unit[field] !== "") {
        doc.units.find(value => value.id === target.id)[field] = unit[field];
      }
    }
    doc.relations ||= [];
    const markers = markersOf(doc);
    for (const relation of mapped.relations) {
      const existing = doc.relations.some(value => relationSource(value, markers) === relationSource(relation, markers));
      if (!existing) doc.relations.push(relation);
    }
    // Compare remapped endpoints against the protected tree using its own unit IDs.
    const proposed = structuredClone(candidate);
    proposed.relations = relationsFor(doc, candidate, null).relations;
    suggestion ||= completionView(doc) !== completionView(proposed) || doc.page.regions.some(region =>
      region.type !== candidate.page.regions.find(value => value.id === region.id).type);
    const changed = layerView(current, "units") !== layerView(doc, "units");
    return result(current, doc, changed ? ["units"] : [], suggestion, check);
  }
  doc.units = structuredClone(candidate.units);
  doc.flows = structuredClone(candidate.flows);
  doc.relations = mapped.relations;
  for (const region of doc.page.regions) {
    const proposed = candidate.page.regions.find(value => value.id === region.id);
    if (regionsProtected) suggestion ||= region.type !== proposed.type;
    else region.type = proposed.type;
    for (const line of region.lines || []) {
      delete line.end;
      const end = proposed.lines?.find(value => value.line === line.line)?.end;
      if (end && end !== "space") line.end = end;
    }
  }
  if (regionsProtected) for (const unit of doc.units) {
    const owned = unit.children.filter(child => child.region).map(child => doc.page.regions.find(region => `${doc.page.id}#${region.id}` === child.region)?.type);
    if (owned.length) unit.type = owned[0];
  }
  for (const unit of candidate.units) {
    const style = matches.get(unit.id)?.style;
    if (style) doc.units.find(value => value.id === unit.id).style = structuredClone(style);
  }
  setState(doc, "units", candidate.source?.structurer?.id, typeRevision(types.source?.revision));
  if (!regionsProtected && layerView(current, "regions") !== layerView(doc, "regions")) setState(doc, "regions", candidate.source?.structurer?.id, typeRevision(types.source?.revision));
  return result(current, doc, regionsProtected ? ["units"] : ["regions", "units"], suggestion, check);
}
