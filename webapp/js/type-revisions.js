import { checkTypes, checkDocument, typeRevision } from "./schema.js?v=20261113-keycache-1";
import { canonical } from "./ops.js?v=20261113-keycache-1";
import { isProtected, layerRecords, layerState } from "./layers.js?v=20261113-keycache-1";
import { provisionalUnits } from "./pipeline/provisional.js?v=20261113-keycache-1";
import { addBookType, REGION_CLASSES } from "./book-types.js?v=20261113-keycache-1";

export function citedSamplePages(question, samples) {
  const cited = new Set();
  for (const match of question.matchAll(/\b(?:pages?|pp?\.)\s+(\d+(?:\s*(?:[-–,]|and)\s*\d+)*)/gi)) {
    for (const part of match[1].split(/\s*(?:,|and)\s*/i)) {
      const [first, last = first] = part.split(/\s*[-–]\s*/).map(Number);
      for (const page of samples) if (page >= first && page <= last) cited.add(page);
    }
  }
  return [...cited].sort((a, b) => a - b);
}

export function resolveTypeName(name, types) {
  const aliases = types.source?.aliases || {}, seen = new Set();
  while (Object.hasOwn(aliases, name) && !seen.has(name)) { seen.add(name); name = aliases[name]; }
  return name;
}

// Work records are immutable. Callers map only the copies they use or display.
export function mappedTypeNames(record, types) {
  const next = structuredClone(record);
  for (const value of [next, next?.doc, next?.parsed]) if (value) {
    for (const region of value.page?.regions || value.regions || []) if (typeof region.type === "string") region.type = resolveTypeName(region.type, types);
    for (const unit of value.units || []) if (typeof unit.type === "string") unit.type = resolveTypeName(unit.type, types);
  }
  return next;
}

function availableName(types, name) {
  if (!/^[\p{L}\p{N}_][\p{L}\p{N}\p{M}_.-]*$/u.test(name) || ["__proto__", "constructor", "prototype"].includes(name))
    throw new Error("Use letters, digits, underscores, dots or dashes for the type name.");
  if (Object.hasOwn(types.types, name) || Object.hasOwn(types.source?.aliases || {}, name) || types.source?.retired_types?.includes(name))
    throw new Error(`The type name ${name} is already used or reserved by an earlier revision.`);
}

function definition(types, name) {
  if (!Object.hasOwn(types.types, name)) throw new Error(`Unknown type ${name}.`);
  return types.types[name];
}

