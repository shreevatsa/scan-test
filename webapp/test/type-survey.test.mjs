import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { makeValidator } from "../js/schema.js";
import { SURVEY_MODELS, surveyForm, surveyProfile, surveySchema, surveyPrompt, surveyRequest, checkSurvey, mergeSurveyResults, runSurvey } from "../js/pipeline/type-survey.js";
import { contactSheetPlan } from "../js/pipeline/contact-sheets.js";
import { PENDING_PATH, surveyItems, addPendingProposals, readPendingProposals, pendingItems, decideProposal, additionChoice, additionOperations } from "../js/type-additions.js";
import { revisedTypeList } from "../js/type-revisions.js";
import { writeChaya, readChaya } from "../js/chayapdf.js";
import { Book } from "../js/store.js";

const schema = JSON.parse(readFileSync(new URL("../schema.json", import.meta.url)));
const types = { ...JSON.parse(readFileSync(new URL("../types/generic.json", import.meta.url))), book_id: "survey", title: "Survey test",
  description: "A Sanskrit poem with a commentary and footnotes." };
const addition = (extra = {}) => ({ name: "commentary", description: "The commentary on a verse, in smaller type.", region: "paragraph", furniture: false,
  contains: [], parents: ["section"], flow: "", evidence_pages: [5], evidence: "Smaller type below each verse.", ...extra });
const result = (extra = {}) => ({ new_types: [addition()], definition_edits: [{ name: "verse", description: "A verse of the poem, with its number.", reason: "Verses are numbered." }],
  possible_duplicates: [{ types: ["list_item", "table"], question: "Are the tables on page 3 lists of contents?" }], questions: ["Is page 5's preface part of the book?"], ...extra });
const context = { schema, types, pages: [1, 3, 5] };

test("up to twelve pages go as page images (095) and more as contact sheets (096), with one model choice", () => {
  assert.equal(surveyForm(12), "pages"); assert.equal(surveyForm(13), "sheets");
  assert.deepEqual(SURVEY_MODELS.map(profile => profile.label), ["GPT-6.1 Terra · reasoning off", "Gemini 4 Argon · low thinking"]);
  assert.equal(surveyProfile("terra-survey", "pages").method, "095-additive-page-image-type-survey");
  assert.equal(surveyProfile("argon-survey", "sheets").method, "096-additive-contact-sheet-type-survey");
  assert.equal(surveyProfile("argon-survey", "sheets").request_timeout_ms, 300000);
  assert.equal(surveyProfile("terra-survey", "pages").request_timeout_ms, undefined);
  assert.deepEqual(contactSheetPlan([2, 9, 40]).map(sheet => sheet.pages), [[2, 9, 40]]);
});

test("survey requests carry the current type list and the book's description, and ask only for additions", () => {
  const format = surveySchema(schema, types);
  assert.deepEqual(format.properties.new_types.items.properties.flow.enum, ["", "main", "notes"]);
  for (const form of ["pages", "sheets"]) {
    const prompt = surveyPrompt({ types, pages: [1, 3, 5], pageCount: 40, form });
    assert.match(prompt, /A Sanskrit poem with a commentary and footnotes\./);
    assert.ok(prompt.includes(JSON.stringify(types.types.section)));
    assert.ok(prompt.includes('"running_header"') && prompt.includes('"notes"'));
    assert.ok(!prompt.includes("written_by"));
    assert.match(prompt, /stays as it is/);
    for (const profile of SURVEY_MODELS) {
      const images = form === "pages" ? [{ page: 3, dataUrl: "data:image/png;base64,aW1hZ2U=" }] : [{ ...contactSheetPlan([1, 3, 5])[0], dataUrl: "data:image/jpeg;base64,aW1hZ2U=" }];
      const request = surveyRequest(surveyProfile(profile.id, form), prompt, images, format, form);
      const content = profile.provider === "openai" ? request.input[0].content : request.input;
      assert.equal(content[0].text, prompt);
      assert.match(content[1].text, form === "pages" ? /^PDF page 3$/ : /PDF pages 1, 3, 5/);
      assert.equal(request.store, false);
      if (profile.provider === "openai") { assert.equal(request.text.format.name, "book_type_additions"); assert.equal(request.text.format.strict, true); assert.equal(content[2].detail, "original"); }
      else { assert.equal(request.generation_config.thinking_level, "low"); assert.equal(content[2].mime_type, form === "pages" ? "image/png" : "image/jpeg"); }
    }
  }
});

