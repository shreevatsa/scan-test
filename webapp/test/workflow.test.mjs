import { test } from "node:test";
import assert from "node:assert/strict";
import { pageStages, hasReading, workflowRoute, workflowAddress, eligible, readingGaps, readingDocuments, movePage, reviewPageStates, stageFlags, currentStage, nextProcessingStage, pageCheck, nextPageToCheck, processingForm } from "../js/workflow.js";
import { accept, layerState } from "../js/layers.js";
import { runBatch } from "../js/pipeline/batch.js";
import { CredentialChecks } from "../js/key-check.js";
import { Book, idb } from "../js/store.js";
import { writeChaya, sha256hex } from "../js/chayapdf.js";
import { assemble } from "../js/assemble.js";

const types = { types: { paragraph: { region: "paragraph", flow: "main" } } };
const page = (id = "p1") => ({ page: { id, regions: [{ id: "r1", type: "paragraph", lines: [{ line: 1, polygons: [[[0, 0], [10, 0], [10, 10]]], text: "Printed" }] }] },
  units: [{ id: "u1", type: "paragraph", children: [{ region: `${id}#r1` }], open: { start: true, end: true } }],
  source: { layers: { regions: { state: "model", types_revision: 1 }, text: { state: "model", types_revision: 1 }, units: { state: "provisional", types_revision: 1 } } } });

test("processing uses valid input without review marks and Read can show partial text", () => {
  const empty = pageStages(null, types);
  assert.equal(eligible("text", empty), false);
  assert.equal(eligible("read", empty), false);
  const doc = page(), unreviewed = pageStages(doc, types);
  assert.equal(eligible("text", unreviewed), true);
  assert.equal(eligible("read", unreviewed), true);
  assert.equal(hasReading(doc, types), true);
  const partial = structuredClone(doc);
  partial.page.regions[0].lines.push({ line: 2, polygons: doc.page.regions[0].lines[0].polygons });
  assert.equal(hasReading(partial, types), true);
  assert.equal(eligible("read", pageStages(partial, types)), false);
  assert.equal(eligible("text", pageStages(doc, types, ["Invalid draft"])), false);
  delete doc.source.layers;
  assert.equal(eligible("read", pageStages(doc, types)), true);
  delete doc.page.regions[0].lines[0].text;
  assert.equal(hasReading(doc, types), false);
  doc.page.regions = [];
  assert.equal(hasReading(doc, types), true, "a blank page can be joined across");
});

test("old bookmarks reach the three tabs and the book settings", () => {
  const cases = { pages: ["pages", "grid"], regions: ["settings", "settings"], "regions&view=types": ["settings", "settings"],
    "regions&view=proposal": ["settings", "settings"], "regions&view=compare": ["settings", "settings"],
    "text&view=compare": ["settings", "settings"], "read&view=pages": ["pages", "grid"], "read&view=compare": ["settings", "settings"],
    "read&view=problems": ["pages", "grid"], "read&view=style": ["export", "style"], read: ["read", "read"], export: ["export", "export"],
    types: ["settings", "settings"], "types&view=proposal": ["settings", "settings"], readers: ["settings", "settings"], structures: ["settings", "settings"],
    check: ["pages", "grid"], style: ["export", "style"], "p=p1": ["page", "page"], "page&p=p1": ["page", "page"] };
  for (const [hash, expected] of Object.entries(cases)) {
    const out = workflowRoute(`#${hash}`);
    assert.deepEqual([out.stage, out.mode], expected, hash);
  }
  const specific = workflowRoute(workflowAddress("text", "p 1", { region: "r1" }));
  assert.equal(specific.pid, "p 1");
  assert.equal(specific.region, "r1");
  assert.equal(workflowAddress("types"), "#settings&view=types");
  assert.equal(workflowRoute("#types&view=proposal").view, "proposal");
  // A page in a stage's grid keeps its view: only an address with no view opens the page editor.
  assert.deepEqual([workflowRoute("#read&view=pages&p=p1").mode, workflowRoute("#regions&view=types&p=p1").mode], ["grid", "settings"]);
});

