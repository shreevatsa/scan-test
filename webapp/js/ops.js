// Edits to a page document (schema 0.2), as pure functions on a document the caller owns (the app clones it first
// and keeps the previous version for undo). Each kind of element has its natural edit (schema/README.md, "Editing"):
// text and spans on line pieces; units joined, split, retyped, wrapped, unwrapped, moved and deleted; regions
// retyped, boxed, added, deleted and moved between units; markers inserted, removed and linked to notes; relations
// added and removed. Functions throw an Error with a message for the user when an edit cannot be made; the result
// is checked with schema.js before it is saved.

import { cp, nextMarkerId, normalizeSpans } from "./inline.js";
import { rebuildProvisional } from "./pipeline/provisional.js?v=20261113-flags-1";

export class EditError extends Error {}
const fail = msg => { throw new EditError(msg); };

export const clone = x => JSON.parse(JSON.stringify(x));

// JSON with object keys sorted, to compare documents whatever order their keys were written in.
export const canonical = x => JSON.stringify(x, (k, v) => (v && typeof v === "object" && !Array.isArray(v)
  ? Object.fromEntries(Object.keys(v).sort().map(key => [key, v[key]])) : v));

// ---------------------------------------------------------------- lookups

export const unitById = (doc, uid) => doc.units.find(u => u.id === uid) || fail(`no unit ${uid}`);
export const regionById = (doc, rid) => doc.page.regions.find(r => r.id === rid) || fail(`no region ${rid}`);
export const regionRef = (doc, rid) => `${doc.page.id}#${rid}`;
const localRegion = ref => ref.split("#")[1];

// The unit that owns a region, or null (furniture).
export function ownerOf(doc, rid) {
  const ref = regionRef(doc, rid);
  return doc.units.find(u => u.children.some(c => c.region === ref)) || null;
}

// Where a unit stands: {parent: unit} or {flow: name}, with its siblings list and index.
export function placeOf(doc, uid) {
  for (const u of doc.units) {
    const i = u.children.findIndex(c => c.unit === uid);
    if (i >= 0) return { parent: u, list: u.children, index: i, item: u.children[i] };
  }
  for (const [flow, tops] of Object.entries(doc.flows)) {
    const i = tops.indexOf(uid);
    if (i >= 0) return { flow, list: tops, index: i, item: uid };
  }
  return null;
}

const childUid = item => (typeof item === "string" ? item : item.unit);

function newUnitId(doc) {
  let n = 0;
  for (const u of doc.units) { const m = /^u(\d+)$/.exec(u.id); if (m) n = Math.max(n, +m[1]); }
  return `u${n + 1}`;
}

function newRegionId(doc) {
  let n = 0;
  for (const r of doc.page.regions) { const m = /^r(\d+)$/.exec(r.id); if (m) n = Math.max(n, +m[1]); }
  return `r${n + 1}`;
}

// The top edge of a unit or region on the page (the smallest y of its regions' outlines), for reading order.
function topOf(doc, item) {
  const uid = typeof item === "string" ? item : item.unit;
  if (uid) {
    const u = doc.units.find(x => x.id === uid);
    return u ? Math.min(Infinity, ...u.children.map(c => topOf(doc, c))) : Infinity;
  }
  const r = doc.page.regions.find(x => x.id === localRegion(item.region));
  return r ? Math.min(Infinity, ...r.polygons.flat().map(p => p[1])) : Infinity;
}

// Where a new item with top edge `y` goes in a list of siblings: before the first sibling that starts below it,
// and never after a last sibling that is open at the page's end.
function insertionIndex(doc, list, y) {
  let i = list.findIndex(item => topOf(doc, item) > y);
  if (i < 0) i = list.length;
  const last = list[list.length - 1];
  const lastUid = typeof last === "string" ? last : last && last.unit;
  if (i === list.length && lastUid && (doc.units.find(u => u.id === lastUid)?.open || {}).end) i = list.length - 1;
  return Math.max(0, i);
}

// Drop the relations list when it is empty.
function tidyRelations(doc) { if (doc.relations && !doc.relations.length) delete doc.relations; return doc; }

const isFurniture = (tl, type) => (tl.types[type] || {}).role === "furniture";
const printedAs = (tl, type) => (tl.types[type] || {}).region;

// Types a unit may be given: those printed as regions if it owns regions, containers if it holds units.
export function retypeChoices(doc, tl, uid) {
  const u = unitById(doc, uid);
  const ownsRegions = u.children.some(c => "region" in c), holdsUnits = u.children.some(c => "unit" in c);
  return Object.entries(tl.types).filter(([, t]) => t.role !== "furniture" &&
    (!ownsRegions || "region" in t) && (!holdsUnits || (t.contains || []).length)).map(([n]) => n);
}

// Container types that may hold a unit of `type`.
export const containersFor = (tl, type) => Object.entries(tl.types).filter(([, t]) => (t.contains || []).includes(type)).map(([n]) => n);

// ---------------------------------------------------------------- units

export function setUnitField(doc, uid, field, value) {
  const u = unitById(doc, uid);
  if (!["number", "label", "lang"].includes(field)) fail(`cannot set ${field}`);
  if (value === "" || value === null || value === undefined) delete u[field];
  else u[field] = String(value);
  return doc;
}

export function setOpen(doc, uid, end, value) {
  const u = unitById(doc, uid);
  const open = { ...(u.open || {}) };
  if (value) open[end] = true; else delete open[end];
  if (Object.keys(open).length) u.open = open; else delete u.open;
  return doc;
}

// Retype a unit; its own regions take the new type with it.
export function retypeUnit(doc, tl, uid, type) {
  const u = unitById(doc, uid);
  if (!tl.types[type] || isFurniture(tl, type)) fail(`${type} is not a unit type`);
  if (u.children.some(c => "region" in c) && !printedAs(tl, type)) fail(`${type} is a container: it cannot own this unit's regions`);
  u.type = type;
  for (const c of u.children) if ("region" in c) regionById(doc, localRegion(c.region)).type = type;
  return doc;
}

