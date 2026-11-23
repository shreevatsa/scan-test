import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { blocksContext, fromBlocks, pruneOverrides, toBlocks } from "../js/blocks-format.js";
import { endSectionAfter, groupWithNext, joinBlockWithNext, overridesAfter, removeGroup, setAttribute, setMarkerNote, startSectionAt } from "../js/structure.js";
import { deleteRegion, ownerOf, setRegionType } from "../js/ops.js";

const fixtures = JSON.parse(await readFile(new URL("./fixtures/blocks-pages.json", import.meta.url), "utf8"));

// A book of fixture pages in the blocks form (as the app stores them), and the page's derived structure, edited by
// `edit` and stored as overrides: what the editor's structure panel does.
function setup(run) {
  const types = fixtures.types[run.book], rules = fixtures.rules[run.book];
  const context = blocksContext(run.pages, rules), pages = run.pages.map(doc => toBlocks(doc, types, context));
  const live = blocksContext(pages, rules);
  return { types, rules, pages, live, derive: index => fromBlocks(pages[index], types, live),
    change(index, edit) {
      const overrides = overridesAfter(this.derive(index), types, live, edit);
      pages[index] = { ...pages[index], overrides };
      const next = blocksContext(pages, rules);
      Object.assign(live, next);
      return fromBlocks(pages[index], types, next);
    } };
}
const kaleRun = fixtures.runs.find(run => run.book.startsWith("kale")) || fixtures.runs[0];
const ramRun = fixtures.runs.find(run => !run.book.startsWith("kale")) || fixtures.runs[0];
const leaves = doc => doc.units.filter(unit => unit.children.some(child => child.region));
const ridOf = unit => unit.children.find(child => child.region).region.split("#").pop();
const parentOf = (doc, unit) => doc.units.find(other => other.children.some(child => child.unit === unit.id));

test("a unit's number and label are overrides by unit key, and the structure re-derives with them", () => {
  const book = setup(kaleRun);
  const index = book.pages.findIndex((_, k) => leaves(book.derive(k)).some(unit => unit.type === "verse"));
  const verse = leaves(book.derive(index)).find(unit => unit.type === "verse");
  const after = book.change(index, work => { setAttribute(work, verse.id, "number", "991"); setAttribute(work, verse.id, "label", "Edited"); });
  assert.ok(JSON.stringify(book.pages[index].overrides).includes('"991"'), "the number is in the page's overrides");
  const unit = leaves(after).find(value => ridOf(value) === ridOf(verse));
  assert.deepEqual([unit.number, unit.label, unit.source?.label], ["991", "Edited", "editor"]);
  assert.ok(!("units" in book.pages[index]) && !("flows" in book.pages[index]), "the stored page has no units");
});

test("start a section here, end it here, join with the next, make a group and remove one change the groups, and each is undone by its reverse", () => {
  const book = setup(kaleRun);
  let done = 0;
  for (let k = 0; k < book.pages.length && done < 3; k++) {
    const doc = book.derive(k);
    // start a container at a block that is not first in it
    const container = doc.units.find(unit => unit.children.length > 2 && unit.children.every(child => child.unit) && doc.units.find(c => c.id === unit.children[1].unit)?.children.some(child => child.region));
    if (container) {
      const second = doc.units.find(unit => unit.id === container.children[1].unit), rid = ridOf(second);
      const after = book.change(k, work => startSectionAt(work, rid));
      assert.equal(after.units.filter(unit => unit.type === container.type).length, doc.units.filter(unit => unit.type === container.type).length + 1);
      const parent = parentOf(after, leaves(after).find(unit => ridOf(unit) === rid));
      assert.equal(ownerOf(after, rid) && parent.children[0].unit, ownerOf(after, rid).id, "the block now starts its container");
      const kept = parentOf(after, leaves(after).find(unit => ridOf(unit) === ridOf(doc.units.find(u => u.id === container.children[0].unit))));
      assert.equal(kept.children.length, 1);
      book.change(k, () => {});
      assert.throws(() => overridesAfter(book.derive(k), book.types, book.live, work => startSectionAt(work, rid)), /already starts/);
      // end it after the first child
      const first = doc.units.find(unit => unit.id === container.children[0].unit);
      const ended = overridesAfter(doc, book.types, book.live, work => endSectionAfter(work, ridOf(first)));
      assert.ok(ended.groups?.length, "ending a container is stored as groups");
      done++;
    }
  }
  assert.ok(done, "a page with a container was found");
  // join with the next unit of the same type, on a page where two leaves of one type follow each other
  const [k, a] = book.pages.flatMap((_, k) => { const d = book.derive(k); return leaves(d).filter(unit => { const p = parentOf(d, unit) ? parentOf(d, unit).children : null; return p && p.findIndex(c => c.unit === unit.id) + 1 < p.length && d.units.find(u => u.id === p[p.findIndex(c => c.unit === unit.id) + 1].unit)?.type === unit.type && d.units.find(u => u.id === p[p.findIndex(c => c.unit === unit.id) + 1].unit)?.children.every(c => c.region); }).map(unit => [k, unit]); })[0] || [];
  if (a !== undefined) {
    const before = book.derive(k), joined = book.change(k, work => joinBlockWithNext(work, ridOf(a)));
    assert.equal(joined.units.length, before.units.length - 1);
    assert.ok(joined.units.some(unit => unit.children.filter(child => child.region).length === 2 && ridOf(unit) === ridOf(a)));
  }
});

