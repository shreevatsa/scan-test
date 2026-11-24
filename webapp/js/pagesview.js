import { suggestionButton } from "./review-view.js?v=20261123-marks-1";
import { h } from "./render.js";
import { nextProcessingStage, REVIEW_LABELS, noContent, pageCheck, processingForm } from "./workflow.js?v=20261123-marks-1";
import { pageRange, renderPage } from "./pipeline/pdf.js";
import { lazyThumbnails, pageSelectionText } from "./page-browser.js?v=20261123-marks-1";
import { READERS } from "./pipeline/readers.js?v=20261123-marks-1";
import { pageCost, dollars, costBasis } from "./recipe.js?v=20261123-marks-1";
import { finderById } from "./pipeline/finders.js?v=20261123-marks-1";
import { runBatch } from "./pipeline/batch.js?v=20261123-marks-1";
import { runProgress } from "./run-progress.js";
import { money } from "./reader-controls.js?v=20261123-marks-1";
import { normalizeTypeName, typeNameStyle } from "./type-additions.js?v=20261123-marks-1";
import { addProposedType } from "./blocksview.js?v=20261123-marks-1";

export async function renderPages(el, app) {
  const { book, routeToken } = app;
  const active = () => app.book === book && app.routeToken === routeToken;
  const selected = app.pagesSelection ||= new Set();
  if (app.pendingStageSelection) {
    selected.clear();
    for (const id of app.pendingStageSelection.ids) selected.add(id);
    app.pendingStageSelection = null;
  }
  let visible = [], lastSelected = null, busy = false, stopped = false, observer;
  let queue = Promise.resolve();
  const rows = new Map(), urls = new Set();
  const stateOf = pid => app.pageStates.get(pid);
  const stageOf = pid => nextProcessingStage(stateOf(pid));
  const targets = () => selected.size ? [...selected] : visible.filter(pid => !book.isSkipped(pid));
  const runnable = () => targets().filter(stageOf);
  const grid = h("div", { class: "stage-grid", "aria-label": "Pages" });
  const summary = h("p", { class: "stage-selection", role: "status" });
  const status = h("p", { role: "status" }), failures = h("div");
  const availability = h("p", { class: "hint" });
  const range = h("input", { placeholder: "1-50, 62", "aria-label": "Select page range" });
  const showSelection = () => { range.value = pageSelectionText([...selected].map(pid => book.index[pid] + 1), book.pages.length); };
  const stateFilter = h("select", { "aria-label": "Page review" }, h("option", { value: "all" }, "All review states"),
    ...Object.entries(REVIEW_LABELS).map(([value, label]) => h("option", { value }, label)));
  const filter = h("select", { "aria-label": "Page flags" },
    ...[["all","All pages"], ["flagged","Flagged"], ["dimmed","Dimmed"], ["earlier","Earlier type revision"]]
      .map(([value,label]) => h("option", { value }, label)));
  const empty = h("p", { class: "hint", hidden: true }, "No pages match these filters.");
  const threshold = h("input", { type: "number", min: 0.1, step: 0.5, value: 5, "aria-label": "Processing spend threshold" });
  const progress = runProgress("Processing pages");
  const process = h("button", { class: "primary", disabled: true }, "Process pages");
  const stop = h("button", { disabled: true, onclick: () => { stopped = true; status.textContent = "Stopping after the active call…"; } }, "Stop after the active call");
  const pageOptions = h("div");
  const controls = h("div", { class: "stage-filters" }, stateFilter, filter);
  const reviewBar = h("span", { class: "actions" });
  const selectionRow = h("div", { class: "fields selection-row" }, h("label", {}, "Select pages ", range), reviewBar);
  const settingsLink = h("a", { href: "#settings" }, "Book settings");
  // The processing box: in full while pages wait to be processed or a run goes (processingForm), else one line.
  let opened = false;
  const full = h("div", {},
    h("div", { class: "fields" }, h("label", {}, "Spend threshold $", threshold)),
    h("div", { class: "actions" }, process, stop, settingsLink), availability, progress.element, failures);
  const line = h("p", { class: "processing-line" }, "All pages processed · ",
    h("button", { class: "link", onclick: () => { opened = true; refreshSummary(); } }, "Process again…"));
  const panel = h("section", { class: "region-section processing-box" }, full, line, status);
  const waiting = () => book.pages.filter(page => !book.isSkipped(page.id) && stageOf(page.id)).length;
  let maker, finder, reader, readerCost = null;
  const requiredModels = ids => ids.some(pid => stageOf(pid) === "regions") ? [finder, reader] : [reader];
  const ready = ids => !!maker && requiredModels(ids).every(profile => profile && maker.credentials.status(profile)?.valid);
  const refreshSummary = () => {
    const ids = runnable();
    const flagged = visible.filter(pid => stateOf(pid).flags.length).length;
    summary.textContent = `${visible.length} of ${rows.size} pages shown · ${flagged} flagged${book.skipped.size ? ` · ${book.skipped.size} dimmed` : ""}`;
    availability.replaceChildren(
      `${ids.length} ${ids.length === 1 ? "page" : "pages"} to process${selected.size ? " in the selection" : ""}`,
      ids.length && maker && !ready(ids) ? " · Check this book’s model credentials in Settings" : "",
      // The reading's share of the cost: the book's own completed calls of this model, else the measured figure (recipe.js).
      ids.length && readerCost && readerCost.usd ? ` · reading about ${dollars(readerCost.usd * ids.length)} at ${dollars(readerCost.usd)} a page (${costBasis(readerCost)})` : "");
    process.disabled = busy || !ids.length || !ready(ids);
    const form = processingForm({ waiting: waiting(), busy, opened });
    full.hidden = form !== "full"; line.hidden = form === "full";
    panel.dataset.form = form;
    reviewBar.querySelectorAll("button").forEach(button => { button.disabled = busy || !targets().some(pid => stateOf(pid).doc && stateOf(pid).valid); });
  };
  function applyFilters() {
    visible = [];
    for (const [pid, row] of rows) {
      const state = stateOf(pid);
      const matchesReview = stateFilter.value === "all" ||
        !book.isSkipped(pid) && !noContent(state.doc) && state.status === stateFilter.value;
      const matchesFlag = filter.value === "all" || (filter.value === "flagged" ? state.flags.length : filter.value === "dimmed" ? book.isSkipped(pid) : state.earlier);
      row.element.hidden = !matchesReview || !matchesFlag;
      if (!row.element.hidden) visible.push(pid);
      if (row.select) row.select.checked = selected.has(pid);
    }
    empty.hidden = !!visible.length;
    refreshSummary();
  }
  function refreshCard(pid) {
    const { element, states, skip } = rows.get(pid), state = stateOf(pid);
    const dimmed = book.isSkipped(pid), check = pageCheck(state, dimmed);
    // One state per card: Checked, N to check (with the first item), Not processed; none on a dimmed page.
    states.replaceChildren(...check ? [h("span", { class: `stage-badge ${check.kind}` }, check.label),
      check.items[0] && check.kind !== "checked" ? h("span", { class: "stage-flags" }, ` · ${check.items[0]}`) : ""] : []);
    states.title = check?.items.join("\n") || "";
    element.classList.toggle("has-flags", check?.kind === "check" && check.items.length > 0);
    element.classList.toggle("skipped",dimmed);
    if (skip) {
      skip.textContent=dimmed ? "↺" : "×";
      skip.setAttribute("aria-label",`${dimmed ? "Bring back" : "Dim"} page ${book.index[pid]+1}`);
    }
    element.querySelector(".suggestion-actions")?.remove();
    element.append(suggestionButton(app,pid));
  }
  const preview = h("dialog", { class: "pdf-preview-dialog", "aria-label": "Scanned page preview" });
  const showPreview = async pid => {
    const index = book.index[pid];
    const image = h("img", { class: "pdf-page-preview", alt: `Page ${index + 1} scan` });
    preview.replaceChildren(h("div", { class: "actions" },
      h("button", { disabled: index === 0, onclick: () => showPreview(book.pages[index - 1].id) }, "← Previous"),
      h("button", { disabled: index === book.pages.length - 1, onclick: () => showPreview(book.pages[index + 1].id) }, "Next →"),
      h("button", { onclick: () => preview.close() }, "Close"),
      h("button", { onclick: () => { preview.close(); app.openPage(pid); } }, "Open the page")), h("h3", {}, `Page ${index + 1}`), image);
    if (!preview.open) preview.showModal();
    image.src = await book.imageUrl(pid);
  };
  for (const scan of book.pages) {
    const { id } = scan, index = book.index[id];
    const select = book.writable ? h("input", { type: "checkbox", "aria-label": `Select page ${index+1}`, onclick: event => {
      if (busy) return;
      const first = lastSelected ? visible.indexOf(lastSelected) : -1, last = visible.indexOf(id);
      const ids=event.shiftKey && first>=0 ? visible.slice(Math.min(first,last),Math.max(first,last)+1) : [id];
      for (const pid of ids) { if (select.checked) selected.add(pid); else selected.delete(pid); }
      lastSelected = id; showSelection(); applyFilters();
    } }) : null;
    const skip = book.writable ? h("button", { class: "skip-toggle", onclick: async () => {
      try {
        await book.setSkipped([id],!book.isSkipped(id));
        refreshCard(id); applyFilters(); app.diskCopy?.checkpoint();
      } catch (error) { status.textContent=error.message; }
    } }) : null;
    const image = h("img", { alt: `Page ${index+1}`, width: 120, height: 166 });
    const states = h("p", { class: "stage-state" });
    const name = `Page ${index+1}${scan.label ? ` · ${scan.label}` : ""}`;
    const element = h("article", { class: "stage-card", dataset: { page: id } }, skip,
      h("button", { class: "stage-thumbnail", "aria-label": `Open page ${index+1}`, onclick: () => showPreview(id) }, image),
      select ? h("label", {}, select, " "+name) : h("p", { class: "stage-card-name" },name), states);
    grid.append(element); rows.set(id,{element, image, select, states, skip}); refreshCard(id);
  }
  range.onchange = () => {
    try {
      const numbers=range.value.trim() ? pageRange(range.value,book.pages.length) : [];
      selected.clear();
      for (const number of numbers) {
        const pid=book.pages[number-1].id;
        if (!book.isSkipped(pid)) selected.add(pid);
      }
      showSelection(); applyFilters();
    } catch (error) { status.textContent=error.message; }
  };
  const refreshAll = () => { for (const pid of rows.keys()) refreshCard(pid); applyFilters(); };
  const setBusy = value => {
    busy = app.workflowBusy = value;
    app.header.inert = grid.inert = controls.inert = pageOptions.inert = reviewBar.inert = value;
    range.disabled = threshold.disabled = value;
    stop.disabled = !value;
    refreshSummary();
  };
  process.onclick = async () => {
    const ids = runnable();
    if (busy || app.workflowBusy || !ids.length || !ready(ids)) return;
    if (requiredModels(ids).some(profile => profile.provider!=="local") && !await app.confirmSpending()) return;
    if (!active() || busy || app.workflowBusy) return;
    stopped = false; opened = true; setBusy(true); progress.start(ids.length); failures.replaceChildren();
    try {
      const outcome=await runBatch({ maker, ids, stage: "pages", stageOf, limit: Number(threshold.value), stopped: () => stopped,
        onProgress: event => { status.textContent=`Page ${book.index[event.pid]+1} · ${money(event.spend)} new spend`; },
        onPage: async (pid, value, error) => {
          progress.advance(error ? "failed" : value?.cached ? "reused" : "completed");
          const state = stateOf(pid);
          if (error) {
            state.runErrors.pages=error.message;
            failures.append(h("p", { class: "bad" }, `Page ${book.index[pid]+1}: ${error.message} `,
              h("button", { class: "link", onclick: () => app.openPage(pid) }, "Open page")));
          } else delete state.runErrors.pages;
          await app.refreshWorkflowPage(pid);
          refreshCard(pid);
        } });
      progress.finish(outcome.paused ? "Stopped" : "Finished");
      status.textContent=`${outcome.processed} of ${ids.length} pages visited · ${outcome.failed} failed · ${money(outcome.spend)} new spend${outcome.unknown ? " · Cost unavailable" : ""}`;
    } catch (error) { progress.finish("Stopped"); status.textContent=error.message; }
    finally { setBusy(false); refreshAll(); app.diskCopy?.checkpoint(); }
  };
  for (const [label, checked] of [["Mark checked",true],["Reopen review",false]]) reviewBar.append(h("button", { onclick: async () => {
    if (busy || app.workflowBusy) return;
    const ids=targets().filter(pid => stateOf(pid).doc && stateOf(pid).valid && stateOf(pid).checked!==checked);
    setBusy(true);
    try {
      for (const pid of ids) {
        await book.savePageReview(pid,checked);
        await app.refreshWorkflowPage(pid);
      }
      status.textContent=`${ids.length} pages ${checked ? "marked checked" : "reopened"}.`;
    } catch (error) { status.textContent=error.message; }
    finally { setBusy(false); refreshAll(); if (ids.length) app.diskCopy?.checkpoint(); }
  } },label));
  const details=h("details", { class: "box page-problems", open: app.routeView === "problems" }, h("summary", {}, "Book checks"), pageOptions);
  details.addEventListener("toggle", () => {
    if (details.open) app.renderCheck(pageOptions).catch(error => { pageOptions.textContent=error.message; });
  });
  // The types the region finder proposed for areas of the book, waiting for one decision each.
  const proposals = new Map();
  for (const page of book.pages) for (const [index, area] of (stateOf(page.id)?.doc?.source?.omitted_regions || []).entries()) {
    if (!area.proposed_type) continue;
    const key = normalizeTypeName(area.proposed_type), entry = proposals.get(key) || { name: area.proposed_type, areas: 0, pages: [] };
    entry.areas++; if (!entry.pages.includes(page.id)) entry.pages.push(page.id);
    proposals.set(key, entry);
  }
  const proposalBox = proposals.size && book.writable ? h("section", { class: "box proposals" },
    h("p", {}, `The region finder proposes ${proposals.size === 1 ? "a new type" : `${proposals.size} new types`} for areas of this book. Adding one makes every such area a block, with its text; leaving one out drops those areas from the text (each page's checks can bring one back).`),
    ...[...proposals.values()].sort((a, b) => b.areas - a.areas).map(entry => {
      const name = typeNameStyle(entry.name), known = book.types.types[name]?.region;
      return h("div", { class: "actions proposal-row" }, h("b", {}, name.replaceAll("_", " ")),
        h("span", { class: "meta" }, ` ${entry.areas} ${entry.areas === 1 ? "area" : "areas"} on ${entry.pages.length} ${entry.pages.length === 1 ? "page" : "pages"} `),
        h("button", { onclick: () => known ? app.restoreProposed(entry.name, name) : addProposedType(app, name, { proposed_type: entry.name }, null) }, known ? `Use type ${name}` : `Add type ${name}`),
        h("button", { onclick: () => app.leaveOutProposed(entry.name) }, "Leave them out"),
        h("button", { class: "link", onclick: () => app.openPage(entry.pages[0]) }, "See one"));
    })) : null;
  el.replaceChildren(h("div", { class: "stage-overview" }, h("h1", {}, "Pages"), proposalBox, book.writable ? panel :
    h("button", { onclick: () => app.continueBook("pages") }, "Make an editable copy"), book.writable ? selectionRow : null, controls, summary, empty, grid, details, preview));
  app.onLeaveGrid=() => { observer?.disconnect(); for (const url of urls) URL.revokeObjectURL(url); preview.close(); };
  stateFilter.onchange = filter.onchange = applyFilters;
  showSelection(); applyFilters();
  if (details.open) app.renderCheck(pageOptions).catch(error => { pageOptions.textContent = error.message; });
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
  if (!book.writable) return;
  try {
    maker = await app.getMaker();
    const chosen = await maker.options();
    if (!active()) return;
    finder = finderById(chosen.finder);
    reader = READERS.find(profile => profile.id===chosen.reader);
    const ledger = await book.readWork("work/reader-lab/ledger.json").catch(() => null);
    readerCost = reader ? pageCost(reader, ledger?.calls || []) : null;
    refreshSummary();
  } catch (error) { status.textContent=error.message; }
}
