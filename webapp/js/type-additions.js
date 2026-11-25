// Pending proposals for the type list: what the region finder (method 097) proposes to add, kept in the book's work
// records (work/type-proposals/pending.json, which older books may also hold survey items in). Nothing here changes the
// type list; the page editor's "Add type X" does that through the book's add-type operation.
import { REGION_CLASSES } from "./book-types.js?v=20261125-leaveout-1";
export const PENDING_PATH = "work/type-proposals/pending.json";
const empty = () => ({ format: "pending-type-proposals", version: 1, items: [] });

export async function addPendingProposals(store, items) {
  return store.updateWork(PENDING_PATH, old => {
    const record = old?.format === "pending-type-proposals" ? structuredClone(old) : empty();
    const known = new Set(record.items.map(item => item.id));
    record.items.push(...structuredClone(items).filter(item => !known.has(item.id)));
    return record;
  });
}

export async function readPendingProposals(store) {
  const record = await store.readWork(PENDING_PATH);
  return record?.format === "pending-type-proposals" ? record : empty();
}

export const pendingItems = (record, kind) => record.items.filter(item => item.status === "pending" && (!kind || item.kind === kind));

// decision: { status: "added" | "dismissed" | "applied" | "answered", as, same_as, revision, answer }
export async function decideProposal(store, id, decision, at = new Date().toISOString()) {
  if (!["added", "dismissed", "applied", "answered"].includes(decision.status)) throw new Error("Unknown decision.");
  return store.updateWork(PENDING_PATH, old => {
    const record = structuredClone(old || empty()), item = record.items.find(value => value.id === id);
    if (!item) throw new Error("This proposal is no longer in the book.");
    if (item.status !== "pending") throw new Error("This proposal was already decided.");
    const { status, ...rest } = decision;
    item.status = status;
    item.decision = { ...rest, at_utc: at };
    return record;
  });
}

// The form's starting values for a proposed type.
// "other" is the region finder's escape class for regions that fit no type, not a class a type may have.
export const isRealClass = region => region === "container" || (REGION_CLASSES.includes(region) && region !== "other");

// ---------------------------------------------------------------- proposals from the region finder (method 097)

// Names are compared without case and separators, so "Colophon", "colophon_line" and "colophon-line" are one name
// apart from "colophonline" only in spelling.
export const normalizeTypeName = name => String(name || "").normalize("NFC").toLowerCase().replace(/[\s_.\-–—]+/gu, "");
// A proposed name in the form the type list accepts: spaces become underscores, other punctuation is dropped.
export const typeNameStyle = name => String(name || "").normalize("NFC").trim().replace(/\s+/gu, "_")
  .replace(/[^\p{L}\p{N}\p{M}_.-]/gu, "").replace(/^[^\p{L}\p{N}_]+/u, "");
export const itemNames = item => [item.proposal.name, ...(item.proposal.aliases || [])];

// Records what one region-finder result proposed. A proposal whose name matches a pending new type (from any source)
// is merged into it, adding its evidence; one matching a dismissed proposal adds its evidence there without reopening
// it; one matching a type already added (or assigned to an existing type) adds nothing; any other becomes a new
// pending item. Recording the same result twice adds nothing.
export async function recordFinderProposals(store, record, { pdfPage = null } = {}) {
  const proposals = record.type_proposals || [];
  if (!proposals.length) return null;
  const run = record.region_call?.path || `${record.page}@${record.made_at_utc}`;
  const at = record.made_at_utc || new Date().toISOString();
  return store.updateWork(PENDING_PATH, old => {
    const out = old?.format === "pending-type-proposals" ? structuredClone(old) : empty();
    for (const proposal of proposals) {
      const key = normalizeTypeName(proposal.name);
      const entry = { kind: "finder", method: record.profile?.method || "", run, page: record.page, ...(pdfPage ? { pdf_page: pdfPage } : {}),
        regions: [...proposal.regions], at_utc: at };
      const matches = out.items.filter(item => item.kind === "new_type" && itemNames(item).some(name => normalizeTypeName(name) === key));
      const target = matches.find(item => item.status === "pending") || matches.find(item => item.status === "dismissed" && !item.decision?.same_as);
      if (target) {
        target.evidence ||= [];
        if (!target.evidence.some(value => value.run === run && value.page === entry.page)) target.evidence.push(entry);
        if (!itemNames(target).includes(proposal.name)) (target.proposal.aliases ||= []).push(proposal.name);
        continue;
      }
      if (matches.length) continue;
      out.items.push({ id: `finder:${run}:${key}`, kind: "new_type", status: "pending",
        source: { kind: "finder", method: entry.method, run, model: record.profile?.label || "", page: record.page, ...(pdfPage ? { pdf_page: pdfPage } : {}), regions: [...proposal.regions], at_utc: at },
        proposal: { name: proposal.name, description: proposal.definition, region: proposal.region_class, furniture: !!proposal.furniture,
          contains: [], parents: [], flow: "", evidence_pages: [], evidence: "" },
        evidence: [entry] });
    }
    return out;
  });
}