export function revisedTypeList(current, operations, at = new Date().toISOString()) {
  if (!operations.length) throw new Error("Choose a type-list change first.");
  let next = structuredClone(current);
  const log = [];
  for (const input of operations) {
    const op = structuredClone(input), name = op.name;
    switch (op.kind) {
      case "add": case "split": {
        if (op.kind === "split" && !definition(next, op.from).region) throw new Error("Split a printed type by adding another printed type for some of its regions.");
        availableName(next, name);
        next = addBookType(next, op, at);
        break;
      }
      case "description": definition(next, name).description = op.description.trim(); break;
      case "metadata":
        for (const field of ["title", "description", "languages", "conventions"]) if (op[field] !== undefined) next[field] = structuredClone(op[field]);
        if (!next.title.trim()) throw new Error("Give the book a title.");
        break;
      case "rename": case "merge": {
        const from = definition(next, name), target = op.to.trim();
        if (op.kind === "rename") { availableName(next, target); next.types[target] = from; }
        else {
          const into = definition(next, target);
          if (name === target) throw new Error("Choose a different target type.");
          if (from.region !== into.region || (from.role === "furniture") !== (into.role === "furniture"))
            throw new Error("Merge types with the same printed class and furniture role, or two containers.");
          if (from.contains?.length) into.contains = [...new Set([...(into.contains || []), ...from.contains])];
          if (!into.flow && from.flow) into.flow = from.flow;
        }
        delete next.types[name];
        for (const type of Object.values(next.types)) if (type.contains) type.contains = [...new Set(type.contains.map(child => child === name ? target : child))];
        next.source ||= {};
        next.source.aliases = { ...next.source.aliases, [name]: target };
        for (const old of Object.keys(next.source.aliases)) next.source.aliases[old] = resolveTypeName(old, next);
        for (const flow of Object.keys(next.flows)) if (!Object.values(next.types).some(type => type.flow === flow)) delete next.flows[flow];
        op.to = target;
        break;
      }
      case "rules": {
        const type = definition(next, name);
        op.before = structuredClone(type);
        if (op.contains !== undefined) type.contains = [...new Set(op.contains)];
        if (op.flow) type.flow = op.flow; else delete type.flow;
        for (const flow of Object.keys(next.flows)) if (!Object.values(next.types).some(value => value.flow === flow)) delete next.flows[flow];
        break;
      }
      case "class": {
        const type = definition(next, name);
        op.before = structuredClone(type);
        if (!REGION_CLASSES.includes(op.region) || op.region === "other" || !type.region) throw new Error("Choose a printed class for a printed type.");
        type.region = op.region;
        break;
      }
      case "remove":
        definition(next, name);
        delete next.types[name];
        for (const type of Object.values(next.types)) if (type.contains) type.contains = type.contains.filter(child => child !== name);
        for (const flow of Object.keys(next.flows)) if (!Object.values(next.types).some(type => type.flow === flow)) delete next.flows[flow];
        next.source ||= {};
        next.source.retired_types = [...new Set([...(next.source.retired_types || []), name])];
        break;
      case "resolve_question": {
        if (!next.source?.discovery) throw new Error("This type list has no discovery questions.");
        if (!op.answer?.trim()) throw new Error("Record the review decision before resolving the question.");
        next.source.discovery.resolved_questions = { ...next.source.discovery.resolved_questions, [op.question]: { answer: op.answer.trim(), at_utc: at } };
        break;
      }
      default: throw new Error(`Unknown type-list operation ${op.kind}.`);
    }
    log.push(op);
  }
  const errors = checkTypes(next);
  if (errors.length) throw new Error(errors[0]);
  const n = typeRevision(current.source?.revision) + 1;
  next.source = { ...next.source, ...(typeof current.source?.revision === "string" ? { legacy_revision: current.source.revision } : {}),
    revision: n, revisions: [...(current.source?.revisions || []), { n, at_utc: at, by: "user", operations: log }] };
  return next;
}

function usage(doc, names) {
  return { regions: (doc?.page.regions || []).filter(region => names.has(region.type)).length,
    units: (doc?.units || []).filter(unit => names.has(unit.type)).length };
}

export function migrateTypeDocument(original, types, operations, check = (doc, list) => checkDocument(doc, list)[0], boundary = {}) {
  const doc = mappedTypeNames(original, types);
  let changed = canonical(doc) !== canonical(original);
  const revision = typeRevision(types.source?.revision), review = { ...doc.source?.type_review };
  const fig = new Set(operations.filter(op => op.kind === "class" && (op.region === "figure" || op.before?.region === "figure")).map(op => resolveTypeName(op.name, types)));
  const figureChanged = doc.page.regions.some(region => fig.has(region.type));
  if (!changed && !figureChanged && !operations.some(op => ["rules", "merge"].includes(op.kind))) return doc;
  if (figureChanged) {
    doc.source = { ...doc.source, layers: layerRecords(doc) };
    for (const region of doc.page.regions.filter(region => fig.has(region.type))) {
      if (types.types[region.type].region === "figure") {
        if (region.lines?.length) region.source = { ...region.source, kept_text: structuredClone(region.lines) };
        delete region.lines;
      } else if (region.source?.kept_text) { region.lines = region.source.kept_text; delete region.source.kept_text; }
      else region.lines ||= [];
    }
    for (const state of Object.values(doc.source.layers)) { delete state.accepted_at_utc; delete state.accepted_legacy; }
    if (doc.source.layers.regions) doc.source.layers.regions.state = "model";
    review.regions = revision;
    changed = true;
  }
  // A merge can make an old root belong to the target's flow.
  if (operations.some(op => op.kind === "merge")) {
    const units = new Map(doc.units.map(unit => [unit.id, unit])), flows = Object.fromEntries(Object.keys(types.flows).map(flow => [flow, []]));
    for (const [flow, roots] of Object.entries(doc.flows)) for (const id of roots) {
      const destination = types.types[units.get(id)?.type]?.flow || flow;
      (flows[destination] ||= []).push(id);
    }
    if (canonical(doc.flows) !== canonical(flows)) { doc.flows = flows; changed = true; }
  }
  const errors = check(doc, types);
  if (!errors.length && review.manual && operations.some(op => op.kind === "rules")) { delete review.manual; changed = true; }
  if (errors.length && operations.some(op => op.kind === "rules")) {
    if (!isProtected(doc, "units") || layerState(doc, "units")?.state === "provisional") {
      const provisional = provisionalUnits(doc.page.id, doc.page.regions, types, boundary);
      doc.units = provisional.units; doc.flows = provisional.flows; doc.relations = [];
      doc.source = { ...doc.source, layers: layerRecords(doc), provisional_problems: provisional.problems };
      doc.source.layers.units = { state: "provisional", types_revision: revision };
      review.units = revision;
    } else review.manual = revision;
    changed = true;
  }
  if (changed) {
    doc.source = { ...doc.source, types_migration_revision: revision };
    const remaining = check(doc, types);
    if (Object.keys(review).length) doc.source.type_review = { ...review, errors: remaining };
    else delete doc.source.type_review;
  }
  return doc;
}

