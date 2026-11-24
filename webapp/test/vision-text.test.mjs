// Cloud Vision's text: spaces as Vision detected them, and its habits in Indic lines (vision.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { indicLine, visionReading } from "../js/pipeline/vision.js";

test("an Indic line: the avagraha read as a Latin s, and ASCII bars for dandas", () => {
  assert.equal(indicLine("ಯೋ s ಪಾಕರೋತ್ತಂ ಪ್ರವರಂ |"), "ಯೋಽಪಾಕರೋತ್ತಂ ಪ್ರವರಂ ।");
  assert.equal(indicLine("ಸಂಖ್ಯಾ ss ಖ್ಯಾತಾ ಮನೀಷಿಭಿಃ ||"), "ಸಂಖ್ಯಾಽಽಖ್ಯಾತಾ ಮನೀಷಿಭಿಃ ॥");
  assert.equal(indicLine("सोऽपि s भवति |"), "सोऽपिऽभवति ।");
  assert.equal(indicLine("This is Ram s book | not Indic"), "This is Ram s book | not Indic", "a Latin line is left alone");
  assert.equal(indicLine("ನನ್ನ ಬಳಿ ಒಂದು ಪೆನ್ ( Pen ) ಇದೆ"), "ನನ್ನ ಬಳಿ ಒಂದು ಪೆನ್ ( Pen ) ಇದೆ");
});

test("words are joined as Vision detected the spaces: none before punctuation", () => {
  const word = (text, x, brk) => ({ symbols: [...text].map((ch, i, all) => ({ text: ch, ...(i === all.length - 1 && brk ? { property: { detectedBreak: { type: brk } } } : {}) })),
    boundingBox: { vertices: [{ x, y: 10 }, { x: x + 40, y: 10 }, { x: x + 40, y: 30 }, { x, y: 30 }] } });
  const words = [word("ಬಂದೆ", 0, null), word(".", 45, "SPACE"), word("ಪೆನ್", 60, "SPACE"), word("(", 110, null), word("Pen", 120, null), word(")", 165, "EOL_SURE_SPACE")];
  const body = { responses: [{ fullTextAnnotation: { pages: [{ blocks: [{ paragraphs: [{ words }] }] }] } }] };
  const sent = [{ rid: "r1", line_ids: [1], region: { lines: [{ line_id: 1, polygons: [[[0, 0], [300, 0], [300, 40], [0, 40]]] }] } }];
  assert.equal(visionReading(body, sent).regions[0].lines[0].text, "ಬಂದೆ. ಪೆನ್ (Pen)");
});

test("what Vision read in the printed lines outside all regions comes back with the reading", () => {
  const word = (text, x, y) => ({ symbols: [...text].map((ch, i, all) => ({ text: ch, ...(i === all.length - 1 ? { property: { detectedBreak: { type: "SPACE" } } } : {}) })),
    confidence: 0.9, boundingBox: { vertices: [{ x, y }, { x: x + 40, y }, { x: x + 40, y: y + 20 }, { x, y: y + 20 }] } });
  const body = { responses: [{ fullTextAnnotation: { pages: [{ blocks: [{ paragraphs: [{ words: [word("ಒಳಗೆ", 10, 10), word("--", 100, 100), word("*", 150, 100), word("--", 200, 100)] }] }] }] } }] };
  const sent = [{ rid: "r1", line_ids: [1], region: { lines: [{ line_id: 1, polygons: [[[0, 0], [300, 0], [300, 40], [0, 40]]] }] } }];
  const reading = visionReading(body, sent, [{ line_id: 9, box: [90, 95, 260, 125] }, { line_id: 10, box: [0, 300, 100, 330] }]);
  assert.deepEqual(reading.uncovered, [{ line_id: 9, text: "-- * --" }, { line_id: 10, text: "" }]);
  assert.equal(visionReading(body, sent).uncovered, undefined, "none asked, none returned");
});

