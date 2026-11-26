export const RECIPE = { finder: "terra-proposals", reader: "hydrogen-low-page" };

export const MEASURED_PAGE_COST = { "terra-regions": 0.010, "terra-proposals": 0.011, "hydrogen-low-page": 0.019, "argon-low": 0.038 };
// A model measured on another book says so (its `basis`, in what pageCost returns).
const MEASURED_BASES = { "hydrogen-low-page": "method 100's run on a 519-page book" };

// The cost of a page at a stage with a model: from the book's own completed calls (the ledger's records of that stage
// and model) when it has any, else the measured figure, else none. Local models are free.
export function pageCost(profile, calls = []) {
  if (!profile) return { usd: 0, source: "free", samples: 0 };
  if (profile.provider === "local") return { usd: 0, source: "free", samples: 0 };
  const own = calls.filter(call => call.profile === profile.id && call.status === "completed" && !call.partial && Number.isFinite(call.cost_usd));
  if (own.length) return { usd: own.reduce((sum, call) => sum + call.cost_usd, 0) / own.length, source: "book", samples: own.length };
  if (Number.isFinite(MEASURED_PAGE_COST[profile.id])) return { usd: MEASURED_PAGE_COST[profile.id], source: "measured", samples: 0,
    ...(MEASURED_BASES[profile.id] ? { basis: MEASURED_BASES[profile.id] } : {}) };
  return { usd: null, source: "none", samples: 0 };
}

// Dollars in as few digits as say them: $0.01, $0.038, $1.20.
export function dollars(value) {
  if (!Number.isFinite(value)) return "—";
  if (value === 0) return "$0";
  return value >= 0.1 ? `$${value.toFixed(2)}` : `$${Number(value.toPrecision(2))}`;
}
