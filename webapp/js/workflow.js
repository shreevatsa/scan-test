import { typeRevision } from "./schema.js?v=20261124-vision-1";
import { layerState, layerRecords, accept, sendBack, noteEdit, pageReviewState } from "./layers.js?v=20261124-vision-1";
import { layoutCounts, layoutSignature, regionFlags, regionWarnings, textFlags, readFlags, RARE_LAYOUT } from "./flags.js?v=20261124-vision-1";

export const STAGES = ["pages", "regions", "text", "read", "export"];
export const REVIEW_LABELS = { unchecked: "Unchecked", checked: "Checked", suggestion: "Suggestion waiting" };
export const STAGE_LAYER = { regions: "regions", text: "text" };

export function pageStages(doc, types, errors = [], warnings = []) {
  const layers = Object.fromEntries(["regions", "text"].map(layer => [layer, layerState(doc, layer)]));
  const flags = [...errors, ...(doc?.source?.problems || []), ...regionWarnings(doc)];
  if (doc?.source?.omitted_regions?.length) flags.push(`${doc.source.omitted_regions.length} unassigned regions`);
  const missing = (doc?.page.regions || []).filter(region => types.types[region.type]?.region !== "figure")
    .flatMap(region => region.lines || []).filter(line => line.polygons?.length && typeof line.text !== "string").length;
  if (missing && layers.text) flags.push(`Text missing on ${missing} line pieces`);
  return { doc, layers, flags, errors, warnings, valid: !errors.length, missing, readable: hasReading(doc, types),
    earlier: Object.values(layers).some(layer => layer && layer.types_revision < typeRevision(types.source?.revision)),
    ...pageReviewState(doc, Object.values(layers)) };
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

// The next kind of work implied by the page's current contents.
export function currentStage(state) {
  if (!state?.doc) return "regions";
  return state.readable && !state.missing ? "read" : "text";
}

// Pages collects findings across the book. Each processing view shows the relevant findings.
export function stageFlags(state, stage) {
  const flags = stage === "regions" ? (state.regionFlags || []).map(flag => flag.message)
    : stage === "text" ? [...state.errors, ...(state.textFlags || []).map(flag => flag.message)]
      : stage === "read" ? (state.readFlags || []).map(flag => flag.message) : state.flags;
  return state.runErrors?.[stage] ? [state.runErrors[stage], ...flags] : flags;
}

export function hasReading(doc, types) {
  if (!doc) return false;
  const textBlocks = doc.page.regions.filter(region => types.types[region.type]?.region !== "figure");
  return !textBlocks.length || textBlocks.some(region => region.lines?.some(line => typeof line.text === "string"));
}

// A model needs valid input from the previous operation. Reviewing it is a separate choice.
export function eligible(stage, state) {
  if (stage !== "text" && stage !== "read") return true;
  return !!state?.doc && state.valid && (stage === "text" || state.readable && !state.missing);
}

export function nextProcessingStage(state) {
  if (!state?.doc) return "regions";
  if (!state.valid || noContent(state.doc) || state.doc.source?.suggestions?.text) return null;
  return !state.readable || state.missing ? "text" : null;
}

// The one state a page card shows: null for a dimmed page; "unprocessed" while the page waits to be processed;
// "check" with the things to check on it (its flags and a waiting suggestion), or with none while a processed page has
// not been marked checked; "checked"; or "empty" for a page with no content. "Next page to check" follows the same rule.
export function pageCheck(state, dimmed = false) {
  if (dimmed) return null;
  const items = [...(state?.flags || [])];
  if (!state?.doc || nextProcessingStage(state)) return { kind: "unprocessed", label: "Not processed", items };
  if (state.suggestion) items.push("A model suggestion is waiting.");
  if (items.length) return { kind: "check", label: `${items.length} to check`, items };
  if (noContent(state.doc)) return { kind: "empty", label: "No content", items };
  if (state.checked) return { kind: "checked", label: "Checked", items };
  return { kind: "check", label: "To check", items };
}

// The next page after `fromId` (going round to the start) whose card says there is something to check, or null.
export function nextPageToCheck(pages, states, fromId, dimmed = () => false) {
  const from = pages.findIndex(page => page.id === fromId);
  const order = [...pages.slice(from + 1), ...pages.slice(0, Math.max(from, 0))];
  return order.find(page => pageCheck(states.get(page.id), dimmed(page.id))?.kind === "check")?.id || null;
}

// The processing box on Pages is shown in full while pages wait to be processed, while a run goes, or once opened;
// otherwise it is one line.
export const processingForm = ({ waiting = 0, busy = false, opened = false } = {}) => waiting || busy || opened ? "full" : "line";

export function workflowRoute(value) {
  const hash = new URLSearchParams(value.replace(/^#/, ""));
  const pid = hash.get("p"), region = hash.get("r"), unit = hash.get("u");
  const view = hash.get("view") || "";
  const at = (stage, mode, section = "") => ({ stage, mode, pid, view: section, region, unit });
  if (pid && (!view || hash.has("blocks"))) return at("page", "page");
  if (hash.has("style") || (hash.has("read") || hash.has("export")) && view === "style") return at("export", "style", "style");
  if (hash.has("readers") || hash.has("text") && view === "compare") return at("settings", "settings");
  if (hash.has("settings") || hash.has("regions") || hash.has("types") || hash.has("make") || hash.has("structures") || hash.has("read") && view === "compare")
    return at("settings", "settings", hash.has("types") ? view || "types" : view === "types" ? view : "");
  if (hash.has("check") || hash.has("read") && ["problems", "pages"].includes(view)) return at("pages", "grid", view === "problems" || hash.has("check") ? "problems" : "");
  if (hash.has("export")) return at("export", "export", view);
  if (hash.has("pages") && view === "problems") return at("pages", "grid", "problems");
  if (hash.has("read") || hash.has("blocks")) return at("read", "read");
  return at("pages", "grid");
}

export function workflowAddress(mode, pid = null, selection = {}) {
  const aliases = { readers: "settings", structures: "settings", check: "pages&view=problems",
    style: "export&view=style", plain: "read", make: "settings", book: "settings", types: "settings&view=types",
    regions: "settings", text: "pages" };
  const hash = pid && ["page", "settings", ...STAGES].includes(mode) ? "page" : aliases[mode] || mode;
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

// Pages in book order, with null where the caller has no document to include. Assembly never crosses a null.
// A dimmed page (`skipped`, a set of page ids or a function) is not part of the book: it is left out, not a gap, so a
// unit goes on across it, as across a duplicate scan of a page.
export function readingDocuments(pages, docs, skipped = null) {
  const byId = new Map(docs.map(doc => [doc.page.id, doc]));
  const left = typeof skipped === "function" ? skipped : skipped ? id => skipped.has(id) : () => false;
  return pages.filter(page => !left(page.id)).map(page => byId.get(page.id) || null);
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
      throw new Error(errors[0] || "Transcribe the missing line pieces before marking the text reviewed.");
    // Reviewing a blank page's text creates an empty text layer without a transcription call.
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
