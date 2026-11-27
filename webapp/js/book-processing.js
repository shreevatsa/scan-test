import * as B from "./book.js?v=20261127-place-areas";
import { finderTypeList, UNCLASSIFIED } from "./chaya-book.js?v=20261127-place-areas";
import { writeRegion } from "./chaya-materialize.js?v=20261127-place-areas";
import { findStructure, scanLabels } from "./book-structure.js?v=20261127-place-areas";
import { applyReading } from "./pipeline/apply.js?v=20261127-place-areas";
import { finderById, finderPath } from "./pipeline/finders.js?v=20261127-place-areas";
import { pageRange } from "./pipeline/pdf.js?v=20261127-place-areas";
import { provisionalDocument } from "./pipeline/provisional.js?v=20261127-place-areas";
import { readerById, readerOptions } from "./pipeline/readers.js?v=20261127-place-areas";
import { Maker, post } from "./pipeline/run.js?v=20261127-place-areas";
import { pageCost, RECIPE } from "./recipe.js?v=20261127-place-areas";

export function processingChoices(book, calls = []) {
  const options = readerOptions({ ...RECIPE, ...book.reading }, book);
  const finder = finderById(options.finder), reader = readerById(options.reader);
  const estimate = profile => profile.usd_per_page ?? pageCost(profile, calls).usd;
  return { options, finder, reader, finderCost: estimate(finder), readerCost: estimate(reader) };
}

export function pagesToProcess(book, scope, index, range, missingOnly = false) {
  const hasGap = region => {
    const type = book.types[region.type];
    return !region.ignored && !type?.ignored && !type?.figure &&
      (!region.lines?.length || region.lines.some(line => line.text == null && !line.spans?.length));
  };
  const eligible = page => !!page && !page.skip && (!missingOnly || page.regions?.some(hasGap));
  if (scope === "unprocessed")
    return book.pages.flatMap((page, i) => eligible(page) && (missingOnly || !page.regions) ? [i] : []);
  if (scope === "range") {
    if (!range.trim()) throw new Error("Enter one or more scan numbers.");
    return pageRange(range, book.pages.length).map(n => n - 1).filter(i => eligible(book.pages[i]));
  }
  return Number.isInteger(index) && eligible(book.pages[index]) ? [index] : [];
}

function cleanSpans(line) {
  if (line.spans) line.spans = line.spans.map(span => {
    if (span.kind !== "note_marker") return span;
    const { id, ...rest } = span;
    return rest;
  });
  return line;
}

// Use the same region conversion as legacy migration. The finder evidence stays in work/.
export function materializeProcessedPage(doc, previous, types, tl, rules) {
  const { width, height } = doc.page, asFraction = box => box.map((value, i) => value / (i % 2 ? height : width));
  const hints = {};
  const regions = [...doc.page.regions].sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity)).map(old => {
    const region = writeRegion(old, asFraction, types, tl.types[old.type]?.region);
    region.lines.forEach(cleanSpans);
    hints[region.id] = { from: !!old.source?.continues_from_earlier, to: !!old.source?.continues_later };
    return region;
  });
  const label = scanLabels(doc.page.regions, rules) ?? previous.label;
  return { page: { ...previous, size: [width, height], ...(label != null ? { label } : {}), regions }, hints };
}

const placement = ["in", "direct", "flow", "number", "label", "lang", "style", "continues", "from_previous", "links"];
const sameBox = (one, two) => one.every((value, i) => Math.abs(value - two[i]) < 0.003);