// Split a unit before child `index`: the children from there on go to a new unit of the same type, right after it.
export function splitUnit(doc, uid, index) {
  const u = unitById(doc, uid);
  if (index <= 0 || index >= u.children.length) fail("split between two children");
  const nu = { id: newUnitId(doc), type: u.type, children: u.children.splice(index) };
  if (u.lang) nu.lang = u.lang;
  if ((u.open || {}).end) { nu.open = { end: true }; setOpen(doc, uid, "end", false); }
  doc.units.splice(doc.units.indexOf(u) + 1, 0, nu);
  const place = placeOf(doc, uid);
  if (place) place.list.splice(place.index + 1, 0, place.flow ? nu.id : { unit: nu.id });
  return nu.id;
}

// Join a unit with its next sibling of the same type: the sibling's children are appended, and the sibling goes.
export function joinWithNext(doc, uid) {
  const place = placeOf(doc, uid) || fail(`${uid} stands nowhere`);
  if (place.index + 1 >= place.list.length) fail("no next unit to join with");
  const nid = childUid(place.list[place.index + 1]);
  if (!nid) fail("the next item is a region, not a unit");
  const u = unitById(doc, uid), n = unitById(doc, nid);
  if (n.type !== u.type) fail(`the next unit is a ${n.type}, not a ${u.type}`);
  u.children.push(...n.children);
  setOpen(doc, uid, "end", !!(n.open || {}).end);
  for (const k of ["number", "label", "lang"]) if (n[k] && !u[k]) u[k] = n[k];
  place.list.splice(place.index + 1, 1);
  doc.units.splice(doc.units.indexOf(n), 1);
  for (const rel of doc.relations || []) for (const side of ["from", "to"]) if (rel[side].unit === nid) rel[side].unit = uid;
  return doc;
}

// Move an item (unit or region) among its siblings by `delta`.
export function moveChild(doc, container, index, delta) {
  const list = container.flow ? doc.flows[container.flow] : unitById(doc, container.unit).children;
  const j = index + delta;
  if (j < 0 || j >= list.length) fail("cannot move further");
  [list[index], list[j]] = [list[j], list[index]];
  return doc;
}

// Put a unit inside a new container of `type`, in its place.
export function wrapUnit(doc, tl, uid, type) {
  const u = unitById(doc, uid);
  if (!(tl.types[type]?.contains || []).includes(u.type)) fail(`a ${type} may not contain a ${u.type}`);
  const place = placeOf(doc, uid) || fail(`${uid} stands nowhere`);
  const nu = { id: newUnitId(doc), type, children: [{ unit: uid }] };
  for (const end of ["start", "end"]) if ((u.open || {})[end]) (nu.open ||= {})[end] = true;
  doc.units.splice(doc.units.indexOf(u), 0, nu);
  place.list[place.index] = place.flow ? nu.id : { unit: nu.id };
  return nu.id;
}

// Replace a container with its child units, in its place.
export function unwrapUnit(doc, uid) {
  const u = unitById(doc, uid);
  if (u.children.some(c => "region" in c)) fail("this unit owns regions; only a container can be unwrapped");
  const place = placeOf(doc, uid) || fail(`${uid} stands nowhere`);
  const items = u.children.map(c => (place.flow ? c.unit : { unit: c.unit }));
  place.list.splice(place.index, 1, ...items);
  doc.units.splice(doc.units.indexOf(u), 1);
  doc.relations = (doc.relations || []).filter(rel => rel.from.unit !== uid && rel.to.unit !== uid);
  return doc;
}

// Delete a unit with everything in it: its child units, and its regions (from the page as well).
export function deleteUnit(doc, uid) {
  const u = unitById(doc, uid);
  for (const c of [...u.children]) {
    if ("unit" in c) deleteUnit(doc, c.unit);
    else removeRegionOnly(doc, localRegion(c.region));
  }
  const place = placeOf(doc, uid);
  if (place) place.list.splice(place.index, 1);
  doc.units.splice(doc.units.indexOf(u), 1);
  doc.relations = (doc.relations || []).filter(rel => rel.from.unit !== uid && rel.to.unit !== uid);
  return tidyRelations(doc);
}

// Remove units left with no children, upwards from `uid`.
function pruneEmpty(doc, uid) {
  while (uid) {
    const u = doc.units.find(x => x.id === uid);
    if (!u || u.children.length) return;
    const place = placeOf(doc, uid);
    if (place) place.list.splice(place.index, 1);
    doc.units.splice(doc.units.indexOf(u), 1);
    doc.relations = (doc.relations || []).filter(rel => rel.from.unit !== uid && rel.to.unit !== uid);
    uid = place && place.parent ? place.parent.id : null;
  }
}

// ---------------------------------------------------------------- regions

function anchorsIn(doc, r) {
  return new Set((r.lines || []).flatMap(L => (L.spans || []).filter(s => s.id).map(s => `${doc.page.id}#${s.id}`)));
}

function removeRegionOnly(doc, rid) {
  const r = regionById(doc, rid), ref = regionRef(doc, rid), anchors = anchorsIn(doc, r);
  doc.page.regions.splice(doc.page.regions.indexOf(r), 1);
  doc.relations = (doc.relations || []).filter(rel => rel.from.region !== ref && !anchors.has(rel.from.anchor));
}

// Delete a region from the page; its unit goes too if it is left empty.
export function deleteRegion(doc, rid) {
  const owner = ownerOf(doc, rid), ref = regionRef(doc, rid);
  if (owner) owner.children.splice(owner.children.findIndex(c => c.region === ref), 1);
  removeRegionOnly(doc, rid);
  if (owner) pruneEmpty(doc, owner.id);
  return tidyRelations(doc);
}

// The rectangle [x1, y1, x2, y2] as a polygon ring of pixel centers.
export const boxRing = ([x1, y1, x2, y2]) => [[x1, y1], [x2, y1], [x2, y2], [x1, y2]].map(p => p.map(Math.round));

