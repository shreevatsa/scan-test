// Join page documents, in page order, into one book document: a port of schema/book.py assemble. Returns
// [book, warnings]. A unit open at its end joins the unit open at its start on a later page of its flow, level by
// level, when the two have the same type and every page between has no unit of that type there and no open end of its
// own (a blank page, a plate with its caption, a page whose units are all of other types). The pages between keep
// their units, after the joined one. A null in pageDocs is a page that is not there (Read leaves out pages not moved on
// to it): nothing joins across it, as at the start or end of the book.

const clone = x => (x === undefined ? x : JSON.parse(JSON.stringify(x)));

export function assemble(pageDocs, tl, source = {}, { onMerge = () => {} } = {}) {
  const units = new Map(), startOpen = {}, endOpen = {}, mergedInto = {}, warnings = [];
  const flows = {};
  for (const f of Object.keys(tl.flows)) flows[f] = [];
  // Per flow, since the start or the last page that is not there: `carry`, the unit open at its end that a later page
  // may continue, and `since`, each page with units there (the last of them, as on the page, their types, whether one
  // is open at either end), which names the earlier side of an open start that has nothing to join.
  let carry = {}, since = {};
  // Per unit joined across pages: its child open at its end that a later page may continue (the same rule, a level down).
  const inner = new Map();
  const typeOf = uid => units.get(uid).type;
  const flagged = uid => startOpen[uid] || endOpen[uid];
  const openLast = children => { const uid = children[children.length - 1]?.unit; return uid && endOpen[uid] ? uid : null; };

  const final = uid => { while (uid in mergedInto) uid = mergedInto[uid]; return uid; };

  // Append unit b (open at its start, on a later page) to unit a (open at its end).
  function merge(a, b) {
    const A = units.get(a), B = units.get(b);
    const open = inner.has(a) ? inner.get(a) : openLast(A.children);
    units.delete(b);
    mergedInto[b] = a;
    onMerge(a, b);
    let kids = B.children;
    const first = kids[0]?.unit ?? null;
    // B's page sits between `open` and its continuation: B goes on, and its children are units of other types with no
    // open end of their own.
    const passes = !!open && endOpen[b] && kids.every(k => "unit" in k && !flagged(k.unit) && typeOf(k.unit) !== typeOf(open));
    let carried = passes ? open : openLast(kids);
    if (open && first && startOpen[first] && typeOf(open) === typeOf(first)) {
      merge(open, first);
      if (carried === first) carried = open;
      kids = kids.slice(1);
    } else if (open && !passes) {
      warnings.push(`${a} + ${b}: inner open ends do not match (${open}, ${first ?? "None"})`);
    } else if (first && startOpen[first]) {
      const earlier = A.children.findLast(k => k.unit && (flagged(k.unit) || typeOf(k.unit) === typeOf(first))) || A.children[A.children.length - 1];
      warnings.push(`${a} + ${b}: inner open ends do not match (${earlier?.unit ?? "None"}, ${first})`);
    }
    A.children = A.children.concat(kids);
    endOpen[a] = endOpen[b];
    inner.set(a, carried);
    for (const k of ["number", "label", "lang"]) if (k in B && !(k in A)) A[k] = B[k];
  }

  for (const pd of pageDocs) {
    if (!pd) { carry = {}; since = {}; continue; }
    const pid = pd.page.id;
    const bid = local => `${pid}#${local}`;
    for (const u of pd.units) {
      const nu = {};
      for (const [k, v] of Object.entries(u)) if (k !== "open") nu[k] = clone(v);
      nu.id = bid(u.id);
      nu.children = u.children.map(c => ("unit" in c ? { unit: bid(c.unit) } : { ...c }));
      units.set(nu.id, nu);
      startOpen[nu.id] = !!(u.open || {}).start;
      endOpen[nu.id] = !!(u.open || {}).end;
    }
    for (const [flow, tops0] of Object.entries(pd.flows)) {
      const tops = tops0.map(bid);
      const list = flows[flow] || (flows[flow] = []), pages = since[flow] || (since[flow] = []);
      const open = carry[flow] ?? null, starts = tops.filter(t => startOpen[t]);
      const kinds = new Set(tops.map(typeOf)), marked = tops.some(flagged);
      // This page sits between `open` and its continuation: no unit of its type here and no open end of its own.
      const passes = !!open && !marked && !kinds.has(typeOf(open));
      let last = passes ? open : tops[tops.length - 1] ?? null;
      if (open && starts.length && typeOf(open) === typeOf(starts[0])) {
        merge(open, starts[0]);
        if (last === starts[0]) last = open;
        tops.splice(tops.indexOf(starts[0]), 1);
      } else if (open && !passes) {
        warnings.push(`page ${pid}, flow ${flow}: open ends do not match (${open}, [${starts.join(", ")}])`);
      } else if (starts.length && pages.length) {
        // Nothing open to join: the earlier side is the latest page with a unit of its type or an open end, else the
        // latest page with units in the flow.
        const type = typeOf(starts[0]);
        const earlier = pages.findLast(page => page.marked || page.kinds.has(type)) || pages[pages.length - 1];
        warnings.push(`page ${pid}, flow ${flow}: open ends do not match (${earlier.last}, [${starts.join(", ")}])`);
      }
      list.push(...tops);
      if (tops0.length) pages.push({ last: bid(tops0[tops0.length - 1]), kinds, marked });
      carry[flow] = last && endOpen[last] ? last : null;
    }
  }
  for (const [uid, u] of units) {
    const flags = {};
    if (startOpen[uid]) flags.start = true;
    if (endOpen[uid]) flags.end = true;
    if (Object.keys(flags).length) u.open = flags;
  }
  const present = pageDocs.filter(Boolean);
  const relations = [];
  for (const pd of present) {
    const pid = pd.page.id;
    for (const rel0 of pd.relations || []) {
      const rel = clone(rel0);
      for (const side of ["from", "to"]) if ("unit" in rel[side]) rel[side].unit = final(`${pid}#${rel[side].unit}`);
      relations.push(rel);
    }
  }
  const version = present.map(pd => pd.schema_version || "0.1").reduce((a, b) => (b > a ? b : a), "0.1");
  const book = {
    format: "book", schema_version: version, types: tl, pages: present.map(pd => pd.page),
    units: [...units.values()], flows, relations,
    source: { assembled_by: "webapp/js/assemble.js", pages: present.map(pd => pd.page.id), ...source },
  };
  return [book, warnings];
}
