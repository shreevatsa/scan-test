import { test } from "node:test";
import assert from "node:assert/strict";
import * as B from "../js/book.js";
import { findStructure } from "../js/book-structure.js";
import { pagesToProcess, processingChoices, processBook, replaceProcessedPage } from "../js/book-processing.js";
import { verseExport } from "../js/verses.js";

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
  assert.equal(pagesToProcess(book, "page", 1).length, 0);
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