test("words Vision is unsure of: very unsure ones, and Latin ones in a line of another script, are left out", async () => {
  const { likelyWord } = await import("../js/pipeline/vision.js");
  const line = [{ text: "ನಾವೆಲ್ಲರೂ", confidence: 0.9 }, { text: "ಊರಿನ", confidence: 0.93 }, { text: "caricane", confidence: 0.15 }, { text: "ACCEO", confidence: 0.48 },
    { text: "ಷರ್ಟ್", confidence: 0.49 }, { text: "School", confidence: 0.9 }, { text: "ಹತ್ತಿರಕ್ಕೆ", confidence: 0.9 }, { text: "ಹೋದೆವು", confidence: 0.95 }];
  assert.deepEqual(line.filter(word => likelyWord(word, line)).map(word => word.text), ["ನಾವೆಲ್ಲರೂ", "ಊರಿನ", "ಷರ್ಟ್", "School", "ಹತ್ತಿರಕ್ಕೆ", "ಹೋದೆವು"]);
  const english = [{ text: "The", confidence: 0.95 }, { text: "fyrst", confidence: 0.45 }];
  assert.equal(english.filter(word => likelyWord(word, english)).length, 2, "an unsure word in an English line stays");
  const gloss = [{ text: "ನಾನು", confidence: 0.9 }, { text: "ಬಸ್", confidence: 0.92 }, { text: "(", confidence: 0.8 }, { text: "bus", confidence: 0.59 },
    { text: ")", confidence: 0.8 }, { text: "ನಲ್ಲಿ", confidence: 0.9 }, { text: "no", confidence: 0.54 }, { text: "ಬಂದೆ", confidence: 0.9 }];
  assert.deepEqual(gloss.filter(word => likelyWord(word, gloss)).map(word => word.text), ["ನಾನು", "ಬಸ್", "(", "bus", ")", "ನಲ್ಲಿ", "ಬಂದೆ"],
    "an English word in parentheses after its Kannada spelling stays, though Vision is unsure of it");
});

test("a line piece that got no words: missed if it is a line, not if it is a fragment of the lines beside it", async () => {
  const { wordsToReading } = await import("../js/pipeline/ocr.js");
  const piece = (id, x0, y0, x1, y1) => ({ line_id: id, polygons: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1]]] });
  // Three lines, a vowel sign cut off between the first two (narrow, within their height), and an empty last line.
  const region = { lines: [piece(1, 0, 0, 1000, 60), piece(2, 900, 40, 960, 110), piece(3, 0, 80, 1000, 140), piece(4, 0, 160, 400, 220)] };
  const words = [{ text: "ಮೊದಲ", bbox: { x0: 10, y0: 5, x1: 200, y1: 55 } }, { text: "ಎರಡನೆಯ", bbox: { x0: 10, y0: 85, x1: 400, y1: 135 } }];
  const [read] = wordsToReading(words, [{ rid: "r1", line_ids: [1, 2, 3, 4], region }]).regions;
  assert.deepEqual(read.missed, [4]);
  assert.equal(read.uncertain, true);
  const [whole] = wordsToReading([...words, { text: "ಕೊನೆಯ", bbox: { x0: 10, y0: 165, x1: 300, y1: 215 } }], [{ rid: "r1", line_ids: [1, 2, 3, 4], region }]).regions;
  assert.equal(whole.uncertain, false, "the fragment alone leaves the block certain");
  assert.equal(whole.missed, undefined);
});

test("a note marker Vision read as a number or sign standing apart becomes a marker, if a note on the page has it", async () => {
  const { Maker } = await import("../js/pipeline/run.js");
  const types = { types: { paragraph: { region: "paragraph", flow: "main" }, verse: { region: "verse", flow: "main" }, footnote: { region: "note", flow: "notes" } } };
  const sent = [["r1", "paragraph", 1], ["r2", "verse", 2], ["r3", "footnote", 3], ["r4", "footnote", 4], ["r5", "footnote", 5]]
    .map(([rid, type, order]) => ({ rid, line_ids: [1], region: { type, reading_order: order } }));
  const region = (id, ...lines) => ({ id, lines: lines.map((text, i) => ({ n: i + 1, text })), uncertain: false, note: null });
  const parsed = { regions: [
    region("r1", "ನಾವು ಊರಿಗೆ ಹೋದೆವು. 1 ಅಲ್ಲಿ 25 ಜನರಿದ್ದರು,", "ಅವರಲ್ಲಿ ಒಬ್ಬರು * ಹಾಡಿದರು 3 - 4 ದಿನ"),
    region("r2", "ಸತ್ಯಂ ವದ ಧರ್ಮಂ ಚರ ॥ 2 ॥"),
    region("r3", "1. ನಮ್ಮ ಊರು."), region("r4", "2. ಇನ್ನೊಂದು."), region("r5", "* ಹಾಡು.")] };
  Maker.prototype.markNoteNumbers.call({ book: { types } }, parsed, sent);
  assert.deepEqual(parsed.regions[0].lines.map(line => line.text), ["ನಾವು ಊರಿಗೆ ಹೋದೆವು.[1] ಅಲ್ಲಿ 25 ಜನರಿದ್ದರು,", "ಅವರಲ್ಲಿ ಒಬ್ಬರು[*] ಹಾಡಿದರು 3 - 4 ದಿನ"]);
  assert.equal(parsed.regions[1].lines[0].text, "ಸತ್ಯಂ ವದ ಧರ್ಮಂ ಚರ ॥ 2 ॥", "a verse's number between dandas is no marker");
  assert.equal(parsed.regions[2].lines[0].text, "1. ನಮ್ಮ ಊರು.", "the notes keep their numbers");
});
