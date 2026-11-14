// Cloud Vision OCR, one full-resolution image and one feature per request.
// API and standard paid-tier pricing checked 2026-11-08.
// https://docs.cloud.google.com/vision/docs/fulltext-annotations
// https://cloud.google.com/vision/pricing
import { wordsToReading } from "./ocr.js?v=20261113-flaglist-1";

export function visionRequest(profile, imageDataUrl) {
  const content = imageDataUrl.split(",")[1];
  if (!content || content.length > 9500000) throw new Error("Cloud Vision needs a page image small enough for its 10 MB JSON request limit.");
  return { requests: [{ image: { content }, features: [{ type: profile.model }] }] };
}

export function visionReading(body, sent) {
  if (body.responses?.length !== 1) throw new Error("Cloud Vision returned an unexpected number of image responses.");
  const response = body.responses[0];
  if (response.error) throw new Error(`Cloud Vision OCR failed. ${response.error.message || response.error.code}`);
  const words = [];
  for (const page of response.fullTextAnnotation?.pages || []) for (const block of page.blocks || [])
    for (const paragraph of block.paragraphs || []) for (const word of paragraph.words || []) {
      const text = (word.symbols || []).map(symbol => symbol.text || "").join("");
      const vertices = word.boundingBox?.vertices || [];
      if (!text || vertices.length !== 4) continue;
      const xs = vertices.map(v => v.x ?? 0), ys = vertices.map(v => v.y ?? 0);
      if (![...xs, ...ys].every(Number.isFinite)) throw new Error("Cloud Vision returned invalid word coordinates.");
      words.push({ text, confidence: word.confidence, bbox: { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) } });
    }
  if (!words.length && sent.some(s => s.line_ids.length)) throw new Error("Cloud Vision returned no word geometry for the page.");
  return wordsToReading(words, sent, "Cloud Vision supplies plain text. Review inline formatting and note markers.");
}

export function visionCost(body, profile) {
  return body.responses?.length === 1 && !body.responses[0].error ? profile.usd_per_page : null;
}
