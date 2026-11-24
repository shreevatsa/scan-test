// The one reading path. Every place that assembles or reads a book goes through the blocks form: each page document
// is converted with toBlocks (a 0.4 page is used as it is) and derived with fromBlocks, with the book's rules, so the
// same code serves every book (webapp/js/blocks-format.js, schema/README.md "Blocks (draft 0.4)"). The conversion is
// lossless, so for a book stored as 0.3 the reading is the saved structure; for a 0.4 page it is the derivation.
//
// A reading is kept per type list: asking again with the same page documents (the same objects), rules and dimmed
// pages gives the same result, and a changed page document, rule or type list makes a new one.
import { blocksContext, toBlocks, fromBlocks } from "./blocks-format.js?v=20261124-verses-6";
import { readingDocuments } from "./workflow.js?v=20261124-verses-6";
import { noteTypesOf } from "./note-links.js?v=20261124-verses-6";
import { regionTypePaths } from "./pipeline/provisional.js?v=20261124-verses-6";

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
    return Object.assign(settleLabels(docs.map(doc => doc && fromBlocks(isBlocksPage(doc) ? doc : toBlocks(doc, types, context), types, context))), { context });
  });
}

// A printed page number read from the scan is sometimes wrong, a mark beside it read as a digit ("8137" for 137, "566"
// for 56). A page whose number breaks the run its nearest numbered neighbours (within 3 pages each side) agree on, and
// holds the number the run expects among its digits, is labelled with that number; `label_as_printed` keeps what was read.
// A page with no number (none printed, as on a chapter's first page, or none read) inside a run its neighbours agree on is
// labelled with the number the run gives it, and the page just before a run of three with the number before the run's
// (`label_from: "neighbours"`).
export function settleLabels(docs) {
  const numbers = docs.map(doc => /^\d+$/.test(String(doc?.page.label ?? "")) ? Number(doc.page.label) : null);
  const nearest = (from, step) => {
    for (let at = from + step; at >= 0 && at < docs.length && Math.abs(at - from) <= 3; at += step) if (numbers[at] !== null) return at;
    return null;
  };
  return docs.map((doc, index) => {
    const number = numbers[index], before = nearest(index, -1), after = nearest(index, 1);
    // The first page of a run printed without its number (a chapter's opening page): the number before the run's, where
    // the next three pages run on from it.
    const opens = numbers[index + 1] > 1 && numbers[index + 2] === numbers[index + 1] + 1 && numbers[index + 3] === numbers[index + 1] + 2;
    if (doc && number === null && doc.page.label == null && opens && (before === null || numbers[index + 1] - numbers[before] !== index + 1 - before))
      return { ...doc, page: { ...doc.page, label: String(numbers[index + 1] - 1), label_from: "neighbours" } };
    if (!doc || before === null || after === null || numbers[after] - numbers[before] !== after - before) return doc;
    const expected = numbers[before] + index - before;
    // A page printed without its number, or whose number was not read, inside a run its neighbours agree on.
    if (number === null) return doc.page.label == null ? { ...doc, page: { ...doc.page, label: String(expected), label_from: "neighbours" } } : doc;
    // A number its neighbours, agreeing, do not allow: misread (a stray digit, one digit for another, a digit dropped).
    // A plate or an unnumbered page between them would have broken their run.
    if (number === expected) return doc;
    return { ...doc, page: { ...doc.page, label: String(expected), label_as_printed: doc.page.label } };
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
