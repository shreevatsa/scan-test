import test from "node:test";
import assert from "node:assert/strict";
import { markLine, linkNotes, placeFromQuotes, noteProblems, noteTypesOf, normal } from "../js/note-links.js";

const ids = () => { let n = 0; return () => `nm${++n}`; };
const types = { types: { verse: { flow: "main", region: "verse" }, footnote: { flow: "notes", region: "note" }, section: { flow: "main", contains: ["verse"] } } };
const { noteTypes, mainTypes } = noteTypesOf(types);
const page = (verses, notes) => {
  const regions = [...verses.map((lines, i) => ({ id: `v${i + 1}`, type: "verse", lines: lines.map(text => ({ text })) })),
    ...notes.map((text, i) => ({ id: `n${i + 1}`, type: "footnote", lines: [{ text }] }))];
  const units = regions.map((region, i) => ({ id: `u${i + 1}`, type: region.type, children: [{ region: region.id }] }));
  return { page: { id: "p1", regions }, units, flows: { main: units.filter(u => u.type === "verse").map(u => u.id), notes: units.filter(u => u.type === "footnote").map(u => u.id) } };
};

test("a marker left as text becomes a zero-width note marker, and other spans keep their characters", () => {
  const line = { text: "अत्रान्तरे ब्रह्मचारी सूरी१नाम महामुनिः ॥ १९७ ॥" };
  markLine(line, ids());
  assert.equal(line.text, "अत्रान्तरे ब्रह्मचारी सूरीनाम महामुनिः ॥ १९७ ॥", "the verse number after the dandas stays");
  assert.deepEqual(line.spans.map(s => [s.kind, s.start, s.end, s.marker]), [["note_marker", 26, 26, "१"]]);
  const sup = { text: "ab¹ cd", spans: [{ start: 4, end: 6, kind: "bold" }] };
  markLine(sup, ids());
  assert.equal(sup.text, "ab cd");
  assert.deepEqual(sup.spans.map(s => [s.kind, s.start, s.end]), [["note_marker", 2, 2], ["bold", 3, 5]]);
  const span = { text: "रामः२ गतः", spans: [{ start: 4, end: 5, kind: "superscript" }] };
  markLine(span, ids());
  assert.equal(span.text, "रामः गतः"); assert.equal(span.spans[0].kind, "note_marker");
  const tag = { text: "वियोगास्पदतां<su>१</su> दूरं" };
  markLine(tag, ids());
  assert.equal(tag.text, "वियोगास्पदतां दूरं"); assert.equal(tag.spans[0].marker, "१");
});

test("markers link to the notes with the same number; what is left over is listed", () => {
  const doc = page([["तस्मिन्१ यज्ञे", "रामः३ गतः"]], ["१. ‘तस्मिन्’ ख.", "२. ‘यज्ञे’ क.", "३. ‘रामो’ ग."]);
  const make = ids();
  for (const line of doc.page.regions[0].lines) markLine(line, make);
  const result = linkNotes(doc, noteTypes, mainTypes);
  assert.equal(result.links, 2);
  assert.deepEqual(doc.relations.map(r => [r.from.marker, r.to.unit]), [["१", "u2"], ["३", "u4"]]);
  assert.equal(doc.units.find(u => u.id === "u3").number, "२");
  assert.deepEqual(noteProblems(doc, noteTypes, mainTypes), { markers: [], notes: ["२"] });
  assert.equal(normal("१२"), "12");
});

test("a note that quotes a reading gets its marker after the clearly closest word, in the notes' order", () => {
  const doc = page([["ततो दक्षिणतीरैस्य वनमासाद्य सानुजः ।", "स्वस्थः श्रीमान्वरं प्रादाद्देशयोर्धन्यतावहम् ॥"]],
    ["१. ‘तीरस्थं’ स्यात्.", "२. ‘धृष्यतावशम्’ इति पाठः.", "३. ‘ते’ क."]);
  const placed = placeFromQuotes(doc, noteTypes, mainTypes, ids());
  assert.deepEqual(placed.map(p => [p.number, p.word]), [["२", "प्रादाद्देशयोर्धन्यतावहम्"]], "a short or unclear quote places nothing");
  const line = doc.page.regions[0].lines[1];
  assert.equal(line.spans[0].start, [..."स्वस्थः श्रीमान्वरं प्रादाद्देशयोर्धन्यतावहम्"].length);
  linkNotes(doc, noteTypes, mainTypes);
  assert.deepEqual(doc.relations.map(r => r.to.unit), ["u3"]);
});

test("note numbers in Kannada digits are the same numbers", async () => {
  const { NOTE_NUMBER } = await import("../js/note-links.js");
  assert.equal(normal("೨"), "2");
  assert.equal(normal("೧೦"), "10");
  assert.equal(NOTE_NUMBER.exec("೩. ಟಿಪ್ಪಣಿ")[1], "೩");
});
