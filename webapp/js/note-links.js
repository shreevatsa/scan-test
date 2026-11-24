// Footnote markers in the running text and their links to the notes, by rule, with no model (webapp/tools/chaya_notes.mjs
// runs them over a book; Read's Problems lists what they leave unmatched).
//  - markLine: a marker the transcription left as ordinary text becomes a note marker: a superscript span holding only
//    a number or sign, a superscript digit character, a tag such as <su>१</su>, "(१)" against a letter, or digits printed
//    against a letter ("सूरी१नाम"). Its characters leave the text and a zero-width note-marker span stands there.
//  - placeFromQuotes: where the transcription lost a marker altogether, a note that quotes a reading ("१. ‘तीरस्थं’
//    स्यात्") gets its marker after the word on the page closest to the quote, when that word is clearly the closest
//    and the placed markers keep the notes' order.
//  - linkNotes: each marker is linked to the note on its page with the same printed number.
//  - noteProblems: markers with no note and notes with no marker, page by page.
const DEV = "०१२३४५६७८९", KAN = "೦೧೨೩೪೫೬೭೮೯", SUP = { "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9", "⁰": "0" };
export const normal = marker => [...String(marker)].map(c => DEV.includes(c) ? String(DEV.indexOf(c)) : KAN.includes(c) ? String(KAN.indexOf(c)) : SUP[c] ?? c).join("").replace(/^0+(?=\d)/, "");
const SIGN = /^(?:[0-9०-९೦-೯]{1,3}|[*†‡§]{1,3})$/;
// A letter of Devanagari (signs and vowel marks included; not the dandas, which come before a verse number, nor digits).
const LETTER = "\\u0900-\\u0963\\u0970-\\u097F";
const GLUED = new RegExp(`(?<=[${LETTER}])([०-९]{1,2}|[0-9]{1,2})(?![०-९0-9])|([०-९]{1,2})(?=[${LETTER}])`, "g");

// Remove the code points [at, at + length) from a line piece, keeping its other spans on the same characters.
function cut(line, at, length) {
  const chars = [...line.text];
  chars.splice(at, length);
  line.text = chars.join("");
  for (const span of line.spans || []) {
    const shift = value => value >= at + length ? value - length : Math.min(value, at);
    span.start = shift(span.start); span.end = shift(span.end);
  }
  line.spans = (line.spans || []).filter(span => span.kind === "note_marker" || span.end > span.start);
}

// Step 1 on one line piece. `newId()` gives an id unused on the page. Returns how many markers were made, by kind.
export function markLine(line, newId) {
  const made = { superscript_span: 0, superscript_char: 0, tagged: 0, glued_digits: 0 };
  if (!line.text) return made;
  const add = (at, marker) => { line.spans ||= []; line.spans.push({ start: at, end: at, kind: "note_marker", id: newId(), marker, source: { made_by: "rule: note markers (webapp/tools/chaya_notes.mjs)" } }); };
  for (;;) {   // superscript spans that are only a marker
    const chars = [...line.text];
    const span = (line.spans || []).find(value => value.kind === "superscript" && SIGN.test(chars.slice(value.start, value.end).join("").trim()));
    if (!span) break;
    const marker = chars.slice(span.start, span.end).join("").trim(), at = span.start;
    line.spans.splice(line.spans.indexOf(span), 1);
    cut(line, at, span.end - span.start); add(at, marker); made.superscript_span++;
  }
  for (;;) {   // superscript digit characters
    const chars = [...line.text], at = chars.findIndex(c => c in SUP);
    if (at < 0) break;
    let end = at; while (end < chars.length && chars[end] in SUP) end++;
    const marker = chars.slice(at, end).map(c => SUP[c]).join("");
    cut(line, at, end - at); add(at, marker); made.superscript_char++;
  }
  for (;;) {   // a tag the transcription wrote for a raised number, <su>१</su> or <sup>3</sup>, or "(१)" against a letter
    const text = line.text, match = new RegExp(`<su[bp]?>\\s*([०-९0-9]{1,2}|[*†‡§])\\s*</su[bp]?>|(?<=[${LETTER}])\\(([०-९0-9]{1,2})\\)`).exec(text);
    if (!match) break;
    const marker = match[1] || match[2], at = [...text.slice(0, match.index)].length;
    cut(line, at, [...match[0]].length); add(at, marker); made.tagged++;
  }
  for (;;) {   // digits against a letter
    const text = line.text, match = new RegExp(GLUED.source).exec(text);
    if (!match) break;
    const marker = match[1] || match[2], at = [...text.slice(0, match.index)].length;
    cut(line, at, [...marker].length); add(at, marker); made.glued_digits++;
  }
  line.spans?.sort((a, b) => a.start - b.start || a.end - b.end);
  if (line.spans && !line.spans.length) delete line.spans;
  return made;
}

