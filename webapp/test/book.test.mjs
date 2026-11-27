import { test } from "node:test";
import assert from "node:assert/strict";
import * as B from "../js/book.js";
import { bookText } from "../js/reader.js";
import { regionClasses, regionPrompt } from "../js/pipeline/prompts.js";

const box = [0.1, 0.1, 0.4, 0.3];
const block = (id, text, more = {}) => ({ id, type: "prose", box, lines: [{ text }], ...more });
function book() {
  return { chaya: 1, title: "An invented book",
    types: { prose: {}, speech: { lines: true }, part: { contains: ["section", "prose"] },
      section: { contains: ["prose", "section"] }, note: { flow: "notes" } },
    flows: { main: {}, notes: {} },
    pages: [{ id: "first", pdf_page: 1, regions: [block("r1", "First"), block("r2", "Second")] },
      { id: "second", pdf_page: 2, regions: [block("r1", "Third"), block("r2", "Fourth")] },
      { id: "third", pdf_page: 3 }],
  };
}

function freeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

test("region and page operations share unchanged objects and can be undone by taking the previous book", () => {
  const start = freeze(book()), stack = [start];
  const edit = fn => stack.push(fn(freeze(stack.at(-1))));
  assert.equal(B.pageIndexOf(start, "second"), 1);
  assert.equal(B.pageIndexOf(start, "2/r1"), 1);
  assert.equal(B.pageIndexOf(start, "4/r1"), -1);
  assert.equal(B.regionAt(start, "1/r2"), start.pages[0].regions[1]);
  assert.equal(B.newRegionId(start, "first"), "r3");
  edit(b => B.addRegion(b, "first", "prose", box));
  assert.equal(stack.at(-1).pages[1], start.pages[1]);
  assert.equal(B.regionAt(stack.at(-1), "1/r1"), B.regionAt(start, "1/r1"));
  edit(b => B.resizeRegion(b, "1/r3", [0, 0, 0.25, 0.5]));
  edit(b => B.moveRegion(b, "1/r3", 0.25, 0.25));
  assert.deepEqual(B.regionAt(stack.at(-1), "1/r3").box, [0.25, 0.25, 0.5, 0.75]);
  edit(b => B.retypeRegion(b, "1/r3", "speech"));
  edit(b => B.ignoreRegion(b, "1/r3"));
  assert.equal(B.regionAt(stack.at(-1), "1/r3").ignored, true);
  edit(b => B.restoreRegion(b, "1/r3"));
  edit(b => B.reorderRegion(b, "1/r3", 0));
  assert.equal(stack.at(-1).pages[0].regions[0].type, "speech");
  edit(b => B.deleteRegion(b, "1/r3"));
  assert.equal(B.regionAt(stack.at(-1), "1/r3"), undefined);
  edit(b => B.skipPage(b, 1));
  assert.equal(stack.at(-1).pages[1].skip, true);
  edit(b => B.unskipPage(b, 1));
  edit(b => B.setPageLabel(b, "second", 17));
  assert.equal(stack.at(-1).pages[1].label, "17");
  assert.equal(start.pages[1].label, undefined);
  assert.equal(stack.at(-1).pages[2], start.pages[2]);
  stack.splice(2);
  assert.deepEqual(B.regionAt(stack.at(-1), "1/r3").box, box);
  assert.equal(stack[0], start);
});

test("line edits preserve formatting and move line-based links with their source", () => {
  const initial = book(), region = initial.pages[0].regions[0];
  region.links = [{ type: "readings", line: 0, to: "2/r1" }];
  const start = freeze(initial);
  const inserted = B.addLine(start, "1/r1", 0);
  assert.equal(B.regionAt(inserted, "1/r1").links[0].line, 1);
  const edited = B.setLine(freeze(inserted), "1/r1", 0, "Some", [{ kind: "italic", start: 0, end: 4 }]);
  const ended = B.setLineEnd(freeze(edited), "1/r1", 0, "line");
  assert.deepEqual(B.regionAt(ended, "1/r1").lines[0], { text: "Some", end: "line", spans: [{ kind: "italic", start: 0, end: 4 }] });
  const removed = B.removeLine(freeze(ended), "1/r1", 1);
  assert.equal(B.regionAt(removed, "1/r1").links, undefined);
  assert.equal(region.links[0].line, 0);
  const deleted = B.deleteRegion(start, "2/r1");
  assert.equal(B.regionAt(deleted, "1/r1").links, undefined);
});

test("continuations, labels and numbers assemble from stored choices across pages", () => {
  const start = freeze(book());
  const joined = B.setContinues(start, "1/r2", true);
  assert.equal(joined.structure_edited, true);
  assert.equal(B.regionAt(joined, "1/r2").continues, true);
  assert.equal(B.regionAt(joined, "2/r1").from_previous, undefined);
  const labeled = B.setLabel(freeze(joined), "2/r1", "A shared label");
  const numbered = B.setNumber(freeze(labeled), "2/r1", 4);
  const unit = B.assemble(numbered).book.units.find(u => u.number === "4");
  assert.deepEqual(unit.children, [{ region: "first#r2" }, { region: "second#r1" }]);
  assert.equal(unit.label, "A shared label");
  const split = B.setContinues(freeze(numbered), "1/r2", false);
  assert.equal(B.regionAt(split, "2/r1").from_previous, undefined);
  assert.equal(B.assemble(split).book.units.find(u => u.label).children.length, 1);
  const open = B.setContinues(start, "2/r2", true);
  assert.deepEqual(B.assemble(open).book.units.at(-1).open, { end: true });
});

