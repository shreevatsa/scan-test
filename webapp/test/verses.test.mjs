// A śataka edition's verses and what belongs to each, under keys as the Bhartṛhari site's (js/verses.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { verseGroups } from "../js/verses.js";

const tl = { types: { shataka: { flow: "main", contains: ["heading", "verse", "lead_in"] }, notes: { flow: "main", contains: ["heading", "stanza_note"] },
  heading: { region: "heading" }, verse: { region: "verse" }, lead_in: { region: "lead_in" }, stanza_note: { region: "paragraph" }, footnote: { region: "note", flow: "notes" } } };
// A book from [top type, label, [[type, number, text], …]] in order; one page, each unit one region of one line.
function book(tops, relations = []) {
  const units = [], regions = [], main = [];
  let n = 0;
  for (const [type, label, kids] of tops) {
    const top = { id: `t${main.length}`, type, label, children: [] };
    for (const [kind, number, text, spans] of kids) {
      const id = `u${++n}`, rid = `r${n}`;
      regions.push({ id: rid, lines: [{ line: 1, text, ...(spans ? { spans } : {}) }] });
      units.push({ id, type: kind, ...(number ? { number } : {}), children: [{ region: `p#${rid}` }] });
      top.children.push({ unit: id });
    }
    units.push(top); main.push(top.id);
  }
  return { pages: [{ id: "p", regions }], units, flows: { main, notes: [] }, relations };
}

test("verses keyed by śataka and number, a miscellany going on from the last number; notes and readings with them", () => {
  const b = book([
    ["shataka", "नीतिशतकम्", [["heading", null, "अथ नीतिशतकम्"], ["lead_in", null, "अत्र"], ["verse", "1", "क ख ग", [{ start: 2, end: 2, kind: "note_marker", id: "m1", marker: "1" }]],
      ["verse", "2", "घ ङ"], ["heading", null, "MISCELLANEOUS."], ["verse", "1", "च छ"], ["verse", "2", "ज झ"]]],
    ["notes", "Notes", [["heading", null, "NOTES."], ["stanza_note", "1", "St. 1 …"], ["stanza_note", "2", "St. 2 …"],
      ["heading", null, "MISCELLANEOUS."], ["stanza_note", "1-2", "St. 1-2 …"]]],
  ], [{ type: "readings", from: { region: "p#r1", line: 1 }, to: { unit: "u3" } }, { type: "note", from: { anchor: "p#m1", marker: "1" }, to: { unit: "f1" } }]);
  const { groups, keyOf } = verseGroups(b, tl);
  assert.deepEqual([...groups.keys()], ["N001", "N002", "N003", "N004"]);
  assert.deepEqual(groups.get("N001").lead, ["u2"], "the lead-in before the verse");
  assert.deepEqual(groups.get("N001").companions.notes, ["u9"]);
  assert.deepEqual(groups.get("N001").readings, [{ region: "p#r1", line: 1 }]);
  assert.deepEqual(groups.get("N001").footnotes, ["f1"]);
  assert.deepEqual([groups.get("N003").companions.notes, groups.get("N004").companions.notes], [["u12"], ["u12"]], "a note on two stanzas goes with both");
  assert.equal(keyOf.get("u6"), "N003");
});

test("a misread or repeated number does not start a numbering again; a book with nothing gathered to its verses has none", () => {
  const verses = numbers => numbers.map(n => ["verse", String(n), "क"]);
  const b = book([["shataka", "वैराग्यशतकम्", verses([1, 2, 3, 4, 5])], ["notes", "Notes", [["heading", null, "VAIRÂGYAS'ATAKA."], ["stanza_note", "1", ""], ["stanza_note", "2", ""],
    ["stanza_note", "8", ""], ["stanza_note", "4", ""], ["stanza_note", "4", ""], ["stanza_note", "5", ""]]]]);
  const { groups } = verseGroups(b, tl);
  assert.deepEqual([...groups.keys()], ["V001", "V002", "V003", "V004", "V005"]);
  assert.equal(groups.get("V003").companions.notes.length, 1, "8 between 2 and 4 is 3");
  assert.equal(verseGroups(book([["shataka", "", verses([1, 2, 3])]]), tl).groups.size, 0);
});
