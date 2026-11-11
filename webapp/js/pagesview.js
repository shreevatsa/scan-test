import { suggestionButton } from "./review-view.js?v=20261110-figure-region-2";
import { h } from "./render.js";
import { eligible, STAGE_LAYER, movePage, stageFlags } from "./workflow.js?v=20261110-regions-3";
import { renderTypeDiscovery } from "./regionsview.js?v=20261110-comparison-cost-2";
import { renderTypes } from "./typesview.js?v=20261110-comparison-cost-2";
import { regionBoxes } from "./pageimage.js?v=20261110-figure-region-2";
import { pageRange, renderPage } from "./pipeline/pdf.js";
import { lazyThumbnails, pageSelectionText } from "./page-browser.js?v=20261110-reading-2";
import { READERS, STRUCTURERS, OCR_LANGUAGES } from "./pipeline/readers.js?v=20261110-comparison-cost-2";
import { FINDERS, finderById } from "./pipeline/finders.js?v=20261110-finders-4";
import { stageKeyControls, CredentialChecks } from "./key-check.js?v=20261110-comparison-cost-2";
import { settings } from "./store.js?v=20261110-finders-4";
import { runBatch } from "./pipeline/batch.js?v=20261110-partial-3";
import { runProgress } from "./run-progress.js";
import { money } from "./reader-controls.js?v=20261110-comparison-cost-2";
import { renderFinders } from "./findersview.js?v=20261110-comparison-cost-2";

const TITLES = { pages: "Pages", regions: "Regions", text: "Text", read: "Units and links" };
const ACTIONS = { regions: "Find regions", text: "Transcribe", read: "Complete units and links" };
const stateLabel = state => !state ? "Pending" : state.accepted ? "Moved on" : state.state === "model" ? "Ready to review" : state.state === "edited" ? "Edited" : "Provisional";

