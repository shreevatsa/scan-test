export const money = (value, digits = 4) => Number.isFinite(value) ? `$${value.toFixed(digits)}` : "—";
