import { typeRevision } from "./schema.js?v=20261112-regions-layout-1";
import { layerState, layerRecords, accept, sendBack, noteEdit } from "./layers.js?v=20261112-regions-layout-1";
import { layoutCounts, layoutSignature, regionFlags, textFlags, readFlags, RARE_LAYOUT } from "./flags.js?v=20261112-regions-layout-1";

export const STAGES = ["pages", "regions", "text", "read", "export"];
export const STAGE_LAYER = { regions: "regions", text: "text", read: "units" };

export function pageStages(doc, types, errors = [], warnings = []) {
  const layers = Object.fromEntries(["regions", "text", "units"].map(layer => [layer, layerState(doc, layer)]));
  const flags = [...errors, ...(doc?.source?.problems || []), ...(doc?.source?.warnings || [])];
  if (doc?.source?.omitted_regions?.length) flags.push(`${doc.source.omitted_regions.length} unassigned regions`);
  const missing = (doc?.page.regions || []).filter(region => types.types[region.type]?.region !== "figure")
    .flatMap(region => region.lines || []).filter(line => line.polygons?.length && typeof line.text !== "string").length;
  if (missing && layers.text) flags.push(`Text missing on ${missing} line pieces`);
  return { doc, layers, flags, errors, warnings, valid: !errors.length, missing,
    earlier: Object.values(layers).some(layer => layer && layer.types_revision < typeRevision(types.source?.revision)),
    suggestion: !!Object.keys(doc?.source?.suggestions || {}).length };
}

export function reviewPageStates(pages, states, types, assemblyWarnings = []) {
  const counts = layoutCounts([...states.values()].map(state => state.doc), types);
  const pending = [...states.values()].filter(state => !state.doc).length;
  const docOf = id => states.get(id)?.doc || null, cache = new WeakMap();
  pages.forEach((page, index) => {
    const state = states.get(page.id);
    if (!state) return;
    state.layout = layoutSignature(state.doc, types);
    state.layoutFrequency = state.doc ? counts.get(state.layout) || 0 : pending;
    state.rareLayout = !!state.doc && state.layoutFrequency < RARE_LAYOUT;
    state.regionFlags = regionFlags(state.doc, types, { errors: state.errors, cache,
      previous: pageWalker(pages, index, docOf, -1), next: pageWalker(pages, index, docOf, 1) });
    state.textFlags = textFlags(state.doc, types);
    state.readFlags = readFlags(state.doc, state.errors, state.warnings, assemblyWarnings.filter(message =>
      message.includes(`${page.id}#`) || message.includes(`page ${page.id},`)));
    state.flags = [...new Set([...state.regionFlags, ...state.textFlags, ...state.readFlags].map(flag => flag.message).concat(Object.values(state.runErrors || {})))];
  });
}

// The stage a page waits at: the first whose layer has not been moved on, and Read once its text has been.
export function currentStage(state) {
  return !state.layers.regions?.accepted ? "regions" : !state.layers.text?.accepted ? "text" : "read";
}

// A page's flags at a stage. Pages shows each page's flags at the stage it waits at: a layer that was moved on was
// accepted, and its stage still lists its flags.
export function stageFlags(state, stage) {
  if (stage === "pages") stage = currentStage(state);
  const flags = stage === "regions" ? (state.regionFlags || []).map(flag => flag.message)
    : stage === "text" ? [...state.errors, ...(state.textFlags || []).map(flag => flag.message)]
      : stage === "read" ? (state.readFlags || []).map(flag => flag.message) : state.flags;
  return state.runErrors?.[stage] ? [state.runErrors[stage], ...flags] : flags;
}

export function eligible(stage, state) {
  return stage === "text" ? !!state.layers.regions?.accepted : stage === "read" ? !!state.layers.text?.accepted : true;
}

export function availability(states) {
  return { pages: true, regions: true, text: states.some(state => eligible("text", state)),
    read: states.some(state => eligible("read", state)), export: true };
}

