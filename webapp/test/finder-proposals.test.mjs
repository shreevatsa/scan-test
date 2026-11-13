import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Maker } from "../js/pipeline/run.js";
import { Book } from "../js/store.js";
import { makeValidator, checkPage } from "../js/schema.js";
import { finderById } from "../js/pipeline/finders.js";
import { proposingPrompt, proposingSchema, scaleProposingRegions, offeredProposals } from "../js/pipeline/proposing-finder.js";
import { PENDING_PATH, surveyItems, addPendingProposals, readPendingProposals, pendingItems, decideProposal, recordFinderProposals,
  proposalAssignments, normalizeTypeName, typeNameStyle, waitingRegions } from "../js/type-additions.js";
import { writeChaya, readChaya } from "../js/chayapdf.js";
import { isProtected } from "../js/layers.js";
import { movePage } from "../js/workflow.js";

const validate = makeValidator(JSON.parse(readFileSync(new URL("../schema.json", import.meta.url))));
const template = readFileSync(new URL("../pipeline/regions-proposals-prompt-template.txt", import.meta.url), "utf8");
const schemaTemplate = JSON.parse(readFileSync(new URL("../pipeline/regions-proposals-schema-template.json", import.meta.url)));
const types = { format: "types", schema_version: "0.1", book_id: "trial", title: "Trial", description: "A poem with notes.", languages: ["en"],
  types: { paragraph: { description: "A paragraph", region: "paragraph", flow: "main" },
    page_number: { description: "Page number", region: "page_number", role: "furniture" } }, flows: { main: "Main text" } };
const pendingRecord = items => ({ format: "pending-type-proposals", version: 1, items });
const surveyType = (name, extra = {}) => ({ id: `run-1:new_type:${name}`, kind: "new_type", status: "pending", source: { kind: "survey", method: "095", run: "run-1", pages: [3] },
  proposal: { name, description: `A ${name}.`, region: "paragraph", furniture: false, contains: [], parents: [], flow: "main", evidence_pages: [3], evidence: "" }, ...extra });
const box = (y, extra = {}) => ({ type: "paragraph", proposed_type: "", box_1000: [0, y, 900, y + 150], keep: true, reading_order: 1, uncertain: false,
  continues_from_earlier: false, continues_later: false, ...extra });

test("the 097 request lists pending proposals as not yet accepted types and lets the model propose new ones", () => {
  const pending = pendingRecord([surveyType("colophon"), surveyType("Paragraph"), surveyType("old", { status: "dismissed" })]);
  assert.deepEqual(offeredProposals(types, pending).map(type => type.name), ["colophon"], "names of listed types and decided items are not offered");
  const prompt = proposingPrompt(types, template, pending);
  assert.match(prompt, /Proposed types, not yet accepted into the list[^\n]*\n- colophon \(printed as paragraph\): A colophon\./);
  assert.match(prompt, /fits none of the types above nor a proposed type/);
  assert.match(prompt, /"type":"paragraph\|page_number\|other\|colophon","proposed_type":""/);
  assert.doesNotMatch(prompt, /<<|>>/);
  const schema = proposingSchema(types, schemaTemplate, pending);
  assert.deepEqual(schema.properties.regions.items.properties.type.enum, ["paragraph", "page_number", "other", "colophon"]);
  assert.ok(schema.properties.regions.items.required.includes("proposed_type"));
  assert.ok(!schema.properties.new_types.items.properties.region_class.enum.includes("other"));
  const none = proposingPrompt(types, template, null);
  assert.doesNotMatch(none, /not yet accepted/);
  assert.match(none, /fits none of the types above, do not force/);
});