test("there is one page editor: every address with a page opens it, the old stage addresses too", () => {
  assert.equal(workflowAddress("page", "p 1", { region: "r1" }), "#page&p=p%201&r=r1");
  for (const stage of ["page", "pages", "regions", "text", "read"]) assert.equal(workflowAddress(stage, "p1"), "#page&p=p1", stage);
  assert.equal(workflowAddress("regions"), "#settings");
  // Saved links from the three page editors still open the page, in the one editor, with their selection.
  for (const old of ["regions", "text", "read", "pages"]) {
    const out = workflowRoute(`#${old}&p=p1&u=u2`);
    assert.deepEqual([out.stage, out.mode, out.pid, out.unit], ["page", "page", "p1", "u2"], old);
  }
  for (const hash of ["#read&p=p1", "#text&p=p1", "#page&p=p1"]) assert.equal(workflowRoute(hash).mode, "page");
});

test("reading gaps are named and units never join across pages awaiting transcription", () => {
  const pages = ["p1", "p2", "p3", "p4"].map(id => ({ id }));
  const docs = [page("p1"), page("p3")], snapshot = structuredClone(docs);
  assert.deepEqual(readingGaps(pages, new Set(["p1", "p3"])), ["Page 2", "Page 4"]);
  assert.deepEqual(readingGaps(pages, new Set(["p1"])), ["Pages 2–4"]);
  const out = readingDocuments(pages, docs);
  assert.deepEqual(out, [docs[0], null, docs[1], null], "the pages in order, a gap where a page is not transcribed");
  const [book, warnings] = assemble(out.map(doc => doc && { ...doc, flows: { main: ["u1"] } }), { flows: { main: "Main" }, ...types });
  assert.deepEqual(warnings, [], "a gap is like the end of the book before it and its start after it");
  assert.deepEqual(book.units.map(unit => unit.id), ["p1#u1", "p3#u1"], "nothing joins across it");
  assert.deepEqual(book.pages.map(page => page.id), ["p1", "p3"]);
  assert.deepEqual(docs, snapshot);
});

test("page states expose revision, suggestions and draft errors without flagging expected pending text", () => {
  const doc = page();
  delete doc.source.layers.text;
  delete doc.page.regions[0].lines[0].text;
  let state = pageStages(doc, types);
  assert.equal(state.missing, 1);
  assert.deepEqual(state.flags, []);
  doc.source.suggestions = { text: "work/reading.json" };
  state = pageStages(doc, { ...types, source: { revision: 2 } }, ["Invalid draft"]);
  assert.equal(state.earlier, true);
  assert.equal(state.suggestion, true);
  assert.equal(state.valid, false);
});

test("a batch stops between calls for spending, unknown cost and a requested stop", async () => {
  for (const condition of ["spend", "unknown", "stop", "persistence"]) {
    let stop = false;
    const maker = { jobs: new Map(), onCost() {}, async read() {
      this.onCost(condition === "unknown" ? null : 0.2);
      if (condition === "persistence") this.persistenceFailure = "Disk full";
      stop = true;
      return {};
    } };
    const out = await runBatch({ maker, ids: ["p1", "p2"], stage: "text", limit: condition === "spend" ? 0.1 : 5, stopped: () => condition === "stop" && stop });
    assert.equal(out.processed, 1);
    assert.equal(out.paused, true);
  }
});

test("Process pages finds boxes first, respects the shared budget and resumes with transcription", async () => {
  const docs = new Map(), calls = [];
  const stageOf = id => nextProcessingStage(pageStages(docs.get(id), types));
  const maker = { jobs: new Map(), onCost() {},
    async findRegions(id) {
      calls.push(["boxes", id]);
      const outlined = page(id);
      delete outlined.page.regions[0].lines[0].text;
      docs.set(id, outlined);
      this.onCost(0.2);
      return {};
    },
    async read(id) {
      calls.push(["text", id]);
      docs.set(id, page(id));
      this.onCost(0.2);
      return {};
    },
  };
  const paused = await runBatch({ maker, ids: ["p1","p2"], stage: "pages", stageOf, limit: 0.1 });
  assert.equal(paused.paused, true);
  assert.deepEqual(calls, [["boxes","p1"]]);
  assert.equal(stageOf("p1"), "text");
  const resumed = await runBatch({ maker, ids: ["p1","p2"], stage: "pages", stageOf, limit: 1 });
  assert.equal(resumed.paused, false);
  assert.deepEqual(calls, [["boxes","p1"],["text","p1"],["boxes","p2"],["text","p2"]]);
  assert.equal(stageOf("p2"), null);
});

