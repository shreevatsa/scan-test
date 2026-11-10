// Join page documents, in page order, into one book document: a port of schema/book.py assemble. Returns
// [book, warnings]. Units open at a page's end are joined with the matching unit open at the next page's start,
// level by level.

const clone = x => (x === undefined ? x : JSON.parse(JSON.stringify(x)));

export function assemble(pageDocs, tl, source = {}, { onMerge = () => {} } = {}) {
  const units = new Map(), startOpen = {}, endOpen = {}, mergedInto = {}, warnings = [];
  const flows = {};
  for (const f of Object.keys(tl.flows)) flows[f] = [];

  const final = uid => { while (uid in mergedInto) uid = mergedInto[uid]; return uid; };

  function merge(a, b) {
    const A = units.get(a), B = units.get(b);
    units.delete(b);
    mergedInto[b] = a;
    onMerge(a, b);
    let kids = B.children;
    const last = A.children[A.children.length - 1], first = kids[0];
    if (("unit" in last && endOpen[last.unit]) || ("unit" in first && startOpen[first.unit])) {
      const la = last.unit, fb = first.unit;
      if (la && fb && endOpen[la] && startOpen[fb] && units.get(la).type === units.get(fb).type) {
        merge(la, fb);
        kids = kids.slice(1);
      } else {
        warnings.push(`${a} + ${b}: inner open ends do not match (${la ?? "None"}, ${fb ?? "None"})`);
      }
    }
    A.children = A.children.concat(kids);
    endOpen[a] = endOpen[b];
    for (const k of ["number", "label", "lang"]) if (k in B && !(k in A)) A[k] = B[k];
  }

  for (const pd of pageDocs) {
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
      const list = flows[flow] || (flows[flow] = []);
      const prev = list.length ? list[list.length - 1] : null;
      const starts = tops.filter(t => startOpen[t]);
      if (prev && endOpen[prev] && starts.length && units.get(prev).type === units.get(starts[0]).type) {
        merge(prev, starts[0]);
        tops.splice(tops.indexOf(starts[0]), 1);
      } else if ((prev && endOpen[prev]) || (starts.length && prev)) {
        warnings.push(`page ${pid}, flow ${flow}: open ends do not match (${prev}, [${starts.join(", ")}])`);
      }
      list.push(...tops);
    }
  }
  for (const [uid, u] of units) {
    const flags = {};
    if (startOpen[uid]) flags.start = true;
    if (endOpen[uid]) flags.end = true;
    if (Object.keys(flags).length) u.open = flags;
  }
  const relations = [];
  for (const pd of pageDocs) {
    const pid = pd.page.id;
    for (const rel0 of pd.relations || []) {
      const rel = clone(rel0);
      for (const side of ["from", "to"]) if ("unit" in rel[side]) rel[side].unit = final(`${pid}#${rel[side].unit}`);
      relations.push(rel);
    }
  }
  const version = pageDocs.map(pd => pd.schema_version || "0.1").reduce((a, b) => (b > a ? b : a), "0.1");
  const book = {
    format: "book", schema_version: version, types: tl, pages: pageDocs.map(pd => pd.page),
    units: [...units.values()], flows, relations,
    source: { assembled_by: "webapp/js/assemble.js", pages: pageDocs.map(pd => pd.page.id), ...source },
  };
  return [book, warnings];
}
