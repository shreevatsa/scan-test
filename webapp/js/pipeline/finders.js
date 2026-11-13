// Each additional finder is evaluated on the public passage references before being offered here.
import { canonical } from "../ops.js?v=20261113-finder-types-1";
import { argonRates, flashRates } from "./model-prices.js?v=20261113-finder-types-1";
export const FINDERS = [
  { id: "terra-regions", label: "GPT-6.1 Terra · reasoning off", provider: "openai", model: "gpt-6.1-terra", reasoning: "none", method: "042+063" },
  { id: "terra-proposals", label: "GPT-6.1 Terra · reasoning off · proposes new types", provider: "openai", model: "gpt-6.1-terra", reasoning: "none",
    method: "097-terra-regions-proposing-types", proposals: true },
  { id: "local-blocks", label: "Line blocks · free on this device", provider: "local", model: "line-blocks-v1", method: "079-local-line-block-regions" },
  { id: "tesseract-regions", label: "Tesseract paragraphs · free on this device", provider: "local", model: "tesseract.js-6.0.1", method: "080-tesseract-paragraph-regions" },
  { id: "astra-regions", label: "GPT-6 Astra · low reasoning", provider: "openai", model: "gpt-6-astra", reasoning: "low", method: "081-gpt-6-astra-low-book-regions",
    pricing: { checked_on: "2026-11-10", input_per_million_usd: 10, output_per_million_usd: 50, cached_input_per_million_usd: 1,
      cache_write_30m_per_million_usd: 12.5, source: "https://developers.openai.com/api/docs/models/gpt-6-astra" } },
  { id: "sol-regions", label: "GPT-6.1 Sol · low reasoning", provider: "openai", model: "gpt-6.1-sol", reasoning: "low", method: "082-gpt-6.1-sol-low-book-regions",
    pricing: { checked_on: "2026-11-10", input_per_million_usd: 2, output_per_million_usd: 10, cached_input_per_million_usd: 0.1,
      cache_write_30m_per_million_usd: 2.5, source: "https://developers.openai.com/api/docs/models/gpt-6.1-sol" } },
  { id: "argon-low-regions", label: "Gemini 4 Argon · low thinking", provider: "gemini", model: "gemini-4-argon", thinking: "low", rates: argonRates, method: "083-gemini-4-argon-low-book-regions" },
  { id: "argon-high-regions", label: "Gemini 4 Argon · high thinking", provider: "gemini", model: "gemini-4-argon", thinking: "high", rates: argonRates, method: "084-gemini-4-argon-high-book-regions" },
  { id: "flash-regions", label: "Gemini 3.8 Flash · low thinking", provider: "gemini", model: "gemini-3.8-flash", thinking: "low", rates: flashRates, method: "085-gemini-3.8-flash-low-book-regions" },
  { id: "flash-lite-regions", label: "Gemini 3.5 Flash-Lite · minimal thinking", provider: "gemini", model: "gemini-3.5-flash-lite", thinking: "minimal", method: "086-gemini-3.5-flash-lite-book-regions",
    rates: [{ from: "2026-01-01", input: 0.3, output: 2.5, cached: 0.03 }] },
];

export function finderById(id = "terra-regions") {
  const finder = FINDERS.find(finder => finder.id === id);
  if (!finder) throw new Error(`Unknown region finder ${id}.`);
  return finder;
}

export function finderPath(pid, id = "terra-regions") {
  finderById(id);
  return `work/region-finders/${pid}/${id}.json`;
}

export function regionLayout(doc) {
  return canonical({ image: doc.page.image_sha256, width: doc.page.width, height: doc.page.height,
    regions: doc.page.regions.map(region => ({ type: region.type, order: region.order,
      polygons: region.polygons, lines: (region.lines || []).map(line => line.polygons),
      from: !!region.source?.continues_from_earlier, later: !!region.source?.continues_later })).sort((a, b) => canonical(a).localeCompare(canonical(b))),
    omitted: (doc.source?.omitted_regions || []).map(region => ({ type: region.type, box: region.box })).sort((a, b) => canonical(a).localeCompare(canonical(b))) });
}

export function reviewedRegionLayout(current, candidate) {
  const saved = current.source?.review?.regions_page;
  if (!saved || saved.layout !== regionLayout(current)) return { reviewed: 0, matches: 0 };
  return { reviewed: 1, matches: Number(saved.layout === regionLayout(candidate)) };
}
