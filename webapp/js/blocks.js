// A reading projection. The temporary units are an adapter for assembly and the reader.
import { provisionalUnits, regionTypePaths } from "./pipeline/provisional.js?v=20261123-hydrogen-1";
import { orderedRegions } from "./flags.js?v=20261123-hydrogen-1";
import { pageLabel } from "./pipeline/steps.js?v=20261123-hydrogen-1";
import { noteTypesOf, markLine, linkNotes, noteProblems, normal } from "./note-links.js?v=20261123-hydrogen-1";
import { closingName, sectionKeys, groupPage } from "./section-rules.js?v=20261123-hydrogen-1";
import { DEFAULT_COUNTS, groupVerses } from "./verse-group-rules.js?v=20261123-hydrogen-1";
import { verseNumbers, sequenceFixes, pageNumberFixes, toDev } from "./number-rules.js?v=20261123-hydrogen-1";
import { cp, shiftSpans } from "./inline.js";
import { layerState } from "./layers.js?v=20261123-hydrogen-1";
import { readingDocuments } from "./workflow.js?v=20261123-hydrogen-1";

const prose = new Set(["paragraph", "note"]);
const printedLines = new Set(["verse", "heading", "table", "formula"]);
export const isProseBlock = (region, types) => prose.has(types.types[region.type]?.region);
export const blockName = type => type ? type[0].toUpperCase() + type.slice(1).replaceAll("_", " ") : "Block";

export function blockLineEnd(line, region, types) {
  if (printedLines.has(types.types[region.type]?.region)) return "line";
  if (isProseBlock(region, types) && /[-‐]$/u.test(line.text || "")) return "hyphen";
  return "space";
}

const counts = Object.fromEntries(DEFAULT_COUNTS.split(",").map(pair => pair.split("=")).map(([name, n]) => [name, Number(n)]));
const partLabels = ["बालकाण्डम् – अयोध्याकाण्डम्", "अरण्यकाण्डम्", "किष्किन्धाकाण्डम्", "सुन्दरकाण्डम्", "युद्धकाण्डम्", "", "उत्तरकाण्डम्"];
const ridOf = ref => ref.split("#").pop();
const textOf = (doc, unit) => unit.children.filter(child => child.region)
  .flatMap(child => doc.page.regions.find(region => region.id === ridOf(child.region))?.lines || [])
  .map(line => line.text || "").join(" ");

function replaceText(line, start, count, text) {
  const before = line.text;
  line.text = before.slice(0, start) + text + before.slice(start + count);
  if (line.spans) line.spans = shiftSpans(line.spans, cp(before), cp(line.text));
}

function numberVerses(docs, type, report) {
  const verses = verseNumbers(docs, type);
  const { fixes, breaks } = sequenceFixes(verses);
  report.numberFixes[type] = fixes.length;
  report.numberBreaks[type] = breaks.filter(entry => !entry.restart);
  for (const { item, value } of fixes) replaceText(item.line, item.at, item.printed.length, toDev(value, item.printed));
  for (const item of verses) if (item.printed) item.unit.number = toDev(item.value, item.printed);
}

function numberPages(docs, report) {
  const entries = docs.map((doc, index) => ({ doc, index, value: doc?.page.label == null ? null : Number(doc.page.label) }));
  const { fixes, breaks } = pageNumberFixes(entries);
  report.numberFixes.page = fixes.length;
  report.numberBreaks.page = breaks.map(({ entry, ...rest }) => ({ page: entry.doc.page.id, ...rest }));
  for (const { entry, value } of fixes) {
    entry.doc.page.label = String(value);
    const line = entry.doc.page.regions.find(region => region.type === "page_number")?.lines.find(line => /[0-9०-९]/.test(line.text || ""));
    const match = line && /[0-9०-९]+/.exec(line.text);
    if (match) replaceText(line, match.index, match[0].length, toDev(value, match[0]));
  }
}

