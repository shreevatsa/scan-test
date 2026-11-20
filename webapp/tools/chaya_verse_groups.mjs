// Verses that make one sentence, printed with a marker after them — (युगलकम्) for two, (तिलकम्) for three — grouped by
// rule: each marker and the verses it closes become one `verse_group` unit (a container the reader shows as one group,
// lit when the marker is hovered or tapped). The verses are those printed just above the marker on its page, as many as
// its name says; reading order is not trusted, since a marker printed at the right of a verse's last line is often
// read after the next verse or after a closing line. A marker read as the last line of a verse's region is first split
// off into its own region (the page editor's split at a line piece) and typed as the marker. Run it on a book whose
// units are not grouped into sections yet (after chaya_baseline.mjs, before chaya_sections.mjs).
//   node webapp/tools/chaya_verse_groups.mjs IN OUT [--marker-type=verse_group_marker] [--counts='युगलकम्=2,युग्मम्=2,तिलकम्=3,विशेषकम्=3,कलापकम्=4,कुलकम्=5']
import { readFileSync, writeFileSync } from "node:fs";
import { readChaya, writeChaya } from "../js/chayapdf.js";
import { revisedTypeList } from "../js/type-revisions.js";
import { splitRegionAt } from "../js/ops.js";
import { makeValidator, checkPage } from "../js/schema.js";
import { assemble } from "../js/assemble.js";

const DEFAULT_COUNTS = "युगलकम्=2,युग्मम्=2,तिलकम्=3,विशेषकम्=3,कलापकम्=4,कुलकम्=5";

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
    const id = splitRegionAt(doc, region.id, region.lines.length - 1, true);
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

export async function verseGroups(bytes, { counts = DEFAULT_COUNTS, markerType = "verse_group_marker" } = {}) {
  const { data, original } = await readChaya(bytes);
  const files = data.files, manifest = files["book.json"], skipped = new Set(manifest.skipped || []);
  const table = Object.fromEntries(counts.split(",").map(pair => pair.split("=")).map(([k, v]) => [k.trim(), Number(v)]));
  if (!files["types.json"].types.verse_group) files["types.json"] = revisedTypeList(files["types.json"], [{ kind: "add", name: "verse_group", region: "container", flow: "main",
    contains: ["verse", markerType], description: "Verses that make one sentence, printed with a marker after them: (युगलकम्) for two, (तिलकम्) for three, and so on." }]);
  const types = files["types.json"], validate = makeValidator(JSON.parse(readFileSync(new URL("../schema.json", import.meta.url), "utf8")));
  const report = { groups: [], splits: 0, problems: [] }, docs = [];
  for (const page of manifest.pages) {
    const path = files[`edits/${page.id}.json`] ? `edits/${page.id}.json` : `pages/${page.id}.json`, doc = files[path];
    if (!doc || skipped.has(page.id)) continue;
    docs.push(doc);
    if (!doc.page.regions.some(r => r.type === markerType || (r.lines || []).some(l => /\((युगलकम्|तिलकम्|युग्मम्|विशेषकम्|कलापकम्|कुलकम्)\)/.test(l.text || "")))) continue;
    const { made, problems } = groupVerses(doc, { counts: table, markerType });
    for (const m of made) if (m.split) report.splits++; else report.groups.push(`PDF ${page.pdf_page}: ${m.marker}, ${m.verses.length} verses`);
    for (const p of problems) report.problems.push(`PDF ${page.pdf_page}: ${p}`);
    if (made.length) doc.source.layers.units = { ...doc.source.layers.units, state: doc.source.layers.units?.state === "provisional" ? "model" : doc.source.layers.units?.state, made_by: "rule: verse-group markers (webapp/tools/chaya_verse_groups.mjs)" };
    const [errors] = checkPage(validate, doc, types);
    if (errors.length) report.problems.push(`PDF ${page.pdf_page}: ${errors[0]}`);
  }
  report.warnings = assemble(docs, types)[1].length;
  data.saved_at_utc = new Date().toISOString(); data.saved_by = "webapp/tools/chaya_verse_groups.mjs";
  return { bytes: report.problems.some(p => /: (\$|unit|region|relation)/.test(p)) ? null : await writeChaya(original, data), report };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  const [input, output, ...flags] = process.argv.slice(2), opt = Object.fromEntries(flags.map(flag => flag.replace(/^--/, "").split(/=(.*)/s).slice(0, 2)));
  if (!input || !output) { console.error("usage: node webapp/tools/chaya_verse_groups.mjs IN OUT [--marker-type=TYPE] [--counts=NAME=N,…]"); process.exit(2); }
  const { bytes, report } = await verseGroups(new Uint8Array(readFileSync(input)), { counts: opt.counts || DEFAULT_COUNTS, markerType: opt["marker-type"] || "verse_group_marker" });
  console.log(JSON.stringify(report, null, 1));
  if (bytes) { writeFileSync(output, bytes); console.log("wrote", output); } else { console.error("not written"); process.exit(1); }
}
