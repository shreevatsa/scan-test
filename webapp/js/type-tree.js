// "What may contain what" as one tree per flow: each type appears exactly once, under the first container (in type-list
// order) that may hold it, else directly under its flow (or under page furniture). Pure (type list + counts -> forest)
// so that it can be tested without the DOM. counts = { n, at }: n[type] is the number of units of a type (regions, for
// page furniture); at["<parent>>type"] the number held directly in a container, at["flow:<flow>>type"] the number at a
// flow's top level. With counts null the counts read "…".

const plural = name => /(ss|x|ch|sh)$/.test(name) ? `${name}es` : name.endsWith("s") ? name : /[^aeiou]y$/.test(name) ? `${name.slice(0, -1)}ies` : `${name}s`;

// The first container (list order, never the type itself) holding each type, with cycles among containers cut: where
// containers hold each other, the one earliest in the list loses its parent, so that it becomes the parent of the others.
function primaryParents(types) {
  const names = Object.keys(types), order = new Map(names.map((n, i) => [n, i]));
  const parent = {};
  for (const n of names) {
    const holder = names.find(o => o !== n && !types[o].region && (types[o].contains || []).includes(n));
    if (holder) parent[n] = holder;
  }
  for (const start of names) {
    const path = [];
    let at = start;
    while (at && parent[at] && !path.includes(at)) { path.push(at); at = parent[at]; }
    if (at && path.includes(at)) {
      const cycle = path.slice(path.indexOf(at));
      delete parent[cycle.reduce((a, b) => order.get(b) < order.get(a) ? b : a)];
    }
  }
  return parent;
}

// The flow of a type without a flow of its own: that of the nearest ancestor with one.
function flowAbove(types, parent, name) {
  for (let at = name, seen = new Set(); at && !seen.has(at); at = parent[at]) {
    seen.add(at);
    if (types[at].flow) return types[at].flow;
  }
  return null;
}

// -> { flows: [{ flow, description, nodes }], furniture: [nodes], unplaced: [nodes] }; a node is { name, kind
// ("container" | "type" | "furniture"), printedAs, notes: [text], count, zero, needsClass, children: [nodes] }.
export function typeForest(tl, counts = null) {
  const types = tl.types || {};
  const names = Object.keys(types), parent = primaryParents(types);
  const num = key => counts ? String(counts.at[key] || 0) : "…";
  const node = name => {
    const t = types[name], container = !t.region, furniture = t.role === "furniture";
    const flow = t.flow, p = parent[name];
    const holders = names.filter(o => (types[o].contains || []).includes(name));
    const places = [...(flow && !furniture ? [{ count: `flow:${flow}>${name}`, short: "at top level", note: "at top level" }] : []),
      ...holders.map(o => ({ count: `${o}>${name}`, short: `in ${plural(o)}`, note: o.endsWith("s") ? `in ${o}` : `in a ${o}`, holder: o }))];
    const notes = [];
    const also = places.filter(x => x.holder ? x.holder !== p && x.holder !== name : !!p).map(x => x.note);
    if (also.length) notes.push(`also ${also.join(", ")}`);
    if ((t.contains || []).includes(name)) notes.push("may contain itself");
    const total = counts ? counts.n[name] || 0 : null;
    let count, zero;
    if (furniture) { count = counts ? `${total} on the pages` : "…"; zero = !!counts && !total; }
    else if (!container && places.length > 1) {
      count = places.map(x => `${num(x.count)} ${x.short}`).join(" · ");
      zero = !!counts && places.every(x => !counts.at[x.count]);
    } else { count = counts ? String(total) : "…"; zero = !!counts && !total; }
    return { name, kind: furniture ? "furniture" : container ? "container" : "type", printedAs: t.region && t.region !== name ? t.region : "",
      notes, count, zero, needsClass: t.region === "other", children: [] };
  };
  const nodes = Object.fromEntries(names.map(n => [n, node(n)]));
  const flowRoots = Object.fromEntries(Object.keys(tl.flows || {}).map(f => [f, []]));
  const furniture = [], unplaced = [];
  for (const n of names) {
    if (parent[n]) { nodes[parent[n]].children.push(nodes[n]); continue; }
    const t = types[n], flow = t.flow || flowAbove(types, parent, n) || names.map(o => types[o].flow && (types[o].contains || []).includes(n) ? types[o].flow : null).find(Boolean);
    if (t.role === "furniture") furniture.push(nodes[n]);
    else (flowRoots[flow] || unplaced).push(nodes[n]);
  }
  return { flows: Object.entries(tl.flows || {}).map(([flow, description]) => ({ flow, description, nodes: flowRoots[flow] })), furniture, unplaced };
}