export function planTypeRevision(current, snapshot, operations, { validate = () => [], check = (doc, list) => checkDocument(doc, list)[0], at } = {}) {
  const types = revisedTypeList(current, operations, at), revision = types.source.revision;
  const validation = validate(types);
  if (validation.length) throw new Error(validation[0]);
  const logged = types.source.revisions.at(-1).operations;
  const removed = new Set(operations.filter(op => op.kind === "remove").map(op => op.name));
  const names = new Set(operations.flatMap(op => op.kind === "split" ? [op.from] : op.name ? [op.name] : []));
  const result = { types, style: structuredClone(snapshot.style), changes: [], pages: [], regions: 0, units: 0, find: [], complete: [], manual: [], invalid: [], revision };
  for (const [index, page] of snapshot.pages.entries()) {
    const variants = [snapshot.models[page.id], snapshot.edits[page.id], snapshot.drafts[page.id]?.doc].filter(Boolean);
    if (variants.some(doc => { const found = usage(doc, removed); return found.regions || found.units; }))
      throw new Error(`Page ${index + 1} still uses a type to be removed. Merge that type first.`);
    const effective = snapshot.drafts[page.id]?.doc || snapshot.edits[page.id] || snapshot.models[page.id];
    const counts = usage(effective, names);
    if (counts.regions || counts.units) result.pages.push(page.id);
    result.regions += counts.regions; result.units += counts.units;
    for (const [kind, before] of [["model", snapshot.models[page.id]], ["edit", snapshot.edits[page.id]], ["draft", snapshot.drafts[page.id]]]) {
      if (!before) continue;
      const doc = kind === "draft" ? before.doc : before;
      const after = migrateTypeDocument(doc, types, logged, check, { firstPage: index === 0, lastPage: index === snapshot.pages.length - 1 });
      const errors = check(after, types);
      if (errors.length) result.invalid.push({ page: page.id, kind, errors });
      if (errors.length && operations.some(op => ["rename", "merge"].includes(op.kind)) && !check(doc, current).length)
        throw new Error(`Page ${index + 1} cannot use this merge or rename. ${errors[0]}`);
      const value = kind === "draft" ? { ...before, doc: after } : after;
      if (canonical(before) !== canonical(value)) {
        result.changes.push({ page: page.id, kind, before, after: value });
        result.pages.push(page.id);
      }
    }
    const final = kind => {
      const change = result.changes.find(change => change.page === page.id && change.kind === kind);
      return change ? change.after : snapshot[{ model: "models", edit: "edits", draft: "drafts" }[kind]][page.id];
    };
    const review = (final("draft")?.doc || final("edit") || final("model"))?.source?.type_review;
    if (review?.regions === revision) result.find.push(page.id);
    if (review?.units === revision) result.complete.push(page.id);
    if (review?.manual === revision) result.manual.push(page.id);
  }
  if (result.style?.types) for (const op of operations) {
    if (["rename", "merge"].includes(op.kind) && Object.hasOwn(result.style.types, op.name)) {
      result.style.types[op.to] = result.style.types[op.to] || result.style.types[op.name];
      delete result.style.types[op.name];
    }
    if (op.kind === "remove") delete result.style.types[op.name];
  }
  for (const key of ["pages", "find", "complete", "manual"]) result[key] = [...new Set(result[key])];
  return result;
}
