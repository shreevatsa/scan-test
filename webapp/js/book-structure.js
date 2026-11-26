import { assemble } from "./assemble.js?v=20261125-v1-phase3";
import { toPageDocs } from "./chaya-book.js?v=20261125-v1-phase3";
import { collectTree, moveLinks, orderRegions, regionKey } from "./chaya-materialize.js?v=20261125-v1-phase3";
import { bookReading } from "./reading.js?v=20261125-v1-phase3";
import { pageLabel } from "./pipeline/steps.js?v=20261125-v1-phase3";
import { regionTypePaths } from "./pipeline/provisional.js?v=20261125-v1-phase3";
import { printedNumber, sequenceFixes, toDev } from "./number-rules.js?v=20261125-v1-phase3";

const cleanRegion = ({ in: path, direct, flow, number, label, continues, from_previous, links, ...region }) => ({
  ...region,
  ...(links?.some(link => link.type !== "note") ? { links: links.filter(link => link.type !== "note") } : {}),
  ...(region.lines ? { lines: region.lines.map(line => line.spans ? { ...line, spans: line.spans.map(({ to, ...span }) => span) } : line) } : {}),
});

export function scanLabels(regions, rules = {}) {
  const names = new Set(rules.page_numbers ?? ["page_number"]);
  return pageLabel(regions.filter(region => names.has(region.type)).map(region => ({ ...region, type: "page_number" })));
}

function assignNumbers(assembled, tl) {
  const regions = new Map(assembled.pages.flatMap(page => page.regions.map(region => [regionKey(page.id, region.id), region])));
  const units = new Map(assembled.units.map(unit => [unit.id, unit]));
  const series = new Map();
  function lastLine(unit) {
    for (const child of [...unit.children].reverse()) {
      const line = child.region ? regions.get(child.region)?.lines?.findLast(line => line.text?.trim()) : lastLine(units.get(child.unit));
      if (line) return line;
    }
  }
  function visit(unit, flow) {
    const def = tl.types[unit.type];
    const printed = (def?.numbered || def?.region === "verse") && !unit.open?.end && printedNumber(lastLine(unit)?.text);
    if (printed && unit.number == null) {
      const key = JSON.stringify([flow, unit.type]);
      if (!series.has(key)) series.set(key, []);
      series.get(key).push({ ...printed, unit });
    }
    for (const child of unit.children) if (child.unit) visit(units.get(child.unit), flow);
  }
  for (const [flow, roots] of Object.entries(assembled.flows)) for (const id of roots) visit(units.get(id), flow);
  for (const numbers of series.values()) {
    sequenceFixes(numbers);
    for (const item of numbers) item.unit.number = toDev(item.value, item.printed);
  }
}

// Snapshot the old continuation evidence before removing the stored containers.
function continuations(book) {
  const { docs, types } = toPageDocs(book);
  const [assembled] = assemble(docs, types);
  const incoming = new Set(), outgoing = new Set();
  for (const unit of assembled.units) {
    if (unit.children.some(child => child.unit)) continue;
    const refs = unit.children.map(child => child.region);
    for (const [i, ref] of refs.entries()) {
      if (i > 0 || unit.open?.start) incoming.add(ref);
      if (i < refs.length - 1 || unit.open?.end) outgoing.add(ref);
    }
  }
  return { incoming, outgoing };
}

export function findStructure(book, hints = new Map()) {
  const { incoming, outgoing } = continuations(book);
  const pages = book.pages.map(page => page.regions ? { ...page, regions: page.regions.map(cleanRegion) } : page);
  const bare = { ...book, containers: {}, pages };
  const { docs, types: tl } = toPageDocs(bare);
  const manifest = pages.map((page, i) => ({ id: page.id ?? String(i + 1) }));
  const skipped = new Set(pages.flatMap((page, i) => page.skip ? [manifest[i].id] : []));
  const rules = { ...book.rules };
  const closingType = rules.sections?.closing ?? "section_closing";
  if (rules.headings == null && book.types.section && !Object.hasOwn(book.types, closingType)) {
    const heading = Object.keys(book.types).find(type => book.types[type].heading);
    if (heading) rules.headings = [{ heading, container: "section" }];
  }
  tl.flows.main ??= "Text";
  for (const { flow } of Object.values(tl.types)) if (flow) tl.flows[flow] ??= flow;
  const children = new Set(Object.values(tl.types).flatMap(type => type.contains ?? []));
  for (const [name, type] of Object.entries(tl.types))
    if (!type.flow && !children.has(name) && type.role !== "furniture") type.flow = "main";
  const paths = regionTypePaths(tl);
  for (const [name, type] of Object.entries(tl.types))
    if (!paths.has(name) && type.region && type.role !== "furniture") type.flow ??= "main";

  const inputs = docs.filter(Boolean).map(doc => {
    const { page } = doc, savedHints = hints.get(page.id);
    for (const region of page.regions) {
      const ref = regionKey(page.id, region.id), mark = savedHints?.[region.id];
      region.source = { continues_from_earlier: mark?.from ?? incoming.has(ref), continues_later: mark?.to ?? outgoing.has(ref) };
    }
    const label = scanLabels(page.regions, book.rules) ?? page.label;
    return { schema_version: "0.4", format: "page", page: { ...page, label } };
  });
  const view = bookReading(manifest, inputs, tl, skipped, rules);
  const [assembled] = assemble(view.docs, view.types);
  assignNumbers(assembled, tl);
  const { refInfo, containers, destination } = collectTree(assembled, tl.types);
  const rank = new Map([...refInfo.keys()].map((ref, i) => [ref, i]));
  const refs = new Map(), anchors = new Map();
  const processed = new Map(view.docs.filter(Boolean).map(doc => [doc.page.id, doc.page]));
  const types = { ...book.types };
  const units = new Map(assembled.units.map(unit => [unit.id, unit]));
  const derivedTypes = new Map();
  for (const unit of assembled.units) if (!types[unit.type]) {
    const kinds = derivedTypes.get(unit.type) ?? new Set();
    for (const child of unit.children) if (child.unit) kinds.add(units.get(child.unit)?.type);
    derivedTypes.set(unit.type, kinds);
  }
  for (const [name, kinds] of derivedTypes) types[name] = { contains: [...kinds].filter(Boolean) };

  const storedPages = pages.map((page, index) => {
    const pid = manifest[index].id, from = processed.get(pid);
    if (!from) return book.pages[index];
    const oldRegions = new Map(from.regions.map(region => [region.id, region]));
    const ordered = orderRegions({ id: pid, regions: page.regions.map((region, order) => ({ ...region, order })) }, refInfo, rank);
    const regions = ordered.map(({ order, ...region }) => {
      const ref = regionKey(pid, region.id), old = oldRegions.get(region.id), found = refInfo.get(ref);
      if (found) {
        Object.assign(region, found.attrs);
        region.type = found.unitType ?? region.type;
      }
      if (old) {
        refs.set(ref, { region, old, address: `${index + 1}/${region.id}` });
        for (const [line, value] of (old.lines ?? []).entries()) {
          const current = region.lines?.[line]?.spans ?? [];
          for (const [i, span] of (value.spans ?? []).entries()) if (span.kind === "note_marker")
            anchors.set(regionKey(pid, span.id), { span: current[i], region: ref, line });
        }
      }
      return region;
    });
    const { label, ...rest } = page;
    return { ...rest, ...(from.label != null ? { label: from.label } : {}), regions };
  });
  moveLinks(assembled, destination, refs, anchors);
  return { ...book, pages: storedPages, types, containers };
}
