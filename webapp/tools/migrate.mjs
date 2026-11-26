// Convert a legacy book to version 1 after verifying its assembled reading.
import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { access, link, mkdir, mkdtemp, readFile, realpath, rm, stat, unlink, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { assemble } from "../js/assemble.js";
import { blocksContext, fromBlocks } from "../js/blocks-format.js";
import { effectiveEnd, toPageDocs } from "../js/chaya-book.js";
import { readBook, readChaya, writeBook } from "../js/chayapdf.js";
import { canonical } from "../js/ops.js";
import { bookText, prepare } from "../js/reader.js";
import { bookReading, isBlocksPage } from "../js/reading.js";
import { bbox } from "../js/render.js";
import { verseExport } from "../js/verses.js";
import { convertBook } from "./chaya_blocks.mjs";

const verseBooks = new Set(["kale-1913", "telang-dli", "gopinath-1914-full", "gopinath-1896-full", "vavilla"]);
const pagePath = (files, id) => files[`edits/${id}.json`] ? `edits/${id}.json` : `pages/${id}.json`;
const pick = (object, keys) => Object.fromEntries(keys.filter(key => Object.hasOwn(object, key)).map(key => [key, object[key]]));
const unitAttrs = unit => pick(unit, ["number", "label", "lang", "style", "open"]);
const regionKey = (page, region) => `${page}#${region}`;
const polygonBox = polygons => polygons?.some(ring => ring.length) ? bbox(polygons) : undefined;
const regionBox = region => region.box ?? region.model_box ?? polygonBox(region.polygons);
const validBox = box => box?.length === 4 && box.every(Number.isFinite);
const same = isDeepStrictEqual;

function legacyView(files) {
  const manifest = files["book.json"], types = files["types.json"], skipped = new Set(manifest.skipped);
  const paths = manifest.pages.filter(page => !skipped.has(page.id)).map(page => pagePath(files, page.id));
  const docs = paths.map(path => files[path] ?? null);
  const legacy = docs.filter(doc => doc && !isBlocksPage(doc)).length;
  if (!legacy) return { files, legacy };
  const effective = { "book.json": manifest, "types.json": types, "style.json": files["style.json"] };
  const context = blocksContext(docs, manifest.rules);
  for (const [index, doc] of docs.entries()) if (doc) effective[paths[index]] = isBlocksPage(doc) ? fromBlocks(doc, types, context) : doc;
  const conversion = convertBook(effective);
  if (!conversion.assembledBookSame) throw new Error("The legacy-to-blocks conversion changed saved structure.");
  for (const [index, doc] of docs.entries()) if (isBlocksPage(doc)) effective[paths[index]] = doc;
  return { files: effective, legacy };
}

function writeRegion(region, asFraction, types, ownerKind) {
  const box = regionBox(region);
  if (!validBox(box)) throw new Error(`Region ${region.id} has no usable box.`);
  const kind = types[region.type]?.region;
  const out = { id: region.id, type: region.type, box: asFraction(box), lines: (region.lines ?? []).map(line => {
    const result = pick(line, ["text", "spans", "style"]);
    if (result.spans) result.spans = structuredClone(result.spans);
    const box = polygonBox(line.polygons) ?? line.box;
    if (validBox(box)) result.box = asFraction(box);
    // This is the old reader's fallback, including prose hyphens that it kept before v1.
    const end = line.end || (["verse", "table"].includes(ownerKind) ? "line" : "space");
    if (end !== effectiveEnd(result, kind)) result.end = end;
    return result;
  }) };
  const source = region.source;
  if (source?.kept_as && source.proposed_type) out.proposed = source.proposed_type;
  if (source?.transcription?.uncertain) out.uncertain = true;
  if (source?.transcription?.note != null) out.note = source.transcription.note;
  return out;
}

function collectTree(assembled, oldTypes) {
  const byId = new Map(assembled.units.map(unit => [unit.id, unit]));
  const refInfo = new Map(), destination = new Map(), containers = {};
  let nextContainer = 0;
  function walk(unit, path, flow) {
    const extraFlow = !path.length && (oldTypes[unit.type]?.flow ?? "main") !== flow ? { flow } : {};
    if (unit.children.some(child => child.unit)) {
      const id = `c${++nextContainer}`, nested = [...path, id];
      containers[id] = { type: unit.type, ...unitAttrs(unit), ...extraFlow };
      destination.set(unit.id, { container: id });
      for (const child of unit.children) {
        if (child.unit) walk(byId.get(child.unit), nested, flow);
        else refInfo.set(child.region, { flow, kind: oldTypes[unit.type]?.region, attrs: { in: nested, direct: true } });
      }
      return;
    }
    unit.children.forEach(({ region }, index) => {
      const first = index === 0;
      if (first) destination.set(unit.id, { region });
      refInfo.set(region, { flow, kind: oldTypes[unit.type]?.region, unitType: unit.type, attrs: {
        ...(path.length ? { in: path } : {}), ...extraFlow, ...(first ? unitAttrs(unit) : {}),
        ...(index < unit.children.length - 1 ? { continues: true } : {}),
      } });
    });
  }
  for (const [flow, ids] of Object.entries(assembled.flows)) for (const id of ids) walk(byId.get(id), [], flow);
  return { refInfo, containers, destination };
}

// Respect a hand-edited flow order while retaining the page's slots for other flows and furniture.
function orderRegions(page, refInfo, rank) {
  const regions = [...page.regions].sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity));
  const flow = region => refInfo.get(regionKey(page.id, region.id))?.flow;
  const byFlow = new Map();
  for (const region of regions) if (flow(region) != null) {
    if (!byFlow.has(flow(region))) byFlow.set(flow(region), []);
    byFlow.get(flow(region)).push(region);
  }
  for (const group of byFlow.values()) group.sort((a, b) => rank.get(regionKey(page.id, b.id)) - rank.get(regionKey(page.id, a.id)));
  return regions.map(region => byFlow.get(flow(region))?.pop() ?? region);
}

