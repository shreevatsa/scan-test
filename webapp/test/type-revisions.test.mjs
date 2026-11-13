import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { makeValidator, checkPage } from "../js/schema.js";
import { provisionalDocument } from "../js/pipeline/provisional.js";
import { planTypeRevision, revisedTypeList, mappedTypeNames, resolveTypeName, citedSamplePages } from "../js/type-revisions.js";
import { Book, idb } from "../js/store.js";

const validate = makeValidator(JSON.parse(readFileSync(new URL("../schema.json", import.meta.url))));
const check = (doc, types) => checkPage(validate, doc, types)[0];
const options = { validate, check, at: "2026-11-09T20:00:00Z" };
const types = { format: "types", schema_version: "0.2", book_id: "revision", title: "Revision test", flows: { main: "Main", notes: "Notes" },
  types: { article: { description: "Article", contains: ["paragraph", "verse"], flow: "main" }, paragraph: { description: "Paragraph", region: "paragraph" },
    verse: { description: "Verse", region: "verse" }, heading: { description: "Heading", region: "heading", flow: "main" },
    note: { description: "Note", region: "note", flow: "notes" }, unused: { description: "Unused", region: "caption", flow: "main" } } };
const ring = [[[10, 10], [90, 10], [90, 30], [10, 30]]];
function page(pid = "p1") {
  const doc = provisionalDocument(pid, { image: `${pid}.png`, image_sha256: "a".repeat(64), width: 100, height: 100 }, types,
    { regions: [{ region_id: 1, type: "paragraph", region_class: "paragraph", keep: true, reading_order: 1, status: "ok", polygons: ring, model_box: [10, 10, 90, 30], bounds: [10, 10, 90, 30], lines: [{ line_id: 1, polygons: ring }] }] });
  doc.page.regions[0].lines[0].text = "ಕನ್ನಡ";
  doc.source.layers.text = { state: "model", types_revision: 1 };
  doc.source.layers.units.state = "model";
  assert.deepEqual(check(doc, types), []);
  return doc;
}
function snapshot() {
  return { pages: [{ id: "p1", document: "pages/p1.json" }, { id: "p2", document: "pages/p2.json" }], models: { p1: page() }, edits: {}, drafts: {},
    style: { types: { paragraph: { italic: true }, heading: { weight: "bold" } } } };
}
function validChanges(plan) {
  assert.deepEqual(validate(plan.types), []);
  for (const change of plan.changes) if (change.after) assert.deepEqual(check(change.kind === "draft" ? change.after.doc : change.after, plan.types), []);
}

test("metadata and descriptions retain page text, layer revisions and page files", () => {
  const before = snapshot(), saved = structuredClone(before);
  const plan = planTypeRevision(types, before, [{ kind: "metadata", title: "New title", languages: ["kn"], conventions: ["Keep spelling"] }, { kind: "description", name: "paragraph", description: "Printed prose" }], options);
  assert.equal(plan.types.title, "New title"); assert.equal(plan.types.source.revision, 2);
  assert.deepEqual(plan.changes, []); assert.deepEqual(before, saved);
  validChanges(plan);
});

test("add and split types leave text intact and identify pages to retype", () => {
  const plan = planTypeRevision(types, snapshot(), [{ kind: "split", from: "paragraph", name: "translation", region: "paragraph", parent: "article", description: "Translation" }], options);
  assert.ok(plan.types.types.article.contains.includes("translation"));
  assert.deepEqual(plan.pages, ["p1"]); assert.equal(plan.regions, 1); assert.deepEqual(plan.changes, []);
  const added = planTypeRevision(types, snapshot(), [{ kind: "add", name: "ornament", region: "figure", furniture: true }], options);
  assert.equal(added.types.types.ornament.role, "furniture"); validChanges(added); validChanges(plan);
  const container = planTypeRevision(types, snapshot(), [{ kind: "add", name: "chapter", region: "container", contains: ["paragraph"], flow: "main" }], options);
  assert.deepEqual(container.types.types.chapter.contains, ["paragraph"]); validChanges(container);
});

