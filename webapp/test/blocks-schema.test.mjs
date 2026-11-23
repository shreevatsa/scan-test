// 0.4 page documents (the blocks form) pass checkPage and webapp/schema.json, the same checks as schema/book.py.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { makeValidator, checkPage } from "../js/schema.js";
import { blocksContext, toBlocks } from "../js/blocks-format.js";

const schema = JSON.parse(await readFile(new URL("../schema.json", import.meta.url), "utf8"));
const same = JSON.parse(await readFile(new URL("../../schema/schema.json", import.meta.url), "utf8"));
const fixtures = JSON.parse(await readFile(new URL("./fixtures/blocks-pages.json", import.meta.url), "utf8"));
const validate = makeValidator(schema);
// The fixtures leave out the outlines to stay small: give each region a polygon, as the schema requires.
const outlined = doc => { for (const region of doc.page.regions) region.polygons ||= [[[0, 0], [1, 0], [1, 1]]]; return doc; };

test("the app's schema.json is the schema directory's", () => assert.deepEqual(schema, same));

for (const run of fixtures.runs) test(`every page of the run converted to the blocks form passes checkPage: ${run.description}`, () => {
  const types = fixtures.types[run.book], context = blocksContext(run.pages, fixtures.rules[run.book]);
  for (const doc of run.pages) {
    const blocks = outlined(JSON.parse(JSON.stringify(toBlocks(doc, types, context))));
    assert.equal(blocks.schema_version, "0.4");
    assert.deepEqual(checkPage(validate, blocks, types), [[], []], doc.page.id);
    // The 0.3 page still passes, and is not mistaken for a 0.4 one.
    assert.deepEqual(checkPage(validate, outlined(structuredClone(doc)), types)[0], [], doc.page.id);
  }
});

const run = fixtures.runs.find(item => item.description.includes("Kale 1913: verse groups"));
const types = fixtures.types[run.book];
const blocksPage = () => {
  return outlined(JSON.parse(JSON.stringify(toBlocks(run.pages[0], types, blocksContext(run.pages, fixtures.rules[run.book])))));
};
const errorsOf = doc => checkPage(validate, doc, types)[0];

test("a 0.4 page must not carry units, flows or relations, and must have its overrides", () => {
  const withUnits = blocksPage(); withUnits.units = [];
  assert.ok(errorsOf(withUnits).some(error => /unexpected property units/.test(error)), errorsOf(withUnits).join("; "));
  const without = blocksPage(); delete without.overrides;
  assert.ok(errorsOf(without).some(error => /missing overrides/.test(error)));
  const wrong = blocksPage(); wrong.schema_version = "0.5";
  assert.ok(errorsOf(wrong).length);
});

test("overrides name blocks, types, flows and anchors that exist", () => {
  const ids = blocksPage().page.regions.map(region => region.id);
  const cases = [
    [{ groups: ["nope"] }, /unknown block nope/],
    [{ unowned: ["nope"] }, /unknown block nope/],
    [{ groups: [{ type: "nonsense", blocks: [ids[0]] }] }, /unknown or furniture type nonsense/],
    [{ groups: [ids[0], { type: types.types[Object.keys(types.types).find(name => types.types[name].region)] && Object.keys(types.types).find(name => types.types[name].region), blocks: [ids[0]] }] }, /is also in/],
    [{ groups: [{ type: "group" }] }, /has no blocks or members/],
    [{ order: { nowhere: [] } }, /flow nowhere is not in the type list/],
    [{ links: [{ from: { anchor: "x#y" }, to: null }] }, /unknown anchor x#y/],
    [{ extra: 1 }, /unexpected property extra/],
  ];
  for (const [overrides, expected] of cases) {
    const doc = blocksPage(); doc.overrides = overrides;
    assert.ok(errorsOf(doc).some(error => expected.test(error)), `${JSON.stringify(overrides)}: ${errorsOf(doc).join("; ")}`);
  }
});

test("a furniture block cannot be put in a group, and a valid explicit group passes", () => {
  const doc = blocksPage();
  const furniture = doc.page.regions.find(region => types.types[region.type]?.role === "furniture");
  const text = doc.page.regions.find(region => types.types[region.type]?.region === "verse") || doc.page.regions.find(region => types.types[region.type] && types.types[region.type].role !== "furniture");
  if (furniture) { doc.overrides = { unowned: [furniture.id] }; assert.ok(errorsOf(doc).some(error => /is furniture/.test(error))); }
  doc.overrides = { groups: [{ type: text.type, blocks: [text.id], number: "9", open: { end: true } }], units: { [`${text.type}@${text.id}`]: { number: null } } };
  assert.deepEqual(errorsOf(doc), []);
});