function restoreMissingText(book, index, saved) {
  const page = book.pages[index];
  if (!page.regions) return { book, restored: 0 };
  const candidates = new Map(saved.regions.map(region => [region.id, region]));
  let restored = 0;
  const regions = page.regions.map(region => {
    const type = book.types[region.type];
    const source = candidates.get(region.id);
    if (region.ignored || type?.ignored || type?.figure || !source || !sameBox(region.box, source.box)) return region;
    const original = region.lines ?? [];
    // Match existing line slots before filling them. A saved empty string is an editor decision.
    if (original.length && (original.length !== source.lines.length ||
        original.some((line, i) => line.box && (!source.lines[i].box || !sameBox(line.box, source.lines[i].box))))) return region;
    const lines = source.lines.map((line, i) => {
      const previous = original[i];
      if (previous?.text != null || previous?.spans?.length || line.text == null) return previous ?? line;
      return { ...line, ...previous, text: line.text };
    });
    if (!lines.some((line, i) => line !== original[i] && line.text?.trim())) return region;
    restored++;
    return { ...(source.uncertain ? { uncertain: true } : {}), ...(source.note ? { note: source.note } : {}),
      ...region, lines };
  });
  return { book: restored ? { ...book, pages: book.pages.with(index, { ...page, regions }) } : book, restored };
}

function keepMarkerLinks(region, old) {
  return region.lines.map((line, i) => {
    if (!line.spans) return line;
    const markers = (old.lines?.[i]?.spans ?? []).filter(span => span.kind === "note_marker");
    let at = 0;
    return { ...line, spans: line.spans.map(span => {
      if (span.kind !== "note_marker") return span;
      const previous = markers[at++];
      return previous?.marker === span.marker && previous.to ? { ...span, to: previous.to } : span;
    }) };
  });
}

export function replaceProcessedPage(book, index, result) {
  const old = book.pages[index];
  if (!old.regions) return { book: { ...book, pages: book.pages.with(index, result.page) }, hints: result.hints };
  const retained = new Set(), used = new Set(old.regions.map(region => region.id));
  for (const region of result.page.regions) used.add(region.id);
  let counter = old.regions.length;
  const fresh = () => {
    let next;
    do { next = `r${++counter}`; } while (used.has(next));
    used.add(next);
    return next;
  };
  const hints = {}, regions = result.page.regions.map(region => {
    const matches = before => !retained.has(before.id) && before.type === region.type && sameBox(before.box, region.box);
    const previous = old.regions.find(before => before.id === region.id && matches(before)) ?? old.regions.find(matches);
    const id = previous?.id ?? (old.regions.some(before => before.id === region.id) ? fresh() : region.id);
    hints[id] = result.hints[region.id];
    const copy = { ...region, id };
    if (!previous) return copy;
    retained.add(id);
    if (!book.structure_edited) return copy;
    for (const field of placement) if (Object.hasOwn(previous, field)) copy[field] = previous[field];
    if (copy.lines) copy.lines = keepMarkerLinks(copy, previous);
    return copy;
  });
  const dropped = old.regions.filter(region => !retained.has(region.id));
  let next = book;
  for (const region of dropped) next = B.deleteRegion(next, `${index + 1}/${region.id}`);
  // Deleting a stale target also removes incoming links on the rest of this page.
  const gone = new Set([...dropped.map(region => `${index + 1}/${region.id}`),
    ...Object.keys(book.containers ?? {}).filter(id => !Object.hasOwn(next.containers ?? {}, id))]);
  for (const region of regions) {
    if (region.links) {
      region.links = region.links.filter(link => !gone.has(link.to) && (link.line == null || link.line < (region.lines?.length ?? 0)));
      if (!region.links.length) delete region.links;
    }
    for (const line of region.lines ?? []) for (const span of line.spans ?? [])
      if (gone.has(span.to)) delete span.to;
  }
  const updated = { ...next, pages: next.pages.with(index, { ...result.page, regions }) };
  return { book: book.structure_edited ? B.preserveJoinTargets(book, updated) : updated, hints };
}

