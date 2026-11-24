// The one reading path. Every place that assembles or reads a book goes through the blocks form: each page document
// is converted with toBlocks (a 0.4 page is used as it is) and derived with fromBlocks, with the book's rules, so the
// same code serves every book (webapp/js/blocks-format.js, schema/README.md "Blocks (draft 0.4)"). The conversion is
// lossless, so for a book stored as 0.3 the reading is the saved structure; for a 0.4 page it is the derivation.
//
// A reading is kept per type list: asking again with the same page documents (the same objects), rules and dimmed
// pages gives the same result, and a changed page document, rule or type list makes a new one.
import { blocksContext, toBlocks, fromBlocks } from "./blocks-format.js?v=20261123-levels-2";
import { readingDocuments } from "./workflow.js?v=20261123-levels-2";
import { noteTypesOf } from "./note-links.js?v=20261123-levels-2";
import { regionTypePaths } from "./pipeline/provisional.js?v=20261123-levels-2";

export const isBlocksPage = doc => Boolean(doc) && !doc.units;

const kept = new WeakMap();
const same = (a, b) => a.length === b.length && a.every((item, index) => item === b[index]);
const remember = (types, key, parts, make) => {
  const slot = kept.get(types) || new Map();
  kept.set(types, slot);
  const hit = slot.get(key);
  if (hit && hit.rules === parts.rules && hit.extra === parts.extra && same(hit.docs, parts.docs)) return hit.value;
  const value = make();
  slot.set(key, { ...parts, value });
  return value;
};

// Assembly warnings (assemble.js) name units by the ids the derivation gives them ("page#u3"), which mean nothing to a
// person: each becomes the unit's first block and type, "page#r5 (verse)". `docs` are the derived pages the warnings are about.
export function placeWarnings(warnings, docs) {
  const where = new Map();
  for (const doc of docs) {
    if (!doc) continue;
    const units = new Map(doc.units.map(unit => [unit.id, unit]));
    const firstBlock = (id, seen = new Set()) => {
      const unit = units.get(id);
      if (!unit || seen.has(id)) return null;
      seen.add(id);
      for (const child of unit.children) { const rid = child.region ? child.region.split("#").pop() : firstBlock(child.unit, seen); if (rid) return rid; }
      return null;
    };
    for (const unit of doc.units) {
      const rid = firstBlock(unit.id);
      if (rid) where.set(`${doc.page.id}#${unit.id}`, `${doc.page.id}#${rid} (${unit.type.replaceAll("_", " ")})`);
    }
  }
  return warnings.map(text => text.replace(/[^\s,:()[\]]+#[^\s,:()[\]]+/g, id => where.get(id) ?? id));
}

// Page documents in page order (null for a page that is not there) → the same pages with units, flows and relations
// (0.3-shaped), derived through the blocks form. `rules` is the book's `rules` setting (none: the defaults).
export function readThroughBlocks(docs, types, rules) {
  return remember(types, "docs", { docs, rules, extra: "" }, () => {
    const context = blocksContext(docs, rules);
    return Object.assign(docs.map(doc => doc && fromBlocks(isBlocksPage(doc) ? doc : toBlocks(doc, types, context), types, context)), { context });
  });
}

// What Read, the Book view and the exports show: every page through the blocks form. { docs, types, report, noteTypes,
// mainTypes } (docs has the context the derivation used as `docs.context`).
export function bookReading(pages, saved, types, skipped, rules) {
  const left = typeof skipped === "function" ? skipped : skipped ? id => skipped.has(id) : () => false;
  const dimmed = pages.filter(page => left(page.id)).map(page => page.id).join(",");
  const ordered = readingDocuments(pages, saved, skipped);
  return remember(types, "book", { docs: ordered, rules, extra: dimmed }, () => {
    const { noteTypes, mainTypes } = noteTypesOf(types);
    for (const [type, path] of regionTypePaths(types)) if (types.types[type].region && types.types[path[0]].flow === "main") mainTypes.add(type);
    return { docs: readThroughBlocks(ordered, types, rules), types, report: { numberBreaks: {} }, noteTypes, mainTypes };
  });
}
