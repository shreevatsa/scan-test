import { typeRevision } from "./schema.js?v=20261110-reading-2";
import { layerState, accept, sendBack, noteEdit } from "./layers.js?v=20261110-reading-2";
import { layoutCounts, layoutSignature, regionFlags, textFlags, readFlags } from "./flags.js?v=20261110-reading-2";

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
  pages.forEach((page, index) => {
    const state = states.get(page.id);
    if (!state) return;
    const neighbor = delta => {
      const other = pages[index + delta];
      if (!other || page.pdf_page && other.pdf_page && other.pdf_page !== page.pdf_page + delta) return null;
      if (state.doc?.source?.sample?.[`consecutive_${delta < 0 ? "previous" : "next"}`] === false) return null;
      return states.get(other.id)?.doc || null;
    };
    state.layout = layoutSignature(state.doc, types);
    state.layoutFrequency = state.doc ? counts.get(state.layout) || 0 : pending;
    state.regionFlags = regionFlags(state.doc, types, { errors: state.errors, previous: neighbor(-1), next: neighbor(1), frequency: state.layoutFrequency });
    state.textFlags = textFlags(state.doc, types);
    state.readFlags = readFlags(state.doc, state.errors, state.warnings, assemblyWarnings.filter(message =>
      message.includes(`${page.id}#`) || message.includes(`page ${page.id},`)));
    state.flags = [...new Set([...state.regionFlags, ...state.textFlags, ...state.readFlags].map(flag => flag.message).concat(Object.values(state.runErrors || {})))];
  });
}

export function stageFlags(state, stage) {
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
  const aliases = { types: ["regions", "types"], readers: ["text", "compare"], structures: ["read", "compare"],
    check: ["read", "problems"], style: ["read", "style"], make: ["regions", "pages"] };
  const old = Object.keys(aliases).find(key => hash.has(key));
  let stage = old ? aliases[old][0] : STAGES.find(key => hash.has(key));
  if (!stage) {
    const state = pageState(hash.get("p"));
    stage = hash.has("p") ? state ? state.layers.text?.accepted ? "read" : state.layers.regions?.accepted ? "text" : "regions"
      : ready.read ? "read" : "regions" : "pages";
  }
  const view = old ? aliases[old][1] : hash.get("view") || "";
  const locked = !ready[stage];
  if (locked) return { stage: "pages", mode: "grid", locked };
  const pid = hash.get("p");
  const views = { "regions/types": "types", "regions/proposal": "type-proposal", "text/compare": "readers", "read/compare": "structures",
    "read/problems": "check", "read/style": "style" };
  const mode = pid && !view ? "page" : views[`${stage}/${view}`] ||
    (stage === "export" ? "export" : stage === "read" && view !== "pages" ? "read" : "grid");
  return { stage, mode, pid, view, region: hash.get("r"), unit: hash.get("u"), locked: false };
}

export function workflowAddress(mode, pid = null, selection = {}) {
  const aliases = { types: "regions&view=types", readers: "text&view=compare", structures: "read&view=compare",
    check: "read&view=problems", style: "read&view=style", make: "regions", book: "regions", page: "read" };
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

export function readingDocuments(pages, docs) {
  const included = new Set(docs.map(doc => doc.page.id));
  return docs.map(doc => {
    const index = pages.findIndex(page => page.id === doc.page.id);
    const gapBefore = index > 0 && !included.has(pages[index - 1].id);
    const gapAfter = index + 1 < pages.length && !included.has(pages[index + 1].id);
    if (!gapBefore && !gapAfter) return doc;
    const next = structuredClone(doc);
    for (const unit of next.units) if (unit.open) {
      if (gapBefore) delete unit.open.start;
      if (gapAfter) delete unit.open.end;
      if (!Object.keys(unit.open).length) delete unit.open;
    }
    return next;
  });
}

export async function movePage(book, pid, layer, forward, check) {
  const change = (current, draft) => {
    if (!current) throw new Error("This page has no regions yet.");
    const doc = draft ? noteEdit(current, draft) : current;
    const [errors] = check(doc);
    if (forward && (errors.length || layer === "text" && pageStages(doc, book.types).missing))
      throw new Error(errors[0] || "Transcribe the missing line pieces before moving this page on.");
    return { doc: forward ? accept(doc, layer) : sendBack(doc, layer), valid: !errors.length };
  };
  if (book.writable) return book.updateStage(pid, (current, draft) => change(current, draft));
  const out = change(await book.current(pid), (await book.draft(pid))?.doc);
  await book.saveEdit(pid, out.doc, { classify: false });
  return out;
}
