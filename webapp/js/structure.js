// What a person changes about a page's structure, as overrides (schema/README.md, "Blocks (draft 0.4)"). Each change is
// made on a copy of the page's derived structure (units, flows and relations, as blocks-format.js derives them from the
// regions, the book's rules and the page's overrides) with the small editing functions below, and the overrides that give
// the changed structure are what is stored: toBlocks keeps exactly the difference from the derivation. So the structure
// always re-derives from the regions, and a change to a region moves it along.
import { toBlocks } from "./blocks-format.js?v=20261124-floats-2";
import { EditError, joinWithNext, linkMarker, noteTargets, ownerOf, placeOf, setOpen, setUnitField, splitUnit, unitById, unwrapUnit } from "./ops.js?v=20261124-floats-2";

export { noteTargets };
const fail = message => { throw new EditError(message); };

// The overrides that give the structure `edit` makes of `derived` (the page's derived 0.3-shaped document), for the page
// of `context` (reading.js: the book's reading with this page as it is now).
export function overridesAfter(derived, types, context, edit) {
  const work = structuredClone(derived);
  edit(work);
  return toBlocks(work, types, context).overrides;
}

// The units that hold a block, from its own unit out to the top: [leaf, container, container…].
export function unitsAround(doc, rid) {
  const out = [], leaf = ownerOf(doc, rid);
  for (let unit = leaf, seen = new Set(); unit && !seen.has(unit.id); unit = placeOf(doc, unit.id)?.parent) { seen.add(unit.id); out.push(unit); }
  return out;
}

export const unitLabel = unit => [unit.type.replaceAll("_", " "), unit.number, unit.label ? `“${unit.label}”` : null].filter(Boolean).join(" ");

// A unit's number, label or language; a label a person types is the editor's own, shown in parentheses.
export function setAttribute(doc, uid, name, value) {
  setUnitField(doc, uid, name, value);
  const unit = unitById(doc, uid);
  if (name === "label") { if (unit.label) unit.source = { ...unit.source, label: "editor" }; else if (unit.source) { delete unit.source.label; if (!Object.keys(unit.source).length) delete unit.source; } }
}

// A unit that goes on from an earlier page or onto a later one.
export const setOpenEnd = (doc, uid, end, value) => setOpen(doc, uid, end, value);

// A section (or any container) starts at this block: its container is cut before the block's unit, the rest going to a
// new container of the same type.
export function startSectionAt(doc, rid) {
  const [leaf, container] = unitsAround(doc, rid);
  if (!container) fail("This block is not inside a section or group to cut.");
  const at = container.children.findIndex(child => child.unit === leaf.id || child.region === `${doc.page.id}#${rid}`);
  if (at <= 0) fail("This block already starts its section.");
  return splitUnit(doc, container.id, at);
}

// A container ends after this block: the later blocks go to a new container of the same type.
export function endSectionAfter(doc, rid) {
  const [leaf, container] = unitsAround(doc, rid);
  if (!container) fail("This block is not inside a section or group to cut.");
  const at = container.children.findIndex(child => child.unit === leaf.id || child.region === `${doc.page.id}#${rid}`);
  if (at < 0 || at + 1 >= container.children.length) fail("This block already ends its section.");
  return splitUnit(doc, container.id, at + 1);
}

// The unit of a block joined with the unit after it (a verse printed in two pieces, a paragraph split by a figure).
export function joinBlockWithNext(doc, rid) {
  const leaf = ownerOf(doc, rid) || fail("This block is not part of the text.");
  return joinWithNext(doc, leaf.id);
}

// A group made of a block's unit and the `count` units after it, of the type `type`.
export function groupWithNext(doc, types, rid, count, type) {
  const leaf = ownerOf(doc, rid) || fail("This block is not part of the text.");
  if (!(types.types[type]?.contains || []).includes(leaf.type)) fail(`A ${type.replaceAll("_", " ")} cannot hold a ${leaf.type.replaceAll("_", " ")}.`);
  const place = placeOf(doc, leaf.id) || fail("This block is not in a reading flow.");
  const members = place.list.slice(place.index, place.index + 1 + count);
  if (members.length < 1 + count) fail("There are not that many units after this one on the page.");
  const ids = members.map(item => typeof item === "string" ? item : item.unit);
  if (ids.some(id => !id) || ids.some(id => !(types.types[type].contains || []).includes(unitById(doc, id).type))) fail(`Those units cannot all go in one ${type.replaceAll("_", " ")}.`);
  let n = 0;
  for (const unit of doc.units) { const m = /^u(\d+)$/.exec(unit.id); if (m) n = Math.max(n, +m[1]); }
  const group = { id: `u${n + 1}`, type, children: ids.map(unit => ({ unit })) };
  doc.units.push(group);
  place.list.splice(place.index, ids.length, place.flow ? group.id : { unit: group.id });
  return group.id;
}

// Take a container away, its contents staying where it was.
export function removeGroup(doc, uid) { return unwrapUnit(doc, uid); }

// A note marker's note (null: none), the same-number rule overridden.
export function setMarkerNote(doc, types, sid, uid) { return linkMarker(doc, types, sid, uid); }