// Set a region's editable box. Until the outline step runs in the browser, the outline becomes the box itself.
export function setBox(doc, rid, box, outline = null) {
  if (!Array.isArray(box) || box.length !== 4 || box.some(value => !Number.isFinite(value))) fail("enter four finite box coordinates");
  const r = regionById(doc, rid);
  const [x1, y1, x2, y2] = box;
  const b = [Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2)].map(Math.round);
  if (b[2] - b[0] < 2 || b[3] - b[1] < 2) fail("the box is too small");
  r.box = b;
  r.polygons = outline || [boxRing(b)];
  r.source = { ...(r.source || {}), outline: outline ? "recomputed in the browser from the edited box" : "the edited box (outline not recomputed)" };
  return doc;
}

// Add a region of `type` with `box` and one empty line piece. A text region gets a new unit: inside `into` (a unit
// of the same type, which takes the region; or a container that may hold the type), else at the top of the type's
// flow. Returns the new region's id.
export function addRegion(doc, tl, type, box, into = null) {
  if (!tl.types[type] || !printedAs(tl, type)) fail(`${type} is not printed as regions`);
  const rid = newRegionId(doc);
  const r = { id: rid, type, polygons: [boxRing(box)], box: box.map(Math.round), lines: doc.source?.layers?.units?.state === "provisional" ? [] : [{ text: "" }],
              order: isFurniture(tl, type) ? null : Math.max(0, ...doc.page.regions.map(region => region.order || 0)) + 1,
              source: { added_by: "the user, in the web app" } };
  // A figure has no text of its own (its unit's label says what it shows).
  if (printedAs(tl, type) === "figure") delete r.lines;
  doc.page.regions.push(r);
  if (doc.source?.layers?.units?.state === "provisional") { rebuildProvisional(doc, tl); return rid; }
  if (isFurniture(tl, type)) return rid;
  const ref = regionRef(doc, rid);
  if (into) {
    const target = unitById(doc, into);
    const at = insertionIndex(doc, target.children, box[1]);
    if (target.type === type) { target.children.splice(at, 0, { region: ref }); return rid; }
    if ((tl.types[target.type].contains || []).includes(type)) {
      const uid = newUnitId(doc);
      doc.units.push({ id: uid, type, children: [{ region: ref }] });
      target.children.splice(at, 0, { unit: uid });
      return rid;
    }
  }
  const flow = tl.types[type].flow;
  if (!flow) {
    doc.page.regions.pop();
    fail(`a ${type} cannot stand at the top level; select a unit that may contain it (${containersFor(tl, type).join(", ")}) first`);
  }
  const uid = newUnitId(doc);
  doc.units.push({ id: uid, type, children: [{ region: ref }] });
  const tops = (doc.flows[flow] ||= []);
  tops.splice(insertionIndex(doc, tops, box[1]), 0, uid);
  return rid;
}

// Change a region's type. A text region alone in its unit retypes the unit; one among others is split off into a
// unit of its own, right after its unit's other regions before it. Furniture leaves its unit; a furniture region
// made text gets a unit at the top of its type's flow, or inside `into`.
export function setRegionType(doc, tl, rid, type, into = null) {
  const r = regionById(doc, rid);
  if (!tl.types[type] || !printedAs(tl, type)) fail(`${type} is not printed as regions`);
  if (r.type === type) return doc;
  if (doc.source?.layers?.units?.state === "provisional") {
    r.type = type;
    r.order = isFurniture(tl, type) ? null : r.order ?? Math.max(0, ...doc.page.regions.map(region => region.order || 0)) + 1;
    if (printedAs(tl, type) === "figure" && r.lines?.length) {
      r.source = { ...r.source, kept_text: clone(r.lines) };
      r.lines = [];
    } else if (printedAs(tl, type) !== "figure" && r.source?.kept_text) {
      r.lines = clone(r.source.kept_text);
      delete r.source.kept_text;
    }
    return rebuildProvisional(doc, tl);
  }
  const owner = ownerOf(doc, rid), ref = regionRef(doc, rid);
  if (isFurniture(tl, type)) {
    if (owner) { owner.children.splice(owner.children.findIndex(c => c.region === ref), 1); pruneEmpty(doc, owner.id); }
    r.type = type;
    return doc;
  }
  if (!owner) {
    const box = r.box;
    const saved = clone(r);
    // A type that cannot stand at the top of a flow goes into the container on the page that the region falls in
    // (the last one that starts above it, else the first), unless one is given.
    if (!into && !tl.types[type].flow) {
      const y = topOf(doc, { region: regionRef(doc, rid) });
      const homes = doc.units.filter(u => (tl.types[u.type]?.contains || []).includes(type));
      const above = homes.filter(u => topOf(doc, u.id) <= y);
      const home = above.length ? above.reduce((a, b) => (topOf(doc, b.id) >= topOf(doc, a.id) ? b : a)) : homes[0];
      if (!home) fail(`a ${type} cannot stand at the top level, and no unit on this page may contain it (${containersFor(tl, type).join(", ")})`);
      into = home.id;
    }
    deleteRegion(doc, rid);
    const nid = addRegion(doc, tl, type, box || [0, 0, 10, 10], into);
    const nr = regionById(doc, nid);
    Object.assign(nr, { ...saved, id: nid, type });
    return doc;
  }
  if (owner.children.length === 1) return retypeUnit(doc, tl, owner.id, type);
  // Split the region off into its own unit, in its owner's place among the owner's parent's children.
  const i = owner.children.findIndex(c => c.region === ref);
  if (i + 1 < owner.children.length) splitUnit(doc, owner.id, i + 1);
  if (i > 0) splitUnit(doc, owner.id, i);
  const alone = i > 0 ? childUid(placeOf(doc, owner.id).list[placeOf(doc, owner.id).index + 1]) : owner.id;
  return retypeUnit(doc, tl, alone, type);
}

