import { canonical, EditError, placeOf, unitById, setOpen, retypeUnit, setUnitField, wrapUnit, unwrapUnit, unitToFurniture, splitUnit } from "./ops.js?v=20261113-noink-1";
import { layerView } from "./layers.js?v=20261113-noink-1";
import { checkDocument } from "./schema.js?v=20261113-noink-1";
import { assemble } from "./assemble.js?v=20261113-noink-1";

export function editorFocus(stage) { return stage === "text" ? "text" : stage === "read" ? "units" : stage === "regions" ? "regions" : "all"; }

export function unitSnapshot(doc) {
  return canonical({ grouping: JSON.parse(layerView(doc, "units")), types: doc.page.regions.map(region => [region.id, region.type]) });
}

export function unitRegionIds(doc, uid, seen = new Set()) {
  if (seen.has(uid)) return [];
  seen.add(uid);
  return unitById(doc, uid).children.flatMap(child => child.region ? [child.region.split("#")[1]] : unitRegionIds(doc, child.unit, seen));
}

export function applyUnitAction(doc, types, uid, action, value) {
  switch (action) {
    case "type": retypeUnit(doc, types, uid, value); break;
    case "number": case "label": case "lang": setUnitField(doc, uid, action, value); break;
    case "start": case "end": setOpen(doc, uid, action, value); break;
    case "wrap": return { unit: wrapUnit(doc, types, uid, value) };
    case "unwrap": {
      const first = unitById(doc, uid).children[0];
      unwrapUnit(doc, uid); return first.unit ? { unit: first.unit } : { region: first.region.split("#")[1] };
    }
    case "furniture": return { region: unitToFurniture(doc, types, uid, value)[0] };
    case "split": return { unit: splitUnit(doc, uid, value) };
    default: throw new EditError(`Unknown unit action ${action}.`);
  }
  return { unit: uid };
}

export function applyUnitChanges(before, after, latest) {
  assertFocusEdit("units", before, after);
  if (unitSnapshot(before) !== unitSnapshot(latest)) throw new EditError("This page’s units changed. Select the passage again.");
  const doc = structuredClone(latest);
  doc.units = structuredClone(after.units); doc.flows = structuredClone(after.flows);
  if (after.relations) doc.relations = structuredClone(after.relations); else delete doc.relations;
  for (let index = 0; index < doc.page.regions.length; index++) {
    const region = doc.page.regions[index], changed = after.page.regions[index];
    if (region.type !== changed.type && changed.order === null) region.order = null;
    region.type = changed.type;
    for (const [i, line] of (region.lines || []).entries()) for (const field of ["end", "style"]) {
      if (changed.lines[i][field] !== undefined) line[field] = structuredClone(changed.lines[i][field]); else delete line[field];
    }
  }
  return doc;
}

function geometryView(doc, other = doc) {
  return canonical(JSON.parse(layerView(doc, "regions")).map(({ type, ...region }, index) => {
    const previous = other.page.regions[index];
    if (previous?.type !== type && region.order === null) region.order = previous.order;
    return region;
  }));
}

export function assertFocusEdit(focus, before, after) {
  if (focus === "text") {
    const grouping = doc => { const { relations, ...value } = JSON.parse(layerView(doc, "units")); return canonical(value); };
    if (layerView(before, "regions") !== layerView(after, "regions") || grouping(before) !== grouping(after))
      throw new EditError("Edit page regions in Regions, and unit grouping and line joins in Read.");
  }
  if (focus === "units" && (geometryView(before, after) !== geometryView(after, before) || layerView(before, "text") !== layerView(after, "text")))
    throw new EditError("Edit the transcription in Text and page geometry in Regions.");
}

