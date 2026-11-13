// Pending proposals for the type list: what a survey (or, later, the region finder) proposes to add, kept in the book's
// work records until a person adds or dismisses each. Nothing here changes the type list: adding goes through the
// type-list revision operations (an "add", and "rules" for a second parent or a flow), and an edited definition through
// the "description" operation. Each item records its source, so several sources can add to the one list.
export const PENDING_PATH = "work/type-proposals/pending.json";
const empty = () => ({ format: "pending-type-proposals", version: 1, items: [] });

// The items a survey run proposes. Ids are stable for a run, so recording the same run twice adds nothing.
export function surveyItems(run) {
  const source = { kind: "survey", method: run.method, run: run.id, model: run.profile.label, pages: run.pages, at_utc: run.finished_at_utc };
  const item = (kind, key, proposal) => ({ id: `${run.id}:${kind}:${key}`, kind, status: "pending", source, proposal });
  return [
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
export function additionChoice(proposal) {
  return { name: proposal.name, description: proposal.description, region: proposal.region, furniture: !!proposal.furniture,
    contains: [...(proposal.contains || [])], parents: [...(proposal.parents || [])], flow: proposal.flow || "" };
}

// The type-list operations that add a type where the choice says it belongs: an "add" with its first parent or its
// flow, then a "rules" change for each further parent, and for its flow when it also has a parent.
export function additionOperations(choice, current) {
  const name = choice.name.trim(), furniture = !!choice.furniture, container = choice.region === "container";
  const parents = furniture ? [] : [...new Set(choice.parents)];
  const flow = furniture ? "" : choice.flow || "";
  for (const parent of parents) if (!current.types[parent]) throw new Error(`Unknown parent type ${parent}.`);
  if (!furniture && !parents.length && !flow) throw new Error("Choose where the type belongs: a type that may contain it, or a reading flow.");
  const operations = [{ kind: "add", name, description: choice.description || "", region: choice.region, furniture,
    ...(container ? { contains: [...choice.contains] } : {}), ...(parents.length ? { parent: parents[0] } : flow ? { flow } : {}) }];
  for (const parent of parents.slice(1)) operations.push({ kind: "rules", name: parent,
    contains: [...(current.types[parent].contains || []), name], flow: current.types[parent].flow || "" });
  if (parents.length && flow) operations.push({ kind: "rules", name, flow });
  return operations;
}
