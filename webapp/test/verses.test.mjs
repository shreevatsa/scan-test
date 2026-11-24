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

test("a śataka set out verse by verse: the number printed at the verse's end, the prose after it, the notes on its page", () => {
  // One verse a page: the verse, its meaning and translation after it, an unmarked note at the foot.
  const page = (pid, n) => ({ id: pid, regions: [{ id: "r1", type: "verse", lines: [{ line: 1, text: `श्लोकस्य पादाः ॥ ${"०१२३४५६७८९"[n]} ॥` }] },
    { id: "r2", type: "paragraph", lines: [{ line: 1, text: "अर्थ" }] }, { id: "r3", type: "paragraph", lines: [{ line: 1, text: "Meaning" }] },
    { id: "r4", type: "footnote", lines: [{ line: 1, text: "Cf. …" }] }, { id: "r5", type: "running_header", lines: [{ line: 1, text: "नीतिशतकम् ।" }] }] });
  const pages = [page("p1", 7), page("p2", 8)];
  const units = pages.flatMap(p => ["r1", "r2", "r3", "r4"].map(r => ({ id: `${p.id}#${r}`, type: p.regions.find(x => x.id === r).type, children: [{ region: `${p.id}#${r}` }] })));
  const b = { pages, units, flows: { main: units.filter(u => u.type !== "footnote").map(u => u.id), notes: units.filter(u => u.type === "footnote").map(u => u.id) }, relations: [] };
  const types = { types: { ...tl.types, running_header: { region: "running_header", role: "furniture" } } };
  const { groups } = verseGroups(b, types);
  assert.deepEqual([...groups.keys()], ["N007", "N008"]);
  assert.deepEqual(groups.get("N007").follow, ["p1#r2", "p1#r3"]);
  assert.deepEqual(groups.get("N008").footnotes, ["p2#r4"]);
  // The same without a śataka's name (a story book's verses among its prose): none.
  const story = { ...b, pages: pages.map(p => ({ ...p, regions: p.regions.filter(r => r.type !== "running_header") })) };
  assert.equal(verseGroups(story, types).groups.size, 0);
});