test("the response check accepts additions only and rejects malformed or conflicting ones", () => {
  assert.deepEqual(makeValidator(surveySchema(schema, types))(result()), []);
  assert.ok(checkSurvey(result(), context));
  assert.ok(checkSurvey({ new_types: [], definition_edits: [], possible_duplicates: [], questions: [] }, context));
  assert.ok(checkSurvey(result({ new_types: [addition({ name: "ornament", region: "other", furniture: true, parents: [], evidence_pages: [] }),
    addition({ name: "canto", region: "container", contains: ["verse"], parents: [], flow: "main" })] }), context));
  for (const change of [
    r => { delete r.questions; },
    r => { r.types = {}; },
    r => { r.new_types[0].flow = "appendix"; },
    r => { r.new_types[0].name = "paragraph"; },
    r => { r.new_types[0].name = "Commentary"; },
    r => { r.new_types.push(structuredClone(r.new_types[0])); },
    r => { r.new_types[0].evidence_pages = [7]; },
    r => { r.new_types[0].parents = ["heading"]; },
    r => { r.new_types[0].parents = []; },
    r => { r.new_types[0].furniture = true; },
    r => { r.new_types[0].region = "container"; },
    r => { r.new_types[0].contains = ["verse"]; },
    r => { r.definition_edits[0].name = "stanza"; },
    r => { r.possible_duplicates[0].types = ["table"]; },
  ]) {
    const bad = result(); change(bad);
    assert.throws(() => checkSurvey(bad, context));
  }
  const merged = mergeSurveyResults([result(), result({ new_types: [addition({ evidence_pages: [3] })], definition_edits: [] })]);
  assert.equal(merged.new_types.length, 1); assert.deepEqual(merged.new_types[0].evidence_pages, [3, 5]);
  assert.equal(merged.possible_duplicates.length, 1); assert.equal(merged.questions.length, 1);
});

function memoryStore() {
  const records = new Map();
  return { records, readWork: async path => structuredClone(records.get(path) ?? null),
    writeWork: async (path, value) => { records.set(path, structuredClone(value)); },
    updateWork: async (path, update) => { const value = await update(structuredClone(records.get(path) ?? null)); records.set(path, structuredClone(value)); return value; } };
}

test("a contact-sheet survey runs in batches, keeps its calls and costs without images or keys, and reuses completed requests", async () => {
  const store = memoryStore(), calls = [];
  const sheets = contactSheetPlan(Array.from({ length: 340 }, (_, index) => index + 1)).map(sheet => ({ ...sheet, sha256: "a".repeat(64), dataUrl: "data:image/jpeg;base64,aW1hZ2U=" }));
  const args = { store, keys: { gemini: "fixture-secret" }, profile: surveyProfile("argon-survey", "sheets"), form: "sheets", images: sheets, types,
    pageCount: 340, pdfSha: "b".repeat(64), schema, runId: "run-1",
    request: async (provider, payload, key, auth) => {
      calls.push(auth);
      const first = payload.input[1].text.includes("PDF pages 1, 2");
      const value = first ? result() : result({ new_types: [addition({ evidence_pages: [330] }), addition({ name: "colophon", region: "paragraph", parents: [], flow: "main", evidence_pages: [340] })], definition_edits: [], possible_duplicates: [], questions: [] });
      return { body: { id: `fixture-${calls.length}`, status: "completed", usage: { total_input_tokens: 1000, total_output_tokens: 300, total_thought_tokens: 0 },
        outputs: [{ type: "text", text: JSON.stringify(value) }] }, seconds: 3 };
    } };
  const run = await runSurvey(args);
  assert.equal(calls.length, 2); assert.equal(calls[0].timeout_ms, 300000);
  assert.equal(run.method, "096-additive-contact-sheet-type-survey"); assert.equal(run.pages.length, 340);
  assert.deepEqual(run.result.new_types.map(type => type.name), ["commentary", "colophon"]);
  assert.deepEqual(run.result.new_types[0].evidence_pages, [5, 330]);
  assert.ok(run.cost_usd > 0); assert.equal(run.seconds, 6);
  assert.deepEqual(store.records.get("work/type-surveys/run-1.json"), run);
  const saved = JSON.stringify([...store.records]);
  assert.ok(!saved.includes("aW1hZ2U=")); assert.ok(!saved.includes("fixture-secret"));
  assert.equal(store.records.get("work/reader-lab/ledger.json").calls.length, 2);
  const again = await runSurvey({ ...args, runId: "run-2" });
  assert.equal(calls.length, 2); assert.equal(again.cost_usd, 0); assert.ok(again.calls.every(call => call.cached));
  const failing = memoryStore();
  await assert.rejects(runSurvey({ ...args, store: failing, images: sheets.slice(0, 1), request: async () => { throw new Error("Timed out"); } }), /Timed out/);
  await assert.rejects(runSurvey({ ...args, store: failing, images: sheets.slice(0, 1) }), /unresolved charge/);
});