export function moveRegionOrder(doc, tl, rid, delta) {
  const region = regionById(doc, rid);
  if (![1, -1].includes(delta)) fail("move a region one position earlier or later");
  if (isFurniture(tl, region.type)) fail("page furniture has no reading-order position");
  const ordered = doc.page.regions.filter(value => !isFurniture(tl, value.type))
    .sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity));
  const index = ordered.indexOf(region), destination = index + delta;
  if (destination < 0 || destination >= ordered.length) return doc;
  [ordered[index], ordered[destination]] = [ordered[destination], ordered[index]];
  ordered.forEach((value, position) => { value.order = position + 1; });
  return rebuildProvisional(doc, tl);
}

function mergedLinePieces(lines) {
  const result = [], byId = new Map();
  for (const original of lines) {
    const line = clone(original), previous = line.line === undefined ? null : byId.get(line.line);
    if (!previous) {
      result.push(line);
      if (line.line !== undefined) byId.set(line.line, line);
      continue;
    }
    if (canonical(previous.polygons) === canonical(line.polygons)) {
      if (canonical(previous) !== canonical(line)) fail("overlapping line pieces have conflicting text or formatting; review their text before merging");
      continue;
    }
    if ((previous.text !== undefined) !== (line.text !== undefined)) fail("review the partially transcribed line pieces before merging these regions");
    if (previous.style && line.style && canonical(previous.style) !== canonical(line.style)) fail("review the different line styles before merging these regions");
    const prefix = cp(previous.text || "");
    if (previous.end === "hyphen" && /[-‐]/u.test(prefix.at(-1) || "")) prefix.pop();
    const separator = prefix.length && line.text && !["join", "hyphen"].includes(previous.end) ? " " : "";
    const shift = prefix.length + separator.length;
    const spans = (previous.spans || []).map(span => ({ ...span, start: Math.min(span.start, prefix.length), end: Math.min(span.end, prefix.length) }));
    spans.push(...(line.spans || []).map(span => ({ ...span, start: span.start + shift, end: span.end + shift })));
    if (previous.text !== undefined || line.text !== undefined) previous.text = prefix.join("") + separator + (line.text || "");
    previous.polygons = [...(previous.polygons || []), ...(line.polygons || [])];
    if (spans.length) previous.spans = normalizeSpans(spans);
    if (line.end !== undefined) previous.end = line.end; else delete previous.end;
    if (line.style && !previous.style) previous.style = line.style;
  }
  return result.sort((a, b) => (a.line ?? Infinity) - (b.line ?? Infinity));
}

export function mergeRegions(doc, tl, keepRid, otherRid) {
  if (keepRid === otherRid) fail("choose a second region to merge");
  const keep = regionById(doc, keepRid), other = regionById(doc, otherRid);
  if (keep.type !== other.type) fail("give the regions the same type before merging them");
  const keepOwner = ownerOf(doc, keepRid), otherOwner = ownerOf(doc, otherRid);
  const provisional = doc.source?.layers?.units?.state === "provisional";
  if (!provisional && keepOwner?.id !== otherOwner?.id) {
    if (!keepOwner || !otherOwner || otherOwner.children.length !== 1) fail("merge regions in the same unit or merge a whole neighboring leaf unit");
    const a = placeOf(doc, keepOwner.id), b = placeOf(doc, otherOwner.id);
    if (!a || !b || a.list !== b.list) fail("put these units under the same parent in Read before merging their regions");
    for (const key of ["number", "label", "style"]) if (keepOwner[key] && otherOwner[key] && canonical(keepOwner[key]) !== canonical(otherOwner[key]))
      fail(`the units have different ${key} values; review them in Read before merging`);
  }
  const ordered = [keep, other].sort((a, b) => (a.order ?? doc.page.regions.indexOf(a)) - (b.order ?? doc.page.regions.indexOf(b)));
  const firstOwner = ownerOf(doc, ordered[0].id), lastOwner = ownerOf(doc, ordered[1].id);
  const open = { ...(firstOwner?.open?.start ? { start: true } : {}), ...(lastOwner?.open?.end ? { end: true } : {}) };
  const lines = mergedLinePieces(ordered.flatMap(region => region.lines || []));
  const a = regionBox(keep), b = regionBox(other);
  keep.box = [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
  keep.polygons = [boxRing(keep.box)];
  keep.lines = lines;
  keep.order = isFurniture(tl, keep.type) ? null : Math.min(keep.order ?? Infinity, other.order ?? Infinity);
  if (!Number.isFinite(keep.order) && keep.order !== null) keep.order = 1;
  keep.source = { ...keep.source, merged_from: [...(keep.source?.merged_from || []), clone(other)],
    continues_from_earlier: !!ordered[0].source?.continues_from_earlier, continues_later: !!ordered[1].source?.continues_later,
    outline: "the merged box (outline not recomputed)" };
  if (keepOwner && otherOwner && keepOwner !== otherOwner) for (const key of ["number", "label", "style"]) {
    if (!keepOwner[key] && otherOwner[key]) keepOwner[key] = clone(otherOwner[key]);
  }
  if (keepOwner) { if (Object.keys(open).length) keepOwner.open = open; else delete keepOwner.open; }
  for (const relation of doc.relations || []) for (const endpoint of [relation.from, relation.to]) {
    if (endpoint.region === regionRef(doc, otherRid)) endpoint.region = regionRef(doc, keepRid);
    if (otherOwner && keepOwner && otherOwner !== keepOwner && endpoint.unit === otherOwner.id) endpoint.unit = keepOwner.id;
  }
  // Its markers and their links now belong to the merged region.
  other.lines = [];
  deleteRegion(doc, otherRid);
  return rebuildProvisional(doc, tl);
}

// Make a unit page furniture of `type` (a furniture type, such as an ornament): its regions take the type and leave
// the text, and the unit, left empty, goes (with relations to it). Returns the regions' ids.
export function unitToFurniture(doc, tl, uid, type) {
  const u = unitById(doc, uid);
  if (!isFurniture(tl, type)) fail(`${type} is not page furniture`);
  if (u.children.some(c => "unit" in c)) fail("this unit holds other units; move them out of it first");
  const rids = u.children.map(c => localRegion(c.region));
  for (const rid of rids) setRegionType(doc, tl, rid, type);
  return rids;
}

// Move a region to another unit: its type becomes the target's type, and the unit it leaves goes if empty.
export function moveRegionToUnit(doc, tl, rid, targetUid) {
  const target = unitById(doc, targetUid);
  if (!printedAs(tl, target.type)) fail(`a ${target.type} owns no regions`);
  const owner = ownerOf(doc, rid), ref = regionRef(doc, rid);
  if (owner && owner.id === targetUid) return doc;
  if (owner) owner.children.splice(owner.children.findIndex(c => c.region === ref), 1);
  target.children.splice(insertionIndex(doc, target.children, topOf(doc, { region: ref })), 0, { region: ref });
  regionById(doc, rid).type = target.type;
  if (owner) pruneEmpty(doc, owner.id);
  return doc;
}

// The boxes the outline step works from, one per region: the editable box, else the region step's box, else the
// outline's bounds.
export function boxesOf(doc) {
  return doc.page.regions.map(r => r.box || r.source?.model_box || (() => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const ring of r.polygons) for (const [x, y] of ring) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + 1); y1 = Math.max(y1, y + 1); }
    return [x0, y0, x1, y1];
  })());
}

