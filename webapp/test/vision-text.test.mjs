// Cloud Vision's text: spaces as Vision detected them, and its habits in Indic lines (vision.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { indicLine, visionReading } from "../js/pipeline/vision.js";

test("an Indic line: the avagraha read as a Latin s, and ASCII bars for dandas", () => {
  assert.equal(indicLine("ಯೋ s ಪಾಕರೋತ್ತಂ ಪ್ರವರಂ |"), "ಯೋಽಪಾಕರೋತ್ತಂ ಪ್ರವರಂ ।");
  assert.equal(indicLine("ಸಂಖ್ಯಾ ss ಖ್ಯಾತಾ ಮನೀಷಿಭಿಃ ||"), "ಸಂಖ್ಯಾಽಽಖ್ಯಾತಾ ಮನೀಷಿಭಿಃ ॥");
  assert.equal(indicLine("सोऽपि s भवति |"), "सोऽपिऽभवति ।");
  assert.equal(indicLine("This is Ram s book | not Indic"), "This is Ram s book | not Indic", "a Latin line is left alone");
  assert.equal(indicLine("ಒಳಗೆ ಒಂದು ಪಿನ್ ( Pin ) ಹೋಗಿದೆ"), "ಒಳಗೆ ಒಂದು ಪಿನ್ ( Pin ) ಹೋಗಿದೆ");
});

test("words are joined as Vision detected the spaces: none before punctuation", () => {
  const word = (text, x, brk) => ({ symbols: [...text].map((ch, i, all) => ({ text: ch, ...(i === all.length - 1 && brk ? { property: { detectedBreak: { type: brk } } } : {}) })),
    boundingBox: { vertices: [{ x, y: 10 }, { x: x + 40, y: 10 }, { x: x + 40, y: 30 }, { x, y: 30 }] } });
  const words = [word("ಸಿಗೋಲ್ಲ", 0, null), word(".", 45, "SPACE"), word("ಒಳಗೆ", 60, "SPACE"), word("(", 110, null), word("Pin", 120, null), word(")", 165, "EOL_SURE_SPACE")];
  const body = { responses: [{ fullTextAnnotation: { pages: [{ blocks: [{ paragraphs: [{ words }] }] }] } }] };
  const sent = [{ rid: "r1", line_ids: [1], region: { lines: [{ line_id: 1, polygons: [[[0, 0], [300, 0], [300, 40], [0, 40]]] }] } }];
  assert.equal(visionReading(body, sent).regions[0].lines[0].text, "ಸಿಗೋಲ್ಲ. ಒಳಗೆ (Pin)");
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
  const line = [{ text: "ಅರ್ಥ-ಕಾಮ-ಮೋಕ್ಷ", confidence: 0.9 }, { text: "ಇವುಗಳೊಡನೆ", confidence: 0.93 }, { text: "caricane", confidence: 0.15 }, { text: "ACCEO", confidence: 0.48 },
    { text: "ಷರ್ಟ್", confidence: 0.49 }, { text: "School", confidence: 0.9 }, { text: "ನಡೆದಾಗ", confidence: 0.95 }];
  assert.deepEqual(line.filter(word => likelyWord(word, line)).map(word => word.text), ["ಅರ್ಥ-ಕಾಮ-ಮೋಕ್ಷ", "ಇವುಗಳೊಡನೆ", "ಷರ್ಟ್", "School", "ನಡೆದಾಗ"]);
  const english = [{ text: "The", confidence: 0.95 }, { text: "fyrst", confidence: 0.45 }];
  assert.equal(english.filter(word => likelyWord(word, english)).length, 2, "an unsure word in an English line stays");
  const gloss = [{ text: "ಕೆಟ್ಟು", confidence: 0.9 }, { text: "ವಾಚ್", confidence: 0.92 }, { text: "(", confidence: 0.8 }, { text: "watch", confidence: 0.59 },
    { text: ")", confidence: 0.8 }, { text: "ಅನ್ನು", confidence: 0.9 }, { text: "no", confidence: 0.54 }, { text: "ಹಾರಾಡುವ", confidence: 0.9 }];
  assert.deepEqual(gloss.filter(word => likelyWord(word, gloss)).map(word => word.text), ["ಕೆಟ್ಟು", "ವಾಚ್", "(", "watch", ")", "ಅನ್ನು", "ಹಾರಾಡುವ"],
    "an English word in parentheses after its Kannada spelling stays, though Vision is unsure of it");
});
