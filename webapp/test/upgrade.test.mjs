import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { readChaya } from "../js/chayapdf.js";
import { assembledStructure } from "../js/blocks-format.js";
import { bookReading } from "../js/reading.js";
import { upgradePages, isOldPage } from "../js/upgrade.js";

const fixtures = JSON.parse(await readFile(new URL("./fixtures/blocks-pages.json", import.meta.url), "utf8"));

// Convert a book's documents and prove its reading is the same: units, flows, relations and warnings, by place.
async function proveUpgrade({ pages, models, edits, types, rules, skipped }, label) {
  const readingOf = (m, e) => {
    const saved = pages.map(page => e.get(page.id) || m.get(page.id)).filter(Boolean);
    const view = bookReading(pages, saved, types, skipped, rules);
    return { view, structure: assembledStructure(view.docs, types) };
  };
  const before = readingOf(models, edits);
  const done = await upgradePages({ pages, models, edits, types, rules, skipped });
  assert.deepEqual(done.failed, [], `${label}: every page converts`);
  const newModels = new Map([...models, ...done.models]), newEdits = new Map([...edits, ...done.edits]);
  const after = readingOf(newModels, newEdits);
  assert.deepEqual(after.structure, before.structure, `${label}: the reading is the same`);
  for (const doc of [...newModels.values(), ...newEdits.values()]) {
    assert.ok(!isOldPage(doc) && doc.overrides && !doc.flows && !doc.relations, `${label}: ${doc.page.id} is a 0.4 page`);
    assert.equal(doc.schema_version, "0.4");
    assert.ok(!doc.source?.layers?.units, `${label}: the units layer's record is gone`);
  }
  for (const [pid, record] of done.records) {
    const was = edits.get(pid) || models.get(pid);
    assert.deepEqual(record.edit ?? record.model, { units: was.units, flows: was.flows, ...(was.relations ? { relations: was.relations } : {}),
      ...(was.source?.layers?.units ? { layers_units: was.source.layers.units } : {}) }, `${label}: ${pid} keeps its 0.3 structure`);
  }
  return { done, newModels, newEdits };
}

for (const run of fixtures.runs) test(`conversion keeps the reading and the old structure: ${run.description}`, async () => {
  const pages = run.pages.map(doc => ({ id: doc.page.id })), models = new Map(run.pages.map(doc => [doc.page.id, structuredClone(doc)]));
  const { done } = await proveUpgrade({ pages, models, edits: new Map(), types: fixtures.types[run.book], rules: fixtures.rules[run.book], skipped: null }, run.book);
  assert.equal(done.records.size, run.pages.length);
});

test("a page edited by a person converts with its model page; a converted page is left alone; dimmed pages convert on their own", async () => {
  const run = fixtures.runs[2], types = fixtures.types[run.book], rules = fixtures.rules[run.book];
  const pages = run.pages.map(doc => ({ id: doc.page.id })), models = new Map(run.pages.map(doc => [doc.page.id, structuredClone(doc)]));
  const edits = new Map([[pages[1].id, structuredClone(run.pages[1])]]);
  const { done, newModels, newEdits } = await proveUpgrade({ pages, models, edits, types, rules, skipped: new Set([pages[0].id]) }, "mixed");
  assert.deepEqual(Object.keys(done.records.get(pages[1].id)).sort(), ["edit", "model", "page"]);
  const again = await upgradePages({ pages, models: newModels, edits: newEdits, types, rules });
  assert.equal(again.records.size, 0, "nothing left to convert");
});

test("a page whose structure does not fit the type list stays as it was and is reported", async () => {
  const run = fixtures.runs[0], types = structuredClone(fixtures.types[run.book]);
  const pages = run.pages.map(doc => ({ id: doc.page.id })), models = new Map(run.pages.map(doc => [doc.page.id, structuredClone(doc)]));
  delete types.flows;
  const done = await upgradePages({ pages, models, edits: new Map(), types, rules: fixtures.rules[run.book] });
  assert.equal(done.failed.length, run.pages.length);
  assert.equal(done.models.size, 0);
});

// The finished books are large and stay on the machine they were made on: these tests skip where they are absent.
for (const [name, file] of [["Kale 1913", "kale-1913"], ["the Rāmāyaṇa-mañjarī", "ramayana-manjari"]]) {
  const path = new URL(`../../outputs/books/${file}.chaya.pdf`, import.meta.url);
  test(`${name}: conversion keeps the reading`, { skip: !existsSync(path) && "the book is not on this machine" }, async () => {
    const { data: { files } } = await readChaya(await readFile(path));
    const manifest = files["book.json"], types = files["types.json"];
    const pages = manifest.pages.filter(page => files[`pages/${page.id}.json`]);
    const models = new Map(pages.map(page => [page.id, structuredClone(files[`pages/${page.id}.json`])]));
    const edits = new Map(pages.filter(page => files[`edits/${page.id}.json`]).map(page => [page.id, structuredClone(files[`edits/${page.id}.json`])]));
    const started = Date.now();
    const { done } = await proveUpgrade({ pages, models, edits, types, rules: manifest.rules, skipped: new Set(manifest.skipped || []) }, name);
    console.log(`${name}: ${done.records.size} pages converted, ${(Date.now() - started) / 1000} s with both readings`);
    assert.ok(done.records.size > 200);
  });
}
