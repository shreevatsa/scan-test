import { h } from "./render.js";
import { settings } from "./store.js?v=20261123-blocks-a";
import { credentialsBox } from "./key-check.js?v=20261123-blocks-a";
import { FINDERS, finderById } from "./pipeline/finders.js?v=20261123-blocks-a";
import { OCR_LANGUAGES, READERS } from "./pipeline/readers.js?v=20261123-blocks-a";
import { renderTypeView } from "./typesview.js?v=20261123-blocks-a";

export async function renderBookSettings(el, app) {
  const { book, routeToken } = app;
  const active = () => app.book === book && app.routeToken === routeToken;
  const types = h("div"), status = h("p", { role: "status" });
  const mode = app.routeView;
  const workspace = h("div", { class: "stage-overview" }, h("h1", {}, "Settings"));
  el.replaceChildren(workspace);
  const options = book.writable ? await (await app.getMaker()).options() : null;
  if (!active()) return;

  const advanced = h("details", { class: "region-section", open: mode === "types" },
    h("summary", {}, "Advanced"));
  const typeSection = h("details", { open: mode === "types" }, h("summary", {}, "Book types"), types);
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
    const syncKeys = () => {
      credentials.setFinder(finderById(finder.value));
      credentials.setSurvey([READERS.find(profile => profile.id === reader.value)]);
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
    workspace.append(h("div", { class: "fields" }, h("label", {}, "Region finder ", finder),
      h("label", {}, "Transcription model ", reader)), credentials.element);
    advanced.append(h("div", { class: "fields" }, h("label", {}, "OCR language pack ", language)), typeSection);
    workspace.append(advanced);
  } else {
    workspace.append(h("button", { onclick: () => app.continueBook("settings") }, "Make an editable copy"));
    advanced.append(typeSection);
    workspace.append(advanced);
  }
  await showTypes();
}