// Put recomputed outlines on the page (geometry from the local step, one entry per region in page order: {rings,
// lines: [{line_id, rings}]}). Each line piece keeps its text: a piece goes with its line id, to whichever region
// now has that line, if that region has no text for it yet. A piece whose line is in no region now, or whose line's
// region already has text there, stays in its region without an outline (its line id kept, so that it finds its
// line again if the box goes back). A region whose box holds no ink keeps its outline as the box.
export function applyGeometry(doc, geometry) {
  const regions = doc.page.regions;
  if (geometry.length !== regions.length) fail("the outlines do not match the regions");
  const old = regions.map(r => (r.lines || []).map(L => ({ ...L })));
  const used = regions.map(r => new Set());
  const take = (ri, k) => { used[ri].add(k); return old[ri][k]; };
  const newLines = geometry.map((g, ri) => g.lines.map(G => {
    let src = null, sourceRegion = ri;
    const ids = G.previous_line_ids || [G.line_id];
    // Prefer text on the parent, then text on one of its former fragments.
    const available = old[ri].map((L, j) => j).filter(j => ids.includes(old[ri][j].line) && !used[ri].has(j));
    const hasContent = L => L.text || (L.spans || []).length;
    const k = available.find(j => old[ri][j].line === G.line_id && hasContent(old[ri][j]))
      ?? available.find(j => hasContent(old[ri][j])) ?? available[0] ?? -1;
    if (k >= 0) src = take(ri, k);
    else {
      for (let rj = 0; rj < regions.length && !src; rj++) {
        if (rj === ri || geometry[rj].lines.some(x => x.line_id === G.line_id)) continue;
        const j = old[rj].findIndex((L, q) => ids.includes(L.line) && !used[rj].has(q));
        if (j >= 0) { src = take(rj, j); sourceRegion = rj; }
      }
    }
    const piece = { line: G.line_id, polygons: G.rings };
    if (src) for (const key of ["text", "end", "spans", "style"]) if (src[key] !== undefined) piece[key] = src[key];
    if (src) for (const relation of doc.relations || []) for (const side of ["from", "to"]) {
      const endpoint = relation[side];
      if (endpoint?.region === regionRef(doc, regions[sourceRegion].id) && endpoint.line === src.line) {
        endpoint.region = regionRef(doc, regions[ri].id);
        endpoint.line = G.line_id;
      }
    }
    return piece;
  }));
  regions.forEach((r, ri) => {
    const g = geometry[ri];
    // Pieces not placed on a line: kept without an outline, among the others by line id.
    const left = old[ri].filter((L, k) => !used[ri].has(k) && (L.text || (L.spans || []).length || L.line === undefined))
      .map(L => { const { polygons, ...rest } = L; return rest; });
    if (!g.rings.length) {
      r.polygons = [boxRing(r.box || boxesOf(doc)[ri])];
      r.lines = old[ri];
      r.source = { ...(r.source || {}), no_ink: true, outline: "the box (no ink in it)" };
      return;
    }
    r.polygons = g.rings;
    const lines = [...newLines[ri], ...left];
    lines.sort((a, b) => (a.line ?? Infinity) - (b.line ?? Infinity));
    r.lines = lines;
    r.source = { ...(r.source || {}), outline: "recomputed in the browser from the boxes" };
    delete r.source.no_ink;
  });
  return doc;
}

// ---------------------------------------------------------------- line pieces

export function setLine(doc, rid, i, text, spans) {
  const L = regionById(doc, rid).lines[i] || fail("no such line piece");
  L.text = text;
  const s = normalizeSpans(spans || []);
  if (s.length) L.spans = s; else delete L.spans;
  // Relations anchored to markers that are gone are dropped with them.
  const live = new Set(doc.page.regions.flatMap(r => (r.lines || []).flatMap(x => (x.spans || []).filter(sp => sp.id).map(sp => `${doc.page.id}#${sp.id}`))));
  doc.relations = (doc.relations || []).filter(rel => !rel.from.anchor || live.has(rel.from.anchor));
  return tidyRelations(doc);
}

