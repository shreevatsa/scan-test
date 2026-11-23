// A book's structure rules: the settings the rule modules take (section-rules.js, verse-group-rules.js), kept in the
// book's manifest (book.json, `rules`) and compiled here. A book with no `rules` gets the defaults below, which are
// what the reader does for any book whose type list has them (see schema/README.md, "Book rules").
//
//   { sections:   { closing, partClosing, partHeading, partAfter, divisionClosing, partLabels },
//     verseGroups: { markerType, counts } }
//
// Patterns are regular-expression source strings (null for none); partLabels is a list of names in the order of the
// book's parts, "" for a part left untitled; counts maps a marker word to the number of verses it groups.
export const DEFAULT_COUNTS = { "युगलकम्": 2, "युग्मम्": 2, "तिलकम्": 3, "विशेषकम्": 3, "कलापकम्": 4, "कुलकम्": 5 };
export const DEFAULT_RULES = Object.freeze({
  sections: Object.freeze({ closing: "section_closing", partClosing: "कथासारे", partHeading: null, partAfter: null, divisionClosing: null, partLabels: Object.freeze([]) }),
  verseGroups: Object.freeze({ markerType: "verse_group_marker", counts: Object.freeze({ ...DEFAULT_COUNTS }) }),
});
const PATTERNS = ["partClosing", "partHeading", "partAfter", "divisionClosing"];

// The stored rules with every missing setting filled in from the defaults: plain JSON, as Settings shows it.
export function bookRules(stored) {
  const s = stored?.sections || {}, v = stored?.verseGroups || {};
  const pick = (value, fallback) => value === undefined ? fallback : value;
  return {
    sections: {
      closing: s.closing || DEFAULT_RULES.sections.closing,
      partClosing: pick(s.partClosing, DEFAULT_RULES.sections.partClosing) || null,
      partHeading: s.partHeading || null, partAfter: s.partAfter || null, divisionClosing: s.divisionClosing || null,
      partLabels: Array.isArray(s.partLabels) ? [...s.partLabels] : [],
    },
    verseGroups: { markerType: v.markerType || DEFAULT_RULES.verseGroups.markerType, counts: { ...(v.counts && Object.keys(v.counts).length ? v.counts : DEFAULT_COUNTS) } },
  };
}

// Problems with stored rules (a pattern that is not a regular expression, a count that is not a whole number), as text.
export function ruleProblems(stored) {
  const rules = bookRules(stored), out = [];
  for (const name of PATTERNS) if (rules.sections[name]) {
    try { new RegExp(rules.sections[name]); } catch { out.push(`${name} is not a valid pattern: ${rules.sections[name]}`); }
  }
  for (const [word, n] of Object.entries(rules.verseGroups.counts)) if (!Number.isInteger(n) || n < 1) out.push(`the count for ${word} must be a whole number of verses`);
  if (!/^[a-z][a-z0-9_]*$/.test(rules.sections.closing)) out.push("the closing type must be a type name");
  if (!/^[a-z][a-z0-9_]*$/.test(rules.verseGroups.markerType)) out.push("the marker type must be a type name");
  return out;
}

// What the rule modules take: patterns as RegExps. `markerWords` matches a marker word in parentheses anywhere in a line.
// A pattern that is not valid is left out (ruleProblems names it), so a half-typed setting never breaks reading.
const compiled = new WeakMap();
export function compileRules(stored) {
  if (stored && typeof stored === "object" && compiled.has(stored)) return compiled.get(stored);
  const rules = bookRules(stored), re = source => { try { return source ? new RegExp(source) : null; } catch { return null; } };
  const words = Object.keys(rules.verseGroups.counts).map(word => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const out = {
    stored: rules,
    sections: { closing: rules.sections.closing, partClosing: re(rules.sections.partClosing) || /(?!)/, partHeading: re(rules.sections.partHeading),
      partAfter: re(rules.sections.partAfter), divisionClosing: re(rules.sections.divisionClosing), partLabels: rules.sections.partLabels },
    verseGroups: { markerType: rules.verseGroups.markerType, counts: rules.verseGroups.counts, markerWords: new RegExp(`\\((?:${words.join("|")})\\)`) },
  };
  if (stored && typeof stored === "object") compiled.set(stored, out);
  return out;
}
