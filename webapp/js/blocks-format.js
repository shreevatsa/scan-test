// Page documents in the "blocks" form (schema 0.4): the regions as they are, plus `overrides` for what the rules do not
// give. toBlocks turns a 0.3 page document into it; fromBlocks derives a 0.3-shaped document (units, flows, relations).
// Both use one derivation from the regions and the book's rules (the same rule modules the reader uses), so what is
// stored is exactly the difference between the saved structure and that derivation. See schema/README.md, "Blocks (0.4)".
//
// `context` holds the cross-page information the rules need: the book's pages in order (null for a page that is not
// there; dimmed pages are left out of the list), made by blocksContext(pages). It is used for the first and last page
// (a unit is not open past the book's ends) and for the sections, whose parts and episodes are counted from the
// start of the book. It is derived once and cached on the context.
import { provisionalUnits, regionTypePaths } from "./pipeline/provisional.js?v=20261124-labels-3";
import { noteTypesOf, linkNotes } from "./note-links.js?v=20261124-labels-3";
import { sectionKeys, groupPage } from "./section-rules.js?v=20261124-labels-3";
import { groupVerses } from "./verse-group-rules.js?v=20261124-labels-3";
import { headingSections } from "./heading-rules.js?v=20261124-labels-3";
import { assemble } from "./assemble.js?v=20261124-labels-3";
import { textOf } from "./blocks.js?v=20261124-labels-3";
import { compileRules } from "./rules.js?v=20261124-labels-3";

export const BLOCKS_VERSION = "0.4";
const ATTRS = ["number", "label", "lang", "style", "open"];
const ridOf = ref => ref.split("#").pop();
const clone = value => value === undefined ? value : structuredClone(value);
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

// `rules` are the book's structure rules (book.json `rules`, rules.js); none gives the defaults.
export function blocksContext(pages, rules) {
  return { pages: [...pages], rules: compileRules(rules), derived: null };
}

// ---------------------------------------------------------------------------------------------------- derivation

