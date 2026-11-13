import { canonical } from "../ops.js?v=20261113-type-tree-1";
import { selectPageRegions, checkReading } from "./split.js";

export function regionGeometry(source) {
  return { id: source.rid, polygons: source.region.polygons,
    lines: source.region.lines.filter(line => line.polygons?.length).map(line => ({ id: line.line_id, polygons: line.polygons })) };
}

export function readingGeometry(record) {
  return selectPageRegions(record.regions).sent.map(regionGeometry).sort((a, b) => a.id.localeCompare(b.id));
}

export function readingFits(reading, record, imageHash = reading?.image_sha256) {
  const previous = reading?.regions_record;
  try { checkReading(reading.parsed, selectPageRegions(record.regions).sent); } catch { return false; }
  return reading?.status === "completed" && previous && reading.image_sha256 === imageHash &&
    previous.width === record.width && previous.height === record.height &&
    canonical(readingGeometry(previous)) === canonical(readingGeometry(record));
}

export function planReading(cached, record, options, profile, imageHash, force = false) {
  const sent = selectPageRegions(record.regions).sent;
  const full = { request: sent, reused: [], partial: false };
  if (force || !sameReadingSource(cached, record, options, profile, imageHash)) return full;
  const previous = selectPageRegions(cached.regions_record.regions).sent;
  try { checkReading(cached.parsed, previous); } catch { return full; }
  const geometry = new Map(previous.map(source => [source.rid, canonical(regionGeometry(source))]));
  const available = new Set(cached.parsed.regions.map(region => region.id));
  const reused = sent.filter(source => source.line_ids.length && available.has(source.rid) && geometry.get(source.rid) === canonical(regionGeometry(source)))
    .map(source => structuredClone(cached.parsed.regions.find(region => region.id === source.rid)));
  if (!reused.length) return full;
  const ids = new Set(reused.map(region => region.id));
  return { request: sent.filter(source => source.line_ids.length && !ids.has(source.rid)), reused, partial: true };
}

export function sameReadingSource(cached, record, options, profile, imageHash) {
  return cached?.status === "completed" && cached.regions_record && cached.image_sha256 === imageHash &&
    cached.regions_record.width === record.width && cached.regions_record.height === record.height &&
    canonical(cached.options) === canonical(options) && canonical(cached.profile) === canonical(profile);
}

export function combineReading(plan, parsed, sent) {
  const regions = new Map([...plan.reused, ...parsed.regions].map(region => [region.id, region]));
  return checkReading({ regions: sent.filter(source => source.line_ids.length).map(source => structuredClone(regions.get(source.rid))) }, sent);
}

export function retainedParts(cached, reused, archivePath) {
  const ids = new Set(reused.map(region => region.id));
  const parts = cached.parts || [{ path: cached.path || archivePath, region_ids: cached.parsed.regions.map(region => region.id),
    cost_usd: cached.cost_usd ?? null, seconds: cached.seconds ?? null }];
  return parts.map(part => ({ ...part, region_ids: part.region_ids.filter(id => ids.has(id)) })).filter(part => part.region_ids.length);
}

export function partTotals(parts, field) {
  const unique = [...new Map(parts.map(part => [part.path, part])).values()];
  return unique.every(part => Number.isFinite(part[field]) && part[field] >= 0)
    ? unique.reduce((total, part) => total + part[field], 0) : null;
}

// A repair to the same model preserves the page's other text, including human corrections.
export function partialTextScope(current, reading) {
  const model = current?.source?.layers?.text?.made_by || current?.source?.reader?.id;
  if (!reading.partial || model !== reading.profile?.id) return null;
  const missing = current.page.regions.filter(region => region.lines?.some(line => line.polygons?.length && line.text === undefined));
  return [...new Set([...(reading.region_ids || []), ...missing.map(region => region.id)])];
}
