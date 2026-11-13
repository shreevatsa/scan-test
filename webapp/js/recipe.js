// The recipe a book starts with, and what each stage says about its model and cost (webapp/README.md, "Processing a
// book"). Comparisons found the recipe; a book uses it unless someone chooses "Change".

// Region finding with GPT-6.1 Terra, proposing new types (method 097: 042's request with the pending proposals, and
// the current local step), transcription with Gemini 4 Argon at low thinking, and completion with Gemini 4 Argon at
// high thinking. Books that saved no finder (before the recipe) keep 042 (finderById's default).
export const RECIPE = { finder: "terra-proposals", reader: "argon-low", structurer: "argon-structure" };

// Measured cost per page on a 267-page scanned book (the private series, HANDOFF.md, 2026-11-12), used for a model
// until the book has its own completed calls.
// For 097, 042's figure times 1.14, the ratio of their costs on the same 25 public pages (NOTEBOOK, 2026-11-13).
export const MEASURED_PAGE_COST = { "terra-regions": 0.010, "terra-proposals": 0.011, "argon-low": 0.038, "argon-structure": 0.032 };
export const MEASURED_BASIS = "measured on a 267-page scanned book";

const STAGE_NAMES = { regions: "Regions", text: "Text", read: "Units and links" };

// The cost of a page at a stage with a model: from the book's own completed calls (the ledger's records of that stage
// and model) when it has any, else the measured figure, else none. Local models are free.
export function pageCost(profile, calls = []) {
  if (!profile) return { usd: 0, source: "free", samples: 0 };
  if (profile.provider === "local") return { usd: 0, source: "free", samples: 0 };
  const own = calls.filter(call => call.profile === profile.id && call.status === "completed" && !call.partial && Number.isFinite(call.cost_usd));
  if (own.length) return { usd: own.reduce((sum, call) => sum + call.cost_usd, 0) / own.length, source: "book", samples: own.length };
  if (Number.isFinite(MEASURED_PAGE_COST[profile.id])) return { usd: MEASURED_PAGE_COST[profile.id], source: "measured", samples: 0 };
  return { usd: null, source: "none", samples: 0 };
}

// Dollars in as few digits as say them: $0.01, $0.038, $1.20.
export function dollars(value) {
  if (!Number.isFinite(value)) return "—";
  if (value === 0) return "$0";
  return value >= 0.1 ? `$${value.toFixed(2)}` : `$${Number(value.toPrecision(2))}`;
}

// "about $0.01 a page", or what is known instead of a number.
export function perPageText(cost) {
  return cost.source === "free" ? "free" : cost.usd === null ? "no cost measured yet" : `about ${dollars(cost.usd)} a page`;
}

// Where a stage's per-page figure comes from, for its tooltip and the estimate.
export function costBasis(cost) {
  return cost.source === "book" ? `the mean of this book's ${cost.samples} completed ${cost.samples === 1 ? "call" : "calls"}`
    : cost.source === "measured" ? MEASURED_BASIS
      : cost.source === "free" ? "runs on this device"
        : "this model has no measured cost yet; process a few pages, or compare models, to measure it";
}

// The stage's one line: "Regions with GPT-6.1 Terra · reasoning off · about $0.01 a page".
export function recipeLine(stage, profile, cost) {
  if (!profile) return `${STAGE_NAMES[stage]} drawn by hand`;
  if (cost.source === "free" && /\bfree\b/.test(profile.label)) return `${STAGE_NAMES[stage]} with ${profile.label}`;
  return `${STAGE_NAMES[stage]} with ${profile.label} · ${perPageText(cost)}`;
}

// The estimate shown before a run of `count` pages.
export function runEstimate(count, cost) {
  const pages = `${count} ${count === 1 ? "page" : "pages"} to process`;
  if (cost.source === "free") return `${pages} · free, on this device.`;
  if (cost.usd === null) return `${pages} · ${costBasis(cost)}.`;
  return `${pages} · estimated new work ${dollars(cost.usd * count)} at ${dollars(cost.usd)} a page (${costBasis(cost)}). Cached results may reduce it.`;
}
