// The one reading path. Every place that assembles or reads a book goes through the blocks form: each page document
// is converted with toBlocks (a 0.4 page is used as it is) and derived with fromBlocks, with the book's rules, so the
// same code serves every book (webapp/js/blocks-format.js, schema/README.md "Blocks (draft 0.4)"). The conversion is
// lossless, so for a book stored as 0.3 the reading is the saved structure; for a 0.4 page it is the derivation.
//
// A reading is kept per type list: asking again with the same page documents (the same objects), rules and dimmed
// pages gives the same result, and a changed page document, rule or type list makes a new one.
import { blocksContext, toBlocks, fromBlocks } from "./blocks-format.js?v=20261123-blocks-b1";
import { readingProjection } from "./blocks.js?v=20261123-blocks-b1";
import { readingDocuments } from "./workflow.js?v=20261123-blocks-b1";
import { noteTypesOf } from "./note-links.js?v=20261123-blocks-b1";
import { regionTypePaths } from "./pipeline/provisional.js?v=20261123-blocks-b1";

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

// Page documents in page order (null for a page that is not there) → the same pages with units, flows and relations
// (0.3-shaped), derived through the blocks form. `rules` is the book's `rules` setting (none: the defaults).
export function readThroughBlocks(docs, types, rules) {
  return remember(types, "docs", { docs, rules, extra: "" }, () => {
    const context = blocksContext(docs, rules);
    return docs.map(doc => doc && fromBlocks(isBlocksPage(doc) ? doc : toBlocks(doc, types, context), types, context));
  });
}

// What Read, the Book view and the exports show: `readingProjection` where pages have no structure yet (the rules group
// them), then every page through the blocks form. { docs, types, report, noteTypes, mainTypes } (types: the book's list
// with what the rules add, which the display needs). `book` gives pages, types, rules and which pages are dimmed.
export function bookReading(pages, saved, types, skipped, rules) {
  const left = typeof skipped === "function" ? skipped : skipped ? id => skipped.has(id) : () => false;
  const dimmed = pages.filter(page => left(page.id)).map(page => page.id).join(",");
  const ordered = readingDocuments(pages, saved, skipped);
  return remember(types, "book", { docs: ordered, rules, extra: dimmed }, () => {
    const view = readingProjection(pages, saved, types, skipped, rules);
    const { noteTypes, mainTypes } = noteTypesOf(view.types);
    for (const [type, path] of regionTypePaths(view.types)) if (view.types.types[type].region && view.types.types[path[0]].flow === "main") mainTypes.add(type);
    return { ...view, docs: readThroughBlocks(view.docs, types, rules), noteTypes, mainTypes };
  });
}
