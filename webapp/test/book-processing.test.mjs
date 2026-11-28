import { test } from "node:test";
import assert from "node:assert/strict";
import * as B from "../js/book.js";
import { findStructure } from "../js/book-structure.js";
import { checksFor } from "../js/bookchecks.js";
import { provisionalDocument } from "../js/pipeline/provisional.js";
import { applyReading } from "../js/pipeline/apply.js";
import { pagesToProcess, processingChoices, processBook, materializeProcessedPage, replaceProcessedPage } from "../js/book-processing.js";
import { verseExport } from "../js/verses.js";
import { bookText } from "../js/reader.js";

const box = [0.1, 0.1, 0.9, 0.2];
const region = (id, type, text, more = {}) => ({ id, type, box, lines: [{ text }], ...more });
const scan = (i, regions) => ({ pdf_page: i, size: [1000, 1600], ...(regions ? { regions } : {}) });

test("book rules materialize headings, printed numbers, page labels and note targets", () => {
  const draft = { chaya: 1, title: "An invented book", rules: { page_numbers: ["folio"] },
    flows: { main: "Text", notes: "Notes" },
    types: { chapter_heading: { heading: true, lines: true }, verse: { lines: true, numbered: true },
      footnote: { flow: "notes" }, folio: { ignored: true }, section: { contains: ["chapter_heading", "verse"] } },
    pages: [scan(1, [
      region("r1", "chapter_heading", "Opening"),
      region("r2", "verse", "", { style: { weight: "bold" }, lines: [{
        text: "A verse ॥ ४२ ॥", spans: [{ kind: "note_marker", start: 7, end: 7, marker: "1" }],
      }] }),
      region("n1", "footnote", "1. A footnote"),
      region("r3", "folio", "१३७"),
    ])] };
  const stored = findStructure(draft);
  assert.equal(stored.pages[0].label, "137");
  const verse = B.regionAt(stored, "1/r2");
  assert.equal(verse.number, "४२");
  assert.equal(verse.lines[0].spans[0].to, "1/n1");
  assert.equal(verse.in.length, 1);
  assert.equal(stored.containers[verse.in[0]].type, "section");
  assert.deepEqual(verse.style, { weight: "bold" });
  assert.equal(draft.pages[0].label, undefined);

  const view = B.assemble(stored);
  assert.deepEqual(verseExport(view.book, view.tl), []);
  const numbered = verseExport(view.book, view.tl, { pages: [{ id: "1", pdf_page: 1 }] }, { numberedFallback: true });
  assert.equal(numbered[0].key, "42");
  assert.deepEqual(numbered[0].parts.map(part => part.role), ["verse", "footnote"]);
});

test("replacing an edited page keeps matched structure and cannot redirect replaced IDs", () => {
  const initial = { chaya: 1, title: "An invented book", structure_edited: true, types: { paragraph: {} },
    pages: [scan(1, [region("r1", "paragraph", "First part", { continues: true })]),
      scan(2, [region("r1", "paragraph", "Last part", { label: "Edited" })]),
      scan(3, [region("r1", "paragraph", "New paragraph")])] };
  const replacement = { page: scan(2, [region("r1", "paragraph", "Different box", { box: [0.1, 0.5, 0.9, 0.6] })]), hints: {} };
  const cut = replaceProcessedPage(initial, 1, replacement).book;
  assert.equal(cut.pages[0].regions[0].continues, "open");
  assert.notEqual(cut.pages[1].regions[0].id, "r1");
  assert.equal(cut.pages[2], initial.pages[2]);
  assert.equal(initial.pages[0].regions[0].continues, true);

  const sameBox = { page: scan(2, [region("r1", "paragraph", "Read again")]), hints: {} };
  const kept = replaceProcessedPage(initial, 1, sameBox).book;
  assert.equal(kept.pages[0].regions[0].continues, true);
  assert.equal(kept.pages[1].regions[0].label, "Edited");
});

