// Transcription and schema-assignment profiles. Token prices are paid-tier USD per million.
import { finderById } from "./finders.js?v=20261127-export-work";
// Source fetched 2026-11-08: https://ai.google.dev/gemini-api/docs/pricing
import { carbonRates, argonRates, flashRates, hydrogenRates } from "./model-prices.js?v=20261127-export-work";

export const READERS = [
  // Method 100: one page image per call, the page's regions listed in the prompt (webapp/README.md, "Reading a page").
  // The id is the profile name method 100 gave its ledger entries.
  { id: "hydrogen-low-page", label: "Gemini 4 Hydrogen · low thinking · whole page", provider: "gemini", model: "gemini-4-hydrogen", thinking: "low",
    rates: hydrogenRates, formatting: true, whole_page: true, method: "100-hydrogen-low-whole-page-reading" },
  { id: "argon-low", label: "Gemini 4 Argon · low thinking", provider: "gemini", model: "gemini-4-argon", thinking: "low", rates: argonRates, formatting: true },
  { id: "argon-high", label: "Gemini 4 Argon · high thinking", provider: "gemini", model: "gemini-4-argon", thinking: "high", rates: argonRates, formatting: true },
  { id: "carbon-low", label: "Gemini 4 Carbon · low thinking", provider: "gemini", model: "gemini-4-carbon", thinking: "low", rates: carbonRates, formatting: true,
    method: "089-gemini-4-carbon-low-reading" },
  { id: "carbon-high", label: "Gemini 4 Carbon · high thinking", provider: "gemini", model: "gemini-4-carbon", thinking: "high", rates: carbonRates, formatting: true,
    method: "090-gemini-4-carbon-high-reading" },
  { id: "flash-low", label: "Gemini 3.8 Flash · low thinking", provider: "gemini", model: "gemini-3.8-flash", thinking: "low", rates: flashRates, formatting: true },
  { id: "flash-lite", label: "Gemini 3.5 Flash-Lite · minimal thinking", provider: "gemini", model: "gemini-3.5-flash-lite", thinking: "minimal", rates: [{ from: "2026-01-01", input: 0.3, output: 2.5, cached: 0.03 }], formatting: true },
  { id: "tesseract", label: "Tesseract · local OCR", provider: "local", model: "tesseract.js-6.0.1", formatting: false },
  { id: "vision-text", label: "Cloud Vision · Text Detection", provider: "vision", model: "TEXT_DETECTION", formatting: false, usd_per_page: 0.0015 },
  { id: "vision-document", label: "Cloud Vision · Document Text Detection", provider: "vision", model: "DOCUMENT_TEXT_DETECTION", formatting: false, usd_per_page: 0.0015 },
];

export const OCR_LANGUAGES = [
  ["eng", "English"], ["kan+eng", "Kannada and English"], ["san+eng", "Sanskrit in Devanagari and English"],
];

export function readerById(id) {
  const reader = READERS.find(r => r.id === id);
  if (!reader) throw new Error(`Unknown transcription model ${id}`);
  return reader;
}

export function readerOptions(value = {}, types = {}) {
  const reader = value.reader || "argon-low";
  readerById(reader);
  const languages = (types.languages || []).map(language => language.split("-")[0]);
  const ocrLanguages = value.ocr_languages || (languages.includes("kn") ? "kan+eng" : languages.includes("sa") ? "san+eng" : "eng");
  if (!OCR_LANGUAGES.some(([id]) => id === ocrLanguages)) throw new Error("Choose one of the included OCR language packs.");
  if (value.finder) finderById(value.finder);
  return { reader, ocr_languages: ocrLanguages, ...(value.finder ? { finder: value.finder } : {}) };
}

export function readerPrice(profile, at = new Date().toISOString()) {
  if (profile.provider === "local") return { input: 0, output: 0, cached: 0 };
  return [...profile.rates].reverse().find(r => at.slice(0, 10) >= r.from) || null;
}

export function usageCost(usage, profile, at) {
  if (profile.provider === "local") return 0;
  const rates = readerPrice(profile, at);
  if (!rates || !usage || !Number.isFinite(usage.total_input_tokens) || !Number.isFinite(usage.total_output_tokens) || !Number.isFinite(usage.total_thought_tokens)) return null;
  const cached = usage.total_cached_tokens || 0;
  if (usage.total_input_tokens < cached || cached < 0 || usage.total_output_tokens < 0 || usage.total_thought_tokens < 0 ||
      usage.total_tool_use_tokens || (Number.isFinite(usage.total_tokens) && usage.total_tokens !== usage.total_input_tokens + usage.total_output_tokens + usage.total_thought_tokens)) return null;
  return ((usage.total_input_tokens - cached) * rates.input + cached * rates.cached +
    (usage.total_output_tokens + usage.total_thought_tokens) * rates.output) / 1e6;
}

export function geminiReadingRequest(profile, input, schema, maxOutputTokens = 32768) {
  if (profile.provider !== "gemini") throw new Error("This transcription model runs locally.");
  return {
    model: profile.model, input,
    generation_config: { thinking_level: profile.thinking, thinking_summaries: "none", max_output_tokens: maxOutputTokens },
    response_format: { type: "text", mime_type: "application/json", schema },
    service_tier: "standard", store: false,
  };
}
