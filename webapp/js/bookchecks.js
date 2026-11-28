// Scan checks are derived from the visible reading and never written into the book.
import { UNCLASSIFIED } from "./chaya-book.js?v=20261128-join-sections";

export const typeLabel = type => type === "?" ? "Needs a type" : type[0].toUpperCase() + type.slice(1).replaceAll("_", " ");

export const compareScanBoxes = (a, b) => a[1] - b[1] || a[0] - b[0];

export function existingProposedType(region, types) {
  const name = region.proposed;
  if (!name || !types) return;
  if (Object.hasOwn(types, name)) return name;
  const fold = value => value.normalize("NFC").toLowerCase();
  const key = fold(name);
  const matches = Object.keys(types).filter(type => fold(type) === key);
  if (matches.length === 1) return matches[0];
}

export function areaTitle(region, types) {
  const existing = existingProposedType(region, types);
  if (existing) return `Suggested type: ${typeLabel(existing)}`;
  return region.proposed ? `May be a new type: ${region.proposed.replaceAll("_", " ")}` : "Needs a type";
}

export function pageCaption(page) {
  const scan = `PDF page ${page.pdf_page}`;
  return page.label == null || page.label === "" ? scan : `p. ${page.label} · ${scan}`;
}
export function checksFor(book) {
  const available = new Map(), notes = [], sources = [], checks = book.pages.map(() => []);
  for (const [index, page] of book.pages.entries()) {
    if (page.skip) continue;
    for (const region of page.regions ?? []) {
      const address = `${index + 1}/${region.id}`, type = book.types[region.type] ?? {};
      if (region.ignored || type.ignored) continue;
      if (region.type === UNCLASSIFIED || region.type === "?" || region.proposed) checks[index].push({ kind: "type", address, title: areaTitle(region, book.types) });
      available.set(address, type);
      if (type.flow === "notes") notes.push({ index, address });
      if (region.uncertain) checks[index].push({ kind: "uncertain", address, title: "The reading is uncertain" });
      if (region.type !== "?" && !type.figure && !region.lines?.length)
        checks[index].push({ kind: "unread", address, title: "This region has no reading yet" });
      for (const [line, piece] of (region.lines ?? []).entries()) {
        if (piece.text == null) checks[index].push({ kind: "unread", address, line, title: `Line ${line + 1} has no reading yet` });
        for (const [span, marker] of (piece.spans ?? []).entries()) if (marker.kind === "note_marker")
          sources.push({ index, address, line, span, marker });
      }
    }
  }
  const linked = new Set();
  for (const { index, address, line, span, marker } of sources) {
    if (available.has(marker.to) || (marker.to && Object.hasOwn(book.containers ?? {}, marker.to))) linked.add(marker.to);
    else checks[index].push({ kind: "marker", address, line, span, title: `Note marker ${marker.marker} has no note` });
  }
  for (const { index, address } of notes) if (!linked.has(address))
    checks[index].push({ kind: "note", address, title: "No marker points to this note" });
  return checks;
}
