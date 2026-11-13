// The survey box of the Regions tab: chosen pages go to a model with the book's current type list, and what comes back
// are proposed additions, kept as pending proposals until each is added (through the type-list revision operations)
// or dismissed. Up to twelve pages are sent as page images (method 095), more as contact sheets (method 096).
import { h } from "./render.js";
import { money } from "./reader-controls.js?v=20261113-survey-1";
import { settings } from "./store.js?v=20261113-survey-1";
import { sha256hex } from "./chayapdf.js";
import { renderPage, pageRange } from "./pipeline/pdf.js";
import { samplePages } from "./pipeline/type-discovery.js?v=20261113-survey-1";
import { renderContactSheets, sheetBatches } from "./pipeline/contact-sheets.js?v=20261113-survey-1";
import { SURVEY_MODELS, SURVEY_PAGE_IMAGE_LIMIT, surveyForm, surveyProfile, runSurvey } from "./pipeline/type-survey.js?v=20261113-survey-1";
import { surveyItems, addPendingProposals, readPendingProposals, pendingItems, decideProposal, additionChoice, additionOperations } from "./type-additions.js?v=20261113-survey-1";
import { pageBrowser, pageSelectionText } from "./page-browser.js?v=20261113-survey-1";
import { CredentialChecks, stageKeyControls } from "./key-check.js?v=20261113-survey-1";
import { reviewTypeChange } from "./type-operations.js?v=20261113-survey-1";
import { REGION_CLASSES } from "./book-types.js?v=20261113-survey-1";

const where = type => type.furniture ? "Page furniture"
  : [type.parents.length ? `Inside ${type.parents.join(", ")}` : "", type.flow ? `Top level of ${type.flow}` : ""].filter(Boolean).join(" · ");
const sourceText = source => source.kind === "survey" ? `Survey of ${source.pages.length} ${source.pages.length === 1 ? "page" : "pages"} · ${source.model} · method ${source.method.slice(0, 3)}`
  : `Page ${source.page} · ${source.kind}`;

