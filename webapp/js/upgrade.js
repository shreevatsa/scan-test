// Converting a book's page documents from 0.3 (units, flows, relations) to 0.4, the blocks form (schema/README.md,
// "Blocks (draft 0.4)"): regions plus overrides. This is the only place where the app reads a 0.3 page document other
// than reading.js, which derives the structure of whatever pages a book still has.
//
// The conversion is lossless (blocks-format.js: the book's reading is the same before and after). Before a page is
// converted its 0.3 structure, everything but the regions, is kept so that it can always be recovered: a record
// { page, model?, edit? } where model and edit are { units, flows, relations, layers_units } of the page's model
// document (pages/) and of the person's saved one (edits/). The app writes it to work/pre-0.4/<page id>.json.
import { blocksContext, toBlocks } from "./blocks-format.js?v=20261124-vision-8";
import { readingDocuments } from "./workflow.js?v=20261124-vision-8";

export const isOldPage = doc => Boolean(doc) && Array.isArray(doc.units);

const structureOf = doc => {
  const out = { units: doc.units, flows: doc.flows };
  if (doc.relations) out.relations = doc.relations;
  if (doc.source?.layers?.units) out.layers_units = doc.source.layers.units;
  return structuredClone(out);
};

// A 0.3 page document as a 0.4 one (a copy): `toBlocks`, without the units layer's record.
function blocksPage(doc, types, context) {
  const out = toBlocks(doc, types, context);
  if (out.source?.layers?.units) {
    out.source = { ...out.source, layers: { ...out.source.layers } };
    delete out.source.layers.units;
  }
  return out;
}

// models and edits: Map page id → document (0.3 or 0.4). Resolves to what changed: { models, edits, records }, Maps of the
// converted documents and of the records to keep, for the pages that were in the old form. `progress(done, total)` is
// told as pages are done, and the browser gets to show it every few pages. `failed` lists the pages left as they were, with why.
export async function upgradePages({ pages, models, edits, types, rules, skipped = null, progress = () => {} }) {
  const out = { models: new Map(), edits: new Map(), records: new Map(), failed: [] };
  const old = pages.filter(page => isOldPage(edits.get(page.id)) || isOldPage(models.get(page.id)));
  if (!old.length) return out;
  const current = pages.map(page => edits.get(page.id) || models.get(page.id)).filter(Boolean);
  const context = blocksContext(readingDocuments(pages, current, skipped), rules);
  const inContext = id => context.pages.some(doc => doc?.page.id === id);
  const regionsOf = doc => JSON.stringify(doc.page.regions);
  let done = 0;
  for (const page of old) {
    const edit = edits.get(page.id), model = models.get(page.id), record = { page: page.id };
    const read = edit || model;
    // A page left out of the reading (dimmed) is converted on its own; a model document that another one shadows is
    // converted in the reading's context if its regions are the same, else on its own too.
    const alone = doc => blocksContext([doc], rules);
    const convert = (doc, isReading) => {
      const fits = inContext(doc.page.id) && (isReading || regionsOf(doc) === regionsOf(read));
      return blocksPage(doc, types, fits ? context : alone(doc));
    };
    // A page that cannot be converted (its structure does not fit the type list) stays as it is, readable as before.
    try {
      const converted = {};
      if (isOldPage(model)) { record.model = structureOf(model); converted.model = convert(model, !edit); }
      if (isOldPage(edit)) { record.edit = structureOf(edit); converted.edit = convert(edit, true); }
      if (converted.model) out.models.set(page.id, converted.model);
      if (converted.edit) out.edits.set(page.id, converted.edit);
      out.records.set(page.id, record);
    } catch (error) { out.failed.push({ page: page.id, message: error.message }); }
    progress(++done, old.length);
    if (done % 20 === 0) await new Promise(resolve => setTimeout(resolve, 0));
  }
  return out;
}
