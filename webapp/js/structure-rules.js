import { provisionalUnits, regionTypePaths } from "./pipeline/provisional.js?v=20261127-place-areas";
import { noteTypesOf, linkNotes } from "./note-links.js?v=20261127-place-areas";
import { sectionKeys, groupPage } from "./section-rules.js?v=20261127-place-areas";
import { groupVerses } from "./verse-group-rules.js?v=20261127-place-areas";
import { headingSections } from "./heading-rules.js?v=20261127-place-areas";
import { compileRules } from "./rules.js?v=20261127-place-areas";

const ridOf = ref => ref.split("#").pop();
const textOf = (doc, unit) => unit.children.filter(child => child.region)
  .flatMap(child => doc.page.regions.find(region => region.id === ridOf(child.region))?.lines || [])
  .map(line => line.text || "").join(" ");

// A page break where one side only is marked as going on (the last block of a page "continues later", or the first of the
// next "continues from earlier", but not both) between two blocks of one type is settled by the text: if the earlier
// block's last line ends a sentence (. । ॥ ? ! and the like) the mark is dropped, as a finder's slip; otherwise the other
// side is marked too and they join. The region finder marks each page alone, and one side is often missing or
// wrong. Between blocks of two types, a mark is dropped where the earlier block ends a sentence, and where a quotation
// stands at the break with the marked block's type on its other side (a paragraph, the verse it quotes across the
// break, and the paragraph going on after it): that stays as printed, as it does within a page (provisional.js). Where
// both sides are marked but the pieces' types differ, the later piece takes the earlier's type (source.type_settled).
// Returns Map page index → the page with its marks settled (a copy), for the pages changed.
const ENDS_SENTENCE = /[.।॥?!;:”"’)\]]\s*[0-9०-९೦-೯]*\s*[.।॥)]*\s*$/u;
function settleBreaks(pages, tl, mainTypes, noteTypes) {
  const out = new Map();
  const page = index => out.get(index) || pages[index]?.page;
  // A page's text blocks in reading order, of the main text or of the notes (`kinds`, the flow's types): figures and
  // captions float (provisional.js) and stand at no edge.
  let kinds = mainTypes;
  const blocks = index => (page(index)?.regions || []).filter(region => kinds.has(region.type) && !["figure", "caption"].includes(tl.types[region.type]?.region) && (region.lines || []).some(line => line.text?.trim()))
    .sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity));
  const edge = (index, last) => last ? blocks(index).at(-1) : blocks(index)[0];
  // Blocks of other types (not headings) at a page's edge, then one of `type`: a quotation with the text going on past it.
  const quotation = (index, type, last) => {
    const list = last ? blocks(index).reverse() : blocks(index);
    const beyond = list.findIndex(region => region.type === type || tl.types[region.type]?.region === "heading");
    return beyond > 0 && list[beyond].type === type;
  };
  const edit = (index, rid, change) => {
    if (!out.has(index)) out.set(index, structuredClone(pages[index].page));
    const region = out.get(index).regions.find(value => value.id === rid);
    region.source = { ...region.source, ...change };
  };
  for (let i = 0; i + 1 < pages.length; i++) for (kinds of [mainTypes, noteTypes]) {
    if (!pages[i] || !pages[i + 1] || pages[i].source?.sample?.consecutive_next === false) continue;
    const a = edge(i, true), b = edge(i + 1, false);
    if (!a || !b) continue;
    const later = Boolean(a.source?.continues_later), earlier = Boolean(b.source?.continues_from_earlier);
    // Both sides marked, the two pieces typed differently (a list item's or a verse's second piece, without its number
    // or its start, taken for a paragraph): the later piece is the earlier's type. But prose then a verse: a verse
    // printed whole with its number ("… ॥ ५७ ॥") is a verse of its own, its mark a finder's slip; and a verse the prose
    // introduces (the prose ending "…:", "…-", or the verse opening a quotation) is quoted, both standing as printed.
    const lastText = region => (region.lines.filter(line => line.text?.trim()).at(-1)?.text || "").trim();
    const firstText = region => (region.lines.find(line => line.text?.trim())?.text || "").trim();
    if (later && earlier && a.type !== b.type && tl.types[b.type]?.region === "verse" && tl.types[a.type]?.region !== "verse") {
      if (/[।॥|]\s*[0-9०-९೦-೯]{1,3}\s*[।॥|]+\s*$/u.test(lastText(b))) {
        edit(i + 1, b.id, { continues_from_earlier: false, continuation_settled: "a verse printed whole, with its number, does not go on from prose" });
        continue;
      }
      if (/[:\-–—]\s*$/u.test(lastText(a)) || /^[“"'‘„«]/u.test(firstText(b))) {
        edit(i, a.id, { continues_later: false, continuation_settled: "the text before the break introduces the verse it quotes" });
        edit(i + 1, b.id, { continues_from_earlier: false, continuation_settled: "a verse quoted by the text before the break" });
        continue;
      }
    }
    if (later && earlier && a.type !== b.type && ![a, b].some(region => tl.types[region.type]?.region === "heading")) {
      if (!out.has(i + 1)) out.set(i + 1, structuredClone(pages[i + 1].page));
      const region = out.get(i + 1).regions.find(value => value.id === b.id);
      region.source = { ...region.source, type_settled: { from: region.type, reason: `it goes on from a ${a.type.replaceAll("_", " ")} on the page before` } };
      region.type = a.type;
    }
    if (later === earlier) continue;
    const ends = ENDS_SENTENCE.test((a.lines.filter(line => line.text?.trim()).at(-1)?.text || "").trim());
    if (a.type !== b.type) {
      // Otherwise, across a plate or a block of another type, assembly looks further.
      if (ends) {
        if (later) edit(i, a.id, { continues_later: false, continuation_settled: "the text before the break ends a sentence" });
        else edit(i + 1, b.id, { continues_from_earlier: false, continuation_settled: "the text before the break ends a sentence" });
      } else if (later && quotation(i + 1, a.type, false)) edit(i, a.id, { continues_later: false, continuation_settled: "a quotation follows the break, and the text goes on after it" });
      else if (earlier && quotation(i, b.type, true)) edit(i + 1, b.id, { continues_from_earlier: false, continuation_settled: "a quotation stands before the break, after the text it goes on from" });
      continue;
    }
    if (ends) {
      if (later) edit(i, a.id, { continues_later: false, continuation_settled: "the text before the break ends a sentence" });
      else edit(i + 1, b.id, { continues_from_earlier: false, continuation_settled: "the text before the break ends a sentence" });
    } else if (later) edit(i + 1, b.id, { continues_from_earlier: true, continuation_settled: "the text before the break goes on" });
    else edit(i, a.id, { continues_later: true, continuation_settled: "the text before the break goes on" });
  }
  return out;
}