test("credential checks use small content-free requests and preserve provider errors", async () => {
  for (const provider of ["openai", "gemini", "vision"]) {
    const keys = { [provider]: "fixture-secret", vision_auth: "oauth", vision_project: "quota-project" };
    const requests = [];
    const profile = { provider, model: provider === "vision" ? "DOCUMENT_TEXT_DETECTION" : "test-model" };
    const checks = new CredentialChecks(keys, async (...args) => {
      requests.push(args);
      return { body: provider === "vision" ? { responses: [{}] } : provider === "openai" ?
        { output: [{ type: "message", content: [{ type: "output_text", text: "OK" }] }] } : { outputs: [{ type: "text", text: "OK" }] } };
    });
    assert.equal(checks.status(profile), undefined);
    assert.equal((await checks.check(profile)).valid, true);
    assert.equal(checks.status(profile).valid, true);
    assert.equal(JSON.stringify(requests[0][1]).includes("Printed"), false);
    if (provider === "vision") assert.deepEqual(requests[0][3], { mode: "oauth", project: "quota-project" });
    keys[provider] = "new-secret";
    if (provider === "vision") assert.equal(checks.status(profile)?.valid, true, "a refreshed OAuth token is the same credential");
    else assert.equal(checks.status(profile), undefined);
    checks.request = async () => { throw Error("Provider rejected new-secret"); };
    assert.equal((await checks.check(profile)).message, "Provider rejected [redacted]");
  }
});

test("stale credential checks never validate a changed key or quota project", async () => {
  const keys = { gemini: "old" };
  let release;
  const checks = new CredentialChecks(keys, () => new Promise(resolve => { release = resolve; }));
  const profile = { provider: "gemini", model: "test" };
  const checking = checks.check(profile);
  keys.gemini = "new";
  release({ body: { outputs: [{ type: "text", text: "OK" }] } });
  await checking;
  assert.equal(checks.status(profile), undefined);
  assert.equal(checks.status({ provider: "local" }).valid, true);
  const vision = new CredentialChecks({ vision: "token" }, async () => ({ body: { responses: [{ error: { message: "Billing disabled" } }] } }));
  assert.deepEqual(await vision.check({ provider: "vision", model: "TEXT_DETECTION" }), { valid: false, message: "Billing disabled" });
});

test("checking Gemini leaves Cloud Vision unchecked and rejected OCR credentials keep a comparison unready", async () => {
  const gemini = { provider: "gemini", model: "test", label: "Gemini" };
  const vision = { provider: "vision", model: "TEXT_DETECTION", label: "Cloud Vision" };
  const keys = { gemini: "gemini-secret", vision: "rejected-secret" }, calls = [];
  const checks = new CredentialChecks(keys, async (provider, payload, key) => {
    calls.push({ provider, key, payload });
    if (provider === "vision" && key === "rejected-secret") throw Error("API key not valid");
    return { body: provider === "vision" ? { responses: [{}] } : { outputs: [{ type: "text", text: "OK" }] } };
  });
  await checks.group([gemini]).check();
  assert.equal(checks.status(vision), undefined);
  const selected = checks.group([gemini, vision]);
  assert.equal(selected.status(), undefined);
  assert.equal((await selected.check()).valid, false);
  assert.match(selected.status().message, /Cloud Vision.*API key not valid/);
  assert.deepEqual(calls.map(call => call.provider), ["gemini", "gemini", "vision"]);
  assert.equal(calls[2].payload.requests[0].features[0].type, "TEXT_DETECTION");
  keys.vision = "working-secret";
  assert.equal(selected.status(), undefined);
  assert.equal((await selected.check()).valid, true);
  assert.equal(calls.length, 5);
  await checks.group([gemini, gemini]).check();
  assert.equal(calls.length, 6, "an explicit recheck sends a fresh test, once per distinct model");
  keys.vision_auth = "oauth";
  assert.equal(selected.status(), undefined);
});

