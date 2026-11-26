import { blockLineEnd } from "./blocks.js";
import { cpLength } from "./inline.js";
import { boxRing } from "./ops.js";
import { bbox } from "./render.js";
import { BLOCKS_VERSION } from "./blocks-format.js";

const byOrder = (a, b) => (a.order ?? Infinity) - (b.order ?? Infinity);
const hasPoints = polygons => polygons?.some(ring => ring.length);
const bounds = region => region.box ?? region.model_box ?? (hasPoints(region.polygons) ? bbox(region.polygons) : undefined);
const scale = ([width, height]) => [width, height, width, height];
const fractional = (box, size) => box.map((value, i) => Math.round(value / scale(size)[i] * 10000) / 10000);
const pixels = (box, size) => box.map((value, i) => Math.round(value * scale(size)[i]));

function referencedLines(doc) {
  const refs = new Set();
  for (const { from } of doc.overrides?.links || []) {
    if (from.region && from.line != null && from.region.startsWith(doc.page.id + "#"))
      refs.add(from.region.slice(doc.page.id.length + 1));
  }
  return refs;
}

function exportRegion(region, size, types, lineRefs) {
  const box = bounds(region);
  if (!box) throw new Error(`Region ${region.id} has no box or outline.`);
  const out = { id: region.id, type: region.type, box: fractional(box, size) };
  if (region.source?.continues_from_earlier) out.from_previous = true;
  if (region.source?.continues_later) out.continues = true;
  const lines = region.lines || [];
  if (!lines.length) return out;
  const marks = [], breaks = [], unread = [], ends = {}, defaultEnds = [];
  let offset = 0;
  const pieces = lines.map((line, index) => {
    const text = line.text ?? "";
    if (line.text == null) unread.push(index);
    for (const { kind, start, end, ...rest } of line.spans || []) {
      marks.push(kind === "note_marker"
        ? { kind, at: offset + start, ...rest }
        : { kind, start: offset + start, end: offset + end, ...rest });
    }
    if (line.end != null) {
      if (line.end === blockLineEnd(line, region, types)) defaultEnds.push(index);
      else ends[index] = line.end;
    }
    offset += cpLength(text);
    if (index + 1 < lines.length) breaks.push(offset);
    offset++;
    return text;
  });
  out.text = pieces.join("\n");
  if (pieces.some(piece => piece.includes("\n"))) out.line_breaks = breaks;
  const lineBoxes = lines.map(line => hasPoints(line.polygons) ? fractional(bbox(line.polygons), size) : null);
  if (lineBoxes.some(Boolean)) out.lines = lineBoxes;
  if (marks.length) out.marks = marks;
  if (Object.keys(ends).length) out.ends = ends;
  if (defaultEnds.length) out.default_ends = defaultEnds;
  if (unread.length) out.unread = unread;
  if (lineRefs.has(region.id) && lines.some((line, i) => line.line !== i + 1))
    out.line_ids = lines.map(line => line.line ?? null);
  return out;
}

export function toSimple(files) {
  const book = files["book.json"], types = files["types.json"];
  const out = { format: "chaya-simple", version: 0, book_id: book.book_id, title: book.title };
  if (book.pdf) out.pdf = { name: book.pdf.name, sha256: book.pdf.sha256 };
  out.types = structuredClone(types);
  if (book.rules != null) out.rules = structuredClone(book.rules);
  const skipped = new Set(book.skipped);
  out.pages = book.pages.map(page => {
    const doc = files[`edits/${page.id}.json`] ?? files[`pages/${page.id}.json`];
    const size = [doc?.page.width ?? page.width, doc?.page.height ?? page.height];
    if (!size.every(n => Number.isInteger(n) && n > 0)) throw new Error(`Page ${page.id} has no pixel dimensions.`);
    const entry = { id: page.id, pdf_page: page.pdf_page, size };
    const label = doc ? doc.page.label : page.label;
    if (label != null) entry.label = label;
    if (skipped.has(page.id)) return { ...entry, skip: true };
    if (!doc) return { ...entry, pending: true };
    const lineRefs = referencedLines(doc);
    entry.regions = [...doc.page.regions].sort(byOrder).map(region => exportRegion(region, size, types, lineRefs));
    for (const [key, leftOut] of [["omitted_regions", false], ["ignored_regions", true]]) {
      for (const area of doc.source?.[key] || []) {
        const box = bounds(area) ?? (area.block && bounds(area.block));
        if (!box) continue;
        entry.regions.push({ type: "?", box: fractional(box, size), ...(area.proposed_type ? { proposed: area.proposed_type } : {}),
          ...(leftOut ? { left_out: true } : {}) });
      }
    }
    if (Object.keys(doc.overrides || {}).length) entry.structure = structuredClone(doc.overrides);
    return entry;
  });
  return out;
}

