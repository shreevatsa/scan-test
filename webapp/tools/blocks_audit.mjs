// Compare a book's saved reading with the blocks projection, keyed by scan regions rather than generated ids.
//   node webapp/tools/blocks_audit.mjs BOOK.chaya.pdf […]
import { readFile } from "node:fs/promises";
import { readChaya } from "../js/chayapdf.js";
import { assemble } from "../js/assemble.js";
import { blockLineEnd, projectBlocks } from "../js/blocks.js";
import { normal } from "../js/note-links.js";
import { layerState } from "../js/layers.js";

function record(doc) {
  const units = new Map(doc.units.map(unit => [unit.id, unit]));
  const refsOf = unit => unit.children.flatMap(child => child.region ? [child.region] : refsOf(units.get(child.unit)));
  const key = unit => JSON.stringify([unit.type, refsOf(unit)]);
  const children = unit => unit.children.some(child => child.unit);
  const targets = new Map((doc.relations || []).filter(link => link.type === "note" && link.from.anchor && units.has(link.to.unit))
    .map(link => [link.from.anchor, key(units.get(link.to.unit))]));
  return { key, targets, leaves: doc.units.filter(unit => !children(unit)), containers: doc.units.filter(children), refsOf };
}

function endings(doc, units, types) {
  const regions = new Map(doc.page.regions.map(region => [`${doc.page.id}#${region.id}`, region]));
  const provisional = layerState(doc, "units")?.state === "provisional";
  const outcome = (line, end) => end === "hyphen" ? /[-‐]$/u.test(line.text || "") ? "drop hyphen" : "join" : end;
  const changed = [];
  for (const unit of units) {
    const kind = types.types[unit.type]?.region;
    const lines = unit.children.flatMap(child => {
      const region = regions.get(child.region);
      return (region?.lines || []).map(line => ({ line, region }));
    });
    for (const { line, region } of lines.slice(0, -1)) {
      const before = provisional && kind !== "verse" ? "space" : line.end || (kind === "verse" ? "line" : "space");
      const after = blockLineEnd(line, region, types);
      if (outcome(line, before) !== outcome(line, after)) changed.push(`${before} → ${after}`);
    }
  }
  return changed;
}

export async function auditBlocks(path) {
  const { data: { files } } = await readChaya(await readFile(path));
  const manifest = files["book.json"], types = files["types.json"];
  const saved = manifest.pages.map(page => files[`edits/${page.id}.json`] || files[`pages/${page.id}.json`]).filter(Boolean);
  const { docs, types: derivedTypes, report } = projectBlocks(manifest.pages, saved, types, new Set(manifest.skipped), manifest.rules);
  const byId = new Map(saved.map(doc => [doc.page.id, doc]));
  const counts = {}, details = {};
  const bump = (kind, page, name = "total") => {
    const tally = counts[kind] ||= {};
    tally[name] = (tally[name] || 0) + 1;
    (details[kind] ||= new Set()).add(page);
  };
  for (const view of docs.filter(Boolean)) {
    const doc = byId.get(view.page.id), page = doc.page.pdf_page || view.page.id;
    const old = record(doc), now = record(view);
    const compare = (kind, from, to) => {
      const keys = new Set(to.map(now.key));
      for (const unit of from) if (!keys.has(old.key(unit))) bump(kind, page, unit.type);
    };
    compare("savedContainerFragmentsMissing", old.containers, now.containers);
    compare("savedLeavesMissing", old.leaves, now.leaves);
    const previous = new Map([...old.leaves, ...old.containers].map(unit => [old.key(unit), unit]));
    const current = new Map([...now.leaves, ...now.containers].map(unit => [now.key(unit), unit]));
    for (const [key, unit] of previous) {
      const found = current.get(key);
      if (found && unit.label && unit.label !== found.label) bump("savedLabelsChanged", page, unit.type);
      if (found && unit.number && normal(unit.number) !== normal(found.number || "")) bump("savedNumbersChanged", page, unit.type);
      if (unit.style && JSON.stringify(unit.style) !== JSON.stringify(found?.style)) bump("savedBlockStylesChanged", page, unit.type);
      if (!unit.children.some(child => child.unit)) for (const edge of ["start", "end"]) {
        if (!!unit.open?.[edge] !== !!found?.open?.[edge]) bump("savedLeafContinuationEdgesChanged", page, edge);
      }
    }
    for (const [key, unit] of current) {
      const before = previous.get(key);
      if (!before && unit.children.some(child => child.unit)) bump("extraDerivedContainerFragments", page, unit.type);
    }
    const originalsInOrder = (node, entry) => (node.flows.main || []).flatMap(id => {
      const unit = node.units.find(unit => unit.id === id);
      return entry.refsOf(unit);
    });
    const a = originalsInOrder(doc, old), b = originalsInOrder(view, now);
    if (a.join() !== b.join()) bump("pagesWithChangedMainBlockOrder", page);
    for (const [anchor, target] of old.targets) if (now.targets.get(anchor) !== target) bump("savedNoteLinksChanged", page);
    for (const anchor of now.targets.keys()) if (!old.targets.has(anchor)) bump("extraDerivedNoteLinks", page);
    for (const end of endings(doc, old.leaves, types)) bump("lineSeparatorsChanged", page, end);
    if ((doc.page.label || "") !== (view.page.label || "")) bump("savedPageLabelsChanged", page);
  }
  const [, warnings] = assemble(docs, derivedTypes);
  const [, savedWarnings] = assemble(docs.map(doc => doc && byId.get(doc.page.id)), types);
  return { book: manifest.title, pages: docs.filter(Boolean).length, ...report, savedJoinWarnings: savedWarnings.length,
    derivedJoinWarnings: warnings.length, counts, affectedPages: Object.fromEntries(Object.entries(details).map(([kind, pages]) => [kind, pages.size])) };
}

if (process.argv[1] && import.meta.url.endsWith(`/${process.argv[1].split("/").pop()}`)) {
  const paths = process.argv.slice(2);
  if (!paths.length) {
    console.error("Usage: node webapp/tools/blocks_audit.mjs BOOK.chaya.pdf […]");
    process.exitCode = 2;
  } else {
    const reports = [];
    for (const path of paths) reports.push(await auditBlocks(path));
    console.log(JSON.stringify(reports.length === 1 ? reports[0] : reports, null, 2));
  }
}
