// Reading requests and response checks.
import { regionCaption } from "./prompts.js?v=20261126-type-suggestion";
import { parseLine } from "../inline.js?v=20261126-type-suggestion";

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

// ---- Method 100: the whole page in one image, its regions listed in the prompt (webapp/README.md, "Reading a page").

export const UNFIT_NOTE = "the reading of this area did not fit its lines";

// The page's text regions in reading order: id, type, number of line pieces and box in thousandths of the page,
// as [ymin, xmin, ymax, xmax]. `record` is the page's regions record; `sent` is selectPageRegions(...).sent.
export function wholePageList(record, sent) {
  const W = record.width, H = record.height, box = s => s.region.model_box || s.region.bounds;
  // Ordered regions by their order, then the unordered by their top edge (as method 100 listed them).
  const key = s => s.region.reading_order ?? 1e6 + box(s)[1];
  return sent.filter(s => s.line_ids.length).sort((a, b) => key(a) - key(b) || box(a)[1] - box(b)[1]).map(s => {
    const b = box(s);
    return { id: s.rid, type: s.region.type, lines: s.line_ids.length,
      box: [b[1] / H, b[0] / W, b[3] / H, b[2] / W].map(v => Math.round(v * 1000)) };
  });
}

export function wholePagePrompt(types, list) {
  const conventions = (types.conventions || []).length ? `Book conventions\n${types.conventions.map(x => `- ${x}`).join("\n")}\n` : "";
  return `This is one page of a printed book: ${types.title}. ${types.description || ""}
Read the visible print exactly as printed. The page has these regions, listed in reading order, each with its id, its kind, how many printed lines it has, and its box as [ymin, xmin, ymax, xmax] in thousandths of the page:
${list.map(r => `- ${r.id}: ${r.type}, ${r.lines} line${r.lines === 1 ? "" : "s"}, box [${r.box.join(", ")}]`).join("\n")}
For every region, return its printed lines in order, exactly as many as listed, one string per printed line, holding only that region's text.
Use Unicode NFC in the script printed. Keep spelling, punctuation, digits, dandas and verse numbers exactly as printed; do not correct the text.
Footnote markers: in the text, a small raised numeral or sign is printed over or just after a word to point to a footnote. Write each such marker in square brackets where it is printed, for example तीर[१]स्य or धन्यतावहम्[३]. Do not put a footnote's own number, at the start of the footnote, in brackets.
${conventions}Return JSON matching the schema.`;
}

export function wholePageSchema(list) {
  return { type: "object", additionalProperties: false, required: ["regions"], properties: {
    regions: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "lines"], properties: {
      id: { type: "string", enum: list.map(r => r.id) }, lines: { type: "array", items: { type: "string" } } } } } } };
}

export function wholePageContent(prompt, imageBase64, mimeType = "image/png") {
  return [{ type: "text", text: prompt }, { type: "image", data: imageBase64, mime_type: mimeType, resolution: "high" }];
}

// The answer in the shape the rest of the app reads (checkReading's): every listed region once, with its lines as
// {n, text}. A region the answer lacks, or answers with another number of lines than it has line pieces, is `kept`: it
// holds the page's current text (currentLines: id → marked lines), is flagged, and mergeText leaves its lines alone.
// An answer that is not the expected object, names an unlisted or repeated region, or fits no region at all is invalid.
export function checkWholePage(parsed, list, currentLines = {}) {
  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.regions)) throw new Error("The reading has no region list.");
  const given = new Map(), listed = new Set(list.map(r => r.id));
  for (const region of parsed.regions) {
    if (!region || !listed.has(region.id) || given.has(region.id)) throw new Error(`Unexpected or repeated reading region ${region?.id}.`);
    if (!Array.isArray(region.lines) || region.lines.some(line => typeof line !== "string")) throw new Error(`${region.id} has no list of lines.`);
    given.set(region.id, region.lines);
  }
  let fitted = 0;
  const regions = list.map(r => {
    const lines = given.get(r.id);
    if (lines && lines.length === r.lines) {
      fitted++;
      return { id: r.id, uncertain: false, note: null, lines: lines.map((text, i) => ({ n: i + 1, text })) };
    }
    const old = currentLines[r.id] || [];
    return { id: r.id, kept: true, returned_lines: lines || null, uncertain: true, note: UNFIT_NOTE,
      lines: Array.from({ length: r.lines }, (_, i) => ({ n: i + 1, text: old[i] ?? "" })) };
  });
  if (!fitted) throw new Error("The reading fits none of the page's regions.");
  return { regions };
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

export function plainReading(raw) {
  return parseLine(raw, [], 1)[0].normalize("NFC").replace(/[\u200c\u200d]/g, "").replace(/\s+/gu, " ").trim();
}
