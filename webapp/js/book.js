// Immutable edits to the stored book. Keep the previous book for undo.
import { hasReadingContent, toPageDocs, UNCLASSIFIED } from "./chaya-book.js?v=20261127-place-areas";
import { prepare } from "./reader.js?v=20261127-place-areas";

const pathOf = region => region.in ?? [];
const startsWith = (path, prefix) => prefix.every((id, i) => path[i] === id);
const readingRegion = (book, region) => region.type !== "?" && !region.ignored &&
  !book.types[region.type]?.ignored && hasReadingContent(region, book.types[region.type]);

export function pageIndexOf(book, page) {
  if (Number.isInteger(page)) return page >= 0 && page < book.pages.length ? page : -1;
  if (typeof page !== "string") return -1;
  const address = /^([1-9]\d*)\/[^/]+$/.exec(page);
  if (address) return pageIndexOf(book, Number(address[1]) - 1);
  return book.pages.findIndex(item => item.id === page);
}

function regionPosition(book, address) {
  const page = pageIndexOf(book, address);
  const id = typeof address === "string" ? address.split("/")[1] : null;
  return [page, book.pages[page]?.regions?.findIndex(region => region.id === id) ?? -1];
}

export function regionAt(book, address) {
  const [page, index] = regionPosition(book, address);
  return book.pages[page]?.regions?.[index];
}

function pageEdit(book, page, edit) {
  const index = pageIndexOf(book, page);
  if (index < 0) throw new Error("No such page.");
  const previous = book.pages[index], next = edit(previous);
  return next === previous ? book : { ...book, pages: book.pages.with(index, next) };
}

function mustFind(book, address) {
  const region = regionAt(book, address);
  if (!region) throw new Error(`No such region: ${address}.`);
  return region;
}

function regionEdit(book, address, edit) {
  const previous = mustFind(book, address);
  return pageEdit(book, address, page => {
    const next = edit(previous);
    return next === previous ? page : { ...page, regions: page.regions.with(page.regions.indexOf(previous), next) };
  });
}

function mapRegions(book, edit) {
  let changed = false;
  const pages = book.pages.map((page, index) => {
    const regions = page.regions;
    if (!regions) return page;
    const next = regions.map(region => edit(region, index));
    if (next.every((region, i) => region === regions[i])) return page;
    changed = true;
    return { ...page, regions: next };
  });
  return changed ? { ...book, pages } : book;
}

function field(object, key, value) {
  if (value == null) {
    if (!Object.hasOwn(object, key)) return object;
    const next = { ...object };
    delete next[key];
    return next;
  }
  return object[key] === value ? object : { ...object, [key]: value };
}

function withBox(box) {
  if (!Array.isArray(box) || box.length !== 4 || box.some(x => !Number.isFinite(x) || x < 0 || x > 1) ||
      box[2] <= box[0] || box[3] <= box[1]) throw new Error("The box must be a rectangle within the scan.");
  return [...box];
}

function nextId(names, prefix) {
  let max = 0;
  for (const name of names) if (name.startsWith(prefix) && /^\d+$/.test(name.slice(prefix.length)))
    max = Math.max(max, Number(name.slice(prefix.length)));
  return prefix + (max + 1);
}

export function newRegionId(book, page) {
  const found = book.pages[pageIndexOf(book, page)];
  if (!found) throw new Error("No such page.");
  return nextId(found.regions?.map(region => region.id) ?? [], "r");
}

function requireType(book, name) {
  if (name !== "?" && !Object.hasOwn(book.types, name)) throw new Error(`Unknown type: ${name}.`);
}

export function ensureUnclassifiedType(book) {
  return Object.hasOwn(book.types, UNCLASSIFIED) ? book :
    addType(book, UNCLASSIFIED, { lines: true, description: "No type chosen yet; its printed lines are kept." });
}

export function addRegion(book, page, type, box) {
  if (type === UNCLASSIFIED) book = ensureUnclassifiedType(book);
  requireType(book, type);
  const region = { id: newRegionId(book, page), type, box: withBox(box) };
  return pageEdit(book, page, item => ({ ...item, regions: [...(item.regions ?? []), region] }));
}

export function resizeRegion(book, address, box) {
  return regionEdit(book, address, region => ({ ...region, box: withBox(box) }));
}

