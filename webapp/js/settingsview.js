import { h } from "./render.js";
import { settings } from "./store.js?v=20261122-review-actions";
import { credentialsBox } from "./key-check.js?v=20261122-review-actions";
import { FINDERS, finderById } from "./pipeline/finders.js?v=20261122-review-actions";
import { OCR_LANGUAGES, READERS } from "./pipeline/readers.js?v=20261122-review-actions";
import { renderTypeView, surveyBox } from "./typesview.js?v=20261122-review-actions";
import { renderFinders } from "./findersview.js?v=20261122-review-actions";
import { proposalsBox } from "./proposals-view.js?v=20261122-review-actions";

export async function renderBookSettings(el, app) {
  const { book, routeToken } = app;
  const active = () => app.book === book && app.routeToken === routeToken;
  const types = h("div"), compare = h("div"), status = h("p", { role: "status" });
  const selected = () => [...app.pagesSelection || []];
  const mode = app.routeView;
  const workspace = h("div", { class: "stage-overview" }, h("h1", {}, "Settings"));
  el.replaceChildren(workspace);
  const options = book.writable ? await (await app.getMaker()).options() : null;
  if (!active()) return;

  const advanced = h("details", { class: "region-section", open: ["types", "proposal", "compare"].includes(mode) },
    h("summary", {}, "Advanced"));
  const typeSection = h("details", { open: ["types", "proposal"].includes(mode) }, h("summary", {}, "Book types"), types);
  let stopTypes, loadingTypes = false;
  const showTypes = async () => {
    if (!typeSection.open || loadingTypes || !active()) return;
    loadingTypes = true;
    try {
      stopTypes = await renderTypeView(types, app);
      if (!active()) stopTypes?.();
    } catch (error) { status.textContent = error.message; loadingTypes = false; }
  };
  typeSection.addEventListener("toggle", showTypes);
  app.onLeaveGrid = () => stopTypes?.();
  workspace.append(status);

  if (options) {
    const select = (label, key, profiles) => h("select", { "aria-label": label },
      ...profiles.map(profile => h("option", { value: profile.id, selected: profile.id === options[key] }, profile.label)));
    const finder = select("Region finder", "finder", FINDERS);
    const reader = select("Transcription model", "reader", READERS);
    const language = select("OCR language pack", "ocr_languages", OCR_LANGUAGES.map(([id, label]) => ({ id, label })));
    const maker = await app.getMaker();
    if (!active()) return;
    const credentials = credentialsBox((id, value) => settings.set(`key:${id}`, value));
    credentials.bind(maker.credentials);
    let surveyProfiles = [];
    const syncKeys = () => {
      credentials.setFinder(finderById(finder.value));
      credentials.setSurvey([READERS.find(profile => profile.id === reader.value), ...surveyProfiles]);
    };
    syncKeys();
    const setBusy = value => {
      app.workflowBusy = app.header.inert = value;
      finder.disabled = reader.disabled = language.disabled = value;
    };
    const choose = async () => {
      if (app.workflowBusy || !active()) return false;
      setBusy(true);
      try {
        await book.saveReaderOptions({ ...await maker.options(), finder: finder.value, reader: reader.value, ocr_languages: language.value });
        syncKeys();
        return true;
      } catch (error) { status.textContent = error.message; return false; }
      finally { setBusy(false); }
    };
    finder.onchange = reader.onchange = language.onchange = choose;
    const proposals = proposalsBox(app);
    const survey = book.manifest.pdf ? surveyBox(app, {
      credentialsBox: { ...credentials, setSurvey: profiles => { surveyProfiles = profiles; syncKeys(); } },
      selected, onBusy: setBusy, onProposals: () => proposals.refresh(),
    }) : null;
    const comparisons = h("details", { open: mode === "compare" }, h("summary", {}, "Compare region finders"), compare);
    let loaded = false;
    const showComparison = async () => {
      if (!comparisons.open || loaded || !active()) return;
      loaded = true;
      try {
        await renderFinders(compare, app, { selected, onChoose: async (id, pack) => {
          finder.value = id; language.value = pack; return choose();
        }, onBusy: setBusy, onReviewed: async () => { await proposals.refresh(); }, onCredentialsChanged: syncKeys });
      } catch (error) { status.textContent = error.message; loaded = false; }
    };
    comparisons.addEventListener("toggle", showComparison);
    workspace.append(h("div", { class: "fields" }, h("label", {}, "Region finder ", finder),
      h("label", {}, "Transcription model ", reader), h("label", {}, "OCR language pack ", language)), credentials.element);
    advanced.append(typeSection, proposals.element, survey?.element,
      h("p", {}, h("a", { href: "#settings&view=readers" }, "Compare transcription models")), comparisons);
    workspace.append(advanced);
    await proposals.refresh();
    await survey?.load();
    await showComparison();
  } else {
    workspace.append(h("button", { onclick: () => app.continueBook("settings") }, "Make an editable copy"));
    advanced.append(typeSection);
    workspace.append(advanced);
  }
  await showTypes();
}
