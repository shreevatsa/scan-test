// The steps of making a page document from a page image, as methods 042, 043 and 055 do them, without the DOM:
// the region call's request and the scaling of its boxes (042), the region records the local step gives (043), the
// transcription call's request (055), and the page document built from its answer (055's pagedoc.py).

import { regionClasses, regionTypeEnum, regionCaption } from "./prompts.js";
import { parseLine } from "../inline.js";

export const SETTINGS = {
  regions: { model: "gpt-6.1-terra", reasoning_effort: "none", image_detail: "original", max_output_tokens: 16384, store: false },
  transcription: { model: "gemini-4-argon", thinking_level: "low", image_resolution: "high", max_output_tokens: 32768,
                   cutout_padding_char: 0.5, gutter_width_char: 1.6, gutter_min_px: 36, gutter_font_char: 0.55, gutter_font_min_px: 14,
                   overview_label_char: 0.8, overview_label_min_px: 18, overview_outline_px: 3, context_lines: 2 },
};

export const ENDPOINTS = { openai: "https://api.openai.com/v1/responses", gemini: "https://generativelanguage.googleapis.com/v1beta/interactions" };

// ---------------------------------------------------------------- method 042: the region call

export function regionRequest(prompt, schema, imageDataUrl) {
  const c = SETTINGS.regions;
  return {
    model: c.model,
    input: [{ role: "user", content: [{ type: "input_text", text: prompt }, { type: "input_image", image_url: imageDataUrl, detail: c.image_detail }] }],
    reasoning: { effort: c.reasoning_effort },
    text: { format: { type: "json_schema", name: "page_regions", strict: true, schema } },
    max_output_tokens: c.max_output_tokens,
    store: c.store,
  };
}

export function openaiText(response) {
  return (response.output || []).filter(o => o.type === "message").flatMap(o => o.content || []).filter(c => c.type === "output_text").map(c => c.text).join("");
}

export function geminiText(response) {
  let text = (response.steps || []).filter(s => s.type === "model_output").flatMap(s => s.content || []).filter(c => c.type === "text").map(c => c.text).join("");
  return text || (response.outputs || []).filter(o => o.type === "text").map(o => o.text).join("");
}

// The region call's boxes in pixels, with its checks (method 042's regions.validate_and_scale, xyxy_1000).
export function scaleRegions(parsed, W, H, tl) {
  const classes = regionClasses(tl), allowed = new Set(regionTypeEnum(tl));
  const furniture = new Set(Object.entries(tl.types).filter(([, t]) => t.role === "furniture").map(([n]) => n));
  const required = ["type", "box_1000", "keep", "reading_order", "uncertain", "continues_from_earlier", "continues_later"];
  if (!parsed || typeof parsed !== "object" || Object.keys(parsed).join() !== "regions" || !Array.isArray(parsed.regions)) throw new Error("Expected an object containing a regions array.");
  const regions = [], warnings = [];
  parsed.regions.forEach((r, i) => {
    const index = i + 1;
    if (!r || Object.keys(r).sort().join() !== [...required].sort().join() || !allowed.has(r.type)) throw new Error(`Invalid fields or type at region ${index}`);
    const b = r.box_1000;
    if (!Array.isArray(b) || b.length !== 4 || b.some(v => !Number.isInteger(v) || v < 0 || v > 1000)) throw new Error(`Expected integer coordinates in 0..1000 at region ${index}`);
    const box = [b[0] * W / 1000, b[1] * H / 1000, b[2] * W / 1000, b[3] * H / 1000];
    if (box[0] >= box[2] || box[1] >= box[3]) throw new Error(`Nonpositive rectangle at region ${index}`);
    if (["keep", "uncertain", "continues_from_earlier", "continues_later"].some(k => typeof r[k] !== "boolean")) throw new Error(`Invalid boolean flags at region ${index}`);
    if (r.reading_order !== null && !(Number.isInteger(r.reading_order) && r.reading_order >= 1)) throw new Error(`Invalid reading order at region ${index}`);
    if (r.keep && r.reading_order === null) warnings.push(`Kept region ${index} has no reading order.`);
    if (furniture.has(r.type) && r.keep) warnings.push(`Furniture region ${index} is marked keep=true.`);
    regions.push({ ...r, region_id: index, region_class: classes[r.type], box });
  });
  return { regions, warnings };
}