test("proposed-type regions come back as type other with proposed_type, never as an unknown type", () => {
  const pending = pendingRecord([surveyType("colophon")]);
  const parsed = { new_types: [{ name: "Sarga Title", definition: "The title of a canto.", region_class: "heading" },
    { name: "unused", definition: "Never used.", region_class: "paragraph" }],
  regions: [box(0, { type: "colophon" }), box(200, { type: "other", proposed_type: "sarga-title" }), box(400, { type: "other", proposed_type: "Colophon" }),
    box(600, { type: "other", proposed_type: "PARAGRAPH" }), box(800, { type: "other", proposed_type: "ghost" }), box(850, { type: "paragraph" })] };
  const out = scaleProposingRegions(parsed, 1000, 2000, types, pending);
  assert.deepEqual(out.regions.map(region => [region.type, region.proposed_type, region.region_class]), [
    ["other", "colophon", "paragraph"], ["other", "Sarga_Title", "heading"], ["other", "colophon", "paragraph"],
    ["paragraph", undefined, "paragraph"], ["other", "ghost", "other"], ["paragraph", undefined, "paragraph"]]);
  assert.deepEqual(out.proposals.map(type => [type.name, type.pending, type.regions, type.definition]), [["colophon", true, [1, 3], "A colophon."],
    ["Sarga_Title", false, [2], "The title of a canto."], ["ghost", false, [5], ""]]);
  assert.ok(out.warnings.some(text => /unused is not used/.test(text)));
  assert.ok(out.warnings.some(text => /ghost/.test(text)));
  assert.throws(() => scaleProposingRegions({ regions: [] }, 10, 10, types, null), /new_types and regions/);
  assert.throws(() => scaleProposingRegions({ new_types: [{ name: "x", definition: "", region_class: "other" }], regions: [] }, 10, 10, types, null), /Invalid new type/);
  assert.throws(() => scaleProposingRegions({ new_types: [], regions: [box(0, { type: "colophon" })] }, 10, 10, types, null), /Invalid fields or type/);
});

test("names match without case and separators, and a match merges evidence into the pending proposal", async () => {
  assert.equal(normalizeTypeName("Sarga-Title"), normalizeTypeName("sarga_title"));
  assert.equal(normalizeTypeName("sarga title"), "sargatitle");
  assert.equal(typeNameStyle(" sarga title: "), "sarga_title");
  const store = memoryStore();
  await addPendingProposals(store, [surveyType("colophon")]);
  const record = (page, proposals, call) => ({ page, profile: finderById("terra-proposals"), made_at_utc: `t-${page}`, region_call: { path: call },
    type_proposals: proposals, regions: [] });
  await recordFinderProposals(store, record("p1", [{ name: "Colophon", definition: "x", region_class: "paragraph", pending: false, regions: [2] },
    { name: "sarga_title", definition: "The title of a canto.", region_class: "heading", furniture: false, pending: false, regions: [1] }], "c1"), { pdfPage: 95 });
  await recordFinderProposals(store, record("p2", [{ name: "Sarga-Title", definition: "Another wording.", region_class: "heading", pending: false, regions: [4] }], "c2"));
  await recordFinderProposals(store, record("p2", [{ name: "Sarga-Title", definition: "Another wording.", region_class: "heading", pending: false, regions: [4] }], "c2"));
  const items = pendingItems(await readPendingProposals(store), "new_type");
  assert.equal(items.length, 2);
  assert.deepEqual(items[0].evidence.map(value => [value.page, value.pdf_page, value.regions]), [["p1", 95, [2]]]);
  assert.equal(items[0].proposal.aliases[0], "Colophon");
  assert.equal(items[1].source.kind, "finder"); assert.equal(items[1].source.method, "097-terra-regions-proposing-types");
  assert.equal(items[1].proposal.description, "The title of a canto.");
  assert.deepEqual(items[1].evidence.map(value => value.page), ["p1", "p2"]);
  assert.deepEqual(items[1].proposal.aliases, ["Sarga-Title"]);
  await decideProposal(store, items[1].id, { status: "dismissed" });
  await recordFinderProposals(store, record("p3", [{ name: "sarga title", definition: "", region_class: "heading", pending: false, regions: [1] }], "c3"));
  const after = await readPendingProposals(store);
  assert.equal(pendingItems(after, "new_type").length, 1, "a dismissed name is not reopened");
  assert.deepEqual(after.items[1].evidence.map(value => value.page), ["p1", "p2", "p3"]);
});

function memoryStore() {
  const records = new Map();
  return { records, readWork: async path => structuredClone(records.get(path) ?? null),
    writeWork: async (path, value) => { records.set(path, structuredClone(value)); },
    updateWork: async (path, update) => { const value = await update(structuredClone(records.get(path) ?? null)); records.set(path, structuredClone(value)); return value; } };
}

const nativeFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => String(url).startsWith("file:") ? new Response(readFileSync(new URL(String(url)))) : nativeFetch(url, options);
const polygon = y => [[[0, y], [100, y], [100, y + 20], [0, y + 20]]];
function fixture(responses) {
  const files = new Map(), calls = [];
  const manifest = { format: "book-folder", book_id: "trial", title: "Trial", types: "types.json", pages: [
    { id: "p1", pdf_page: 1, document: "pages/p1.json" }, { id: "p2", pdf_page: 2, document: "pages/p2.json" }, { id: "p3", pdf_page: 3, document: "pages/p3.json" }] };
  const book = new Book("folder", { name: "test" }, manifest, structuredClone(types));
  book.readJson = async path => files.has(path) ? JSON.parse(files.get(path)) : null;
  book.writeFile = async (path, data) => { files.set(path, data); };
  book.removeFile = async path => { files.delete(path); };
  book.draft = async () => null;
  book.model = async pid => book.models.get(pid) || null;
  book.clearDraft = async () => {};
  book.imageBlob = async pid => new Blob([`image ${pid}`], { type: "image/png" });
  book.getReaderOptions = async () => ({ finder: "terra-proposals" });
  const request = async (provider, payload) => {
    calls.push(payload);
    const parsed = responses.shift();
    return { body: { status: "completed", model: "gpt-6.1-terra", id: `resp-${calls.length}`, usage: { input_tokens: 100, output_tokens: 20 },
      output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(parsed) }] }] }, seconds: 1 };
  };
  globalThis.createImageBitmap = async () => ({ width: 100, height: 1000, close() {} });
  const maker = new Maker(book, { keys: { openai: "test-key" }, request, check: doc => checkPage(validate, doc, book.types),
    outlines: async (pid, url, boxes) => ({ geometry: boxes.map(b => ({ rings: polygon(b[1]), lines: [{ line_id: Math.round(b[1]), rings: polygon(b[1]) }] })),
      charH: 15, angle: 0, method: "094-illumination-flattened-ink" }) });
  return { book, maker, calls, files };
}

test("a run's later pages see proposals made by earlier pages; Add, rename and same-as assign waiting regions on unprotected pages only", async () => {
  const responses = [
    { new_types: [{ name: "sarga colophon", definition: "The closing line of a canto.", region_class: "paragraph" }],
      regions: [box(0), box(300, { type: "other", proposed_type: "sarga colophon", reading_order: 2 })] },
    { new_types: [], regions: [box(0), box(300, { type: "sarga_colophon", reading_order: 2 })] },
    { new_types: [{ name: "Sarga-Colophon", definition: "Again.", region_class: "paragraph" }, { name: "plate", definition: "A plate.", region_class: "figure" }],
      regions: [box(0, { type: "other", proposed_type: "Sarga-Colophon" }), box(300, { type: "other", proposed_type: "plate", reading_order: 2 })] },
  ];
  const { book, maker, calls } = fixture(responses);
  for (const pid of ["p1", "p2"]) await maker.findRegions(pid);
  assert.doesNotMatch(calls[0].input[0].content[0].text, /not yet accepted/);
  assert.match(calls[1].input[0].content[0].text, /- sarga_colophon \(printed as paragraph\): The closing line of a canto\./, "page 2's request carries page 1's proposal");
  assert.deepEqual(calls[1].text.format.schema.properties.regions.items.properties.type.enum, ["paragraph", "page_number", "other", "sarga_colophon"]);
  for (const pid of ["p1", "p2"]) {
    const doc = await book.current(pid);
    assert.deepEqual(doc.page.regions.map(region => region.type), ["paragraph"]);
    assert.deepEqual(doc.source.omitted_regions.map(region => [region.type, region.proposed_type]), [["other", "sarga_colophon"]]);
    assert.deepEqual(validate(doc), []);
  }
  // Page 3 is moved on (protected) before its regions are found again.
  await maker.findRegions("p3");
  let record = await readPendingProposals(book);
  const [colophon, plate] = pendingItems(record, "new_type");
  assert.equal(pendingItems(record, "new_type").length, 2);
  assert.deepEqual(colophon.evidence.map(value => value.page), ["p1", "p2", "p3"]);
  await movePage(book, "p3", "regions", true, doc => checkPage(validate, doc, book.types));
  assert.ok(isProtected(await book.current("p3"), "regions"));
  // Add the proposal under another name: the type list changes, the decision is recorded, waiting regions get the type.
  book.types.types.closing = { description: "The closing line of a canto.", region: "paragraph", flow: "main" };
  await decideProposal(book, colophon.id, { status: "added", as: "closing" });
  record = await readPendingProposals(book);
  const assignments = proposalAssignments(record, book.types);
  assert.equal(assignments.get("sargacolophon"), "closing");
  const results = {};
  for (const pid of ["p1", "p2", "p3"]) results[pid] = await maker.assignProposedRegions(pid, assignments);
  assert.deepEqual(results, { p1: "assigned", p2: "assigned", p3: "protected" });
  for (const pid of ["p1", "p2"]) {
    const doc = await book.current(pid);
    assert.deepEqual(doc.page.regions.map(region => [region.type, region.source.proposed_type]), [["paragraph", undefined], ["closing", "sarga_colophon"]]);
    assert.deepEqual(doc.source.omitted_regions, []);
    assert.ok(doc.units.some(unit => unit.type === "closing"));
  }
  const waiting = waitingRegions(await book.current("p3"), new Set(assignments.keys()));
  assert.deepEqual(waiting.map(region => region.proposed_type), ["sarga_colophon"], "a new name matching a pending one is that proposal");
  // Same as an existing type: the plate's regions become paragraphs where the page is not protected.
  await decideProposal(book, plate.id, { status: "dismissed", same_as: "paragraph" });
  assert.equal(proposalAssignments(await readPendingProposals(book), book.types).get("plate"), "paragraph");
  // A finder result reused later resolves added names when the page is rebuilt.
  responses.push({ new_types: [], regions: [box(0, { type: "other", proposed_type: "sarga colophon" })] });
  await maker.findRegions("p1");
  assert.deepEqual((await book.current("p1")).page.regions.map(region => region.type), ["closing"]);
  assert.equal(pendingItems(await readPendingProposals(book), "new_type").length, 0, "an added name is not proposed again");
});