test("saved-only processing stops at missing work without rendering or calling a model", async () => {
  const book = { chaya: 1, title: "An invented book", types: { paragraph: {} },
    pages: [scan(1), { ...scan(2), skip: true }, scan(3, [])] };
  assert.deepEqual(pagesToProcess(book, "unprocessed"), [0]);
  assert.deepEqual(pagesToProcess(book, "range", 0, "1–3"), [0, 2]);
  assert.deepEqual(pagesToProcess(book, "all"), [0, 2]);
  assert.equal(pagesToProcess(book, "page", 1).length, 0);
  assert.deepEqual(pagesToProcess(book, "unprocessed", 0, "", true), []);
  let requests = 0;
  const result = await processBook({
    async readWork() { return null; }, async workArchive() { return null; },
  }, book, [0], {
    choices: processingChoices(book), savedOnly: true, limit: 0, signal: new AbortController().signal,
    async change() { throw new Error("Unexpected page change"); },
    async request() { requests++; throw new Error("Unexpected API call"); },
  });
  assert.equal(result.completed, 0);
  assert.equal(requests, 0);
  assert.match(result.errors[0].message, /matching saved finder and reader/);
});

test("restoring saved text fills matching gaps and keeps earlier edits and reading order", async () => {
  const lines = [{ text: "Already edited" }, {}];
  const book = { chaya: 1, title: "An invented book", types: { paragraph: {}, unclassified: { lines: true } },
    pages: [scan(1, [
      region("r3", "paragraph", "", { ignored: true, lines: [] }),
      region("r1", "paragraph", "", { number: "8", lines }),
      region("r2", "unclassified", "", { proposed: "byline", lines: [] }),
      region("r4", "unclassified", ""),
      region("r5", "unclassified", "", { lines: [], box: [0.1, 0.5, 0.9, 0.6] }),
    ])] };
  const choices = processingChoices(book);
  const image_sha256 = "scan";
  const model_box = [10, 10, 90, 20], polygons = [[[10, 10], [90, 10], [90, 20], [10, 20]]];
  const layout = { width: 100, height: 100, image_sha256, profile: { id: choices.finder.id },
    regions: [1, 2, 3, 4, 5].map(region_id => ({ region_id, region_class: "paragraph", reading_order: region_id,
      status: "ok", model_box, polygons, lines: Array.from({ length: region_id < 3 ? 2 : 1 }, (_, i) => ({ line_id: i + 1, polygons })) })) };
  const reading = { image_sha256, regions_record: layout, parsed: {
    regions: layout.regions.map(item => ({ id: `r${item.region_id}`, uncertain: false, note: null,
      lines: item.lines.map(({ line_id: n }) => ({ n, text: `Saved ${n}` })) })),
  } };
  const changed = [];
  const session = { async readWork(path) { return path.includes("/readings/") ? reading : layout; } };
  const options = { choices, missingOnly: true, signal: new AbortController().signal,
    async change(value) { changed.push(value); },
    async request() { assert.fail("Restoring text must use saved records"); } };
  const result = await processBook(session, book, [0], options);
  assert.deepEqual(result.errors, []);
  assert.equal(result.restored, 2);
  assert.equal(result.spend, 0);
  assert.equal(changed.length, 1);
  const before = book.pages[0].regions, after = changed[0].pages[0].regions;
  assert.deepEqual(after.map(r => r.id), before.map(r => r.id));
  for (const i of [0, 3, 4]) assert.equal(after[i], before[i]);
  assert.equal(after[1].number, "8");
  assert.equal(after[1].lines[0], lines[0]);
  assert.equal(after[1].lines[1].text, "Saved 2");
  assert.equal(after[2].proposed, "byline");
  assert.deepEqual(after[2].lines.map(line => line.text), ["Saved 1", "Saved 2"]);
  assert.equal(B.assemble(changed[0]).regions["1#r2"].region.lines[0].end, "line");
  assert.deepEqual(pagesToProcess(book, "unprocessed", 0, "", true), [0]);
  assert.equal((await processBook(session, changed[0], [0], options)).restored, 0);
  assert.equal(changed.length, 1);
});

test("closing-line rules retain episodes when the book also has printed headings", () => {
  const book = { chaya: 1, title: "An invented book", types: {
    heading: { heading: true, lines: true, flow: "main" }, verse: { lines: true, flow: "main" },
    section_closing: { heading: true, lines: true, flow: "main" },
    section: { flow: "main", contains: ["heading", "verse", "section_closing", "section"] },
  }, pages: [scan(1, [
    region("h", "heading", "Opening"), region("v1", "verse", "Verse one ॥ १ ॥"),
    region("c1", "section_closing", "इति कथा ॥ १ ॥"), region("v2", "verse", "Verse two ॥ २ ॥"),
    region("c2", "section_closing", "इति आख्यानम् ॥ २ ॥"),
  ])] };
  const stored = findStructure(book);
  assert.equal(Object.values(stored.containers).filter(container => container.number != null).length, 2);
  assert.equal(B.regionAt(stored, "1/v1").in.length, 2);
});

