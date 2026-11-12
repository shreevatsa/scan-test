import { suggestionButton } from "./review-view.js?v=20261112-leave-out-1";
import { h } from "./render.js";
import { eligible, STAGE_LAYER, movePage, stageFlags, pageStages } from "./workflow.js?v=20261112-leave-out-1";
import { RARE_LAYOUT } from "./flags.js?v=20261112-quiet-1";
import { regionBoxes } from "./pageimage.js?v=20261110-figure-region-2";
import { pageRange, renderPage } from "./pipeline/pdf.js";
import { lazyThumbnails, pageSelectionText } from "./page-browser.js?v=20261110-reading-2";
import { READERS, STRUCTURERS, OCR_LANGUAGES } from "./pipeline/readers.js?v=20261111-carbon-high-5";
import { FINDERS, finderById } from "./pipeline/finders.js?v=20261111-cross-page-carbon-2";
import { stageKeyControls, CredentialChecks } from "./key-check.js?v=20261112-leave-out-1";
import { settings } from "./store.js?v=20261112-leave-out-1";
import { runBatch } from "./pipeline/batch.js?v=20261110-partial-3";
import { runProgress } from "./run-progress.js";
import { pageCost, recipeLine, runEstimate, costBasis, dollars } from "./recipe.js?v=20261112-recipe-2";
import { renderFinders } from "./findersview.js?v=20261112-leave-out-1";

const TITLES = { pages: "Pages", regions: "Regions", text: "Text", read: "Units and links" };
const ACTIONS = { regions: "Find regions", text: "Transcribe", read: "Complete units and links" };
const stateLabel = state => !state ? "Pending" : state.accepted ? "Moved on" : state.state === "model" ? "Ready to review" : state.state === "edited" ? "Edited" : "Provisional";
const pages = n => `${n} ${n === 1 ? "page" : "pages"}`;

// A question before an action, answered in a dialog: resolves whether to go ahead.
function confirmAction(title, lines, action) {
  return new Promise(resolve => {
    const dialog = h("dialog", { class: "type-dialog confirm-dialog", "aria-label": title });
    const done = value => { if (dialog.open) dialog.close(); dialog.remove(); resolve(value); };
    dialog.append(h("h2", {}, title), ...lines.map(line => h("p", {}, line)),
      h("div", { class: "actions" }, h("button", { class: "primary", onclick: () => done(true) }, action), h("button", { onclick: () => done(false) }, "Cancel")));
    dialog.addEventListener("cancel", event => { event.preventDefault(); done(false); });
    document.body.append(dialog);
    dialog.showModal();
  });
}