test("a page-image survey rejects a malformed response and keeps its charge", async () => {
  const store = memoryStore(), bad = result({ new_types: [addition({ parents: ["nowhere"] })] });
  const args = { store, keys: { gemini: "fixture-secret" }, profile: surveyProfile("argon-survey", "pages"), form: "pages",
    images: [1, 3, 5].map(page => ({ page, dataUrl: "data:image/png;base64,aW1hZ2U=" })), types, pageCount: 40, pdfSha: "b".repeat(64), schema,
    request: async () => ({ body: { id: "bad", status: "completed", usage: { total_input_tokens: 10, total_output_tokens: 10, total_thought_tokens: 0 },
      outputs: [{ type: "text", text: JSON.stringify(bad) }] }, seconds: 1 }) };
  await assert.rejects(runSurvey(args), /nowhere/);
  const ledger = store.records.get("work/reader-lab/ledger.json").calls;
  assert.equal(ledger[0].status, "failed"); assert.ok(ledger[0].cost_usd > 0);
  assert.equal(store.records.get(ledger[0].path).method ?? store.records.get(ledger[0].path).profile.method, "095-additive-page-image-type-survey");
});

const surveyRun = { id: "run-1", method: "095-additive-page-image-type-survey", profile: { label: "GPT-6.1 Terra · reasoning off" }, pages: [1, 3, 5],
  finished_at_utc: "2026-11-13T00:00:00Z", result: result({ new_types: [addition(), addition({ name: "colophon", parents: [], flow: "main", evidence_pages: [1] }), addition({ name: "footnote_number", parents: [], flow: "notes" })] }) };

test("adding a proposed type is one type-list revision; rename, a second parent and a flow are honoured", () => {
  const current = { ...types, source: { revision: 4 } };
  const [first] = surveyItems(surveyRun);
  const operations = additionOperations({ ...additionChoice(first.proposal), name: "tika" }, current);
  assert.deepEqual(operations, [{ kind: "add", name: "tika", description: addition().description, region: "paragraph", furniture: false, parent: "section" }]);
  const next = revisedTypeList(current, operations, "2026-11-13T00:00:00Z");
  assert.equal(next.source.revision, 5); assert.equal(next.types.tika.region, "paragraph");
  assert.ok(next.types.section.contains.includes("tika")); assert.equal(next.types.commentary, undefined);
  const container = { name: "canto", description: "A canto.", region: "container", furniture: false, contains: ["verse", "paragraph"], parents: ["section"], flow: "main" };
  const more = revisedTypeList(next, additionOperations(container, next));
  assert.equal(more.source.revision, 6); assert.deepEqual(more.types.canto.contains, ["verse", "paragraph"]);
  assert.equal(more.types.canto.flow, "main"); assert.ok(more.types.section.contains.includes("canto"));
  const twoParents = revisedTypeList(more, additionOperations({ ...container, name: "gloss", region: "note", contains: [], parents: ["section", "canto"], flow: "" }, more));
  assert.ok(twoParents.types.section.contains.includes("gloss") && twoParents.types.canto.contains.includes("gloss"));
  assert.equal(twoParents.source.revisions.at(-1).operations.length, 2);
  const furniture = revisedTypeList(current, additionOperations({ name: "ornament", description: "An ornament.", region: "other", furniture: true, contains: [], parents: ["section"], flow: "main" }, current));
  assert.equal(furniture.types.ornament.role, "furniture"); assert.equal(furniture.types.ornament.flow, undefined);
  assert.throws(() => additionOperations({ ...additionChoice(first.proposal), parents: [], flow: "" }, current), /where the type belongs/);
  assert.throws(() => revisedTypeList(current, additionOperations({ ...additionChoice(first.proposal), name: "verse" }, current)), /already/);
});

