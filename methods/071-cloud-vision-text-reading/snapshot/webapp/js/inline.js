// Inline spans and note markers (schema 0.2): a port of schema/inline.py, plus the span operations the editor needs.
// Offsets are in Unicode code points, as in the schema (and Python); JavaScript strings index UTF-16 units, so text
// is handled as arrays of code points wherever offsets matter.

export const TAGS = { b: "bold", i: "italic", sc: "small_caps", sup: "superscript", sub: "subscript", u: "underline" };
const TOKEN = /<(\/?)(b|i|sc|sup|sub|u)>|\[([^\]\s]{1,4})\]/gu;
export const MARKER = /\[([^\]\s]{1,4})\]/gu;

export const cp = s => Array.from(s || "");
export const cpLength = s => cp(s).length;

const bySpanOrder = (a, b) => a.start - b.start || a.end - b.end;

// A line as a model writes it -> [plain text, spans, tags still open, next marker number] (inline.py parse_line).
export function parseLine(text, openTags = [], nextMarker = 1) {
  const out = [], spans = [];
  let pos = 0, here = 0;
  const stack = openTags.map(kind => [kind, 0]);
  for (const m of text.matchAll(TOKEN)) {
    const chunk = text.slice(pos, m.index);
    out.push(chunk); here += cpLength(chunk);
    pos = m.index + m[0].length;
    if (m[3] !== undefined) {
      spans.push({ start: here, end: here, kind: "note_marker", id: `m${nextMarker}`, marker: m[3] });
      nextMarker += 1;
    } else if (m[1] === "") {
      stack.push([TAGS[m[2]], here]);
    } else {
      const kind = TAGS[m[2]];
      for (let k = stack.length - 1; k >= 0; k--) {
        if (stack[k][0] === kind) {
          const [, start] = stack.splice(k, 1)[0];
          if (here > start) spans.push({ start, end: here, kind });
          break;
        }
      }
    }
  }
  out.push(text.slice(pos));
  const plain = out.join("");
  const n = cpLength(plain);
  const stillOpen = [];
  for (const [kind, start] of stack) {
    if (n > start) spans.push({ start, end: n, kind });
    stillOpen.push(kind);
  }
  spans.sort(bySpanOrder);
  return [plain, spans, stillOpen, nextMarker];
}

// [[kind, text]] for a region's line pieces, joining spans that run on from one piece to the next (formatted_runs).
export function formattedRuns(lines) {
  const runs = [];
  let openRun = {};
  for (const L of lines) {
    const text = cp(L.text);
    const starts = {};
    for (const s of (L.spans || []).filter(s => s.kind !== "note_marker")) {
      const frag = text.slice(s.start, s.end).join("");
      let run;
      if (s.start === 0 && openRun[s.kind]) { openRun[s.kind][1] += " " + frag; run = openRun[s.kind]; delete openRun[s.kind]; }
      else { run = [s.kind, frag]; runs.push(run); }
      if (s.end === text.length) starts[s.kind] = run;
    }
    openRun = starts;
  }
  return runs.map(([k, t]) => [k, t.trim()]);
}

// ---------------------------------------------------------------- editing

// Formatting spans merged where the same kind overlaps or touches, empty ones dropped; markers kept as they are.
export function normalizeSpans(spans) {
  const markers = spans.filter(s => s.kind === "note_marker");
  const byKind = {};
  for (const s of spans) if (s.kind !== "note_marker" && s.end > s.start) (byKind[s.kind] ||= []).push({ ...s });
  const out = [...markers];
  for (const list of Object.values(byKind)) {
    list.sort(bySpanOrder);
    let cur = null;
    for (const s of list) {
      if (cur && s.start <= cur.end) cur.end = Math.max(cur.end, s.end);
      else { cur = s; out.push(cur); }
    }
  }
  return out.sort(bySpanOrder);
}

// True if every character of [a, b) has `kind`.
export function covered(spans, kind, a, b) {
  for (let i = a; i < b; i++) if (!spans.some(s => s.kind === kind && s.start <= i && i < s.end)) return false;
  return a < b;
}

// Remove `kind` from [a, b), splitting spans that reach outside it.
export function removeKind(spans, kind, a, b) {
  const out = [];
  for (const s of spans) {
    if (s.kind !== kind || s.end <= a || s.start >= b) { out.push(s); continue; }
    if (s.start < a) out.push({ ...s, end: a });
    if (s.end > b) out.push({ ...s, start: b });
  }
  return normalizeSpans(out);
}

// Toggle `kind` over [a, b): remove it if [a, b) has it throughout, else add it there.
export function toggleKind(spans, kind, a, b) {
  if (b <= a) return spans;
  if (covered(spans, kind, a, b)) return removeKind(spans, kind, a, b);
  return normalizeSpans([...spans, { start: a, end: b, kind }]);
}

// The page's note-marker ids, and the next free one (m<n>).
export function nextMarkerId(doc) {
  let n = 0;
  for (const r of doc.page.regions) for (const L of r.lines || []) for (const s of L.spans || [])
    if (s.id) { const m = /^m(\d+)$/.exec(s.id); if (m) n = Math.max(n, +m[1]); }
  return `m${n + 1}`;
}

// Segments of a line for rendering: [{text, kinds: [...]} | {marker: span}] in order. Each formatting kind covering a
// segment is listed; zero-width markers come before the text at their offset.
export function segments(text, spans) {
  const chars = cp(text);
  const fmt = (spans || []).filter(s => s.kind !== "note_marker");
  const markers = (spans || []).filter(s => s.kind === "note_marker");
  const cuts = new Set([0, chars.length]);
  for (const s of fmt) { cuts.add(Math.min(s.start, chars.length)); cuts.add(Math.min(s.end, chars.length)); }
  for (const s of markers) cuts.add(Math.min(s.start, chars.length));
  const sorted = [...cuts].sort((a, b) => a - b);
  const out = [];
  for (let k = 0; k < sorted.length; k++) {
    const a = sorted[k];
    for (const m of markers) if (Math.min(m.start, chars.length) === a) out.push({ marker: m });
    if (k + 1 === sorted.length) break;
    const b = sorted[k + 1];
    const kinds = fmt.filter(s => s.start <= a && s.end >= b).map(s => s.kind);
    out.push({ text: chars.slice(a, b).join(""), kinds });
  }
  return out;
}

// After the text of a line changes from `before` to `after` (code-point arrays), move each span's offsets: a common
// prefix and suffix are kept, and the changed middle is taken as replaced. Used when text is edited outside the DOM.
export function shiftSpans(spans, before, after) {
  let p = 0;
  while (p < before.length && p < after.length && before[p] === after[p]) p++;
  let s = 0;
  while (s < before.length - p && s < after.length - p && before[before.length - 1 - s] === after[after.length - 1 - s]) s++;
  const oldEnd = before.length - s, newEnd = after.length - s, delta = newEnd - oldEnd;
  const move = x => (x <= p ? x : x >= oldEnd ? x + delta : Math.min(x, newEnd));
  return normalizeSpans(spans.map(sp => ({ ...sp, start: move(sp.start), end: move(sp.end) })));
}
