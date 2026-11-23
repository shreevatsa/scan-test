import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { readChaya } from "../js/chayapdf.js";
import { assembledStructure, blocksContext, toBlocks } from "../js/blocks-format.js";
import { bookReading, placeWarnings, readThroughBlocks } from "../js/reading.js";
import { readingDocuments } from "../js/workflow.js";
import { bookRules, compileRules, ruleProblems, DEFAULT_RULES } from "../js/rules.js";

const fixtures = JSON.parse(await readFile(new URL("./fixtures/blocks-pages.json", import.meta.url), "utf8"));

// The old path: the saved page documents as they are. The new one: each through the blocks form (readThroughBlocks).
function assertSameReading(docs, types, rules, label) {
  const through = readThroughBlocks(docs, types, rules);
  assert.deepEqual(assembledStructure(through, types), assembledStructure(docs, types), `${label}: units, flows, relations and warnings`);
  assert.deepEqual(through.map(doc => doc && doc.page), docs.map(doc => doc && doc.page), `${label}: regions`);
  return through;
}

for (const run of fixtures.runs) test(`the blocks reading equals the saved reading: ${run.description}`, () => {
  assertSameReading(run.pages, fixtures.types[run.book], fixtures.rules[run.book], run.book);
});

test("a page already in the blocks form is used as it is, and a dimmed or missing page is a gap", () => {
  const run = fixtures.runs[2], types = fixtures.types[run.book], rules = fixtures.rules[run.book];
  const context = blocksContext(run.pages, rules);
  const mixed = [toBlocks(run.pages[0], types, context), run.pages[1], run.pages[2]];
  assert.equal(mixed[0].schema_version, "0.4");
  assert.deepEqual(assembledStructure(readThroughBlocks(mixed, types, rules), types), assembledStructure(run.pages, types));
  assertSameReading([run.pages[0], null, run.pages[2]], types, rules, "gap");
});

test("bookReading keeps one reading while the pages, rules and dimmed pages are the same, and a changed page makes a new one", () => {
  const run = fixtures.runs[2], types = structuredClone(fixtures.types[run.book]), rules = fixtures.rules[run.book];
  const pages = run.pages.map(doc => doc.page);
  const first = bookReading(pages, run.pages, types, null, rules);
  assert.equal(bookReading(pages, run.pages, types, null, rules), first);
  const edited = [structuredClone(run.pages[0]), ...run.pages.slice(1)];
  assert.notEqual(bookReading(pages, edited, types, null, rules), first);
  assert.notEqual(bookReading(pages, run.pages, types, new Set([pages[1].id]), rules), first);
  assert.notEqual(bookReading(pages, run.pages, types, null, { ...rules }), first);
});

test("rules: no settings give the defaults, a partial setting keeps the rest, and bad patterns are named", () => {
  const rules = bookRules(undefined);
  assert.deepEqual(rules.sections, { ...DEFAULT_RULES.sections, partLabels: [] });
  assert.equal(rules.verseGroups.counts["तिलकम्"], 3);
  const partial = bookRules({ sections: { partHeading: "काण्ड" } });
  assert.equal(partial.sections.partHeading, "काण्ड");
  assert.equal(partial.sections.partClosing, "कथासारे");
  assert.ok(compileRules({ sections: { partHeading: "काण्ड" } }).sections.partHeading.test("बालकाण्डम्"));
  assert.deepEqual(ruleProblems({}), []);
  assert.match(ruleProblems({ sections: { partHeading: "(" } })[0], /partHeading/);
  assert.match(ruleProblems({ verseGroups: { counts: { "x": 0 } } })[0], /count/);
  // A half-typed pattern does not break reading.
  assert.equal(compileRules({ sections: { divisionClosing: "(" } }).sections.divisionClosing, null);
});

test("a rule changes the reading of a page stored in the blocks form (a 0.3 page keeps its saved structure whatever the rules)", () => {
  const run = fixtures.runs[0], types = fixtures.types[run.book], rules = fixtures.rules[run.book];
  const context = blocksContext(run.pages, rules);
  const stored = run.pages.map(doc => toBlocks(doc, types, context));
  const withRules = assembledStructure(readThroughBlocks(stored, types, rules), types);
  assert.deepEqual(withRules, assembledStructure(run.pages, types));
  const without = assembledStructure(readThroughBlocks(stored, types, undefined), types);
  assert.notDeepEqual(withRules.flows, without.flows);
  assert.deepEqual(assembledStructure(readThroughBlocks(run.pages, types, undefined), types), assembledStructure(run.pages, types));
});

// The finished books are large and stay on the machine they were made on: these tests skip where they are absent.
for (const [name, file] of [["Kale 1913", "kale-1913"], ["the Rāmāyaṇa-mañjarī", "ramayana-manjari"]]) {
  const path = new URL(`../../outputs/books/${file}.chaya.pdf`, import.meta.url);
  test(`${name}: the blocks reading equals the saved reading`, { skip: !existsSync(path) && "the book is not on this machine" }, async () => {
    const { data: { files } } = await readChaya(await readFile(path));
    const manifest = files["book.json"], types = files["types.json"];
    const pages = manifest.pages.filter(page => files[`pages/${page.id}.json`]);
    const saved = pages.map(page => files[`edits/${page.id}.json`] || files[`pages/${page.id}.json`]);
    const docs = readingDocuments(manifest.pages, saved, new Set(manifest.skipped || []));
    assert.ok(docs.filter(Boolean).length > 200);
    if (file === "ramayana-manjari") assert.equal(manifest.rules.sections.partHeading, "काण्ड", "the book carries its rules");
    const through = assertSameReading(docs, types, manifest.rules, name);
    const view = bookReading(manifest.pages, saved, types, new Set(manifest.skipped || []), manifest.rules);
    assert.deepEqual(assembledStructure(view.docs, view.types), assembledStructure(docs, types), `${name}: the Book view's reading`);
    assert.equal(through.length, docs.length);
  });
}

test("assembly warnings name a unit by its first block and type, not by its derived id", () => {
  const docs = [{ page: { id: "p1" }, units: [{ id: "u1", type: "verse", children: [{ region: "p1#r3" }] }, { id: "g2", type: "verse_group", children: [{ unit: "u1" }] }] },
    null, { page: { id: "p3" }, units: [{ id: "g1", type: "section", children: [] }] }];
  assert.deepEqual(placeWarnings(["p1#g2 + p1#u1: inner open ends do not match (p1#u1, None)", "page p3, flow main: open ends do not match (p3#g1, [p9#u1])"], docs),
    ["p1#r3 (verse group) + p1#r3 (verse): inner open ends do not match (p1#r3 (verse), None)", "page p3, flow main: open ends do not match (p3#g1, [p9#u1])"]);
});
