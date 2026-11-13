// "What may contain what" as one tree per flow, showing each type where it is USED, with the count for that place only:
// at its flow's top level and/or inside each container that holds units of it. A type used nowhere (and any type while
// counts are unknown) appears once, at its first allowed place: under the first container (in type-list order) that may
// hold it, else directly under its flow (or under page furniture); a container always appears at that place. Pure
// (type list + counts -> forest) so that it can be tested without the DOM. counts = { n, at }: n[type] is the number of units of a type (regions, for
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
// ("container" | "type" | "furniture"), printedAs, notes: [text], count (one number for this place), zero, multi (the
// type appears in more than one place), needsClass, children: [nodes] }.
export function typeForest(tl, counts = null) {
  const types = tl.types || {};
  const names = Object.keys(types), parent = primaryParents(types);
  const at = key => counts ? counts.at[key] || 0 : 0;
  const holdersOf = name => names.filter(o => !types[o].region && (types[o].contains || []).includes(name));
  const rootOf = n => {
    const t = types[n];
    if (t.role === "furniture") return "#furniture";
    const flow = t.flow || flowAbove(types, parent, n) || names.map(o => types[o].flow && (types[o].contains || []).includes(n) ? types[o].flow : null).find(Boolean);
    return flow && tl.flows?.[flow] !== undefined ? `flow:${flow}` : "#unplaced";
  };
  // places[holder or root key] = [{ name, count, zero }] in list order
  const places = {};
  const put = (where, name, count, zero) => (places[where] ||= []).push({ name, count, zero });
  for (const n of names) {
    const t = types[n], container = !t.region, furniture = t.role === "furniture";
    const total = counts ? counts.n[n] || 0 : null;
    const first = parent[n] || rootOf(n);
    if (furniture) { put(first, n, counts ? `${total} on the pages` : "…", !!counts && !total); continue; }
    const used = [];
    if (counts) {
      if (t.flow && at(`flow:${t.flow}>${n}`)) used.push([`flow:${t.flow}`, at(`flow:${t.flow}>${n}`)]);
      for (const o of holdersOf(n)) if (at(`${o}>${n}`)) used.push([o, at(`${o}>${n}`)]);
    }
    if (!used.length || (container && !used.some(([w]) => w === first))) {
      // unused (or a container with nothing at its own place): one row at the first allowed place
      const count = used.length ? 0 : total;
      put(first, n, counts ? String(count) : "…", !!counts && !count);
      if (!used.length) continue;
    }
    for (const [where, count] of used) put(where, n, String(count), false);
  }
  const build = (e, path) => {
    const t = types[e.name], container = !t.region, furniture = t.role === "furniture";
    const notes = [];
    if ((t.contains || []).includes(e.name)) notes.push("may contain itself");
    const children = container && !path.includes(e.name) ? (places[e.name] || []).map(c => build(c, [...path, e.name])) : [];
    return { name: e.name, kind: furniture ? "furniture" : container ? "container" : "type", printedAs: t.region && t.region !== e.name ? t.region : "",
      notes, count: e.count, zero: e.zero, multi: false, needsClass: t.region === "other", children };
  };
  const flowRoots = Object.fromEntries(Object.keys(tl.flows || {}).map(f => [f, (places[`flow:${f}`] || []).map(e => build(e, []))]));
  const furniture = (places["#furniture"] || []).map(e => build(e, [])), unplaced = (places["#unplaced"] || []).map(e => build(e, []));
  const seen = {}, all = [];
  const walk = list => list.forEach(x => { all.push(x); seen[x.name] = (seen[x.name] || 0) + 1; walk(x.children); });
  walk(furniture); walk(unplaced); Object.values(flowRoots).forEach(walk);
  for (const x of all) x.multi = seen[x.name] > 1;
  return { flows: Object.entries(tl.flows || {}).map(([flow, description]) => ({ flow, description, nodes: flowRoots[flow] })), furniture, unplaced };
}