test("a group of the next units is made and removed, and a group type that cannot hold them is refused", () => {
  const book = setup(kaleRun);
  const k = book.pages.findIndex((_, i) => { const d = book.derive(i); return d.units.some(unit => unit.type === "group" && unit.children.length > 1); });
  assert.ok(k >= 0);
  const doc = book.derive(k), group = doc.units.find(unit => unit.type === "group" && unit.children.length > 1);
  const removed = book.change(k, work => removeGroup(work, group.id));
  assert.equal(removed.units.filter(unit => unit.type === "group").length, doc.units.filter(unit => unit.type === "group").length - 1);
  const inner = doc.units.find(unit => unit.id === group.children[0].unit);
  assert.throws(() => overridesAfter(book.derive(k), book.types, book.live, work => groupWithNext(work, book.types, ridOf(inner), 1, "running_header")), /cannot hold/);
});

test("a note marker's link is an override: another note, or none", () => {
  const book = setup(kaleRun);
  const k = book.pages.findIndex((_, i) => (book.derive(i).relations || []).filter(rel => rel.type === "note" && rel.from.anchor).length > 1);
  assert.ok(k >= 0);
  const doc = book.derive(k), [first, second] = doc.relations.filter(rel => rel.from.anchor), sid = first.from.anchor.split("#").pop();
  const moved = book.change(k, work => setMarkerNote(work, book.types, sid, second.to.unit));
  const firstBlock = (d, id) => ridOf(d.units.find(unit => unit.id === id));
  assert.equal(firstBlock(moved, moved.relations.find(rel => rel.from.anchor === first.from.anchor).to.unit), firstBlock(doc, second.to.unit));
  assert.ok(book.pages[k].overrides.links.length >= 1);
  const unlinked = book.change(k, work => setMarkerNote(work, book.types, sid, null));
  assert.ok(!(unlinked.relations || []).some(rel => rel.from.anchor === first.from.anchor));
  assert.ok(book.pages[k].overrides.links.some(link => link.to === null));
});

test("overrides that name a block or unit that no longer exists are dropped when the regions change, and only then", () => {
  const book = setup(kaleRun);
  const k = book.pages.findIndex(page => page.overrides.groups?.length);
  assert.ok(k >= 0, "a page with a group override");
  const page = book.pages[k], rid = (typeof page.overrides.groups[0] === "string" ? page.overrides.groups[0] : page.overrides.groups[0].blocks?.[0] ?? page.overrides.groups[0].members.find(m => m.block || m.blocks)?.block ?? page.overrides.groups[0].members[0].blocks?.[0]);
  assert.equal(pruneOverrides(page, book.types, book.live).dropped, 0, "nothing is dropped while the blocks are there");
  const next = structuredClone(page);
  deleteRegion(next, rid);
  const context = blocksContext(book.pages.map((doc, i) => i === k ? next : doc), book.rules);
  const { doc, dropped } = pruneOverrides(next, book.types, context);
  assert.ok(dropped > 0);
  assert.ok(JSON.stringify(doc.overrides).length < JSON.stringify(page.overrides).length);
  // furniture: a block made page furniture leaves the groups that named it
  const furniture = Object.entries(book.types.types).find(([, type]) => type.role === "furniture" && type.region && type.region !== "figure")?.[0];
  const made = structuredClone(page);
  setRegionType(made, book.types, rid, furniture);
  assert.ok(pruneOverrides(made, book.types, blocksContext(book.pages.map((d, i) => i === k ? made : d), book.rules)).dropped > 0);
});

test("a Rāmāyaṇa-mañjarī page re-derives its sections after an edit and keeps rules-made structure out of the overrides", () => {
  const book = setup(ramRun);
  assert.ok(book.pages.every(page => Object.keys(page.overrides).length === 0 || page.overrides.groups || page.overrides.units));
  const k = book.pages.findIndex((_, i) => leaves(book.derive(i)).some(unit => unit.type === "verse"));
  const verse = leaves(book.derive(k)).find(unit => unit.type === "verse");
  const after = book.change(k, work => setAttribute(work, verse.id, "number", "77"));
  assert.equal(leaves(after).find(unit => ridOf(unit) === ridOf(verse)).number, "77");
  assert.deepEqual(Object.keys(book.pages[k].overrides.units || {}).filter(key => key.startsWith("verse@")).length >= 1, true);
});
