// Pending proposals for the type list: what a survey (or, later, the region finder) proposes to add, kept in the book's
// work records until a person adds or dismisses each. Nothing here changes the type list: adding goes through the
// type-list revision operations (an "add", and "rules" for a second parent or a flow), and an edited definition through
// the "description" operation. Each item records its source, so several sources can add to the one list.
import { REGION_CLASSES } from "./book-types.js?v=20261113-flags-1";
export const PENDING_PATH = "work/type-proposals/pending.json";
const empty = () => ({ format: "pending-type-proposals", version: 1, items: [] });

// The items a survey run proposes. Ids are stable for a run, so recording the same run twice adds nothing.
export function surveyItems(run) {
  const source = { kind: "survey", method: run.method, run: run.id, model: run.profile.label, pages: run.pages, at_utc: run.finished_at_utc };
  const item = (kind, key, proposal) => ({ id: `${run.id}:${kind}:${key}`, kind, status: "pending", source, proposal });
  return [
    ...run.result.proposed_description?.trim() ? [item("book_description", "description", { description: run.result.proposed_description.trim() })] : [],
    ...run.result.new_types.map(type => item("new_type", type.name, type)),
    ...run.result.definition_edits.map(edit => item("definition_edit", edit.name, edit)),
    ...run.result.possible_duplicates.map((group, index) => item("question", `duplicate-${index + 1}`, { question: group.question, types: group.types, duplicate: true })),
    ...run.result.questions.map((question, index) => item("question", `question-${index + 1}`, { question, types: [] })),
  ];
}

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

// What a survey found, as text with links to where it went: strings and { link: "proposals" | "questions", text }.
export function surveyOutcome(items) {
  const count = kind => items.filter(item => item.kind === kind).length;
  const types = count("new_type"), edits = count("definition_edit"), questions = count("question"), description = count("book_description");
  const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
  const parts = [];
  if (!types && !edits && !description) parts.push("Nothing new: no new types or definition edits.");
  else {
    if (types) parts.push({ link: "proposals", text: `${plural(types, "proposed type")}` }, " — review them in Proposed types.");
    const rest = [edits ? plural(edits, "suggested definition edit") : "", description ? "a proposed book description" : ""].filter(Boolean);
    if (rest.length) parts.push(` ${types ? "Also " : "Found "}${rest.join(" and ")}${types ? "" : ", in Proposed types"}.`);
  }
  if (questions) parts.push(" ", { link: "questions", text: plural(questions, "question") }, " — see Questions to review.");
  return parts;
}

export function additionChoice(proposal) {
  return { name: proposal.name, description: proposal.description, region: isRealClass(proposal.region) ? proposal.region : "", furniture: !!proposal.furniture,
    contains: [...(proposal.contains || [])], parents: [...(proposal.parents || [])], flow: proposal.flow || "" };
}

// The type-list operations that add a type where the choice says it belongs: an "add" with its first parent or its
// flow, then a "rules" change for each further parent, and for its flow when it also has a parent.
export function additionOperations(choice, current) {
  const name = choice.name.trim(), furniture = !!choice.furniture, container = choice.region === "container";
  const parents = furniture ? [] : [...new Set(choice.parents)];
  const flow = furniture ? "" : choice.flow || "";
  if (!isRealClass(choice.region)) throw new Error("Choose how this type is printed: heading, paragraph, …");
  for (const parent of parents) if (!current.types[parent]) throw new Error(`Unknown parent type ${parent}.`);
  if (!furniture && !parents.length && !flow) throw new Error("Choose where the type belongs: a type that may contain it, or a reading flow.");
  const operations = [{ kind: "add", name, description: choice.description || "", region: choice.region, furniture,
    ...(container ? { contains: [...choice.contains] } : {}), ...(parents.length ? { parent: parents[0] } : flow ? { flow } : {}) }];
  for (const parent of parents.slice(1)) operations.push({ kind: "rules", name: parent,
    contains: [...(current.types[parent].contains || []), name], flow: current.types[parent].flow || "" });
  if (parents.length && flow) operations.push({ kind: "rules", name, flow });
  return operations;
}

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

// The evidence pages of a proposal: PDF pages from a survey, and page ids from the region finder.
export function proposalEvidence(item) {
  const finder = item.evidence || [];
  const pages = [...new Set(finder.map(value => value.page))];
  return { pdf_pages: [...(item.proposal.evidence_pages || [])], pages, regions: finder.reduce((n, value) => n + value.regions.length, 0) };
}