export const NOTE_NUMBER = /^\s*[(\[]?\s*([0-9०-९೦-೯]{1,3}|[*†‡§]{1,3})\s*[.)\]:]?/;

// Links each marker on the page with no link yet to the note on the page with the same printed number, in reading order
// where a number is used twice; a note with no number of its own (one continued from an earlier page) is not linked.
// Returns { links, markers, notes, unmatched, notesWithoutMarker }.
export function linkNotes(doc, noteTypes, mainTypes) {
  const { text, notes } = pageParts(doc, noteTypes, mainTypes);
  const markers = text.flatMap(region => (region.lines || []).flatMap(line => (line.spans || []).filter(span => span.kind === "note_marker")));
  for (const note of notes) if (note.number && !note.unit.number) note.unit.number = note.number;
  doc.relations ||= [];
  const linked = new Set(doc.relations.filter(rel => rel.type === "note" && rel.from.anchor).map(rel => rel.from.anchor));
  const taken = new Set(doc.relations.filter(rel => rel.type === "note").map(rel => rel.to.unit));
  let links = 0; const unmatched = [];
  for (const span of markers) {
    const anchor = `${doc.page.id}#${span.id}`;
    if (linked.has(anchor)) continue;
    const note = notes.find(value => value.number && normal(value.number) === normal(span.marker) && !taken.has(value.unit.id));
    if (!note) { unmatched.push(span.marker); continue; }
    taken.add(note.unit.id);
    doc.relations.push({ type: "note", from: { anchor, marker: span.marker }, to: { unit: note.unit.id }, source: { made_by: "rule: same printed number on the page (webapp/tools/chaya_notes.mjs)" } });
    links++;
  }
  if (!doc.relations.length) delete doc.relations;
  return { links, markers: markers.length, notes: notes.length, unmatched, notesWithoutMarker: notes.filter(note => !taken.has(note.unit.id)).length };
}

// The book's note types (in a flow other than the main one) and running-text types (in the main flow), not containers.
export function noteTypesOf(types) {
  const entries = Object.entries(types.types || {}).filter(([, type]) => !type.contains);
  return { noteTypes: new Set(entries.filter(([, type]) => type.flow && type.flow !== "main").map(([name]) => name)),
    mainTypes: new Set(entries.filter(([, type]) => type.flow === "main").map(([name]) => name)) };
}

// The page's running-text regions in reading order (through the main flow's units), and its notes that begin here.
export function pageParts(doc, noteTypes, mainTypes) {
  const regionById = new Map(doc.page.regions.map(region => [region.id, region]));
  const unitById = new Map(doc.units.map(unit => [unit.id, unit]));
  const regionsOf = unit => !unit ? [] : unit.children.flatMap(child => child.region ? [regionById.get(child.region.split("#").pop())].filter(Boolean) : child.unit ? regionsOf(unitById.get(child.unit)) : []);
  const text = (doc.flows.main || []).flatMap(id => regionsOf(unitById.get(id))).filter(region => mainTypes.has(region.type));
  const notes = Object.entries(doc.flows).filter(([flow]) => flow !== "main").flatMap(([, ids]) => ids).map(id => unitById.get(id))
    .filter(unit => unit && noteTypes.has(unit.type) && !unit.open?.start)
    .map(unit => { const first = (regionsOf(unit)[0]?.lines || []).map(line => line.text || "").join(" "); return { unit, first, number: unit.number || NOTE_NUMBER.exec(first)?.[1] || null }; });
  return { text, notes };
}

