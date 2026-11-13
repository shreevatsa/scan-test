import test from "node:test";
import assert from "node:assert/strict";
import { findTargets } from "../js/find-targets.js";
import { providerGroups } from "../js/key-check.js";

const all = ["a", "b", "c", "d", "e"], shown = ["b", "c", "d"], skipped = new Set(["c", "e"]);
const base = { all, shown, isSkipped: pid => skipped.has(pid), eligible: pid => pid !== "d" };

test("By page with nothing selected uses the shown pages that are not dimmed", () => {
  assert.deepEqual(findTargets({ ...base, view: "pages" }), ["b"]);
});

test("By type with nothing selected uses every page of the book that is not dimmed", () => {
  assert.deepEqual(findTargets({ ...base, view: "types" }), ["a", "b"]);
});

test("a typed range or ticked pages are used in either view, even a dimmed page, if eligible", () => {
  for (const view of ["pages", "types"]) assert.deepEqual(findTargets({ ...base, view, selected: ["e", "d", "a"] }), ["e", "a"]);
});

test("one key field per provider; a local finder needs none", () => {
  const finder = { id: "terra", provider: "openai", label: "Terra" };
  const groups = providerGroups(finder, [{ id: "argon", provider: "gemini", label: "Argon" }, { id: "terra", provider: "openai", label: "Terra" }, { id: "other", provider: "openai", label: "Other" }]);
  assert.deepEqual([...groups.keys()], ["openai", "gemini"]);
  assert.deepEqual(groups.get("openai").map(profile => profile.id), ["terra", "other"]);
  assert.equal(providerGroups({ id: "tesseract", provider: "local" }, []).size, 0);
  assert.equal(providerGroups(null, []).size, 0);
});