export async function renderPages(el, app) {
  const book = app.book, stage = app.stage, layer = STAGE_LAYER[stage];
  const overview = stage === "regions" ? app.regionOverview : null;
  const token = app.routeToken;
  const active = () => app.book === book && app.stage === stage && app.mode === "grid" && app.routeToken === token;
  const pending = app.pendingStageSelection?.stage === stage ? app.pendingStageSelection : null;
  const rows = new Map(), urls = new Set(), selected = new Set(pending?.ids || overview?.selected || []);
  // Pages shows every page, and the pages left out of the book greyed, with their work (kept, not shown elsewhere).
  // Page numbers are places in the full list, the same in every grid.
  const pagesStage = stage === "pages", leftOutStates = new Map();
  if (pagesStage) for (const page of book.allPages) if (book.isLeftOut(page.id))
    leftOutStates.set(page.id, { ...pageStages(await book.current(page.id).catch(() => null), book.types), runErrors: {} });
  const stateOf = pid => app.pageStates.get(pid) || leftOutStates.get(pid);
  // A kept or handed-on selection can name pages left out since (or unknown): they are not in this grid.
  for (const pid of [...selected]) if (!stateOf(pid)) selected.delete(pid);
  if (overview) overview.selected = selected;
  app.pendingStageSelection = null;
  let observer, queue = Promise.resolve(), visible = [], lastSelected = null, stopped = false, busy = false;
  const grid = h("div", { class: "stage-grid", "aria-label": `${TITLES[stage]} page grid` });
  const selection = h("input", { placeholder: "all or 1-50, 62", "aria-label": "Select page range" });
  const showSelection = () => { selection.value = pageSelectionText([...selected].map(pid => book.number(pid)), book.allPages.length); };
  if (selected.size) showSelection();
  const stateFilter = h("select", { "aria-label": "Page state" }, ...["all", "pending", "model", "edited", "provisional", "accepted"].map(value =>
    h("option", { value }, { all: "All states", pending: "Pending", model: "Ready to review", edited: "Edited", provisional: "Provisional", accepted: "Moved on" }[value])));
  const filter = h("select", { "aria-label": "Page flags" }, ...[["all", "All pages"], ["flagged", "Flagged"], ...stage === "regions" ? [["rareLayout", `Rare layouts (under ${RARE_LAYOUT} pages)`]] : [],
    ["earlier", "Earlier type revision"], ["suggestion", "Has a suggestion"], ...pagesStage ? [["included", "In the book"], ["leftOut", "Left out"]] : []].map(([value, label]) => h("option", { value }, label)));
  const grouping = h("select", { "aria-label": "Group pages by layout" }, h("option", { value: "order" }, "Page order"), h("option", { value: "layout" }, "Layout · rarest first"));
  if (overview?.filters) {
    stateFilter.value = overview.filters.state;
    filter.value = overview.filters.flags;
    grouping.value = overview.filters.grouping;
  }
  const flagsFor = pid => book.isLeftOut(pid) ? [] : stageFlags(stateOf(pid), stage);
  const summary = h("p", { class: "stage-selection", role: "status" });
  const message = h("p", { role: "status" });
  const empty = h("p", { class: "hint", hidden: true });
  const targetIds = () => (selected.size ? [...selected] : visible).filter(pid => eligible(stage, stateOf(pid)));
  const layerReady = pid => {
    const state = stateOf(pid);
    return state.layers[layer] && (layer !== "units" || state.layers.units.state !== "provisional");
  };
  let cost = pageCost(null), runButton, moveButton, backButton, leaveButton, includeButton, checks, profile;
  const processSummary = h("span", { class: "meta" }), recipeText = h("span");
  const include = h("input", { type: "checkbox", checked: pending?.reprocess, "aria-label": "Include pages already processed" });
  const fresh = h("input", { type: "checkbox", "aria-label": "Request fresh model results" });
  const estimateLabel = h("p", { class: "hint" });
  const runnable = () => targetIds().filter(pid => include.checked || !layerReady(pid));
  const refreshSummary = () => {
    const ids = targetIds(), flagged = ids.filter(pid => flagsFor(pid).length).length;
    const hidden = ids.filter(pid => !visible.includes(pid)).length;
    const scope = selected.size ? `${ids.length} selected${hidden ? ` (${hidden} hidden by filters)` : ""}`
      : stage === "pages" ? `${ids.length} pages` : `All ${ids.length} displayed pages targeted`;
    summary.textContent = `${scope} · ${flagged} flagged · ${visible.length} shown${pagesStage && book.leftOut.size ? ` · ${book.leftOut.size} left out of the book` : ""}`;
    if (leaveButton) {
      leaveButton.disabled = busy || !ids.some(pid => !book.isLeftOut(pid));
      includeButton.disabled = busy || !ids.some(pid => book.isLeftOut(pid));
    }
    if (runButton) {
      const ready = profile && checks?.status(profile)?.valid;
      const count = runnable().length;
      runButton.disabled = busy || !book.writable || !count || !ready;
      processSummary.textContent = `${recipeLine(stage, profile, cost)} · ${count} ${count === 1 ? "page" : "pages"} to process`;
      recipeText.textContent = recipeLine(stage, profile, cost);
      recipeText.title = profile ? `Cost a page: ${costBasis(cost)}.` : "";
      estimateLabel.textContent = runEstimate(count, cost);
    }
    if (moveButton) moveButton.disabled = busy || !ids.some(pid => layerReady(pid));
    if (backButton) backButton.disabled = busy || !ids.some(pid => stateOf(pid).layers[stage === "text" ? "regions" : "text"]?.accepted);
  };
  const applyFilters = () => {
    if (overview) overview.filters = { state: stateFilter.value, flags: filter.value, grouping: grouping.value };
    visible = [];
    let removed = false;
    const sorted = [...rows].sort(([a], [b]) => grouping.value === "layout"
      ? stateOf(a).layoutFrequency - stateOf(b).layoutFrequency || stateOf(a).layout.localeCompare(stateOf(b).layout) || book.number(a) - book.number(b)
      : book.number(a) - book.number(b));
    grid.querySelectorAll(".layout-heading").forEach(heading => heading.remove());
    let lastLayout = null;
    for (const [pid, row] of sorted) {
      const state = stateOf(pid), owned = state.layers[layer || "regions"], leftOut = book.isLeftOut(pid);
      const layers = stage === "pages" ? Object.values(state.layers) : [owned];
      const matchesState = stateFilter.value === "all" || layers.some(value => stateFilter.value === "pending" ? !value || value.state === "provisional"
        : stateFilter.value === "accepted" ? value?.accepted : value?.state === stateFilter.value && !value.accepted);
      const matchesFlag = filter.value === "all" || (filter.value === "leftOut" ? leftOut : filter.value === "included" ? !leftOut
        : !leftOut && (filter.value === "flagged" ? flagsFor(pid).length : state[filter.value]));
      row.element.hidden = !eligible(stage, state) || !matchesState || !matchesFlag;
      if (!eligible(stage, state) && selected.delete(pid)) removed = true;
      if (!row.element.hidden) visible.push(pid);
      if (!row.element.hidden && grouping.value === "layout" && state.layout !== lastLayout) {
        grid.append(h("h3", { class: "layout-heading" }, `${state.layout || "No regions yet"} · ${state.layoutFrequency} ${state.layoutFrequency === 1 ? "page" : "pages"}`));
        lastLayout = state.layout;
      }
      grid.append(row.element);
      row.checkbox.checked = selected.has(pid);
    }
    if (removed) showSelection();
    empty.hidden = !!visible.length;
    empty.textContent = [...rows.keys()].some(pid => eligible(stage, stateOf(pid)))
      ? "No pages match these filters." : "Move pages on from the previous stage to include them here.";
    refreshSummary();
  };
  const refreshCard = pid => {
    const row = rows.get(pid), state = stateOf(pid), leftOut = book.isLeftOut(pid);
    if (!row) return;
    row.element.classList.toggle("left-out", leftOut);
    row.states.replaceChildren(...leftOut ? [h("span", { class: "stage-badge left-out-badge" }, "Left out")] : [],
      ...(stage === "pages" ? ["regions", "text", "units"] : [layer]).map(name =>
        h("span", { class: `stage-badge ${state.layers[name]?.accepted ? "accepted" : ""}` }, `${{ regions: "Regions", text: "Text", units: "Units" }[name]} · ${stateLabel(state.layers[name])}`)));
    const flags = flagsFor(pid);
    row.flags.textContent = flags.length ? `${flags.length} ${flags.length === 1 ? "flag" : "flags"} · ${flags[0]}` : "";
    row.element.classList.toggle("has-flags", !!flags.length);
    row.flags.title = flags.join("\n");
    row.element.querySelector(".suggestion-actions")?.remove();
    if (!leftOut) row.element.append(suggestionButton(app, pid, layer));
    row.element.querySelector(".stage-boxes")?.remove();
    if (state.doc) row.element.querySelector(".start-manual")?.remove();
    if (stage === "regions" && state.doc) row.element.querySelector(".stage-thumbnail").append(regionBoxes(state.doc, app.colors));
  };
  const preview = h("dialog", { class: "pdf-preview-dialog", "aria-label": "Scanned page preview" });
  // The Pages grid's preview: every page of the book, left out or not.
  const showPreview = async pid => {
    const index = book.number(pid) - 1, list = book.allPages, leftOut = book.isLeftOut(pid);
    const image = h("img", { class: "pdf-page-preview", alt: `Page ${index + 1} scan` });
    preview.replaceChildren(h("div", { class: "actions" },
      h("button", { disabled: index === 0, onclick: () => showPreview(list[index - 1].id) }, "← Previous"),
      h("button", { disabled: index === list.length - 1, onclick: () => showPreview(list[index + 1].id) }, "Next →"),
      h("button", { onclick: () => preview.close() }, "Close"),
      leftOut ? null : h("button", { onclick: () => { preview.close(); app.openPage(pid, {}, "regions"); } }, "Open in Regions"),
      pagesStage && book.writable ? h("button", { onclick: async () => { if (await changeLeftOut(!leftOut, [pid], true)) showPreview(pid); } }, leftOut ? "Include again" : "Leave out") : null),
      h("h3", {}, `Page ${index + 1}${leftOut ? " · left out of the book" : ""}`), image);
    if (!preview.open) preview.showModal();
    image.src = await book.imageUrl(pid);
  };
  for (const page of pagesStage ? book.allPages : book.pages) {
    const state = stateOf(page.id);
    if (!eligible(stage, state)) continue;
    const checkbox = h("input", { type: "checkbox", "aria-label": `Select page ${book.number(page.id)}`, onclick: event => {
      const ids = event.shiftKey && lastSelected && visible.includes(lastSelected) ? visible.slice(
        Math.min(visible.indexOf(lastSelected), visible.indexOf(page.id)), Math.max(visible.indexOf(lastSelected), visible.indexOf(page.id)) + 1) : [page.id];
      for (const pid of ids) { if (checkbox.checked) selected.add(pid); else selected.delete(pid); }
      lastSelected = page.id;
      showSelection();
      applyFilters();
    } });
    const image = h("img", { alt: `Page ${book.number(page.id)}`, width: 120, height: 166 });
    const states = h("div", { class: "stage-badges" }), flags = h("p", { class: "stage-flags" });
    const element = h("article", { class: "stage-card", dataset: { page: page.id } },
      h("button", { class: "stage-thumbnail", "aria-label": `Open page ${book.number(page.id)}`, onclick: () => stage === "pages" ? showPreview(page.id) : app.openPage(page.id, {}, stage) }, image),
      h("label", {}, checkbox, ` Page ${book.number(page.id)}${page.label ? ` · ${page.label}` : ""}`), states, flags);
    if (stage === "regions" && !state.doc && book.writable) element.append(h("button", { class: "mini start-manual", onclick: async event => {
      if (app.workflowBusy) return;
      const button = event.currentTarget;
      button.disabled = true; button.textContent = "Preparing page…";
      try { await app.startByHand(page.id); } catch (error) { app.toast(error.message, "bad"); }
      finally { button.disabled = false; button.textContent = "Start by hand"; }
    } }, "Start by hand"));
    rows.set(page.id, { element, checkbox, image, states, flags });
    grid.append(element);
    refreshCard(page.id);
  }
  const toolbar = h("div", { class: "stage-filters" }, h("label", {}, "Select pages ", selection),
    h("button", { onclick: () => {
      try {
        const numbers = pageRange(selection.value, book.allPages.length);
        selected.clear();
        for (const number of numbers) {
          const pid = book.allPages[number - 1].id;
          if (rows.has(pid)) selected.add(pid);
        }
        applyFilters();
      } catch (error) { message.textContent = error.message; }
    } }, "Select range"), h("button", { onclick: () => { selected.clear(); selection.value = ""; applyFilters(); } }, "Clear selection"), stateFilter, filter,
    ...(stage === "regions" ? [grouping] : []));
  const stageReview = h("div", { class: "actions stage-review" });
  const heading = h("h1", {}, TITLES[stage]);
  app.regionTypePanel = null;
  const content = h("div", { class: "region-grid-content" }, toolbar, stageReview, summary, message, empty, grid, preview);
  // Model choice, credentials and run controls are one section, open at first while pages wait for this stage's
  // processing. A read-only book has none of them, only the way to an editable copy.
  const processing = stage !== "pages" && book.writable;
  // The stage's one line names its model and cost a page; "Change" opens the model list and the comparison.
  app.changeOpen ||= {};
  const modelFields = h("div", { class: "fields" });
  const changeArea = h("div", { class: "recipe-change", hidden: !(app.routeView === "compare" || app.changeOpen[stage]) }, modelFields);
  const changeButton = h("button", { class: "mini", "aria-expanded": String(!changeArea.hidden), onclick: () => {
    changeArea.hidden = !changeArea.hidden;
    app.changeOpen[stage] = !changeArea.hidden;
    changeButton.textContent = changeArea.hidden ? "Change" : "Close";
    changeButton.setAttribute("aria-expanded", String(!changeArea.hidden));
  } }, changeArea.hidden ? "Change" : "Close");
  const recipeRow = h("p", { class: "recipe-line" }, recipeText, " ", changeButton);
  const runArea = h("div");
  app.processOpen ||= {};
  const waiting = [...rows.keys()].filter(pid => !layerReady(pid)).length;
  const processSection = processing ? h("details", { class: "region-section process-section",
    open: app.routeView === "compare" || !!pending || (app.processOpen[stage] ?? waiting > 0) }, h("summary", {}, "Process pages", " ", processSummary), recipeRow, changeArea, runArea) : null;
  processSection?.addEventListener("toggle", () => { if (active()) app.processOpen[stage] = processSection.open; });
  const readOnly = stage !== "pages" && !book.writable ? h("p", { class: "box read-only-line" }, "This book is read only here. ",
    h("button", { class: "primary", onclick: () => app.continueBook(stage) }, "Make an editable copy"), " in this browser to process pages and move them on.") : null;
  let comparison, comparisonContent;
  let setBusy = (area, value) => { app.workflowBusy = app.header.inert = value; };
  const loadOnOpen = (section, target, render) => {
    let loaded = false;
    const load = async () => {
      if (!section.open || loaded || !active()) return;
      loaded = true;
      try { await render(); }
      catch (error) { target.replaceChildren(h("p", { role: "status", class: "bad" }, error.message)); loaded = false; }
    };
    section.addEventListener("toggle", load);
    load();
  };
  if (overview && processing) {
    comparisonContent = h("div");
    comparison = h("details", { class: "region-disclosure", open: app.routeView === "compare" || overview.compare }, h("summary", {}, "Compare finders"), comparisonContent);
    comparison.addEventListener("toggle", () => { if (active()) overview.compare = comparison.open; });
    changeArea.append(comparison);
    setBusy = (area, value) => {
      app.workflowBusy = app.header.inert = value;
      for (const part of [recipeRow, modelFields, runArea, comparisonContent, content]) if (part !== area) part.inert = value;
    };
  }
  const container = h("div", { class: "stage-overview" }, heading,
    h("p", { class: "hint" }, stage === "pages" ? `Browse the scans and see each page’s progress. ${book.writable ? "Leave out pages that are not part of the book, such as a library’s cover or blank pages: the other tabs, counts, estimates, Read and the exports then go without them. Nothing of theirs is deleted, and “Include again” brings them back. " : ""}In Regions, review the types and page assignments, then continue through Text and Read.`
      : stage === "regions" ? "Find and review the page regions. Move reviewed pages on to Text together."
        : stage === "text" ? "Transcribe the pages moved on from Regions. Review the text beside the scans, then move pages on to Read."
          : "Complete units and links using the accepted transcription. Open pages to review their structure."),
    processSection, readOnly, content);
  el.replaceChildren(container);
  const dispose = () => { observer?.disconnect(); for (const url of urls) URL.revokeObjectURL(url); preview.close(); };
  app.onLeaveGrid = dispose;
  observer = lazyThumbnails(el, target => {
    queue = queue.catch(() => {}).then(async () => {
      if (!active()) return;
      const pid = target.dataset.page, page = book.page(pid), row = rows.get(pid);
      try {
        const blob = page.pdf_page && !page.image ? (await renderPage(await book.pdf(), page.pdf_page, 36)).blob : await book.imageBlob(pid);
        if (!active()) return;
        const url = URL.createObjectURL(blob); urls.add(url); row.image.src = url;
      } catch (error) { row.image.alt = row.image.parentElement.title = `Preview unavailable · ${error.message}`; }
    });
  });
  for (const row of rows.values()) observer.observe(row.element);
  // Leaving pages out of the book, and including them again (Pages, in a book that can be changed). With no selection,
  // the displayed pages are targeted, and leaving them all out is asked first; so is leaving out pages with work.
  async function changeLeftOut(out, ids = targetIds(), explicit = !!selected.size) {
    if (app.workflowBusy || busy) return false;
    ids = ids.filter(pid => book.isLeftOut(pid) !== out);
    if (!ids.length) return false;
    if (out) {
      const worked = await book.pagesWithWork(ids), lines = [];
      if (!explicit) lines.push(`No pages are selected, so this leaves out every page shown: ${pages(ids.length)}.`);
      if (worked.length) lines.push(`${worked.length === ids.length ? (ids.length === 1 ? "This page has" : `All ${ids.length} have`) : `${worked.length} of the ${ids.length} ${worked.length === 1 ? "has" : "have"}`} work in ${worked.length === 1 ? "it" : "them"} (regions, text or units). Nothing is deleted: it is kept with the book and comes back when ${worked.length === 1 ? "the page is" : "they are"} included again.`);
      if (lines.length && !await confirmAction(`Leave out ${pages(ids.length)}?`, lines, `Leave out ${pages(ids.length)}`)) return false;
    }
    busy = app.workflowBusy = true;
    refreshSummary();
    try {
      const changed = await book.leaveOut(ids, out);
      for (const pid of changed) {
        if (out) leftOutStates.set(pid, app.pageStates.get(pid) || { ...pageStages(await book.current(pid).catch(() => null), book.types), runErrors: {} });
        else leftOutStates.delete(pid);
      }
      await app.pagesChanged();
      for (const pid of rows.keys()) refreshCard(pid);
      message.textContent = out ? `${pages(changed.length)} left out of the book. Nothing is deleted: “Include again” brings ${changed.length === 1 ? "it" : "them"} back.`
        : `${pages(changed.length)} included again.`;
      app.diskCopy?.checkpoint();
      return true;
    } catch (error) { message.textContent = error.message; return false; }
    finally { busy = app.workflowBusy = false; if (active()) applyFilters(); }
  }
  if (pagesStage && book.writable) {
    leaveButton = h("button", { onclick: () => changeLeftOut(true) }, "Leave out");
    includeButton = h("button", { onclick: () => changeLeftOut(false) }, "Include again");
    stageReview.append(leaveButton, includeButton);
  }
  stateFilter.onchange = filter.onchange = applyFilters;
  grouping.onchange = applyFilters;
  applyFilters();
  if (!processing) return;

  const maker = await app.getMaker(), options = await maker.options();
  if (!active()) return;
  checks = maker.credentials ||= new CredentialChecks(maker.keys);
  const profiles = stage === "regions" ? FINDERS
    : stage === "text" ? READERS : STRUCTURERS;
  const chosen = overview?.manual ? "manual" : stage === "regions" ? finderById(options.finder).id : stage === "text" ? options.reader : options.structurer;
  profile = profiles.find(item => item.id === chosen);
  const select = h("select", { "aria-label": overview ? "Chosen region finder" : `Chosen ${stage === "text" ? "transcription" : "completion"} model` },
    ...profiles.map(item => h("option", { value: item.id, selected: item.id === chosen }, item.label)),
    overview ? h("option", { value: "manual", selected: chosen === "manual" }, "Draw by hand") : null);
  const keyPanel = h("div");
  const runControls = h("div");
  const manualHint = h("p", { class: "hint" }, "Open a page or choose Start by hand to draw its regions.");
  const languages = h("select", { "aria-label": "Region finder OCR language pack" },
    ...OCR_LANGUAGES.map(([id, name]) => h("option", { value: id, selected: id === options.ocr_languages }, name)));
  const languageLabel = h("label", {}, "OCR language pack ", languages);
  const refreshModel = async () => {
    profile = profiles.find(item => item.id === select.value);
    if (overview) {
      overview.manual = !profile;
      runControls.hidden = !profile;
      manualHint.hidden = !!profile;
      languageLabel.hidden = profile?.id !== "tesseract-regions";
    }
    if (!profile) { cost = pageCost(null); keyPanel.replaceChildren(); refreshSummary(); return; }
    keyPanel.replaceChildren(stageKeyControls(checks, profile, (id, value) => settings.set(`key:${id}`, value), refreshSummary));
    const ledger = await book.readWork("work/reader-lab/ledger.json");
    cost = pageCost(profile, (ledger?.calls || []).filter(call => call.stage === { regions: "regions", text: "reading", read: "structure" }[stage]));
    refreshSummary();
  };
  const chooseFinder = async (id, language = languages.value) => {
    if (app.workflowBusy) return false;
    setBusy(null, true);
    try {
      if (id !== "manual") await book.saveReaderOptions({ ...await maker.options(), finder: id, ocr_languages: language });
      select.value = id;
      languages.value = language;
      await refreshModel();
      return true;
    } finally { setBusy(null, false); }
  };
  languages.onchange = () => chooseFinder(select.value).catch(error => { message.textContent = error.message; });
  select.onchange = async () => {
    try {
      if (overview) await chooseFinder(select.value);
      else {
        await book.saveReaderOptions({ ...await maker.options(), [stage === "text" ? "reader" : "structurer"]: select.value });
        await refreshModel();
      }
    } catch (error) { select.value = profile?.id || "manual"; message.textContent = error.message; }
  };
  const threshold = h("input", { type: "number", min: 0.1, step: 0.5, value: 5, "aria-label": "Processing spend threshold" });
  const progress = runProgress(`${TITLES[stage]} processing progress`);
  const status = h("p", { role: "status" });
  const stop = h("button", { disabled: true, onclick: () => { stopped = true; status.textContent = "Stopping after the active call…"; } }, "Stop after the active call");
  const disabledFields = new Map();
  const busyFields = value => {
    busy = value;
    setBusy(runArea, value);
    if (value) for (const field of container.querySelectorAll("button, input, select")) {
      disabledFields.set(field, field.disabled);
      field.disabled = true;
    } else {
      for (const [field, disabled] of disabledFields) field.disabled = disabled;
      disabledFields.clear();
    }
    stop.disabled = !value;
    refreshSummary();
  };
  runButton = h("button", { class: "primary", onclick: async () => {
    if (app.workflowBusy || !profile || !checks.status(profile)?.valid) return;
    if (profile.provider !== "local" && !await app.confirmSpending()) return;
    if (app.workflowBusy || !active()) return;
    const ids = runnable();
    stopped = false;
    busyFields(true);
    progress.start(ids.length);
    try {
      const out = await runBatch({ maker, ids, stage, limit: Number(threshold.value), force: fresh.checked, stopped: () => stopped,
        onProgress: value => {
          const reading = value.value;
          const scope = reading?.partial && !reading.cached
            ? ` · ${reading.region_ids.length} changed ${reading.region_ids.length === 1 ? "region" : "regions"} transcribed · ${reading.reused_regions.length} reused` : "";
          status.textContent = `${ACTIONS[stage]} · ${value.pid}${scope} · New spend ${money(value.spend)}${value.unknown ? " · Cost unavailable" : ""}`;
        },
        onPage: async (pid, value, error) => {
          progress.advance(error ? "failed" : value.cached ? "reused" : "completed");
          await app.refreshWorkflowPage(pid);
          const state = app.pageStates.get(pid);
          if (error) state.runErrors[stage] = error.message; else delete state.runErrors[stage];
          refreshCard(pid);
          rows.get(pid).flags.classList.toggle("bad", !!error);
        } });
      progress.finish(out.paused ? "Stopped" : "Finished");
      message.textContent = `${out.processed} ${out.processed === 1 ? "page" : "pages"} processed · ${out.failed} failed · ${money(out.spend)} new spend${out.unknown ? " · Stopped because a call’s cost is unavailable" : ""}`;
    } catch (error) { progress.finish("Stopped"); message.textContent = error.message; }
    finally { busyFields(false); for (const pid of rows.keys()) refreshCard(pid); app.diskCopy?.checkpoint(); await refreshModel(); applyFilters(); }
  } }, ACTIONS[stage]);
  const move = async (owned, forward) => {
    if (app.workflowBusy) return;
    busyFields(true);
    let count = 0, failed = 0;
    const moved = [];
    try {
      for (const pid of targetIds()) {
        if (!app.pageStates.get(pid).layers[owned]) continue;
        try { await movePage(book, pid, owned, forward, doc => app.check(doc)); count++; moved.push(pid); }
        catch (error) { failed++; message.textContent = error.message; }
        await app.refreshWorkflowPage(pid); refreshCard(pid);
      }
      message.textContent = `${count} ${count === 1 ? "page" : "pages"} ${forward ? "moved on" : "sent back"}${failed ? ` · ${failed} need correction first` : ""}.`;
      if (forward && stage === "text" && moved.length) {
        const chosenStructurer = (await maker.options()).structurer, structurer = STRUCTURERS.find(item => item.id === chosenStructurer);
        const ledger = await book.readWork("work/reader-lab/ledger.json");
        const completion = pageCost(structurer, (ledger?.calls || []).filter(call => call.stage === "structure"));
        message.append(` Completion ${completion.usd === null ? `cost: ${costBasis(completion)}` : `estimate ${dollars(completion.usd * moved.length)}`}. `, h("button", { onclick: () => {
          app.pendingStageSelection = { stage: "read", ids: moved };
          app.setMode("read&view=pages");
        } }, `Review and complete these ${moved.length} pages`));
      }
    } finally { busyFields(false); applyFilters(); if (count) app.diskCopy?.checkpoint(); }
  };
  if (stage === "regions" || stage === "text") moveButton = h("button", { class: "primary", onclick: () => move(layer, true) }, `Move on to ${stage === "regions" ? "Text" : "Read"}`);
  if (stage === "text" || stage === "read") backButton = h("button", { onclick: () => move(stage === "text" ? "regions" : "text", false) }, `Send back to ${stage === "text" ? "Regions" : "Text"}`);
  const processingFields = h("div", { class: "fields" }, h("label", {}, include, " Include pages already processed"), h("label", {}, fresh, " Request fresh model results"),
    h("label", {}, "Spend threshold $", threshold));
  runControls.append(processingFields, estimateLabel, h("div", { class: "actions" }, runButton, stop), progress.element, status);
  if (overview) {
    modelFields.append(h("label", {}, "Region finder ", select), languageLabel);
    runArea.append(manualHint, keyPanel, runControls);
    comparison.addEventListener("toggle", () => {
      keyPanel.hidden = comparison.open;
      if (!comparison.open && !app.workflowBusy) refreshModel().catch(error => { message.textContent = error.message; });
    });
    keyPanel.hidden = comparison.open;
  } else {
    modelFields.append(h("label", {}, "Model ", select),
      h("button", { onclick: () => app.setMode(stage === "text" ? "readers" : "structures") }, stage === "text" ? "Compare transcription models" : "Compare completion models"));
    runArea.append(keyPanel, runControls);
  }
  stageReview.append(...[moveButton, backButton].filter(Boolean));
  include.onchange = refreshSummary;
  await refreshModel();
  if (overview) loadOnOpen(comparison, comparisonContent, () => renderFinders(comparisonContent, app, {
    selected: () => [...selected], onCredentialsChanged: refreshSummary,
    onChoose: async (id, language) => {
      if (!await chooseFinder(id, language)) return;
      comparison.open = false;
      select.focus();
    },
    onBusy: async value => {
      setBusy(comparisonContent, value);
      if (!value) {
        languages.value = (await maker.options()).ocr_languages;
        await refreshModel();
      }
    },
    onReviewed: () => { for (const pid of rows.keys()) refreshCard(pid); applyFilters(); },
  }));
}