test("a verse group marker read on the verse's last line becomes its own stored region", () => {
  const book = { chaya: 1, title: "An invented book",
    types: { verse: { lines: true }, verse_group_marker: { lines: true } },
    pages: [scan(1, [
      region("r1", "verse", "First verse ॥ १ ॥"),
      { id: "r2", type: "verse", box: [0.1, 0.25, 0.9, 0.4], lines: [
        { text: "Second verse ॥ २ ॥", box: [0.1, 0.25, 0.9, 0.31] },
        { text: "(युगलकम्)", box: [0.72, 0.35, 0.9, 0.4] },
      ] },
      region("r4", "?", "Unassigned area"),
    ])] };
  const output = findStructure(book), regions = output.pages[0].regions;
  assert.equal(regions.length, 4);
  const marker = regions.find(value => value.type === "verse_group_marker");
  assert.notEqual(marker.id, "r4");
  assert.equal(marker.lines[0].text, "(युगलकम्)");
  assert.equal(regions.find(value => value.id === "r2").lines.length, 1);
  const group = output.containers[marker.in[0]];
  assert.equal(group.type, "verse_group");
  assert.equal(group.label, "युगलकम्");
  assert.equal(B.assemble(output).book.units.filter(value => value.type === "verse").length, 2);
});

test("processing keeps proposals and printed lines for unclassified regions", () => {
  const types = { unclassified: { lines: true }, heading: { lines: true, heading: true },
    footnote: { flow: "notes" } };
  const tl = { types: { unclassified: { region: "paragraph" }, heading: { region: "heading" },
    footnote: { region: "note", flow: "notes" } } };
  const modelBox = [20, 40, 80, 90], rings = [[[20, 40], [80, 40], [80, 90], [20, 90]]];
  const item = (region_id, region_class, proposed_type) => ({ region_id, region_class, proposed_type,
    status: "ok", type: "other", model_box: modelBox, polygons: rings,
    lines: [{ line_id: 1, polygons: rings }, { line_id: 2, polygons: rings }] });
  const layout = { width: 100, height: 100, regions: [
    item(1, "note", "presentation_note"), item(2, "heading", "section_name"), item(3, "other"),
    { ...item(4, "heading"), type: "heading" },
  ] };
  const doc = provisionalDocument("1", { width: layout.width, height: layout.height }, tl, layout);
  const reading = { regions_record: layout, parsed: { regions: ["r1", "r2", "r3", "r4"].map(id => ({
    id, uncertain: false, note: null, lines: [{ n: 1, text: "First line" }, { n: 2, text: "Second line" }],
  })) } };
  const { page } = materializeProcessedPage(applyReading(doc, reading, tl, types), { pdf_page: 1 }, types, tl);
  assert.deepEqual(page.regions.map(r => [r.type, r.proposed]), [
    ["unclassified", "presentation_note"], ["unclassified", "section_name"], ["unclassified", undefined], ["heading", undefined],
  ]);
  for (const r of page.regions) assert.deepEqual(r.lines.map(line => line.text), ["First line", "Second line"]);
  const book = { chaya: 1, title: "Invented book", types, pages: [page] };
  assert.equal(B.assemble(book).regions["1#r1"].region.lines[0].end, "line");
  assert.deepEqual(checksFor(book)[0].map(check => check.title),
    ["May be a new type: presentation note", "May be a new type: section name", "Needs a type"]);
});

