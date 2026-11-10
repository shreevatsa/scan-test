// Checks for documents of the draft book schema: a port of schema/book.py (validate, check_types, check_document,
// depth_first). The same rules, and the same messages where they are not about JSON values, so that a document the
// app saves passes `book.py check`. The JSON Schema is passed in (webapp/schema.json, a copy of schema/schema.json).

export const FORMATTING = ["bold", "italic", "small_caps", "superscript", "subscript", "underline", "spaced"];

// Older type lists used this provenance field for a narrative revision note.
export function typeRevision(value) {
  return Number.isSafeInteger(value) && value > 0 ? value : 1;
}

function typeOk(value, t) {
  switch (t) {
    case "integer": return Number.isInteger(value);
    case "number": return typeof value === "number" && Number.isFinite(value);
    case "object": return value !== null && typeof value === "object" && !Array.isArray(value);
    case "array": return Array.isArray(value);
    case "string": return typeof value === "string";
    case "boolean": return typeof value === "boolean";
    case "null": return value === null;
  }
  throw new Error("unknown type " + t);
}

function show(v) { return JSON.stringify(v); }

function equal(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

export function makeValidator(SCHEMA) {
  const resolve = ref => {
    if (!ref.startsWith("#/$defs/")) throw new Error(ref);
    return SCHEMA.$defs[ref.slice("#/$defs/".length)];
  };
  const discriminates = (value, schema) => {
    schema = schema.$ref ? resolve(schema.$ref) : schema;
    if (!typeOk(value, "object")) return false;
    const props = schema.properties || {};
    return (schema.required || []).every(k => k in value) &&
      Object.entries(props).every(([k, p]) => !("const" in p) || !(k in value) || equal(value[k], p.const));
  };
  const patterns = new Map();
  const pattern = p => { if (!patterns.has(p)) patterns.set(p, new RegExp(p, "u")); return patterns.get(p); };

  function validate(value, schema = SCHEMA, path = "$") {
    if (schema.$ref) return validate(value, resolve(schema.$ref), path);
    if (schema.oneOf) {
      const results = schema.oneOf.map(s => validate(value, s, path));
      const passing = results.filter(r => r.length === 0);
      if (passing.length === 1) return [];
      if (passing.length) return [`${path}: matches more than one alternative`];
      const likely = results.filter((r, i) => discriminates(value, schema.oneOf[i]));
      return (likely.length ? likely : results).reduce((a, b) => (b.length < a.length ? b : a));
    }
    if ("const" in schema && !equal(value, schema.const)) return [`${path}: must be ${show(schema.const)}`];
    if (schema.enum && !schema.enum.some(e => equal(e, value))) return [`${path}: ${show(value)} is not one of ${show(schema.enum)}`];
    if (schema.type) {
      const types = Array.isArray(schema.type) ? schema.type : [schema.type];
      if (!types.some(t => typeOk(value, t))) return [`${path}: expected ${types.join(" or ")}`];
    }
    const errors = [];
    if (typeof value === "string" && schema.pattern && !pattern(schema.pattern).test(value))
      errors.push(`${path}: ${show(value)} does not match ${schema.pattern}`);
    if (typeOk(value, "number") && "minimum" in schema && value < schema.minimum) errors.push(`${path}: below ${schema.minimum}`);
    if (Array.isArray(value)) {
      if (value.length < (schema.minItems || 0)) errors.push(`${path}: fewer than ${schema.minItems} items`);
      if ("maxItems" in schema && value.length > schema.maxItems) errors.push(`${path}: more than ${schema.maxItems} items`);
      if (schema.items) value.forEach((item, i) => errors.push(...validate(item, schema.items, `${path}[${i}]`)));
    }
    if (typeOk(value, "object")) {
      for (const k of schema.required || []) if (!(k in value)) errors.push(`${path}: missing ${k}`);
      const props = schema.properties || {};
      const extra = "additionalProperties" in schema ? schema.additionalProperties : true;
      for (const [k, v] of Object.entries(value)) {
        if (schema.propertyNames) errors.push(...validate(k, schema.propertyNames, `${path}.${k} (name)`));
        if (k in props) errors.push(...validate(v, props[k], `${path}.${k}`));
        else if (extra === false) errors.push(`${path}: unexpected property ${k}`);
        else if (typeOk(extra, "object")) errors.push(...validate(v, extra, `${path}.${k}`));
      }
    }
    return errors;
  }
  return validate;
}

export function checkTypes(tl) {
  const errors = [], types = tl.types;
  for (const [name, t] of Object.entries(types)) {
    const furniture = t.role === "furniture";
    if (furniture && ("contains" in t || "flow" in t || !("region" in t)))
      errors.push(`type ${name}: furniture needs a region class and no contains or flow`);
    if (!furniture && !("region" in t) && !(t.contains && t.contains.length))
      errors.push(`type ${name}: neither printed as regions nor a container`);
    for (const c of t.contains || [])
      if (!(c in types) || types[c].role === "furniture") errors.push(`type ${name}: contains unknown or furniture type ${c}`);
    if ("flow" in t && !(t.flow in tl.flows)) errors.push(`type ${name}: unknown flow ${t.flow}`);
  }
  for (const f of Object.keys(tl.flows))
    if (!Object.values(types).some(t => t.flow === f)) errors.push(`flow ${f}: no type can stand at its top level`);
  return errors;
}

// [flow, ["unit", id] | ["region", ref], depth] for each unit and region, in reading order.
export function* depthFirst(units, flows) {
  function* walk(flow, uid, depth) {
    yield [flow, ["unit", uid], depth];
    for (const c of units[uid].children) {
      if ("unit" in c) yield* walk(flow, c.unit, depth + 1);
      else yield [flow, ["region", c.region], depth + 1];
    }
  }
  for (const [flow, tops] of Object.entries(flows)) for (const uid of tops) yield* walk(flow, uid, 0);
}

const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

// Rules for a page document or a book document, as book.py check_document. Returns [errors, warnings].
export function checkDocument(doc, tl) {
  const errors = [], warnings = [], types = tl.types;
  const pages = doc.format === "page" ? [doc.page] : doc.pages;
  const regions = {};
  for (const p of pages) for (const r of p.regions) {
    const ref = `${p.id}#${r.id}`;
    if (own(regions, ref)) errors.push(`region ${ref}: duplicate id`);
    regions[ref] = r;
    if (!own(types, r.type)) errors.push(`region ${ref}: unknown type ${r.type}`);
  }
  const spanKinds = new Set([...FORMATTING, "note_marker", ...Object.keys(tl.inline || {})]);
  const anchors = {};
  for (const p of pages) for (const r of p.regions) for (const L of r.lines || []) {
    const n = [...(L.text || "")].length;
    (L.spans || []).forEach((sp, k) => {
      const where = `region ${p.id}#${r.id} line ${L.line ?? "None"} span ${k}`;
      if (!(0 <= sp.start && sp.start <= sp.end && sp.end <= n))
        errors.push(`${where}: [${sp.start}, ${sp.end}) is outside the text of length ${n}`);
      if (!spanKinds.has(sp.kind)) errors.push(`${where}: unknown kind ${sp.kind}`);
      if (sp.kind === "note_marker") {
        if (sp.start !== sp.end) errors.push(`${where}: a note marker must be zero-width`);
        if (!("id" in sp)) errors.push(`${where}: a note marker needs an id`);
      }
      if ("id" in sp) {
        const ref = `${p.id}#${sp.id}`;
        if (own(anchors, ref) || own(regions, ref)) errors.push(`${where}: duplicate id ${sp.id}`);
        anchors[ref] = sp;
      }
    });
  }
  const units = {};
  for (const u of doc.units) {
    if (own(units, u.id)) errors.push(`unit ${u.id}: duplicate id`);
    units[u.id] = u;
  }
  const owner = {}, parent = {};
  for (const [uid, u] of Object.entries(units)) {
    const t = own(types, u.type) ? types[u.type] : null;
    if (t === null || t.role === "furniture") { errors.push(`unit ${uid}: unknown or furniture type ${u.type}`); continue; }
    for (const c of u.children) {
      if ("region" in c) {
        const ref = c.region;
        if (!own(regions, ref)) { errors.push(`unit ${uid}: unknown region ${ref}`); continue; }
        if (doc.format === "page" && !ref.startsWith(doc.page.id + "#")) errors.push(`unit ${uid}: region ${ref} is on another page`);
        if (!("region" in t)) errors.push(`unit ${uid}: type ${u.type} is a container and owns no regions`);
        if (regions[ref].type !== u.type) errors.push(`unit ${uid}: owns region ${ref} of type ${regions[ref].type}`);
        if (own(owner, ref)) errors.push(`region ${ref}: owned by ${owner[ref]} and ${uid}`);
        owner[ref] = uid;
      } else {
        const cid = c.unit;
        if (!own(units, cid)) { errors.push(`unit ${uid}: unknown child unit ${cid}`); continue; }
        if (!(t.contains || []).includes(units[cid].type)) errors.push(`unit ${uid}: type ${u.type} may not contain ${units[cid].type}`);
        if (own(parent, cid)) errors.push(`unit ${cid}: child of ${parent[cid]} and ${uid}`);
        parent[cid] = uid;
      }
    }
  }
  for (const [ref, r] of Object.entries(regions)) {
    const furniture = (types[r.type] || {}).role === "furniture";
    if (furniture && own(owner, ref)) errors.push(`region ${ref}: furniture owned by unit ${owner[ref]}`);
    if (!furniture && !own(owner, ref)) errors.push(`region ${ref}: text region owned by no unit`);
  }
  const inFlow = {};
  for (const [flow, tops] of Object.entries(doc.flows)) {
    if (!own(tl.flows, flow)) errors.push(`flow ${flow}: not in the type list`);
    for (const uid of tops) {
      if (!own(units, uid)) { errors.push(`flow ${flow}: unknown unit ${uid}`); continue; }
      if (own(parent, uid)) errors.push(`flow ${flow}: ${uid} is a child of ${parent[uid]}`);
      if (own(inFlow, uid)) errors.push(`unit ${uid}: in flows ${inFlow[uid]} and ${flow}`);
      inFlow[uid] = flow;
      if ((types[units[uid].type] || {}).flow !== flow) errors.push(`flow ${flow}: type ${units[uid].type} may not stand at its top level`);
    }
  }
  for (const uid of Object.keys(units)) if (!own(parent, uid) && !own(inFlow, uid)) errors.push(`unit ${uid}: neither a child nor in a flow`);

  const relationErrors = () => {
    const out = [];
    (doc.relations || []).forEach((rel, i) => {
      if (!own(tl.relations || {}, rel.type)) out.push(`relation ${i}: unknown type ${rel.type}`);
      for (const side of ["from", "to"])
        if ("unit" in rel[side] && !own(units, rel[side].unit)) out.push(`relation ${i}: unknown ${side} unit ${rel[side].unit}`);
      if ("region" in rel.from && !own(regions, rel.from.region)) out.push(`relation ${i}: unknown region ${rel.from.region}`);
      if ("anchor" in rel.from) {
        const a = own(anchors, rel.from.anchor) ? anchors[rel.from.anchor] : null;
        if (a === null) out.push(`relation ${i}: unknown anchor ${rel.from.anchor}`);
        else if (a.kind !== "note_marker" && rel.type === "note") out.push(`relation ${i}: anchor ${rel.from.anchor} is not a note marker`);
      }
      if (!("unit" in rel.from || "region" in rel.from || "anchor" in rel.from))
        out.push(`relation ${i}: from needs a unit, a region or an anchor`);
    });
    return out;
  };

  if (errors.length) return [errors.concat(relationErrors()), warnings];
  const seen = [...depthFirst(units, doc.flows)].filter(x => x[1][0] === "unit").map(x => x[1][1]);
  if (seen.length !== new Set(seen).size || seen.length !== Object.keys(units).length) errors.push("units do not form a tree");
  for (const [uid, u] of Object.entries(units)) {
    const siblings = own(parent, uid) ? units[parent[uid]].children : null;
    for (const [end, word] of [["start", "first"], ["end", "last"]]) {
      if (!(u.open || {})[end]) continue;
      if (siblings === null) {
        const tops = doc.flows[inFlow[uid]];
        if (end === "end" && tops[tops.length - 1] !== uid) errors.push(`unit ${uid}: open at the end but not the last unit of flow ${inFlow[uid]}`);
        if (end === "start" && tops.filter(t => (units[t].open || {}).start).length > 1) errors.push(`flow ${inFlow[uid]}: more than one unit open at the start`);
        continue;
      }
      const sib = end === "start" ? siblings[0] : siblings[siblings.length - 1];
      if (sib.unit !== uid) errors.push(`unit ${uid}: open at the ${end} but not the ${word} child of ${parent[uid]}`);
      if (!(units[parent[uid]].open || {})[end]) errors.push(`unit ${uid}: open at the ${end} but its parent ${parent[uid]} is not`);
    }
  }
  errors.push(...relationErrors());
  if (doc.format === "page") {
    const p = pages[0];
    for (const flow of Object.keys(doc.flows)) {
      const orders = [...depthFirst(units, doc.flows)].filter(([f, x]) => f === flow && x[0] === "region")
        .map(([, x]) => regions[x[1]].order).filter(o => o !== undefined && o !== null);
      const sorted = [...orders].sort((a, b) => a - b);
      if (!equal(orders, sorted))
        warnings.push(`page ${p.id}, flow ${flow}: units read regions in the order [${orders.join(", ")}], not the region step's order`);
    }
  }
  return [errors, warnings];
}

// validate, then the type list's own rules, then check_document, as book.py check_file.
export function checkPage(validate, doc, tl) {
  let errors = validate(doc);
  if (errors.length) return [errors, []];
  errors = [...validate(tl), ...checkTypes(tl)].map(e => `type list: ${e}`);
  if (doc.format === "page" && tl.book_id !== doc.book_id) errors.push(`type list is for ${tl.book_id}, not ${doc.book_id}`);
  if (errors.length) return [errors, []];
  return checkDocument(doc, tl);
}