// A page break where one side only is marked as going on (the last block of a page "continues later", or the first of the
// next "continues from earlier", but not both) between two blocks of one type is settled by the text: if the earlier
// block's last line ends a sentence (. । ॥ ? ! and the like) the mark is dropped, as a finder's slip; otherwise the other
// side is marked too and they join. The region finder marks each page alone, and one side is often missing or
// wrong. Between blocks of two types, a mark is dropped where the earlier block ends a sentence, and where a quotation
// stands at the break with the marked block's type on its other side (a paragraph, the verse it quotes across the
// break, and the paragraph going on after it): that stays as printed, as it does within a page (provisional.js). Where
// both sides are marked but the pieces' types differ, the later piece takes the earlier's type (source.type_settled).
// Returns Map page index → the page with its marks settled (a copy), for the pages changed.
const ENDS_SENTENCE = /[.।॥?!;:”"’)\]]\s*[0-9०-९೦-೯]*\s*[.।॥)]*\s*$/u;
function settleBreaks(pages, tl, mainTypes, noteTypes = new Set()) {
  const out = new Map();
  const page = index => out.get(index) || pages[index]?.page;
  // A page's text blocks in reading order, of the main text or of the notes (`kinds`, the flow's types): figures and
  // captions float (provisional.js) and stand at no edge.
  let kinds = mainTypes;
  const blocks = index => (page(index)?.regions || []).filter(region => kinds.has(region.type) && !["figure", "caption"].includes(tl.types[region.type]?.region) && (region.lines || []).some(line => line.text?.trim()))
    .sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity));
  const edge = (index, last) => last ? blocks(index).at(-1) : blocks(index)[0];
  // Blocks of other types (not headings) at a page's edge, then one of `type`: a quotation with the text going on past it.
  const quotation = (index, type, last) => {
    const list = last ? blocks(index).reverse() : blocks(index);
    const beyond = list.findIndex(region => region.type === type || tl.types[region.type]?.region === "heading");
    return beyond > 0 && list[beyond].type === type;
  };
  const edit = (index, rid, change) => {
    if (!out.has(index)) out.set(index, clone(pages[index].page));
    const region = out.get(index).regions.find(value => value.id === rid);
    region.source = { ...region.source, ...change };
  };
  for (let i = 0; i + 1 < pages.length; i++) for (kinds of [mainTypes, noteTypes]) {
    if (!pages[i] || !pages[i + 1] || pages[i].source?.sample?.consecutive_next === false) continue;
    const a = edge(i, true), b = edge(i + 1, false);
    if (!a || !b) continue;
    const later = Boolean(a.source?.continues_later), earlier = Boolean(b.source?.continues_from_earlier);
    // Both sides marked, the two pieces typed differently (a list item's or a verse's second piece, without its number
    // or its start, taken for a paragraph): the later piece is the earlier's type.
    if (later && earlier && a.type !== b.type && ![a, b].some(region => tl.types[region.type]?.region === "heading")) {
      if (!out.has(i + 1)) out.set(i + 1, clone(pages[i + 1].page));
      const region = out.get(i + 1).regions.find(value => value.id === b.id);
      region.source = { ...region.source, type_settled: { from: region.type, reason: `it goes on from a ${a.type.replaceAll("_", " ")} on the page before` } };
      region.type = a.type;
    }
    if (later === earlier) continue;
    const ends = ENDS_SENTENCE.test((a.lines.filter(line => line.text?.trim()).at(-1)?.text || "").trim());
    if (a.type !== b.type) {
      // Otherwise, across a plate or a block of another type, assembly looks further.
      if (ends) {
        if (later) edit(i, a.id, { continues_later: false, continuation_settled: "the text before the break ends a sentence" });
        else edit(i + 1, b.id, { continues_from_earlier: false, continuation_settled: "the text before the break ends a sentence" });
      } else if (later && quotation(i + 1, a.type, false)) edit(i, a.id, { continues_later: false, continuation_settled: "a quotation follows the break, and the text goes on after it" });
      else if (earlier && quotation(i, b.type, true)) edit(i + 1, b.id, { continues_from_earlier: false, continuation_settled: "a quotation stands before the break, after the text it goes on from" });
      continue;
    }
    if (ends) {
      if (later) edit(i, a.id, { continues_later: false, continuation_settled: "the text before the break ends a sentence" });
      else edit(i + 1, b.id, { continues_from_earlier: false, continuation_settled: "the text before the break ends a sentence" });
    } else if (later) edit(i + 1, b.id, { continues_from_earlier: true, continuation_settled: "the text before the break goes on" });
    else edit(i, a.id, { continues_later: true, continuation_settled: "the text before the break goes on" });
  }
  return out;
}