// Replace code points [a, b) of a line piece with `insert` (plain text). Spans after the change move with the
// text, spans across it are clipped, and markers inside it go (with their relations).
export function replaceInLine(doc, rid, i, a, b, insert) {
  const L = regionById(doc, rid).lines[i] || fail("no such line piece");
  const chars = cp(L.text), ins = cp(insert.replace(/[\r\n]+/g, " "));
  a = Math.max(0, Math.min(a, chars.length)); b = Math.max(a, Math.min(b, chars.length));
  const delta = ins.length - (b - a);
  const spans = [];
  for (const sp of L.spans || []) {
    if (sp.kind === "note_marker") {
      if (sp.start <= a) spans.push(sp);
      else if (sp.start >= b) spans.push({ ...sp, start: sp.start + delta, end: sp.end + delta });
      continue;
    }
    const pieces = [];
    if (sp.start < a) pieces.push([sp.start, Math.min(sp.end, a)]);
    if (sp.end > b) pieces.push([Math.max(sp.start, b) + delta, sp.end + delta]);
    // A span around the whole change takes the inserted text too.
    if (sp.start < a && sp.end > b) { spans.push({ ...sp, end: sp.end + delta }); continue; }
    for (const [s0, e0] of pieces) spans.push({ ...sp, start: s0, end: e0 });
  }
  return setLine(doc, rid, i, [...chars.slice(0, a), ...ins, ...chars.slice(b)].join(""), spans);
}

export function setLineEnd(doc, rid, i, end) {
  const L = regionById(doc, rid).lines[i] || fail("no such line piece");
  if (end === "space") delete L.end; else L.end = end;
  return doc;
}

// Add an empty line piece (text only, no outline) after piece `i` (-1: first).
export function addLine(doc, rid, i) {
  const r = regionById(doc, rid);
  (r.lines ||= []).splice(i + 1, 0, { text: "" });
  return doc;
}

export function deleteLine(doc, rid, i) {
  const r = regionById(doc, rid);
  if (!r.lines || !r.lines[i]) fail("no such line piece");
  const gone = new Set((r.lines[i].spans || []).filter(s => s.id).map(s => `${doc.page.id}#${s.id}`));
  r.lines.splice(i, 1);
  doc.relations = (doc.relations || []).filter(rel => !gone.has(rel.from.anchor));
  return tidyRelations(doc);
}

// Put a region's kept text (source.transcription.lines, kept when the model's line count did not match the line
// pieces) onto its pieces, one line each; extra lines become text-only pieces.
export function useKeptText(doc, rid) {
  const r = regionById(doc, rid);
  const kept = r.source?.transcription?.lines || fail("this region has no kept text");
  r.lines ||= [];
  kept.forEach((k, i) => {
    if (!r.lines[i]) r.lines.push({});
    r.lines[i].text = k.text ?? "";
    if (k.end && k.end !== "space") r.lines[i].end = k.end; else delete r.lines[i].end;
  });
  return doc;
}

// ---------------------------------------------------------------- markers and relations

export function findMarker(doc, sid) {
  for (const r of doc.page.regions) for (let i = 0; i < (r.lines || []).length; i++) {
    const s = (r.lines[i].spans || []).find(x => x.id === sid);
    if (s) return { region: r, index: i, line: r.lines[i], span: s };
  }
  return null;
}

// Insert a note marker with printed `sign` at code-point `offset` of a line piece. Returns its span id.
export function insertMarker(doc, rid, i, offset, sign) {
  const L = regionById(doc, rid).lines[i] || fail("no such line piece");
  if (!sign || /[\s\]]/.test(sign)) fail("give the marker as printed, such as 1, १ or *");
  const id = nextMarkerId(doc);
  const at = Math.max(0, Math.min(offset, cp(L.text).length));
  L.spans = normalizeSpans([...(L.spans || []), { start: at, end: at, kind: "note_marker", id, marker: sign }]);
  return id;
}

export function deleteMarker(doc, sid) {
  const m = findMarker(doc, sid) || fail(`no marker ${sid}`);
  m.line.spans = m.line.spans.filter(s => s !== m.span);
  if (!m.line.spans.length) delete m.line.spans;
  const ref = `${doc.page.id}#${sid}`;
  doc.relations = (doc.relations || []).filter(rel => rel.from.anchor !== ref);
  return tidyRelations(doc);
}

export function setMarkerSign(doc, sid, sign) {
  const m = findMarker(doc, sid) || fail(`no marker ${sid}`);
  if (!sign || /[\s\]]/.test(sign)) fail("give the marker as printed");
  m.span.marker = sign;
  return doc;
}

// Link a marker to a note unit (or unlink it, with noteUid null). One note relation per marker.
export function linkMarker(doc, tl, sid, noteUid) {
  const m = findMarker(doc, sid) || fail(`no marker ${sid}`);
  const ref = `${doc.page.id}#${sid}`, rref = regionRef(doc, m.region.id);
  // The marker's old relation goes, and so does an anchorless one the model gave for the same note from the same
  // region (and line piece), which this link replaces.
  doc.relations = (doc.relations || []).filter(rel => !(rel.type === "note" && (rel.from.anchor === ref ||
    (!rel.from.anchor && noteUid && rel.to.unit === noteUid && rel.from.region === rref &&
     (rel.from.line === undefined || rel.from.line === m.line.line)))));
  if (noteUid) {
    if (!(tl.relations || {}).note) fail("this book's type list has no note relation");
    unitById(doc, noteUid);
    doc.relations.push({ type: "note", from: { anchor: ref }, to: { unit: noteUid } });
  }
  if (!doc.relations.length) delete doc.relations;
  return doc;
}

// Give an unanchored note relation (the model named a line or marker the page document could not match) the anchor
// of a marker.
export function anchorRelation(doc, index, sid) {
  const rel = (doc.relations || [])[index] || fail("no such relation");
  findMarker(doc, sid) || fail(`no marker ${sid}`);
  rel.from = { anchor: `${doc.page.id}#${sid}` };
  return doc;
}

export function addRelation(doc, tl, type, fromUid, toUid) {
  if (!(tl.relations || {})[type]) fail(`no relation type ${type}`);
  unitById(doc, fromUid); unitById(doc, toUid);
  (doc.relations ||= []).push({ type, from: { unit: fromUid }, to: { unit: toUid } });
  return doc;
}

export function removeRelation(doc, index) {
  if (!(doc.relations || [])[index]) fail("no such relation");
  doc.relations.splice(index, 1);
  if (!doc.relations.length) delete doc.relations;
  return doc;
}