test("sections start, move across pages, retain the next section and can be removed", () => {
  const first = B.startSection(freeze(book()), "1/r1", "section");
  const second = B.startSection(freeze(first), "1/r2", "section");
  const third = B.startSection(freeze(second), "2/r2", "section");
  assert.deepEqual(third.pages.map(p => p.regions?.map(r => r.in)), [[["c1"], ["c2"]], [["c2"], ["c3"]], undefined]);
  assert.equal(B.startSection(third, "1/r2", "section"), third);
  const deeper = B.sectionDeeper(freeze(third), "c2");
  assert.deepEqual(B.regionAt(deeper, "2/r1").in, ["c1", "c2"]);
  assert.equal(deeper.pages[1].regions[1], third.pages[1].regions[1]);
  const labeled = B.setLabel(freeze(deeper), "c2", "The next section");
  const numbered = B.setNumber(freeze(labeled), "c2", "II");
  assert.equal(numbered.containers.c2.label, "The next section");
  assert.equal(numbered.containers.c2.number, "II");
  const up = B.sectionUp(freeze(numbered), "c2");
  assert.deepEqual(B.regionAt(up, "2/r1").in, ["c2"]);
  const removed = B.notSectionStart(freeze(up), "c2");
  assert.equal(removed.containers.c2, undefined);
  assert.equal(B.regionAt(removed, "1/r2").in, undefined);
  assert.equal(B.regionAt(removed, "2/r2"), third.pages[1].regions[1]);
});

test("outdenting a middle section keeps the later part of its old parent in reading order", () => {
  const start = book();
  start.containers = { c1: { type: "part", label: "Part" }, c2: { type: "section" } };
  start.pages[0].regions[0].in = ["c1"];
  start.pages[0].regions[1].in = ["c1", "c2"];
  start.pages[1].regions[0].in = ["c1", "c2"];
  start.pages[1].regions[1].in = ["c1"];
  const up = B.sectionUp(freeze(start), "c2");
  assert.deepEqual(up.pages.map(p => p.regions?.map(r => r.in)), [[["c1"], ["c2"]], [["c2"], ["c3"]], undefined]);
  assert.deepEqual(up.containers.c3, { type: "part", label: "Part" });
  assert.equal(B.assemble(up).book.flows.main.length, 3);
});

test("type edits update used names and keep the finder class separate from reading flags", () => {
  const start = book();
  start.reading = { finder_classes: { prose: "list_item" } };
  start.rules = { contents_types: ["prose"], headings: [{ heading: "prose", container: "section" }] };
  const added = B.addType(freeze(start), "caption", { description: "A caption" });
  const raised = B.setTypeFlags(freeze(added), "caption", { lines: true, heading: true });
  assert.deepEqual(raised.types.caption, { description: "A caption", lines: true, heading: true });
  const renamed = B.renameType(freeze(raised), "prose", "paragraph");
  assert.equal(B.regionAt(renamed, "2/r2").type, "paragraph");
  assert.equal(renamed.rules.headings[0].heading, "paragraph");
  assert.equal(renamed.types.section.contains[0], "paragraph");
  assert.equal(regionClasses(renamed).paragraph, "list_item");
  assert.match(regionPrompt(renamed, "<<TYPES>>"), /One region per entry/);
  assert.throws(() => B.deleteType(renamed, "paragraph"), /still in use/);
  const deleted = B.deleteType(freeze(renamed), "caption");
  assert.equal(deleted.types.caption, undefined);
  assert.equal(start.pages[0].regions[0].type, "prose");
});

test("starting a section inside a nested group keeps both halves in page order", () => {
  const start = book();
  start.containers = { c1: { type: "section" }, c2: { type: "part", label: "Nested" } };
  for (const page of start.pages.slice(0, 2)) for (const region of page.regions) region.in = ["c1", "c2"];
  const split = B.startSection(freeze(start), "2/r1", "section");
  assert.deepEqual(B.regionAt(split, "1/r2").in, ["c1", "c2"]);
  assert.deepEqual(B.regionAt(split, "2/r1").in, ["c3", "c4"]);
  assert.equal(split.containers.c4.label, "Nested");
  assert.equal(B.assemble(split).book.flows.main.length, 2);
});

test("unwrapping a top-level section retains the reading flow of its children", () => {
  const start = book();
  start.containers = { c1: { type: "section", flow: "notes" }, c2: { type: "part" } };
  start.pages[0].regions[0].in = ["c1", "c2"];
  start.pages[0].regions[1].in = ["c1"];
  const next = B.notSectionStart(freeze(start), "c1");
  assert.deepEqual(B.regionAt(next, "1/r1").in, ["c2"]);
  assert.equal(B.regionAt(next, "1/r2").flow, "notes");
  assert.equal(B.assemble(next).book.flows.notes.length, 2);
});