// The units, flows and note links the rules give for every page of the book, before any override: Map page id →
// { units, flows, relations }.
function derive(context, types) {
  if (context.derived?.types === types) return context.derived.byPage;
  const tl = clone(types);
  const { sections: sectionRules, verseGroups: groupRules } = context.rules;
  const groupMarkers = Boolean(tl.types[groupRules.markerType]);
  const closeSections = Boolean(tl.types.section && tl.types[sectionRules.closing]);
  if (groupMarkers && !tl.types.verse_group) tl.types.verse_group = { flow: "main", contains: ["verse", groupRules.markerType] };
  const { noteTypes, mainTypes } = noteTypesOf(tl);
  for (const [type, path] of regionTypePaths(tl)) if (tl.types[type].region && tl.types[path[0]].flow === "main") mainTypes.add(type);
  const last = context.pages.length - 1;
  // The marks of a page break where only one side says the text goes on, settled by the text (settleBreaks).
  const settled = context.rules.settleBreaks ? settleBreaks(context.pages, tl, mainTypes, noteTypes) : new Map();
  const docs = context.pages.map((doc, index) => {
    if (!doc) return null;
    const page = settled.get(index) || clone(doc.page);
    const sample = doc.source?.sample;   // pages sampled from a book that do not follow each other are not open across the gap
    const { units, flows } = provisionalUnits(page.id, page.regions, tl, { firstPage: index === 0 || sample?.consecutive_previous === false, lastPage: index === last || sample?.consecutive_next === false });
    return { page, units, flows };
  });
  const present = docs.filter(Boolean);
  if (groupMarkers) for (const doc of present) {
    if (!doc.page.regions.some(region => region.type === groupRules.markerType ||
        region.lines?.some(line => groupRules.markerWords.test(line.text || "")))) continue;
    groupVerses(doc, { counts: groupRules.counts, markerType: groupRules.markerType });
  }
  // Headings that start sections (the book's rules name them; none by default). A level whose heading type the type list
  // does not have is left out; a container type it does not have is added to the derivation's copy, in the main flow.
  const headingLevels = context.rules.headings.filter(level => tl.types[level.heading]?.region);
  for (const level of headingLevels) tl.types[level.container] ||= { flow: "main", contains: [] };
  if (headingLevels.length) headingSections(docs, headingLevels, { textOf, types: tl });
  if (closeSections) {
    const items = sectionKeys(present, { closing: sectionRules.closing, partClosing: sectionRules.partClosing, partHeading: sectionRules.partHeading,
      partAfter: sectionRules.partAfter, divisionClosing: sectionRules.divisionClosing, textOf });
    const byPage = Map.groupBy(items, item => item.pageIndex);
    tl.types.section.contains = [...new Set([...tl.types.section.contains, ...items.filter(item => item.part !== null).map(item => item.unit.type)])];
    for (const [index, here] of byPage) {
      const previous = items[items.indexOf(here[0]) - 1], next = items[items.indexOf(here.at(-1)) + 1];
      groupPage(present[index], here, previous, next, { parts: items.parts, partLabels: sectionRules.partLabels });
    }
  }
  const byPage = new Map();
  for (const doc of present) {
    linkNotes(doc, noteTypes, mainTypes);
    byPage.set(doc.page.id, { units: doc.units, flows: doc.flows, relations: doc.relations || [] });
  }
  context.derived = { types, byPage };
  return byPage;
}

// ---------------------------------------------------------------------------------------------------- structure

