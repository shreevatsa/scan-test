import { h } from "./render.js";
import { READERS, STRUCTURERS, OCR_LANGUAGES, readerOptions, readerById, structurerById } from "./pipeline/readers.js";
import { SETTINGS } from "./pipeline/steps.js?v=20261110-reading-2";

export const money = (value, digits = 4) => Number.isFinite(value) ? `$${value.toFixed(digits)}` : "—";

export async function readerControls(book, changed = () => {}) {
  let options = readerOptions(await book.getReaderOptions(), book.types);
  const status = h("span", { class: "meta", role: "status" });
  const price = h("span", { class: "hint" });
  const select = h("select", { "aria-label": "Book transcription model" }, ...READERS.map(r => h("option", { value: r.id, selected: r.id === options.reader }, r.label)));
  const structure = h("select", { "aria-label": "Book schema assignment model" }, ...STRUCTURERS.map(r => h("option", { value: r.id, selected: r.id === options.structurer }, r.label)));
  const stages = h("p", { class: "hint" });
  const languages = h("select", { "aria-label": "OCR languages" }, ...OCR_LANGUAGES.map(([id, label]) => h("option", { value: id, selected: id === options.ocr_languages }, label)));
  const languageLabel = h("label", {}, "OCR language pack ", languages);
  const refresh = () => {
    const reader = readerById(options.reader);
    stages.textContent = `Page-region detection uses ${SETTINGS.regions.model} to identify and classify regions. Schema assignment uses ${structurerById(options.structurer).label} with text-only input to build the unit tree, continuations and note links.`;
    languageLabel.hidden = reader.provider !== "local";
    price.textContent = reader.provider === "local" ? "Local transcription has zero API cost. The total estimate includes page-region detection and schema assignment. Inline formatting and note markers need review."
      : "Compare sample pages to estimate the total cost of page-region detection, transcription and schema assignment.";
  };
  const save = async () => {
    select.disabled = languages.disabled = structure.disabled = true;
    try {
      const next = readerOptions({ reader: select.value, ocr_languages: languages.value, structurer: structure.value }, book.types);
      await book.saveReaderOptions(next);
      options = next;
      status.textContent = "Saved for this book.";
      refresh();
      await changed(next);
    } catch (error) {
      select.value = options.reader;
      languages.value = options.ocr_languages;
      structure.value = options.structurer;
      status.textContent = error.message;
    } finally { select.disabled = languages.disabled = structure.disabled = false; }
  };
  select.addEventListener("change", save);
  languages.addEventListener("change", save);
  structure.addEventListener("change", save);
  refresh();
  return h("fieldset", { class: "reader-settings" }, h("legend", {}, "Models for this book"),
    h("label", {}, "Transcribe the printed text with ", select), " ", languageLabel,
    h("p", {}, h("label", {}, "Assign text to schema with ", structure)), stages,
    h("p", {}, price), status);
}

export async function modelChoice(book, stage, changed) {
  const transcription = stage === "transcription";
  const key = transcription ? "reader" : "structurer";
  const label = transcription ? "transcription" : "schema assignment";
  const profiles = transcription ? READERS : STRUCTURERS;
  const options = readerOptions(await book.getReaderOptions(), book.types);
  const select = h("select", { "aria-label": `Chosen ${label} model` }, ...profiles.map(profile =>
    h("option", { value: profile.id, selected: profile.id === options[key] }, profile.label)));
  const status = h("p", { class: "hint", role: "status" }, `Selected for this book · ${profiles.find(profile => profile.id === options[key]).label}`);
  const languages = transcription ? h("select", { "aria-label": "OCR languages for chosen transcription model" },
    ...OCR_LANGUAGES.map(([id, name]) => h("option", { value: id, selected: id === options.ocr_languages }, name))) : null;
  const languageLabel = transcription ? h("label", {}, "OCR language pack ", languages) : null;
  const refresh = () => {
    if (languageLabel) languageLabel.hidden = readerById(select.value).provider !== "local";
  };
  select.addEventListener("change", () => {
    refresh();
    status.textContent = "Save this choice to use it for the book.";
  });
  languages?.addEventListener("change", () => { status.textContent = "Save this choice to use it for the book."; });
  refresh();
  const save = h("button", { class: "primary", onclick: async () => {
    controls.disabled = true;
    try {
      const latest = readerOptions(await book.getReaderOptions(), book.types);
      const next = { ...latest, [key]: select.value };
      if (transcription) next.ocr_languages = languages.value;
      await book.saveReaderOptions(next);
      await changed();
    } catch (error) { status.textContent = error.message; }
    finally { controls.disabled = false; }
  } }, `Use ${label} model for this book`);
  const controls = h("fieldset", { class: "reader-settings model-choice" },
    h("legend", {}, `3. Choose the ${label} model for this book`),
    h("p", {}, "Review the comparison above, select a model, then save your choice."),
    h("div", { class: "fields" }, h("label", {}, `${transcription ? "Transcription" : "Schema assignment"} model `, select),
      languageLabel), h("p", {}, save), status);
  return controls;
}

