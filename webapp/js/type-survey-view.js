// The survey box of the Regions tab: chosen pages go to a model with the book's current type list, and what comes back
// are proposed additions, kept as pending proposals until each is added (through the type-list revision operations)
// or dismissed; they are reviewed in the Proposed types box (proposals-view.js). Up to twelve pages are sent as page images (method 095), more as contact sheets (method 096).
import { h } from "./render.js";
import { money } from "./reader-controls.js?v=20261113-flaglist-1";
import { settings } from "./store.js?v=20261113-flaglist-1";
import { sha256hex } from "./chayapdf.js";
import { renderPage, pageRange } from "./pipeline/pdf.js";
import { samplePages } from "./pipeline/type-discovery.js?v=20261113-flaglist-1";
import { renderContactSheets, sheetBatches } from "./pipeline/contact-sheets.js?v=20261113-flaglist-1";
import { SURVEY_MODELS, SURVEY_PAGE_IMAGE_LIMIT, surveyForm, surveyProfile, runSurvey } from "./pipeline/type-survey.js?v=20261113-flaglist-1";
import { surveyItems, addPendingProposals, surveyOutcome } from "./type-additions.js?v=20261113-flaglist-1";
import { pageSelectionText } from "./page-browser.js?v=20261113-flaglist-1";
import { CredentialChecks, stageKeyControls } from "./key-check.js?v=20261113-flaglist-1";