// ---------------------------------------------------------------- method 043: region records

// Region records as method 043's regions.json has them, from the region call's regions and the local step's geometry.
export function regionRecords(regions, geometry) {
  return regions.map((src, i) => {
    const g = geometry[i];
    let bounds = null;
    if (g.rings.length) {
      const pts = g.rings.flat();
      bounds = [Math.min(...pts.map(p => p[0])), Math.min(...pts.map(p => p[1])), Math.max(...pts.map(p => p[0])) + 1, Math.max(...pts.map(p => p[1])) + 1];
    }
    return {
      region_id: src.region_id, type: src.type, keep: src.keep, reading_order: src.reading_order, uncertain: src.uncertain,
      continues_from_earlier: src.continues_from_earlier, continues_later: src.continues_later, region_class: src.region_class,
      model_box: src.box, status: g.rings.length ? "ok" : "no_ink", polygons: g.rings, bounds,
      lines: g.lines.map(L => ({ line_id: L.line_id, ink_pixels: L.ink_pixels, polygons: L.rings,
        ...(L.previous_line_ids ? { previous_line_ids: L.previous_line_ids } : {}) })),
    };
  });
}

// ---------------------------------------------------------------- method 055: the transcription call

export const linePieces = region => region.lines.filter(L => L.polygons && L.polygons.length).map(L => {
  const ys = L.polygons.flat().map(p => p[1]);
  return [L.line_id, Math.min(...ys), Math.max(...ys)];
});

// Regions to transcribe, in reading order, then the unordered ones by id (055's select_regions).
export function selectRegions(records) {
  const sent = [], skipped = [];
  for (const r of records) {
    const pieces = linePieces(r);
    if (r.status !== "ok" || !r.polygons.length || !pieces.length) { skipped.push({ region_id: r.region_id, type: r.type, status: r.status }); continue; }
    sent.push({ rid: `r${r.region_id}`, region: r, line_ids: pieces.map(p => p[0]) });
  }
  sent.sort((a, b) => (a.region.reading_order === null) - (b.region.reading_order === null) || (a.region.reading_order || 0) - (b.region.reading_order || 0) || a.region.region_id - b.region.region_id);
  return { sent, skipped };
}

// The last (which "last") or first text region of each stream, main text and notes (055's edge_regions).
export function edgeRegions(records, tl, which) {
  const furniture = new Set(Object.entries(tl.types).filter(([, t]) => t.role === "furniture").map(([n]) => n));
  const cand = records.filter(r => r.status === "ok" && r.polygons.length && r.reading_order !== null && !furniture.has(r.type) && r.type !== "other" && linePieces(r).length);
  const out = {};
  for (const stream of ["main", "notes"]) {
    const rs = cand.filter(r => (r.region_class === "note") === (stream === "notes"));
    if (rs.length) out[stream] = rs.reduce((a, b) => (which === "last" ? (b.reading_order > a.reading_order ? b : a) : (b.reading_order < a.reading_order ? b : a)));
  }
  return out;
}

