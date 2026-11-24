import { ownerOf, regionRef, splitRegionAt, splitUnit } from "./ops.js?v=20261124-vision-4";

export const DEFAULT_COUNTS = "युगलकम्=2,युग्मम्=2,तिलकम्=3,विशेषकम्=3,कलापकम्=4,कुलकम्=5";

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
    const id = splitRegionAt(doc, region.id, region.lines.length - 1);
    // The piece is a unit of its own, right after the verse's.
    const holder = ownerOf(doc, region.id), at = holder.children.findIndex(c => c.region === regionRef(doc, region.id));
    holder.children.splice(at + 1, 0, { region: regionRef(doc, id) });
    splitUnit(doc, holder.id, at + 1);
    const piece = doc.page.regions.find(r => r.id === id);
    piece.type = markerType; piece.source = { ...piece.source, split_from: region.id, by: "webapp/tools/chaya_verse_groups.mjs" };
    const owner = doc.units.find(u => u.children.some(c => c.region?.split("#").pop() === id));
    owner.type = markerType;
    made.push({ split: true });
  }
  const main = doc.flows.main || [];
  for (const unit of doc.units.filter(u => u.type === markerType && main.includes(u.id))) {
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
    doc.units.push({ id: gid, type: "verse_group", label: name, children: [...ids, unit.id].map(id => ({ unit: id })), source: { made_by: "rule: verse-group markers (webapp/tools/chaya_verse_groups.mjs)" } });
    const rest = main.filter(id => id !== unit.id && !ids.includes(id));
    rest.splice(rest.indexOf(main.slice(at + ids.length).find(id => rest.includes(id))) >= 0 ? rest.indexOf(main.slice(at + ids.length).find(id => rest.includes(id))) : rest.length, 0, gid);
    doc.flows.main = rest;
    made.push({ marker: name, verses: ids });
  }
  return { made, problems };
}
