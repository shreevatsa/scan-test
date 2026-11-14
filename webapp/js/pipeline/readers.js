// Transcription and schema-assignment profiles. Token prices are paid-tier USD per million.
import { finderById } from "./finders.js?v=20261113-noink-1";
// Source fetched 2026-11-08: https://ai.google.dev/gemini-api/docs/pricing
import { carbonRates, argonRates, flashRates } from "./model-prices.js?v=20261113-noink-1";

export const READERS = [
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

export const DEFAULT_TRANSCRIPTION_REFERENCE = "argon-high";

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

// Estimate each stage from its available samples. Repair charges stay in the actual-spend ledger.
export function bookCostEstimate(samples, pageCount) {
  const counts = {}, totals = {}, missing = [];
  if (!Number.isSafeInteger(pageCount) || pageCount <= 0) return { total: null, known_total: null, counts, missing, invalid_page_count: true };
  for (const stage of ["regions", "reading", "structure"]) {
    const costs = samples.filter(sample => stage !== "reading" || !sample.reading?.partial)
      .map(sample => sample[stage]?.cost_usd).filter(value => Number.isFinite(value) && value >= 0);
    counts[stage] = costs.length;
    if (costs.length) totals[stage] = costs.reduce((sum, value) => sum + value, 0) / costs.length * pageCount;
    else missing.push(stage);
  }
  const known = Object.values(totals);
  const knownTotal = known.length ? known.reduce((sum, value) => sum + value, 0) : null;
  return { total: missing.length ? null : knownTotal, known_total: knownTotal, counts, missing };
}

export function projectBookCost(samples, pageCount) {
  return bookCostEstimate(samples, pageCount).total;
}

// A repaired reading retains its original whole-page call in history, which still supplies a price sample.
export async function wholePageReading(book, reading) {
  const source = reading, seen = new Set();
  while (reading?.partial) {
    const path = reading.previous_reading;
    if (!path || seen.has(path)) return null;
    seen.add(path);
    reading = await book.readWork(path);
    if (reading?.image_sha256 !== source.image_sha256 || reading?.profile?.id !== source.profile?.id) return null;
  }
  return reading || null;
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
