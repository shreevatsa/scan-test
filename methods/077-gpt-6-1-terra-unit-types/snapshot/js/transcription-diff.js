// Display differences without separating vowel signs or Indic consonant conjuncts.
import { parseLine } from "./inline.js";
import { esc, lineHtml } from "./render.js";

const SEGMENTER = typeof Intl.Segmenter === "function" ? new Intl.Segmenter(undefined, { granularity: "grapheme" }) : null;
// Unicode 18.0 Indic_Syllabic_Category values Virama and Invisible_Stacker.
// https://www.unicode.org/Public/18.0.0/ucd/IndicSyllabicCategory.txt
const VIRAMAS = new Set([
  0x094d, 0x09cd, 0x0a4d, 0x0acd, 0x0b4d, 0x0bcd, 0x0c4d, 0x0ccd, 0x0d4d, 0x0dca,
  0x1b44, 0xa806, 0xa8c4, 0xa9c0, 0x11046, 0x110b9, 0x111c0, 0x11235, 0x1134d,
  0x11442, 0x114c2, 0x115bf, 0x1163f, 0x116b6, 0x11839, 0x119e0, 0x11c3f,
  0x1039, 0x17d2, 0x1a60, 0x1bab, 0xaaf6, 0x10a3f, 0x11133, 0x113d0, 0x1193e,
  0x11a47, 0x11a99, 0x11d45, 0x11d97, 0x11f42,
]);

function endsInVirama(text) {
  for (const character of Array.from(text).reverse()) {
    if (VIRAMAS.has(character.codePointAt(0))) return true;
    if (!/[\p{Mark}\u200c\u200d]/u.test(character)) return false;
  }
  return false;
}

export function graphemes(text, segmenter = SEGMENTER) {
  if (!text) return [];
  // A whole-line highlight preserves clusters on browsers without segmentation support.
  if (!segmenter) return [text];
  const clusters = [];
  for (const { segment } of segmenter.segment(text)) {
    if (clusters.length && /^\p{Letter}/u.test(segment) && endsInVirama(clusters.at(-1))) clusters[clusters.length - 1] += segment;
    else clusters.push(segment);
  }
  return clusters;
}

function lineTokens(lines) {
  let open = [];
  return lines.map(raw => {
    const [text, spans, next] = parseLine(raw, open, 1);
    open = next;
    let start = 0;
    const tokens = graphemes(text).map(cluster => {
      const end = start + Array.from(cluster).length;
      const kinds = [...new Set(spans.filter(span => span.kind !== "note_marker" && span.start < end && span.end > start).map(span => span.kind))].sort();
      const token = { text: cluster, key: `text:${cluster.normalize("NFC")}`, kinds, start, note: false };
      start = end;
      return token;
    });
    for (const marker of spans.filter(span => span.kind === "note_marker")) {
      const index = tokens.findIndex(token => !token.note && token.start >= marker.start);
      const token = { text: `[${marker.marker}]`, key: `note:${marker.marker.normalize("NFC")}`, kinds: [], note: true };
      tokens.splice(index < 0 ? tokens.length : index, 0, token);
    }
    return tokens;
  });
}

function matched(reference, candidate) {
  return { ...candidate, kind: reference.kinds.join() === candidate.kinds.join() ? "same" : "format" };
}

function align(reference, candidate) {
  let prefix = 0, suffix = 0;
  while (prefix < reference.length && prefix < candidate.length && reference[prefix].key === candidate[prefix].key) prefix++;
  while (suffix < reference.length - prefix && suffix < candidate.length - prefix &&
    reference[reference.length - 1 - suffix].key === candidate[candidate.length - 1 - suffix].key) suffix++;
  const before = reference.slice(prefix, reference.length - suffix), after = candidate.slice(prefix, candidate.length - suffix);
  let middle = [];
  // Bound memory for unusually long lines. Coarser highlights still use whole clusters.
  if (before.length * after.length > 1e6) {
    middle = after.length ? after.map(token => ({ ...token, kind: "text" })) : before.map(token => ({ ...token, kind: "missing" }));
  } else {
    const costs = Array.from({ length: before.length + 1 }, () => new Uint32Array(after.length + 1));
    for (let i = 0; i <= before.length; i++) costs[i][0] = i;
    for (let j = 0; j <= after.length; j++) costs[0][j] = j;
    for (let i = 1; i <= before.length; i++) for (let j = 1; j <= after.length; j++) {
      costs[i][j] = Math.min(costs[i - 1][j] + 1, costs[i][j - 1] + 1,
        costs[i - 1][j - 1] + Number(before[i - 1].key !== after[j - 1].key));
    }
    let i = before.length, j = after.length;
    while (i || j) {
      if (i && j && before[i - 1].key === after[j - 1].key) {
        middle.push(matched(before[--i], after[--j]));
      } else if (i && j && costs[i][j] === costs[i - 1][j - 1] + 1) {
        i--;
        middle.push({ ...after[--j], kind: "text" });
      } else if (i && costs[i][j] === costs[i - 1][j] + 1) {
        middle.push({ ...before[--i], kind: "missing" });
      } else {
        middle.push({ ...after[--j], kind: "text" });
      }
    }
    middle.reverse();
  }
  return [
    ...candidate.slice(0, prefix).map((token, i) => matched(reference[i], token)),
    ...middle,
    ...candidate.slice(candidate.length - suffix).map((token, i) => matched(reference[reference.length - suffix + i], token)),
  ];
}

function render(tokens) {
  const runs = [];
  for (const token of tokens) {
    const previous = runs.at(-1);
    if (previous && previous.kind === token.kind && previous.note === token.note && previous.kinds.join() === token.kinds.join()) previous.text += token.text;
    else runs.push({ ...token });
  }
  return runs.map(run => {
    if (run.kind === "missing") {
      const label = `Omitted reference text ${JSON.stringify(run.text)}`;
      return `<span class="diff-omitted${run.note ? " diff-note" : ""}" role="img" aria-label="${esc(label)}" title="${esc(label)}" data-missing="${esc(run.text)}"></span>`;
    }
    const spans = run.kinds.map(kind => ({ kind, start: 0, end: Array.from(run.text).length }));
    let html = lineHtml(run.text, spans, () => "");
    if (run.note) html = `<sup class="diff-note">${html}</sup>`;
    if (run.kind !== "same") html = `<span class="diff-${run.kind}" title="${run.kind === "format" ? "Formatting differs from the reference" : "Text differs from the reference"}">${html}</span>`;
    return html;
  }).join("");
}

export function transcriptionHtml(referenceLines, candidateLines) {
  const reference = lineTokens(referenceLines), candidate = lineTokens(candidateLines);
  return Array.from({ length: Math.max(reference.length, candidate.length) }, (_, i) => render(align(reference[i] || [], candidate[i] || []))).join("\n");
}