// The request's content, in method 055's order. images: {overview, cutouts: {rid: dataUrl}, context: [{side, stream, type, dataUrl}],
// missing: {previous: text, next: text}}.
export function transcriptionContent(prompt, sent, images) {
  const content = [{ type: "input_text", text: prompt }, { type: "input_text", text: "The whole page, with the regions outlined:" },
    { type: "input_image", image_url: images.overview }];
  for (const s of sent) {
    content.push({ type: "input_text", text: regionCaption(s.rid, s.region.type, s.line_ids.length) });
    content.push({ type: "input_image", image_url: images.cutouts[s.rid] });
  }
  content.push({ type: "input_text", text: "Context from the neighboring pages, not part of this page:" });
  for (const side of ["previous", "next"]) {
    const items = images.context.filter(c => c.side === side);
    if (images.missing[side]) content.push({ type: "input_text", text: images.missing[side] });
    for (const c of items) {
      const what = side === "previous" ? "end" : "start";
      content.push({ type: "input_text", text: `The ${what} of the ${side} page's ${c.stream === "main" ? "main text" : "notes"} (from a ${c.type} region):` });
      content.push({ type: "input_image", image_url: c.dataUrl });
    }
  }
  return content;
}

export function geminiRequest(content, schema) {
  const c = SETTINGS.transcription;
  const input = content.map(x => (x.type === "input_text" ? { type: "text", text: x.text }
    : { type: "image", data: x.image_url.split(",", 2)[1], mime_type: "image/png", resolution: c.image_resolution }));
  return { model: c.model, input,
    generation_config: { thinking_level: c.thinking_level, thinking_summaries: "none", max_output_tokens: c.max_output_tokens },
    response_format: { type: "text", mime_type: "application/json", schema }, service_tier: "standard", store: false };
}

// ---------------------------------------------------------------- method 055: the page document (pagedoc.build)

const DIGITS = Object.fromEntries([..."०१२३४५६७८९"].map((d, i) => [d, String(i)]).concat([..."೦೧೨೩೪೫೬೭೮೯"].map((d, i) => [d, String(i)])));

function pageLabel(regions) {
  for (const r of regions) {
    if (r.type !== "page_number") continue;
    const digits = [...(r.lines || []).map(L => L.text || "").join("")].map(c => DIGITS[c] ?? c).join("").replace(/\D/g, "");
    if (digits) return digits;
  }
  return null;
}