function moveLinks(assembled, destination, regions, anchors) {
  for (const [order, { type, from, to }] of assembled.relations.entries()) {
    const dest = destination.get(to.unit);
    const target = dest?.container ?? regions.get(dest?.region)?.address;
    if (!target) throw new Error(`A ${type} relation has no stored target.`);
    const found = regions.get(from.region);
    const line = from.line == null ? null : found?.old.lines?.findIndex(value => value.line === from.line);
    if (from.region != null && (!found || (from.line != null && (line == null || line < 0))))
      throw new Error(`Cannot place source of a ${type} link.`);
    if (type === "note" && from.anchor) {
      const span = anchors.get(from.anchor);
      if (!span || span.to) throw new Error(`Cannot attach note relation ${from.anchor} to one note marker.`);
      span.to = target;
      span.link = { order };
      if (found) span.link.source = { region: found.address, ...(line != null ? { line } : {}) };
      if (from.marker !== span.marker) span.link.marker = from.marker ?? null;
    } else {
      if (!found) throw new Error(`A ${type} link has no source region.`);
      (found.region.links ||= []).push({ type, ...(line != null ? { line } : {}), ...pick(from, ["marker"]), to: target, order });
    }
  }
}

function makeBook(original, effective, docs, assembled, oldTypes) {
  const manifest = original["book.json"], rawTypes = oldTypes.types;
  const { refInfo, containers, destination } = collectTree(assembled, rawTypes);
  const rank = new Map([...refInfo.keys()].map((ref, index) => [ref, index]));
  const seen = new Map(docs.filter(Boolean).map(doc => [doc.page.id, doc.page]));
  const regions = new Map(), anchors = new Map();
  const unplaceable = [];
  const skipped = new Set(manifest.skipped);
  const book = { chaya: 1, title: manifest.title ?? oldTypes.title,
    ...pick(oldTypes, ["description", "languages", "conventions", "flows", "relations"]),
    ...pick(manifest, ["description", "languages", "conventions", "rules"]),
    types: Object.fromEntries(Object.entries(rawTypes).map(([name, { region, role, ...type }]) => [name,
      { ...type, ...(region !== undefined ? { kind: region } : {}), ...(role === "furniture" ? { furniture: true } : {}) }])),
    ...(manifest.pdf != null ? { source: pick(manifest.pdf, ["name", "sha256"]) } : {}),
    ...(manifest.reader_options != null ? { reading: manifest.reader_options } : {}),
    ...(original["style.json"] != null ? { stylesheet: original["style.json"] } : {}),
    ...(Object.keys(containers).length ? { containers } : {}),
  };

  book.pages = manifest.pages.map((entry, index) => {
    const path = pagePath(original, entry.id), raw = original[path], converted = effective[path] ?? raw;
    const fromView = seen.get(entry.id), page = fromView ?? raw?.page;
    const size = [page?.width ?? entry.width, page?.height ?? entry.height];
    if (!size.every(value => Number.isInteger(value) && value > 0)) throw new Error(`Missing page size for ${entry.id}.`);
    const label = fromView ? fromView.label : page?.label ?? entry.label;
    const out = { id: entry.id, pdf_page: entry.pdf_page, size, ...(label != null ? { label } : {}) };
    if (entry.pdf_part) out.crop = [entry.pdf_part[0], 0, entry.pdf_part[1], 1];
    if (skipped.has(entry.id)) out.skip = true;
    if (Object.keys(converted?.overrides ?? {}).length) book.structure_edited = true;
    if (!page) return out;
    const asFraction = ([x0, y0, x1, y1]) => [x0 / size[0], y0 / size[1], x1 / size[0], y1 / size[1]];
    out.regions = orderRegions(page, refInfo, rank).map(value => {
      const ref = regionKey(entry.id, value.id);
      const stored = refInfo.get(ref);
      const region = writeRegion(value, asFraction, rawTypes, stored ? stored.kind : rawTypes[value.type]?.region);
      if (stored) {
        Object.assign(region, stored.attrs);
        if (stored.unitType && stored.unitType !== value.type) region.unit_type = stored.unitType;
      } else if (!out.skip && rawTypes[value.type]?.role !== "furniture") region.out = true;
      regions.set(ref, { region, old: value, address: `${index + 1}/${value.id}` });
      for (const line of region.lines) for (const span of line.spans ?? []) if (span.kind === "note_marker" && span.id != null) {
        anchors.set(regionKey(entry.id, span.id), span);
      }
      return region;
    });

    const used = new Set(out.regions.map(region => region.id));
    let next = 1;
    for (const key of ["omitted_regions", "ignored_regions", "ignored_lines"]) for (const area of raw.source?.[key] ?? []) {
      const box = (area.block && regionBox(area.block)) ?? regionBox(area);
      if (!validBox(box)) { unplaceable.push({ page: entry.id, kind: key, id: area.region ?? area.line_id ?? area }); continue; }
      let id = area.block?.id ?? area.region;
      if (!id || used.has(id)) {
        do { id = `area${next++}`; } while (used.has(id));
      }
      used.add(id);
      const region = area.block ? writeRegion({ ...area.block, id, box }, asFraction, rawTypes, rawTypes[area.block.type]?.region)
        : { id, type: "?", box: asFraction(box), ...(area.proposed_type ? { proposed: area.proposed_type } : {}) };
      if (key !== "omitted_regions") region.out = true;
      if (area.block && Number.isInteger(area.block.order)) out.regions.splice(Math.max(0, area.block.order - 1), 0, region);
      else out.regions.push(region);
    }
    return out;
  });
  moveLinks(assembled, destination, regions, anchors);
  return { book, unplaceable };
}