export function moveRegion(book, address, dx, dy) {
  const [x0, y0, x1, y1] = mustFind(book, address).box;
  return resizeRegion(book, address, [x0 + dx, y0 + dy, x1 + dx, y1 + dy]);
}

export function retypeRegion(book, address, type) {
  requireType(book, type);
  return regionEdit(book, address, region => field(field(region, "type", type), "proposed", null));
}

export const ignoreRegion = (book, address) => regionEdit(book, address, region => field(region, "ignored", true));
export const restoreRegion = (book, address) => regionEdit(book, address, region => field(region, "ignored", null));
export const clearUncertainty = (book, address) => regionEdit(book, address, region => field(region, "uncertain", null));

function removeLinks(book, target) {
  return mapRegions(book, region => {
    let next = region;
    const links = region.links?.filter(link => link.to !== target);
    if (links && links.length !== region.links.length) next = field(next, "links", links.length ? links : null);
    const lines = region.lines?.map(line => line.spans?.some(span => span.to === target)
      ? { ...line, spans: line.spans.map(span => span.to === target ? field(span, "to", null) : span) } : line);
    if (lines?.some((line, i) => line !== region.lines[i])) next = { ...next, lines };
    return next;
  });
}

export function deleteRegion(book, address) {
  const region = mustFind(book, address);
  const target = `${pageIndexOf(book, address) + 1}/${region.id}`;
  let next = pageEdit(book, address, page => ({ ...page, regions: page.regions.filter(item => item !== region) }));
  for (const id of pathOf(region).filter(id => !hasContainerMembers(next, id))) {
    next = { ...next, containers: field(next.containers, id, null) };
    next = removeLinks(next, id);
  }
  return removeLinks(next, target);
}

export function reorderRegion(book, address, toIndex) {
  const region = mustFind(book, address);
  return pageEdit(book, address, page => {
    const from = page.regions.indexOf(region);
    if (!Number.isInteger(toIndex) || toIndex < 0 || toIndex >= page.regions.length) throw new Error("No such region position.");
    if (from === toIndex) return page;
    const regions = page.regions.filter(item => item !== region);
    regions.splice(toIndex, 0, region);
    return { ...page, regions };
  });
}

function linesEdit(book, address, edit) {
  return regionEdit(book, address, region => {
    const lines = edit(region.lines ?? []);
    return lines === region.lines ? region : { ...region, lines };
  });
}

function lineEdit(book, address, index, edit) {
  return linesEdit(book, address, lines => {
    if (!Number.isInteger(index) || index < 0 || index >= lines.length) throw new Error("No such line.");
    const next = edit(lines[index]);
    return next === lines[index] ? lines : lines.with(index, next);
  });
}

export function setLine(book, address, index, text, spans = []) {
  return lineEdit(book, address, index, line => field(field(line, "text", text), "spans", spans.length ? structuredClone(spans) : null));
}

function changeLines(book, address, index, inserting, line) {
  return regionEdit(book, address, region => {
    const lines = region.lines ?? [];
    if (!Number.isInteger(index) || index < 0 || index > lines.length || (!inserting && index === lines.length))
      throw new Error("No such line position.");
    const next = { ...region, lines: inserting ? lines.toSpliced(index, 0, structuredClone(line)) : lines.toSpliced(index, 1) };
    if (!region.links?.some(link => link.line >= index)) return next;
    const links = region.links.filter(link => inserting || link.line !== index)
      .map(link => link.line >= index ? { ...link, line: link.line + (inserting ? 1 : -1) } : link);
    return field(next, "links", links.length ? links : null);
  });
}

export const addLine = (book, address, index, line = {}) => changeLines(book, address, index, true, line);
export const removeLine = (book, address, index) => changeLines(book, address, index, false);

export function setLineEnd(book, address, index, end) {
  if (end != null && !["space", "line", "join", "hyphen"].includes(end)) throw new Error("Unknown line ending.");
  return lineEdit(book, address, index, line => field(line, "end", end));
}

function flowOf(book, region) {
  const root = book.containers?.[pathOf(region)[0]] ?? region;
  return root.flow ?? book.types[root.type]?.flow ?? "main";
}

