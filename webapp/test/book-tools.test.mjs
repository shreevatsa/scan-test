import test from "node:test";
import assert from "node:assert/strict";
import { sequenceFixes } from "../tools/chaya_verse_numbers.mjs";
import { scaleGeometry } from "../tools/chaya_rescale.mjs";
import { closingName } from "../tools/chaya_sections.mjs";

const run = values => values.map(value => ({ value, page: "p", line: { text: "" }, printed: String(value) }));

test("a stretch of verse numbers misread by one digit is corrected where the sequence picks up again", () => {
  const verses = run([552, 553, 954, 955, 956, 557, 558]);
  const { fixes, breaks } = sequenceFixes(verses);
  assert.deepEqual(fixes.map(fix => fix.value), [554, 555, 556]);
  assert.equal(breaks.length, 0);
});

test("a number one more than expected (a verse or closing missing) and real restarts are left alone", () => {
  const { fixes, breaks } = sequenceFixes(run([12, 13, 14, 16, 17, 1, 2, 3]));
  assert.deepEqual(fixes, []);
  assert.deepEqual(breaks.map(b => [b.read, b.restart]), [[16, false], [1, true]]);
});

test("the first number after a restart, read ९, becomes १ when २ and ३ follow", () => {
  const { fixes } = sequenceFixes(run([41, 42, 9, 2, 3]));
  assert.deepEqual(fixes.map(fix => fix.value), [1]);
});

test("redrawing a page scales its outlines and boxes, not its ids", () => {
  const doc = { regions: [{ polygons: [[[10, 20], [30, 40]]], box: [10, 20, 30, 40], lines: [{ polygons: [[[1, 2]]], previous_line_ids: [3, 4] }] }], char_h: 10 };
  scaleGeometry(doc, 2, 3);
  assert.deepEqual(doc.regions[0].polygons, [[[20, 60], [60, 120]]]);
  assert.deepEqual(doc.regions[0].box, [20, 60, 60, 120]);
  assert.deepEqual(doc.regions[0].lines[0].previous_line_ids, [3, 4]);
  assert.equal(doc.char_h, 30);
});

test("an episode's name and number come from its closing line, through sandhi", () => {
  assert.deepEqual(closingName("इत्ययोध्याप्रत्यागमनम् ॥ १४ ॥"), { label: "अयोध्याप्रत्यागमनम्", number: "१४" });
  assert.deepEqual(closingName("इतीक्ष्वाकुवंशकथनम् ॥ १२ ॥"), { label: "इक्ष्वाकुवंशकथनम्", number: "१२" });
  assert.deepEqual(closingName("(इति सीताविवाहः समाप्तः ।)"), { label: "सीताविवाहः" });
});

test("a printed contents line splits into its title and page; other lines are not taken for one", async () => {
  const { tocLine } = await import("../js/reader.js");
  assert.deepEqual(tocLine("भरतपर्वसमाप्तिः.... .... १०५"), { title: "भरतपर्वसमाप्तिः", page: "१०५" });
  assert.deepEqual(tocLine("ताटकावधः .... .... ७"), { title: "ताटकावधः", page: "७" });
  assert.equal(tocLine("पृष्ठम् ।"), null);
  assert.equal(tocLine("स्फीतोऽभूदङ्गविषयो विषयः सर्वसंपदाम् ॥ १२१ ॥"), null);
});

test("the former Book view address opens Read", async () => {
  const { workflowRoute, workflowAddress } = await import("../js/workflow.js");
  assert.equal(workflowRoute("#read&view=book").mode, "read");
  assert.equal(workflowAddress("plain"), "#read");
});

test("a verse-group marker groups the verses printed just above it, however it was read", async () => {
  const { groupVerses } = await import("../tools/chaya_verse_groups.mjs");
  const ring = b => [[[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]]]];
  const line = (n, text, y) => ({ line: n, polygons: ring([10, y, 500, y + 40]), text });
  const verse = (id, y, number, extra) => ({ id, type: "verse", box: [10, y, 500, y + (extra ? 140 : 90)], polygons: ring([10, y, 500, y + (extra ? 140 : 90)]),
    lines: [line(1, "क ।", y), line(2, `ख ॥ ${number} ॥`, y + 45), ...(extra ? [line(3, extra, y + 95)] : [])] });
  // The marker printed at the right after the second of four verses, but read last.
  const regions = [verse("r1", 0, "१"), verse("r2", 100, "२"), { id: "r9", type: "verse_group_marker", box: [400, 195, 500, 230], polygons: ring([400, 195, 500, 230]), lines: [line(1, "(युगलकम्)", 195)] },
    verse("r3", 240, "३"), verse("r4", 340, "४")];
  const doc = { page: { id: "p", regions }, units: ["r1", "r2", "r3", "r4", "r9"].map((r, i) => ({ id: `u${i + 1}`, type: r === "r9" ? "verse_group_marker" : "verse", children: [{ region: `p#${r}` }] })),
    flows: { main: ["u1", "u2", "u3", "u4", "u5"] } };
  const counts = { "युगलकम्": 2, "तिलकम्": 3 };
  assert.deepEqual(groupVerses(doc, { counts }).made, [{ marker: "युगलकम्", verses: ["u1", "u2"] }]);
  assert.deepEqual(doc.flows.main, ["vg1", "u3", "u4"]);
  assert.deepEqual(doc.units.find(u => u.id === "vg1").children.map(c => c.unit), ["u1", "u2", "u5"]);
  // A marker read as the last line of the third verse is split off first.
  const doc2 = { page: { id: "q", regions: [verse("r1", 0, "१"), verse("r2", 100, "२"), verse("r3", 200, "३", "(तिलकम्)"), verse("r4", 360, "४")] },
    units: ["r1", "r2", "r3", "r4"].map((r, i) => ({ id: `u${i + 1}`, type: "verse", children: [{ region: `q#${r}` }] })), flows: { main: ["u1", "u2", "u3", "u4"] } };
  const made = groupVerses(doc2, { counts }).made;
  assert.equal(made.filter(m => m.split).length, 1);
  assert.deepEqual(made.find(m => m.marker).verses, ["u1", "u2", "u3"]);
  assert.equal(doc2.page.regions.find(r => r.id === "r3").lines.length, 2);
  assert.equal(doc2.flows.main[0], "vg1");
});

test("page numbers between two runs that agree take the numbers they imply; a new numbering is a break", async () => {
  const { pageNumberFixes } = await import("../tools/chaya_page_labels.mjs");
  const entries = [2, 3, 4, null, 2, 3, 4, 5, 16, 17, 8, 19, 10, 11, 12, 13].map((value, index) => ({ index, value }));
  const { fixes, breaks } = pageNumberFixes(entries);
  assert.deepEqual(fixes.map(f => [f.entry.index, f.value]), [[8, 6], [9, 7], [11, 9]], "a misread run (16, 17, 19 for 6, 7, 9) between runs that agree");
  assert.deepEqual(breaks.map(b => b.read), [2], "the front matter's own numbering, then the body's");
});

test("a dimmed page is left out of the reading sequence, not made a gap", async () => {
  const { readingDocuments } = await import("../js/workflow.js");
  const pages = ["a", "b", "c"].map(id => ({ id })), docs = ["a", "c"].map(id => ({ page: { id } }));
  assert.deepEqual(readingDocuments(pages, docs).map(d => d?.page.id ?? null), ["a", null, "c"]);
  assert.deepEqual(readingDocuments(pages, docs, new Set(["b"])).map(d => d?.page.id ?? null), ["a", "c"]);
});
