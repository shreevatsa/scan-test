import { canonical, clone, EditError, ownerOf, placeOf, regionById, setLine, setRegionType } from "./ops.js?v=20261113-moveon-2";
import { layerRecords } from "./layers.js?v=20261113-moveon-2";
import { mergeText, mergeCompletion } from "./pipeline/apply.js?v=20261113-moveon-2";
import { checkDocument } from "./schema.js?v=20261113-moveon-2";
import { markedText } from "./pipeline/split.js";
import { structureDecisions } from "./pipeline/structure-compare.js";
import { unitPath, unitRegionIds } from "./editing.js?v=20261113-moveon-2";
import { regionLayout } from "./pipeline/finders.js?v=20261113-moveon-2";
import { preserveMarkerIds } from "./marker-ids.js?v=20261113-moveon-2";
import { partialTextScope } from "./pipeline/partial-reading.js?v=20261113-moveon-2";

export const reviewSnapshot = (doc, types) => canonical({ doc, types });
const freeLayer = (doc, layer) => {
  const next = clone(doc); next.source = { ...next.source, layers: layerRecords(doc) };
  next.source.layers[layer] = { state: "model", types_revision: typesRevision(doc, layer) };
  return next;
};
const typesRevision = (doc, layer) => doc.source?.layers?.[layer]?.types_revision || 1;
export const textGeometry = doc => canonical({ image: doc.page.image_sha256, width: doc.page.width, height: doc.page.height,
  regions: doc.page.regions.map(region => ({ id: region.id, polygons: region.polygons,
    lines: (region.lines || []).map(line => ({ line: line.line, polygons: line.polygons })) })).sort((a, b) => a.id.localeCompare(b.id)) });
const unitInput = doc => canonical(doc.page.regions.map(region => ({ id: region.id, order: region.order ?? null,
  lines: (region.lines || []).map(markedText) })).sort((a, b) => a.id.localeCompare(b.id)));
const lineShape = (doc, region, line) => canonical({ image: doc.page.image_sha256, width: doc.page.width, height: doc.page.height,
  region: region.id, polygons: line.polygons, line: line.line });

export function reviewCandidate(current, record, layer, types, regionCandidate = null, { suggestion = false } = {}) {
    if (layer === "regions") {
    if (!regionCandidate || regionCandidate.page.id !== current.page.id || regionCandidate.page.image_sha256 !== current.page.image_sha256 || regionCandidate.page.width !== current.page.width || regionCandidate.page.height !== current.page.height)
      throw new EditError("These region results belong to a different scan.");
    return clone(regionCandidate);
  }
  if (layer === "text") {
    const unlocked = freeLayer(freeLayer(current, "text"), "units"); unlocked.relations = [];
    const out = mergeText(unlocked, record, types, () => [[], []], { regionIds: suggestion ? partialTextScope(current, record) : null });
    if (!out.taken.includes("text")) throw new EditError("The region geometry has changed. Compare a transcription made for the current regions.");
    return out.doc;
  }
  if (layer === "units") {
    const out = mergeCompletion(freeLayer(current, "units"), record.doc, types);
    if (!out.taken.includes("units")) throw new EditError("This assignment does not fit the current text, geometry or type list. Review those inputs first.");
    return out.doc;
  }
  throw new EditError(`Unknown review layer ${layer}.`);
}

export function assignmentOf(doc) {
  const markers = new Map(doc.page.regions.flatMap(region => (region.lines || []).flatMap((line, index) =>
    (line.spans || []).filter(span => span.kind === "note_marker").map(span => [`${doc.page.id}#${span.id}`, { region: region.id, line: index + 1, marker: span.marker }]))));
  return { regions: doc.page.regions.map(region => ({ id: region.id, type: region.type, ends: (region.lines || []).map(line => line.end || "space") })),
    units: doc.units.map(unit => ({ id: unit.id, type: unit.type, number: unit.number ?? null, label: unit.label ?? null,
      open_start: !!unit.open?.start, open_end: !!unit.open?.end, children: unit.children.map(child => child.unit || child.region.split("#")[1]) })),
    flows: Object.entries(doc.flows).map(([flow, units]) => ({ flow, units })),
    relations: (doc.relations || []).map(relation => ({ type: relation.type, ...(markers.get(relation.from.anchor) || {
      region: relation.from.region?.split("#")[1], line: relation.from.line, marker: relation.from.marker }), to: relation.to.unit })) };
}