test("areas the finder gave no reading order go where they are printed, not after everything else", () => {
  const types = { unclassified: { lines: true }, paragraph: {} };
  const tl = { types: { unclassified: { region: "paragraph" }, paragraph: { region: "paragraph" } } };
  const at = (region_id, y, more) => ({ region_id, status: "ok", model_box: [10, y, 90, y + 5], polygons: [[[10, y], [90, y], [90, y + 5], [10, y + 5]]],
    lines: [{ line_id: 1, polygons: [[[10, y], [90, y], [90, y + 5], [10, y + 5]]] }], ...more });
  const layout = { width: 100, height: 100, regions: [
    at(1, 20, { type: "paragraph", reading_order: 1 }), at(2, 50, { type: "paragraph", reading_order: 2 }),
    at(3, 3, { type: "other", reading_order: null }), at(4, 94, { type: "other", reading_order: null }),
  ] };
  const doc = provisionalDocument("1", { width: 100, height: 100 }, tl, layout);
  const reading = { regions_record: layout, parsed: { regions: ["r1", "r2", "r3", "r4"].map(id => ({ id, uncertain: false, note: null, lines: [{ n: 1, text: id }] })) } };
  const { page } = materializeProcessedPage(applyReading(doc, reading, tl, types), { pdf_page: 1 }, types, tl);
  assert.deepEqual(page.regions.map(r => r.id), ["r3", "r1", "r2", "r4"]);
});

test("saved-only processing replays a page from the records it was made with, though the reader setting changed since", async () => {
  const book = { chaya: 1, title: "An invented book", types: { paragraph: {} }, pages: [scan(1, [region("r1", "paragraph", "Old")])] };
  const choices = processingChoices(book);
  const other = ["hydrogen-low-page", "argon-low", "flash-low"].find(id => id !== choices.reader.id);
  const image_sha256 = "scan", polygons = [[[10, 10], [90, 10], [90, 20], [10, 20]]];
  const layout = { width: 100, height: 160, image_sha256, profile: { id: choices.finder.id }, regions: [{ region_id: 1, type: "paragraph",
    region_class: "paragraph", reading_order: 1, status: "ok", model_box: [10, 10, 90, 20], polygons, lines: [{ line_id: 1, polygons }] }] };
  const reading = { image_sha256, profile: { id: other }, regions_record: layout,
    parsed: { regions: [{ id: "r1", uncertain: false, note: null, lines: [{ n: 1, text: "Saved by another reader" }] }] } };
  const files = { [`work/readings/1/${other}.json`]: reading, [`work/region-finders/1/${choices.finder.id}.json`]: layout };
  let requests = 0, changed = null;
  const result = await processBook({ async readWork(path) { return files[path] ?? null; }, async writeWork() {}, async workArchive() { return null; } },
    book, [0], { choices, savedOnly: true, limit: 0, signal: new AbortController().signal,
      async change(value) { changed = value; }, async request() { requests++; throw new Error("Unexpected API call"); } });
  assert.deepEqual(result.errors.map(error => error.message), []);
  assert.equal(requests, 0);
  assert.deepEqual(changed.pages[0].regions.map(r => r.lines.map(l => l.text)), [["Saved by another reader"]]);
});

test("prose that breaks off mid-sentence goes on in lowercase on the next page, past a footer, in the same section", () => {
  const at = (id, type, y, text) => ({ id, type, box: [0.1, y, 0.9, y + 0.05], lines: [{ text }] });
  const book = (first, second) => ({ chaya: 1, title: "An invented paper",
    types: { heading: { heading: true, lines: true }, paragraph: {}, unclassified: { lines: true }, section: { contains: ["heading", "paragraph"] } },
    pages: [scan(1, [at("r1", "heading", 0.1, "A Question"), at("r2", "paragraph", 0.3, first), at("r3", "unclassified", 0.95, "Journal 10:4")]),
      scan(2, [at("r1", "paragraph", 0.1, second), at("r2", "paragraph", 0.5, "Another paragraph.")])] });
  const found = findStructure(book("Our civilization has a considerable ability to", "pick up balls, but none to put them back."));
  assert.equal(B.regionAt(found, "1/r2").continues, true);
  assert.deepEqual(B.regionAt(found, "2/r1").in, B.regionAt(found, "1/r2").in);
  assert.deepEqual(B.regionAt(found, "1/r3").in, B.regionAt(found, "1/r2").in);
  assert.match(bookText(B.assemble(found)), /considerable ability to (\[[^\]]*\] )?pick up balls/);
  // A capital on the next page, or a sentence ended at the foot: two passages.
  for (const [first, second] of [["it has a considerable ability to", "Pick up balls."], ["It has a considerable ability.", "and more."]]) {
    const apart = findStructure(book(first, second));
    assert.notEqual(B.regionAt(apart, "1/r2").continues, true, `${first} | ${second}`);
  }
});