function textPieces(block) {
  if (block.text == null) return [];
  if (!block.line_breaks) return block.text.split("\n");
  const text = Array.from(block.text), pieces = [];
  let start = 0;
  for (const at of block.line_breaks) {
    pieces.push(text.slice(start, at).join(""));
    start = at + 1;
  }
  pieces.push(text.slice(start).join(""));
  return pieces;
}

function importLines(block, region, types, size) {
  const ends = new Set(block.default_ends), unread = new Set(block.unread);
  let offset = 0;
  return textPieces(block).map((text, index) => {
    const end = offset + cpLength(text), line = {};
    const id = block.line_ids ? block.line_ids[index] : index + 1;
    if (id != null) line.line = id;
    if (block.lines?.[index]) line.polygons = [boxRing(pixels(block.lines[index], size))];
    if (!unread.has(index)) line.text = text;
    if (Object.hasOwn(block.ends || {}, index)) line.end = block.ends[index];
    else if (ends.has(index)) line.end = blockLineEnd(line, region, types);
    for (const mark of block.marks || []) {
      if (mark.kind === "note_marker") {
        const { at, ...rest } = mark;
        if (at >= offset && at <= end) (line.spans ||= []).push({ ...rest, start: at - offset, end: at - offset });
      } else {
        const { start, end: stop, ...rest } = mark;
        if (start === stop ? start >= offset && start <= end : start < end && stop > offset)
          (line.spans ||= []).push({ ...rest, start: Math.max(start, offset) - offset, end: Math.min(stop, end) - offset });
      }
    }
    offset = end + 1;
    return line;
  });
}

export function fromSimple(simple) {
  if (simple.format !== "chaya-simple" || simple.version !== 0) throw new Error("Expected a version 0 chaya-simple book.");
  const types = structuredClone(simple.types);
  const manifest = { format: "book-folder", version: 1, book_id: simple.book_id, title: simple.title, types: "types.json", pages: [], skipped: [] };
  if (simple.pdf) manifest.pdf = structuredClone(simple.pdf);
  if (simple.rules != null) manifest.rules = structuredClone(simple.rules);
  const files = { "book.json": manifest, "types.json": types };
  for (const page of simple.pages) {
    const { id, pdf_page, label, size } = page, [width, height] = size;
    const document = `pages/${id}.json`, image = `images/${id}.png`;
    const labelled = label == null ? {} : { label };
    manifest.pages.push({ id, pdf_page, width, height, ...labelled, document });
    if (page.skip) { manifest.skipped.push(id); continue; }
    if (page.pending) continue;
    const regions = [], source = {};
    let order = 0, areas = 0;
    for (const block of page.regions) {
      const box = pixels(block.box, size);
      if (block.type === "?") {
        const list = block.left_out ? "ignored_regions" : "omitted_regions";
        (source[list] ||= []).push({ region: `area${++areas}`, box, ...(block.proposed ? { proposed_type: block.proposed } : {}) });
        continue;
      }
      const region = { id: block.id, type: block.type, box, polygons: [boxRing(box)],
        order: types.types[block.type]?.role === "furniture" ? null : ++order };
      region.lines = importLines(block, region, types, size);
      if (block.from_previous || block.continues) region.source = {
        ...(block.from_previous ? { continues_from_earlier: true } : {}),
        ...(block.continues ? { continues_later: true } : {}),
      };
      regions.push(region);
    }
    files[document] = { format: "page", schema_version: BLOCKS_VERSION, book_id: manifest.book_id,
      page: { id, image, width, height, ...labelled, regions }, overrides: structuredClone(page.structure ?? {}),
      ...(Object.keys(source).length ? { source } : {}) };
  }
  return files;
}
