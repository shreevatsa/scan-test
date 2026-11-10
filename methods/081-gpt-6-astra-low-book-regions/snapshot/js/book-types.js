import { checkTypes, typeRevision } from "./schema.js?v=20261110-reading-2";
import { regionTypePaths } from "./pipeline/provisional.js?v=20261110-reading-2";

export const REGION_CLASSES = ["verse", "paragraph", "heading", "lead_in", "list_item", "formula", "note", "table", "figure", "caption", "running_header", "page_number", "other"];

function revision(current, next, operation, at) {
  const n = typeRevision(current.source?.revision) + 1;
  next.source = { ...next.source, ...(typeof current.source?.revision === "string" ? { legacy_revision: current.source.revision } : {}), revision: n, revisions: [...(current.source?.revisions || []),
    { n, at_utc: at, by: "user", operations: [operation] }] };
  return next;
}

export function addBookType(current, { name, description = "", region, furniture = false, parent = null, flow = null, contains = [] }, at = new Date().toISOString()) {
  name = name.trim();
  if (!/^[\p{L}\p{N}_][\p{L}\p{N}\p{M}_.-]*$/u.test(name) || ["__proto__", "constructor", "prototype"].includes(name))
    throw new Error("Use letters, digits, underscores, dots or dashes for the type name.");
  if (Object.hasOwn(current.types, name) || Object.hasOwn(current.source?.aliases || {}, name) || current.source?.retired_types?.includes(name)) throw new Error(`The type ${name} already exists or is reserved by an earlier revision.`);
  if (!REGION_CLASSES.includes(region) && region !== "container") throw new Error("Choose how this type is printed.");
  if (region === "container" && furniture) throw new Error("A container belongs to a reading flow.");
  if (region === "container" && !contains.length) throw new Error("Choose at least one child type for this container.");
  const next = structuredClone(current), definition = region === "container" ? { description: description.trim(), contains: [...new Set(contains)] } : { description: description.trim(), region };
  if (furniture) definition.role = "furniture";
  else if (parent) {
    const container = next.types[parent];
    if (!container?.contains || container.role === "furniture") throw new Error("Choose a container that can hold this type.");
    container.contains.push(name);
  } else {
    if (!Object.hasOwn(next.flows, flow)) throw new Error("Choose the reading flow for this type.");
    definition.flow = flow;
  }
  next.types[name] = definition;
  const errors = checkTypes(next);
  if (errors.length) throw new Error(errors[0]);
  if (!furniture && !regionTypePaths(next).has(name)) throw new Error("Choose a parent with a reading flow.");
  return revision(current, next, { kind: "add", name, definition, parent }, at);
}

export function initialBookTypes(current, proposed, bookId, title, at = new Date().toISOString()) {
  const next = structuredClone(proposed);
  next.book_id = bookId;
  next.title = title;
  const errors = checkTypes(next);
  if (errors.length) throw new Error(errors[0]);
  const { source, ...previous } = current;
  revision(current, next, { kind: "initialize", previous }, at);
  delete next.source.draft;
  next.source.region_reset_revision = next.source.revision;
  return next;
}