test("rename migrates models, corrections, drafts, containment and styles without changing transcription", () => {
  const before = snapshot(); before.edits.p1 = page(); before.edits.p1.units[0].label = "Reviewed";
  before.drafts.p2 = { at: 3, doc: page("p2") };
  const plan = planTypeRevision(types, before, [{ kind: "rename", name: "paragraph", to: "prose" }], options);
  assert.equal(plan.changes.length, 3); assert.deepEqual(plan.pages, ["p1", "p2"]);
  for (const change of plan.changes) {
    const old = change.kind === "draft" ? change.before.doc : change.before, next = change.kind === "draft" ? change.after.doc : change.after;
    assert.equal(next.page.regions[0].type, "prose");
    assert.deepEqual(next.page.regions[0].lines, old.page.regions[0].lines);
    assert.deepEqual(next.source.layers, old.source.layers);
  }
  assert.equal(plan.types.source.aliases.paragraph, "prose");
  assert.deepEqual(plan.style.types.prose, { italic: true }); assert.equal(plan.style.types.paragraph, undefined);
  validChanges(plan);
});

test("merge preserves compatible grouping and aliases while refusing incompatible classes", () => {
  const current = revisedTypeList(types, [{ kind: "add", name: "prose", region: "paragraph", parent: "article" }]);
  const plan = planTypeRevision(current, snapshot(), [{ kind: "merge", name: "paragraph", to: "prose" }], options);
  assert.equal(plan.types.types.paragraph, undefined); assert.equal(plan.types.source.aliases.paragraph, "prose"); validChanges(plan);
  const styled = snapshot(); styled.style.types.prose = { weight: "bold" };
  assert.deepEqual(planTypeRevision(current, styled, [{ kind: "merge", name: "paragraph", to: "prose" }], options).style.types.prose, { weight: "bold" });
  assert.throws(() => planTypeRevision(types, snapshot(), [{ kind: "merge", name: "paragraph", to: "verse" }], options), /same printed class/);
});

test("containment changes rebuild unprotected units and flag protected units for repair", () => {
  const before = snapshot(); before.models.p2 = page("p2"); before.edits.p2 = page("p2"); before.edits.p2.source.layers.units.state = "edited";
  const operations = [{ kind: "rules", name: "paragraph", flow: "main" }, { kind: "rules", name: "article", contains: ["verse"], flow: "main" }];
  const plan = planTypeRevision(types, before, operations, options);
  const first = plan.changes.find(change => change.page === "p1").after;
  assert.deepEqual(check(first, plan.types), []); assert.equal(first.source.layers.units.state, "provisional");
  assert.deepEqual(first.page.regions[0].lines, before.models.p1.page.regions[0].lines);
  assert.deepEqual(plan.complete, ["p1"]); assert.deepEqual(plan.manual, ["p2"]);
  const protectedDoc = plan.changes.find(change => change.kind === "edit").after;
  assert.deepEqual(protectedDoc.units, before.edits.p2.units); assert.ok(check(protectedDoc, plan.types).length);
});

test("flow changes rebuild provisional roots under the revised flow", () => {
  const before = snapshot(); before.models.p1.source.layers.units.state = "provisional";
  const plan = planTypeRevision(types, before, [{ kind: "rules", name: "article", contains: ["paragraph", "verse"], flow: "notes" }], options);
  assert.ok(plan.changes[0].after.flows.notes.length); validChanges(plan);
});

test("figure-class changes retain text as provenance and identify region work", () => {
  const before = snapshot(); before.models.p1.source.layers.regions.accepted_at_utc = "reviewed";
  const plan = planTypeRevision(types, before, [{ kind: "class", name: "paragraph", region: "figure" }], options);
  const doc = plan.changes[0].after;
  assert.equal(doc.page.regions[0].lines, undefined);
  assert.deepEqual(doc.page.regions[0].source.kept_text, before.models.p1.page.regions[0].lines);
  assert.equal(doc.source.layers.regions.accepted_at_utc, undefined); assert.deepEqual(plan.find, ["p1"]); validChanges(plan);
  const ordinary = planTypeRevision(types, snapshot(), [{ kind: "class", name: "paragraph", region: "verse" }], options);
  assert.deepEqual(ordinary.changes, []); assert.deepEqual(ordinary.find, []);
  validChanges(planTypeRevision(types, snapshot(), [{ kind: "class", name: "paragraph", region: "figure" }, { kind: "rename", name: "paragraph", to: "illustration" }], options));
});