function comparison(before, after) {
  if (same(before, after)) return { identical: true };
  function firstDifference(a, b, path) {
    if (a == null || b == null || typeof a !== "object" || typeof b !== "object") return { path, before: a ?? null, after: b ?? null };
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (!same(a[key], b[key])) return firstDifference(a[key], b[key], [...path, key]);
    }
    return { path, before: a, after: b };
  }
  return { identical: false, ...firstDifference(before, after, []) };
}

function normalizedStructure(book) {
  const units = new Map(book.units.map(unit => [unit.id, unit])), at = new Map(), tree = {};
  const entries = new Map(book.pages.flatMap(page => page.regions.map(region => [regionKey(page.id, region.id), region])));
  function visit(id, path) {
    const unit = units.get(id);
    if (!unit || at.has(id)) throw new Error(`Unexpected unit reference ${id} in the reading tree.`);
    at.set(id, path);
    const children = unit.children.map((child, i) => child.unit ? visit(child.unit, [...path, i]) : { region: child.region });
    return { type: unit.type, ...unitAttrs(unit), children };
  }
  for (const [flow, ids] of Object.entries(book.flows)) tree[flow] = ids.map((id, i) => visit(id, [flow, i]));
  if (at.size !== units.size) throw new Error("An assembled unit is missing from the reading tree.");
  const relations = book.relations.map(({ type, from, to }) => {
    const source = { ...from };
    if (source.line != null && source.region) {
      source.line = entries.get(source.region)?.lines.findIndex(line => line.line === source.line);
      if (source.line == null || source.line < 0) throw new Error(`A ${type} relation points to a missing line.`);
    }
    if (!at.has(to.unit)) throw new Error(`A ${type} relation points to a missing unit.`);
    return canonical({ type, from: source, to: { ...to, unit: at.get(to.unit) } });
  }).sort();
  const roots = Object.entries(tree).map(([flow, nodes]) => [flow, nodes.map(({ type, children }) => [type, firstRegion(children)])]);
  return { tree, roots, relations };
}

function firstRegion(children) {
  for (const child of children) {
    const ref = child.region ?? firstRegion(child.children);
    if (ref != null) return ref;
  }
}