const LETTERS = new RegExp(`[^${LETTER}]`, "g");
const bare = word => word.normalize("NFC").replace(/[‌‍]/g, "").replace(LETTERS, "");
// The fewest edits that turn `a` into some stretch of `b` (a reading often quotes part of a compound word).
function distanceIn(a, b) {
  a = [...a]; b = [...b];
  let row = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    row = next;
  }
  return Math.min(...row);
}
const QUOTE = /[‘'"“]([^’'"”]+)[’'"”]/;

// Place markers for the page's notes that quote a reading and have no marker yet. Returns the placements made.
export function placeFromQuotes(doc, noteTypes, mainTypes, newId, { most = 0.35, margin = 0.15, letters = 5 } = {}) {
  const { text, notes } = pageParts(doc, noteTypes, mainTypes);
  const have = new Set(text.flatMap(region => (region.lines || []).flatMap(line => (line.spans || []).filter(span => span.kind === "note_marker").map(span => normal(span.marker)))));
  // Every word of the running text, in reading order, with where it ends.
  const words = [];
  for (const region of text) (region.lines || []).forEach(line => {
    for (const match of (line.text || "").matchAll(/\S+/g)) {
      const word = bare(match[0]);
      if (!word) continue;
      const lastLetter = match[0].search(new RegExp(`[${LETTER}][^${LETTER}]*$`));
      words.push({ line, word, end: [...line.text.slice(0, match.index + lastLetter + 1)].length });
    }
  });
  const found = [];
  for (const note of notes) {
    if (!note.number || have.has(normal(note.number))) continue;
    const quote = QUOTE.exec(note.first.replace(NOTE_NUMBER, ""))?.[1];
    if (!quote) continue;
    const parts = quote.split(/\s+/).map(bare).filter(Boolean), target = parts.join("");
    if ([...target].length < 3) continue;
    const scores = [];   // each run of one to n words, n the quote's, ending at word i
    for (let i = 0; i < words.length; i++) for (let n = 1; n <= parts.length && n <= i + 1; n++) {
      const window = words.slice(i - n + 1, i + 1).map(value => value.word).join("");
      scores.push({ i, edits: distanceIn(target, window) });
    }
    const best = new Map();   // the best score at each word
    for (const value of scores) if (!best.has(value.i) || value.edits < best.get(value.i).edits) best.set(value.i, value);
    const ranked = [...best.values()].map(value => ({ ...value, score: value.edits / [...target].length })).sort((a, b) => a.score - b.score);
    const [first, second] = ranked;
    // Clearly the closest: most of a long enough quote found, and nothing else nearly as close.
    if (!first || first.score > most || [...target].length - first.edits < letters || (second && second.score - first.score < margin)) continue;
    found.push({ note, at: first.i, score: first.score, quote });
  }
  // Keep the longest run of placements whose words come in the notes' order.
  found.sort((a, b) => Number(normal(a.note.number)) - Number(normal(b.note.number)));
  const chain = [];
  for (let k = 0; k < found.length; k++) {
    let longest = [];
    for (let j = 0; j < k; j++) if (found[j].at < found[k].at && chain[j].length > longest.length) longest = chain[j];
    chain.push([...longest, found[k]]);
  }
  const keep = chain.reduce((a, b) => b.length > a.length ? b : a, []);
  for (const placed of keep) {
    const word = words[placed.at];
    word.line.spans ||= [];
    word.line.spans.push({ start: word.end, end: word.end, kind: "note_marker", id: newId(), marker: placed.note.number,
      source: { made_by: "rule: the word closest to the reading the note quotes (webapp/tools/chaya_notes.mjs)", quote: placed.quote, word: word.word, score: Math.round(placed.score * 100) / 100 } });
    word.line.spans.sort((a, b) => a.start - b.start || a.end - b.end);
  }
  return keep.map(placed => ({ number: placed.note.number, quote: placed.quote, word: words[placed.at].word, score: placed.score }));
}