export function projectBlocks(pages, saved, types, skipped) {
  const source = readingDocuments(pages, saved, skipped);
  const tl = structuredClone(types);
  const ramayana = /^ramayanamamjari00ksemuoft(?:$|-)/.test(tl.book_id || pages[0]?.id || "");
  const groupMarkers = Boolean(tl.types.verse_group_marker);
  const closeSections = Boolean(tl.types.section && tl.types.section_closing);
  if (groupMarkers && !tl.types.verse_group) tl.types.verse_group = { flow: "main", contains: ["verse", "verse_group_marker"], description: "A group of verses." };
  const paths = regionTypePaths(tl);
  const { noteTypes, mainTypes } = noteTypesOf(tl);
  for (const [type, path] of paths) if (tl.types[type].region && tl.types[path[0]].flow === "main") mainTypes.add(type);
  const report = { numberFixes: {}, numberBreaks: {}, groups: 0, groupProblems: [], sections: 0, links: 0, unmatchedMarkers: 0, notesWithoutMarker: 0 };
  const docs = source.map((doc, index) => {
    if (!doc) return null;
    const page = structuredClone(doc.page), label = pageLabel(page.regions);
    if (label) page.label = label; else delete page.label;
    for (const region of page.regions) for (const line of region.lines || []) {
      const end = blockLineEnd(line, region, tl);
      if (end === "space") delete line.end; else line.end = end;
    }
    const { units, flows } = provisionalUnits(page.id, page.regions, tl, { firstPage: index === 0, lastPage: index === source.length - 1 });
    return { format: doc.format, schema_version: doc.schema_version, book_id: doc.book_id, page, units, flows };
  });
  const present = docs.filter(Boolean);
  numberPages(docs, report);
  // The verse sequence assumes consecutive numbering, as in the handoff's method 100.
  // Kale has several independently numbered kinds of verse and its own printed numbering.
  if (closeSections) {
    numberVerses(present, "verse", report);
    numberVerses(present, "section_closing", report);
  }
  if (groupMarkers) for (const doc of present) {
    if (!doc.page.regions.some(region => region.type === "verse_group_marker" ||
        region.lines?.some(line => /\((?:युगलकम्|तिलकम्|युग्मम्|विशेषकम्|कलापकम्|कुलकम्)\)/.test(line.text || "")))) continue;
    const { made, problems } = groupVerses(doc, { counts });
    report.groups += made.filter(group => group.marker).length;
    report.groupProblems.push(...problems.map(message => ({ page: doc.page.id, message })));
  }
  if (closeSections) {
    const items = sectionKeys(present, { closing: "section_closing", partClosing: /कथासारे/, textOf,
      ...(ramayana ? { partHeading: /काण्ड/, divisionClosing: /किष्किन्धापर्व/ } : {}) });
    const byPage = Map.groupBy(items, item => item.pageIndex);
    const section = tl.types.section;
    section.contains = [...new Set([...section.contains, ...items.filter(item => item.part !== null).map(item => item.unit.type)])];
    report.parts = items.parts?.length || 0;
    report.episodes = new Set(items.filter(item => item.episode !== null).map(item => item.episode)).size;
    for (const [index, here] of byPage) {
      const previous = items[items.indexOf(here[0]) - 1], next = items[items.indexOf(here.at(-1)) + 1];
      report.sections += groupPage(present[index], here, previous, next, { parts: items.parts, partLabels: ramayana ? partLabels : [] });
    }
  }
  for (const doc of present) {
    const ids = new Set(doc.page.regions.flatMap(region => (region.lines || []).flatMap(line => (line.spans || []).map(span => span.id))));
    let n = 0;
    const newId = () => {
      let id;
      do id = `nm${++n}`; while (ids.has(id));
      ids.add(id);
      return id;
    };
    for (const unit of doc.units) if (unit.type === "section_closing") {
      const { label } = closingName(textOf(doc, unit));
      if (label) unit.label = label;
    }
    const explicit = linkNotes(doc, noteTypes, mainTypes);
    const missing = Map.groupBy(noteProblems(doc, noteTypes, mainTypes).notes, normal);
    const candidates = [];
    if (missing.size) for (const region of doc.page.regions) {
      if (!mainTypes.has(region.type)) continue;
      for (const line of region.lines || []) {
        const marked = structuredClone(line);
        markLine(marked, newId);
        const added = (marked.spans || []).filter(span => !(line.spans || []).some(old => old.id === span.id) && span.kind === "note_marker");
        if (added.length) candidates.push({ line, marked, signs: added.map(span => normal(span.marker)) });
      }
    }
    // A plain digit in a verse or commentary may be part of the text. Only take a recovered marker
    // when it has one unmatched note and there is one place on the page that could be its marker.
    const claims = Map.groupBy(candidates.flatMap(value => value.signs), sign => sign);
    for (const { line, marked, signs } of candidates) {
      if (signs.every(sign => missing.get(sign)?.length === 1 && claims.get(sign).length === 1)) Object.assign(line, marked);
    }
    const result = linkNotes(doc, noteTypes, mainTypes);
    report.links += explicit.links + result.links;
    report.unmatchedMarkers += result.unmatched.length;
    report.notesWithoutMarker += result.notesWithoutMarker;
  }
  return { docs, types: tl, report, noteTypes, mainTypes };
}

