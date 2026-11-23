import { LAYERS, isProtected, layerRecords, layerState, layerView } from "../layers.js?v=20261123-blocks-b2-4";
import { canonical } from "../ops.js?v=20261123-blocks-b2-4";
import { checkDocument, typeRevision } from "../schema.js?v=20261123-blocks-b2-4";
import { checkReading, readingFromDocument, selectPageRegions } from "./split.js";
import { pageLabel, transcribedLines } from "./steps.js?v=20261123-blocks-b2-4";
import { preserveMarkerIds } from "../marker-ids.js?v=20261123-blocks-b2-4";
import { blockLineEnd } from "../blocks.js?v=20261123-blocks-b2-4";

function geometry(doc) {
  return canonical({ id: doc.page.id, image: doc.page.image_sha256, width: doc.page.width, height: doc.page.height,
    // A region with no ink (outlined by its box, nothing to read) takes no part in reading, as in a reading's own record.
    regions: doc.page.regions.filter(region => !(region.source?.no_ink && !(region.lines || []).some(line => line.polygons?.length)))
      .map(region => ({ id: region.id, polygons: region.polygons,
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
  if (!current) return { doc: structuredClone(candidate), taken: ["regions"], suggestion: false };
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
        if (old.end) line.end = old.end;
      }
    }
    if (current.page.label !== undefined) doc.page.label = current.page.label;
    doc.source.layers.text = structuredClone(current.source.layers.text);
    if (current.source.calls?.reading) doc.source.calls = { ...doc.source.calls, reading: structuredClone(current.source.calls.reading) };
  }
  return result(current, doc, ["regions"], false, check);
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

export function mergeText(current, reading, types, check = doc => checkDocument(doc, types), { regionIds = null } = {}) {
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
  const selected = regionIds && new Set(regionIds);
  const usedMarkers = new Set(doc.page.regions.flatMap(region => (region.lines || []).flatMap(line => (line.spans || []).map(span => span.id))));
  // A region the reading did not fit (`kept`, a whole-page reading's) keeps its text and its marker ids; the others number from past them.
  const keptIds = new Set(parsed.regions.filter(value => value.kept).map(value => value.id));
  let marker = 1 + Math.max(0, ...doc.page.regions.filter(region => keptIds.has(region.id)).flatMap(region => (region.lines || [])
    .flatMap(line => (line.spans || []).map(span => Number(/^m(\d+)$/.exec(span.id || "")?.[1] || 0)))));
  for (const region of doc.page.regions) {
    if (selected && !selected.has(region.id)) continue;
    const input = parsed.regions.find(value => value.id === region.id);
    if (!input) continue;
    if (input.kept) {
      region.source = { ...region.source, transcription: { uncertain: true, note: input.note } };
      continue;
    }
    const ids = sent.find(value => value.rid === region.id).line_ids;
    const polygons = Object.fromEntries(region.lines.map(line => [line.line, line.polygons]));
    const output = transcribedLines(ids, polygons, input.lines, marker);
    marker = output.nextMarker;
    for (const line of output.lines) {
      const target = region.lines.find(value => value.line === line.line);
      if (selected) line.spans = preserveMarkerIds(target.spans || [], line.spans || [], usedMarkers);
      target.text = line.text;
      delete target.spans;
      if (line.spans) target.spans = line.spans;
      // How the line ends (a verse's lines are lines, a paragraph's run on): by the block's type, as the reading takes it.
      const end = blockLineEnd(target, region, types);
      if (!target.end && end !== "space") target.end = end;
    }
    region.source = { ...region.source, transcription: { uncertain: input.uncertain, note: input.note } };
  }
  const label = pageLabel(doc.page.regions);
  if (label) doc.page.label = label;
  else delete doc.page.label;
  if (isProtected(current, "text")) return blocked(current, layerView(current, "text") !== layerView(doc, "text"));
  setState(doc, "text", reading.profile?.id, typeRevision(types.source?.revision));
  return result(current, doc, ["text"], false, check);
}
