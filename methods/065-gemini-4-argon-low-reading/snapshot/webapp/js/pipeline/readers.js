// Reader presets and the fixed text-only structurer. Prices are paid-tier USD per million tokens.
// Source fetched 2026-11-08: https://ai.google.dev/gemini-api/docs/pricing
const argonRates = [
  { from: "2026-01-01", input: 2, output: 10, cached: 0.1 },
  { from: "2026-12-01", input: 4, output: 20, cached: 0.2 },
];
const flashRates = [
  { from: "2026-01-01", input: 0.75, output: 3.75, cached: 0.075 },
  { from: "2027-01-01", input: 1.5, output: 7.5, cached: 0.15 },
];

export const READERS = [
  { id: "argon-low", label: "Gemini 4 Argon · low thinking", provider: "gemini", model: "gemini-4-argon", thinking: "low", rates: argonRates, formatting: true },
  { id: "argon-high", label: "Gemini 4 Argon · high thinking", provider: "gemini", model: "gemini-4-argon", thinking: "high", rates: argonRates, formatting: true },
  { id: "flash-low", label: "Gemini 3.8 Flash · low thinking", provider: "gemini", model: "gemini-3.8-flash", thinking: "low", rates: flashRates, formatting: true },
  { id: "flash-lite", label: "Gemini 3.5 Flash-Lite · minimal thinking", provider: "gemini", model: "gemini-3.5-flash-lite", thinking: "minimal", rates: [{ from: "2026-01-01", input: 0.3, output: 2.5, cached: 0.03 }], formatting: true },
  { id: "tesseract", label: "Tesseract · local OCR", provider: "local", model: "tesseract.js-6.0.1", formatting: false },
];

export const STRUCTURER = { id: "argon-structure", label: "Gemini 4 Argon · high thinking", provider: "gemini", model: "gemini-4-argon", thinking: "high", rates: argonRates };
export const OCR_LANGUAGES = [
  ["eng", "English"], ["kan+eng", "Kannada and English"], ["san+eng", "Sanskrit in Devanagari and English"],
];

export function readerById(id) {
  const reader = READERS.find(r => r.id === id);
  if (!reader) throw new Error(`Unknown reader ${id}`);
  return reader;
}

export function readerOptions(value = {}, types = {}) {
  const reader = value.reader || "argon-low";
  readerById(reader);
  const languages = (types.languages || []).map(language => language.split("-")[0]);
  const ocrLanguages = value.ocr_languages || (languages.includes("kn") ? "kan+eng" : languages.includes("sa") ? "san+eng" : "eng");
  if (!OCR_LANGUAGES.some(([id]) => id === ocrLanguages)) throw new Error("Choose one of the included OCR language packs.");
  return { reader, ocr_languages: ocrLanguages };
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
  if (profile.provider !== "gemini") throw new Error("This reader runs locally.");
  return {
    model: profile.model, input,
    generation_config: { thinking_level: profile.thinking, thinking_summaries: "none", max_output_tokens: maxOutputTokens },
    response_format: { type: "text", mime_type: "application/json", schema },
    service_tier: "standard", store: false,
  };
}
