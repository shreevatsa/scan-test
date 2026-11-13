import test from "node:test";
import assert from "node:assert/strict";
import { CLASS_LABELS, classLabel, classRule, classNote, defaultClass, DEFAULT_CLASS_NOTE } from "../js/class-labels.js";
import { REGION_CLASSES } from "../js/book-types.js";
import { CLASS_RULES } from "../js/pipeline/prompts.js";

test("every region class and container has a label and a rule", () => {
  for (const region of [...REGION_CLASSES, "container"]) {
    assert.ok(classLabel(region).trim(), region);
    assert.ok(classRule(region).trim(), region);
    assert.ok(CLASS_LABELS[region], region);
  }
});

test("a rule is the first sentence of the finder's own rule", () => {
  for (const region of REGION_CLASSES) if (CLASS_RULES[region]) assert.ok(CLASS_RULES[region].startsWith(classRule(region)), region);
  assert.equal(classRule("list_item"), "One region per entry.");
});

test("a missing or other class defaults to paragraph with a note", () => {
  for (const region of ["other", "", undefined, "nonsense"]) assert.deepEqual(defaultClass(region), { region: "paragraph", note: DEFAULT_CLASS_NOTE });
  assert.match(DEFAULT_CLASS_NOTE, /^No class fitted; paragraph is the default\./);
  assert.deepEqual(defaultClass("verse"), { region: "verse", note: "" });
  assert.deepEqual(defaultClass("container"), { region: "container", note: "" });
});

test("tree annotation uses the short friendly label", () => {
  assert.equal(classNote("list_item"), "like list entry");
  assert.equal(classNote("figure"), "like figure");
});
