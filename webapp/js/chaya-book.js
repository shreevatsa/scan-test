// Project the stored structure into the page-document interface used by the reader.
import { boxRing } from "./ops.js?v=20261126-type-suggestion";

export function effectiveEnd(line, type) {
  if (line.end != null) return line.end;
  if (type?.lines) return "line";
  return /[-‐]$/u.test(line.text || "") ? "hyphen" : "space";
}

const attrs = ({ number, label, lang, style, open }) =>
  Object.fromEntries(Object.entries({ number, label, lang, style, open }).filter(([, v]) => v !== undefined));

function pageTypes(book) {
  const printed = new Set(book.pages.flatMap(page => (page.regions ?? []).map(region => region.type)));
  const rules = book.rules ?? {};
  function regionClass(name, type) {
    if (type.ignored) return rules.page_numbers?.includes(name) ? "page_number" : "running_header";
    if (type.figure) return "figure";
    if (type.heading) return "heading";
    if (rules.tables?.includes(name)) return "table";
    if (rules.captions?.includes(name)) return "caption";
    if (rules.verses?.lead_in?.includes(name)) return "lead_in";
    if (rules.contents_types?.includes(name)) return "list_item";
    if (type.lines) return "verse";
    if (type.flow === "notes" || type.flow === "apparatus") return "note";
    if (!type.contains || printed.has(name)) return "paragraph";
  }
  const types = Object.fromEntries(Object.entries(book.types).map(([name, type]) => {
    const region = regionClass(name, type);
    const { lines, figure, heading, ignored, ...definition } = type;
    return [name, { ...structuredClone(definition), ...(region ? { region } : {}), ...(ignored ? { role: "furniture" } : {}) }];
  }));
  return { types, flows: structuredClone(book.flows ?? { main: {} }), relations: structuredClone(book.relations ?? {}) };
}

export function finderTypeList(book) {
  const tl = pageTypes(book);
  for (const [name, region] of Object.entries(book.reading?.finder_classes ?? {}))
    if (Object.hasOwn(tl.types, name)) tl.types[name].region = region;
  return { ...tl, title: book.title, description: book.description, languages: book.languages,
    conventions: Array.isArray(book.conventions) ? book.conventions : Object.values(book.conventions ?? {}).filter(value => typeof value === "string") };
}

export function toPageDocs(book) {
  if (book.chaya !== 1) throw new Error("Expected a Chaya version 1 book.");
  const types = pageTypes(book), docs = [];
  const containers = new Map(), targets = new Map(), continuing = new Map(), links = [];
  let nextUnit = 0;

  // Put each complete subtree on the page where its root starts. Qualified region references
  // keep later parts on their printed pages. The compatibility assembler need only collect them.
  function addUnit(fragment, type, parent, flow, doc) {
    const owner = parent?.owner ?? doc;
    const unit = { id: `u${++nextUnit}`, type, ...structuredClone(attrs(fragment)), children: [] };
    owner.units.push(unit);
    if (parent) parent.unit.children.push({ unit: unit.id });
    else (owner.flows[flow] ||= []).push(unit.id);
    return { owner, unit };
  }

  const open = (node, side) => { (node.unit.open ||= {})[side] = true; };
  function closeContinuations() {
    for (const node of continuing.values()) open(node, "end");
    continuing.clear();
  }

  book.pages.forEach((page, index) => {
    if (page.skip) return;
    if (!page.regions) { closeContinuations(); docs.push(null); return; }
    const id = page.id ?? String(index + 1), [width, height] = page.size ?? [10000, 10000];
    const pixels = ([x0, y0, x1, y1]) => [Math.round(x0 * width), Math.round(y0 * height), Math.round(x1 * width), Math.round(y1 * height)];
    const doc = { joinsResolved: true,
      page: { id, width, height, regions: [], ...(page.label != null ? { label: page.label } : {}) },
      units: [], flows: Object.fromEntries(Object.keys(types.flows).map(flow => [flow, []])), relations: [] };
    docs.push(doc);

    let order = 0;
    for (const region of page.regions) {
      const { type } = region;
      if (type === "?" || region.ignored) continue;
      const definition = book.types[type] ?? {};
      const ref = `${index + 1}/${region.id}`, oldRef = `${id}#${region.id}`;
      const box = pixels(region.box);
      const lines = (region.lines ?? []).map(({ box, spans, ...line }, lineIndex) => {
        const oldLine = { ...structuredClone(line), line: lineIndex + 1, end: effectiveEnd(line, definition) };
        if (box) oldLine.polygons = [boxRing(pixels(box))];
        if (spans) oldLine.spans = spans.map(({ to, ...span }, spanIndex) => {
          if (span.kind === "note_marker") {
            span.id = `m-${region.id}-${lineIndex + 1}-${spanIndex + 1}`;
            if (to && !definition.ignored) links.push({ type: "note", from: { anchor: `${id}#${span.id}`, marker: span.marker }, to });
          }
          return structuredClone(span);
        });
        return oldLine;
      });
      doc.page.regions.push({ id: region.id, type, box, polygons: [boxRing(box)], lines, order: definition.ignored ? null : ++order });
      if (definition.ignored) continue;

      const path = region.in ?? [];
      const root = path.length ? book.containers?.[path[0]] : region;
      if (!root) throw new Error(`Missing container ${path[0]}.`);
      const flow = root.flow ?? book.types[root.type]?.flow ?? "main";
      let parent;
      for (const name of path) {
        if (!containers.has(name)) {
          const data = book.containers?.[name];
          if (!data) throw new Error(`Missing container ${name}.`);
          containers.set(name, addUnit(data, data.type, parent, flow, doc));
        }
        parent = containers.get(name);
      }

      let unit = parent;
      if (!region.direct) {
        const key = JSON.stringify([parent?.unit.id ?? null, flow, type]);
        const earlier = continuing.get(key);
        if (earlier && !region.from_previous) unit = earlier;
        else {
          if (earlier) open(earlier, "end");
          unit = addUnit(region, type, parent, flow, doc);
          if (region.from_previous) open(unit, "start");
        }
        if (region.continues === true) continuing.set(key, unit);
        else continuing.delete(key);
        if (region.continues === "open") open(unit, "end");
      }
      if (!unit) throw new Error(`Direct region ${ref} has no container.`);
      unit.unit.children.push({ region: oldRef });
      targets.set(ref, unit);

      for (const link of region.links ?? []) {
        links.push({ type: link.type, from: { region: oldRef, ...(link.line != null ? { line: link.line + 1 } : {}) }, to: link.to });
      }
    }
  });
  closeContinuations();

  for (const { type, from, to } of links) {
    const target = targets.get(to) ?? containers.get(to);
    if (target) target.owner.relations.push({ type, from, to: { unit: target.unit.id } });
  }
  return { docs, types };
}
