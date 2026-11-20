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

test("the Book view has its own address under Read", async () => {
  const { workflowRoute, workflowAddress } = await import("../js/workflow.js");
  assert.equal(workflowRoute("#read&view=book", { read: true }).mode, "plain");
  assert.equal(workflowAddress("plain"), "#read&view=book");
});