// The finder and reader share the original scan and the book’s work records.
function pipelinePage(session, book, index, tl, options, signal) {
  const page = book.pages[index], pid = page.id ?? String(index + 1);
  let image, imageUrl;
  const state = {
    types: tl,
    async getReaderOptions() { return options; },
    readWork: path => session.readWork(path),
    writeWork: (path, record) => session.writeWork(path, record),
    updateWork: (path, edit) => session.updateWork(path, edit),
    imageBlob: () => image ??= session.scan(page, page.size?.[0] || 1400, signal, page.size?.[1]),
    async imageUrl() { return imageUrl ??= URL.createObjectURL(await state.imageBlob()); },
    dispose() { if (imageUrl) URL.revokeObjectURL(imageUrl); },
  };
  return { state, pid };
}

function outlineWorker(signal) {
  let worker, active;
  const stop = () => {
    worker?.terminate();
    worker = null;
    active?.reject(new Error("Processing stopped."));
    active = null;
  };
  signal.addEventListener("abort", stop, { once: true });
  return {
    async run(pid, url, boxes) {
      signal.throwIfAborted();
      if (!worker) {
        worker = new Worker(new URL("./local/worker.js?v=20261127-place-areas", import.meta.url), { type: "module" });
        worker.onerror = () => {
          active?.reject(new Error("The outline worker failed."));
          active = null;
          worker?.terminate();
          worker = null;
        };
        worker.onmessage = event => { active?.resolve(event.data); active = null; };
      }
      return new Promise((resolve, reject) => {
        active = { resolve, reject };
        worker.postMessage({ id: 1, pid, url, boxes });
      });
    },
    dispose() { signal.removeEventListener("abort", stop); stop(); },
  };
}

function archivedId(archive, page, index) {
  const old = archive?.manifest?.pages?.[index];
  if (!old || old.pdf_page !== page.pdf_page) return null;
  const crop = old.pdf_part ? [old.pdf_part[0], 0, old.pdf_part[1], 1] : null;
  return JSON.stringify(crop) === JSON.stringify(page.crop ?? null) ? old.id : null;
}

async function cachedPage(session, book, index, pid, choices) {
  const readPath = id => `work/readings/${id}/${choices.reader.id}.json`;
  const [localReading, localRegions] = await Promise.all([
    session.readWork(readPath(pid), true), session.readWork(finderPath(pid, choices.finder.id), true),
  ]);
  if (localReading?.parsed && localRegions && localReading.image_sha256 === localRegions.image_sha256 &&
      (!localReading.regions_record?.profile?.id || localReading.regions_record.profile.id === choices.finder.id))
    return { layout: localReading.regions_record ?? localRegions, reading: localReading };
  const archive = await session.workArchive();
  const id = archivedId(archive, book.pages[index], index);
  if (!id) return null;
  const [reading, recent, original] = await Promise.all([
    archive.zip.json(readPath(id)), archive.zip.json(finderPath(id, choices.finder.id)), archive.zip.json(`work/${id}.regions.json`),
  ]);
  const active = recent ?? original;
  if (!reading?.parsed || active?.profile?.id !== choices.finder.id || reading.profile?.id !== choices.reader.id ||
      !reading.image_sha256 || active.image_sha256 !== reading.image_sha256) return null;
  const layout = reading.regions_record ?? active;
  if (layout.profile?.id !== choices.finder.id) return null;
  return { layout, reading };
}