const attrsOf = unit => {
  const attrs = {};
  for (const [key, value] of Object.entries(unit)) if (!["id", "type", "children", "source"].includes(key) && value != null) attrs[key] = value;
  if (attrs.open) {
    const open = Object.fromEntries(["start", "end"].filter(side => attrs.open[side]).map(side => [side, true]));
    if (Object.keys(open).length) attrs.open = open; else delete attrs.open;
  }
  if (unit.source?.label) attrs.label_source = unit.source.label;
  return attrs;
};
const attrNames = (a, b) => [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(name => !same(a[name], b[name]));

// A key for every unit reachable from the flows: its type and its first block ("verse@r4"). A unit nested in one of
// the same type with the same first block (an episode opening a part) takes "#2", "#3" in order of nesting.
function uniqueKeys(units, flows) {
  const byId = new Map(units.map(unit => [unit.id, unit])), seen = new Map(), keys = new Map();
  const first = unit => { for (const child of unit.children) { const found = child.region ? ridOf(child.region) : first(byId.get(child.unit)); if (found) return found; } return null; };
  const visit = id => {
    const unit = byId.get(id), base = `${unit.type}@${first(unit)}`, n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    keys.set(id, n > 1 ? `${base}#${n}` : base);
    for (const child of unit.children) if (child.unit) visit(child.unit);
  };
  for (const ids of Object.values(flows)) ids.forEach(visit);
  return keys;
}

// A unit as a plain tree: { id, type, kids: [{ block } | node], attrs, key }. The key names the unit by its type and
// its first block ("verse@r4"), the way an override refers to a unit.
function forest(page, { units, flows }) {
  const keys = uniqueKeys(units, flows), byId = new Map(units.map(unit => [unit.id, unit]));
  const node = id => {
    const unit = byId.get(id);
    const kids = unit.children.map(child => child.region ? { block: ridOf(child.region) } : node(child.unit));
    return { id, type: unit.type, kids, attrs: attrsOf(unit), key: keys.get(id) };
  };
  return Object.entries(flows).map(([flow, ids]) => ({ flow, tops: ids.map(node) }));
}
const blocksOf = node => node.kids.flatMap(kid => kid.block ? [kid.block] : blocksOf(kid));
const shape = node => [node.type, node.kids.map(kid => kid.block ?? shape(kid))];
const keysOf = node => [node.key, ...node.kids.flatMap(kid => kid.block ? [] : keysOf(kid))];
const walk = (node, visit) => { visit(node); for (const kid of node.kids) if (!kid.block) walk(kid, visit); };

function ordinals(page) {
  const order = new Map();
  page.regions.map((region, index) => ({ region, index }))
    .sort((a, b) => (a.region.order ?? Infinity) - (b.region.order ?? Infinity) || a.index - b.index)
    .forEach(({ region }, k) => order.set(region.id, k));
  return order;
}

// An explicit group, from a tree. A plain block (a unit of its type made of that block alone, with no attributes) is
// written as its id.
function writeNode(node, types, page, { top = false, flow } = {}) {
  const blocks = blocksOf(node), plain = node.kids.length === 1 && node.kids[0].block;
  const regionType = id => page.regions.find(region => region.id === id)?.type;
  const own = Object.keys(node.attrs).length === 0 && !(top && flow !== types.types[node.type]?.flow);
  if (plain && own && regionType(plain) === node.type) return plain;
  const out = { type: node.type };
  if (top && flow !== types.types[node.type]?.flow) out.flow = flow;
  if (node.kids.every(kid => kid.block)) out.blocks = blocks;
  else out.members = node.kids.map(kid => kid.block ? { block: kid.block } : writeNode(kid, types, page));
  return Object.assign(out, node.attrs);
}

// ---------------------------------------------------------------------------------------------------- applying

function readNode(item, pid, pageRegions, types, nextId) {
  const mk = (type, kids, attrs) => {
    const { label_source, ...rest } = attrs;
    const unit = { id: nextId(), type, children: kids, ...clone(rest) };
    if (label_source) unit.source = { label: label_source };
    return unit;
  };
  const out = [];
  const unitOf = member => {
    if (typeof member === "string") {
      const region = pageRegions.get(member);
      const unit = mk(region?.type, [{ region: `${pid}#${member}` }], {});
      out.push(unit);
      return unit;
    }
    const { type, flow: _flow, blocks, members, ...attrs } = member;
    const kids = blocks ? blocks.map(block => ({ region: `${pid}#${block}` })) : (members || []).map(sub => sub.block ? { region: `${pid}#${sub.block}` } : { unit: unitOf(sub).id });
    const unit = mk(type, kids, attrs);
    out.push(unit);
    return unit;
  };
  const top = unitOf(item);
  return { top, units: out, flow: item.flow ?? types.types[top.type]?.flow };
}

// The derived structure with the overrides applied: { units, flows, relations }. `pid` qualifies region references.
function applyOverrides(base, page, overrides, types, stale = null) {
  const units = clone(base.units), flows = clone(base.flows), relations = clone(base.relations);
  const byId = new Map(units.map(unit => [unit.id, unit]));
  const blocksUnder = id => byId.get(id).children.flatMap(child => child.region ? [ridOf(child.region)] : blocksUnder(child.unit));
  const oldKey = uniqueKeys(units, flows);
  const regions = new Map(page.regions.map(region => [region.id, region]));
  const order = ordinals(page);
  const explicit = overrides.groups || [];
  let n = 0;
  const nextId = () => `g${++n}`;
  const built = explicit.map(item => readNode(item, page.id, regions, types, nextId));
  for (const { units: made } of built) for (const unit of made) byId.set(unit.id, unit);
  const claimed = new Set(overrides.unowned || []);
  for (const { units: made } of built) for (const unit of made) for (const child of unit.children) if (child.region) claimed.add(ridOf(child.region));
  const dropped = new Set();
  const drop = id => { dropped.add(id); for (const child of byId.get(id).children) if (child.unit) drop(child.unit); };
  if (claimed.size) for (const flow of Object.keys(flows)) flows[flow] = flows[flow].filter(id => {
    if (!blocksUnder(id).some(block => claimed.has(block))) return true;
    drop(id);
    return false;
  });
  const kept = units.filter(unit => !dropped.has(unit.id));
  const low = node => Math.min(...node.map(block => order.get(block) ?? Infinity));
  for (const { top, units: made, flow } of built) {
    kept.push(...made);
    const list = flows[flow] ||= [];
    const mine = low(made.flatMap(unit => unit.children.filter(child => child.region).map(child => ridOf(child.region))));
    const at = list.findIndex(id => low(blocksUnder(id)) > mine);
    list.splice(at < 0 ? list.length : at, 0, top.id);
  }
  const liveKeys = uniqueKeys(kept, flows), keys = new Map(kept.filter(unit => liveKeys.has(unit.id)).map(unit => [liveKeys.get(unit.id), unit]));
  for (const [key, change] of Object.entries(overrides.units || {})) {
    const unit = keys.get(key);
    if (!unit) { stale?.units.push(key); continue; }
    for (const [name, value] of Object.entries(change)) {
      if (name === "label_source") { if (value == null) { if (unit.source) delete unit.source.label; } else unit.source = { ...unit.source, label: value }; }
      else if (value == null) delete unit[name];
      else unit[name] = clone(value);
    }
  }
  for (const [flow, wanted] of Object.entries(overrides.order || {})) {
    for (const key of wanted) if (!liveKeys.has(key) && ![...liveKeys.values()].includes(key)) stale?.order.push([flow, key]);
    const rank = new Map(wanted.map((key, k) => [key, k]));
    const list = flows[flow] || [];
    flows[flow] = list.map((id, k) => ({ id, k, rank: rank.get(liveKeys.get(id)) ?? Infinity })).sort((a, b) => a.rank - b.rank || a.k - b.k).map(value => value.id);
  }
  // Note links: the rule's links whose notes are still there, then the overrides.
  const targetOf = key => keys.get(key)?.id;
  const fromKey = relation => relation.from.anchor ?? JSON.stringify([relation.from.region, relation.from.line, relation.from.marker]);
  const links = new Map();
  for (const relation of relations) {
    const target = targetOf(oldKey.get(relation.to.unit));
    if (target) links.set(fromKey(relation), { ...relation, to: { unit: target } });
  }
  for (const link of overrides.links || []) {
    const { to, type, ...from } = link;
    const relation = { type: type || "note", from: clone(from.from), to: { unit: targetOf(to) } };
    if (to == null) links.delete(fromKey(relation)); else if (relation.to.unit) links.set(fromKey(relation), relation); else stale?.links.push(link);
  }
  return { units: kept, flows, relations: [...links.values()] };
}

// ---------------------------------------------------------------------------------------------------- the converters

function derivedFor(doc, types, context) {
  if (!context.pages.some(page => page?.page.id === doc.page.id)) throw new Error(`page ${doc.page.id} is not in the context`);
  return derive(context, types).get(doc.page.id);
}

// A 0.4 page whose overrides no longer apply after its regions changed: the overrides that name a block that is gone (or
// is page furniture now), a unit key that no unit has, a note that is gone, are dropped. Returns { doc, dropped }, doc the
// page itself when nothing is dropped.
export function pruneOverrides(doc, types, context) {
  const overrides = doc.overrides || {};
  if (!Object.keys(overrides).length) return { doc, dropped: 0 };
  const tl = types.types, regions = new Map(doc.page.regions.map(region => [region.id, region]));
  const usable = id => regions.has(id) && tl[regions.get(id).type]?.role !== "furniture";
  const blocksIn = item => typeof item === "string" ? [item] : [...(item.blocks || []), ...(item.members || []).flatMap(member => member.block ? [member.block] : blocksIn(member))];
  const groups = (overrides.groups || []).filter(item => blocksIn(item).every(usable));
  const unowned = (overrides.unowned || []).filter(usable);
  const anchors = new Set(doc.page.regions.flatMap(region => (region.lines || []).flatMap(line => (line.spans || []).map(span => `${doc.page.id}#${span.id}`))));
  const linkOk = link => !("anchor" in link.from) || anchors.has(link.from.anchor);
  let links = (overrides.links || []).filter(linkOk);
  const kept = { ...overrides };
  for (const [name, value] of [["groups", groups], ["unowned", unowned], ["links", links]]) if (value.length) kept[name] = value; else delete kept[name];
  const stale = { units: [], order: [], links: [] }, probe = { ...doc, overrides: kept };
  applyOverrides(derivedFor(probe, types, context), probe.page, kept, types, stale);
  if (stale.units.length) { kept.units = Object.fromEntries(Object.entries(kept.units).filter(([key]) => !stale.units.includes(key))); if (!Object.keys(kept.units).length) delete kept.units; }
  if (stale.order.length) { for (const [flow, key] of stale.order) kept.order[flow] = kept.order[flow].filter(value => value !== key); kept.order = Object.fromEntries(Object.entries(kept.order).filter(([, keys]) => keys.length)); if (!Object.keys(kept.order).length) delete kept.order; }
  if (stale.links.length) { kept.links = kept.links.filter(link => !stale.links.includes(link)); if (!kept.links.length) delete kept.links; }
  const dropped = canonicalSize(overrides) - canonicalSize(kept);
  return dropped ? { doc: { ...doc, overrides: kept }, dropped } : { doc, dropped: 0 };
}
const canonicalSize = overrides => JSON.stringify(overrides).length;

// A 0.3 page document → the blocks form. `types` is the book's type list.
export function toBlocks(doc, types, context) {
  const base = derivedFor(doc, types, context), page = doc.page;
  const saved = forest(page, { units: doc.units, flows: doc.flows }), derived = forest(page, base);
  const overrides = {};
  const owner = new Map(), tops = [];
  const add = (side, flow, node, index) => { const entry = { side, flow, node, index, blocks: blocksOf(node) }; tops.push(entry); return entry; };
  for (const { flow, tops: list } of saved) list.forEach((node, index) => add("saved", flow, node, index));
  for (const { flow, tops: list } of derived) list.forEach((node, index) => add("derived", flow, node, index));
  const parent = tops.map((_, i) => i);
  const find = i => { while (parent[i] !== i) i = parent[i] = parent[parent[i]]; return i; };
  tops.forEach((entry, i) => {
    for (const block of entry.blocks) {
      if (owner.has(block)) parent[find(i)] = find(owner.get(block)); else owner.set(block, i);
    }
  });
  const groups = Map.groupBy(tops, (_, i) => find(i));
  const explicitOnes = [], unowned = [], attributes = {};
  for (const members of groups.values()) {
    const s = members.filter(entry => entry.side === "saved"), d = members.filter(entry => entry.side === "derived");
    const line = list => list.map(entry => `${entry.flow}:${JSON.stringify(shape(entry.node))}`).join("|");
    const keys = s.flatMap(entry => keysOf(entry.node));
    const equal = line(s) === line(d) && new Set(keys).size === keys.length;
    if (equal) {
      s.forEach((entry, i) => {
        const pairs = [];
        const both = (a, b) => { pairs.push([a, b]); a.kids.forEach((kid, k) => { if (!kid.block) both(kid, b.kids[k]); }); };
        both(entry.node, d[i].node);
        for (const [a, b] of pairs) for (const name of attrNames(a.attrs, b.attrs)) (attributes[a.key] ||= {})[name] = a.attrs[name] ?? null;
      });
    } else {
      for (const entry of s) explicitOnes.push(writeNode(entry.node, types, page, { top: true, flow: entry.flow }));
      const inSaved = new Set(s.flatMap(entry => entry.blocks));
      for (const entry of d) for (const block of entry.blocks) if (!inSaved.has(block)) unowned.push(block);
    }
  }
  // Explicit groups in reading order of the saved page, so a reader of the file sees them as the page runs.
  const order = ordinals(page);
  const firstOf = item => typeof item === "string" ? order.get(item) : Math.min(...collect(item).map(block => order.get(block) ?? Infinity));
  const collect = item => item.blocks || (item.members || []).flatMap(member => member.block ? [member.block] : collect(member));
  if (explicitOnes.length) overrides.groups = explicitOnes.sort((a, b) => firstOf(a) - firstOf(b));
  if (unowned.length) overrides.unowned = unowned;
  if (Object.keys(attributes).length) overrides.units = attributes;
  // The top-level order, where the position rule gives another.
  let applied = applyOverrides(base, page, overrides, types);
  const savedOrder = Object.fromEntries(saved.map(({ flow, tops: list }) => [flow, list.map(node => node.key)]));
  const nowForest = forest(page, applied);
  for (const { flow, tops: list } of nowForest) {
    const want = savedOrder[flow] || [];
    if (!same(list.map(node => node.key), want)) (overrides.order ||= {})[flow] = want;
  }
  if (overrides.order) { applied = applyOverrides(base, page, overrides, types); }
  // Note links: where the applied rule links differ from the saved ones.
  const keyOfSaved = new Map(), nowKey = new Map();
  for (const { tops: list } of saved) for (const top of list) walk(top, node => keyOfSaved.set(node.id, node.key));
  for (const { tops: list } of forest(page, applied)) for (const top of list) walk(top, node => nowKey.set(node.id, node.key));
  const fromKey = relation => relation.from.anchor ?? JSON.stringify([relation.from.region, relation.from.line, relation.from.marker]);
  const have = new Map(applied.relations.map(relation => [fromKey(relation), relation]));
  const links = [], wanted = new Set();
  for (const relation of doc.relations || []) {
    wanted.add(fromKey(relation));
    const target = keyOfSaved.get(relation.to.unit), mine = have.get(fromKey(relation));
    if (!mine || nowKey.get(mine.to.unit) !== target || mine.from.marker !== relation.from.marker || mine.type !== relation.type)
      links.push({ ...(relation.type !== "note" ? { type: relation.type } : {}), from: clone(relation.from), to: target });
  }
  for (const [key, relation] of have) if (!wanted.has(key)) links.push({ from: clone(relation.from), to: null });
  if (links.length) overrides.links = links;
  const out = { ...doc };
  delete out.units; delete out.flows; delete out.relations;
  out.schema_version = BLOCKS_VERSION;
  out.overrides = overrides;
  return out;
}
// A blocks-form page document → a 0.3-shaped page document with units, flows and relations.
export function fromBlocks(blocksDoc, types, context) {
  const base = derivedFor(blocksDoc, types, context);
  const { units, flows, relations } = applyOverrides(base, blocksDoc.page, blocksDoc.overrides || {}, types);
  const doc = { ...blocksDoc, schema_version: "0.3", units, flows };
  delete doc.overrides;
  if (relations.length) doc.relations = relations; else delete doc.relations;
  return doc;
}

// ---------------------------------------------------------------------------------------------------- comparing

// A page document's structure without generated ids, for comparing two documents of the same page:
// { flows: { name: [tree] }, relations: [[from, marker, target key]] }. A tree is { type, ...attributes, children }.
export function structureOf(doc) {
  const f = forest(doc.page, doc);
  const tree = node => ({ type: node.type, ...Object.fromEntries(Object.entries(node.attrs).sort()), children: node.kids.map(kid => kid.block ? { block: kid.block } : tree(kid)) });
  const keys = new Map();
  for (const { tops } of f) for (const top of tops) walk(top, node => keys.set(node.id, node.key));
  const fromKey = relation => relation.from.anchor ?? JSON.stringify([relation.from.region, relation.from.line, relation.from.marker]);
  return { flows: Object.fromEntries(f.filter(({ tops }) => tops.length).map(({ flow, tops }) => [flow, tops.map(tree)])),
    relations: (doc.relations || []).map(relation => [relation.type, fromKey(relation), relation.from.marker ?? null, keys.get(relation.to.unit) ?? null]).sort((a, b) => JSON.stringify(a) < JSON.stringify(b) ? -1 : 1),
  };
}

// What the overrides of one page amount to, by kind: groups (explicit units), unowned blocks, unit attributes by name,
// links added or changed and links removed, flow orders.
export function countOverrides(overrides) {
  const counts = {};
  const bump = (kind, n = 1) => { counts[kind] = (counts[kind] || 0) + n; };
  const units = item => typeof item === "string" ? 1 : 1 + (item.members || []).reduce((sum, member) => sum + (member.block ? 0 : units(member)), 0);
  for (const item of overrides.groups || []) bump("groups", units(item));
  if (overrides.unowned?.length) bump("unowned", overrides.unowned.length);
  for (const change of Object.values(overrides.units || {})) for (const name of Object.keys(change)) bump(`unit ${name}`);
  for (const link of overrides.links || []) bump(link.to == null ? "link removed" : "link set");
  for (const flow of Object.keys(overrides.order || {})) bump("flow order");
  return counts;
}

// The assembled book of a list of page documents (0.3-shaped; null for a page that is not there), without generated
// ids, for proving two sets of documents read the same: flows of trees (type, number, label, lang, style, open flags,
// regions as "page#block"), note links by marker and by the place of the note in the tree, and the assembly warnings
// with unit ids replaced by those places.
export function assembledStructure(docs, types) {
  const [book, warnings] = assemble(docs, types);
  const byId = new Map(book.units.map(unit => [unit.id, unit]));
  const place = new Map();
  const tree = (id, path) => {
    const unit = byId.get(id);
    place.set(id, path);
    const { id: _id, children, source: _source, open, ...rest } = unit;
    const attrs = attrsOf({ ...rest, open, source: unit.source });
    return { type: unit.type, ...Object.fromEntries(Object.entries(attrs).sort()),
      children: children.map((child, k) => child.region ? { region: child.region } : tree(child.unit, `${path}.${k}`)) };
  };
  const flows = Object.fromEntries(Object.entries(book.flows).filter(([, ids]) => ids.length).map(([flow, ids]) => [flow, ids.map((id, k) => tree(id, `${flow}:${k}`))]));
  const relations = book.relations.map(relation => [relation.type, relation.from.anchor ?? JSON.stringify([relation.from.region, relation.from.line, relation.from.marker]),
    relation.from.marker ?? null, place.get(relation.to.unit) ?? null]).sort((a, b) => JSON.stringify(a) < JSON.stringify(b) ? -1 : 1);
  // Warnings name page units (some since merged away): replace each by its place on its own page.
  const local = new Map();
  for (const doc of docs.filter(Boolean)) for (const { flow, tops } of forest(doc.page, doc)) {
    const visit = (node, path) => { local.set(`${doc.page.id}#${node.id}`, `${doc.page.id}@${path}`); node.kids.forEach((kid, k) => { if (!kid.block) visit(kid, `${path}.${k}`); }); };
    tops.forEach((top, k) => visit(top, `${flow}:${k}`));
  }
  const unitIds = /[A-Za-z0-9_-]+#[A-Za-z0-9_-]+/g;
  return { flows, relations, warnings: warnings.map(text => text.replace(unitIds, id => local.get(id) ?? id)) };
}
