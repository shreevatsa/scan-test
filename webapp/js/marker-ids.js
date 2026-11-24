// Preserve a printed marker's identity when its position matches, or when a unique sign moved.
export function preserveMarkerIds(previous, candidate, used) {
  const spans = structuredClone(candidate), matched = new Set();
  let next = 1;
  for (const span of spans.filter(span => span.id)) {
    const possible = previous.filter(value => !matched.has(value.id) && value.kind === span.kind && value.marker === span.marker);
    const exact = possible.find(value => value.start === span.start);
    const unique = possible.length === 1 && spans.filter(value => value.kind === span.kind && value.marker === span.marker).length === 1;
    const old = exact || (unique ? possible[0] : null);
    if (old) { span.id = old.id; matched.add(old.id); }
    else {
      while (used.has(`m${next}`)) next++;
      span.id = `m${next++}`;
      used.add(span.id);
    }
  }
  return spans;
}

// A reader that cannot see note markers (Cloud Vision, Tesseract) reading a line again would lose the markers its earlier
// text had. Each is carried to the new text: after the word of the new text closest to the word it stood by (the word
// it follows, or at a line's start the one it precedes), where that word is clearly the same (at most 40% of its letters
// differ; nearer the same place in the line where words repeat). Code point offsets, as spans have. Returns the new
// line's spans with the markers carried (ids prefixed "k", so as not to meet the new reading's own); unchanged if the
// new reading has markers of its own or the old text none.
export function carryMarkers(oldText, oldSpans, newText, newSpans) {
  const markers = (oldSpans || []).filter(span => span.kind === "note_marker");
  if (!markers.length || !newText || (newSpans || []).some(span => span.kind === "note_marker")) return newSpans;
  const tokens = text => {
    const chars = [...text], out = [];
    for (let i = 0; i < chars.length;) {
      while (i < chars.length && /\s/u.test(chars[i])) i++;
      const a = i;
      while (i < chars.length && !/\s/u.test(chars[i])) i++;
      if (i > a) out.push({ a, b: i, chars: chars.slice(a, i) });
    }
    return out;
  };
  const bare = chars => chars.join("").normalize("NFC").replace(/[^\p{L}\p{M}\p{N}]/gu, "");
  const distance = (a, b) => {
    a = [...a]; b = [...b];
    let row = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
      const next = [i];
      for (let j = 1; j <= b.length; j++) next[j] = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      row = next;
    }
    return row[b.length];
  };
  const before = tokens(oldText), after = tokens(newText), oldLength = Math.max(1, [...oldText].length), newLength = Math.max(1, [...newText].length);
  const out = [...(newSpans || [])];
  for (const span of markers) {
    const following = before.find(token => token.a < span.start && span.start <= token.b);
    const token = following || before.find(token => token.a >= span.start);
    const word = token && bare(token.chars);
    if (!word) continue;
    const ranked = after.map(candidate => {
      const edits = distance(word, bare(candidate.chars));
      return { candidate, edits, cost: edits / Math.max(1, [...word].length) + 0.3 * Math.abs(candidate.b / newLength - token.b / oldLength) };
    }).sort((x, y) => x.cost - y.cost);
    const best = ranked[0];
    if (!best || best.edits > 0.4 * [...word].length) continue;
    let at;
    if (!following) at = best.candidate.a;
    else if (span.start === token.b) at = best.candidate.b;
    else {   // inside the old word, before its closing punctuation: after the new word's last letter
      at = best.candidate.b;
      while (at > best.candidate.a && !/[\p{L}\p{M}\p{N}]/u.test(best.candidate.chars[at - best.candidate.a - 1])) at--;
    }
    out.push({ ...span, start: at, end: at, id: `k${span.id}` });
  }
  return out.length ? out.sort((x, y) => x.start - y.start || x.end - y.end) : newSpans;
}