export async function renderSurvey(el, app, { selected = [], onBusy = () => {}, credentialsBox = null, onProposals = () => {} }) {
  const book = app.book, token = app.routeToken;
  el.replaceChildren(h("p", { class: "loading" }, "Opening the source PDF…"));
  const doc = await book.pdf();
  const sha = book.manifest.pdf?.sha256 || await sha256hex(await book.originalPdf());
  if (app.book !== book || app.routeToken !== token) return;
  const count = doc.numPages, maker = await app.getMaker();
  const checks = maker.credentials ||= new CredentialChecks(maker.keys);
  let rendering = Promise.resolve(), busy = false, stopped = false;
  const drawPage = (pdf, page, dpi) => {
    const task = rendering.then(() => renderPage(pdf, page, dpi));
    rendering = task.catch(() => {});
    return task;
  };
  const images = new Map();
  const pages = h("input", { size: 30, "aria-label": "Survey PDF pages", placeholder: "1-3, 80, 266-267, or all" });
  pages.value = selected.length ? pageSelectionText(selected.map(pid => book.page(pid).pdf_page || book.index[pid] + 1), count)
    : pageSelectionText(samplePages(count), count);
  const model = h("select", { "aria-label": "Survey model" }, ...SURVEY_MODELS.map(profile => h("option", { value: profile.id }, profile.label)));
  const plan = h("p", { class: "meta survey-plan" });
  const status = h("p", { role: "status" });
  const credentials = h("div");
  const retry = h("input", { type: "checkbox", "aria-label": "Allow a new call after an unresolved attempt" });
  const selectedPages = () => {
    if (!pages.value.trim()) throw new Error("Choose the PDF pages to survey, for example 1-3, 80, 266-267, or all.");
    return pageRange(pages.value, count);
  };
  const profile = () => { let n = 1; try { n = selectedPages().length; } catch {} return surveyProfile(model.value, surveyForm(n), book.types); };
  const ready = () => !busy && !!checks.status(profile())?.valid && book.writable;
  const describePlan = () => {
    try {
      const list = selectedPages(), form = surveyForm(list.length), sheets = Math.ceil(list.length / 20);
      plan.textContent = form === "pages" ? `${list.length} ${list.length === 1 ? "page" : "pages"}, sent as full page images (method 095).`
        : `${list.length} pages, sent as ${sheets} labelled contact ${sheets === 1 ? "sheet" : "sheets"} of 20 pages (method 096)${sheets > 16 ? `, in ${Math.ceil(sheets / 16)} requests` : ""}. Up to ${SURVEY_PAGE_IMAGE_LIMIT} pages go as full page images.`;
    } catch (error) { plan.textContent = error.message; }
    run.disabled = !ready();
  };
  const showCredentials = () => {
    if (credentialsBox) credentialsBox.setSurvey([profile()]);
    else credentials.replaceChildren(stageKeyControls(checks, profile(), (id, value) => settings.set(`key:${id}`, value), describePlan));
    describePlan();
  };
  credentialsBox?.onChange(() => { if (app.book === book) describePlan(); });
  const lock = value => {
    busy = value;
    for (const control of el.querySelectorAll(".survey-controls input, .survey-controls select, .survey-controls button")) control.disabled = value;
    stop.disabled = !value;
    onBusy(value);
    if (!value) describePlan();
  };
  const pageImages = async list => {
    for (const [index, page] of list.entries()) {
      if (images.has(page)) continue;
      status.textContent = `Preparing page ${index + 1} of ${list.length}, PDF page ${page}…`;
      const rendered = await drawPage(doc, page, 150);
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result); reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(rendered.blob);
      });
      images.set(page, { page, dataUrl });
    }
    return list.map(page => images.get(page));
  };
  const run = h("button", { class: "primary", disabled: true, onclick: async () => {
    if (!ready() || app.workflowBusy) return;
    let list;
    try { list = selectedPages(); } catch (error) { status.textContent = error.message; return; }
    if (!await app.confirmSpending()) return;
    const form = surveyForm(list.length), chosen = surveyProfile(model.value, form, book.types);
    stopped = false; lock(true);
    try {
      const input = form === "pages" ? await pageImages(list)
        : await renderContactSheets(doc, list, (done, total) => { status.textContent = `Preparing contact sheets · ${done} of ${total} pages…`; });
      const result = await runSurvey({ store: book, keys: checks.keys, profile: chosen, form, images: input, types: book.types, pageCount: count,
        pdfSha: sha, schema: app.schema, request: maker.request, retryUnresolved: retry.checked, stopped: () => stopped,
        progress: step => { status.textContent = `${chosen.label} · ${step.cached ? "reusing" : "surveying"} ${step.total > 1 ? `request ${step.index} of ${step.total}, ` : ""}PDF pages ${pageSelectionText(step.pages, count)}${form === "sheets" ? " · up to 5 minutes" : ""}…`; } });
      const items = surveyItems(result);
      await addPendingProposals(book, items);
      status.replaceChildren(...surveyOutcome(items).map(part => typeof part === "string" ? part : h("button", { class: "link", onclick: () => goTo(part.link) }, part.text)),
        ` Estimated cost ${money(result.cost_usd)}, ${result.seconds.toFixed(0)} s.`);
    } catch (error) {
      status.textContent = `The survey did not finish. ${error.message}${error.record ? ` Estimated attempt cost ${money(error.record.cost_usd)}. The attempt is saved.` : ""}`;
    } finally {
      lock(false); app.diskCopy?.checkpoint(); showAttempts();
      await onProposals();
    }
  } }, "Survey these pages");
  const stop = h("button", { disabled: true, onclick: () => { stopped = true; status.textContent = "Stopping after the active request…"; } }, "Stop after the active request");

  pages.addEventListener("input", () => { describePlan(); showCredentials(); });
  model.addEventListener("change", showCredentials);
  // Shown only while an attempt is unresolved (its charge unknown), which is what the retry checkbox is for; the costs of
  // finished calls are in the ledger and in the result line.
  const attempts = h("details", { open: true, hidden: true });
  const showAttempts = async () => {
    const ledger = await book.readWork("work/reader-lab/ledger.json").catch(() => null);
    const unresolved = (ledger?.calls || []).filter(call => call.stage === "type-survey" && call.cost_usd == null);
    attempts.hidden = !unresolved.length;
    if (!unresolved.length) { retry.checked = false; attempts.replaceChildren(); return; }
    attempts.replaceChildren(h("summary", {}, "Saved survey attempts"),
      ...unresolved.map(call => h("p", {}, `${call.profile} · ${call.status} · cost unknown · ${call.seconds == null ? "duration unavailable" : `${call.seconds.toFixed(1)} s`}`)),
      h("label", {}, retry, " Allow a new call after an unresolved attempt"),
      h("p", { class: "hint" }, "An interrupted call may have been charged. Retrying keeps the earlier attempt and can add another charge."));
  };
  // Where a result went: the Proposed types box, or the questions in By type.
  const goTo = async link => {
    if (link === "proposals") { document.querySelector(".proposals-section")?.scrollIntoView({ block: "start" }); return; }
    await app.setRegionView("types");
    for (let tries = 0; tries < 40; tries++) {
      const target = document.querySelector(".survey-questions");
      if (target?.children.length) { target.scrollIntoView({ block: "start" }); return; }
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  };
  el.replaceChildren(h("div", { class: "survey" },
    h("p", { class: "hint" }, "Send chosen pages and the book’s current type list to a model. It proposes only additions: new types with where they belong and their evidence pages, clearer definitions, and possible duplicates as questions. Nothing changes until you add a proposal in the Proposed types box."),
    h("div", { class: "survey-controls" }, h("div", { class: "fields col" }, h("label", {}, "PDF pages ", pages), plan),
      h("label", {}, "Propose types with ", model), credentials,
      h("div", { class: "actions" }, run, stop)), status, attempts));
  showCredentials(); showAttempts();
}
