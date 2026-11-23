import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { readChaya } from "../js/chayapdf.js";
import { blocksContext, toBlocks, fromBlocks, structureOf, assembledStructure, countOverrides } from "../js/blocks-format.js";

const fixtures = JSON.parse(await readFile(new URL("./fixtures/blocks-pages.json", import.meta.url), "utf8"));

// Every page of `docs` (0.3 page documents, in book order) through toBlocks, a JSON round trip (as stored) and fromBlocks.
function roundTrip(docs, types, rules) {
  const context = blocksContext(docs, rules);
  const blocks = docs.map(doc => doc && toBlocks(doc, types, context));
  const stored = JSON.parse(JSON.stringify(blocks));
  const back = stored.map(doc => doc && fromBlocks(doc, types, context));
  return { blocks, stored, back };
}

function assertSame(docs, types, label, rules) {
  const { blocks, back } = roundTrip(docs, types, rules);
  docs.forEach((doc, index) => {
    if (!doc) return;
    assert.deepEqual(structureOf(back[index]), structureOf(doc), `${label} ${doc.page.id}: page structure`);
    assert.deepEqual(back[index].page, doc.page, `${label} ${doc.page.id}: regions unchanged`);
    for (const key of ["units", "flows", "relations"]) assert.ok(!(key in blocks[index]), `${label}: ${key} is not stored`);
    assert.equal(blocks[index].schema_version, "0.4");
  });
  assert.deepEqual(assembledStructure(back, types), assembledStructure(docs, types), `${label}: assembled book and warnings`);
  return blocks;
}

for (const run of fixtures.runs) test(`blocks form round-trips: ${run.description}`, () => {
  assertSame(run.pages, fixtures.types[run.book], run.book, fixtures.rules[run.book]);
});

test("hand-shaped title pages keep their containers as explicit groups; sections, verse groups and links come from the rules", () => {
  const front = fixtures.runs[0], types = fixtures.types[front.book];
  const rules = fixtures.rules[front.book];
  const blocks = assertSame(front.pages, types, "rama front", rules);
  const explicit = blocks.filter(doc => doc.overrides.groups).map(doc => doc.page.id.split("-").pop());
  // (and the run's last page, whose sections the rule cannot close without the pages after it)
  assert.deepEqual(explicit, ["003", "007", "008", "009", "021"]);
  // The run starts at the book's start, so sections (a part, episodes, the closing line's label and number) are the rule's.
  const sections = blocks.slice(4, -1).map(doc => fromBlocks(doc, types, blocksContext(front.pages, rules))).flatMap(doc => doc.units.filter(unit => unit.type === "section"));
  assert.ok(sections.length >= 10 && sections.some(unit => unit.label && unit.number));
  assert.ok(blocks.every(doc => !doc.overrides.links && !doc.overrides.order && !doc.overrides.units));
  // A verse group, in the middle of the book: round-trips (as part of its section's explicit group in this cut).
  assertSame(fixtures.runs[1].pages, types, "rama verse group", rules);
});

test("Kale's groups, numbers and labels are explicit; a continuation across the page edge is kept", () => {
  const run = fixtures.runs.find(item => item.description.includes("commentary continued"));
  const blocks = assertSame(run.pages, fixtures.types[run.book], "kale", fixtures.rules[run.book]);
  const groups = JSON.stringify(blocks.map(doc => doc.overrides.groups));
  assert.match(groups, /"type":"group"/);
  assert.match(groups, /"number":"47"/);
  assert.match(groups, /"open":\{"start":true\}/);
  assert.match(groups, /"open":\{"end":true\}/);
});

test("a note link that differs from the same-number rule is stored, and one the rule gives is not", () => {
  const run = fixtures.runs.find(item => item.description.includes("across three pages"));
  const types = fixtures.types[run.book];
  const docs = structuredClone(run.pages);
  const index = docs.findIndex(doc => (doc.relations || []).length >= 2);
  assert.ok(index >= 0);
  const doc = docs[index];
  const [first, second] = doc.relations;
  assert.equal(toBlocks(doc, types, blocksContext(docs, fixtures.rules[run.book])).overrides.links, undefined);
  // Remove all but one link and send that one to another note.
  doc.relations = [{ ...first, to: second.to }];
  const context = blocksContext(docs, fixtures.rules[run.book]);
  const blocks = toBlocks(doc, types, context);
  assert.deepEqual(structureOf(fromBlocks(JSON.parse(JSON.stringify(blocks)), types, context)), structureOf(doc));
  assert.ok(blocks.overrides.links.some(link => link.to === null), "a link the rule gives and the page lacks is removed");
  assert.ok(blocks.overrides.links.some(link => typeof link.to === "string"), "a link to another note is set");
});

test("a dimmed or missing page is a gap in the context, not a failure", () => {
  const run = fixtures.runs.find(item => item.description.includes("across three pages"));
  const docs = [run.pages[0], null, run.pages[2]];
  assertSame(docs, fixtures.types[run.book], "gap", fixtures.rules[run.book]);
});

// The finished books are large and stay on the machine they were made on: these tests skip where they are absent.
for (const [name, file] of [["Kale 1913", "kale-1913"], ["the Rāmāyaṇa-mañjarī", "ramayana-manjari"]]) {
  const path = new URL(`../../outputs/books/${file}.chaya.pdf`, import.meta.url);
  test(`every page of ${name} round-trips through the blocks form`, { skip: !existsSync(path) && "the book is not on this machine" }, async () => {
    const { data: { files } } = await readChaya(await readFile(path));
    const manifest = files["book.json"], types = files["types.json"], skipped = new Set(manifest.skipped || []);
    const docs = manifest.pages.filter(page => !skipped.has(page.id)).map(page => files[`edits/${page.id}.json`] || files[`pages/${page.id}.json`] || null);
    assert.ok(docs.filter(Boolean).length > 200);
    const blocks = assertSame(docs, types, name, manifest.rules);
    if (file === "ramayana-manjari") {
      // Sections, verse groups, note links and numbers all come from the rules; only the four hand-shaped title pages keep groups.
      const pages = blocks.filter(doc => doc.overrides.groups).map(doc => doc.page.id.split("-").pop());
      assert.deepEqual(pages, ["003", "007", "008", "009"]);
      assert.ok(blocks.every(doc => !doc.overrides.links && !doc.overrides.order && !doc.overrides.unowned));
    }
  });
}
