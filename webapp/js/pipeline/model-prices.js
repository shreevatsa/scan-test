// Standard Gemini token prices in USD per million. Carbon checked 2026-11-11, other profiles 2026-11-08.
export const carbonRates = [
  { from: "2026-11-10", input: 2, output: 10, cached: 0.1 },
  { from: "2026-12-01", input: 4, output: 20, cached: 0.2 },
];
export const argonRates = [
  { from: "2026-01-01", input: 2, output: 10, cached: 0.1 },
  { from: "2026-12-01", input: 4, output: 20, cached: 0.2 },
];
export const flashRates = [
  { from: "2026-01-01", input: 0.75, output: 3.75, cached: 0.075 },
  { from: "2027-01-01", input: 1.5, output: 7.5, cached: 0.15 },
];
// Gemini 4 Hydrogen: $1.50 input, $7.50 output per million; thinking tokens count as output (method 099, 2026-11-19).
// The cached-input rate is the usual tenth of the input rate; method 100 made no cached calls.
export const hydrogenRates = [
  { from: "2026-01-01", input: 1.5, output: 7.5, cached: 0.15 },
];