// The note units a marker may point to: units of a type printed as notes, and the top-level units of flows other
// than main.
export function noteTargets(doc, tl) {
  const out = [];
  for (const u of doc.units) {
    const t = tl.types[u.type] || {};
    const top = Object.entries(doc.flows).find(([, tops]) => tops.includes(u.id));
    if (t.region === "note" || (top && top[0] !== "main")) out.push(u);
  }
  return out;
}

// ---------------------------------------------------------------- blocks and columns

// The bounds [x0, y0, x1, y1] of line pieces' outlines, or null if none has one.
function piecesBounds(lines) {
  const pts = lines.flatMap(L => (L.polygons || []).flat());
  if (!pts.length) return null;
  return [Math.min(...pts.map(p => p[0])), Math.min(...pts.map(p => p[1])), Math.max(...pts.map(p => p[0])), Math.max(...pts.map(p => p[1]))];
}

const regionBox = r => r.box || boxesOf({ page: { regions: [r] } })[0];

// Split a region before line piece `i`: the pieces from there on go to a new region of the same type right after it.
// With `newUnit` (the default) the new region starts a new unit of the owner's type right after the owner, taking
// the owner's later children with it (as for a paragraph that should be two); otherwise it stays in the same unit.
// The two boxes are the old box cut between the pieces; their outlines are the boxes until the outline step runs
// again. Returns the new region's id.
export function splitRegionAt(doc, rid, i, newUnit = true) {
  const r = regionById(doc, rid);
  const lines = r.lines || [];
  if (i <= 0 || i >= lines.length) fail("put the caret in a line piece after the region's first, where the new part begins");
  const owner = ownerOf(doc, rid), ref = regionRef(doc, rid);
  const box = regionBox(r);
  const nid = newRegionId(doc);
  const nr = { id: nid, type: r.type, polygons: [], lines: lines.splice(i), source: { split_from: rid, by: "the user, in the web app" } };
  if (Number.isFinite(r.order)) {
    for (const other of doc.page.regions) if (other !== r && other.order > r.order) other.order++;
    nr.order = r.order + 1;
  }
  if (r.source?.continues_later) {
    nr.source.continues_later = true;
    delete r.source.continues_later;
  }
  const a = piecesBounds(r.lines), b = piecesBounds(nr.lines);
  const cut = a && b && a[3] < b[1] ? Math.round((a[3] + b[1]) / 2)
    : Math.round(box[1] + (box[3] - box[1]) * r.lines.length / (r.lines.length + nr.lines.length));
  r.box = [box[0], box[1], box[2], Math.max(box[1] + 2, cut)];
  nr.box = [box[0], Math.min(box[3] - 2, cut + 1), box[2], box[3]];
  for (const x of [r, nr]) {
    x.polygons = [boxRing(x.box)];
    x.source = { ...(x.source || {}), outline: "the box (split in the web app; outline not recomputed)" };
  }
  doc.page.regions.splice(doc.page.regions.indexOf(r) + 1, 0, nr);
  if (!owner) return nid;
  const k = owner.children.findIndex(c => c.region === ref);
  owner.children.splice(k + 1, 0, { region: regionRef(doc, nid) });
  if (newUnit) splitUnit(doc, owner.id, k + 1);
  return nid;
}

// Move the text after code point `offset` of line piece `i` to a column on the right, for a block printed in two
// columns whose lines were read across both. The first use makes the column: a region of the same type (in a new
// unit of the owner's type, right after the owner), marked source.column_of; later uses on the region's other
// lines add to it, in line order. The moved text keeps its spans and note markers (and so their relations); its
// piece keeps the line id, and the line's outline is cut where the text is cut, in proportion to the characters.
// At offset 0 the whole piece moves. Returns the column region's id.
export function moveRestToColumn(doc, rid, i, offset) {
  const r = regionById(doc, rid);
  const L = (r.lines || [])[i] || fail("no such line piece");
  const chars = cp(L.text || "");
  offset = Math.max(0, Math.min(offset, chars.length));
  let from = offset;
  while (from < chars.length && /\s/u.test(chars[from])) from++;
  if (from >= chars.length) fail("there is no text after the caret to move");
  let keepEnd = offset;
  while (keepEnd > 0 && /\s/u.test(chars[keepEnd - 1])) keepEnd--;
  const keepSpans = [], moveSpans = [];
  for (const sp of L.spans || []) {
    if (sp.kind === "note_marker") {
      if (sp.start >= from) moveSpans.push({ ...sp, start: sp.start - from, end: sp.end - from });
      else keepSpans.push({ ...sp, start: Math.min(sp.start, keepEnd), end: Math.min(sp.end, keepEnd) });
      continue;
    }
    if (sp.start < keepEnd) keepSpans.push({ ...sp, end: Math.min(sp.end, keepEnd) });
    if (sp.end > from) moveSpans.push({ ...sp, start: Math.max(sp.start, from) - from, end: sp.end - from });
  }
  const moved = { text: chars.slice(from).join("") };
  if (L.line !== undefined) moved.line = L.line;
  if (moveSpans.length) moved.spans = normalizeSpans(moveSpans);
  const lb = piecesBounds([L]);
  if (lb) {
    const xs = Math.round(lb[0] + (lb[2] - lb[0]) * offset / Math.max(1, chars.length));
    moved.polygons = [boxRing([Math.min(xs, lb[2] - 1), lb[1], lb[2], lb[3]])];
    if (keepEnd > 0) L.polygons = [boxRing([lb[0], lb[1], Math.max(lb[0] + 1, xs - 1), lb[3]])];
  }
  if (keepEnd > 0) {
    L.text = chars.slice(0, keepEnd).join("");
    const ks = normalizeSpans(keepSpans);
    if (ks.length) L.spans = ks; else delete L.spans;
  } else {
    r.lines.splice(i, 1);
  }
  // The column region: found again, or made now.
  let col = doc.page.regions.find(x => x.source?.column_of === rid);
  if (!col) {
    const box = regionBox(r);
    const cb = moved.polygons ? piecesBounds([moved]) : [Math.round((box[0] + box[2]) / 2), box[1], box[2], box[3]];
    col = { id: newRegionId(doc), type: r.type, polygons: [], lines: [], source: { column_of: rid, by: "the user, in the web app" } };
    col.box = [cb[0], cb[1], cb[2], cb[3]];
    doc.page.regions.splice(doc.page.regions.indexOf(r) + 1, 0, col);
    const owner = ownerOf(doc, rid);
    if (owner) {
      const nu = { id: newUnitId(doc), type: owner.type, children: [{ region: regionRef(doc, col.id) }] };
      doc.units.splice(doc.units.indexOf(owner) + 1, 0, nu);
      const place = placeOf(doc, owner.id);
      if (place) place.list.splice(place.index + 1, 0, place.flow ? nu.id : { unit: nu.id });
      // The two columns are printed side by side.
      if (place) setRowWithNext(doc, owner.id, true);
    }
  }
  // In line order: by line id where both have one, else by the top of the outline, else at the end.
  const key = x => (x.line !== undefined ? x.line : piecesBounds([x])?.[1] ?? Infinity);
  const at = col.lines.findIndex(x => key(x) > key(moved));
  col.lines.splice(at < 0 ? col.lines.length : at, 0, moved);
  const all = piecesBounds(col.lines);
  if (all) col.box = [Math.min(col.box[0], all[0] - 2), Math.min(col.box[1], all[1] - 2), Math.max(col.box[2], all[2] + 2), Math.max(col.box[3], all[3] + 2)];
  col.polygons = [boxRing(col.box)];
  col.source = { ...col.source, outline: "the box (made in the web app; outline not recomputed)" };
  return col.id;
}