function neighbor(book, address, step) {
  const [start, position] = regionPosition(book, address), region = book.pages[start].regions[position];
  const path = pathOf(region), flow = flowOf(book, region);
  for (let page = start; page >= 0 && page < book.pages.length; page += step) {
    const scan = book.pages[page];
    if (scan.skip) continue;
    if (!scan.regions) return;
    const first = page === start ? position + step : step === 1 ? 0 : scan.regions.length - 1;
    for (let i = first; i >= 0 && i < scan.regions.length; i += step) {
      const candidate = scan.regions[i], other = pathOf(candidate);
      if (readingRegion(book, candidate) && !candidate.direct && candidate.type === region.type &&
          other.length === path.length && startsWith(other, path) && flowOf(book, candidate) === flow)
        return `${page + 1}/${candidate.id}`;
    }
  }
}

export function unitStartAddress(book, address) {
  let region = mustFind(book, address);
  while (!region.from_previous && !region.direct) {
    const earlier = neighbor(book, address, -1);
    const previous = earlier && regionAt(book, earlier);
    if (previous?.continues !== true) break;
    address = earlier;
    region = previous;
  }
  return address;
}

const structure = book => field(book, "structure_edited", true);

export function setContinues(book, address, value) {
  const current = mustFind(book, address);
  if (current.direct || !readingRegion(book, current)) throw new Error("This region has no separate reading unit.");
  const after = neighbor(book, address, 1);
  let next = regionEdit(book, address, region => field(region, "continues", value ? (after ? true : "open") : null));
  if (after && value && regionAt(book, after).from_previous)
    next = regionEdit(next, after, region => field(region, "from_previous", null));
  return structure(next);
}

function textRegions(book) {
  return book.pages.flatMap((page, index) => page.skip ? [] : (page.regions ?? [])
    .filter(region => readingRegion(book, region)).map(region => ({ region, address: `${index + 1}/${region.id}` })));
}

function containerId(book, target) {
  const id = target.includes("/") ? pathOf(mustFind(book, target)).at(-1) : target;
  if (!id || !Object.hasOwn(book.containers ?? {}, id)) throw new Error("No such section.");
  return id;
}

function hasContainerMembers(book, id) {
  return book.pages.some(page => page.regions?.some(region => pathOf(region).includes(id)));
}

export function preserveJoinTargets(before, after) {
  return mapRegions(after, (region, index) => {
    if (region.continues !== true || after.pages[index].skip || !readingRegion(after, region)) return region;
    const address = `${index + 1}/${region.id}`;
    if (regionAt(before, address)?.continues !== true) return region;
    const earlier = neighbor(before, address, 1);
    if (!earlier || regionAt(before, earlier)?.from_previous) return region;
    return neighbor(after, address, 1) === earlier ? region : field(region, "continues", "open");
  });
}

function changePaths(book, replacements) {
  const next = mapRegions(book, (region, index) => {
    const path = replacements.get(`${index + 1}/${region.id}`);
    if (!path) return region;
    return field(region, "in", path.length ? path : null);
  });
  return preserveJoinTargets(book, next);
}

export function startSection(book, at, type) {
  requireType(book, type);
  if (!book.types[type]?.contains) throw new Error("Choose a container type for the section.");
  const first = unitStartAddress(book, at);
  const entries = textRegions(book);
  const index = entries.findIndex(entry => entry.address === first);
  if (index < 0) throw new Error("This region is outside the reading.");
  const region = entries[index].region, path = pathOf(region);
  const sameType = path.findLastIndex(id => book.containers[id].type === type);
  const depth = sameType >= 0 ? sameType : path.findLastIndex(id =>
    book.types[book.containers[id].type]?.contains?.includes(type)) + 1;
  const parent = path.slice(0, depth), split = sameType >= 0 ? path[depth] : undefined;
  if (split && !entries.slice(0, index).some(entry => pathOf(entry.region).includes(split))) return book;
  const containers = { ...book.containers };
  const id = nextId(Object.keys(containers), "c"), replacements = new Map(), flow = flowOf(book, region);
  containers[id] = { type };
  if (!parent.length && (book.types[type].flow ?? "main") !== flow) containers[id].flow = flow;
  for (const entry of entries.slice(index)) {
    if (flowOf(book, entry.region) !== flow) continue;
    const oldPath = pathOf(entry.region), branch = oldPath[depth];
    if (!startsWith(oldPath, parent) || (split && branch !== split)) break;
    const branchType = book.containers?.[branch]?.type;
    if (!split && entry.address !== first && branchType &&
        (branchType === type || book.types[branchType]?.contains?.includes(type))) break;
    replacements.set(entry.address, [...parent, id, ...oldPath.slice(depth + Number(!!split))]);
  }
  // If the cut also divides a nested group, give its later part a fresh identity.
  const retained = new Set(entries.filter(entry => !replacements.has(entry.address)).flatMap(({ region }) => pathOf(region)));
  const splitGroups = new Map();
  for (const [address, path] of replacements) {
    replacements.set(address, path.map((key, index) => {
      if (index <= depth || !retained.has(key)) return key;
      if (!splitGroups.has(key)) {
        const copy = nextId(Object.keys(containers), "c");
        containers[copy] = containers[key];
        splitGroups.set(key, copy);
      }
      return splitGroups.get(key);
    }));
  }
  return structure(changePaths({ ...book, containers }, replacements));
}

