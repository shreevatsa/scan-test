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
