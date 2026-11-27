import { regionPrompt, regionSchema, regionTypes } from "./prompts.js?v=20261127-place-regions";
import { scaleRegions } from "./steps.js?v=20261127-place-regions";

const REGION_CLASSES = ["verse", "paragraph", "heading", "lead_in", "list_item", "formula", "note", "table", "figure", "caption", "running_header", "page_number", "other"];
const normalizeTypeName = name => String(name || "").normalize("NFC").toLowerCase().replace(/[\s_.\-–—]+/gu, "");
// A proposed name in the form the type list accepts: spaces become underscores, other punctuation is dropped.
const typeNameStyle = name => String(name || "").normalize("NFC").trim().replace(/\s+/gu, "_")
  .replace(/[^\p{L}\p{N}\p{M}_.-]/gu, "").replace(/^[^\p{L}\p{N}_]+/u, "");

const OTHER = "other";

export function proposingPrompt(tl, template) {
  return regionPrompt(tl, template.replace("<<PENDING>>", "").replace("<<PENDING_TOO>>", "")
    .replace("<<CLASSES>>", REGION_CLASSES.filter(value => value !== OTHER).join(", ")));
}

export function proposingSchema(tl, template) {
  const schema = regionSchema(tl, template);
  schema.properties.new_types.items.properties.region_class.enum = REGION_CLASSES.filter(value => value !== OTHER);
  return schema;
}

// Scale the boxes and attach this page’s proposed new types.
export function scaleProposingRegions(parsed, W, H, tl) {
  if (!parsed || typeof parsed !== "object" || Object.keys(parsed).sort().join() !== "new_types,regions" || !Array.isArray(parsed.new_types) || !Array.isArray(parsed.regions))
    throw new Error("Expected an object containing new_types and regions arrays.");
  const listed = new Map(regionTypes(tl).map(([name]) => [normalizeTypeName(name), name]));
  const classes = REGION_CLASSES.filter(value => value !== OTHER), defined = new Map(), warnings = [];
  parsed.new_types.forEach((type, i) => {
    if (!type || Object.keys(type).sort().join() !== "definition,name,region_class" || typeof type.name !== "string" ||
        typeof type.definition !== "string" || !classes.includes(type.region_class)) throw new Error(`Invalid new type ${i + 1}`);
    const name = typeNameStyle(type.name), key = normalizeTypeName(name);
    if (!key) throw new Error(`New type ${i + 1} has no usable name`);
    if (defined.has(key)) { warnings.push(`New type ${name} is defined twice; the first definition is kept.`); return; }
    defined.set(key, { name, definition: type.definition.trim(), region_class: type.region_class });
  });
  const plain = parsed.regions.map((region, i) => {
    if (!region || typeof region !== "object" || typeof region.proposed_type !== "string") throw new Error(`Invalid fields or type at region ${i + 1}`);
    const { proposed_type: proposed, ...rest } = region;
    return rest;
  });
  const { regions, warnings: base } = scaleRegions({ regions: plain }, W, H, tl);
  warnings.push(...base);
  const proposals = new Map();
  const propose = (key, entry, region) => {
    if (!proposals.has(key)) proposals.set(key, { ...entry, regions: [] });
    proposals.get(key).regions.push(region.region_id);
    region.type = OTHER;
    region.proposed_type = proposals.get(key).name;
    region.region_class = proposals.get(key).region_class;
  };
  parsed.regions.forEach((source, i) => {
    const region = regions[i], asked = typeNameStyle(source.proposed_type), key = normalizeTypeName(asked);
    if (!key) return;
    if (source.type !== OTHER) { warnings.push(`Region ${i + 1} has type ${source.type} and also names ${asked}; the type is kept.`); return; }
    if (listed.has(key)) {
      region.type = listed.get(key);
      region.region_class = regionTypes(tl).find(([name]) => name === region.type)[1].region || OTHER;
      warnings.push(`Region ${i + 1} names ${asked}, which is the listed type ${region.type}.`);
      return;
    }
    if (!defined.has(key)) warnings.push(`Region ${i + 1} names a new type ${asked} that the response does not define.`);
    propose(key, { ...(defined.get(key) || { name: asked, definition: "", region_class: OTHER }), furniture: !source.keep }, region);
  });
  for (const [key, type] of defined) if (!proposals.has(key) && !listed.has(key))
    warnings.push(`New type ${type.name} is not used by any region and is left out.`);
  return { regions, warnings, proposals: [...proposals.values()] };
}