function sectionRun(book, target) {
  const id = containerId(book, target), entries = textRegions(book);
  const first = entries.findIndex(({ region }) => pathOf(region).includes(id));
  if (first < 0) throw new Error("This section has no reading regions.");
  const path = pathOf(entries[first].region), depth = path.indexOf(id), parent = path.slice(0, depth);
  const members = entries.filter(({ region }) => pathOf(region)[depth] === id && startsWith(pathOf(region), parent));
  return { id, entries, first, depth, parent, members, flow: flowOf(book, entries[first].region) };
}

export function sectionDeeper(book, target) {
  const { entries, first, depth, parent, members, flow } = sectionRun(book, target);
  const previous = entries.slice(0, first).findLast(({ region }) => flowOf(book, region) === flow);
  const path = previous && pathOf(previous.region), sibling = path?.[depth];
  if (!sibling || !startsWith(path, parent)) return book;
  const replacements = new Map(members.map(({ address, region }) => [address, [...parent, sibling, ...pathOf(region).slice(depth)]]));
  return structure(changePaths(book, replacements));
}

export function sectionUp(book, target) {
  const { id, entries, depth, parent, members, flow } = sectionRun(book, target);
  if (!depth) return book;
  const ancestor = parent.at(-1), containers = { ...book.containers };
  const replacements = new Map(members.map(({ address, region }) => [address, pathOf(region).toSpliced(depth - 1, 1)]));
  // The old parent cannot run across the promoted sibling. Retain any later part with the same attributes.
  const last = entries.indexOf(members.at(-1));
  let suffix;
  for (const { address, region } of entries.slice(last + 1)) {
    if (flowOf(book, region) !== flow) continue;
    const path = pathOf(region);
    if (!startsWith(path, parent)) break;
    if (!suffix) {
      suffix = nextId(Object.keys(containers), "c");
      containers[suffix] = containers[ancestor];
    }
    replacements.set(address, path.with(depth - 1, suffix));
  }
  if (depth === 1 && (book.types[containers[id].type]?.flow ?? "main") !== flow)
    containers[id] = { ...containers[id], flow };
  const next = changePaths({ ...book, containers }, replacements);
  if (!hasContainerMembers(next, ancestor)) {
    delete containers[ancestor];
    return structure(removeLinks(next, ancestor));
  }
  return structure(next);
}

export function notSectionStart(book, target) {
  const id = containerId(book, target), containers = { ...book.containers };
  delete containers[id];
  const result = mapRegions({ ...book, containers }, region => {
    const path = pathOf(region);
    if (!path.includes(id)) return region;
    let next = path.at(-1) === id ? field(region, "direct", null) : region;
    const remaining = path.filter(value => value !== id);
    if (path[0] === id) {
      const flow = flowOf(book, region);
      const child = containers[remaining[0]];
      if (child && (child.flow ?? book.types[child.type]?.flow ?? "main") !== flow)
        containers[remaining[0]] = { ...child, flow };
      if (!child && (next.flow ?? book.types[next.type]?.flow ?? "main") !== flow) next = { ...next, flow };
    }
    return field(next, "in", remaining.length ? remaining : null);
  });
  return structure(preserveJoinTargets(book, removeLinks(result, id)));
}

function unitField(book, target, key, value) {
  const stored = value == null || value === "" ? null : String(value);
  if (target.includes("/")) return structure(regionEdit(book, unitStartAddress(book, target), region => field(region, key, stored)));
  const id = containerId(book, target), previous = book.containers[id];
  const next = field(previous, key, stored);
  return structure(previous === next ? book : { ...book, containers: { ...book.containers, [id]: next } });
}

