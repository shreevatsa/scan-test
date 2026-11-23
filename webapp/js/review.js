import { canonical, clone, EditError, regionById, setLine, setRegionType } from "./ops.js?v=20261123-blocks-b2-5";
import { layerRecords } from "./layers.js?v=20261123-blocks-b2-5";
import { mergeText } from "./pipeline/apply.js?v=20261123-blocks-b2-5";
import { checkDocument } from "./schema.js?v=20261123-blocks-b2-5";
import { markedText } from "./pipeline/split.js";
import { regionLayout } from "./pipeline/finders.js?v=20261123-blocks-b2-5";
import { preserveMarkerIds } from "./marker-ids.js?v=20261123-blocks-b2-5";
import { partialTextScope } from "./pipeline/partial-reading.js?v=20261123-blocks-b2-5";

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
const lineShape = (doc, region, line) => canonical({ image: doc.page.image_sha256, width: doc.page.width, height: doc.page.height,
  region: region.id, polygons: line.polygons, line: line.line });

export function reviewCandidate(current, record, layer, types, regionCandidate = null, { suggestion = false } = {}) {
    if (layer === "regions") {
    if (!regionCandidate || regionCandidate.page.id !== current.page.id || regionCandidate.page.image_sha256 !== current.page.image_sha256 || regionCandidate.page.width !== current.page.width || regionCandidate.page.height !== current.page.height)
      throw new EditError("These region results belong to a different scan.");
    return clone(regionCandidate);
  }
  if (layer === "text") {
    const unlocked = freeLayer(current, "text");
    const out = mergeText(unlocked, record, types, () => [[], []], { regionIds: suggestion ? partialTextScope(current, record) : null });
    if (!out.taken.includes("text")) throw new EditError("The region geometry has changed. Compare a transcription made for the current regions.");
    return out.doc;
  }
  throw new EditError(`Unknown review layer ${layer}.`);
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

export function settle(current, candidate, types, layer, scope = {}, { path = null, profile = null, keep = false, fingerprint = null, call = null, at = new Date().toISOString() } = {}) {
  if (layer !== "regions" && layer !== "text") throw new EditError(`Unknown review layer ${layer}.`);
  let doc = clone(current), keys = [], fields = [];
  if (layer === "text" && textGeometry(doc) !== textGeometry(candidate)) throw new EditError("The region geometry changed. Reopen this review.");
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
      keys = [scope.region];
    } else {
      doc = clone(keep ? current : candidate); keys = doc.page.regions.map(region => region.id);
      // A new set of regions: the groupings and links made for the old ones no longer apply, and the page's checks say so.
      if (!keep && Object.keys(current.overrides || {}).length) { doc.overrides = {}; doc.source = { ...doc.source, dropped_overrides: true }; }
    }
    fields = ["type"];
  } else keys = takeText(doc, keep ? current : candidate, scope);
  const errors = checkDocument(doc, types)[0];
  if (errors.length) throw new EditError(errors[0]);
  doc.source ||= {}; doc.source.review ||= {}; doc.source.review[layer] ||= {};
  if (layer === "regions") {
    const shape = textGeometry(doc), savedShape = doc.source.review.regions_geometry;
    if (savedShape !== shape) doc.source.review.regions = Object.fromEntries(Object.entries(doc.source.review.regions)
      .filter(([, value]) => !savedShape && value.geometry === shape));
    for (const value of Object.values(doc.source.review.regions)) delete value.geometry;
    doc.source.review.regions_geometry = shape;
  }
  for (const key of keys) {
    const [rid, lineId] = key.split(":"); const region = regionById(doc, rid), line = lineId === undefined ? null : region.lines.find(line => line.line === Number(lineId));
    doc.source.review[layer][key] = { at_utc: at, path, profile, fingerprint, call, kept_current: keep, fields,
      ...(line ? { geometry: lineShape(doc, region, line) } : {}),
      value: line ? markedText(line) : { type: region.type } };
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