function textSelection(current, candidate, scope) {
  if (textGeometry(current) !== textGeometry(candidate)) throw new EditError("The regions changed. Reopen this comparison.");
  return current.page.regions.filter(region => !scope.region || region.id === scope.region).flatMap(region =>
    (region.lines || []).filter(line => scope.line === undefined || line.line === scope.line)
      .map(line => ({ region, line, proposed: candidate.page.regions.find(value => value.id === region.id).lines.find(value => value.line === line.line) })));
}

function takeText(doc, candidate, scope) {
  const selected = textSelection(doc, candidate, scope);
  if (!selected.length && (scope.line !== undefined || scope.region && !doc.page.regions.some(region => region.id === scope.region)))
    throw new EditError("Select an existing text line or region.");
  const used = new Set(doc.page.regions.flatMap(region => (region.lines || []).flatMap(line => (line.spans || []).map(span => span.id))));
  for (const { region, line, proposed } of selected) {
    const spans = preserveMarkerIds(line.spans || [], proposed.spans || [], used);
    setLine(doc, region.id, region.lines.indexOf(line), proposed.text || "", spans);
    region.source = { ...region.source, transcription: clone(candidate.page.regions.find(value => value.id === region.id).source?.transcription || {}) };
  }
  if (!scope.region) {
    if (candidate.page.label === undefined) delete doc.page.label; else doc.page.label = candidate.page.label;
  }
  return selected.map(({ region, line }) => `${region.id}:${line.line}`);
}

// A region choice replaces the smallest shared subtree. New ancestry or a moved flow widens the review to the page.
export function unitScope(current, candidate, rid) {
  if (!rid) return null;
  const a = ownerOf(current, rid), b = ownerOf(candidate, rid);
  if (!a || !b) return null;
  const left = unitPath(current, a.id), right = unitPath(candidate, b.id);
  const signature = (doc, unit) => {
    const place = placeOf(doc, unit.id);
    return canonical({ type: unit.type, members: unitRegionIds(doc, unit.id), place: { flow: place.flow, index: place.index } });
  };
  let match = null;
  for (let i = 0; i < Math.min(left.length, right.length); i++) {
    if (signature(current, left[i]) !== signature(candidate, right[i])) break;
    match = { current: left[i].id, candidate: right[i].id, regions: unitRegionIds(current, left[i].id) };
  }
  if (match) {
    const members = new Set(match.regions);
    for (const doc of [current, candidate]) {
      const inside = endpoint => endpoint.unit ? unitRegionIds(doc, endpoint.unit).every(rid => members.has(rid))
        : endpoint.region ? members.has(endpoint.region.split("#")[1]) : doc.page.regions.some(region => members.has(region.id) && region.lines?.some(line => line.spans?.some(span => `${doc.page.id}#${span.id}` === endpoint.anchor)));
      if ((doc.relations || []).some(relation => inside(relation.from) !== inside(relation.to))) return null;
    }
  }
  return match;
}