export const setLabel = (book, target, label) => unitField(book, target, "label", label);
export const setNumber = (book, target, number) => unitField(book, target, "number", number);

export const skipPage = (book, page) => pageEdit(book, page, item => field(item, "skip", true));
export const unskipPage = (book, page) => pageEdit(book, page, item => field(item, "skip", null));
export const setPageLabel = (book, page, label) => pageEdit(book, page, item => field(item, "label", label == null || label === "" ? null : String(label)));

function newTypeName(book, name) {
  if (!/^[a-z][a-z0-9_]*$/.test(name) || Object.hasOwn(book.types, name)) throw new Error(`Type name is invalid or already used: ${name}.`);
}

export function addType(book, name, definition = {}) {
  newTypeName(book, name);
  return { ...book, types: { ...book.types, [name]: structuredClone(definition) } };
}

function changeTypeReferences(book, old, name) {
  const key = value => value === old ? name : value;
  const list = values => values.map(key).filter(value => value != null);
  const dictionary = values => Object.fromEntries(Object.entries(values).flatMap(([k, v]) => key(k) == null ? [] : [[key(k), v]]));
  const types = Object.fromEntries(Object.entries(dictionary(book.types)).map(([type, definition]) => [type,
    definition.contains?.includes(old) ? { ...definition, contains: list(definition.contains) } : definition]));
  const next = { ...book, types };
  if (book.reading?.finder_classes && Object.hasOwn(book.reading.finder_classes, old))
    next.reading = { ...book.reading, finder_classes: dictionary(book.reading.finder_classes) };
  if (book.stylesheet?.types && Object.hasOwn(book.stylesheet.types, old))
    next.stylesheet = { ...book.stylesheet, types: dictionary(book.stylesheet.types) };
  if (book.rules) {
    const rules = { ...book.rules };
    for (const setting of ["captions", "contents_types", "page_numbers", "tables"])
      if (rules[setting]?.includes(old)) rules[setting] = list(rules[setting]);
    if (rules.verses?.lead_in?.includes(old)) rules.verses = { ...rules.verses, lead_in: list(rules.verses.lead_in) };
    if (rules.headings?.some(level => level.heading === old || level.container === old))
      rules.headings = rules.headings.map(level => ({ heading: key(level.heading), container: key(level.container) }))
        .filter(level => level.heading && level.container);
    if (rules.sections?.closing === old) rules.sections = field(rules.sections, "closing", name);
    if (rules.verseGroups?.markerType === old) rules.verseGroups = field(rules.verseGroups, "markerType", name);
    next.rules = rules;
  }
  return next;
}

export function renameType(book, old, name) {
  if (!Object.hasOwn(book.types, old)) throw new Error(`Unknown type: ${old}.`);
  if (old === name) return book;
  newTypeName(book, name);
  const next = mapRegions(changeTypeReferences(book, old, name), region =>
    region.type === old ? { ...region, type: name } : region);
  if (Object.values(book.containers ?? {}).some(container => container.type === old))
    next.containers = Object.fromEntries(Object.entries(book.containers).map(([id, container]) => [id,
      container.type === old ? { ...container, type: name } : container]));
  return next;
}

export function deleteType(book, name) {
  if (!Object.hasOwn(book.types, name)) throw new Error(`Unknown type: ${name}.`);
  if (book.pages.some(page => page.regions?.some(region => region.type === name)) ||
      Object.values(book.containers ?? {}).some(container => container.type === name))
    throw new Error(`Type ${name} is still in use.`);
  return changeTypeReferences(book, name, null);
}

export function setTypeFlags(book, name, flags) {
  if (!Object.hasOwn(book.types, name)) throw new Error(`Unknown type: ${name}.`);
  const previous = book.types[name];
  let next = previous;
  for (const key of ["lines", "figure", "heading", "ignored"])
    if (Object.hasOwn(flags, key)) next = field(next, key, flags[key] ? true : null);
  return next === previous ? book : { ...book, types: { ...book.types, [name]: next } };
}

export function assemble(book) {
  // Replace this projection with a direct assembler once Read consumes the stored book.
  const { docs, types } = toPageDocs(book);
  return prepare(docs, types, book.stylesheet ?? null);
}