export function keyControls(keys, save) {
  const visionCredential = h("input", { type: "password", value: keys.vision || "", autocomplete: "off", size: 36, "aria-label": "Cloud Vision credential",
    onchange: async event => {
      keys.vision = event.target.value.trim();
      if (keys.vision_auth !== "oauth") await save("vision", keys.vision);
    } });
  const visionAuth = h("select", { "aria-label": "Cloud Vision authentication", onchange: async event => {
    keys.vision_auth = event.target.value;
    keys.vision = visionCredential.value = "";
    await save("vision", "");
    await save("vision_auth", keys.vision_auth);
  } }, h("option", { value: "key", selected: keys.vision_auth !== "oauth" }, "API key"), h("option", { value: "oauth", selected: keys.vision_auth === "oauth" }, "OAuth access token"));
  return h("details", { class: "reader-keys" }, h("summary", {}, "API keys"),
    h("div", { class: "fields col" }, ...[["openai", "OpenAI API key"], ["gemini", "Gemini API key"]].map(([id, label]) =>
      h("label", {}, label, " ", h("input", { type: "password", value: keys[id] || "", autocomplete: "off", size: 36,
        onchange: async event => { keys[id] = event.target.value.trim(); await save(id, keys[id]); } }))),
      h("label", {}, "Cloud Vision authentication ", visionAuth), h("label", {}, "Cloud Vision credential ", visionCredential),
      h("label", {}, "Google Cloud quota project for OAuth ", h("input", { value: keys.vision_project || "", size: 36, "aria-label": "Google Cloud quota project",
        onchange: async event => { keys.vision_project = event.target.value.trim(); await save("vision_project", keys.vision_project); } })),
      h("p", { class: "hint" }, "API keys are kept in this browser. OAuth access tokens are held for this book’s current session and need replacing when they expire. Page images go to the selected model provider. Tesseract reads images on this device. Cloud Vision requires its API enabled and billing configured. Use an OAuth token and quota project when API-key authentication is rejected. Its estimate uses the standard paid rate before monthly free usage and volume discounts.")));
}

export function continueControls(app) {
  const stage = app.mode === "structures" ? "read&view=pages" : app.available?.text ? "text" : "regions";
  const label = stage.startsWith("read") ? "units and links" : stage === "text" ? "Text" : "Regions";
  return h("section", { class: "reader-next" }, h("h3", {}, "Continue with this book"),
    h("p", {}, `The selected models apply when processing pages. This book contains ${app.book.pages.length} pages.`),
    h("div", { class: "actions" },
      h("button", { class: "primary", onclick: async event => {
        const button = event.currentTarget;
        button.disabled = true;
        try { await app.continueBook(stage); } finally { button.disabled = false; }
      } }, app.book.writable ? `Continue to ${label}` : "Make an editable copy and continue"),
      app.book.manifest.cost_projection?.page_count > app.book.pages.length ? h("button", { onclick: () => app.newBookForm(null, app.book) }, "Start from the full PDF with these settings") : null),
    h("p", { class: "hint" }, "Choose pages in the stage grid and process them with the selected model. Move reviewed regions on to Text, and reviewed transcriptions on to Read. Save the book from Export."));
}