function takeUnits(doc, candidate, scope) {
  const selected = unitScope(doc, candidate, scope.region);
  if (!selected) {
    doc.units = clone(candidate.units); doc.flows = clone(candidate.flows); doc.relations = clone(candidate.relations || []);
  } else {
    const descendants = (source, id) => {
      const unit = source.units.find(value => value.id === id);
      return [unit, ...unit.children.flatMap(child => child.unit ? descendants(source, child.unit) : [])];
    };
    const removed = new Set(descendants(doc, selected.current).map(unit => unit.id));
    const incoming = descendants(candidate, selected.candidate), used = new Set(doc.units.map(unit => unit.id)), names = new Map([[selected.candidate, selected.current]]);
    let n = 1;
    for (const unit of incoming.slice(1)) { while (used.has(`u${n}`)) n++; const id = `u${n++}`; used.add(id); names.set(unit.id, id); }
    const units = incoming.map(unit => ({ ...clone(unit), id: names.get(unit.id), children: unit.children.map(child => child.unit ? { unit: names.get(child.unit) } : clone(child)) }));
    const targets = names;
    const regions = new Set(selected.regions);
    const kept = (doc.relations || []).filter(rel => !removed.has(rel.from.unit) && !removed.has(rel.to.unit) &&
      !regions.has(rel.from.region?.split("#")[1]) && !regions.has(doc.page.regions.find(region => region.lines?.some(line => line.spans?.some(span => `${doc.page.id}#${span.id}` === rel.from.anchor)))?.id));
    const added = (candidate.relations || []).filter(rel => names.has(rel.from.unit) || names.has(rel.to.unit)).map(rel => ({ ...clone(rel),
      from: rel.from.unit ? { ...rel.from, unit: targets.get(rel.from.unit) || rel.from.unit } : clone(rel.from), to: { ...rel.to, unit: targets.get(rel.to.unit) || rel.to.unit } }));
    doc.units = doc.units.filter(unit => !removed.has(unit.id)).concat(units); doc.relations = [...kept, ...added];
  }
  const regions = selected?.regions || doc.page.regions.map(region => region.id);
  for (const rid of regions) for (const line of regionById(doc, rid).lines || []) {
    const proposed = regionById(candidate, rid).lines.find(value => value.line === line.line);
    if (proposed?.end) line.end = proposed.end; else delete line.end;
  }
  return regions;
}

export function settle(current, candidate, types, layer, scope = {}, { path = null, profile = null, keep = false, fingerprint = null, call = null, at = new Date().toISOString() } = {}) {
  let doc = clone(current), keys = [], fields = [];
  if (layer !== "regions" && textGeometry(doc) !== textGeometry(candidate)) throw new EditError("The region geometry changed. Reopen this review.");
  if (layer === "regions") {
    if (scope.region) {
      const before = regionById(doc, scope.region), proposed = regionById(keep ? current : candidate, scope.region);
      setRegionType(doc, types, scope.region, proposed.type);
      const replacement = clone(proposed);
      replacement.lines = (replacement.lines || []).map(line => {
        const old = before.lines?.find(value => value.line === line.line && canonical(value.polygons) === canonical(line.polygons));
        if (!old) return line;
        return { ...clone(old), ...line };
      });
      doc.page.regions[doc.page.regions.findIndex(value => value.id === scope.region)] = replacement;
      const anchors = new Set(doc.page.regions.flatMap(region => (region.lines || []).flatMap(line => (line.spans || []).filter(span => span.id).map(span => `${doc.page.id}#${span.id}`))));
      doc.relations = (doc.relations || []).filter(relation => !relation.from.anchor || anchors.has(relation.from.anchor));
      keys = [scope.region];
    } else { doc = clone(keep ? current : candidate); keys = doc.page.regions.map(region => region.id); }
    fields = ["type"];
  } else if (layer === "text") keys = takeText(doc, keep ? current : candidate, scope);
  else {
    const proposed = keep ? current : candidate;
    if (scope.field === "type") { setRegionType(doc, types, scope.region, regionById(proposed, scope.region).type); keys = [scope.region]; fields = ["type"]; }
    else if (scope.field === "line_ends") {
      const region = regionById(doc, scope.region), other = regionById(proposed, scope.region);
      for (const [i, line] of region.lines.entries()) { if (other.lines[i].end) line.end = other.lines[i].end; else delete line.end; }
      keys = [scope.region]; fields = ["line_ends"];
    } else { keys = takeUnits(doc, proposed, scope); fields = ["units", "flows", "relations", "line_ends"]; }
  }
  const errors = checkDocument(doc, types)[0];
  if (errors.length) throw new EditError(errors[0]);
  doc.source ||= {}; doc.source.review ||= {}; doc.source.review[layer] ||= {};
  if (layer !== "text") {
    const shape = textGeometry(doc), savedShape = doc.source.review[`${layer}_geometry`];
    if (savedShape !== shape || layer === "units" && doc.source.review.units_input !== unitInput(doc)) doc.source.review[layer] = Object.fromEntries(Object.entries(doc.source.review[layer])
      .filter(([, value]) => !savedShape && value.geometry === shape));
    for (const value of Object.values(doc.source.review[layer])) delete value.geometry;
    doc.source.review[`${layer}_geometry`] = shape;
    if (layer === "units") doc.source.review.units_input = unitInput(doc);
  }
  const decisions = layer === "text" ? null : structureDecisions(assignmentOf(doc));
  for (const key of keys) {
    const [rid, lineId] = key.split(":"); const region = regionById(doc, rid), line = lineId === undefined ? null : region.lines.find(line => line.line === Number(lineId));
    doc.source.review[layer][key] = { at_utc: at, path, profile, fingerprint, call, kept_current: keep, fields,
      ...(line ? { geometry: lineShape(doc, region, line) } : {}),
      value: line ? markedText(line) : clone(decisions.get(key)) };
  }
  if (layer === "regions" && !scope.region) doc.source.review.regions_page = { layout: regionLayout(doc),
    at_utc: at, path, profile, fingerprint, call, kept_current: keep };
  if (doc.source.suggestions && !scope.region) delete doc.source.suggestions[layer];
  return { doc, keys, regions: [...new Set(keys.map(key => key.split(":")[0]))] };
}