test("a section starts before a joined unit even when the later region is selected", () => {
  const start = B.setContinues(book(), "1/r2", true);
  const section = B.startSection(freeze(start), "2/r1", "section");
  assert.equal(B.regionAt(section, "1/r2").in[0], B.regionAt(section, "2/r1").in[0]);
  assert.equal(B.regionAt(section, "2/r1").from_previous, undefined);
  assert.deepEqual(B.assemble(section).book.units.find(unit => unit.children.length === 2 && unit.children[0].region)?.children,
    [{ region: "first#r2" }, { region: "second#r1" }]);
});

test("an open end and an unmatched start stay separate from neighboring text of the same type", () => {
  const start = book();
  start.pages[0].regions[1].continues = "open";
  start.pages[1].regions[0].from_previous = true;
  const separate = B.assemble(freeze(start)).book.units;
  assert.deepEqual(separate[1].open, { end: true });
  assert.deepEqual(separate[2].open, { start: true });
  const joined = B.setContinues(start, "1/r2", true);
  assert.equal(B.regionAt(joined, "2/r1").from_previous, undefined);
  assert.equal(B.assemble(joined).book.units[1].children.length, 2);
});

test("drawing an unclassified region adds its line-preserving type only when needed", () => {
  const start = freeze(book());
  assert.equal(B.addRegion(start, "second", "prose", box).types, start.types);
  let edited = B.addRegion(start, "second", "unclassified", box);
  const id = edited.pages[1].regions.at(-1).id;
  const address = `2/${id}`;
  assert.equal(B.regionAt(edited, address).type, "unclassified");
  assert.deepEqual(edited.types.unclassified, { lines: true, description: "No type chosen yet; its printed lines are kept." });
  edited = B.addLine(edited, address, 0, { text: "One printed line-" });
  edited = B.addLine(edited, address, 1, { text: "another printed line" });
  assert.equal(B.assemble(edited).tl.types.unclassified.region, "paragraph");
  assert.match(bookText(B.assemble(edited)), /One printed line-\nanother printed line/u);
});

test("regions without lines add no reading units or bare printed page numbers", () => {
  const start = book();
  start.types.unclassified = { lines: true };
  start.types.figure = { figure: true };
  start.containers = { empty: { type: "section" } };
  start.pages[0] = { ...start.pages[0], label: "134", regions: [
    { id: "r1", type: "unclassified", box, in: ["empty"], proposed: "byline" },
    { id: "r2", type: "prose", box, lines: [] },
  ] };
  start.pages[1].regions.push({ id: "plate", type: "figure", box });
  const reading = B.assemble(start);
  assert.deepEqual(reading.book.units.map(unit => unit.type), ["prose", "prose", "figure"]);
  assert.doesNotMatch(bookText(reading), /\[p\. 134\]/u);
  assert.match(bookText(reading), /\[figure\]/u);
});

test("a drawn region takes its printed place in the reading and the sections around it", () => {
  const at = (id, y, more = {}) => ({ id, type: "prose", box: [0.1, y, 0.9, y + 0.05], lines: [{ text: id }], ...more });
  const start = freeze({ chaya: 1, title: "Two essays", types: { prose: {}, heading: { lines: true, heading: true }, section: { contains: ["prose", "heading"] } },
    containers: { c1: { type: "section" }, c2: { type: "section" } },
    pages: [{ id: "one", pdf_page: 1, regions: [at("r1", 0.1, { type: "heading", in: ["c1"] }), at("r2", 0.4, { in: ["c1"] }),
      at("r3", 0.6), at("r4", 0.8, { type: "heading", in: ["c2"] })] }] });
  // Between the first essay's heading and its first paragraph: inside the first essay.
  let next = B.addRegion(start, 0, "prose", [0.1, 0.2, 0.9, 0.25]);
  assert.deepEqual(next.pages[0].regions.map(r => r.id), ["r1", "r5", "r2", "r3", "r4"]);
  assert.deepEqual(next.pages[0].regions[1].in, ["c1"]);
  // Between the two essays: in neither, so neither is split.
  next = B.addRegion(start, 0, "prose", [0.1, 0.7, 0.9, 0.75]);
  assert.deepEqual(next.pages[0].regions.map(r => r.id), ["r1", "r2", "r3", "r5", "r4"]);
  assert.equal(next.pages[0].regions[3].in, undefined);
  // Below everything: at the end.
  next = B.addRegion(start, 0, "prose", [0.1, 0.9, 0.9, 0.95]);
  assert.equal(next.pages[0].regions.at(-1).id, "r5");
  // Its text reads in its place.
  next = B.setLine(B.addLine(B.addRegion(start, 0, "prose", [0.1, 0.2, 0.9, 0.25]), "1/r5", 0), "1/r5", 0, "added");
  const text = bookText(B.assemble(next));
  assert.ok(text.indexOf("r1") < text.indexOf("added") && text.indexOf("added") < text.indexOf("r2"), text);
});