export function workflowRoute(value, ready, pageState = () => null) {
  const hash = new URLSearchParams(value.replace(/^#/, ""));
  const aliases = { readers: ["text", "compare"], structures: ["read", "compare"],
    check: ["read", "problems"], style: ["read", "style"], make: ["regions", "pages"], types: ["regions", "types"] };
  const old = Object.keys(aliases).find(key => hash.has(key));
  let stage = old ? aliases[old][0] : STAGES.find(key => hash.has(key));
  if (!stage) {
    const state = pageState(hash.get("p"));
    stage = hash.has("p") ? state ? state.layers.text?.accepted ? "read" : state.layers.regions?.accepted ? "text" : "regions"
      : ready.read ? "read" : "regions" : "pages";
  }
  let view = old ? aliases[old][1] : hash.get("view") || "";
  if (old === "types" && hash.get("view") === "proposal") view = "proposal";
  const locked = !ready[stage];
  if (locked) return { stage: "pages", mode: "grid", locked };
  const pid = hash.get("p");
  const views = { "regions/types": "types", "regions/proposal": "types", "text/compare": "readers", "read/compare": "structures",
    "read/problems": "check", "read/style": "style" };
  const mode = pid && !view ? "page" : views[`${stage}/${view}`] ||
    (stage === "export" ? "export" : stage === "read" && view !== "pages" ? "read" : "grid");
  return { stage, mode, pid, view, region: hash.get("r"), unit: hash.get("u"), locked: false };
}

export function workflowAddress(mode, pid = null, selection = {}) {
  const aliases = { readers: "text&view=compare", structures: "read&view=compare",
    check: "read&view=problems", style: "read&view=style", make: "regions", book: "regions", page: "read", types: "regions&view=types" };
  const hash = aliases[mode] || mode;
  const extra = selection.region ? `&r=${encodeURIComponent(selection.region)}` : selection.unit ? `&u=${encodeURIComponent(selection.unit)}` : "";
  return `#${hash}${pid ? `&p=${encodeURIComponent(pid)}` : ""}${extra}`;
}

export function readingGaps(pages, included) {
  const gaps = [];
  for (let index = 0; index < pages.length; index++) {
    if (included.has(pages[index].id)) continue;
    const start = index + 1;
    while (index + 1 < pages.length && !included.has(pages[index + 1].id)) index++;
    gaps.push(start === index + 1 ? `Page ${start}` : `Pages ${start}–${index + 1}`);
  }
  return gaps;
}

// The book's pages in order, each its document where it is in `docs` and null where it is not: what Read assembles (the
// pages moved on to Read), and Problems and Export (the pages with a document). Assembly joins nothing across a null,
// so a page not moved on yet (or with no document yet) is a gap that no unit crosses.
export function readingDocuments(pages, docs) {
  const byId = new Map(docs.map(doc => [doc.page.id, doc]));
  return pages.map(page => byId.get(page.id) || null);
}

// A page with no regions has no content: a library's cover, a blank page, a page that is not part of the book. It has
// nothing to transcribe or complete, so Text and Read count it as done and their processing skips it. Units join across
// it as across any page with no unit of their type (webapp/js/assemble.js).
export const noContent = doc => !!doc && !doc.page.regions.length;

// The pages before (delta -1) or after (delta 1) the page at `index`, for comparing continuations: a function that takes
// a test of the pages to look past and returns the nearest page's document that fails it, or null where the book does
// not go on (its first or last page, a page with no document yet, a gap in the PDF's page numbers, a break between
// sample pages). docOf(id) gives a page's document.
export function pageWalker(pages, index, docOf, delta) {
  return (lookPast = () => false) => {
    for (let k = index; ; k += delta) {
      const here = pages[k], other = pages[k + delta];
      if (!other || here.pdf_page && other.pdf_page && other.pdf_page !== here.pdf_page + delta) return null;
      if (docOf(here.id)?.source?.sample?.[`consecutive_${delta < 0 ? "previous" : "next"}`] === false) return null;
      const doc = docOf(other.id);
      if (!doc || !lookPast(doc)) return doc || null;
    }
  };
}

export async function movePage(book, pid, layer, forward, check) {
  const change = (current, draft) => {
    if (!current) throw new Error("This page has no regions yet.");
    let doc = draft ? noteEdit(current, draft) : current;
    const [errors] = check(doc);
    if (forward && (errors.length || layer === "text" && pageStages(doc, book.types).missing))
      throw new Error(errors[0] || "Transcribe the missing line pieces before moving this page on.");
    // A page with no content moves on from Text with an empty text layer, as transcribing it would give (with no call).
    if (forward && layer === "text" && noContent(doc) && !layerState(doc, "text")) {
      doc = structuredClone(doc);
      doc.source = { ...doc.source, layers: { ...layerRecords(doc), text: { state: "model", types_revision: typeRevision(book.types.source?.revision) } } };
    }
    return { doc: forward ? accept(doc, layer) : sendBack(doc, layer), valid: !errors.length };
  };
  if (book.writable) return book.updateStage(pid, (current, draft) => change(current, draft));
  const out = change(await book.current(pid), (await book.draft(pid))?.doc);
  await book.saveEdit(pid, out.doc, { classify: false });
  return out;
}
