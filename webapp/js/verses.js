// The verses of a book (a śataka edition: Kale, Telang, Gopinath…) and everything belonging to each, gathered under one
// key, so that a verse can be shown with its commentary, translation and notes, and reached from outside (the Bhartṛhari
// site links to a verse by this key).
//
// A key is the śataka's letter (N nīti, V vairāgya, S śṛṅgāra) and the verse's number in it, three digits: "N001". A
// numbering that starts again within a śataka (its miscellaneous stanzas) goes on from the last number before it, as
// the site numbers Telang's edition (its miscellaneous stanzas 1–23 after stanza 110 are N111–N133).
//
// The book is read as streams, the top-level units of its main flow (a śataka's text, the translation, the notes), each
// a series of numbered entries (its outermost units with a plain number: Kale's group of lead-in, verse and commentary,
// Telang's verse, a translated stanza, a stanza note). A stream's numbering that starts again begins a new series. The
// series whose entries hold verses are the text, their letter the śataka their stream is labelled with; every other
// series (a translation's, the notes') goes with a series of the text in order, the next with its letter where its
// heading names a śataka ("VAIRÂGYAS'ATAKA."), else the next one.
const SHATAKA = [["N", /नीति|N[IÎĪ]T[IÎĪ]/iu], ["V", /वैराग्य|VAIR[AÂĀ]/iu], ["S", /शृङ्गार|शृंगार|[SŚ]['′]?R[IĪ]?[NṄ]G[AĀÂ]R/iu]];
const letterOf = text => SHATAKA.find(([, pattern]) => pattern.test(text || ""))?.[0] || null;
const DIGITS = ["०१२३४५६७८९", "೦೧೨೩೪೫೬೭೮೯"];
// A unit's number as verse numbers: one, or each of a short range ("6-7": a note on two stanzas); else none.
const numbersOf = value => {
  const text = [...String(value ?? "")].map(c => { for (const set of DIGITS) if (set.includes(c)) return String(set.indexOf(c)); return c; }).join("").trim();
  const one = /^(\d{1,4})$/.exec(text), range = /^(\d{1,4})\s*[-–]\s*(\d{1,4})$/.exec(text);
  if (one) return [Number(one[1])];
  if (range && Number(range[2]) > Number(range[1]) && Number(range[2]) - Number(range[1]) <= 5)
    return Array.from({ length: Number(range[2]) - Number(range[1]) + 1 }, (_, i) => Number(range[1]) + i);
  return null;
};
export const verseKey = (letter, number) => `${letter}${String(number).padStart(3, "0")}`;

// book: an assembled book (units, flows, relations, pages); tl: its type list. Returns { keyOf: Map unit id → key,
// groups: Map key → { key, verse: [unit ids], lead: [unit ids], companions: { [stream type]: [unit ids] },
// readings: [{ region, line }], footnotes: [unit ids] } } in book order.
export function verseGroups(book, tl) {
  const units = new Map(book.units.map(unit => [unit.id, unit]));
  const regionClass = type => tl.types[type]?.region;
  const lines = new Map();
  for (const page of book.pages) for (const region of page.regions) lines.set(`${page.id}#${region.id}`, region.lines || []);
  const textOf = unit => unit.children.map(child => child.region ? (lines.get(child.region) || []).map(line => line.text || "").join(" ") : textOf(units.get(child.unit) || { children: [] })).join(" ");
  const holdsVerse = unit => regionClass(unit.type) === "verse" || unit.children.some(child => child.unit && units.get(child.unit) && holdsVerse(units.get(child.unit)));

  // Each stream's entries, with the letter of the heading last seen before each.
  const series = [];
  for (const id of book.flows.main || []) {
    const top = units.get(id);
    if (!top || /contents|index/i.test(top.type)) continue;
    let letter = null, current = null;
    // A numbering starts again only from 1 (2 or 3, its first number misread or missing): a smaller number past that is
    // a misreading or a repeat, settled below.
    const add = entry => {
      if (!current || entry.n <= 3 && entry.n <= current.entries.at(-1).n) series.push(current = { stream: top, letters: [], entries: [] });
      if (entry.letter) current.letters.push(entry.letter);
      current.entries.push(entry);
    };
    const walk = unit => unit.children.forEach((child, index) => {
      const kid = child.unit && units.get(child.unit);
      if (!kid) return;
      if (regionClass(kid.type) === "heading") { letter = letterOf(textOf(kid)) || letter; return; }
      const numbers = numbersOf(kid.number);
      if (numbers && regionClass(kid.type) !== "list_item" && !/contents|index/i.test(kid.type)) {
        const before = index > 0 && unit.children[index - 1].unit && units.get(unit.children[index - 1].unit);
        add({ uid: kid.id, n: numbers[0], more: numbers.slice(1), letter, verse: holdsVerse(kid), lead: before && regionClass(before.type) === "lead_in" && !before.number ? before.id : null });
        return;
      }
      walk(kid);
    });
    walk(top);
  }

  // A number that breaks the run its neighbours agree on is misread ("58" between 67 and 69).
  for (const s of series) s.entries.forEach((e, i, all) => {
    const before = all[i - 1], after = all[i + 1];
    if (before && after && e.n !== before.n + 1 && after.n === before.n + 2) { e.n = before.n + 1; e.more = []; }
  });

  // The text's series, keyed; the others go with them.
  const text = series.filter(s => s.entries.filter(e => e.verse).length > s.entries.length / 2);
  const offsets = new Map();
  for (const s of text) {
    s.letter = letterOf(s.stream.label) || letterOf(textOf(s.stream).slice(0, 200)) || s.letters[0] || "N";
    s.offset = offsets.get(s.letter) || 0;
    offsets.set(s.letter, s.offset + Math.max(...s.entries.map(e => e.n)));
  }
  const keyOf = new Map(), groups = new Map();
  const group = key => {
    if (!groups.has(key)) groups.set(key, { key, verse: [], lead: [], companions: {}, readings: [], footnotes: [] });
    return groups.get(key);
  };
  for (const s of text) for (const e of s.entries) {
    const key = verseKey(s.letter, s.offset + e.n);
    keyOf.set(e.uid, key);
    group(key).verse.push(e.uid);
    if (e.lead) { group(key).lead.push(e.lead); keyOf.set(e.lead, key); }
  }
  const byStream = new Map();
  for (const s of series.filter(s => !text.includes(s))) byStream.set(s.stream, [...(byStream.get(s.stream) || []), s]);
  for (const [stream, list] of byStream) {
    let at = 0;
    for (const s of list) {
      const letter = s.letters[0];
      if (letter) while (at < text.length && text[at].letter !== letter) at++;
      const match = text[at++];
      if (!match) break;
      for (const e of s.entries) for (const n of [e.n, ...e.more]) {
        const key = verseKey(match.letter, match.offset + n);
        if (!keyOf.has(e.uid)) keyOf.set(e.uid, key);
        (group(key).companions[stream.type] ||= []).push(e.uid);
      }
    }
  }

  // Readings (an apparatus line given for a verse) and footnotes (by the markers in the verse's own text).
  const keyOfUnit = uid => { for (let id = uid; id;) { if (keyOf.has(id)) return keyOf.get(id); id = parentOf.get(id); } return null; };
  const parentOf = new Map();
  for (const unit of book.units) for (const child of unit.children) if (child.unit) parentOf.set(child.unit, unit.id);
  const regionsOf = uid => (units.get(uid)?.children || []).flatMap(child => child.region ? [child.region] : regionsOf(child.unit));
  const anchorKey = new Map();
  for (const [key, g] of groups) for (const uid of [...g.verse, ...g.lead]) for (const ref of regionsOf(uid)) {
    const pid = ref.split("#")[0];
    for (const line of lines.get(ref) || []) for (const span of line.spans || []) if (span.kind === "note_marker") anchorKey.set(`${pid}#${span.id}`, key);
  }
  for (const relation of book.relations || []) {
    if (relation.type === "readings" && relation.to?.unit) {
      const key = keyOfUnit(relation.to.unit);
      if (key) group(key).readings.push({ region: relation.from.region, line: relation.from.line });
    } else if (relation.type === "note" && relation.from?.anchor && relation.to?.unit) {
      const key = anchorKey.get(relation.from.anchor);
      if (key) group(key).footnotes.push(relation.to.unit);
    }
  }
  // A book whose verses have nothing gathered to them (no translation, notes or readings by number) has no verse groups:
  // its numbers are its own (an epic's verses within each episode).
  if (![...groups.values()].some(g => Object.keys(g.companions).length || g.readings.length)) return { keyOf: new Map(), groups: new Map() };
  return { keyOf, groups };
}