export function settledChecks(doc, sent) {
  const result = {};
  for (const source of sent) for (const id of source.line_ids) {
    const key = `${source.rid}:${id}`, saved = doc?.source?.review?.text?.[key], region = doc?.page.regions.find(region => region.id === source.rid), line = region?.lines?.find(line => line.line === id);
    if (line && saved && saved.geometry === lineShape(doc, region, line) && saved.value === markedText(line)) result[key] = { text: saved.value, checked: true };
  }
  return result;
}

export function settledStructureScore(current, candidate) {
  const shape = textGeometry(current), input = unitInput(current);
  if (shape !== textGeometry(candidate) || input !== unitInput(candidate) ||
      current.source?.review?.units_input && current.source.review.units_input !== input) return { reviewed: 0, errors: 0 };
  const actual = structureDecisions(assignmentOf(candidate)), expected = structureDecisions(assignmentOf(current));
  let reviewed = 0, errors = 0;
  for (const [rid, saved] of Object.entries(current.source?.review?.units || {})) {
    const now = expected.get(rid);
    if ((current.source.review.units_geometry || saved.geometry) !== shape || !now || !saved.fields.length || saved.fields.some(field => canonical(saved.value?.[field]) !== canonical(now[field]))) continue;
    reviewed++;
    if (saved.fields.some(field => canonical(actual.get(rid)?.[field]) !== canonical(now[field]))) errors++;
  }
  return { reviewed, errors };
}

export async function saveReview(book, pid, { base, types, candidate, layer, scope, record, path, profile, keep = false, dismiss = false }) {
  if (!book.writable) throw new EditError("Keep an editable copy of this book before saving reviewed choices.");
  return book.editPages([pid], async (docs, latestTypes) => {
    const current = docs.get(pid);
    if (reviewSnapshot(current, latestTypes) !== reviewSnapshot(base, types)) throw new EditError("This page or its types changed. Reopen the review before choosing.");
    if (path) {
      book.work.delete(path);
      if (canonical(await book.readWork(path)) !== canonical(record)) throw new EditError("A newer model result is available. Reopen the review.");
    }
    if (dismiss) { const doc = clone(current); delete doc.source.suggestions[layer]; docs.set(pid, doc); }
    else docs.set(pid, settle(current, candidate, latestTypes, layer, scope, { path, profile, keep, fingerprint: record?.fingerprint || null, call: record?.path || record?.region_call?.path || null }).doc);
    return docs;
  }, { focus: layer === "regions" ? "regions" : "all", archive: true, protect: dismiss ? [] : [layer] });
}
