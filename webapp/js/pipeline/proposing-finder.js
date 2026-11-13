// Method 097: method 042's region request (book types, continuation flags, local outlines by the current local step)
// with two changes. The request also lists the book's pending proposed types ("proposed, not yet accepted"), which
// the model may use; and a region that fits neither a listed type nor a pending proposal may be given a proposed new
// type (name, one-line definition, region class) instead of plain other. Regions of a pending or new proposed type are
// never regions of an unknown type: they come back as type other with a proposed_type, which the page keeps as an
// unassigned region until the type is added (type-additions.js).
import { regionPrompt, regionSchema, regionTypeEnum, regionTypes } from "./prompts.js";
import { scaleRegions } from "./steps.js?v=20261113-type-tree-3";
import { REGION_CLASSES } from "../book-types.js?v=20261113-type-tree-3";
import { normalizeTypeName, typeNameStyle, pendingItems } from "../type-additions.js?v=20261113-type-tree-3";

const OTHER = "other";

// The pending proposed new types the request offers, by name, without names that collide with the list's own types.
export function offeredProposals(tl, pending) {
  const taken = new Set(regionTypeEnum(tl).map(normalizeTypeName)), seen = new Set(), out = [];
  for (const item of pending ? pendingItems(pending, "new_type") : []) {
    const key = normalizeTypeName(item.proposal.name);
    if (!key || taken.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push({ name: item.proposal.name, description: (item.proposal.description || "").trim(), region: item.proposal.region || OTHER,
      furniture: !!item.proposal.furniture, id: item.id });
  }
  return out;
}

function pendingSection(offered) {
  if (!offered.length) return "";
  return ["Proposed types, not yet accepted into the list. Use one of them for a region that fits it and fits none of the types above:",
    ...offered.map(type => `- ${type.name} (printed as ${type.region}${type.furniture ? ", page furniture" : ""}): ${type.description.replace(/\s+$/u, "")}`)].join("\n") + "\n\n";
}

export function proposingPrompt(tl, template, pending) {
  const offered = offeredProposals(tl, pending);
  return regionPrompt(tl, template.replace("<<PENDING>>", pendingSection(offered))
    .replace("<<PENDING_TOO>>", offered.length ? " nor a proposed type" : "")
    .replace("<<CLASSES>>", REGION_CLASSES.filter(value => value !== OTHER).join(", ")))
    .replace(`"type":"${regionTypeEnum(tl).join("|")}"`, `"type":"${[...regionTypeEnum(tl), ...offered.map(type => type.name)].join("|")}"`);
}

export function proposingSchema(tl, template, pending) {
  const schema = regionSchema(tl, template), offered = offeredProposals(tl, pending);
  schema.properties.regions.items.properties.type.enum = [...regionTypeEnum(tl), ...offered.map(type => type.name)];
  schema.properties.new_types.items.properties.region_class.enum = REGION_CLASSES.filter(value => value !== OTHER);
  return schema;
}

// Checks a 097 response and scales it as method 042's are. Returns the regions (pending and new proposed types as
// type other with proposed_type), warnings, and the page's proposals: { name, definition, region_class, furniture,
// pending, regions: [region ids] }.
export function scaleProposingRegions(parsed, W, H, tl, pending) {
  if (!parsed || typeof parsed !== "object" || Object.keys(parsed).sort().join() !== "new_types,regions" || !Array.isArray(parsed.new_types) || !Array.isArray(parsed.regions))
    throw new Error("Expected an object containing new_types and regions arrays.");
  const offered = new Map(offeredProposals(tl, pending).map(type => [type.name, type]));
  const byKey = new Map([...offered.values()].map(type => [normalizeTypeName(type.name), type]));
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
    return { ...rest, type: offered.has(rest.type) ? OTHER : rest.type };
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
    if (offered.has(source.type)) {
      const type = offered.get(source.type);
      if (key && key !== normalizeTypeName(type.name)) warnings.push(`Region ${i + 1} has a proposed type and names another; the proposed type ${type.name} is kept.`);
      propose(normalizeTypeName(type.name), { name: type.name, definition: type.description, region_class: type.region, furniture: type.furniture, pending: true }, region);
      return;
    }
    if (!key) return;
    if (source.type !== OTHER) { warnings.push(`Region ${i + 1} has type ${source.type} and also names ${asked}; the type is kept.`); return; }
    if (listed.has(key)) {
      region.type = listed.get(key);
      region.region_class = regionTypes(tl).find(([name]) => name === region.type)[1].region || OTHER;
      warnings.push(`Region ${i + 1} names ${asked}, which is the listed type ${region.type}.`);
      return;
    }
    if (byKey.has(key)) {
      const type = byKey.get(key);
      propose(key, { name: type.name, definition: type.description, region_class: type.region, furniture: type.furniture, pending: true }, region);
      return;
    }
    if (!defined.has(key)) warnings.push(`Region ${i + 1} names a new type ${asked} that the response does not define.`);
    propose(key, { ...(defined.get(key) || { name: asked, definition: "", region_class: OTHER }), furniture: !source.keep, pending: false }, region);
  });
  for (const [key, type] of defined) if (!proposals.has(key) && !byKey.has(key) && !listed.has(key))
    warnings.push(`New type ${type.name} is not used by any region and is left out.`);
  return { regions, warnings, proposals: [...proposals.values()] };
}
