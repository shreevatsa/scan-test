import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { makeValidator } from "../js/schema.js";
import { initialBookTypes, addBookType } from "../js/book-types.js";
import { draftTypeNames, unusedDraftTypes } from "../js/draft-types.js";
import { revisedTypeList } from "../js/type-revisions.js";
import { surveyOutcome, additionChoice, additionOperations, isRealClass } from "../js/type-additions.js";

const generic = JSON.parse(readFileSync(new URL("../types/generic.json", import.meta.url)));
const validate = makeValidator(JSON.parse(readFileSync(new URL("../schema.json", import.meta.url))));
const start = () => initialBookTypes({ ...structuredClone(generic), source: { draft: true } }, { ...structuredClone(generic), description: "A book." }, "b", "B");
const docWith = (...types) => ({ page: { regions: types.map(type => ({ type })) }, units: [] });
const text = parts => parts.map(part => typeof part === "string" ? part : `[${part.text}]`).join("");

test("draft types are those of the draft list the book started from; used ones and proposed ones are kept", () => {
  const tl = start();
  assert.deepEqual(draftTypeNames(tl, generic).sort(), Object.keys(generic.types).sort());
  const { names } = unusedDraftTypes(tl, generic, [docWith("paragraph", "heading")], []);
  assert.ok(!names.includes("paragraph") && !names.includes("heading"));
  assert.ok(names.includes("verse") && names.includes("table"));
  assert.ok(!names.includes("section"), "section holds the used paragraph, so it stays");
  const proposed = unusedDraftTypes(tl, generic, [docWith("paragraph")], [{ proposal: { name: "tika", parents: ["verse"], contains: [] } }]);
  assert.ok(!proposed.names.includes("verse"));
  // A type added later is not a draft type; a list that did not start from the draft list has none.
  const added = addBookType(tl, { name: "colophon", region: "paragraph", parent: "section" });
  assert.ok(!draftTypeNames(added, generic).includes("colophon") && !unusedDraftTypes(added, generic, [docWith("paragraph")]).names.includes("colophon"));
  const other = structuredClone(tl); other.source.revisions[0].operations[0].previous.types.verse.description = "changed";
  assert.deepEqual(draftTypeNames(other, generic), []);
});

test("a new book's list is a draft while source.draft stands, through revisions", () => {
  const tl = { ...structuredClone(generic), source: { draft: true } };
  assert.equal(draftTypeNames(tl, generic).length, Object.keys(generic.types).length);
  const added = revisedTypeList(addBookType(tl, { name: "colophon", region: "paragraph", parent: "section" }), [{ kind: "remove", name: "table" }]);
  assert.ok(added.source.draft && draftTypeNames(added, generic).includes("figure") && !draftTypeNames(added, generic).includes("table") && !draftTypeNames(added, generic).includes("colophon"));
  assert.deepEqual(draftTypeNames({ ...tl, source: {} }, generic), []);
});

test("removing the unused draft types is one revision and leaves a valid list", () => {
  const tl = start(), { names } = unusedDraftTypes(tl, generic, [docWith("paragraph", "heading")], []);
  const next = revisedTypeList(tl, names.map(name => ({ kind: "remove", name })), "2026-11-13T00:00:00Z");
  assert.equal(next.source.revision, tl.source.revision + 1);
  for (const name of names) assert.equal(next.types[name], undefined);
  assert.ok(next.types.paragraph && next.types.heading && next.types.section);
  assert.deepEqual(validate(next), []);
});

test("the survey result line says where things went", () => {
  const item = (kind, key = kind) => ({ kind, id: key, proposal: {} });
  assert.equal(text(surveyOutcome([])), "Nothing new: no new types or definition edits.");
  assert.equal(text(surveyOutcome([item("question", "a"), item("question", "b")])), "Nothing new: no new types or definition edits. [2 questions] — see Questions to review.");
  assert.equal(text(surveyOutcome([item("new_type", "a"), item("new_type", "b"), item("question")])), "[2 proposed types] — review them in Proposed types. [1 question] — see Questions to review.");
  assert.equal(text(surveyOutcome([item("new_type")])), "[1 proposed type] — review it in Proposed types.".replace("review it", "review them"));
  assert.match(text(surveyOutcome([item("definition_edit")])), /1 suggested definition edit/);
});

test("a type may not have class other: the form needs a real class", () => {
  assert.ok(!isRealClass("other") && !isRealClass("") && !isRealClass(undefined) && isRealClass("heading") && isRealClass("container"));
  const proposal = { name: "ornament", description: "x", region: "other", parents: ["section"], contains: [] };
  assert.equal(additionChoice(proposal).region, "paragraph");
  assert.equal(additionChoice({ ...proposal, region: "figure" }).region, "figure");
  const tl = start();
  assert.equal(additionOperations(additionChoice(proposal), tl)[0].region, "paragraph", "the default is paragraph, never other");
  assert.match(additionChoice(proposal).classNote, /No class fitted/);
  assert.throws(() => additionOperations({ ...additionChoice(proposal), region: "other", parents: ["section"] }, tl), /Choose how this type is printed/);
  assert.throws(() => addBookType(tl, { name: "ornament", region: "other", parent: "section" }), /how this type is printed/);
  assert.ok(additionOperations({ ...additionChoice(proposal), region: "figure" }, tl).length);
});