// ---------------------------------------------------------------- styles (schema 0.3)

const STYLE_KEYS = new Set(["font", "size_pt", "leading_pt", "weight", "italic", "align", "margin_left_pt", "indent_pt", "space_before_pt", "space_after_pt", "row", "width"]);

// Set one property of a unit's style (presentation only); an empty value removes it, and an empty style goes.
export function setUnitStyle(doc, uid, key, value) {
  const u = unitById(doc, uid);
  if (!STYLE_KEYS.has(key)) fail(`no style property ${key}`);
  const st = { ...(u.style || {}) };
  if (value === "" || value === null || value === undefined || (typeof value === "number" && !Number.isFinite(value))) delete st[key];
  else st[key] = value;
  if (Object.keys(st).length) u.style = st; else delete u.style;
  if (u.style && !["0.3"].includes(doc.schema_version)) doc.schema_version = "0.3";
  return doc;
}

function newRowId(doc) {
  let n = 0;
  for (const u of doc.units) { const m = /^k(\d+)$/.exec(u.style?.row || ""); if (m) n = Math.max(n, +m[1]); }
  return `k${n + 1}`;
}

// Print a unit side by side with the next unit among its siblings (the same style.row), or (on = false) take it
// out of its row; a row left with one unit is dissolved.
export function setRowWithNext(doc, uid, on) {
  const u = unitById(doc, uid);
  const place = placeOf(doc, uid) || fail(`${uid} stands nowhere`);
  if (on) {
    const nid = place.index + 1 < place.list.length ? childUid(place.list[place.index + 1]) : null;
    if (!nid) fail("there is no next unit beside it to share a row with");
    const n = unitById(doc, nid);
    const row = u.style?.row || n.style?.row || newRowId(doc);
    setUnitStyle(doc, uid, "row", row);
    setUnitStyle(doc, nid, "row", row);
    return doc;
  }
  const row = u.style?.row;
  if (!row) return doc;
  setUnitStyle(doc, uid, "row", null);
  setUnitStyle(doc, uid, "width", null);
  const members = place.list.map(childUid).filter(id => id && unitById(doc, id).style?.row === row);
  if (members.length === 1) { setUnitStyle(doc, members[0], "row", null); setUnitStyle(doc, members[0], "width", null); }
  return doc;
}

// ---------------------------------------------------------------- text of units

// The joined text of a list of line pieces: a space between pieces, a dropped hyphen, nothing, or a line break.
export function joinLines(lines, newline = "\n") {
  let out = "";
  lines.forEach((L, k) => {
    let t = L.text || "";
    const end = L.end || "space";
    if (k === lines.length - 1) { out += t; return; }
    if (end === "hyphen") t = t.replace(/[-‐]$/u, "");
    out += t + (end === "line" ? newline : end === "space" ? " " : "");
  });
  return out;
}

export function markEdited(doc, base) {
  doc.source = { ...(doc.source || {}), edited: { by: "the user, in the web app", at_utc: new Date().toISOString(), base: base || null } };
  return doc;
}

// Ignore a printed line the analysis found outside all regions (a stain, a rule, a printer's mark), or bring its flag back.
export function ignoreLine(doc, lineId) {
  const ids = new Set(doc.source?.ignored_lines || []);
  ids.add(lineId);
  doc.source = { ...(doc.source || {}), ignored_lines: [...ids].sort((a, b) => a - b) };
}
export function restoreLine(doc, lineId) {
  const ids = (doc.source?.ignored_lines || []).filter(id => id !== lineId);
  doc.source = { ...(doc.source || {}) };
  if (ids.length) doc.source.ignored_lines = ids; else delete doc.source.ignored_lines;
}

// Add a region of `type` over a printed line found outside all regions; the line stops being uncovered at once (the
// outlines are recomputed afterwards).
export function coverLine(doc, tl, lineId, type) {
  const line = (doc.source?.uncovered_lines || []).find(value => value.line_id === lineId);
  if (!line?.box) fail("that printed line is no longer listed");
  const rid = addRegion(doc, tl, type, line.box.map(Math.round));
  doc.source = { ...doc.source, uncovered_lines: doc.source.uncovered_lines.filter(value => value !== line) };
  return rid;
}
