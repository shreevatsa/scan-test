// Export a book's blocks as JSON, or compare that round trip with the normal Read path.
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { gzipSync } from "node:zlib";
import { readChaya } from "../js/chayapdf.js";
import { toSimple, fromSimple } from "../js/simple-format.js";
import { bookReading, isBlocksPage } from "../js/reading.js";
import { bookText, prepare } from "../js/reader.js";
import { hasReading } from "../js/workflow.js";
import { blocksContext, countOverrides, fromBlocks } from "../js/blocks-format.js";
import { verseExport } from "../js/verses.js";
import { convertBook } from "./chaya_blocks.mjs";

const encode = value => JSON.stringify(value);
const bytes = value => Buffer.byteLength(encode(value));
const keyOf = (files, id) => Object.hasOwn(files, `edits/${id}.json`) ? `edits/${id}.json` : `pages/${id}.json`;

function attachmentBytes(data) {
  const out = { pages: 0, work: 0, other: bytes({ ...data, files: {} }) };
  const entries = Object.entries(data.files);
  out.other += Math.max(0, entries.length - 1); // commas between file entries
  for (const [path, value] of entries) {
    const group = /^(pages|edits)\//.test(path) ? "pages" : path.startsWith("work/") ? "work" : "other";
    out[group] += bytes(path) + 1 + bytes(value); // quoted path, colon, serialized value
  }
  return { ...out, total: out.pages + out.work + out.other };
}

async function load(input, measure = true) {
  const pdf = readFileSync(input);
  const { data } = await readChaya(pdf);
  if (!data?.files?.["book.json"]) throw new Error("This PDF has no Chaya book attachment.");
  const { files } = data, manifest = files["book.json"];
  const effective = Object.fromEntries(["book.json", "types.json", "style.json"]
    .filter(key => Object.hasOwn(files, key)).map(key => [key, files[key]]));
  for (const { id } of manifest.pages) {
    const key = keyOf(files, id);
    if (Object.hasOwn(files, key)) effective[key] = files[key];
  }
  return { files: effective, sizes: measure ? { pdf: pdf.length, attachment: attachmentBytes(data) } : null };
}

function convert(files) {
  const book = files["book.json"], types = files["types.json"], skipped = new Set(book.skipped);
  const keys = book.pages.filter(page => !skipped.has(page.id)).map(page => keyOf(files, page.id));
  const docs = keys.map(key => files[key] ?? null);
  if (!docs.some(doc => doc && !isBlocksPage(doc))) return { legacyPages: 0, pageMismatches: [], assembledBookSame: true };
  const blocks = docs.flatMap((doc, index) => isBlocksPage(doc) ? [[keys[index], doc]] : []);
  if (blocks.length) {
    const context = blocksContext(docs, book.rules);
    for (const [key, doc] of blocks) files[key] = fromBlocks(doc, types, context);
  }
  const report = convertBook(files);
  for (const [key, doc] of blocks) files[key] = doc;
  return { legacyPages: docs.filter(doc => doc && !isBlocksPage(doc)).length,
    pageMismatches: report.mismatches, assembledBookSame: report.assembledBookSame };
}

function readBook(files, all = false) {
  const manifest = files["book.json"], types = files["types.json"], skipped = new Set(manifest.skipped);
  const docs = manifest.pages.filter(page => !skipped.has(page.id)).map(page => files[keyOf(files, page.id)])
    .filter(doc => doc && (all || hasReading(doc, types)));
  const view = bookReading(manifest.pages, docs, types, skipped, manifest.rules);
  return prepare(view.docs, view.types, files["style.json"] || null);
}

function contentsOf(P) {
  const out = [];
  function visit(id, flow, depth) {
    const unit = P.units[id], children = unit.children.filter(child => child.unit);
    if (!children.length) return;
    out.push({ flow, depth, type: unit.type, number: unit.number ?? null, label: unit.label ?? null });
    for (const child of children) visit(child.unit, flow, depth + 1);
  }
  for (const [flow, ids] of Object.entries(P.book.flows)) for (const id of ids) visit(id, flow, 0);
  return out;
}