test("pending proposals record their source, take decisions once and accept a second source", async () => {
  const store = memoryStore();
  await addPendingProposals(store, surveyItems(surveyRun));
  await addPendingProposals(store, surveyItems(surveyRun));
  let record = await readPendingProposals(store);
  assert.equal(record.items.length, 6);
  assert.deepEqual(pendingItems(record).map(item => item.kind), ["new_type", "new_type", "new_type", "definition_edit", "question", "question"]);
  assert.deepEqual(record.items[0].source, { kind: "survey", method: surveyRun.method, run: "run-1", model: surveyRun.profile.label, pages: [1, 3, 5], at_utc: surveyRun.finished_at_utc });
  assert.equal(pendingItems(record, "question").filter(item => item.proposal.duplicate).length, 1);
  const [commentary, colophon, footnote] = pendingItems(record, "new_type");
  await decideProposal(store, commentary.id, { status: "added", as: "tika", revision: 2 }, "t1");
  await decideProposal(store, colophon.id, { status: "dismissed", same_as: "paragraph" }, "t2");
  await decideProposal(store, footnote.id, { status: "dismissed" }, "t3");
  await assert.rejects(decideProposal(store, footnote.id, { status: "added" }), /already decided/);
  record = await readPendingProposals(store);
  assert.deepEqual(record.items.slice(0, 3).map(item => [item.status, item.decision]), [["added", { as: "tika", revision: 2, at_utc: "t1" }],
    ["dismissed", { same_as: "paragraph", at_utc: "t2" }], ["dismissed", { at_utc: "t3" }]]);
  assert.equal(pendingItems(record, "new_type").length, 0);
  await addPendingProposals(store, [{ id: "finder:p7:caption_number", kind: "new_type", status: "pending", source: { kind: "finder", page: "p7", run: "regions-1" }, proposal: addition({ name: "caption_number" }) }]);
  assert.equal(pendingItems(await readPendingProposals(store), "new_type")[0].source.kind, "finder");
});

function stored(files) {
  const manifest = { format: "book-folder", book_id: "survey", title: "Survey test", types: "types.json", pages: [] };
  files ||= new Map(Object.entries({ "book.json": manifest, "types.json": types }));
  const book = new Book("folder", { name: "survey", async getDirectoryHandle() { throw new DOMException("Missing", "NotFoundError"); } },
    structuredClone(files.get("book.json")), structuredClone(files.get("types.json")), { browser: true });
  book.readJson = async path => structuredClone(files.get(path) ?? null);
  book.writeFile = async (path, text) => { files.set(path, JSON.parse(text)); };
  book.removeFile = async path => { files.delete(path); };
  return { book, files };
}

