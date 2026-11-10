// Transcription and schema-assignment profiles. Token prices are paid-tier USD per million.
import { finderById } from "./finders.js";
// Source fetched 2026-11-08: https://ai.google.dev/gemini-api/docs/pricing
import { argonRates, flashRates } from "./model-prices.js";

export const READERS = [
  { id: "argon-low", label: "Gemini 4 Argon · low thinking", provider: "gemini", model: "gemini-4-argon", thinking: "low", rates: argonRates, formatting: true },
  { id: "argon-high", label: "Gemini 4 Argon · high thinking", provider: "gemini", model: "gemini-4-argon", thinking: "high", rates: argonRates, formatting: true },
  { id: "flash-low", label: "Gemini 3.8 Flash · low thinking", provider: "gemini", model: "gemini-3.8-flash", thinking: "low", rates: flashRates, formatting: true },
  { id: "flash-lite", label: "Gemini 3.5 Flash-Lite · minimal thinking", provider: "gemini", model: "gemini-3.5-flash-lite", thinking: "minimal", rates: [{ from: "2026-01-01", input: 0.3, output: 2.5, cached: 0.03 }], formatting: true },
  { id: "tesseract", label: "Tesseract · local OCR", provider: "local", model: "tesseract.js-6.0.1", formatting: false },
  { id: "vision-text", label: "Cloud Vision · Text Detection", provider: "vision", model: "TEXT_DETECTION", formatting: false, usd_per_page: 0.0015 },
  { id: "vision-document", label: "Cloud Vision · Document Text Detection", provider: "vision", model: "DOCUMENT_TEXT_DETECTION", formatting: false, usd_per_page: 0.0015 },
];

export const STRUCTURER = { id: "argon-structure", label: "Gemini 4 Argon · high thinking", provider: "gemini", model: "gemini-4-argon", thinking: "high", rates: argonRates };
export const STRUCTURERS = [STRUCTURER,
  { ...READERS.find(r => r.id === "argon-low"), id: "argon-low-structure" },
  { ...READERS.find(r => r.id === "flash-low"), id: "flash-structure" },
  { ...READERS.find(r => r.id === "flash-lite"), id: "flash-lite-structure" },
  { id: "terra-structure", label: "GPT-6.1 Terra · reasoning off", provider: "openai", model: "gpt-6.1-terra", reasoning: "none" },
];
export const OCR_LANGUAGES = [
  ["eng", "English"], ["kan+eng", "Kannada and English"], ["san+eng", "Sanskrit in Devanagari and English"],
];

export function readerById(id) {
  const reader = READERS.find(r => r.id === id);
  if (!reader) throw new Error(`Unknown transcription model ${id}`);
  return reader;
}

export function structurerById(id = STRUCTURER.id) {
  const profile = STRUCTURERS.find(profile => profile.id === id);
  if (!profile) throw new Error(`Unknown schema assignment model ${id}`);
  return profile;
}

// Keep the original Argon-high path so existing trials remain available.
export function structurePath(pid, reader, structurer = STRUCTURER.id) {
  return structurer === STRUCTURER.id ? `work/structures/${pid}/${reader}.json` : `work/structures/${pid}/${reader}/${structurer}.json`;
}

export function readerOptions(value = {}, types = {}) {
  const reader = value.reader || "argon-low";
  readerById(reader);
  const structurer = value.structurer || STRUCTURER.id;
  structurerById(structurer);
  const languages = (types.languages || []).map(language => language.split("-")[0]);
  const ocrLanguages = value.ocr_languages || (languages.includes("kn") ? "kan+eng" : languages.includes("sa") ? "san+eng" : "eng");
  if (!OCR_LANGUAGES.some(([id]) => id === ocrLanguages)) throw new Error("Choose one of the included OCR language packs.");
  if (value.finder) finderById(value.finder);
  return { reader, ocr_languages: ocrLanguages, structurer, ...(value.finder ? { finder: value.finder } : {}) };
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

// Project one pass from completed calls, including shared region detection once per page.
// A missing stage cost makes the complete estimate unavailable, including for older books.
export function projectBookCost(samples, pageCount) {
  if (!samples.length || !Number.isSafeInteger(pageCount) || pageCount <= 0) return null;
  const costs = samples.flatMap(sample => [sample.regions?.cost_usd, sample.reading?.cost_usd, sample.structure?.cost_usd]);
  if (!costs.every(value => Number.isFinite(value) && value >= 0)) return null;
  return costs.reduce((sum, value) => sum + value, 0) / samples.length * pageCount;
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

export function structureRequest(profile, prompt, input, schema) {
  if (profile.provider === "gemini") return geminiReadingRequest(profile,
    [{ type: "text", text: prompt }, { type: "text", text: JSON.stringify(input) }], schema, 16384);
  return { model: profile.model, reasoning: { effort: profile.reasoning }, store: false, max_output_tokens: 16384,
    input: [{ role: "user", content: [{ type: "input_text", text: prompt }, { type: "input_text", text: JSON.stringify(input) }] }],
    text: { format: { type: "json_schema", name: "page_structure", strict: true, schema } } };
}
