import { test } from "node:test";
import assert from "node:assert/strict";
import { typeExampleIndex } from "../js/type-examples.js";

test("type examples preserve figure crops, group nested containers and prefer different pages", () => {
  const types = { types: { section: { contains: ["section", "paragraph", "illustration"] }, paragraph: { region: "paragraph" }, illustration: { region: "figure" }, unused: { region: "heading" } } };
  const first = { page: { id: "p1", width: 100, height: 200, regions: [
    { id: "r1", type: "paragraph", polygons: [[[10, 10], [90, 10], [90, 30], [10, 30]]] },
    { id: "r2", type: "paragraph", box: [10, 40, 90, 60] },
    { id: "r3", type: "illustration", box: [10, 70, 90, 150], polygons: [[[20, 80], [25, 80], [25, 85]]] },
  ] }, units: [
    { id: "u1", type: "section", children: [{ unit: "u2" }, { region: "p1#r2" }, { region: "p2#r1" }] },
    { id: "u2", type: "section", children: [{ region: "p1#r1" }, { region: "p1#r3" }] },
  ], source: { layers: { units: { state: "provisional" } } } };
  const second = { page: { id: "p2", width: 100, height: 200, regions: [{ id: "r1", type: "paragraph", box: [5, 20, 95, 50] }] }, units: [] };
  const original = structuredClone(first), index = typeExampleIndex([first, second], types);
  assert.deepEqual(index.get("paragraph").map(example => [example.page.id, example.regions[0].id]), [["p1", "r1"], ["p2", "r1"], ["p1", "r2"]]);
  assert.deepEqual(index.get("illustration")[0].box, [10, 70, 90, 150]);
  assert.deepEqual(index.get("section")[0].box, [10, 10, 90, 150]);
  assert.equal(index.get("section")[0].regions.length, 3);
  assert.equal(index.get("section")[0].provisional, true);
  assert.deepEqual(index.get("unused"), []);
  assert.deepEqual(first, original);
  first.units[1].children.push({ unit: "u1" });
  assert.equal(typeExampleIndex([first], types).get("section").length, 2);
});
