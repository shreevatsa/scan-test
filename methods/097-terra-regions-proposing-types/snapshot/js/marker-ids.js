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
