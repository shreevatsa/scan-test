import { canonical } from "./ops.js?v=20261124-labels-1";
import { typeRevision } from "./schema.js?v=20261124-labels-1";

export const LAYERS = ["regions", "text"];
const fields = (value, names) => Object.fromEntries(names.filter(name => value[name] !== undefined).map(name => [name, value[name]]));

// Compare owned content, excluding model provenance and stage bookkeeping.
export function layerView(doc, layer) {
  const regions = doc?.page?.regions || [];
  switch (layer) {
    case "regions":
      return canonical(regions.map(region => ({ ...fields(region, ["id", "type", "polygons", "box", "order"]),
        continues_from_earlier: Boolean(region.source?.continues_from_earlier), continues_later: Boolean(region.source?.continues_later),
        lines: (region.lines || []).map(line => fields(line, ["line", "polygons"])) })).concat(
        doc?.source?.ignored_lines?.length ? [{ ignored_lines: doc.source.ignored_lines }] : [],
        doc?.source?.ignored_regions?.length ? [{ ignored_regions: doc.source.ignored_regions }] : [],
      ));
    case "text":
      return canonical({ label: doc?.page?.label ?? null, regions: regions.map(region => ({ id: region.id,
        lines: (region.lines || []).map(line => ({ line: line.line, text: line.text ?? null,
          spans: (line.spans || []).map(span => fields(span, ["start", "end", "kind", "id", "marker"])) })) })) });
    default: throw new Error(`Unknown page layer ${layer}.`);
  }
}

export function layerState(doc, layer) {
  if (!LAYERS.includes(layer)) throw new Error(`Unknown page layer ${layer}.`);
  if (!doc) return null;
  if (doc.source?.layers) {
    const saved = doc.source.layers[layer];
    return saved ? { ...structuredClone(saved), types_revision: typeRevision(saved.types_revision), accepted: Boolean(saved.accepted_at_utc || saved.accepted_legacy) } : null;
  }
  const lines = (doc.page?.regions || []).flatMap(region => region.lines || []);
  // A legacy blank or figure-only page completed the old pipeline without any text lines.
  if (layer === "text" && lines.length && !lines.some(line => typeof line.text === "string")) return null;
  return { state: doc.source?.edited ? "edited" : "model", accepted: true, accepted_legacy: true, types_revision: 1 };
}

export function isProtected(doc, layer) {
  const value = layerState(doc, layer);
  return Boolean(value && (value.state === "edited" || value.accepted));
}

export function layerRecords(doc) {
  const layers = {};
  for (const layer of LAYERS) {
    const state = layerState(doc, layer);
    if (state) {
      delete state.accepted;
      layers[layer] = state;
    }
  }
  return layers;
}

function materialize(doc) {
  const next = structuredClone(doc);
  next.source = { ...next.source, layers: layerRecords(doc) };
  return next;
}

export function pageReviewState(doc, layers = LAYERS.map(layer => layerState(doc, layer))) {
  const saved = layers.filter(Boolean);
  const checked = !!saved.length && saved.every(layer => layer.accepted);
  const suggestion = !!Object.keys(doc?.source?.suggestions || {}).length;
  return { checked, suggestion, status: suggestion ? "suggestion" : checked ? "checked" : "unchecked" };
}

export function withPageReview(doc, checked, at = new Date().toISOString()) {
  const next = materialize(doc);
  for (const layer of Object.values(next.source.layers)) {
    if (checked) {
      if (!layer.accepted_at_utc && !layer.accepted_legacy) layer.accepted_at_utc = at;
    } else {
      delete layer.accepted_at_utc;
      delete layer.accepted_legacy;
    }
  }
  return next;
}

function copyReviewMark(target, source) {
  delete target.accepted_at_utc;
  delete target.accepted_legacy;
  Object.assign(target, fields(source, ["accepted_at_utc", "accepted_legacy"]));
}

// A page editor may have been open when a different tab checked the page.
export function preservePageReview(doc, current) {
  const next = materialize(doc), saved = layerRecords(current);
  for (const [layer, target] of Object.entries(next.source.layers)) {
    if (saved[layer]) copyReviewMark(target, saved[layer]);
  }
  return next;
}

export function noteEdit(modelDoc, doc, { focus = null } = {}) {
  const next = materialize(doc);
  for (const layer of LAYERS) {
    const baseline = layerState(modelDoc, layer);
    if (layer === "text" && (focus === "regions" || !baseline && !doc.page.regions.some(region =>
      region.lines?.some(line => typeof line.text === "string")) && !doc.page.label)) continue;
    if (layerView(modelDoc, layer) === layerView(doc, layer)) {
      if (baseline) {
        delete baseline.accepted;
        const review = next.source.layers[layer];
        if (review) copyReviewMark(baseline, review);
        next.source.layers[layer] = baseline;
      } else delete next.source.layers[layer];
      continue;
    }
    const state = next.source.layers[layer] || { types_revision: baseline?.types_revision || 1 };
    state.state = "edited";
    next.source.layers[layer] = state;
  }
  return next;
}

export function accept(doc, layer, atUtc = new Date().toISOString()) {
  const state = layerState(doc, layer);
  if (!state) throw new Error(`The ${layer} layer is not available yet.`);
  const next = materialize(doc);
  delete next.source.layers[layer].accepted_legacy;
  next.source.layers[layer].accepted_at_utc = atUtc;
  return next;
}

export function sendBack(doc, layer) {
  layerState(doc, layer);
  const next = materialize(doc), state = next.source.layers[layer];
  if (state) {
    delete state.accepted_at_utc;
    delete state.accepted_legacy;
  }
  return next;
}
