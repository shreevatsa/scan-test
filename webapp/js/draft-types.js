// Types a book still has from the draft list (webapp/types/generic.json) that no page or pending proposal uses. A new
// book's type list carries `source.draft` until its types are initialized (revisions keep it); one that was initialized
// from the draft list records that in its first revision, an "initialize" operation holding the list it replaced. A type
// is a draft type when the list is such and the type is still in the book under a name of the draft list.
const canonical = value => JSON.stringify(value, (key, item) => item && typeof item === "object" && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map(name => [name, item[name]])) : item);

export function draftTypeNames(tl, generic) {
  if (!generic?.types) return [];
  const start = (tl.source?.revisions || []).flatMap(revision => revision.operations || []).find(operation => operation.kind === "initialize");
  const fromDraft = tl.source?.draft || (start?.previous?.types && canonical(start.previous.types) === canonical(generic.types));
  return fromDraft ? Object.keys(generic.types).filter(name => Object.hasOwn(tl.types, name)) : [];
}

// How many regions and units of each type the page documents have.
export function typeUsage(docs) {
  const counts = {};
  for (const doc of docs) {
    for (const region of doc?.page?.regions || []) counts[region.type] = (counts[region.type] || 0) + 1;
    for (const unit of doc?.units || []) counts[unit.type] = (counts[unit.type] || 0) + 1;
  }
  return counts;
}

// Draft types used on no page and not named by a pending proposal (as its parent, child or alias), nor holding a used
// type, left out where
// removing one would strand a type that stays (a printed type whose only places are among the removed).
export function unusedDraftTypes(tl, generic, docs, proposals = []) {
  const counts = typeUsage(docs), named = new Set();
  for (const item of proposals) {
    const proposal = item.proposal || {};
    for (const name of [proposal.name, ...(proposal.aliases || []), ...(proposal.parents || []), ...(proposal.contains || []), ...(proposal.types || [])]) if (name) named.add(name);
  }
  const candidates = new Set(draftTypeNames(tl, generic).filter(name => !counts[name] && !named.has(name) && !(tl.types[name].contains || []).some(child => counts[child])));
  for (let changed = true; changed;) {
    changed = false;
    for (const [name, type] of Object.entries(tl.types)) {
      if (candidates.has(name) || type.flow || type.role === "furniture") continue;
      const parents = Object.entries(tl.types).filter(([, other]) => other.contains?.includes(name)).map(([parent]) => parent);
      for (const parent of parents) if (candidates.delete(parent)) changed = true;
    }
  }
  return { names: [...candidates], counts };
}
