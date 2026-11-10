// The two model calls' prompts and response schemas, generated from a book's type list: ports of method 042's
// prompt.py (the region call) and method 055's prompt.py (the transcription call), with the same templates
// (webapp/pipeline/*.txt, copies of the methods' files). A test checks that they give the same text as Python.

// ---------------------------------------------------------------- the region call (method 042)

const CLASS_RULES = {
  verse: "Include all its lines and its number or end mark. Never one region per line, and never two verses in one region, even when consecutive verses are set with no space between them. If other material interrupts a verse, each printed part is its own region.",
  paragraph: "One region per paragraph, including one continued from the previous page or onto the next.",
  heading: "",
  lead_in: "It often ends in a dash or colon.",
  list_item: "One region per entry.",
  formula: "Lines that continue one another (for example a chain of = or ≡) form one region; displays separated by prose or by space are separate.",
  note: "Include its marker. Separate neighboring notes even when they share a printed line.",
  table: "One region per table, including any rotated text in it.",
  figure: "One region per illustration, without its caption.",
  caption: "One region per caption.",
  running_header: "",
  page_number: "",
  other: "",
};
const OTHER = "other";
const OTHER_DESCRIPTION = "Anything else on the page that none of the types above describes. Printer's signature marks and catchwords are other, keep=false.";

const rstrip = s => s.replace(/\s+$/u, "");
const stripDot = s => s.replace(/\.+$/u, "");
const bookLine = tl => (stripDot(tl.title) + ". " + (tl.description || "").trim()).trim();

export const regionTypes = tl => Object.entries(tl.types).filter(([, t]) => "region" in t || t.role === "furniture");

export function regionTypeEnum(tl) {
  const names = regionTypes(tl).map(([n]) => n);
  return names.includes(OTHER) ? names : [...names, OTHER];
}

export function regionClasses(tl) {
  const out = Object.fromEntries(regionTypes(tl).map(([n, t]) => [n, t.region || OTHER]));
  if (!(OTHER in out)) out[OTHER] = OTHER;
  return out;
}

function regionTypeLines(tl) {
  const lines = [];
  for (const [name, t] of regionTypes(tl)) {
    const rule = CLASS_RULES[t.region || OTHER] || "";
    let text = rstrip(t.description);
    if (rule) text += " " + rule;
    if (t.role === "furniture") text += " Page furniture, keep=false.";
    lines.push(`- ${name}: ${text}`);
  }
  if (!(OTHER in tl.types)) lines.push(`- ${OTHER}: ${OTHER_DESCRIPTION}`);
  return lines.join("\n");
}

function nestingRule(tl) {
  const offered = Object.fromEntries(regionTypes(tl));
  const pairs = [];
  for (const [outer, t] of Object.entries(offered)) for (const inner of t.contains || []) if (inner in offered) pairs.push([outer, inner]);
  if (!pairs.length) return "";
  const [outer, inner] = pairs[0];
  const others = pairs.slice(1).map(([o, i]) => `a ${i} inside a ${o}`).join(", ");
  return "- A region holds the text of one unit only. Where one unit contains another, as with a " +
    `${inner} inside a ${outer}` + (others ? ` (or ${others})` : "") +
    ", the inner unit is its own region, and the outer unit's text before it and after it are separate regions of the outer unit.\n";
}

function largerUnits(tl) {
  const big = Object.entries(tl.types).filter(([, t]) => !("region" in t) && t.role !== "furniture");
  if (!big.length) return "";
  const lines = ["Larger units of this book are made of the regions above. They are listed so that you know the book's structure; never return them as regions:"];
  for (const [name, t] of big) lines.push(`- ${name}: ${rstrip(t.description)}`);
  return lines.join("\n") + "\n\n";
}

export function regionPrompt(tl, template) {
  return template.replace("<<BOOK>>", bookLine(tl))
    .replace("<<TYPES>>", regionTypeLines(tl))
    .replace("<<LARGER_UNITS>>\n", largerUnits(tl))
    .replace("<<NESTING>>\n", nestingRule(tl))
    .replace("<<TYPE_ENUM>>", regionTypeEnum(tl).join("|"));
}

export function regionSchema(tl, template) {
  const schema = JSON.parse(JSON.stringify(template));
  schema.properties.regions.items.properties.type.enum = regionTypeEnum(tl);
  return schema;
}