function noteLinksOf(P) {
  const refs = id => P.units[id]?.children.flatMap(child => child.region ? [child.region] : refs(child.unit)) ?? [];
  return Object.entries(P.noteOf).sort(([a], [b]) => a.localeCompare(b)).map(([anchor, target]) => [anchor, refs(target)]);
}

function compare(before, after) {
  const examples = [], unmatched = new Map();
  let positionalDifferences = 0;
  for (let i = 0; i < Math.max(before.length, after.length); i++) {
    const a = before[i], b = after[i];
    if (isDeepStrictEqual(a, b)) continue;
    positionalDifferences++;
    if (examples.length < 12) examples.push({ position: i + 1, before: a ?? null, after: b ?? null });
    if (i < before.length) {
      const key = encode(a);
      unmatched.set(key, (unmatched.get(key) || 0) + 1);
    }
    if (i < after.length) {
      const key = encode(b);
      unmatched.set(key, (unmatched.get(key) || 0) - 1);
    }
  }
  let beforeOnly = 0, afterOnly = 0;
  for (const count of unmatched.values()) {
    if (count > 0) beforeOnly += count;
    else afterOnly -= count;
  }
  return { identical: positionalDifferences === 0, before: before.length, after: after.length,
    positionalDifferences, beforeOnly, afterOnly, examples };
}

function compareVerses(before, after) {
  const keys = compare(before.map(verse => verse.key), after.map(verse => verse.key));
  const partsOf = verses => verses.flatMap(verse => verse.parts.map(({ role, text }) => [verse.key, role, text]));
  const boxesOf = verses => verses.flatMap(verse => verse.parts.flatMap(({ role, regions }, part) =>
    regions.map(({ page, pdf_page, label, box, width, height }) => ({ key: verse.key, part, role, page, pdf_page, label, box, width, height }))));
  const parts = compare(partsOf(before), partsOf(after));
  const a = boxesOf(before), b = boxesOf(after), boxes = compare(a, b);
  const causes = { normalization: 0, outlineBounds: 0, partLocations: 0 };
  let maxPixelDelta = 0;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (isDeepStrictEqual(a[i], b[i])) continue;
    const { box: oldBox, ...old } = a[i] || {}, { box: newBox, ...now } = b[i] || {};
    if (!isDeepStrictEqual(old, now) || !oldBox || !newBox) { causes.partLocations++; continue; }
    const normalized = oldBox.map((value, j) => {
      const side = j % 2 ? old.height : old.width;
      return Math.round(Math.round(value / side * 10000) / 10000 * side);
    });
    causes[isDeepStrictEqual(normalized, newBox) ? "normalization" : "outlineBounds"]++;
    maxPixelDelta = Math.max(maxPixelDelta, ...oldBox.map((value, j) => Math.abs(value - newBox[j])));
  }
  return { identical: keys.identical && parts.identical, keys, parts, boxes: { ...boxes, causes, maxPixelDelta } };
}

function count(target, name, by = 1) { target[name] = (target[name] || 0) + by; }

function dropLineBoxes(simple) {
  const strip = ({ lines, ...region }) => region;
  return { ...simple, pages: simple.pages.map(page => page.regions ? { ...page, regions: page.regions.map(strip) } : page) };
}