export function mergeTextEdit(current, incoming, base) {
  const doc = structuredClone(current);
  const text = line => ({ text: line?.text, spans: line?.spans });
  const assign = (target, value, previous, keys, name) => {
    if (canonical(value) === canonical(previous)) return;
    const now = Object.fromEntries(keys.filter(key => target[key] !== undefined).map(key => [key, target[key]]));
    const old = Object.fromEntries(keys.filter(key => previous?.[key] !== undefined).map(key => [key, previous[key]]));
    const next = Object.fromEntries(keys.filter(key => value?.[key] !== undefined).map(key => [key, value[key]]));
    if (canonical(now) !== canonical(old) && canonical(now) !== canonical(next)) throw new EditError(`${name} changed in another edit. Reload before replacing it.`);
    for (const key of keys) { if (value[key] === undefined) delete target[key]; else target[key] = structuredClone(value[key]); }
  };
  assign(doc.page, { label: incoming.page.label }, { label: base.page.label }, ["label"], "The page label");
  for (const region of incoming.page.regions) for (const [index, line] of (region.lines || []).entries()) {
    const prior = base.page.regions.find(value => value.id === region.id)?.lines?.[index];
    if (canonical(text(line)) === canonical(text(prior))) continue;
    const target = doc.page.regions.find(value => value.id === region.id)?.lines?.[index];
    if (!target || target.line !== line.line || canonical(target.polygons) !== canonical(line.polygons)) throw new EditError(`${region.id} geometry changed. Reopen the page before replacing its text.`);
    assign(target, text(line), text(prior), ["text", "spans"], `${region.id} line ${index + 1}`);
  }
  const anchors = new Set(doc.page.regions.flatMap(region => (region.lines || []).flatMap(line => (line.spans || []).filter(span => span.id).map(span => `${doc.page.id}#${span.id}`))));
  if (doc.relations) doc.relations = doc.relations.filter(relation => !relation.from.anchor?.startsWith(`${doc.page.id}#`) || anchors.has(relation.from.anchor));
  return doc;
}

export function unitPath(doc, uid) {
  const path = [], seen = new Set();
  while (uid) {
    if (seen.has(uid)) throw new EditError("Fix the cycle in this unit tree first.");
    seen.add(uid);
    const unit = unitById(doc, uid), place = placeOf(doc, uid);
    if (!place) throw new EditError("Put this unit in a reading flow first.");
    path.unshift(unit);
    uid = place.parent?.id;
  }
  return path;
}

export function nextPageUnit(left, right, uid) {
  const path = unitPath(left, uid), root = placeOf(left, path[0].id);
  for (const unit of path) {
    const place = placeOf(left, unit.id);
    if (place.index !== place.list.length - 1) throw new EditError("Join the next unit on this page first.");
  }
  let next = right.units.find(unit => unit.id === right.flows[root.flow]?.[0]);
  for (const [index, unit] of path.entries()) {
    if (!next || next.type !== unit.type) throw new EditError(`The next page does not continue this ${unit.type}.`);
    if (index === path.length - 1) return next.id;
    next = right.units.find(value => value.id === next.children[0]?.unit);
  }
}

// The page that a unit open at the end of its page continues on, for joining by hand. As in assemble.js, pages with no
// top-level unit of its type in its flow and no open end of their own (a blank page, a plate) are looked past. Returns
// the page's id; null where the book does not go on (its last page, a gap in the PDF's page numbers, a break between
// sample pages); "missing" when a page on the way has no document yet. docOf(id) gives a page's document, or a promise.
export async function joinPartnerId(pages, index, left, uid, docOf) {
  const path = unitPath(left, uid), flow = placeOf(left, path[0].id).flow, type = path[0].type;
  const lookPast = doc => !(doc.flows[flow] || []).some(id => doc.units.find(unit => unit.id === id)?.type === type) && !doc.units.some(unit => unit.open);
  for (let k = index; ; k++) {
    const here = pages[k], other = pages[k + 1];
    if (!other || here.pdf_page && other.pdf_page && other.pdf_page !== here.pdf_page + 1) return null;
    if ((k === index ? left : await docOf(here.id))?.source?.sample?.consecutive_next === false) return null;
    const doc = await docOf(other.id);
    if (!doc) return "missing";
    if (!lookPast(doc)) return other.id;
  }
}

export function assertJoinMetadata(before, after) {
  for (const field of ["number", "label", "lang"]) if (before[field] && after[field] && before[field] !== after[field])
    throw new EditError(`The continuation has a different ${field}. Review those values before joining.`);
  if (after.style && canonical(before.style) !== canonical(after.style)) throw new EditError("Review the continuation’s different unit style before joining.");
}

export function joinPageUnits(left, right, types, uid, check = (doc, tl) => checkDocument(doc, tl)[0]) {
  const a = structuredClone(left), b = structuredClone(right), other = nextPageUnit(a, b, uid);
  const first = unitPath(a, uid), second = unitPath(b, other);
  for (let index = 0; index < first.length; index++) {
    const before = first[index], after = second[index];
    assertJoinMetadata(before, after);
    setOpen(a, before.id, "end", true); setOpen(b, after.id, "start", true);
  }
  const errors = [...check(a, types), ...check(b, types)];
  if (errors.length) throw new EditError(errors[0]);
  const prior = new Set(assemble([left, right], types)[1]), warnings = assemble([a, b], types)[1].filter(warning => !prior.has(warning));
  if (warnings.length) throw new EditError(warnings[0]);
  assertFocusEdit("units", left, a); assertFocusEdit("units", right, b);
  return [a, b];
}