// sent: selectRegions(...).sent; parsed: the model's answer with regions as a list (method 052's schema).
export function buildPageDocument(pid, page, tl, sent, parsed, source) {
  const problems = [], regions = [], omitted = [];
  let nextMarker = 1;
  const returned = {};
  for (const r of parsed.regions || []) if (!(r.id in returned)) { const { id, ...rest } = r; returned[id] = rest; }
  const listed = (parsed.regions || []).map(r => r.id);
  const repeated = [...new Set(listed.filter((x, i) => listed.indexOf(x) !== i))].sort();
  const keptIds = new Set(), lineIds = {};
  for (const s of sent) {
    const { rid, region: src } = s;
    const o = returned[rid];
    if (!o) { problems.push(`${rid}: not returned`); continue; }
    const lines = o.lines;
    const aligned = lines.length === s.line_ids.length;
    if (!aligned) problems.push(`${rid}: ${lines.length} lines returned for ${s.line_ids.length} line pieces; no line text kept`);
    else if (lines.map(L => L.n).join() !== lines.map((_, i) => i + 1).join()) problems.push(`${rid}: line numbers [${lines.map(L => L.n).join(", ")}]; text kept by position`);
    if (!(o.type in tl.types)) { omitted.push({ region: rid, type: o.type, text: lines.map(L => L.text) }); continue; }
    const polys = Object.fromEntries(src.lines.filter(L => L.polygons && L.polygons.length).map(L => [L.line_id, L.polygons]));
    let open = [];
    const recs = s.line_ids.map((lid, k) => {
      const rec = { line: lid, polygons: polys[lid] };
      if (aligned) {
        const [plain, spans, still, nm] = parseLine(lines[k].text, open, nextMarker);
        open = still; nextMarker = nm;
        rec.text = plain;
        if (spans.length) rec.spans = spans;
        if (lines[k].end !== "space") rec.end = lines[k].end;
      }
      return rec;
    });
    const info = { method: source.regions_method, region_id: src.region_id, method_type: src.type, region_class: src.region_class, keep: src.keep,
      uncertain: src.uncertain, continues_from_earlier: src.continues_from_earlier, continues_later: src.continues_later, model_box: src.model_box,
      transcription: { uncertain: o.uncertain, note: o.note } };
    if (o.type !== src.type) info.retyped_from = src.type;
    if (!aligned) info.transcription.lines = lines;
    regions.push({ id: rid, type: o.type, polygons: src.polygons, box: src.model_box.map(Math.round), lines: recs, order: src.reading_order, source: info });
    keptIds.add(rid);
    lineIds[rid] = s.line_ids;
  }
  const omittedIds = new Set(omitted.map(o => o.region));
  const units = [];
  for (const u of parsed.units || []) {
    const children = [];
    for (const c of u.children) {
      if (omittedIds.has(c)) problems.push(`unit ${u.id}: child ${c} is of type other and left out`);
      else if (keptIds.has(c) || /^r\d+$/.test(c)) children.push({ region: `${pid}#${c}` });
      else children.push({ unit: c });
    }
    const d = { id: u.id, type: u.type };
    if (u.number !== null) d.number = u.number;
    if (u.label !== null) d.label = u.label;
    if (u.open_start || u.open_end) { d.open = {}; if (u.open_start) d.open.start = true; if (u.open_end) d.open.end = true; }
    d.children = children;
    units.push(d);
  }
  const flows = {};
  for (const f of parsed.flows || []) (flows[f.flow] ||= []).push(...f.units);
  const relations = [];
  const texts = Object.fromEntries(regions.map(r => [r.id, r.lines]));
  for (const rel of parsed.relations || []) {
    const frm = { region: `${pid}#${rel.region}` };
    const n = rel.line;
    if (rel.region in lineIds && n >= 1 && n <= lineIds[rel.region].length) {
      const piece = texts[rel.region][n - 1];
      frm.line = piece.line;
      const want = (rel.marker || "").replace(/^[\[\] ]+|[\[\] ]+$/g, "");
      const markers = (piece.spans || []).filter(sp => sp.kind === "note_marker");
      // As method 055, by the marker's sign; and, where the model gave no sign, the line's only marker.
      const hit = want ? markers.filter(sp => sp.marker === want) : (markers.length === 1 ? markers : []);
      if (hit.length) frm.anchor = `${pid}#${hit[0].id}`;
      else if (rel.marker) problems.push(`relation to ${rel.to}: marker [${rel.marker}] not in ${rel.region} line ${n}`);
    } else problems.push(`relation to ${rel.to}: no line ${n} in ${rel.region}`);
    if (rel.marker) frm.marker = rel.marker;
    relations.push({ type: rel.type, from: frm, to: { unit: rel.to } });
  }
  if (repeated.length) problems.push(`regions listed more than once (first entry kept): [${repeated.join(", ")}]`);
  const pg = { id: pid, image: page.image, image_sha256: page.image_sha256, width: page.width, height: page.height };
  const label = pageLabel(regions);
  if (label) pg.label = label;
  pg.regions = regions;
  const doc = { format: "page", schema_version: "0.2", book_id: tl.book_id, page: pg, units, flows, relations, source: { ...source, omitted_regions: omitted, problems } };
  return [doc, problems];
}

// Cost estimates from the returned usage, at the methods' prices (pricing.json files).
export function openaiCost(usage, pricing) {
  if (!usage) return null;
  const cached = usage.input_tokens_details?.cached_tokens || 0;
  return ((usage.input_tokens - cached) * pricing.input_per_million_usd + cached * pricing.cached_input_per_million_usd + usage.output_tokens * pricing.output_per_million_usd) / 1e6;
}

export function geminiCost(usage, pricing) {
  if (!usage || typeof usage.total_input_tokens !== "number") return null;
  const cached = usage.total_cached_tokens || 0, out = (usage.total_output_tokens || 0) + (usage.total_thought_tokens || 0);
  return ((usage.total_input_tokens - cached) * pricing.input_per_million_usd + cached * pricing.cached_input_per_million_usd + out * pricing.output_per_million_usd) / 1e6;
}
