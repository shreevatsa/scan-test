// Cloud Vision OCR, one full-resolution image and one feature per request.
// API and standard paid-tier pricing checked 2026-11-08.
// https://docs.cloud.google.com/vision/docs/fulltext-annotations
// https://cloud.google.com/vision/pricing
import { wordsToReading } from "./ocr.js?v=20261127-unordered-in-place";

export function visionRequest(profile, imageDataUrl) {
  const content = imageDataUrl.split(",")[1];
  if (!content || content.length > 9500000) throw new Error("Cloud Vision needs a page image small enough for its 10 MB JSON request limit.");
  return { requests: [{ image: { content }, features: [{ type: profile.model }] }] };
}

// What a reading from Cloud Vision is parsed with; a saved response is parsed again when this changes (run.js).
export const VISION_PARSE = 15;

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
// parentheses after its Kannada spelling ("ಬಸ್ (bus)") is printed, though Vision is often unsure of it.
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
  // A word Vision is unsure of and set apart from the line's text, in a paragraph of its own, that looks foreign to the
  // line (a letter or two, or Latin in a line of another script): a page frame's side read as a column of letters ("V",
  // "Z"), or a letter showing through from the other side of the leaf, which the line runs over. Numbers and signs stay,
  // and so does a word of the line's own script.
  if (word.confidence < 0.7 && word.paragraph !== undefined && foreign(word, line)) {
    const weight = new Map();
    for (const other of line) weight.set(other.paragraph, (weight.get(other.paragraph) || 0) + other.text.length);
    const total = [...weight.values()].reduce((a, b) => a + b, 0);
    if (weight.get(word.paragraph) < 0.2 * total) return false;
  }
  return true;
}
function foreign(word, line) {
  const text = word.text, letters = [...text].filter(ch => /[\p{L}\p{M}]/u.test(ch));
  // Not a number or a sign: a note marker (raised, Vision sets it apart; kept for markNoteNumbers), an index's column
  // of entry numbers, a bracket.
  if (!letters.length) return false;
  const others = line.filter(other => other !== word).flatMap(other => [...other.text].filter(ch => /\p{L}/u.test(ch)));
  const latinLine = others.filter(ch => LATIN.test(ch)).length >= 0.4 * others.length;
  if (letters.length <= 2) {
    // In a Latin line, capitals only (a frame's "V", "VE"; not "A", "I", nor a short word, "by"); elsewhere, any but a
    // lone vowel letter of an Indic script (a word, "this"), unless it repeats the start or end of a word beside it.
    if (latinLine) return /^[A-Z]{1,2}$/.test(text) && !/^[AIO]$/.test(text);
    const sorted = [...line].sort((a, b) => a.bbox.x0 - b.bbox.x0), at = sorted.indexOf(word);
    const echo = (sorted[at + 1]?.text || "").startsWith(text) || (sorted[at - 1]?.text || "").endsWith(text);
    const code = text.codePointAt(0), vowel = [...text].length === 1 && code >= 0x900 && code < 0xE00 && (code & 0x7F) >= 0x05 && (code & 0x7F) <= 0x14;
    return echo || !vowel;
  }
  return LATIN.test(text) && !latinLine;
}

// `uncovered`, the page's printed lines outside all regions (regions record uncovered_lines): Vision reads the whole page,
// so what it read inside each is returned too ({ line_id, text }), to tell an ornament or a rule (no letters) from text
// the region finder missed.
export function visionReading(body, sent, uncovered = []) {
  if (body.responses?.length !== 1) throw new Error("Cloud Vision returned an unexpected number of image responses.");
  const response = body.responses[0];
  if (response.error) throw new Error(`Cloud Vision OCR failed. ${response.error.message || response.error.code}`);
  const words = [];
  let paragraphs = 0;   // each word's paragraph, as Vision grouped them, numbered through the page
  for (const page of response.fullTextAnnotation?.pages || []) for (const block of page.blocks || [])
    for (const paragraph of block.paragraphs || []) for (const word of (paragraphs++, paragraph.words || [])) {
      const text = (word.symbols || []).map(symbol => symbol.text || "").join("");
      // Whether a space follows the word, as Vision detected it (punctuation follows its word with none).
      const after = word.symbols?.at(-1)?.property?.detectedBreak?.type;
      const vertices = word.boundingBox?.vertices || [];
      if (!text || vertices.length !== 4) continue;
      const xs = vertices.map(v => v.x ?? 0), ys = vertices.map(v => v.y ?? 0);
      if (![...xs, ...ys].every(Number.isFinite)) throw new Error("Cloud Vision returned invalid word coordinates.");
      words.push({ text, confidence: word.confidence, space: Boolean(after) && after !== "HYPHEN", paragraph: paragraphs, bbox: { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) } });
    }
  if (!words.length && sent.some(s => s.line_ids.length)) throw new Error("Cloud Vision returned no word geometry for the page.");
  const reading = wordsToReading(words, sent, "Cloud Vision supplies plain text. Review inline formatting and note markers.", indicLine, likelyWord);
  if (!uncovered?.length) return reading;
  return { ...reading, uncovered: uncovered.filter(line => line.box).map(line => {
    const [x0, y0, x1, y1] = line.box;
    // Only words no region's line took: the line analysis may make a second, longer piece of a line a region has.
    const inside = words.filter(word => { const x = (word.bbox.x0 + word.bbox.x1) / 2, y = (word.bbox.y0 + word.bbox.y1) / 2; return !word.placed && x >= x0 && x <= x1 && y >= y0 && y <= y1; })
      .sort((a, b) => a.bbox.x0 - b.bbox.x0);
    // How sure Vision is of the line's words (by their length): a page's ornamental frame is read as letters too
    // ("NANANANA"), but at well under the confidence of print (under 0.8, print 0.9 and over).
    const letters = inside.reduce((sum, word) => sum + word.text.length, 0);
    const confidence = inside.every(word => typeof word.confidence === "number") && letters
      ? Number((inside.reduce((sum, word) => sum + word.confidence * word.text.length, 0) / letters).toFixed(2)) : undefined;
    return { line_id: line.line_id, text: inside.map((word, i) => word.text + (i < inside.length - 1 && word.space !== false ? " " : "")).join("").normalize("NFC"),
      ...(confidence !== undefined ? { confidence } : {}) };
  }) };
}

export function visionCost(body, profile) {
  return body.responses?.length === 1 && !body.responses[0].error ? profile.usd_per_page : null;
}