// ---------------------------------------------------------------- the transcription call (method 055)

const ENDS = ["space", "hyphen", "join", "line"];
const furnitureTypes = tl => Object.entries(tl.types).filter(([, t]) => t.role === "furniture").map(([n]) => n);
const unitTypes = tl => Object.entries(tl.types).filter(([, t]) => t.role !== "furniture").map(([n]) => n);

function unitTypeLines(tl) {
  const lines = [];
  for (const [name, t] of Object.entries(tl.types)) {
    if (t.role === "furniture") continue;
    const kind = ["region" in t ? "printed as regions" : "a larger unit, made of other units"];
    if ((t.contains || []).length) kind.push("contains " + t.contains.join(", "));
    if (t.flow) kind.push("may stand at the top of flow " + t.flow);
    lines.push(`- ${name} (${kind.join("; ")}): ${rstrip(t.description)}`);
  }
  return lines.join("\n");
}

function relationLines(tl) {
  const rel = tl.relations || {};
  if (!Object.keys(rel).length) return "";
  const out = ["- relations: only those whose both ends are on this page. For a note marker you wrote in square brackets, a relation " +
    "of type note from the region and the line number n where the marker stands, with the marker as written without " +
    "the brackets, to the id of the note's unit. Use an empty marker for a relation without one. The book's relation types:"];
  for (const [name, text] of Object.entries(rel)) out.push(`  - ${name}: ${text}`);
  return out.join("\n") + "\n";
}

export function transcriptionPrompt(tl, template) {
  const conventions = (tl.conventions && tl.conventions.length) ? tl.conventions : ["Transcribe as printed, in Unicode NFC."];
  return template.replace("<<BOOK>>", bookLine(tl))
    .replace("<<CONVENTIONS>>", conventions.map(c => "  - " + c).join("\n"))
    .replace("<<TYPES>>", unitTypeLines(tl))
    .replace("<<FURNITURE>>", furnitureTypes(tl).join(", ") || "none in this book")
    .replace("<<FLOWS>>", Object.entries(tl.flows).map(([k, v]) => `  - ${k}: ${v}`).join("\n"))
    .replace("<<RELATIONS>>\n", relationLines(tl));
}

export const regionCaption = (rid, type, n) => `${rid}: ${type}, ${n} line${n !== 1 ? "s" : ""}`;

// Method 052's schema: regions as a list with ids from the page's region ids, and free line counts.
export function transcriptionSchema(tl, regionIds) {
  const item = {
    type: "object", additionalProperties: false, required: ["id", "type", "lines", "uncertain", "note"],
    properties: {
      id: { type: "string", enum: regionIds },
      type: { enum: regionTypeEnum(tl) },
      lines: { type: "array", items: { type: "object", additionalProperties: false, required: ["n", "text", "end"],
        properties: { n: { type: "integer" }, text: { type: "string" }, end: { enum: ENDS } } } },
      uncertain: { type: "boolean" },
      note: { type: ["string", "null"] },
    },
  };
  const unit = { type: "object", additionalProperties: false, required: ["id", "type", "number", "label", "open_start", "open_end", "children"],
    properties: { id: { type: "string" }, type: { enum: unitTypes(tl) }, number: { type: ["string", "null"] }, label: { type: ["string", "null"] },
                  open_start: { type: "boolean" }, open_end: { type: "boolean" }, children: { type: "array", items: { type: "string" } } } };
  const flow = { type: "object", additionalProperties: false, required: ["flow", "units"],
    properties: { flow: { enum: Object.keys(tl.flows) }, units: { type: "array", items: { type: "string" } } } };
  const props = { regions: { type: "array", items: item }, units: { type: "array", items: unit }, flows: { type: "array", items: flow } };
  if (tl.relations && Object.keys(tl.relations).length) {
    props.relations = { type: "array", items: { type: "object", additionalProperties: false, required: ["type", "region", "line", "marker", "to"],
      properties: { type: { enum: Object.keys(tl.relations) }, region: { type: "string" }, line: { type: "integer" }, marker: { type: "string" }, to: { type: "string" } } } };
  }
  return { type: "object", additionalProperties: false, required: Object.keys(props), properties: props };
}
