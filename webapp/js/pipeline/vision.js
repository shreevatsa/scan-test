// Cloud Vision OCR, one full-resolution image and one feature per request.
// API and standard paid-tier pricing checked 2026-11-08.
// https://docs.cloud.google.com/vision/docs/fulltext-annotations
// https://cloud.google.com/vision/pricing
import { wordsToReading } from "./ocr.js?v=20261124-vision-7";

export function visionRequest(profile, imageDataUrl) {
  const content = imageDataUrl.split(",")[1];
  if (!content || content.length > 9500000) throw new Error("Cloud Vision needs a page image small enough for its 10 MB JSON request limit.");
  return { requests: [{ image: { content }, features: [{ type: profile.model }] }] };
}

// What a reading from Cloud Vision is parsed with; a saved response is parsed again when this changes (run.js).
export const VISION_PARSE = 7;

// Cloud Vision's habits in Indic text: the avagraha (ಽ, ऽ) read as a Latin "s", standing apart ("ಯೋ s ಪಾಕರೋತ್");
// dandas as ASCII bars. In a line written mostly in an Indic script, a lone "s" (or "ss") between letters becomes the
// avagraha of that script, joined to the word before it, and "|" and "||" the danda and double danda.
const INDIC = [["Kannada", "\u0CBD"], ["Devanagari", "\u093D"], ["Telugu", "\u0C3D"]];
export function indicLine(text) {
  const letters = [...text].filter(ch => /\p{L}/u.test(ch));
  for (const [script, avagraha] of INDIC) {
    const own = new RegExp(`\\p{Script=${script}}`, "u");
    if (!letters.length || letters.filter(ch => own.test(ch)).length < 0.6 * letters.length) continue;
    const sign = JSON.parse(`"${avagraha}"`), mark = `[\\p{Script=${script}}\\p{M}]`;
    return text
      .replace(new RegExp(`(${mark})\\s*\\b(s{1,3})\\b\\s*(?=\\p{Script=${script}})`, "gu"), (_, before, s) => before + sign.repeat(s.length))
      .replace(/\s*\|\s*\|/g, " ॥").replace(/\s*\|/g, " ।").replace(/^ /, "");
  }
  return text;
}

// Print showing through from the other side of the leaf is read too, with little confidence: a word Vision gives less
// than 0.3, or a Latin word below 0.6 in a line written mostly in another script, is left out. An English word given in
// parentheses after its Kannada spelling ("ವಾಚ್ (watch)") is printed, though Vision is often unsure of it.
const LATIN = /\p{Script=Latin}/u, OTHER_LETTER = /(?!\p{Script=Latin})\p{L}/u;
function inParentheses(word, line) {
  const sorted = [...line].sort((a, b) => (a.bbox?.x0 ?? 0) - (b.bbox?.x0 ?? 0)), at = sorted.indexOf(word);
  const reaches = (step, mark) => {
    for (let i = at; i >= 0 && i < sorted.length; i += step) {
      if (sorted[i].text.includes(mark)) return true;
      if (OTHER_LETTER.test(sorted[i].text)) return false;
    }
    return false;
  };
  return reaches(-1, "(") && reaches(1, ")");
}
export function likelyWord(word, line) {
  if (!Number.isFinite(word.confidence)) return true;
  if (word.confidence < 0.3) return false;
  if (word.confidence < 0.6 && LATIN.test(word.text) && !inParentheses(word, line)) {
    // The line's script, by the words Vision is sure of.
    const letters = line.filter(w => !(w.confidence < 0.6)).flatMap(w => [...w.text].filter(ch => /\p{L}/u.test(ch)));
    if (letters.filter(ch => LATIN.test(ch)).length < 0.4 * letters.length) return false;
  }
  return true;
}

export function visionReading(body, sent) {
  if (body.responses?.length !== 1) throw new Error("Cloud Vision returned an unexpected number of image responses.");
  const response = body.responses[0];
  if (response.error) throw new Error(`Cloud Vision OCR failed. ${response.error.message || response.error.code}`);
  const words = [];
  for (const page of response.fullTextAnnotation?.pages || []) for (const block of page.blocks || [])
    for (const paragraph of block.paragraphs || []) for (const word of paragraph.words || []) {
      const text = (word.symbols || []).map(symbol => symbol.text || "").join("");
      // Whether a space follows the word, as Vision detected it (punctuation follows its word with none).
      const after = word.symbols?.at(-1)?.property?.detectedBreak?.type;
      const vertices = word.boundingBox?.vertices || [];
      if (!text || vertices.length !== 4) continue;
      const xs = vertices.map(v => v.x ?? 0), ys = vertices.map(v => v.y ?? 0);
      if (![...xs, ...ys].every(Number.isFinite)) throw new Error("Cloud Vision returned invalid word coordinates.");
      words.push({ text, confidence: word.confidence, space: Boolean(after) && after !== "HYPHEN", bbox: { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) } });
    }
  if (!words.length && sent.some(s => s.line_ids.length)) throw new Error("Cloud Vision returned no word geometry for the page.");
  return wordsToReading(words, sent, "Cloud Vision supplies plain text. Review inline formatting and note markers.", indicLine, likelyWord);
}

export function visionCost(body, profile) {
  return body.responses?.length === 1 && !body.responses[0].error ? profile.usd_per_page : null;
}