// Where each proposed name now goes: a type added from the proposal (under its chosen name), or the existing type it
// was found to be the same as. Keys are normalized proposed names.
export function proposalAssignments(record, types) {
  const out = new Map();
  for (const item of record?.items || []) {
    if (item.kind !== "new_type") continue;
    const target = item.status === "added" ? item.decision?.as || item.proposal.name : item.status === "dismissed" ? item.decision?.same_as : null;
    if (!target || !types.types[target]) continue;
    for (const name of itemNames(item)) out.set(normalizeTypeName(name), target);
  }
  return out;
}

// The unassigned regions of a page that carry a proposed name in `keys` (normalized names).
export const waitingRegions = (doc, keys) => (doc?.source?.omitted_regions || [])
  .map((region, index) => ({ ...region, index })).filter(region => region.proposed_type && keys.has(normalizeTypeName(region.proposed_type)));

// The blocks of a page kept under a type of their kind while the type the finder proposed for them waits (provisional.js
// keeps every area with text in the book): those whose proposed name is in `keys`, still of the type they were kept as.
export const keptProposed = (doc, keys) => (doc?.page?.regions || []).filter(region => region.source?.proposed_type &&
  region.source.kept_as === region.type && keys.has(normalizeTypeName(region.source.proposed_type)));
// What a page has waiting for a proposed type: its unassigned areas and its kept blocks.
export const proposedOnPage = (doc, keys) => waitingRegions(doc, keys).length + keptProposed(doc, keys).length;

// A page with its waiting areas of one proposed type (`key`, a normalized name) made blocks of type `type`: each with
// the outline and line pieces the region finder drew (its saved record), and the text the page's saved reading has for
// it; and its blocks kept under another type meanwhile given type `type`, their text as it is. Returns { doc, restored,
// withText } (ids). An area whose record is gone is left waiting.
export function restoreWaiting(doc, record, reading, key, type, types, restoredText) {
  const next = structuredClone(doc), restored = [], retyped = [];
  for (const region of keptProposed(next, new Set([key]))) {
    region.type = type;
    delete region.source.kept_as;
    region.source.added_by = "the person, adding a proposed type";
    retyped.push(region.id);
  }
  const waiting = waitingRegions(next, new Set([key])).sort((a, b) => b.index - a.index);
  for (const area of waiting) {
    const original = originalOf(record, area);
    if (!original?.polygons?.length || next.page.regions.some(region => region.id === area.region)) continue;
    next.page.regions.push(areaBlock(area, original, type, types, { added_by: "the person, adding a proposed type" }));
    next.source.omitted_regions.splice(area.index, 1);
    restored.push(area.region);
  }
  if (next.source.omitted_regions && !next.source.omitted_regions.length) delete next.source.omitted_regions;
  const withText = restored.length && reading ? restoredText(next, reading, types, restored) : [];
  const hasText = id => (next.page.regions.find(region => region.id === id)?.lines || []).some(line => (line.text || "").trim());
  return { doc: next, restored: [...retyped, ...restored], withText: [...retyped.filter(hasText), ...withText] };
}

// The region finder's record of a waiting area.
const originalOf = (record, area) => record?.regions?.find(value => (value.document_region_id || `r${value.region_id}`) === area.region);

// A waiting area as a block of `type`: the outline and line pieces the region finder drew (its record), no text yet.
function areaBlock(area, original, type, types, extra) {
  const block = { id: area.region, type, polygons: structuredClone(original.polygons), box: (original.model_box || original.bounds).map(Math.round),
    order: original.reading_order ?? null,
    lines: types.types[type]?.region === "figure" ? undefined : (original.lines || []).filter(line => line.polygons?.length).map(line => ({ line: line.line_id, polygons: structuredClone(line.polygons) })),
    source: { region_id: original.region_id, method_type: original.type, region_class: original.region_class, proposed_type: original.proposed_type,
      continues_from_earlier: Boolean(original.continues_from_earlier), continues_later: Boolean(original.continues_later), ...extra } };
  if (block.lines === undefined) delete block.lines;
  return block;
}

// A page made before every area with text was kept in the book (pipeline/provisional.js): each area still waiting for
// the type the finder proposed for it made a block of a type of its kind (`keptType(region, types)`: its class as the
// finder's record has it, a paragraph where the record has none), with the text the page's saved reading has for it,
// and marked as kept (source.kept_as) while the proposal waits, as a page made now has it. Returns { doc, kept, withText }
// (ids); an area of no known kind, or whose record is gone, is left waiting.
export function keepWaiting(doc, record, reading, types, restoredText, keptType) {
  const next = structuredClone(doc), kept = [];
  const waiting = (next.source?.omitted_regions || []).map((region, index) => ({ ...region, index })).filter(region => region.proposed_type)
    .sort((a, b) => b.index - a.index);
  for (const area of waiting) {
    const original = originalOf(record, area);
    if (!original?.polygons?.length || next.page.regions.some(region => region.id === area.region)) continue;
    const type = keptType({ proposed_type: area.proposed_type, region_class: original.region_class || area.region_class || "paragraph" }, types);
    if (!type) continue;
    next.page.regions.push(areaBlock(area, original, type, types, { proposed_type: area.proposed_type, kept_as: type }));
    next.source.omitted_regions.splice(area.index, 1);
    kept.push(area.region);
  }
  if (next.source?.omitted_regions && !next.source.omitted_regions.length) delete next.source.omitted_regions;
  const withText = kept.length && reading ? restoredText(next, reading, types, kept) : [];
  return { doc: next, kept, withText };
}
