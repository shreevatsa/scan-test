// Local unit membership and ancestry, independent of model-generated unit IDs.
export function structureUnits(parsed) {
  const regions = new Set(parsed.regions.map(region => region.id));
  const units = new Map(parsed.units.map(unit => [unit.id, { ...unit, parents: [] }]));
  for (const unit of units.values()) for (const child of unit.children || []) units.get(child)?.parents.push(unit.id);
  const members = (id, parents = []) => {
    if (regions.has(id)) return [id];
    const unit = units.get(id);
    if (!unit) return [`Unknown region or unit ${id}`];
    if (parents.includes(id)) return ["Circular unit reference"];
    return (unit.children || []).flatMap(child => members(child, [...parents, id]));
  };
  for (const unit of units.values()) unit.members = members(unit.id);
  return units;
}

export function unitDecision(unit) {
  return { type: unit.type, number: unit.number ?? null, label: unit.label ?? null,
    open_start: Boolean(unit.open_start), open_end: Boolean(unit.open_end), regions: unit.members };
}

export function structureDecisions(parsed) {
  const units = structureUnits(parsed);
  const paths = (id, parents = []) => {
    const unit = units.get(id);
    if (!unit) return [[{ invalid: `Unknown unit ${id}` }]];
    if (parents.includes(id)) return [[{ invalid: "Circular unit hierarchy" }]];
    const ancestors = unit.parents.length ? unit.parents.flatMap(parent => paths(parent, [...parents, id])) : [[]];
    return ancestors.map(path => [...path, unitDecision(unit)]);
  };
  const flows = (parsed.flows || []).flatMap(flow => flow.units.map((id, order) => ({ flow: flow.flow, order, unit: units.get(id) })));
  const relations = (parsed.relations || []).map(relation => ({ ...relation,
    to: units.has(relation.to) ? { type: units.get(relation.to).type, regions: units.get(relation.to).members } : { invalid: `Unknown unit ${relation.to}` } }));
  return new Map(parsed.regions.map(region => [region.id, {
    type: region.type, line_ends: region.ends,
    units: [...units.values()].filter(unit => (unit.children || []).includes(region.id)).flatMap(unit => paths(unit.id))
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    flows: flows.filter(flow => flow.unit?.members.includes(region.id)).map(({ flow, order }) => ({ flow, order })),
    relations: relations.filter(relation => relation.region === region.id || relation.to.regions?.includes(region.id)),
  }]));
}

export function structureDifferences(candidate, reference) {
  const actual = structureDecisions(candidate), expected = structureDecisions(reference);
  const ids = new Set([...actual.keys(), ...expected.keys()]);
  return [...ids].filter(id => JSON.stringify(actual.get(id)) !== JSON.stringify(expected.get(id)));
}