test("unused types can be removed while uses in drafts prevent removal", () => {
  const plan = planTypeRevision(types, snapshot(), [{ kind: "remove", name: "unused" }], options);
  assert.equal(plan.types.types.unused, undefined); validChanges(plan);
  const before = snapshot(); before.models = {}; before.drafts.p2 = { at: 1, doc: page("p2") };
  assert.throws(() => planTypeRevision(types, before, [{ kind: "remove", name: "paragraph" }], options), /Merge that type first/);
});

test("old work names resolve through chained aliases without changing provider envelopes or raw records", () => {
  const a = revisedTypeList(types, [{ kind: "rename", name: "paragraph", to: "prose" }]);
  const b = revisedTypeList(a, [{ kind: "rename", name: "prose", to: "text" }]);
  const record = { regions: [{ type: "paragraph" }], doc: page(), response: { outputs: [{ type: "paragraph" }] } }, original = structuredClone(record);
  assert.equal(resolveTypeName("paragraph", b), "text"); assert.equal(mappedTypeNames(record, b).doc.page.regions[0].type, "text");
  assert.equal(mappedTypeNames(record, b).response.outputs[0].type, "paragraph"); assert.deepEqual(record, original);
  assert.throws(() => revisedTypeList(b, [{ kind: "add", name: "paragraph", region: "paragraph", flow: "main" }]), /reserved/);
});

test("review questions record decisions alongside type-list operations", () => {
  const current = { ...types, source: { discovery: { questions: ["Other pages?"] } } };
  const next = revisedTypeList(current, [{ kind: "resolve_question", question: "Other pages?", answer: "Reviewed pages 1–2" }], options.at);
  assert.equal(next.source.discovery.resolved_questions["Other pages?"].answer, "Reviewed pages 1–2");
  assert.deepEqual(citedSamplePages("Does footnote 1 on page 134 also occur on pages 250–252?", [1, 134, 250, 251, 252]), [134, 250, 251, 252]);
  assert.deepEqual(citedSamplePages("Compare pp. 1, 3 and 5.", [1, 2, 3, 4, 5]), [1, 3, 5]);
});

function stored(files = null, drafts = new Map()) {
  const manifest = { format: "book-folder", book_id: types.book_id, title: types.title, types: "types.json", style: "style.json", pages: snapshot().pages };
  files ||= new Map(Object.entries({ "book.json": manifest, "types.json": types, "style.json": snapshot().style,
    "pages/p1.json": page(), "work/p1.regions.json": { regions: [{ type: "paragraph" }] } }));
  const book = new Book("folder", { name: "revision", async getDirectoryHandle() { throw new DOMException("Missing", "NotFoundError"); } },
    structuredClone(files.get("book.json")), structuredClone(files.get("types.json")), { browser: true });
  book.readJson = async path => structuredClone(files.get(path) || null);
  book.writeFile = async (path, text) => { files.set(path, JSON.parse(text)); };
  book.removeFile = async path => { files.delete(path); };
  book.draft = async pid => structuredClone(drafts.get(pid) || null);
  book.clearDraft = async pid => { drafts.delete(pid); };
  return { book, files, drafts };
}