export async function renderPages(el, app) {
  const book = app.book, stage = app.stage, layer = STAGE_LAYER[stage];
  const overview = stage === "regions" ? app.regionOverview : null;
  const token = app.routeToken;
  const active = () => app.book === book && app.stage === stage && app.mode === "grid" && app.routeToken === token;
  const pending = app.pendingStageSelection?.stage === stage ? app.pendingStageSelection : null;
  const rows = new Map(), urls = new Set(), selected = new Set(pending?.ids || overview?.selected || []);
  if (overview) overview.selected = selected;
  app.pendingStageSelection = null;
  let observer, queue = Promise.resolve(), visible = [], lastSelected = null, stopped = false, busy = false;
  const grid = h("div", { class: "stage-grid", "aria-label": `${TITLES[stage]} page grid` });
  const selection = h("input", { placeholder: "all or 1-50, 62", "aria-label": "Select page range" });
  const showSelection = () => { selection.value = pageSelectionText([...selected].map(pid => book.index[pid] + 1), book.pages.length); };
  if (selected.size) showSelection();
  const stateFilter = h("select", { "aria-label": "Page state" }, ...["all", "pending", "model", "edited", "provisional", "accepted"].map(value =>
    h("option", { value }, { all: "All states", pending: "Pending", model: "Ready to review", edited: "Edited", provisional: "Provisional", accepted: "Moved on" }[value])));
  const filter = h("select", { "aria-label": "Page flags" }, ...[["all", "All pages"], ["flagged", "Flagged"], ["earlier", "Earlier type revision"], ["suggestion", "Has a suggestion"]].map(([value, label]) => h("option", { value }, label)));
  const grouping = h("select", { "aria-label": "Group pages by layout" }, h("option", { value: "order" }, "Page order"), h("option", { value: "layout" }, "Layout · rarest first"));
  const flagsFor = pid => stageFlags(app.pageStates.get(pid), stage);
  const summary = h("p", { class: "stage-selection", role: "status" });
  const message = h("p", { role: "status" });
  const empty = h("p", { class: "hint", hidden: true });
  const targetIds = () => (selected.size ? [...selected] : visible).filter(pid => eligible(stage, app.pageStates.get(pid)));
  const layerReady = pid => {
    const state = app.pageStates.get(pid);
    return state.layers[layer] && (layer !== "units" || state.layers.units.state !== "provisional");
  };
  let estimate = null, runButton, moveButton, backButton, setupFinder, checks, profile;
  const include = h("input", { type: "checkbox", checked: pending?.reprocess, "aria-label": "Include pages already processed" });
  const fresh = h("input", { type: "checkbox", "aria-label": "Request fresh model results" });
  const estimateLabel = h("p", { class: "hint" });
  const runnable = () => targetIds().filter(pid => include.checked || !layerReady(pid));
  const refreshSummary = () => {
    const ids = targetIds(), flagged = ids.filter(pid => flagsFor(pid).length).length;
    const hidden = ids.filter(pid => !visible.includes(pid)).length;
    const scope = selected.size ? `${ids.length} selected${hidden ? ` (${hidden} hidden by filters)` : ""}`
      : stage === "pages" ? `${ids.length} pages` : `All ${ids.length} displayed pages targeted`;
    summary.textContent = `${scope} · ${flagged} flagged · ${visible.length} shown`;
    if (runButton) {
      const ready = profile && checks?.status(profile)?.valid;
      const count = runnable().length;
      runButton.disabled = busy || !book.writable || !count || !ready;
      if (setupFinder) setupFinder.hidden = !book.writable || !profile || !!ready;
      estimateLabel.textContent = `${count} ${count === 1 ? "page" : "pages"} to process · Estimated new work ${estimate === null ? "unavailable until a completed sample" : money(estimate * count, 2)}. Cached results may reduce new spend.`;
    }
    if (moveButton) moveButton.disabled = busy || !ids.some(pid => layerReady(pid));
    if (backButton) backButton.disabled = busy || !ids.some(pid => app.pageStates.get(pid).layers[stage === "text" ? "regions" : "text"]?.accepted);
  };
  const applyFilters = () => {
    visible = [];
    let removed = false;
    const sorted = [...rows].sort(([a], [b]) => grouping.value === "layout"
      ? app.pageStates.get(a).layoutFrequency - app.pageStates.get(b).layoutFrequency || app.pageStates.get(a).layout.localeCompare(app.pageStates.get(b).layout) || book.index[a] - book.index[b]
      : book.index[a] - book.index[b]);
    grid.querySelectorAll(".layout-heading").forEach(heading => heading.remove());
    let lastLayout = null;
    for (const [pid, row] of sorted) {
      const state = app.pageStates.get(pid), owned = state.layers[layer || "regions"];
      const layers = stage === "pages" ? Object.values(state.layers) : [owned];
      const matchesState = stateFilter.value === "all" || layers.some(value => stateFilter.value === "pending" ? !value || value.state === "provisional"
        : stateFilter.value === "accepted" ? value?.accepted : value?.state === stateFilter.value && !value.accepted);
      const matchesFlag = filter.value === "all" || (filter.value === "flagged" ? flagsFor(pid).length : state[filter.value]);
      row.element.hidden = !eligible(stage, state) || !matchesState || !matchesFlag;
      if (!eligible(stage, state) && selected.delete(pid)) removed = true;
      if (!row.element.hidden) visible.push(pid);
      if (!row.element.hidden && grouping.value === "layout" && state.layout !== lastLayout) {
        grid.append(h("h3", { class: "layout-heading" }, `${state.layout || "No regions yet"} · ${state.layoutFrequency} pages`));
        lastLayout = state.layout;
      }
      grid.append(row.element);
      row.checkbox.checked = selected.has(pid);
    }
    if (removed) showSelection();
    empty.hidden = !!visible.length;
    empty.textContent = [...rows.keys()].some(pid => eligible(stage, app.pageStates.get(pid)))
      ? "No pages match these filters." : "Move pages on from the previous stage to include them here.";
    refreshSummary();
  };
  const refreshCard = pid => {
    const row = rows.get(pid), state = app.pageStates.get(pid);
    if (!row) return;
    row.states.replaceChildren(...(stage === "pages" ? ["regions", "text", "units"] : [layer]).map(name =>
      h("span", { class: `stage-badge ${state.layers[name]?.accepted ? "accepted" : ""}` }, `${{ regions: "Regions", text: "Text", units: "Units" }[name]} · ${stateLabel(state.layers[name])}`)));
    const flags = flagsFor(pid);
    row.flags.textContent = flags.length ? `${flags.length} ${flags.length === 1 ? "flag" : "flags"} · ${flags[0]}` : "";
    row.element.classList.toggle("has-flags", !!flags.length);
    row.flags.title = flags.join("\n");
    row.element.querySelector(".suggestion-actions")?.remove();
    row.element.append(suggestionButton(app, pid, layer));
    row.element.querySelector(".stage-boxes")?.remove();
    if (state.doc) row.element.querySelector(".start-manual")?.remove();
    if (stage === "regions" && state.doc) row.element.querySelector(".stage-thumbnail").append(regionBoxes(state.doc, app.colors));
  };
  const preview = h("dialog", { class: "pdf-preview-dialog", "aria-label": "Scanned page preview" });
  const showPreview = async pid => {
    const index = book.index[pid];
    const image = h("img", { class: "pdf-page-preview", alt: `Page ${index + 1} scan` });
    preview.replaceChildren(h("div", { class: "actions" },
      h("button", { disabled: index === 0, onclick: () => showPreview(book.pages[index - 1].id) }, "← Previous"),
      h("button", { disabled: index === book.pages.length - 1, onclick: () => showPreview(book.pages[index + 1].id) }, "Next →"),
      h("button", { onclick: () => preview.close() }, "Close"),
      h("button", { onclick: () => { preview.close(); app.openPage(pid, {}, "regions"); } }, "Open in Regions")), h("h3", {}, `Page ${index + 1}`), image);
    if (!preview.open) preview.showModal();
    image.src = await book.imageUrl(pid);
  };
  for (const page of book.pages) {
    const state = app.pageStates.get(page.id);
    if (!eligible(stage, state)) continue;
    const checkbox = h("input", { type: "checkbox", "aria-label": `Select page ${book.index[page.id] + 1}`, onclick: event => {
      const ids = event.shiftKey && lastSelected && visible.includes(lastSelected) ? visible.slice(
        Math.min(visible.indexOf(lastSelected), visible.indexOf(page.id)), Math.max(visible.indexOf(lastSelected), visible.indexOf(page.id)) + 1) : [page.id];
      for (const pid of ids) { if (checkbox.checked) selected.add(pid); else selected.delete(pid); }
      lastSelected = page.id;
      showSelection();
      applyFilters();
    } });
    const image = h("img", { alt: `Page ${book.index[page.id] + 1}`, width: 120, height: 166 });
    const states = h("div", { class: "stage-badges" }), flags = h("p", { class: "stage-flags" });
    const element = h("article", { class: "stage-card", dataset: { page: page.id } },
      h("button", { class: "stage-thumbnail", "aria-label": `Open page ${book.index[page.id] + 1}`, onclick: () => stage === "pages" ? showPreview(page.id) : app.openPage(page.id, {}, stage) }, image),
      h("label", {}, checkbox, ` Page ${book.index[page.id] + 1}${page.label ? ` · ${page.label}` : ""}`), states, flags);
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
        const numbers = pageRange(selection.value, book.pages.length);
        selected.clear();
        for (const number of numbers) {
          const pid = book.pages[number - 1].id;
          if (rows.has(pid)) selected.add(pid);
        }
        applyFilters();
      } catch (error) { message.textContent = error.message; }
    } }, "Select range"), h("button", { onclick: () => { selected.clear(); selection.value = ""; applyFilters(); } }, "Clear selection"), stateFilter, filter,
    ...(stage === "regions" ? [grouping] : []));
  const actions = h("section", { class: "stage-actions" });
  const heading = h("h1", {}, TITLES[stage]);
  app.regionTypePanel = null;
  const content = h("div", { class: "region-grid-content" }, toolbar, summary, message, empty, grid, preview);
  let sections, finderSection, finderControls, finderSummary, comparison, comparisonContent;
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
  if (overview) {
    const view = app.routeView;
    const fold = (key, label, open, meta, ...body) => {
      const section = h("details", { class: key === "proposal" || key === "compare" ? "region-disclosure" : "region-section", open },
        h("summary", {}, label, meta ? " " : null, meta), ...body);
      section.addEventListener("toggle", () => { if (active()) overview[key] = section.open; });
      return section;
    };
    const typeList = h("div"), proposalContent = h("div"), count = Object.keys(book.types.types).length;
    const typeSummary = h("span", { class: "meta" }, `${book.types.source?.draft ? "Draft · " : ""}${count} ${count === 1 ? "unit type" : "unit types"}`);
    const proposal = book.manifest.pdf || book.kind === "chaya" ? fold("proposal", "Propose or load a type list", view === "proposal" || overview.proposal, null, proposalContent) : null;
    const firstSetup = book.types.source?.draft && !book.pages.some(page => app.pageStates.get(page.id).doc);
    const types = fold("types", "Unit types", ["types", "proposal"].includes(view) || (overview.types ?? firstSetup), typeSummary, proposal, typeList);
    finderControls = h("div");
    finderSummary = h("span", { class: "meta" });
    comparisonContent = h("div");
    comparison = fold("compare", "Compare finders", view === "compare" || overview.compare, null, comparisonContent);
    finderSection = fold("finder", "Find regions", view === "compare" || overview.finder, finderSummary, finderControls, comparison);
    content.insertBefore(actions, message);
    const pages = fold("pages", "Page regions", overview.pages ?? true, h("span", { class: "meta" }, `${book.pages.length} pages`), content);
    sections = [types, finderSection, pages];
    setBusy = (area, value) => {
      app.workflowBusy = app.header.inert = value;
      for (const part of [typeList, proposalContent, finderControls, comparisonContent, content]) if (part !== area) part.inert = value;
    };
    loadOnOpen(types, typeList, () => renderTypes(typeList, app, { onReviewPages: ids => {
      selected.clear(); for (const pid of ids) selected.add(pid);
      stateFilter.value = filter.value = "all";
      showSelection(); applyFilters();
      pages.open = true; pages.scrollIntoView({ block: "start" });
    } }));
    if (proposal) loadOnOpen(proposal, proposalContent, () => renderTypeDiscovery(proposalContent, app, {
      selected: [...selected], onBusy: value => setBusy(proposalContent, value),
    }));
  }
  const container = h("div", { class: "stage-overview" }, heading,
    h("p", { class: "hint" }, stage === "pages" ? "Browse the scans and see each page’s progress. Open a scan to inspect it, then work through Regions, Text and Read."
      : stage === "regions" ? "Find and review the page regions. Move reviewed pages on to Text together."
        : stage === "text" ? "Transcribe the pages moved on from Regions. Review the text beside the scans, then move pages on to Read."
          : "Complete units and links using the accepted transcription. Open pages to review their structure."),
    ...(sections || [actions, content]));
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
  stateFilter.onchange = filter.onchange = applyFilters;
  grouping.onchange = applyFilters;
  applyFilters();
  if (stage === "pages") return;

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
  const processControls = h("div");
  const manualHint = h("p", { class: "hint" }, "Open a page or choose Start by hand to draw its regions.");
  const languages = h("select", { "aria-label": "Region finder OCR language pack" },
    ...OCR_LANGUAGES.map(([id, name]) => h("option", { value: id, selected: id === options.ocr_languages }, name)));
  const languageLabel = h("label", {}, "OCR language pack ", languages);
  const refreshModel = async () => {
    profile = profiles.find(item => item.id === select.value);
    if (overview) {
      overview.manual = !profile;
      finderSummary.textContent = profile?.label || "Draw by hand";
      processControls.hidden = !profile;
      manualHint.hidden = !!profile;
      languageLabel.hidden = profile?.id !== "tesseract-regions";
    }
    if (!profile) { keyPanel.replaceChildren(); refreshSummary(); return; }
    keyPanel.replaceChildren(stageKeyControls(checks, profile, (id, value) => settings.set(`key:${id}`, value), refreshSummary));
    const ledger = await book.readWork("work/reader-lab/ledger.json");
    const calls = (ledger?.calls || []).filter(call => call.stage === { regions: "regions", text: "reading", read: "structure" }[stage] && call.profile === profile.id && call.status === "completed" && !call.partial && Number.isFinite(call.cost_usd));
    estimate = profile.provider === "local" ? 0 : calls.length ? calls.reduce((sum, call) => sum + call.cost_usd, 0) / calls.length : null;
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
    setBusy(content, value);
    if (value) for (const field of (overview ? content : container).querySelectorAll("button, input, select")) {
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
    finally { busyFields(false); for (const pid of rows.keys()) refreshCard(pid); await refreshModel(); applyFilters(); }
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
        const structurer = (await maker.options()).structurer;
        const ledger = await book.readWork("work/reader-lab/ledger.json");
        const calls = (ledger?.calls || []).filter(call => call.stage === "structure" && call.profile === structurer && Number.isFinite(call.cost_usd) && call.status === "completed");
        const cost = calls.length ? money(calls.reduce((sum, call) => sum + call.cost_usd, 0) / calls.length * moved.length, 2) : "unavailable until a completed sample";
        message.append(` Completion estimate ${cost}. `, h("button", { onclick: () => {
          app.pendingStageSelection = { stage: "read", ids: moved };
          app.setMode("read&view=pages");
        } }, `Review and complete these ${moved.length} pages`));
      }
    } finally { busyFields(false); applyFilters(); }
  };
  if (stage === "regions" || stage === "text") moveButton = h("button", { class: "primary", onclick: () => move(layer, true) }, `Move on to ${stage === "regions" ? "Text" : "Read"}`);
  if (stage === "text" || stage === "read") backButton = h("button", { onclick: () => move(stage === "text" ? "regions" : "text", false) }, `Send back to ${stage === "text" ? "Regions" : "Text"}`);
  if (overview) {
    finderControls.append(h("div", { class: "fields" }, h("label", {}, "Region finder ", select), languageLabel), manualHint, keyPanel);
    setupFinder = h("button", { onclick: () => {
      finderSection.open = true; comparison.open = false;
      finderSection.scrollIntoView({ block: "start" });
    } }, "Check finder key");
    comparison.addEventListener("toggle", () => {
      keyPanel.hidden = comparison.open;
      if (!comparison.open && !app.workflowBusy) refreshModel().catch(error => { message.textContent = error.message; });
    });
    keyPanel.hidden = comparison.open;
  } else actions.append(h("div", { class: "fields" }, h("label", {}, "Model ", select),
    h("button", { onclick: () => app.setMode(stage === "text" ? "readers" : "structures") }, "Compare models")), keyPanel);
  if (!book.writable) actions.append(h("p", {}, "Keep an editable copy to process pages. ", h("button", { onclick: () => app.continueBook(stage) }, "Make an editable copy")));
  const processingFields = h("div", { class: "fields" }, h("label", {}, include, " Include pages already processed"), h("label", {}, fresh, " Request fresh model results"),
    h("label", {}, "Spend threshold $", threshold));
  if (overview) {
    processControls.append(processingFields, estimateLabel, h("div", { class: "actions" }, runButton, stop, setupFinder), progress.element, status);
    actions.append(processControls, h("div", { class: "actions" }, moveButton));
  } else actions.append(processingFields, estimateLabel, h("div", { class: "actions" }, runButton, stop, moveButton, backButton), progress.element, status);
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
