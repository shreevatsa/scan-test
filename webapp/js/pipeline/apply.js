import { LAYERS, isProtected, layerRecords, layerState, layerView } from "../layers.js?v=20261124-verses-3";
import { canonical } from "../ops.js?v=20261124-verses-3";
import { checkDocument, typeRevision } from "../schema.js?v=20261124-verses-3";
import { checkReading, readingFromDocument, selectPageRegions } from "./split.js";
import { pageLabel, transcribedLines } from "./steps.js?v=20261124-verses-3";
import { preserveMarkerIds, carryMarkers } from "../marker-ids.js?v=20261124-verses-3";
import { blockLineEnd } from "../blocks.js?v=20261124-verses-3";

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

// The text a saved reading has for some regions of a page (`regionIds`), put into those regions of `doc` (changed in
// place), whatever the state of the page's text layer: for blocks just made from areas the finder drew (an area whose
// proposed type the person has now added), which had no text of their own to protect. A region is filled only where its
// outline and line pieces are the ones the reading was made for. Returns the ids filled.
export function restoredText(doc, reading, types, regionIds) {
  const parsed = reading?.parsed, record = reading?.regions_record;
  if (!parsed?.regions || !record) return [];
  const original = new Map(selectPageRegions(record.regions).sent.map(value => [value.rid, value]));
  const usedMarkers = new Set(doc.page.regions.flatMap(region => (region.lines || []).flatMap(line => (line.spans || []).map(span => span.id))));
  let marker = 1 + Math.max(0, ...[...usedMarkers].map(id => Number(/^m(\d+)$/.exec(id || "")?.[1] || 0)));
  const filled = [];
  for (const id of regionIds) {
    const region = doc.page.regions.find(value => value.id === id), input = parsed.regions.find(value => value.id === id), sent = original.get(id);
    if (!region || !input || input.kept || !sent) continue;
    const lines = (region.lines || []).filter(line => line.polygons?.length);
    const same = canonical(region.polygons) === canonical(sent.region.polygons) &&
      canonical(lines.map(line => [line.line, line.polygons])) === canonical(sent.region.lines.filter(line => line.polygons?.length).map(line => [line.line_id, line.polygons]));
    if (!same || input.lines.length !== lines.length) continue;
    const output = transcribedLines(lines.map(line => line.line), Object.fromEntries(lines.map(line => [line.line, line.polygons])), input.lines, marker);
    marker = output.nextMarker;
    for (const line of output.lines) {
      const target = region.lines.find(value => value.line === line.line);
      target.text = line.text;
      delete target.spans;
      const spans = preserveMarkerIds([], line.spans || [], usedMarkers);
      if (spans.length) target.spans = spans;
      const end = blockLineEnd(target, region, types);
      if (!target.end && end !== "space") target.end = end;
    }
    region.source = { ...region.source, transcription: { uncertain: input.uncertain, note: input.note, from: reading.profile?.id } };
    filled.push(id);
  }
  return filled;
}

// Lines of text spread over `n` line pieces in order: the words, in about equal shares of characters. For a region whose
// reading gave another number of lines than the scan's pieces: the text is all there, its line breaks approximate.
export function spreadLines(lines, n, { whole = false } = {}) {
  // Whole lines (verse): one to a piece in order, the last piece taking any lines left over; pieces left over stay empty.
  if (whole) return Array.from({ length: n }, (_, i) => i < n - 1 ? lines[i] ?? "" : lines.slice(n - 1).join(" "));
  const words = lines.join(" ").split(/\s+/).filter(Boolean);
  const total = words.reduce((sum, word) => sum + word.length + 1, 0), out = Array.from({ length: n }, () => []);
  let used = 0;
  for (const word of words) {
    const piece = Math.min(n - 1, Math.floor((used + word.length / 2) / (total / n)));   // by the word's middle
    out[piece].push(word);
    used += word.length + 1;
  }
  return out.map(piece => piece.join(" "));
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
  const markerBlind = ["vision", "local"].includes(reading.profile?.provider);
  const usedMarkers = new Set(doc.page.regions.flatMap(region => (region.lines || []).flatMap(line => (line.spans || []).map(span => span.id))));
  // A region the reading did not fit (`kept`, a whole-page reading's) keeps its text and its marker ids; the others number from past them.
  const keptIds = new Set(parsed.regions.filter(value => value.kept).map(value => value.id));
  let marker = 1 + Math.max(0, ...doc.page.regions.filter(region => keptIds.has(region.id)).flatMap(region => (region.lines || [])
    .flatMap(line => (line.spans || []).map(span => Number(/^m(\d+)$/.exec(span.id || "")?.[1] || 0)))));
  for (const region of doc.page.regions) {
    if (selected && !selected.has(region.id)) continue;
    let input = parsed.regions.find(value => value.id === region.id);
    if (!input) continue;
    const ids = sent.find(value => value.rid === region.id).line_ids;
    if (input.kept) {
      // The reading gave this region another number of lines than the scan's line pieces. A region with no text yet takes
      // the reading's text, spread over its line pieces in order (to be checked); one with text keeps it.
      const empty = !(region.lines || []).some(line => typeof line.text === "string" && line.text.trim());
      if (!empty || !input.returned_lines?.length || !ids.length) {
        region.source = { ...region.source, transcription: { uncertain: true, note: input.note } };
        continue;
      }
      // A block whose printed lines are lines (a verse) keeps them whole, one to a piece; prose is spread evenly.
      const whole = blockLineEnd({ text: "" }, region, types) === "line";
      input = { id: input.id, uncertain: true, note: `The reading's ${input.returned_lines.length} lines are spread over this area's ${ids.length} line pieces; check the line breaks.`,
        lines: spreadLines(input.returned_lines, ids.length, { whole }).map((text, i) => ({ n: i + 1, text })) };
    }
    const polygons = Object.fromEntries(region.lines.map(line => [line.line, line.polygons]));
    const output = transcribedLines(ids, polygons, input.lines, marker);
    marker = output.nextMarker;
    for (const line of output.lines) {
      const target = region.lines.find(value => value.line === line.line);
      if (selected) line.spans = preserveMarkerIds(target.spans || [], line.spans || [], usedMarkers);
      // A reader that cannot see note markers keeps the markers the line had (marker-ids.js carryMarkers).
      if (markerBlind && target.spans?.length) line.spans = carryMarkers(target.text || "", target.spans, line.text, line.spans);
      target.text = line.text;
      delete target.spans;
      if (line.spans) target.spans = line.spans;
      // How the line ends (a verse's lines are lines, a paragraph's run on): by the block's type, as the reading takes it.
      const end = blockLineEnd(target, region, types);
      if (!target.end && end !== "space") target.end = end;
    }
    region.source = { ...region.source, transcription: { uncertain: input.uncertain, note: input.note } };
  }
  // What a whole-page reader read in the printed lines outside all regions (vision.js), kept with each line.
  if (Array.isArray(parsed.uncovered) && doc.source?.uncovered_lines?.length) {
    const read = new Map(parsed.uncovered.map(line => [line.line_id, line.text]));
    doc.source.uncovered_lines = doc.source.uncovered_lines.map(line => read.has(line.line_id) ? { ...line, text: read.get(line.line_id) } : line);
  }
  const label = pageLabel(doc.page.regions);
  if (label) doc.page.label = label;
  else delete doc.page.label;
  if (isProtected(current, "text")) return blocked(current, layerView(current, "text") !== layerView(doc, "text"));
  setState(doc, "text", reading.profile?.id, typeRevision(types.source?.revision));
  return result(current, doc, ["text"], false, check);
}
