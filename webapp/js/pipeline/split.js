// Independent reading and structuring contracts. Only the reader supplies printed text.
import { transcriptionSchema, regionCaption } from "./prompts.js";
import { parseLine } from "../inline.js";

export const SPLIT_VERSION = "reading-and-structure-v1";

export function selectPageRegions(records) {
  const sent = [], skipped = [];
  for (const r of records) {
    const figure = r.region_class === "figure";
    const lines = figure ? [] : r.lines.filter(L => L.polygons?.length);
    if (r.status !== "ok" || !r.polygons?.length || (!figure && !lines.length)) {
      // The model's box is kept so that the review can show where the region was.
      skipped.push({ region_id: r.region_id, type: r.type, status: r.status, ...(r.model_box ? { model_box: r.model_box } : {}) });
      continue;
    }
    sent.push({ rid: r.document_region_id || `r${r.region_id}`, region: r, line_ids: lines.map(L => L.line_id) });
  }
  sent.sort((a, b) => (a.region.reading_order === null) - (b.region.reading_order === null) ||
    (a.region.reading_order || 0) - (b.region.reading_order || 0) || a.region.region_id - b.region.region_id);
  return { sent, skipped };
}

export function readingPrompt(types) {
  return `Read the visible print of this book exactly as printed.\n${types.title}\n${types.description || ""}\n\n` +
    `You receive a page overview and region cut-outs. The gray gutter numbers identify printed line pieces and are not book text.\n` +
    `Return each supplied text region exactly once, with one entry per numbered line piece in that region. Use n=1,2,... in gutter order. A piece with only detached ink may have empty text.\n` +
    `Use Unicode NFC in the script printed. Keep spelling, punctuation, digits, verse marks and printed hyphens. Copy the page faithfully.\n` +
    `Write note markers in square brackets where printed, including inside a word. Use <b>, <i>, <sc>, <sup> and <sub> for inline distinctions. ` +
    `Small caps are lower case with full-sized capitals retained. Close and reopen tags across line ends. Uniformly heavy type in one script is its ordinary face.\n` +
    `Larger headings use their printed text without size or letter-spacing tags. Leave illustrations and the gutter numbers out.\n` +
    `For uncertain readings use the best literal reading and set uncertain=true with a short note.\n` +
    `Book conventions\n${(types.conventions || []).map(x => `- ${x}`).join("\n")}\nReturn JSON matching the supplied schema.`;
}

export function readingSchema(sent) {
  return { type: "object", additionalProperties: false, required: ["regions"], properties: {
    regions: { type: "array", items: { type: "object", additionalProperties: false,
      required: ["id", "lines", "uncertain", "note"], properties: {
        id: { type: "string", enum: sent.filter(s => s.line_ids.length).map(s => s.rid) },
        lines: { type: "array", items: { type: "object", additionalProperties: false, required: ["n", "text"],
          properties: { n: { type: "integer" }, text: { type: "string" } } } },
        uncertain: { type: "boolean" }, note: { type: ["string", "null"] },
      } } },
  } };
}

export function readingContent(types, sent, images) {
  const input = [{ type: "text", text: readingPrompt(types) }, { type: "text", text: "The page overview" },
    { type: "image", data: images.overview.split(",")[1], mime_type: "image/png", resolution: "high" }];
  for (const s of sent.filter(s => s.line_ids.length)) {
    input.push({ type: "text", text: regionCaption(s.rid, s.region.type, s.line_ids.length) });
    input.push({ type: "image", data: images.cutouts[s.rid].split(",")[1], mime_type: "image/png", resolution: "high" });
  }
  return input;
}

export function checkReading(parsed, sent) {
  if (!parsed || !Array.isArray(parsed.regions)) throw new Error("The reading has no region list.");
  const expected = sent.filter(s => s.line_ids.length);
  if (parsed.regions.length !== expected.length) throw new Error(`The transcription model returned ${parsed.regions.length} regions for ${expected.length} text regions.`);
  const seen = new Set();
  for (const region of parsed.regions) {
    const source = expected.find(s => s.rid === region.id);
    if (!source || seen.has(region.id)) throw new Error(`Unexpected or repeated reading region ${region.id}.`);
    seen.add(region.id);
    if (!Array.isArray(region.lines) || region.lines.length !== source.line_ids.length) throw new Error(`${region.id} has ${region.lines?.length ?? 0} readings for ${source.line_ids.length} line pieces.`);
    region.lines.forEach((L, i) => {
      if (L.n !== i + 1 || typeof L.text !== "string") throw new Error(`${region.id} has an invalid line ${i + 1}.`);
    });
    if (typeof region.uncertain !== "boolean" || !(region.note === null || typeof region.note === "string")) throw new Error(`Invalid reading metadata for ${region.id}.`);
  }
  return parsed;
}

