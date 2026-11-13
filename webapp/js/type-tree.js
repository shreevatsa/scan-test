// "What may contain what" as rows: each type listed once per reading flow, in type-list order, containers first.
// Pure (type list + counts -> rows) so that it can be tested without the DOM. counts = { n, at }: n[type] is the
// number of units of a type (regions, for page furniture); at["<parent>>type"] the number held directly in a
// container, at["flow:<flow>>type"] the number at a flow's top level. With counts null the counts read "…".

const plural = name => /(ss|x|ch|sh)$/.test(name) ? `${name}es` : name.endsWith("s") ? name : /[^aeiou]y$/.test(name) ? `${name.slice(0, -1)}ies` : `${name}s`;
const HOLD_SHOWN = 4;

// The flow a type belongs to: its own top-level flow, else that of a container that may hold it.
function flowOf(types, name, seen = new Set()) {
  const t = types[name];
  if (!t || seen.has(name)) return null;
  if (t.flow) return t.flow;
  seen.add(name);
  for (const [other, o] of Object.entries(types)) if ((o.contains || []).includes(name)) {
    const f = flowOf(types, other, seen);
    if (f) return f;
  }
  return null;
}

function row(types, name, flow, counts) {
  const t = types[name];
  const container = !t.region;
  const holders = Object.entries(types).filter(([, o]) => (o.contains || []).includes(name)).map(([o]) => o);
  const top = t.flow === flow;
  const places = [...(top ? [{ label: "at top level", count: `flow:${flow}>${name}`, short: "at top level" }] : []),
    ...holders.map(o => ({ label: `in a ${o}`, count: `${o}>${name}`, short: `in ${plural(o)}`, container: o }))];
  const num = key => counts ? String(counts.at[key] || 0) : "…";
  const zero = value => counts && value === 0;
  const total = counts ? counts.n[name] || 0 : null;
  let where = "", count;
  if (container) {
    count = counts ? String(total) : "…";
  } else if (places.length > 1) {
    const inLabels = places.filter(p => p.container).map(p => p.container);
    const or = inLabels.length > 1 ? `${inLabels.slice(0, -1).join(", ")} or ${inLabels.at(-1)}` : inLabels.join("");
    where = [...(top ? ["at top level"] : []), or ? `in a ${or}` : ""].filter(Boolean).join(" or ");
    count = places.map(p => `${num(p.count)} ${p.short}`).join(" · ");
  } else {
    // One place: said only when it is not the flow's top level.
    if (!top && places.length) where = places[0].label;
    count = counts ? String(total) : "…";
  }
  return { name, flow, kind: container ? "container" : "type", printedAs: t.region && t.region !== name ? t.region : "",
    holds: container ? (t.contains || []) : [], holdsShown: container ? (t.contains || []).slice(0, HOLD_SHOWN) : [],
    holdsMore: container && (t.contains || []).length > HOLD_SHOWN, where, count,
    zero: counts ? (container ? total === 0 : places.every(p => !counts.at[p.count])) : false, needsClass: t.region === "other" };
}

// -> { flows: [{ flow, description, rows }], furniture: [rows] }
export function typeTreeRows(tl, counts = null) {
  const types = tl.types || {};
  const flows = Object.entries(tl.flows || {}).map(([flow, description]) => {
    const names = Object.keys(types).filter(n => types[n].role !== "furniture" && flowOf(types, n) === flow);
    const rows = [...names.filter(n => !types[n].region), ...names.filter(n => types[n].region)].map(n => row(types, n, flow, counts));
    return { flow, description, rows };
  });
  const furniture = Object.entries(types).filter(([, t]) => t.role === "furniture").map(([name, t]) => ({
    name, flow: null, kind: "furniture", printedAs: t.region && t.region !== name ? t.region : "", holds: [], holdsShown: [], holdsMore: false, where: "",
    count: counts ? `${counts.n[name] || 0} on the pages` : "…", zero: !!counts && !(counts.n[name] || 0), needsClass: t.region === "other" }));
  return { flows, furniture };
}
