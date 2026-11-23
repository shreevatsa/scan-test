import { test } from "node:test";
import assert from "node:assert/strict";
import { blockChecks, proposedTypeName } from "../js/blocksview.js";

const types = { flows: { main: "Main" }, types: { verse: { region: "paragraph", flow: "main" }, colophon_line: { region: "paragraph", flow: "main" } } };
const doc = region => ({ page: { id: "p1", regions: [] }, source: { omitted_regions: [region] } });
const app = (page, calls = []) => ({ tl: types, regionFlagContext: () => ({}), edit: fn => { calls.push("edit"); fn(page); return true; },
  select: value => calls.push(["select", value]), recoverOmitted: (index, type) => calls.push(["recover", index, type]), book: { writable: true },
  pageView: {}, textPanel: {}, check: () => [[], []], selection: {} });

test("a region the finder proposed a type for becomes an Add type check with Review area and Leave out", () => {
  const page = doc({ region: "r9", type: "other", box: [1, 2, 3, 4], proposed_type: "Sarga colophon" });
  const calls = [], [item] = blockChecks(app(page, calls), page, null);
  assert.equal(item.text, "An area may be a new type, “Sarga colophon”.");
  assert.equal(item.label, "Add type Sarga_colophon");
  assert.deepEqual(item.extra.map(value => value.label), ["Review area"]);
  item.extra[0].action();
  assert.deepEqual(calls, [["select", { omitted: 0 }]]);
  item.leaveOut();
  assert.deepEqual(page.source.omitted_regions, [], "Leave out moves the area to the ignored ones");
  assert.equal(page.source.ignored_regions.length, 1);
});

test("a proposed name already in the type list offers that type, and a region without a proposal keeps the plain check", () => {
  const calls = [], known = doc({ region: "r9", type: "other", box: [1, 2, 3, 4], proposed_type: "colophon line" });
  const [item] = blockChecks(app(known, calls), known, null);
  assert.equal(item.label, "Use type colophon_line");
  item.action();
  assert.deepEqual(calls, [["recover", 0, "colophon_line"]]);
  const plain = doc({ region: "r9", type: "other", box: [1, 2, 3, 4] });
  const [other] = blockChecks(app(plain), plain, null);
  assert.equal(other.text, "An area on the scan needs a type.");
  assert.equal(proposedTypeName({}), "");
});