test("pending proposals persist through the book's work files and a .chaya.pdf round trip", async () => {
  const { book, files } = stored();
  await addPendingProposals(book, surveyItems(surveyRun));
  const [first] = pendingItems(await readPendingProposals(book), "new_type");
  await decideProposal(book, first.id, { status: "dismissed", same_as: "paragraph" });
  const reopened = stored(files).book;
  const record = await readPendingProposals(reopened);
  assert.equal(record.items.length, 6); assert.equal(record.items[0].decision.same_as, "paragraph");
  const exported = await reopened.chayaFiles();
  assert.deepEqual(exported[PENDING_PATH], record);
  const tiny = (() => {
    const objs = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 300] >>"];
    let out = "%PDF-1.4\n"; const offs = [];
    objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
    const x = out.length;
    out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f\r\n` + offs.map(o => `${String(o).padStart(10, "0")} 00000 n\r\n`).join("");
    return new TextEncoder().encode(out + `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF\n`);
  })();
  const bytes = await writeChaya(tiny, { format: "chaya-book", version: 1, saved_by: "test", files: exported });
  const { data } = await readChaya(bytes);
  const opened = new Book("chaya", "survey.chaya.pdf", data.files["book.json"], data.files["types.json"], { files: data.files, pdfBytes: bytes });
  const back = await readPendingProposals(opened);
  assert.deepEqual(back, record);
  assert.equal(pendingItems(back, "new_type").length, 2);
});

// ---------------------------------------------------------------- method 098: a proposed book description
const bare = { ...types, description: "  " };
const describing = (extra = {}) => ({ proposed_description: "A Sanskrit poem in verse with a Sanskrit commentary, in Devanagari, two columns.", ...result(), ...extra });

test("a survey asks for a book description only while the description is empty, and then uses method 098", () => {
  for (const form of ["pages", "sheets"]) {
    const kept = surveyPrompt({ types, pages: [1, 3, 5], pageCount: 40, form });
    assert.ok(!kept.includes("proposed_description"));
    assert.equal(surveyProfile("terra-survey", form, types).method, form === "pages" ? "095-additive-page-image-type-survey" : "096-additive-contact-sheet-type-survey");
    for (const empty of [bare, { ...types, description: "" }, { ...types, description: undefined }]) {
      assert.match(surveyPrompt({ types: empty, pages: [1, 3, 5], pageCount: 40, form }), /proposed_description: the user has not described the book/);
      assert.equal(surveyProfile("terra-survey", form, empty).method, "098-survey-proposing-book-description");
    }
  }
  assert.equal(surveyProfile("terra-survey", "pages").method, "095-additive-page-image-type-survey");
  assert.equal(surveyProfile("argon-survey", "sheets", bare).request_timeout_ms, 300000);
  assert.ok(!("proposed_description" in surveySchema(schema, types).properties));
  const format = surveySchema(schema, bare);
  assert.equal(format.properties.proposed_description.type, "string"); assert.ok(format.required.includes("proposed_description"));
});

test("the response check for 098 needs a description exactly when one was asked for", () => {
  const ctx = { schema, types: bare, pages: [1, 3, 5] };
  assert.ok(checkSurvey(describing(), ctx));
  assert.throws(() => checkSurvey(result(), ctx));
  assert.throws(() => checkSurvey(describing({ proposed_description: "   " }), ctx), /no proposed book description/);
  assert.throws(() => checkSurvey(describing({ proposed_description: 3 }), ctx));
  assert.throws(() => checkSurvey(describing(), context));
  assert.ok(checkSurvey(result(), context));
});

test("a proposed description is a pending item with its source, taken or dismissed once, and persists", async () => {
  const run = { id: "run-9", method: "098-survey-proposing-book-description", profile: { label: "GPT-6.1 Terra · reasoning off" }, pages: [1, 3], finished_at_utc: "t0",
    result: mergeSurveyResults([describing({ new_types: [], definition_edits: [], possible_duplicates: [], questions: [] })]) };
  assert.match(run.result.proposed_description, /Sanskrit poem/);
  const items = surveyItems(run);
  assert.deepEqual(items.map(item => item.kind), ["book_description"]);
  assert.equal(items[0].source.method, "098-survey-proposing-book-description");
  assert.deepEqual(surveyItems({ ...run, result: { ...run.result, proposed_description: undefined } }), []);
  const { book, files } = stored();
  await addPendingProposals(book, items); await addPendingProposals(book, items);
  let record = await readPendingProposals(book);
  assert.equal(pendingItems(record, "book_description").length, 1);
  assert.equal(pendingItems(record, "new_type").length, 0);
  // Use goes through the book-details operation: a metadata revision that changes only the description.
  const next = revisedTypeList(book.types, [{ kind: "metadata", description: "Edited description." }]);
  assert.equal(next.description, "Edited description."); assert.equal(next.title, book.types.title);
  await decideProposal(book, items[0].id, { status: "applied", description: "Edited description." }, "t1");
  await assert.rejects(decideProposal(book, items[0].id, { status: "dismissed" }), /already decided/);
  record = await readPendingProposals(stored(files).book);
  assert.equal(record.items[0].status, "applied"); assert.equal(record.items[0].decision.description, "Edited description.");
  assert.equal(pendingItems(record, "book_description").length, 0);
  const other = stored();
  await addPendingProposals(other.book, items);
  await decideProposal(other.book, items[0].id, { status: "dismissed" });
  assert.equal((await readPendingProposals(stored(other.files).book)).items[0].status, "dismissed");
});