test("credential checks use the chosen OpenAI model's supported reasoning setting", async () => {
  const requests = [];
  const checks = new CredentialChecks({ openai: "fixture" }, async (provider, payload) => {
    requests.push(payload);
    return { body: { output: [{ type: "message", content: [{ type: "output_text", text: "OK" }] }] } };
  });
  await checks.check({ provider: "openai", model: "gpt-6-astra", reasoning: "low" });
  assert.deepEqual(requests[0].reasoning, { effort: "low" });
  assert.equal(requests[0].max_output_tokens, 256);
  await checks.check({ provider: "openai", model: "gpt-6.1-terra", reasoning: "none" });
  assert.deepEqual(requests[1].reasoning, { effort: "none" });
  assert.equal(requests[1].max_output_tokens, 64);
});

test("acceptance and sending back persist in edits, folder stages and a book PDF round trip", async () => {
  const originals = { ...idb }, values = new Map();
  const key = (store, id) => JSON.stringify([store, id]);
  idb.get = async (store, id) => values.get(key(store, id));
  idb.put = async (store, id, value) => values.set(key(store, id), structuredClone(value));
  idb.del = async (store, id) => values.delete(key(store, id));
  idb.keys = async () => [];
  try {
    const doc = page(), manifest = { format: "book-folder", book_id: "workflow", types: "types.json", pages: [{ id: "p1", document: "pages/p1.json" }] };
    const embedded = { "book.json": manifest, "types.json": types, "pages/p1.json": doc };
    const readonly = new Book("chaya", "workflow", manifest, types, { files: embedded });
    await movePage(readonly, "p1", "regions", true, () => [[], []]);
    assert.equal(layerState(await readonly.current("p1"), "regions").accepted, true);
    await movePage(readonly, "p1", "text", true, () => [[], []]);
    await movePage(readonly, "p1", "regions", false, () => [[], []]);
    assert.equal(layerState(await readonly.current("p1"), "regions").accepted, false);
    const files = await readonly.chayaFiles();
    // The PDF helper accepts a minimal classic cross-reference PDF.
    const original = new TextEncoder().encode("%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\nxref\n0 3\n0000000000 65535 f\n0000000009 00000 n\n0000000058 00000 n\ntrailer\n<< /Size 3 /Root 1 0 R >>\nstartxref\n110\n%%EOF\n");
    const bytes = await writeChaya(original, { format: "chaya-book", version: 1, original: { name: "source.pdf", length: original.length, sha256: await sha256hex(original) }, files });
    const reopened = await Book.openChaya(bytes, "workflow-reopened");
    assert.equal(layerState(await reopened.current("p1"), "regions").accepted, false);
    assert.equal(layerState(await reopened.current("p1"), "text").accepted, true);
    const folderFiles = new Map([["pages/p1.json", doc]]);
    const folder = new Book("folder", { name: "workflow" }, structuredClone(manifest), types);
    folder.readJson = async path => structuredClone(folderFiles.get(path) || null);
    folder.writeFile = async (path, text) => folderFiles.set(path, JSON.parse(text));
    folder.removeFile = async path => folderFiles.delete(path);
    folder.models.set("p1", doc);
    await movePage(folder, "p1", "regions", true, () => [[], []]);
    folder.models.clear();
    folder.model = async pid => folderFiles.get(`pages/${pid}.json`);
    assert.equal(layerState(await folder.current("p1"), "regions").accepted, true);
    await assert.rejects(movePage(folder, "p1", "text", true, () => [["Invalid page"], []]), /Invalid page/);
  } finally { Object.assign(idb, originals); }
});

