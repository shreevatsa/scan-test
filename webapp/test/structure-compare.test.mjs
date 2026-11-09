import { test } from "node:test";
import assert from "node:assert/strict";
import { structureDecisions, structureDifferences } from "../js/pipeline/structure-compare.js";

const sample = { regions: [{ id: "r1", type: "paragraph", ends: ["space"] }, { id: "r2", type: "footnote", ends: ["line"] }],
  units: [{ id: "u1", type: "paragraph", children: ["r1"], open_start: false, open_end: true },
    { id: "u2", type: "footnote", number: "1", children: ["r2"] }],
  flows: [{ flow: "main", units: ["u1"] }, { flow: "notes", units: ["u2"] }],
  relations: [{ type: "note", region: "r1", line: 1, marker: "1", to: "u2" }] };

test("schema comparison ignores generated unit IDs and detects semantic choices", () => {
  const renamed = structuredClone(sample);
  renamed.units[0].id = "passage";
  renamed.units[1].id = "note";
  renamed.flows[0].units = ["passage"];
  renamed.flows[1].units = ["note"];
  renamed.relations[0].to = "note";
  assert.deepEqual(structureDifferences(renamed, sample), []);
  for (const mutate of [
    x => { x.regions[0].type = "verse"; },
    x => { x.regions[0].ends[0] = "join"; },
    x => { x.units[0].open_end = false; },
    x => { x.flows[0].flow = "other"; },
    x => { x.relations[0].marker = "2"; },
  ]) {
    const changed = structuredClone(sample);
    mutate(changed);
    assert.ok(structureDifferences(changed, sample).includes("r1"));
  }
});

test("schema comparison detects grouping, flow order, missing regions and cycles", () => {
  const changed = structuredClone(sample);
  changed.units[0].children.push("r2");
  assert.deepEqual(structureDifferences(changed, sample), ["r1", "r2"]);
  changed.units[0].children.push("u1");
  assert.ok(structureDifferences(changed, sample).length);
  const missing = structuredClone(sample);
  missing.regions.pop();
  assert.ok(structureDifferences(missing, sample).includes("r2"));
  const ordered = structuredClone(sample);
  ordered.flows[0].units.push("u2");
  const swapped = structuredClone(ordered);
  swapped.flows[0].units.reverse();
  assert.deepEqual(structureDifferences(swapped, ordered), ["r1", "r2"]);
});

test("a sibling’s continuation change stays local while container changes reach its members", () => {
  const reference = { regions: sample.regions, relations: [], flows: [{ flow: "main", units: ["article"] }], units: [
    { id: "article", type: "article", children: ["first", "second"], open_end: true },
    { id: "first", type: "paragraph", children: ["r1"] }, { id: "second", type: "paragraph", children: ["r2"] },
  ] };
  const candidate = structuredClone(reference);
  candidate.units[1].open_end = true;
  assert.deepEqual(structureDifferences(candidate, reference), ["r1"]);
  assert.deepEqual(structureDecisions(candidate).get("r2").units[0].map(unit => unit.type), ["article", "paragraph"]);
  candidate.units[0].open_end = false;
  assert.deepEqual(structureDifferences(candidate, reference), ["r1", "r2"]);
  assert.deepEqual(structureDecisions(candidate).get("r1").flows, structureDecisions(reference).get("r1").flows);
});

test("changing a linked unit’s continuation leaves the link’s target unchanged", () => {
  const candidate = structuredClone(sample);
  candidate.units[1].open_end = true;
  assert.deepEqual(structureDifferences(candidate, sample), ["r2"]);
  assert.deepEqual(structureDecisions(candidate).get("r1").relations, structureDecisions(sample).get("r1").relations);
});