function inventory(simple, original, P) {
  const types = simple.types, skipped = new Set(original["book.json"].skipped);
  const fields = name => Object.fromEntries(Object.entries(types.types)
    .filter(([, type]) => Object.hasOwn(type, name)).map(([id, type]) => [id, type[name]]));
  const used = new Set(P.book.units.map(unit => unit.type));
  const containerTypes = new Set(P.book.units.filter(unit => unit.children.some(child => child.unit)).map(unit => unit.type));
  const relations = Object.groupBy(P.book.relations, link => link.type);
  const usage = {
    contains: { declared: fields("contains"), used: [...containerTypes].filter(type => types.types[type]?.contains) },
    flow: { declared: fields("flow"), used: [...used].filter(type => types.types[type]?.flow) },
    numbered: { declared: fields("numbered"), unitsWithNumbers: P.book.units.filter(unit => unit.number != null).length },
    flows: { declared: Object.keys(types.flows), used: Object.keys(P.book.flows).filter(flow => P.book.flows[flow].length) },
    relations: { declared: Object.keys(types.relations || {}), used: Object.fromEntries(Object.entries(relations).map(([type, items]) => [type, items.length])) },
    conventions: types.conventions == null ? null : { bytes: bytes(types.conventions) },
  };
  const out = { pages: simple.pages.length, skipped: skipped.size, pending: 0, pagesWithOverrides: 0, overrides: {}, pagesByOverrideKind: {},
    regions: 0, linesWithBoxes: 0, blocksWithoutLinePieces: 0, ends: 0, defaultEnds: 0, unreadPieces: 0, literalLineBreakBlocks: 0,
    sourceLineIdBlocks: 0, areas: { unassigned: 0, proposed: 0, leftOut: 0, leftOutWithProposal: 0, withoutGeometry: 0 },
    discarded: { skippedPagesWithDocuments: 0, skippedBlocks: 0, areasWithText: 0, uncoveredLines: 0, regionsSkipped: 0, blockTypeProposals: 0,
      lineStyles: 0, withinPageSourceBreaks: 0, styleSheet: Boolean(original["style.json"]) },
    types: usage };
  for (const page of simple.pages) {
    const doc = original[keyOf(original, page.id)];
    if (page.skip) {
      if (doc) { out.discarded.skippedPagesWithDocuments++; out.discarded.skippedBlocks += doc.page.regions.length; }
      continue;
    }
    if (page.pending) { out.pending++; continue; }
    if (page.structure) {
      out.pagesWithOverrides++;
      for (const [kind, n] of Object.entries(countOverrides(page.structure))) {
        count(out.overrides, kind, n);
        count(out.pagesByOverrideKind, kind);
      }
    }
    for (const block of page.regions) {
      if (block.type === "?") {
        count(out.areas, block.left_out ? "leftOut" : block.proposed ? "proposed" : "unassigned");
        if (block.left_out && block.proposed) out.areas.leftOutWithProposal++;
      } else {
        out.regions++;
        out.linesWithBoxes += block.lines?.filter(Boolean).length ?? 0;
        if (block.text == null) out.blocksWithoutLinePieces++;
        out.ends += Object.keys(block.ends || {}).length;
        out.defaultEnds += block.default_ends?.length ?? 0;
        out.unreadPieces += block.unread?.length ?? 0;
        if (block.line_breaks) out.literalLineBreakBlocks++;
        if (block.line_ids) out.sourceLineIdBlocks++;
      }
    }
    const { source, page: savedPage } = doc;
    const areas = [...source?.omitted_regions || [], ...source?.ignored_regions || []];
    out.areas.withoutGeometry += areas.length - page.regions.filter(region => region.type === "?").length;
    out.discarded.areasWithText += areas.filter(area => area.text?.length || area.block?.lines?.some(line => line.text)).length;
    out.discarded.uncoveredLines += source?.uncovered_lines?.length || 0;
    out.discarded.regionsSkipped += source?.regions_skipped?.length || 0;
    out.discarded.blockTypeProposals += savedPage.regions.filter(region => region.source?.kept_as || region.source?.proposed_type).length;
    out.discarded.lineStyles += savedPage.regions.reduce((n, region) => n + (region.lines || []).filter(line => line.style).length, 0);
    if (source?.sample?.consecutive_next === false || source?.sample?.consecutive_previous === false) out.discarded.withinPageSourceBreaks++;
  }
  return out;
}

