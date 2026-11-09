// Compare structural choices while ignoring arbitrary model-generated unit IDs.
export function structureDecisions(parsed) {
  const regions = new Set(parsed.regions.map(region => region.id));
  const units = new Map(parsed.units.map(unit => [unit.id, unit]));
  const tree = (id, parents = []) => {
    if (regions.has(id)) return { region: id };
    const unit = units.get(id);
    if (!unit || parents.includes(id)) return { invalid: id };
    return { type: unit.type, number: unit.number ?? null, label: unit.label ?? null,
      open_start: Boolean(unit.open_start), open_end: Boolean(unit.open_end),
      children: (unit.children || []).map(child => tree(child, [...parents, id])) };
  };
  const contains = (node, rid) => node.region === rid || (node.children || []).some(child => contains(child, rid));
  const trees = [...units.keys()].map(id => tree(id));
  const flows = (parsed.flows || []).map(flow => ({ flow: flow.flow, units: flow.units.map(id => tree(id)) }));
  const relations = (parsed.relations || []).map(relation => ({ ...relation, to: tree(relation.to) }));
  return new Map(parsed.regions.map(region => [region.id, {
    type: region.type, line_ends: region.ends,
    units: trees.filter(unit => contains(unit, region.id)).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    flows: flows.flatMap(flow => flow.units.flatMap((unit, order) => contains(unit, region.id) ? [{ flow: flow.flow, order, unit }] : [])),
    relations: relations.filter(relation => relation.region === region.id || contains(relation.to, region.id)),
  }]));
}

export function structureDifferences(candidate, reference) {
  const actual = structureDecisions(candidate), expected = structureDecisions(reference);
  const ids = new Set([...actual.keys(), ...expected.keys()]);
  return [...ids].filter(id => JSON.stringify(actual.get(id)) !== JSON.stringify(expected.get(id)));
}