// Apply the book's rules to transient reading units projected from the page regions.
export function deriveStructure(pages, types, rules) {
  const settings = compileRules(rules);
  const tl = structuredClone(types);
  const { sections: sectionRules, verseGroups: groupRules } = settings;
  const groupMarkers = Boolean(tl.types[groupRules.markerType]);
  const closeSections = Boolean(tl.types.section && tl.types[sectionRules.closing]);
  if (groupMarkers && !tl.types.verse_group) tl.types.verse_group = { flow: "main", contains: ["verse", groupRules.markerType] };
  const { noteTypes, mainTypes } = noteTypesOf(tl);
  for (const [type, path] of regionTypePaths(tl)) if (tl.types[type].region && tl.types[path[0]].flow === "main") mainTypes.add(type);
  const last = pages.length - 1;
  // The marks of a page break where only one side says the text goes on, settled by the text (settleBreaks).
  const settled = settings.settleBreaks ? settleBreaks(pages, tl, mainTypes, noteTypes) : new Map();
  const docs = pages.map((doc, index) => {
    if (!doc) return null;
    const page = settled.get(index) || structuredClone(doc.page);
    const sample = doc.source?.sample;   // pages sampled from a book that do not follow each other are not open across the gap
    const { units, flows } = provisionalUnits(page.id, page.regions, tl, { firstPage: index === 0 || sample?.consecutive_previous === false, lastPage: index === last || sample?.consecutive_next === false });
    return { page, units, flows, regionIds: doc.regionIds };
  });
  const present = docs.filter(Boolean);
  if (groupMarkers) for (const doc of present) {
    if (!doc.page.regions.some(region => region.type === groupRules.markerType ||
        region.lines?.some(line => groupRules.markerWords.test(line.text || "")))) continue;
    groupVerses(doc, { counts: groupRules.counts, markerType: groupRules.markerType });
  }
  // Headings that start sections (the book's rules name them; none by default). A level whose heading type the type list
  // does not have is left out; a container type it does not have is added to the derivation's copy, in the main flow.
  const headingLevels = settings.headings.filter(level => tl.types[level.heading]?.region);
  for (const level of headingLevels) tl.types[level.container] ||= { flow: "main", contains: [] };
  if (headingLevels.length) headingSections(docs, headingLevels, { textOf, types: tl });
  if (closeSections) {
    const items = sectionKeys(present, { closing: sectionRules.closing, partClosing: sectionRules.partClosing, partHeading: sectionRules.partHeading,
      partAfter: sectionRules.partAfter, divisionClosing: sectionRules.divisionClosing, textOf });
    const byPage = Map.groupBy(items, item => item.pageIndex);
    tl.types.section.contains = [...new Set([...tl.types.section.contains, ...items.filter(item => item.part !== null).map(item => item.unit.type)])];
    for (const [index, here] of byPage) {
      const previous = items[items.indexOf(here[0]) - 1], next = items[items.indexOf(here.at(-1)) + 1];
      groupPage(present[index], here, previous, next, { parts: items.parts, partLabels: sectionRules.partLabels });
    }
  }
  for (const doc of present) linkNotes(doc, noteTypes, mainTypes);
  return settleLabels(docs);
}

