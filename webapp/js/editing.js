import { canonical, EditError } from "./ops.js?v=20261124-images-1";

// What the page editor may change: everything on the page, regions, transcription, structure overrides, line joins and
// note links. (A save made from an editor that was open while the page changed elsewhere merges text only: mergeTextEdit.)
export function editorFocus() { return "all"; }

export function mergeTextEdit(current, incoming, base) {
  const doc = structuredClone(current);
  const text = line => ({ text: line?.text, spans: line?.spans });
  const assign = (target, value, previous, keys, name) => {
    if (canonical(value) === canonical(previous)) return;
    const now = Object.fromEntries(keys.filter(key => target[key] !== undefined).map(key => [key, target[key]]));
    const old = Object.fromEntries(keys.filter(key => previous?.[key] !== undefined).map(key => [key, previous[key]]));
    const next = Object.fromEntries(keys.filter(key => value?.[key] !== undefined).map(key => [key, value[key]]));
    if (canonical(now) !== canonical(old) && canonical(now) !== canonical(next)) throw new EditError(`${name} changed in another edit. Reload before replacing it.`);
    for (const key of keys) { if (value[key] === undefined) delete target[key]; else target[key] = structuredClone(value[key]); }
  };
  assign(doc.page, { label: incoming.page.label }, { label: base.page.label }, ["label"], "The page label");
  for (const region of incoming.page.regions) for (const [index, line] of (region.lines || []).entries()) {
    const prior = base.page.regions.find(value => value.id === region.id)?.lines?.[index];
    if (canonical(text(line)) === canonical(text(prior))) continue;
    const target = doc.page.regions.find(value => value.id === region.id)?.lines?.[index];
    if (!target || target.line !== line.line || canonical(target.polygons) !== canonical(line.polygons)) throw new EditError(`${region.id} geometry changed. Reopen the page before replacing its text.`);
    assign(target, text(line), text(prior), ["text", "spans"], `${region.id} line ${index + 1}`);
  }
  const anchors = new Set(doc.page.regions.flatMap(region => (region.lines || []).flatMap(line => (line.spans || []).filter(span => span.id).map(span => `${doc.page.id}#${span.id}`))));
  if (doc.relations) doc.relations = doc.relations.filter(relation => !relation.from.anchor?.startsWith(`${doc.page.id}#`) || anchors.has(relation.from.anchor));
  return doc;
}