export async function processBook(session, starting, indices, { choices, keys = {}, limit, savedOnly = false,
  missingOnly = false, signal, change, progress = () => {}, request = post }) {
  if (missingOnly) savedOnly = true;
  let book = starting, spend = 0, completed = 0, reused = 0, restored = 0, unknown = false, halted = false;
  const errors = [], hints = new Map();
  const outlines = outlineWorker(signal);
  try {
    for (const index of indices) {
      if (signal.aborted || unknown || (!savedOnly && spend > 0 && spend >= limit)) break;
      const tl = finderTypeList(book);
      // New books have no legacy type revision. The finders still expect a default reading flow.
      tl.flows.main ??= "Text";
      for (const type of Object.values(tl.types)) if (type.region && !type.flow && type.role !== "furniture") type.flow = "main";
      const { state, pid } = pipelinePage(session, book, index, tl, choices.options, signal);
      let saving = false;
      try {
        progress({ completed, total: indices.length, index, step: savedOnly ? "Loading saved records" : "Finding regions", spend, reused });
        let reading, layout, cached = false;
        const saved = savedOnly && await cachedPage(session, book, index, pid, choices);
        if (savedOnly && !saved) throw new Error("No matching saved finder and reader records for this scan.");
        if (saved) {
          ({ layout, reading } = saved);
          cached = true;
        } else {
          const maker = new Maker(state, {
            keys,
            outlines: (pid, url, boxes) => outlines.run(pid, url, boxes),
            onCost: value => {
              if (Number.isFinite(value)) spend += value;
              else unknown = true;
            },
            request: async (provider, payload, key, auth) => {
              signal.throwIfAborted();
              if (unknown || spend >= limit) throw new Error("The spend threshold was reached.");
              return request(provider, payload, key, { ...auth, signal });
            },
          });
          layout = await maker.findRegions(pid, { finder: choices.finder.id });
          signal.throwIfAborted();
          if (unknown || (spend > 0 && spend >= limit && choices.reader.provider !== "local")) break;
          progress({ completed, total: indices.length, index, step: "Reading text", spend, reused });
          reading = await maker.read(pid, layout, choices.options, { progress: step =>
            progress({ completed, total: indices.length, index, step, spend, reused }) });
          cached = !!(layout.cached && reading.cached);
          layout = reading.regions_record ?? layout;
        }
        signal.throwIfAborted();
        progress({ completed, total: indices.length, index, step: "Applying the reading", spend, reused });
        const doc = provisionalDocument(pid, {
          image: `${pid}.png`, image_sha256: reading.image_sha256,
          width: layout.width, height: layout.height,
        }, tl, layout);
        const needsType = doc.page.regions.some(region => region.type === UNCLASSIFIED);
        const typed = needsType ? B.ensureUnclassifiedType(book) : book;
        if (needsType && !Object.hasOwn(tl.types, UNCLASSIFIED)) tl.types[UNCLASSIFIED] = { region: "paragraph", flow: "main" };
        if (missingOnly) {
          const current = new Map(book.pages[index].regions?.map(region => [region.id, region]));
          for (const region of doc.page.regions) {
            const before = current.get(region.id);
            if (before && tl.types[before.type]) region.type = before.type;
          }
        }
        const result = materializeProcessedPage(applyReading(doc, reading, tl, typed.types), typed.pages[index], typed.types, tl, typed.rules);
        saving = true;
        if (missingOnly) {
          const next = restoreMissingText(book, index, result.page);
          if (next.restored) await change(next.book);
          book = next.book;
          restored += next.restored;
        } else {
          const replacement = replaceProcessedPage(typed, index, result);
          await session.writeWork(`work/structure-hints/${pid}.json`, replacement.hints);
          await change(replacement.book);
          book = replacement.book;
          hints.set(pid, replacement.hints);
        }
        saving = false;
        if (cached) reused++;
        completed++;
        progress({ completed, total: indices.length, index, step: cached ? "Applied saved reading" : "Page saved", spend, reused });
      } catch (error) {
        if (!signal.aborted || saving) errors.push({ index, message: String(error.message) });
        if (saving) { halted = true; break; }
      } finally {
        state.dispose();
      }
    }
    if (!missingOnly && completed && !halted && !book.structure_edited) {
      progress({ completed, total: indices.length, step: "Finding structure", spend, reused });
      for (const [index, page] of book.pages.entries()) {
        if (page.skip || !page.regions) continue;
        const pid = page.id ?? String(index + 1);
        if (!hints.has(pid)) {
          const saved = await session.readWork(`work/structure-hints/${pid}.json`, true);
          if (saved) hints.set(pid, saved);
        }
      }
      book = findStructure(book, hints);
      await change(book);
    }
    return { completed, reused, restored, spend, unknown, errors, stopped: signal.aborted || unknown || halted || completed + errors.length < indices.length };
  } finally { outlines.dispose(); }
}