// For a reading that lost the page's note markers (Cloud Vision drops a small raised number): each note that quotes what
// it explains, in quotation marks or before its first colon ("1. ‘X’ …", "1. X : …"), has its marker written, as
// `[key]`, after the word that ends the stretch of running text closest to the quote, where that is clearly the closest
// (as placeFromQuotes) and the markers keep the notes' order. Any script. `lines`: the page's running text in reading
// order ({ text }, changed in place); `notes`: [{ key, first }] in the notes' order (the marker each wants, its first
// line). Returns the keys placed.
export function markersFromQuotes(lines, notes, { most = 0.35, margin = 0.15, letters = 5 } = {}) {
  const letter = /[\p{L}\p{M}]/u;
  const bareText = word => word.normalize("NFC").replace(/[\u200c\u200d]/g, "").replace(/[^\p{L}\p{M}]/gu, "");
  const words = [];
  lines.forEach((line, index) => {
    for (const match of (line.text || "").matchAll(/\S+/g)) {
      const word = bareText(match[0]);
      if (!word) continue;
      let end = match.index + match[0].length;
      while (end > match.index && !letter.test(line.text[end - 1])) end--;
      words.push({ index, word, end });
    }
  });
  const found = [];
  for (const note of notes) {
    const rest = note.first.replace(NOTE_NUMBER, "");
    const quote = QUOTE.exec(rest)?.[1] || /^\s*([^:：]{2,80}?)\s*[:：]/u.exec(rest)?.[1];
    if (!quote) continue;
    const parts = quote.split(/\s+/).map(bareText).filter(Boolean), target = parts.join("");
    if (parts.length > 8 || [...target].length < letters) continue;
    const best = new Map();
    for (let i = 0; i < words.length; i++) for (let n = 1; n <= parts.length && n <= i + 1; n++) {
      const edits = distanceIn(target, words.slice(i - n + 1, i + 1).map(value => value.word).join(""));
      if (!best.has(i) || edits < best.get(i)) best.set(i, edits);
    }
    const ranked = [...best].map(([i, edits]) => ({ i, edits, score: edits / [...target].length })).sort((a, b) => a.score - b.score);
    const [first, second] = ranked;
    if (!first || first.score > most || [...target].length - first.edits < letters || (second && second.score - first.score < margin)) continue;
    found.push({ key: note.key, at: first.i });
  }
  // The longest run of placements in the notes' order.
  const chain = [];
  for (let k = 0; k < found.length; k++) {
    let longest = [];
    for (let j = 0; j < k; j++) if (found[j].at < found[k].at && chain[j].length > longest.length) longest = chain[j];
    chain.push([...longest, found[k]]);
  }
  const keep = chain.reduce((a, b) => b.length > a.length ? b : a, []);
  for (const placed of [...keep].sort((a, b) => b.at - a.at)) {
    const word = words[placed.at], line = lines[word.index];
    line.text = `${line.text.slice(0, word.end)}[${placed.key}]${line.text.slice(word.end)}`;
  }
  return keep.map(placed => placed.key);
}

// Markers that point to no note and notes no marker points to, on one page.
export function noteProblems(doc, noteTypes, mainTypes) {
  const { text, notes } = pageParts(doc, noteTypes, mainTypes);
  const linked = new Set((doc.relations || []).filter(rel => rel.type === "note").map(rel => rel.from.anchor));
  const targets = new Set((doc.relations || []).filter(rel => rel.type === "note").map(rel => rel.to.unit));
  const markers = text.flatMap(region => (region.lines || []).flatMap(line => (line.spans || []).filter(span => span.kind === "note_marker")));
  return { markers: markers.filter(span => !linked.has(`${doc.page.id}#${span.id}`)).map(span => span.marker),
    notes: notes.filter(note => !targets.has(note.unit.id)).map(note => note.number || "?") };
}