// A printed page number read from the scan is sometimes wrong, a mark beside it read as a digit ("8137" for 137, "566"
// for 56). A page whose number breaks the run its nearest numbered neighbours (within 3 pages each side) agree on, and
// holds the number the run expects among its digits, is labelled with that number; `label_as_printed` keeps what was read.
// A page with no number (none printed, as on a chapter's first page, or none read) inside a run its neighbours agree on is
// labelled with the number the run gives it, and the page just before a run of three with the number before the run's
// (`label_from: "neighbours"`).
// A printed number that holds the one expected, or its digits in another order ("8137" for 137, "41" for 14, "283" for
// 328: a number printed in parts, read out of order).
const misread = (number, expected) => {
  const [a, b] = [String(number), String(expected)];
  return a.includes(b) || [...a].sort().join("") === [...b].sort().join("");
};

export function settleLabels(docs) {
  const numbers = docs.map(doc => /^\d+$/.test(String(doc?.page.label ?? "")) ? Number(doc.page.label) : null);
  const nearest = (from, step) => {
    for (let at = from + step; at >= 0 && at < docs.length && Math.abs(at - from) <= 3; at += step) if (numbers[at] !== null) return at;
    return null;
  };
  return docs.map((doc, index) => {
    const number = numbers[index], before = nearest(index, -1), after = nearest(index, 1);
    // The first page of a run printed without its number (a chapter's opening page): the number before the run's, where
    // the next three pages run on from it.
    const opens = numbers[index + 1] > 1 && numbers[index + 2] === numbers[index + 1] + 1 && numbers[index + 3] === numbers[index + 1] + 2;
    if (doc && number === null && doc.page.label == null && opens && (before === null || numbers[index + 1] - numbers[before] !== index + 1 - before))
      return { ...doc, page: { ...doc.page, label: String(numbers[index + 1] - 1), label_from: "neighbours" } };
    if (!doc || before === null || after === null || numbers[after] - numbers[before] !== after - before) return doc;
    const expected = numbers[before] + index - before;
    // A page printed without its number, or whose number was not read, inside a run its neighbours agree on.
    if (number === null) return doc.page.label == null ? { ...doc, page: { ...doc.page, label: String(expected), label_from: "neighbours" } } : doc;
    // A number its neighbours, agreeing, do not allow: misread (a stray digit, one digit for another, a digit dropped).
    // A plate or an unnumbered page between them would have broken their run. One that does not even hold the number
    // they expect (nor its digits in another order) needs more of the run: half the numbered pages within four either
    // side fit it, and three or all of them, not just the two beside it (in a stretch of misread numbers, two may agree
    // by chance).
    if (number === expected) return doc;
    if (!misread(number, expected)) {
      const near = numbers.map((value, at) => [value, at]).filter(([value, at]) => value !== null && at !== index && Math.abs(at - index) <= 4);
      const fit = near.filter(([value, at]) => value === expected + at - index || misread(value, expected + at - index)).length;
      if (fit < near.length / 2 || (fit < 3 && fit < near.length)) return doc;
    }
    return { ...doc, page: { ...doc.page, label: String(expected), label_as_printed: doc.page.label } };
  });
}
