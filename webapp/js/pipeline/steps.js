// The steps of making a page document from a page image, as methods 042, 043 and 055 do them, without the DOM:
// the region call's request and the scaling of its boxes (042), the region records the local step gives (043), the
// transcription call's request (055), and the page document built from its answer (055's pagedoc.py).

import { regionClasses, regionTypeEnum, regionCaption } from "./prompts.js?v=20261127-export-work";
import { parseLine } from "../inline.js?v=20261127-export-work";

export const SETTINGS = {
  regions: { model: "gpt-6.1-terra", reasoning_effort: "none", image_detail: "original", max_output_tokens: 16384, store: false },
  transcription: { model: "gemini-4-argon", thinking_level: "low", image_resolution: "high", max_output_tokens: 32768,
                   cutout_padding_char: 0.5, gutter_width_char: 1.6, gutter_min_px: 36, gutter_font_char: 0.55, gutter_font_min_px: 14,
                   overview_label_char: 0.8, overview_label_min_px: 18, overview_outline_px: 3, context_lines: 2 },
};

export const ENDPOINTS = { openai: "https://api.openai.com/v1/responses", gemini: "https://generativelanguage.googleapis.com/v1beta/interactions",
  vision: "https://vision.googleapis.com/v1/images:annotate" };

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
      ...(src.proposed_type ? { proposed_type: src.proposed_type } : {}),
    };
  });
}

// ---------------------------------------------------------------- method 055: the transcription call

export const linePieces = region => region.lines.filter(L => L.polygons && L.polygons.length).map(L => {
  const ys = L.polygons.flat().map(p => p[1]);
  return [L.line_id, Math.min(...ys), Math.max(...ys)];
});

// Regions to transcribe, in reading order, then the unordered ones by id (055's select_regions).
const DIGITS = Object.fromEntries([..."०१२३४५६७८९"].map((d, i) => [d, String(i)]).concat([..."೦೧೨೩೪೫೬೭೮೯"].map((d, i) => [d, String(i)])));

export function pageLabel(regions) {
  for (const r of regions) {
    if (r.type !== "page_number") continue;
    const digits = [...(r.lines || []).map(L => L.text || "").join("")].map(c => DIGITS[c] ?? c).join("").replace(/\D/g, "");
    if (digits) return digits;
  }
  return null;
}

// Parse a region's marked lines, continuing formatting and numbering page-wide note markers.
export function transcribedLines(lineIds, polygons, lines, firstMarker = 1) {
  let open = [], nextMarker = firstMarker;
  const records = lineIds.map((id, index) => {
    const line = lines[index];
    const [text, spans, stillOpen, next] = parseLine(line.text, open, nextMarker);
    open = stillOpen; nextMarker = next;
    const record = { line: id, polygons: polygons[id], text };
    if (spans.length) record.spans = spans;
    if (line.end !== undefined && line.end !== "space") record.end = line.end;
    return record;
  });
  return { lines: records, nextMarker };
}

// Cost estimates from the returned usage, at the methods' prices (pricing.json files).
export function openaiCost(usage, pricing, serviceTier = null) {
  if (!usage) return null;
  const incoming = usage.input_tokens, outgoing = usage.output_tokens;
  const cached = usage.input_tokens_details?.cached_tokens ?? 0;
  const written = usage.input_tokens_details?.cache_write_tokens ?? 0;
  const reasoning = usage.output_tokens_details?.reasoning_tokens;
  if (![incoming, outgoing, cached, written].every(value => Number.isSafeInteger(value) && value >= 0) ||
      cached + written > incoming || usage.total_tokens !== incoming + outgoing || incoming > 272000 ||
      ![null, "default", "standard"].includes(serviceTier) ||
      reasoning != null && (!Number.isSafeInteger(reasoning) || reasoning < 0 || reasoning > outgoing)) return null;
  const input = (incoming - cached - written) * pricing.input_per_million_usd + cached * pricing.cached_input_per_million_usd;
  const write = written ? written * pricing.cache_write_30m_per_million_usd : 0;
  const total = (input + write + outgoing * pricing.output_per_million_usd) / 1e6;
  return Number.isFinite(total) && total >= 0 ? total : null;
}

export function geminiCost(usage, pricing) {
  if (!usage || typeof usage.total_input_tokens !== "number") return null;
  const cached = usage.total_cached_tokens || 0, out = (usage.total_output_tokens || 0) + (usage.total_thought_tokens || 0);
  return ((usage.total_input_tokens - cached) * pricing.input_per_million_usd + cached * pricing.cached_input_per_million_usd + out * pricing.output_per_million_usd) / 1e6;
}