function compareText(original, projected) {
  if (original === projected) return { identical: true, length: original.length };
  let offset = 0;
  while (original[offset] === projected[offset]) offset++;
  return { identical: false, offset, before: original.slice(Math.max(0, offset - 35), offset + 105),
    after: projected.slice(Math.max(0, offset - 35), offset + 105) };
}

function compareVerses(before, after) {
  const content = data => data.map(({ key, parts }) => ({ key, parts: parts.map(({ regions, ...part }) => ({
    ...part, locations: regions.map(({ box, ...location }) => location),
  })) }));
  const boxes = data => data.flatMap(verse => verse.parts.flatMap(part => part.regions.map(region => region.box)));
  const a = boxes(before), b = boxes(after);
  return { ...comparison(content(before), content(after)), verses: before.length, boxesBefore: a.length, boxesAfter: b.length,
    changedBoxes: a.reduce((n, box, i) => n + Number(!same(box, b[i])), Math.max(b.length - a.length, 0)) };
}

function inlineReading(book) {
  return book.pages.flatMap(page => page.regions.map(region => [regionKey(page.id, region.id),
    (region.lines ?? []).map(line => pick(line, ["text", "spans", "style"]))])).sort(([a], [b]) => a < b ? -1 : 1);
}

function addedFields(book) {
  const regions = book.pages.flatMap(page => page.regions ?? []);
  const spans = regions.flatMap(region => (region.lines ?? []).flatMap(line => line.spans ?? []));
  const containers = Object.values(book.containers ?? {});
  return {
    pageIds: book.pages.filter(page => page.id != null).length, pageSizes: book.pages.filter(page => page.size != null).length,
    open: [...regions, ...containers].filter(unit => unit.open).length, unitType: regions.filter(region => region.unit_type).length,
    direct: regions.filter(region => region.direct).length, flow: [...regions, ...containers].filter(unit => unit.flow).length,
    markerIds: spans.filter(span => span.kind === "note_marker" && span.id != null).length,
    markerLinks: spans.filter(span => span.link).length, source: spans.filter(span => span.link?.source).length,
    differentMarker: spans.filter(span => span.link && Object.hasOwn(span.link, "marker")).length,
    linkOrders: regions.reduce((n, region) => n + (region.links ?? []).filter(link => link.order != null).length, 0),
    regionLinkMarkers: regions.reduce((n, region) => n + (region.links ?? []).filter(link => Object.hasOwn(link, "marker")).length, 0),
  };
}

function inventory(book, unplaceable) {
  const all = book.pages.flatMap(page => page.regions ?? []);
  return { containers: Object.keys(book.containers ?? {}).length, continues: all.filter(region => region.continues).length,
    ends: all.reduce((n, region) => n + (region.lines ?? []).filter(line => line.end != null).length, 0),
    unknown: all.filter(region => region.type === "?").length, out: all.filter(region => region.out).length,
    proposed: all.filter(region => region.proposed).length, unplaceable: unplaceable.length };
}

export function migrateFiles(files, { verses = false } = {}) {
  const manifest = files["book.json"], tl = files["types.json"];
  if (!manifest || !tl) throw new Error("Expected legacy book.json and types.json attachments.");
  const { files: effective, legacy } = legacyView(files);
  const docs = manifest.pages.map(page => effective[pagePath(effective, page.id)]).filter(Boolean);
  const old = bookReading(manifest.pages, docs, tl, new Set(manifest.skipped), manifest.rules);
  const [assembled] = assemble(old.docs, old.types);
  const { book, unplaceable } = makeBook(files, effective, old.docs, assembled, old.types);
  const json = JSON.stringify(book);
  const stored = JSON.parse(json);
  const next = toPageDocs(stored);
  const [converted] = assemble(next.docs, next.types);
  const a = normalizedStructure(assembled), b = normalizedStructure(converted);
  const labels = book => book.pages.map(page => [page.id, page.label ?? null]);
  const comparisons = {
    tree: comparison(a.tree, b.tree),
    flows: comparison(a.roots, b.roots),
    relations: comparison(a.relations, b.relations),
    text: compareText(bookText(prepare(old.docs, old.types, files["style.json"])), bookText(prepare(next.docs, next.types, stored.stylesheet))),
    labels: comparison(labels(assembled), labels(converted)),
    inline: comparison(inlineReading(assembled), inlineReading(converted)),
    verses: verses ? compareVerses(verseExport(assembled, old.types, manifest), verseExport(converted, next.types, stored)) : null,
  };
  return { book: stored, report: { passed: Object.values(comparisons).every(result => result == null || result.identical),
    pages: manifest.pages.length, legacy, sizes: { json: Buffer.byteLength(json) }, comparisons, counts: inventory(stored, unplaceable), additions: addedFields(stored), unplaceable } };
}

