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
import { printedNumber } from "./number-rules.js?v=20261126-type-suggestion";

const SHATAKA = [["N", /नीति|N[IÎĪ]T[IÎĪ]/iu], ["V", /वैराग्य|VAIR[AÂĀ]/iu], ["S", /शृङ्गार|शृंगार|[SŚ]['′]?R[IĪ]?[NṄ]G[AĀÂ]R/iu]];
const letterOf = text => SHATAKA.find(([, pattern]) => pattern.test(text || ""))?.[0] || null;
// A heading names a śataka where it says "śataka" too ("अथ शृङ्गारशतकम्", "NITI S'ATAKA."): not a commentary's heading
// that mentions one of the three themes ("भावार्थ (वैराग्य पक्ष)", the meaning on the side of renunciation).
const titleLetterOf = text => /शतक|[SŚ]['′’]?\s*A?TAK/iu.test(text || "") ? letterOf(text) : null;
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

  // A verse with no number of its own takes the one printed at its end: "… ॥ ३७ ॥", the double danda read as two
  // single ones ("।। ३५ ।।"), or the dandas half lost ("…भिः।६"), or a number in the script's digits alone ("… ११",
  // "…से५०").
  const printed = unit => {
    if (regionClass(unit.type) !== "verse") return null;
    // A colophon after the last verse's number ("॥ ११० ॥ इति नीतिशतकम् ॥", thus the Nīti śataka) is set aside.
    const text = textOf(unit).trim().replace(/(?<=[।॥|])\s*(?:इति|ಇತಿ)\s[^।॥|]*[।॥|]*\s*$/u, "").trim();
    const match = /(?<![०-९0-9])([०-९0-9]{1,3})\s*(?:॥|\|\||।\s*।)\s*$/u.exec(text) || /[।॥|]\s*([०-९೦-೯0-9]{1,3})\s*[।|]?\s*$/u.exec(text) ||
      /[\p{L}\p{M}]\s*([०-९೦-೯]{1,3})\s*$/u.exec(text);   // after the verse's own words, or fused to the last ("…से५०"); not a quotation's source ("…” १५")
    return match ? numbersOf(match[1]) : null;
  };
  const entryNumbers = unit => regionClass(unit.type) === "list_item" || /contents|index/i.test(unit.type) ? null : numbersOf(unit.number) || printed(unit);
  const holdsEntries = unit => unit.children.some(child => { const kid = child.unit && units.get(child.unit); return kid && (entryNumbers(kid) || holdsEntries(kid)); });

  // The streams: each container at the top of the main flow, and each run of top-level blocks (a book set out flat, verse
  // by verse). Each stream's entries, with the letter of the heading last seen before each, and the blocks that follow an
  // entry up to the next or a heading (a flat book's translation and comment after its verse).
  const streams = [];
  for (const id of book.flows.main || []) {
    const top = units.get(id);
    if (!top || /contents|index/i.test(top.type)) continue;
    // A container with no entries in it (a passage's "PURPORT.") is part of the run it stands in.
    if (top.children.some(child => child.unit) && holdsEntries(top)) streams.push(top);
    else if (streams.at(-1)?.flat) streams.at(-1).children.push({ unit: id });
    else streams.push({ id: "main", type: "main", label: null, flat: true, children: [{ unit: id }] });
  }
  const series = [];
  for (const top of streams) {
    let letter = null, current = null, previous = null, pending = [];
    // A numbering starts again only from 1 (2 or 3, its first number misread or missing): a smaller number past that is
    // a misreading or a repeat, settled below.
    const add = entry => {
      const lastN = current?.entries.findLast(other => other.n !== null)?.n;
      if (!current || entry.n !== null && lastN !== undefined && entry.n <= 3 && entry.n <= lastN) series.push(current = { stream: top, letters: [], entries: [] });
      if (entry.letter) current.letters.push(entry.letter);
      current.entries.push(entry);
    };
    const flush = () => { if (previous) previous.follow.push(...pending); pending = []; };
    const walk = unit => unit.children.forEach((child, index) => {
      const kid = child.unit && units.get(child.unit);
      if (!kid) return;
      if (regionClass(kid.type) === "heading") { letter = titleLetterOf(textOf(kid)) || letter; flush(); previous = null; return; }
      const numbers = entryNumbers(kid);
      if (numbers) {
        const before = index > 0 && unit.children[index - 1].unit && units.get(unit.children[index - 1].unit);
        const lead = before && regionClass(before.type) === "lead_in" && !before.number ? before.id : null;
        if (lead) pending = pending.filter(id => id !== lead);
        flush();
        previous = { uid: kid.id, n: numbers[0], more: numbers.slice(1), letter, verse: holdsVerse(kid), lead, follow: [] };
        add(previous);
        return;
      }
      if (holdsEntries(kid)) { flush(); previous = null; walk(kid); return; }
      // A verse whose number was not read (misread as letters, lost at the scan's edge) is an entry still; its number
      // is settled below, from its neighbours.
      if (regionClass(kid.type) === "verse" && (previous?.verse || current?.entries.at(-1)?.verse)) {
        flush();
        previous = { uid: kid.id, n: null, more: [], letter, verse: true, lead: null, follow: [], unread: true };
        add(previous);
        return;
      }
      pending.push(kid.id);
    });
    walk(top);
    flush();
  }

  // A number that breaks the run its neighbours agree on is misread ("58" between 67 and 69); a verse whose number was
  // not read takes the one its neighbours leave for it, and is no entry if they leave none (a verse quoted between two
  // of the text's: its block goes with the verse before it).
  for (const [index, s] of series.entries()) {
    s.entries.forEach((e, i, all) => {
      // The nearest numbered entries either side (past verses whose numbers were not read: verses quoted in the notes);
      // before the first, the last of the series before (a section's heading may start a series).
      const before = all.slice(0, i).findLast(other => other.n !== null) || series[index - 1]?.entries.findLast(other => other.n !== null);
      const after = all.slice(i + 1).find(other => other.n !== null);
      if (before && after && e.n !== null && before.n !== null && e.n !== before.n + 1 && after.n === before.n + 2) { e.n = before.n + 1; e.more = []; }
      // Between two numbers that follow on, a number of its own (not either of theirs repeated, nor the next) is no verse
      // of the text's: a verse quoted with its source's number ("… ॥ १७६ ॥", from an anthology) among a verse's notes.
      else if (before && after && e.n !== null && before.n !== null && ![before.n, before.n + 1, after.n].includes(e.n) && after.n === (before.more.at(-1) ?? before.n) + 1) { e.n = null; e.more = []; }
    });
    for (let i = 0; i < s.entries.length; i++) {
      if (s.entries[i].n !== null) continue;
      let j = i;
      while (j < s.entries.length && s.entries[j].n === null) j++;
      const before = s.entries[i - 1], after = s.entries[j], count = j - i;
      if (before && after && after.n - (before.more.at(-1) ?? before.n) === count + 1) s.entries.slice(i, j).forEach((e, k) => { e.n = (before.more.at(-1) ?? before.n) + k + 1; });
      i = j - 1;
    }
    s.entries.filter(e => e.n === null).forEach(e => {
      const at = s.entries.indexOf(e), host = s.entries.slice(0, at).reverse().find(other => other.n !== null);
      if (host) host.follow.push(e.uid, ...e.follow);
    });
    s.entries = s.entries.filter(e => e.n !== null);
  }

  // The text's series, keyed; the others go with them.
  const text = series.filter(s => s.entries.filter(e => e.verse).length > s.entries.length / 2);
  const offsets = new Map(), last = new Map();
  for (const s of text) {
    s.letter = titleLetterOf(s.stream.label) || titleLetterOf(textOf(s.stream).slice(0, 200)) || s.letters[0] || text[text.indexOf(s) - 1]?.letter || "N";
    // A series that goes on from the last one's numbers (a passage set in a section of its own) continues it; one that
    // starts again goes on from the last number.
    const before = last.get(s.letter);
    s.offset = before && s.entries[0].n > before.top ? before.offset : offsets.get(s.letter) || 0;
    const top = Math.max(...s.entries.map(e => e.n));
    offsets.set(s.letter, Math.max(offsets.get(s.letter) || 0, s.offset + top));
    last.set(s.letter, { offset: s.offset, top });
  }
  const keyOf = new Map(), groups = new Map();
  const group = key => {
    if (!groups.has(key)) groups.set(key, { key, verse: [], lead: [], follow: [], companions: {}, readings: [], footnotes: [] });
    return groups.get(key);
  };
  for (const s of text) for (const e of s.entries) {
    const key = verseKey(s.letter, s.offset + e.n);
    keyOf.set(e.uid, key);
    group(key).verse.push(e.uid);
    if (e.lead) { group(key).lead.push(e.lead); keyOf.set(e.lead, key); }
    for (const uid of e.follow) { group(key).follow.push(uid); keyOf.set(uid, key); }
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
  // A note no marker points to, on a page with one verse, is that verse's (a page of the verse, its translation, notes).
  const linked = new Set((book.relations || []).filter(relation => relation.type === "note").map(relation => relation.to?.unit));
  const firstPage = uid => regionsOf(uid)[0]?.split("#")[0];
  const versesOnPage = new Map();
  for (const g of groups.values()) for (const uid of g.verse) { const page = firstPage(uid); if (page) versesOnPage.set(page, [...(versesOnPage.get(page) || []), g.key]); }
  for (const [flow, ids] of Object.entries(book.flows)) if (flow !== "main") for (const id of ids) {
    if (linked.has(id) || keyOf.has(id)) continue;
    const here = versesOnPage.get(firstPage(id));
    if (here?.length === 1) { group(here[0]).footnotes.push(id); keyOf.set(id, here[0]); }
  }
  // A book whose verses have nothing gathered to them by number (translation, notes, readings) has verse groups only if it
  // names a śataka (a label, a heading, a running header) and most of its verses have prose after them (a translation
  // and comment set after each verse); other books' numbers are their own (an epic's verses within each episode, a story
  // book's verses among its prose).
  const prose = g => g.follow.some(uid => !["verse", "heading"].includes(regionClass(units.get(uid)?.type)));
  const all = [...groups.values()];
  const shataka = book.units.some(unit => letterOf(unit.label)) ||
    book.pages.some(page => page.regions.some(region => ["heading", "running_header"].includes(regionClass(region.type)) && letterOf((region.lines || []).map(line => line.text || "").join(" "))));
  if (!all.some(g => Object.keys(g.companions).length || g.readings.length) && !(shataka && all.filter(prose).length >= 0.5 * all.length))
    return { keyOf: new Map(), groups: new Map() };
  return { keyOf, groups };
}

// The verse groups as data for another site: for each key, every part (its role, type and text) with the regions it is
// printed in (page id, PDF page, printed page number, box in the page's pixels and the page's size, so that the region
// can be cut from the page image). An apparatus reading is one line of its region. `manifest` (book.json) gives the
// PDF pages.
export function verseExport(book, tl, manifest = {}, { numberedFallback = false } = {}) {
  const { groups } = verseGroups(book, tl);
  const units = new Map(book.units.map(unit => [unit.id, unit]));
  const pageOf = new Map(book.pages.map(page => [page.id, page]));
  const pdfPage = new Map((manifest.pages || []).map(page => [page.id, page.pdf_page ?? null]));
  const regionOf = ref => { const [pid, rid] = ref.split("#"); const page = pageOf.get(pid); return page && { page, region: page.regions.find(r => r.id === rid) }; };
  const box = polygons => { const xs = polygons.flat().map(p => p[0]), ys = polygons.flat().map(p => p[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; };
  const place = (page, region, polygons) => ({ page: page.id, pdf_page: pdfPage.get(page.id) ?? null, label: page.label ?? null,
    box: polygons?.length ? box(polygons) : region.box || null, width: page.width, height: page.height });
  const refsOf = uid => (units.get(uid)?.children || []).flatMap(child => child.region ? [child.region] : refsOf(child.unit));
  // A block's text: a verse line by line; prose as the reader joins its lines (a space, a hyphen dropped where the word
  // goes on, nothing, or a line break, as each line piece ends), across its pages.
  const textOf = (uid, refs) => {
    const lines = refs.flatMap(({ region }) => (region.lines || []).filter(line => line.text));
    if (tl.types[units.get(uid)?.type]?.region === "verse") return lines.map(line => line.text).join("\n").trim();
    return lines.map((line, i) => {
      if (i === lines.length - 1) return line.text;
      const end = line.end || "space";
      return end === "hyphen" ? line.text.replace(/[-‐]$/u, "") : line.text + (end === "line" ? "\n" : end === "join" ? "" : " ");
    }).join("").trim();
  };
  const fallbackNumbers = new Map();
  if (!groups.size && numberedFallback) {
    const counts = new Map(), refsByAnchor = new Map(), byUnit = new Map();
    const walk = uid => {
      const unit = units.get(uid);
      if (!unit) return;
      if (tl.types[unit.type]?.region === "verse") {
        const refs = refsOf(uid);
        const lines = refs.flatMap(ref => regionOf(ref)?.region?.lines ?? []);
        const match = printedNumber(lines.findLast(line => line.text?.trim())?.text);
        const n = numbersOf(unit.number)?.[0] ?? match?.value;
        if (n != null) {
          const count = (counts.get(n) ?? 0) + 1, key = count === 1 ? String(n) : `${n}-${count}`;
          counts.set(n, count);
          fallbackNumbers.set(uid, unit.number ?? match?.printed ?? String(n));
          const group = { key, verse: [uid], lead: [], follow: [], companions: {}, readings: [], footnotes: [] };
          groups.set(key, group);
          byUnit.set(uid, group);
          for (const ref of refs) for (const line of regionOf(ref)?.region?.lines ?? []) for (const span of line.spans ?? [])
            if (span.kind === "note_marker") refsByAnchor.set(`${ref.split("#")[0]}#${span.id}`, group);
          return;
        }
      }
      for (const child of unit.children) if (child.unit) walk(child.unit);
    };
    for (const uid of book.flows.main ?? []) walk(uid);
    for (const { type, from, to } of book.relations) {
      if (type === "note") refsByAnchor.get(from.anchor)?.footnotes.push(to.unit);
      if (type === "readings") byUnit.get(to.unit)?.readings.push({ region: from.region, line: from.line });
    }
  }
  const part = (role, uid) => {
    const refs = refsOf(uid).map(regionOf).filter(found => found?.region);
    return { role, type: units.get(uid)?.type, number: units.get(uid)?.number ?? fallbackNumbers.get(uid) ?? null, text: textOf(uid, refs),
      regions: refs.map(({ page, region }) => place(page, region, region.polygons)) };
  };
  return [...groups.values()].map(g => ({ key: g.key, parts: [
    // A verse that is a group (Kale's lead-in, verse and commentary) gives a part for each of its own units.
    ...g.lead.map(uid => part("lead_in", uid)),
    ...g.verse.flatMap(uid => {
      const kids = (units.get(uid)?.children || []).filter(child => child.unit).map(child => child.unit);
      return kids.length ? kids.map(kid => part(tl.types[units.get(kid)?.type]?.region === "verse" ? "verse" : units.get(kid)?.type || "part", kid)) : [part("verse", uid)];
    }),
    ...g.follow.map(uid => part(units.get(uid)?.type || "follow", uid)),
    ...Object.entries(g.companions).flatMap(([type, list]) => list.map(uid => part(type, uid))),
    ...g.readings.map(({ region: ref, line }) => {
      const found = regionOf(ref), L = found?.region?.lines?.find(value => value.line === line);
      return { role: "readings", type: found?.region?.type, text: L?.text || "", regions: found && L ? [place(found.page, found.region, L.polygons)] : [] };
    }),
    ...g.footnotes.map(uid => part("footnote", uid)),
  ] }));
}