function hasSavedStructure(doc) {
  if (!doc.units?.length) return false;
  const layer = layerState(doc, "units");
  return layer?.state !== "provisional" || layer.accepted || !!doc.relations?.length ||
    doc.units.some(unit => unit.label != null || unit.number != null || unit.lang || unit.style || unit.open?.start || unit.open?.end) ||
    doc.page.regions.some(region => region.lines?.some(line => line.end != null || line.style));
}

// Keep the structure of existing books. Apply rules to runs of ungrouped pages so
// a generated section never spans a saved section or a gap in the transcription.
export function readingProjection(pages, saved, types, skipped) {
  const docs = readingDocuments(pages, saved, skipped);
  const report = { numberBreaks: {} };
  const eligible = doc => doc && doc.page.regions.length && !hasSavedStructure(doc);
  for (let start = 0; start < docs.length;) {
    if (!eligible(docs[start])) { start++; continue; }
    let end = start + 1;
    while (end < docs.length && eligible(docs[end])) end++;
    const run = docs.slice(start, end);
    const view = projectBlocks(run.map(doc => doc.page), run, types);
    types = view.types;
    for (const [index, doc] of view.docs.entries()) {
      const label = run[index].page.label;
      if (label != null) {
        doc.page.label = label;
        const printed = run[index].page.regions.find(region => region.type === "page_number");
        if (printed) doc.page.regions.find(region => region.id === printed.id).lines = structuredClone(printed.lines);
      }
      docs[start + index] = doc;
    }
    for (const [name, breaks] of Object.entries(view.report.numberBreaks))
      (report.numberBreaks[name] ||= []).push(...breaks);
    start = end;
  }
  const { noteTypes, mainTypes } = noteTypesOf(types);
  for (const [type, path] of regionTypePaths(types))
    if (types.types[type].region && types.types[path[0]].flow === "main") mainTypes.add(type);
  return { docs, types, report, noteTypes, mainTypes };
}

export function blockContext(doc) {
  const contexts = new Map(), units = new Map(doc?.units.map(unit => [unit.id, unit]));
  function visit(id, containers) {
    const unit = units.get(id);
    if (!unit) return;
    const path = unit.children.some(child => child.unit) ? [...containers, unit] : containers;
    for (const child of unit.children) {
      if (child.unit) visit(child.unit, path);
      else contexts.set(ridOf(child.region), { unit, containers });
    }
  }
  for (const id of Object.values(doc?.flows || {}).flat()) visit(id, []);
  return contexts;
}

export function pageBlocks(doc, types, context) {
  const regions = orderedRegions(doc, types);
  if (!context?.size) return regions;
  const positions = new Map([...context.keys()].map((id, index) => [id, index]));
  return regions.sort((a, b) => (positions.get(a.id) ?? Infinity) - (positions.get(b.id) ?? Infinity));
}