function sameReading(before, after) {
  return {
    text: compare(bookText(before).split("\n"), bookText(after).split("\n")),
    contents: compare(contentsOf(before), contentsOf(after)),
    labels: compare(before.book.pages.map(page => [page.id, page.label ?? null]), after.book.pages.map(page => [page.id, page.label ?? null])),
    noteLinks: compare(noteLinksOf(before), noteLinksOf(after)),
  };
}

export async function checkSimpleFile(input) {
  const { files: original, sizes } = await load(input);
  const converted = { ...original }, conversion = convert(converted);
  const simple = toSimple(converted), json = encode(simple) + "\n", recovered = fromSimple(JSON.parse(json));
  const before = readBook(original), after = readBook(recovered), metrics = sameReading(before, after);
  const manifest = original["book.json"];
  const edition = /(?:kale|telang|gopinath|vavilla)/i.test(`${manifest.book_id} ${basename(input)}`);
  const verseView = edition ? verseExport(readBook(recovered, true).book, after.tl, recovered["book.json"]) : null;
  const verses = edition ? compareVerses(verseExport(readBook(original, true).book, before.tl, manifest), verseView) : null;
  let withoutLineBoxes;
  try {
    const stripped = fromSimple(dropLineBoxes(simple));
    const strippedReading = readBook(stripped);
    withoutLineBoxes = { reading: sameReading(after, strippedReading), verses: edition ?
      compareVerses(verseView, verseExport(readBook(stripped, true).book, strippedReading.tl, stripped["book.json"])) : null };
  } catch (error) {
    withoutLineBoxes = { error: error.message };
  }
  let conversionReading = null;
  if (conversion.legacyPages && Object.values(metrics).some(metric => !metric.identical))
    conversionReading = sameReading(before, readBook(converted));
  const report = { book: manifest.title, bookId: manifest.book_id, input: basename(input), sizes: {
    ...sizes, simple: Buffer.byteLength(json), simpleGzip: gzipSync(json).length,
  }, inventory: inventory(simple, original, before), conversion, reading: metrics, verses, conversionReading, withoutLineBoxes,
  assemblyWarnings: { before: before.warnings.length, after: after.warnings.length } };
  return { json, report };
}

function summary(report) {
  const { inventory, reading, verses, sizes } = report;
  const flags = Object.entries(reading).map(([name, value]) => `${name} ${value.identical ? "same" : "differs"}`);
  if (verses) flags.push(`verses ${verses.identical ? "same" : "differ"}`, `verse boxes ${verses.boxes.identical ? "same" : "differ"}`);
  return `${inventory.pages} pages · ${sizes.simple.toLocaleString("en-US")} JSON bytes · ${flags.join(", ")}`;
}

function saveJSON(path, text) {
  if (!path.endsWith(".json")) throw new Error("Output must have a .json extension.");
  writeFileSync(path, text, { flag: "wx", mode: 0o600 });
}

async function main([command, input, ...rest]) {
  if (!input || !(command === "export" && rest.length === 1 || command === "check" &&
      (rest.length === 0 || rest.length === 2 && rest[0] === "--report"))) {
    console.error("Usage: chaya_simple.mjs export IN.chaya.pdf OUT.json | check IN.chaya.pdf [--report OUT.json]");
    process.exitCode = 2;
    return;
  }
  if (command === "export") {
    const { files } = await load(input, false);
    convert(files);
    const out = toSimple(files);
    saveJSON(rest[0], encode(out) + "\n");
    console.log(`Exported ${out.pages.length} pages.`);
  } else {
    const { report } = await checkSimpleFile(input);
    if (rest.length) saveJSON(rest[1], JSON.stringify(report, null, 2) + "\n");
    console.log(summary(report));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main(process.argv.slice(2));
