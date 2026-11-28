import { canonical } from "../ops.js?v=20261128-join-sections";
import { checkReading, selectPageRegions } from "./split.js?v=20261128-join-sections";
import { transcribedLines } from "./steps.js?v=20261128-join-sections";

const printedLines = new Set(["verse", "heading", "table", "formula"]);
const prose = new Set(["paragraph", "note"]);
function lineEnd(line, kind, whole) {
  if (whole) return "line";
  if (prose.has(kind) && /[-‐]$/u.test(line.text || "")) return "hyphen";
  return "space";
}

function geometry(doc) {
  return canonical({ id: doc.page.id, image: doc.page.image_sha256, width: doc.page.width, height: doc.page.height,
    // A region with no ink (outlined by its box, nothing to read) takes no part in reading, as in a reading's own record.
    regions: doc.page.regions.filter(region => !(region.source?.no_ink && !(region.lines || []).some(line => line.polygons?.length)))
      .map(region => ({ id: region.id, polygons: region.polygons,
      lines: (region.lines || []).filter(line => line.polygons?.length).map(line => ({ line: line.line, polygons: line.polygons })) }))
      .sort((a, b) => a.id.localeCompare(b.id)) });
}

function sentRegions(doc) {
  return doc.page.regions.map(region => ({ rid: region.id,
    line_ids: (region.lines || []).filter(line => line.polygons?.length).map(line => line.line) }));
}

export function spreadLines(lines, n, { whole = false } = {}) {
  // Whole lines (verse): one to a piece in order, the last piece taking any lines left over; pieces left over stay empty.
  if (whole) return Array.from({ length: n }, (_, i) => i < n - 1 ? lines[i] ?? "" : lines.slice(n - 1).join(" "));
  const words = lines.join(" ").split(/\s+/).filter(Boolean);
  const total = words.reduce((sum, word) => sum + word.length + 1, 0), out = Array.from({ length: n }, () => []);
  let used = 0;
  for (const word of words) {
    const piece = Math.min(n - 1, Math.floor((used + word.length / 2) / (total / n)));   // by the word's middle
    out[piece].push(word);
    used += word.length + 1;
  }
  return out.map(piece => piece.join(" "));
}

export function applyReading(current, reading, types, storedTypes = {}) {
  const sent = sentRegions(current);
  const parsed = reading.parsed || reading;
  if (reading.regions_record) {
    const record = reading.regions_record;
    const original = selectPageRegions(record.regions).sent;
    const source = { page: { id: current.page.id, image_sha256: reading.image_sha256 || current.page.image_sha256,
      width: record.width, height: record.height, regions: original.map(({ rid, region, line_ids }) =>
        ({ id: rid, polygons: region.polygons, lines: region.lines.filter(line => line_ids.includes(line.line_id))
          .map(line => ({ line: line.line_id, polygons: line.polygons })) })) } };
    if (geometry(current) !== geometry(source)) throw new Error("The reading does not fit this scan’s saved regions.");
  }
  checkReading(parsed, sent);
  const doc = structuredClone(current);
  let marker = 1;
  for (const region of doc.page.regions) {
    let input = parsed.regions.find(value => value.id === region.id);
    if (!input) continue;
    const ids = sent.find(value => value.rid === region.id).line_ids;
    const kind = types.types[region.type]?.region;
    const whole = storedTypes[region.type]?.lines || printedLines.has(kind);
    if (input.kept) {
      // The reading gave this region another number of lines than the scan's line pieces. A region with no text yet takes
      // the reading's text, spread over its line pieces in order (to be checked); one with text keeps it.
      const empty = !(region.lines || []).some(line => typeof line.text === "string" && line.text.trim());
      if (!empty || !input.returned_lines?.length || !ids.length) {
        region.source = { ...region.source, transcription: { uncertain: true, note: input.note } };
        continue;
      }
      // A block whose printed lines are lines (a verse) keeps them whole, one to a piece; prose is spread evenly.
      input = { id: input.id, uncertain: true, note: `The reading's ${input.returned_lines.length} lines are spread over this area's ${ids.length} line pieces; check the line breaks.`,
        lines: spreadLines(input.returned_lines, ids.length, { whole }).map((text, i) => ({ n: i + 1, text })) };
    }
    const polygons = Object.fromEntries(region.lines.map(line => [line.line, line.polygons]));
    const output = transcribedLines(ids, polygons, input.lines, marker);
    marker = output.nextMarker;
    for (const line of output.lines) {
      const target = region.lines.find(value => value.line === line.line);
      target.text = line.text;
      delete target.spans;
      if (line.spans) target.spans = line.spans;
      // How the line ends (a verse's lines are lines, a paragraph's run on): by the block's type, as the reading takes it.
      const end = lineEnd(target, kind, whole);
      if (!target.end && end !== "space") target.end = end;
    }
    region.source = { ...region.source, transcription: { uncertain: input.uncertain, note: input.note } };
  }
  return doc;
}