export async function renderSurvey(el, app, { selected = [], onBusy = () => {}, credentialsBox = null }) {
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
  const browser = pageBrowser({ pages, render: drawPage });
  browser.usePdf({ doc, sha });
  const model = h("select", { "aria-label": "Survey model" }, ...SURVEY_MODELS.map(profile => h("option", { value: profile.id }, profile.label)));
  const plan = h("p", { class: "meta survey-plan" });
  const status = h("p", { role: "status" });
  const credentials = h("div");
  const retry = h("input", { type: "checkbox", "aria-label": "Allow a new call after an unresolved attempt" });
  const pending = h("div", { class: "survey-pending" });
  const selectedPages = () => {
    if (!pages.value.trim()) throw new Error("Choose the PDF pages to survey, for example 1-3, 80, 266-267, or all.");
    return pageRange(pages.value, count);
  };
  const profile = () => { let n = 1; try { n = selectedPages().length; } catch {} return surveyProfile(model.value, surveyForm(n)); };
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
    const form = surveyForm(list.length), chosen = surveyProfile(model.value, form);
    stopped = false; lock(true);
    try {
      const input = form === "pages" ? await pageImages(list)
        : await renderContactSheets(doc, list, (done, total) => { status.textContent = `Preparing contact sheets · ${done} of ${total} pages…`; });
      const result = await runSurvey({ store: book, keys: checks.keys, profile: chosen, form, images: input, types: book.types, pageCount: count,
        pdfSha: sha, schema: app.schema, request: maker.request, retryUnresolved: retry.checked, stopped: () => stopped,
        progress: step => { status.textContent = `${chosen.label} · ${step.cached ? "reusing" : "surveying"} ${step.total > 1 ? `request ${step.index} of ${step.total}, ` : ""}PDF pages ${pageSelectionText(step.pages, count)}${form === "sheets" ? " · up to 5 minutes" : ""}…`; } });
      const items = surveyItems(result);
      await addPendingProposals(book, items);
      const n = kind => items.filter(item => item.kind === kind).length;
      status.textContent = `Survey saved: ${n("new_type")} proposed ${n("new_type") === 1 ? "type" : "types"}, ${n("definition_edit")} definition ${n("definition_edit") === 1 ? "edit" : "edits"}, ${n("question")} ${n("question") === 1 ? "question" : "questions"}. Estimated cost ${money(result.cost_usd)}, ${result.seconds.toFixed(0)} s.`;
    } catch (error) {
      status.textContent = `The survey did not finish. ${error.message}${error.record ? ` Estimated attempt cost ${money(error.record.cost_usd)}. The attempt is saved.` : ""}`;
    } finally {
      lock(false); app.diskCopy?.checkpoint();
      await drawPending().catch(error => { status.textContent += ` ${error.message}`; });
    }
  } }, "Survey these pages");
  const stop = h("button", { disabled: true, onclick: () => { stopped = true; status.textContent = "Stopping after the active request…"; } }, "Stop after the active request");

  const decide = async (item, decision) => {
    try { await decideProposal(book, item.id, decision); app.diskCopy?.checkpoint(); }
    catch (error) { status.textContent = error.message; }
    await drawPending();
  };
  const typeCard = item => {
    const type = item.proposal, exists = Object.hasOwn(app.tl.types, type.name);
    const evidence = h("p", { class: "type-evidence" }, type.evidence_pages.length ? "PDF pages " : "",
      ...type.evidence_pages.map(page => h("button", { class: "link", onclick: () => browser.showPage(page), "aria-label": `Open PDF page ${page}` }, String(page))),
      type.evidence_pages.length ? " · " : "", type.evidence);
    const form = additionForm(item);
    form.hidden = true;
    return h("article", { class: "type-card proposal-card", "aria-label": `Proposed type ${type.name}` },
      h("h4", {}, type.name, " ", h("span", { class: "meta" }, type.furniture ? `${type.region} · furniture` : type.region)),
      h("p", {}, type.description), h("p", { class: "meta" }, where(type)), evidence,
      exists ? h("p", { class: "bad" }, `The list already has a type named ${type.name}: rename this one or dismiss it as the same type.`) : null,
      h("p", { class: "meta" }, sourceText(item.source)),
      h("div", { class: "actions" }, h("button", { class: "primary", disabled: !book.writable, onclick: () => { form.hidden = !form.hidden; } }, "Add…"),
        h("button", { disabled: !book.writable, onclick: () => decide(item, { status: "dismissed" }) }, "Dismiss")), form);
  };
  const additionForm = item => {
    const choice = additionChoice(item.proposal), types = app.tl.types;
    const name = h("input", { value: choice.name, "aria-label": `Name for ${choice.name}` });
    const description = h("textarea", { rows: 3, "aria-label": `Definition of ${choice.name}` }, choice.description);
    const region = h("select", { "aria-label": `Printed as, for ${choice.name}` }, ...["container", ...REGION_CLASSES].map(value =>
      h("option", { value, selected: value === choice.region }, value === "container" ? "container (groups other units)" : value)));
    const furniture = h("input", { type: "checkbox", checked: choice.furniture, "aria-label": "Page furniture" });
    const textTypes = Object.entries(types).filter(([, type]) => type.role !== "furniture");
    const box = (list, checked, label) => list.map(([other]) => ({ other, input: h("input", { type: "checkbox", checked: checked.includes(other), "aria-label": `${label} ${other}` }) }));
    const parents = box(textTypes.filter(([, type]) => type.contains || !type.region), choice.parents, "May appear inside");
    const children = box(textTypes, choice.contains, "May contain");
    const flow = h("select", { "aria-label": "Top level of reading flow" }, h("option", { value: "" }, "No (only inside another unit)"),
      ...Object.keys(app.tl.flows).map(value => h("option", { value, selected: value === choice.flow }, value)));
    const childField = h("fieldset", {}, h("legend", {}, "May contain"), ...children.map(({ other, input }) => h("label", { class: "type-child-choice" }, input, " ", other)));
    const placeField = h("div", {}, h("fieldset", {}, h("legend", {}, "May appear inside"), ...parents.map(({ other, input }) => h("label", { class: "type-child-choice" }, input, " ", other))),
      h("label", {}, "Top level of ", flow));
    const refresh = () => { childField.hidden = region.value !== "container"; placeField.hidden = furniture.checked; };
    region.onchange = furniture.onchange = refresh; refresh();
    const same = h("select", { "aria-label": "Same as existing type" }, ...Object.keys(types).map(other => h("option", { value: other }, other)));
    const note = h("p", { role: "status", class: "bad" });
    const add = h("button", { class: "primary", disabled: !book.writable, onclick: async () => {
      const chosen = { name: name.value.trim(), description: description.value.trim(), region: region.value, furniture: furniture.checked,
        contains: children.filter(value => value.input.checked).map(value => value.other),
        parents: parents.filter(value => value.input.checked).map(value => value.other), flow: flow.value };
      try {
        const operations = additionOperations(chosen, app.tl);
        await reviewTypeChange(app, operations, { applied: async saved => {
          await decide(item, { status: "added", as: chosen.name, revision: saved.types?.source?.revision ?? saved.source?.revision ?? null });
        } });
      } catch (error) { note.textContent = error.message; }
    } }, "Preview adding this type");
    return h("div", { class: "fields col proposal-form" }, h("label", {}, "Name ", name), h("label", {}, "Definition ", description),
      h("label", {}, "Printed as ", region), h("label", {}, furniture, " Page furniture"), childField, placeField,
      h("div", { class: "actions" }, add), note,
      h("div", { class: "actions" }, h("label", {}, "Same as existing type ", same),
        h("button", { disabled: !book.writable, onclick: () => decide(item, { status: "dismissed", same_as: same.value }) }, "Dismiss as a duplicate")));
  };
  const editCard = item => {
    const edit = item.proposal, current = app.tl.types[edit.name];
    return h("article", { class: "type-card proposal-card", "aria-label": `Suggested definition of ${edit.name}` },
      h("h4", {}, edit.name, " ", h("span", { class: "meta" }, "suggested definition")),
      current ? h("p", { class: "meta" }, `Now: ${current.description}`) : h("p", { class: "bad" }, "This type is no longer in the list."),
      h("p", {}, edit.description), h("p", { class: "type-evidence" }, edit.reason), h("p", { class: "meta" }, sourceText(item.source)),
      h("div", { class: "actions" }, h("button", { disabled: !book.writable || !current, onclick: () => reviewTypeChange(app, [{ kind: "description", name: edit.name, description: edit.description }],
        { applied: () => decide(item, { status: "applied" }) }).catch(error => { status.textContent = error.message; }) }, "Preview this definition"),
      h("button", { disabled: !book.writable, onclick: () => decide(item, { status: "dismissed" }) }, "Dismiss")));
  };
  async function drawPending() {
    if (app.book !== book) return;
    const record = await readPendingProposals(book);
    const types = pendingItems(record, "new_type"), edits = pendingItems(record, "definition_edit"), questions = pendingItems(record, "question");
    const decided = record.items.filter(item => item.status !== "pending" && item.kind !== "question");
    pending.replaceChildren(...[
      types.length || edits.length || questions.length ? h("h3", {}, "Proposed additions") : record.items.length ? h("p", { class: "hint" }, "No proposals are waiting.") : null,
      ...types.map(typeCard),
      edits.length ? h("h4", {}, "Suggested definition edits") : null, ...edits.map(editCard),
      questions.length ? h("p", { class: "box" }, `${questions.length} ${questions.length === 1 ? "question" : "questions"} from surveys ${questions.length === 1 ? "is" : "are"} in Questions to review. `,
        h("button", { onclick: () => app.setRegionView("types") }, "Open By type")) : null,
      decided.length ? h("details", {}, h("summary", {}, `${decided.length} decided`), h("ul", {}, ...decided.map(item => h("li", {},
        `${item.proposal.name} · ${item.status}${item.decision?.as && item.decision.as !== item.proposal.name ? ` as ${item.decision.as}` : ""}${item.decision?.same_as ? ` (same as ${item.decision.same_as})` : ""}`)))) : null].filter(Boolean));
  }
  pages.addEventListener("input", () => { describePlan(); showCredentials(); });
  model.addEventListener("change", showCredentials);
  const attempts = h("details", {}, h("summary", {}, "Saved survey attempts"));
  attempts.addEventListener("toggle", async () => {
    if (!attempts.open) return;
    const ledger = await book.readWork("work/reader-lab/ledger.json");
    attempts.replaceChildren(h("summary", {}, "Saved survey attempts"),
      ...(ledger?.calls || []).filter(call => call.stage === "type-survey").map(call =>
        h("p", {}, `${call.profile} · ${call.status} · ${money(call.cost_usd)} · ${call.seconds == null ? "duration unavailable" : `${call.seconds.toFixed(1)} s`}`)),
      h("label", {}, retry, " Allow a new call after an unresolved attempt"),
      h("p", { class: "hint" }, "An interrupted call may have been charged. Retrying keeps the earlier attempt and can add another charge."));
  });
  el.replaceChildren(h("div", { class: "survey" },
    h("p", { class: "hint" }, "Send chosen pages and the book’s current type list to a model. It proposes only additions: new types with where they belong and their evidence pages, clearer definitions, and possible duplicates as questions. Nothing changes until you add a proposal."),
    h("div", { class: "survey-controls" }, h("div", { class: "fields col" }, h("label", {}, "PDF pages ", pages), plan),
      browser.element, h("label", {}, "Propose types with ", model), credentials,
      h("div", { class: "actions" }, run, stop)), status, attempts, pending));
  showCredentials();
  await drawPending();
}
