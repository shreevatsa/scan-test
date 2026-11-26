import { boxRing } from "./ops.js?v=20261126-scan-preview";


export const DEFAULT_COUNTS = "युगलकम्=2,युग्मम्=2,तिलकम्=3,विशेषकम्=3,कलापकम्=4,कुलकम्=5";

function splitMarker(doc, unit, region, markerType) {
  const taken = doc.regionIds ?? new Set(doc.page.regions.map(item => item.id));
  let next = taken.size + 1;
  while (taken.has(`r${next}`)) next++;
  const id = `r${next}`, [x0, y0, x1, y1] = region.box;
  taken.add(id);
  const line = region.lines.pop();
  const edge = (lines, max) => {
    const points = lines.flatMap(value => (value.polygons ?? []).flat());
    return points.length ? (max ? Math.max : Math.min)(...points.map(point => point[1])) : null;
  };
  const above = edge(region.lines, true), below = edge([line], false);
  const cut = above != null && below != null && above < below ? Math.round((above + below) / 2)
    : Math.round(y1 - (y1 - y0) / (region.lines.length + 1));
  const box = [x0, Math.min(y1 - 2, cut + 1), x1, y1];
  region.box = [x0, y0, x1, Math.max(y0 + 2, cut)];
  region.polygons = [boxRing(region.box)];
  const order = region.order;
  if (Number.isFinite(order)) for (const other of doc.page.regions) if (other.order > order) other.order++;
  const piece = { id, type: markerType, box, polygons: [boxRing(box)], lines: [line],
    ...(Number.isFinite(order) ? { order: order + 1 } : {}), source: { split_from: region.id } };
  doc.page.regions.splice(doc.page.regions.indexOf(region) + 1, 0, piece);
  let markerId = `u${doc.units.length + 1}`;
  while (doc.units.some(item => item.id === markerId)) markerId += "_";
  const marker = { id: markerId, type: markerType, children: [{ region: `${doc.page.id}#${id}` }] };
  if (unit.open?.end) {
    marker.open = { end: true };
    if (unit.open.start) delete unit.open.end;
    else delete unit.open;
  }
  doc.units.push(marker);
  const parent = doc.units.find(item => item.children.some(child => child.unit === unit.id));
  if (parent) parent.children.splice(parent.children.findIndex(child => child.unit === unit.id) + 1, 0, { unit: marker.id });
  else {
    const flow = Object.values(doc.flows).find(ids => ids.includes(unit.id));
    if (flow) flow.splice(flow.indexOf(unit.id) + 1, 0, marker.id);
  }
}

// Group one page's markers. Returns [{ marker, verses: [ids], split }] for the groups made, and problems for the others.
export function groupVerses(doc, { counts, markerType = "verse_group_marker", verseType = "verse" }) {
  const made = [], problems = [];
  const word = new RegExp(`\\(\\s*(${Object.keys(counts).join("|")})\\s*\\)`);
  const regionOf = unit => doc.page.regions.find(r => r.id === unit.children.find(c => c.region)?.region.split("#").pop());
  // A marker read as the last line of a verse: split it off.
  for (const unit of [...doc.units]) {
    if (unit.type !== verseType) continue;
    const region = regionOf(unit), last = region?.lines?.at(-1);
    if (!region || region.lines.length < 2 || !word.test(last.text || "") || (last.text || "").replace(word, "").trim()) continue;
    splitMarker(doc, unit, region, markerType);
    made.push({ split: true });
  }
  for (const unit of doc.units.filter(u => u.type === markerType)) {
    const main = doc.flows.main || [];
    if (!main.includes(unit.id)) continue;
    const region = regionOf(unit), name = word.exec((region?.lines || []).map(l => l.text).join(" "))?.[1];
    if (!name) { problems.push(`a ${markerType} without a known name: ${(region?.lines || []).map(l => l.text).join(" ")}`); continue; }
    const n = counts[name];
    // The verses printed above the marker, nearest first.
    const above = main.map(id => doc.units.find(u => u.id === id)).filter(u => u.type === verseType && regionOf(u)?.box[3] <= region.box[1] + 12)
      .sort((a, b) => regionOf(b).box[3] - regionOf(a).box[3]).slice(0, n);
    if (above.length < n) { problems.push(`${name}: only ${above.length} verses above it on this page`); continue; }
    const ids = above.map(u => u.id).sort((a, b) => main.indexOf(a) - main.indexOf(b));
    const at = main.indexOf(ids[0]);
    if (ids.some((id, k) => main.indexOf(id) !== at + k)) { problems.push(`${name}: its verses are not consecutive in reading order`); continue; }
    let gid = "vg1"; for (let k = 2; doc.units.some(u => u.id === gid); k++) gid = `vg${k}`;
    doc.units.push({ id: gid, type: "verse_group", label: name, children: [...ids, unit.id].map(id => ({ unit: id })), source: { made_by: "rule: verse-group markers" } });
    const rest = main.filter(id => id !== unit.id && !ids.includes(id));
    rest.splice(rest.indexOf(main.slice(at + ids.length).find(id => rest.includes(id))) >= 0 ? rest.indexOf(main.slice(at + ids.length).find(id => rest.includes(id))) : rest.length, 0, gid);
    doc.flows.main = rest;
    made.push({ marker: name, verses: ids });
  }
  return { made, problems };
}