// The stdlib ZIP writer supports large archives and stores the exact old paths. JSON attachments were already parsed
// by readChaya; serialize their values back to JSON, and use the original text of every other attachment.
const zipScript = `
import json, os, sys, zipfile
os.umask(0o077)
sys.stdin.reconfigure(encoding="utf-8")
with zipfile.ZipFile(sys.argv[1], "x", compression=zipfile.ZIP_DEFLATED, compresslevel=4) as archive:
    for line in sys.stdin:
        name, text = json.loads(line)
        archive.writestr(name, text.encode("utf-8"))
with zipfile.ZipFile(sys.argv[1]) as archive:
    damaged = archive.testzip()
    if damaged is not None:
        raise ValueError(f"ZIP CRC check failed for {damaged}")
`;

async function writeSidecar(path, files) {
  const child = spawn("python3", ["-c", zipScript, path], { stdio: ["pipe", "ignore", "inherit"] });
  const result = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", code => code === 0 ? resolve() : reject(new Error(`Sidecar writer exited with code ${code}.`)));
  });
  function* entries() {
    for (const [name, value] of Object.entries(files)) {
      yield JSON.stringify([name, typeof value === "string" && !name.endsWith(".json") ? value : JSON.stringify(value)]) + "\n";
    }
  }
  await Promise.all([result, pipeline(Readable.from(entries()), child.stdin)]);
}

const reportText = report => JSON.stringify(report, null, 2) + "\n";
const newFile = { flag: "wx", mode: 0o600 };

async function verifyDestinations(paths) {
  for (const path of paths) {
    const exists = await access(path, constants.F_OK).then(() => true, error => {
      if (error.code === "ENOENT") return false;
      throw error;
    });
    if (exists) throw new Error(`Destination already exists: ${path}`);
  }
}

async function publish(dir, name, original, files, book, report) {
  const stage = await mkdtemp(join(dir, ".migrate-"));
  const written = [];
  try {
    const pdf = await writeBook(original, book);
    const saved = await readBook(pdf);
    if (!saved.recovered || Buffer.compare(original, saved.original) !== 0 || !same(book, saved.data))
      throw new Error("Verification failed for the generated PDF or its attachment.");
    await writeFile(join(stage, "book"), pdf, newFile);
    const zip = join(stage, "sidecar");
    await writeSidecar(zip, files);
    report.sizes.pdf = pdf.length;
    report.sizes.sidecar = (await stat(zip)).size;
    await writeFile(join(stage, "report"), reportText(report), newFile);
    for (const [file, suffix] of [["book", ".chaya.pdf"], ["sidecar", ".work.zip"], ["report", ".migration.json"]]) {
      const destination = join(dir, name + suffix);
      await link(join(stage, file), destination);
      written.push(destination);
    }
  } catch (error) {
    for (const path of written) await unlink(path);
    throw error;
  } finally {
    await rm(stage, { recursive: true });
  }
}

async function main(args) {
  const check = args.includes("--check");
  const [input, dir, extra] = args.filter(arg => arg !== "--check");
  if (!input?.endsWith(".chaya.pdf") || !dir || extra) {
    console.error("Usage: node webapp/tools/migrate.mjs IN.chaya.pdf OUT_DIR [--check]");
    process.exitCode = 2;
    return;
  }
  const name = basename(input, ".chaya.pdf");
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const reportPath = join(dir, name + ".migration.json");
  await verifyDestinations(check ? [reportPath] : [reportPath, join(dir, name + ".chaya.pdf"), join(dir, name + ".work.zip")]);
  const inputBytes = await readFile(input);
  let report = { passed: false, sizes: { oldPdf: inputBytes.length } };
  try {
    const { data, original } = await readChaya(inputBytes);
    if (!original || !data?.files) throw new Error("Could not recover the original PDF and its legacy attachments.");
    const migrated = migrateFiles(data.files, { verses: verseBooks.has(name) || verseBooks.has(data.files["book.json"]?.book_id) });
    report = { ...migrated.report, sizes: { ...report.sizes, ...migrated.report.sizes } };
    if (report.passed && !check) await publish(dir, name, original, data.files, migrated.book, report);
    else await writeFile(reportPath, reportText(report), newFile);
  } catch (error) {
    report.passed = false;
    report.error = error.message;
    await writeFile(reportPath, reportText(report), newFile);
  }
  console.log(`${report.passed ? "Verified" : "Failed"}: ${name}`);
  if (!report.passed) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(await realpath(process.argv[1])).href)
  await main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