test("type migrations recover after every file boundary with corrections, drafts, styles and raw work retained", async () => {
  const original = { ...idb };
  try {
    for (let boundary = 1; boundary <= 9; boundary++) {
      const { book, files, drafts } = stored();
      files.set("edits/p1.json", page()); drafts.set("p2", { at: 1, doc: page("p2") });
      let writes = 0;
      const interrupt = () => { if (++writes === boundary) throw Error("Interrupted"); };
      idb.put = async (store, key, value) => { assert.equal(store, "drafts"); drafts.set(key[1], structuredClone(value)); interrupt(); };
      const operations = [{ kind: "rename", name: "paragraph", to: "prose" }], preview = await book.previewTypes(operations, options);
      const write = book.writeFile, remove = book.removeFile;
      book.writeFile = async (...args) => { await write(...args); interrupt(); };
      book.removeFile = async (...args) => { await remove(...args); interrupt(); };
      await assert.rejects(book.saveTypes(preview.types, operations, { ...options, expected: preview.token }), /Interrupted/);
      const reopened = stored(files, drafts).book;
      await reopened.recoverStages();
      assert.equal(files.has("work/pending-types.json"), false);
      assert.equal(files.get("types.json").types.paragraph, undefined);
      assert.equal(files.get("pages/p1.json").page.regions[0].type, "prose");
      assert.equal(files.get("edits/p1.json").page.regions[0].type, "prose");
      assert.equal(drafts.get("p2").doc.page.regions[0].type, "prose");
      assert.deepEqual(files.get("style.json").types.prose, { italic: true });
      assert.equal(files.get("work/p1.regions.json").regions[0].type, "paragraph");
      assert.equal((await reopened.readWork("work/p1.regions.json")).regions[0].type, "prose");
      assert.deepEqual(files.get("work/type-revisions/2.json").types, types);
    }
  } finally { Object.assign(idb, original); }
});

test("a changed book invalidates the reviewed reach before any type migration writes", async () => {
  const { book, files } = stored(), operations = [{ kind: "rename", name: "paragraph", to: "prose" }];
  const preview = await book.previewTypes(operations, options);
  await book.addType({ name: "caption", region: "caption", flow: "main" }, validate);
  await assert.rejects(book.saveTypes(preview.types, operations, { ...options, expected: preview.token }), /changed after this preview/);
  assert.equal(files.has("work/pending-types.json"), false); assert.ok(files.get("types.json").types.caption);
});

test("an older editor saves renamed types consistently while preserving its new text", async () => {
  const { book, files } = stored(), operations = [{ kind: "rename", name: "paragraph", to: "prose" }], old = page();
  const preview = await book.previewTypes(operations, options);
  await book.saveTypes(preview.types, operations, { ...options, expected: preview.token });
  old.page.regions[0].lines[0].text = "A new correction";
  await book.saveEdit("p1", old);
  const saved = files.get("edits/p1.json");
  assert.equal(saved.page.regions[0].type, "prose"); assert.equal(saved.page.regions[0].lines[0].text, "A new correction");
  assert.deepEqual(check(saved, book.types), []);
});

test("recovery migrates a newer draft and preserves the original manifest in history", async () => {
  const { book, files, drafts } = stored(), original = { ...idb };
  drafts.set("p2", { at: 1, doc: page("p2") });
  const operations = [{ kind: "rename", name: "paragraph", to: "prose" }], preview = await book.previewTypes(operations, options);
  const before = structuredClone(files.get("book.json")), write = book.writeFile;
  book.writeFile = async (path, value) => { await write(path, value); if (path === "work/pending-types.json") throw Error("Interrupted"); };
  await assert.rejects(book.saveTypes(preview.types, operations, { ...options, expected: preview.token }));
  const newer = page("p2"); newer.page.regions[0].lines[0].text = "New draft correction"; drafts.set("p2", { at: 2, doc: newer });
  idb.put = async (store, key, value) => { drafts.set(key[1], value); };
  try { await stored(files, drafts).book.recoverStages(); }
  finally { Object.assign(idb, original); }
  assert.equal(drafts.get("p2").at, 2); assert.equal(drafts.get("p2").doc.page.regions[0].type, "prose");
  assert.equal(drafts.get("p2").doc.page.regions[0].lines[0].text, "New draft correction");
  assert.deepEqual(files.get("work/type-revisions/2.json").manifest, before);
});

test("a book export and type migration serialize into a coherent set of files", async () => {
  const { book } = stored(), operations = [{ kind: "rename", name: "paragraph", to: "prose" }];
  const preview = await book.previewTypes(operations, options);
  const [exported] = await Promise.all([book.chayaFiles(), book.saveTypes(preview.types, operations, { ...options, expected: preview.token })]);
  const doc = exported["pages/p1.json"], list = exported["types.json"];
  assert.deepEqual(check(doc, list), []);
  assert.ok(Object.hasOwn(list.types, doc.page.regions[0].type));
});
