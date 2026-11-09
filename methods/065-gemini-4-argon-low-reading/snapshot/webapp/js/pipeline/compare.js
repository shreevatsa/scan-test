import { plainReading } from "./split.js";
import { parseLine } from "../inline.js";

export function characterEdits(a, b) {
  const left = Array.from(a), right = Array.from(b);
  let previous = right.map((_, i) => i + 1);
  previous.unshift(0);
  for (let i = 0; i < left.length; i++) {
    const row = [i + 1];
    for (let j = 0; j < right.length; j++) row.push(Math.min(row[j] + 1, previous[j + 1] + 1, previous[j] + (left[i] === right[j] ? 0 : 1)));
    previous = row;
  }
  return previous[right.length];
}

export function readingLines(reading, sent, types) {
  const regions = new Map(reading.regions.map(r => [r.id, r]));
  const out = [];
  for (const s of sent) {
    if (types.types[s.region.type]?.role === "furniture") continue;
    let open = [];
    for (const [i, id] of s.line_ids.entries()) {
      const raw = regions.get(s.rid)?.lines[i]?.text || "";
      const [text, spans, next] = parseLine(raw, open, 1);
      open = next;
      out.push({ key: `${s.rid}:${id}`, region: s.rid, line: id, n: i + 1, raw, text: plainReading(text),
        formatting: spans.map(({ id, ...rest }) => rest), polygons: s.region.lines.find(L => L.line_id === id)?.polygons || [] });
    }
  }
  return out;
}

export function compareReadings(candidate, reference, sent, types, checked = {}) {
  const a = new Map(readingLines(candidate, sent, types).map(L => [L.key, L]));
  const b = readingLines(reference, sent, types);
  let characters = 0, edits = 0, missing = 0, formatting = 0, checkedCharacters = 0, checkedEdits = 0, checkedLines = 0;
  const rows = b.map(expected => {
    const actual = a.get(expected.key) || { raw: "", text: "", formatting: [] };
    const count = characterEdits(actual.text, expected.text);
    const formatDiffers = JSON.stringify(actual.formatting) !== JSON.stringify(expected.formatting);
    characters += Array.from(expected.text).length;
    edits += count;
    missing += !actual.text && Boolean(expected.text);
    formatting += Number(formatDiffers);
    const reviewed = checked[expected.key];
    if (reviewed?.checked) {
      checkedLines++;
      checkedCharacters += Array.from(plainReading(reviewed.text)).length;
      checkedEdits += characterEdits(actual.text, plainReading(reviewed.text));
    }
    return { ...expected, candidate: actual.raw, reference: expected.raw, edits: count, format_differs: formatDiffers };
  });
  return { characters, edits, differences_per_1000: characters ? edits / characters * 1000 : null,
    missing_lines: missing, formatting_differences: formatting, checked_characters: checkedCharacters,
    checked_edits: checkedEdits, checked_lines: checkedLines,
    checked_errors_per_1000: checkedCharacters ? checkedEdits / checkedCharacters * 1000 : null, rows };
}