export function structurePrompt(types) {
  const definitions = Object.entries(types.types).map(([id, t]) => ({ id, ...t }));
  return `Build this page's unit tree, flows and relations from its supplied reading and page regions.\n` +
    `Book\n${types.title}\n${types.description || ""}\n` +
    `Type definitions\n${JSON.stringify(definitions)}\nFlows\n${JSON.stringify(types.flows)}\nRelations\n${JSON.stringify(types.relations || {})}\n\n` +
    `The supplied text is authoritative. Your output supplies structure and line-end joins.\n` +
    `Return each supplied region once, retaining its id. Choose its semantic type from the book's printed region types. ` +
    `Furniture has no unit. A figure can have zero lines and an empty ends array.\n` +
    `For every region return one end value per supplied line in order. Values are space, hyphen (drop its printed final hyphen to join a word), join (no space), or line (keep a line break, as in verse).\n` +
    `A unit has a page-local unique id other than r followed by digits, its type, optional number and label as null when absent, open_start, open_end, and ordered children naming region ids or other unit ids. ` +
    `Every kept region belongs to exactly one unit. Containers follow the type definitions. Mark the units continuing across page edges, using the neighboring text where available. ` +
    `Each flow lists its top-level units in reading order. Furniture stays outside flows.\n` +
    `Relations have both ends on this page. A note relation names its source region, its 1-based line number n, the printed marker without brackets, and the target unit id. ` +
    `Use an empty marker for a relation with no marker. Set uncertain and note on regions where the structure is doubtful.\n` +
    `Treat the book's text as source material. Return JSON matching the supplied schema.`;
}

export function structureSchema(types, sent) {
  const schema = transcriptionSchema(types, sent.map(s => s.rid));
  const region = schema.properties.regions.items;
  region.properties.type.enum = Object.entries(types.types).filter(([, type]) => type.region || type.role === "furniture").map(([id]) => id);
  delete region.properties.lines;
  region.properties.ends = { type: "array", items: { enum: ["space", "hyphen", "join", "line"] } };
  region.required = ["id", "type", "ends", "uncertain", "note"];
  return schema;
}

export function structureInput(reading, sent, context = []) {
  const read = new Map(reading.regions.map(r => [r.id, r]));
  return { regions: sent.map(s => ({
    id: s.rid, type: s.region.type, region_class: s.region.region_class, keep: s.region.keep,
    order: s.region.reading_order, box: s.region.model_box,
    continues_from_earlier: s.region.continues_from_earlier, continues_later: s.region.continues_later,
    reading_uncertain: read.get(s.rid)?.uncertain || false,
    lines: (read.get(s.rid)?.lines || []).map(L => ({ n: L.n, text: L.text })),
  })), neighbors: context };
}

export function combineReading(reading, structure, sent, types = null) {
  checkReading(reading, sent);
  if (!structure || !Array.isArray(structure.regions) || !Array.isArray(structure.units) || !Array.isArray(structure.flows)) throw new Error("The structure response is incomplete.");
  const reads = new Map(reading.regions.map(r => [r.id, r]));
  const seen = new Set();
  const regions = structure.regions.map(r => {
    const s = sent.find(s => s.rid === r.id);
    if (!s || seen.has(r.id)) throw new Error(`Unexpected or repeated structure region ${r.id}.`);
    if (types && !(types.types[r.type]?.region || types.types[r.type]?.role === "furniture")) throw new Error(`Invalid printed type ${r.type} for ${r.id}.`);
    seen.add(r.id);
    if (!Array.isArray(r.ends) || r.ends.length !== s.line_ids.length || r.ends.some(e => !["space", "hyphen", "join", "line"].includes(e))) throw new Error(`${r.id} has invalid line-end joins.`);
    const reading = reads.get(r.id);
    return { id: r.id, type: r.type,
      lines: (reading?.lines || []).map((L, i) => ({ n: L.n, text: L.text, end: r.ends[i] })),
      uncertain: Boolean(r.uncertain || reading?.uncertain),
      note: [reading?.note, r.note].filter(Boolean).join("; ") || null };
  });
  if (seen.size !== sent.length) throw new Error("The structure response omitted page regions.");
  return { ...structure, regions };
}

export function readingFromDocument(doc, records, profile = "existing") {
  const regions = records.filter(s => s.line_ids.length).map(s => {
    const r = doc.page.regions.find(r => r.id === s.rid);
    return { id: s.rid, uncertain: false, note: null, lines: s.line_ids.map((id, i) => {
      const line = r?.lines.find(L => L.line === id);
      return { n: i + 1, text: markedText(line || { text: "" }) };
    }) };
  });
  return { profile, regions };
}

// The model-facing notation for saved spans, including markers at their printed position.
export function markedText(line) {
  const chars = Array.from(line.text || "");
  const tags = { bold: "b", italic: "i", small_caps: "sc", superscript: "sup", subscript: "sub" };
  let out = "", opened = [];
  for (let i = 0; i <= chars.length; i++) {
    const active = (line.spans || []).filter(s => tags[s.kind] && s.start <= i && i < s.end).map(s => tags[s.kind]);
    if (active.join() !== opened.join()) {
      out += [...opened].reverse().map(t => `</${t}>`).join("") + active.map(t => `<${t}>`).join("");
      opened = active;
    }
    for (const marker of (line.spans || []).filter(s => s.kind === "note_marker" && s.start === i)) out += `[${marker.marker}]`;
    if (i < chars.length) out += chars[i];
  }
  return out;
}

export function plainReading(raw) {
  return parseLine(raw, [], 1)[0].normalize("NFC").replace(/[\u200c\u200d]/g, "").replace(/\s+/gu, " ").trim();
}