test("a page rebuilt for a second added type keeps the first one", async () => {
  const { book, maker } = fixture([{ new_types: [{ name: "colophon", definition: "A closing line.", region_class: "paragraph" },
    { name: "marker", definition: "A verse-group marker.", region_class: "note" }],
  regions: [box(0, { type: "other", proposed_type: "colophon" }), box(300, { type: "other", proposed_type: "marker", reading_order: 2 })] }]);
  await maker.findRegions("p1");
  const [colophon, marker] = pendingItems(await readPendingProposals(book), "new_type");
  for (const [item, type] of [[colophon, "colophon"], [marker, "marker_label"]]) {
    book.types.types[type] = { description: "x", region: "paragraph", flow: "main" };
    await decideProposal(book, item.id, { status: "added", as: type });
    assert.equal(await maker.assignProposedRegions("p1", proposalAssignments(await readPendingProposals(book), book.types)), "assigned");
  }
  const doc = await book.current("p1");
  assert.deepEqual(doc.page.regions.map(region => region.type), ["colophon", "marker_label"]);
  assert.deepEqual(doc.source.omitted_regions, []);
});

test("finder proposals persist through the work files and a .chaya.pdf round trip", async () => {
  const files = new Map(Object.entries({ "book.json": { format: "book-folder", book_id: "trial", title: "Trial", types: "types.json", pages: [] }, "types.json": types }));
  const open = () => {
    const book = new Book("folder", { name: "trial", async getDirectoryHandle() { throw new DOMException("Missing", "NotFoundError"); } },
      structuredClone(files.get("book.json")), structuredClone(files.get("types.json")), { browser: true });
    book.readJson = async path => structuredClone(files.get(path) ?? null);
    book.writeFile = async (path, text) => { files.set(path, JSON.parse(text)); };
    book.removeFile = async path => { files.delete(path); };
    return book;
  };
  const book = open();
  await recordFinderProposals(book, { page: "p9", profile: finderById("terra-proposals"), made_at_utc: "t", region_call: { path: "work/reader-calls/p9/regions-1.json" },
    type_proposals: [{ name: "plate", definition: "A plate.", region_class: "figure", furniture: false, pending: false, regions: [3] }], regions: [] }, { pdfPage: 12 });
  const reopened = open(), record = await readPendingProposals(reopened);
  assert.equal(record.items[0].source.pdf_page, 12);
  const exported = await reopened.chayaFiles();
  assert.deepEqual(exported[PENDING_PATH], record);
  const objs = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 300] >>"];
  let pdf = "%PDF-1.4\n"; const offs = [];
  objs.forEach((o, i) => { offs.push(pdf.length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const x = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f\r\n` + offs.map(o => `${String(o).padStart(10, "0")} 00000 n\r\n`).join("") + `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF\n`;
  const bytes = await writeChaya(new TextEncoder().encode(pdf), { format: "chaya-book", version: 1, saved_by: "test", files: exported });
  const { data } = await readChaya(bytes);
  const opened = new Book("chaya", "trial.chaya.pdf", data.files["book.json"], data.files["types.json"], { files: data.files, pdfBytes: bytes });
  assert.deepEqual(await readPendingProposals(opened), record);
});