test("Pages collects review flags and processing follows the available input", () => {
  const types = { types: { paragraph: { region: "paragraph", flow: "main" }, heading: { region: "heading", flow: "main" } } };
  const uncertain = id => {
    const doc = page(id);
    doc.page.regions[0].source = { uncertain: true, transcription: { uncertain: true } };
    return doc;
  };
  const docs = { p1: uncertain("p1"), p2: uncertain("p2"), p3: uncertain("p3") };
  delete docs.p2.page.regions[0].lines[0].text;
  docs.p3.page.regions[0].type = "heading";
  const pages = ["p1", "p2", "p3"].map(id => ({ id }));
  const states = new Map(pages.map(({ id }) => [id, { ...pageStages(docs[id], types), runErrors: {} }]));
  reviewPageStates(pages, states, types);
  assert.deepEqual(["p1", "p2", "p3"].map(id => currentStage(states.get(id))), ["read", "text", "read"]);
  assert.equal(currentStage(pageStages(null, types)), "regions");
  assert.match(stageFlags(states.get("p1"), "pages")[0], /uncertain type or boundary/);
  assert.ok(stageFlags(states.get("p2"), "pages").some(flag => /uncertain transcription/.test(flag)));
  assert.ok(stageFlags(states.get("p3"), "pages").some(flag => /uncertain completion/.test(flag)));
  assert.match(stageFlags(states.get("p3"), "regions")[0], /uncertain type or boundary/, "a stage still lists its own flags");
  assert.deepEqual(["p1", "p2", "p3"].map(id => states.get(id).rareLayout), [true, true, true]);
  assert.equal(states.get("p1").layout, "paragraph");
  assert.equal(states.get("p1").layoutFrequency, 2);
  assert.ok(["p1", "p2", "p3"].every(id => !states.get(id).regionFlags.some(flag => flag.code === "rare-layout")));
});

test("a page card shows one state: Checked, N to check with the first item, Not processed, or none when dimmed", () => {
  const checked = accept(accept(page("p2"), "regions"), "text");
  const states = new Map([
    ["p1", { ...pageStages(null, types), flags: [] }],
    ["p2", { ...pageStages(checked, types), flags: [] }],
    ["p3", { ...pageStages(page("p3"), types), flags: ["Possible missed line near the top.", "Two scan boxes overlap."] }],
    ["p4", { ...pageStages(page("p4"), types), flags: [] }],
    ["p5", { ...pageStages(checked, types), flags: ["Two scan boxes overlap."] }],
  ]);
  assert.deepEqual(pageCheck(states.get("p1")), { kind: "unprocessed", label: "Not processed", items: [] });
  assert.deepEqual(pageCheck(states.get("p2")), { kind: "checked", label: "Checked", items: [] });
  assert.equal(pageCheck(states.get("p3")).label, "2 to check");
  assert.equal(pageCheck(states.get("p3")).items[0], "Possible missed line near the top.");
  assert.deepEqual(pageCheck(states.get("p4")), { kind: "check", label: "To check", items: [] }, "processed and not yet marked checked");
  assert.equal(pageCheck(states.get("p5")).label, "1 to check", "a checked page with something new to check");
  assert.equal(pageCheck(states.get("p3"), true), null, "a dimmed page shows no state");
  const suggested = page("p6");
  suggested.source.suggestions = { text: {} };
  assert.equal(pageCheck({ ...pageStages(accept(suggested, "regions"), types), flags: [] }).label, "1 to check");
  const empty = page("p7");
  empty.page.regions = [];
  assert.equal(pageCheck({ ...pageStages(empty, types), flags: [] }).kind, "empty");

  // "Next page to check" follows the same rule: past checked, unprocessed and dimmed pages, round to the start.
  const pages = ["p1", "p2", "p3", "p4", "p5"].map(id => ({ id }));
  assert.equal(nextPageToCheck(pages, states, "p1"), "p3");
  assert.equal(nextPageToCheck(pages, states, "p3", id => id === "p4"), "p5");
  assert.equal(nextPageToCheck(pages, states, "p5"), "p3");
  assert.equal(nextPageToCheck(pages, new Map([["p1", states.get("p2")]]), "p1"), null);
});

test("the processing box is in full while pages wait or a run goes, and otherwise one line until opened", () => {
  assert.equal(processingForm({ waiting: 3 }), "full");
  assert.equal(processingForm({ waiting: 0, busy: true }), "full");
  assert.equal(processingForm({ waiting: 0 }), "line");
  assert.equal(processingForm({ waiting: 0, opened: true }), "full");
});
