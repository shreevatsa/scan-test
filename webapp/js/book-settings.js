import * as B from "./book.js?v=20261127-all-pages";
import { findStructure } from "./book-structure.js?v=20261127-all-pages";
import { processingChoices } from "./book-processing.js?v=20261127-all-pages";
import { saveCredential } from "./book-credentials.js?v=20261127-all-pages";
import { providerGroups, stageKeyControls } from "./key-check.js?v=20261127-all-pages";
import { FINDERS } from "./pipeline/finders.js?v=20261127-all-pages";
import { OCR_LANGUAGES, READERS } from "./pipeline/readers.js?v=20261127-all-pages";
import { ruleProblems } from "./rules.js?v=20261127-all-pages";
import { h } from "./render.js?v=20261127-all-pages";

const button = (text, onclick, attrs) => h("button", { type: "button", onclick, ...attrs }, text);
const words = text => text.replaceAll("_", " ");
const names = text => text.split(/[\s,]+/).filter(Boolean);
const area = (label, text, rows = 3) => h("textarea", { "aria-label": label, rows }, text);
const field = (name, input) => h("label", {}, h("span", {}, name), input);
function select(label, entries, value) {
  const node = h("select", { "aria-label": label }, entries.map(([id, name]) => h("option", { value: id }, name)));
  node.value = value;
  return node;
}

function typeTable(app) {
  const root = h("div"), flags = ["lines", "figure", "heading", "ignored"], headings = ["Type", ...flags.map(words), "Flow", "Contains", "Numbered", "Language", "Description", ""];
  function render() {
    const rows = Object.entries(app.book.types).map(([name, type]) => {
      const label = title => `${title} for ${name}`;
      const edit = change => app.edit(book => change(book, book.types[name]));
      const set = (key, value) => edit((book, current) => {
        const definition = { ...current, [key]: value };
        if (value == null || value === "") delete definition[key];
        return { ...book, types: { ...book.types, [name]: definition } };
      });
      const text = (key, value, change) => h("input", { "aria-label": label(words(key)), value: value ?? "", onchange: e => change(e.target.value.trim()) });
      const box = (key, value, change) => h("input", { type: "checkbox", "aria-label": label(key), checked: value, onchange: e => change(e.target.checked) });
      return h("tr", {},
        h("th", { scope: "row" }, name),
        ...flags.map(flag => h("td", {}, box(flag, type[flag], value => edit(book => B.setTypeFlags(book, name, { [flag]: value }))))),
        h("td", {}, text("flow", type.flow, value => {
          if (value && !/^[a-z][a-z0-9_]*$/.test(value)) return app.notify("Use a flow name such as main or notes.");
          edit((book, current) => {
            const next = { ...current };
            if (value) next.flow = value; else delete next.flow;
            const flows = value ? { main: "Text", ...book.flows, [value]: book.flows?.[value] ?? value } : book.flows;
            return { ...book, flows, types: { ...book.types, [name]: next } };
          });
        })),
        h("td", {}, text("contains", (type.contains ?? []).join(", "), value => {
          const children = names(value);
          if (children.some(child => !Object.hasOwn(app.book.types, child))) return app.notify("Choose types already defined in this book.");
          set("contains", children.length || type.contains ? children : null);
        })),
        h("td", {}, box("numbered", type.numbered, value => set("numbered", value || null))),
        h("td", {}, text("language", type.lang, value => set("lang", value))),
        h("td", {}, text("description", type.description, value => set("description", value))),
        h("td", {}, h("div", { class: "v1-tools" },
          button("Rename", () => {
            const to = prompt("New type name", name)?.trim();
            if (to && to !== name) { app.edit(book => B.renameType(book, name, to)); render(); }
          }, { "aria-label": `Rename ${name}` }),
          button("Delete", () => {
            app.edit(book => B.deleteType(book, name));
            render();
          }, { "aria-label": `Delete ${name}` }))));
    });
    root.replaceChildren(h("div", { class: "v1-type-table" }, h("table", {},
      h("thead", {}, h("tr", {}, headings.map(title => h("th", { scope: "col" }, title)))),
      h("tbody", {}, rows))),
      button("Add type", () => {
        const name = prompt("Type name")?.trim();
        if (name) { app.edit(book => B.addType(book, name)); render(); }
      }));
  }
  render();
  return root;
}

function validRules(text) {
  const rules = JSON.parse(text.trim() || "{}");
  if (!rules || typeof rules !== "object" || Array.isArray(rules)) throw new Error("Structure rules must be a JSON object.");
  const problems = ruleProblems(rules);
  if (problems.length) throw new Error(problems.join(". "));
  return rules;
}

export function openSettings(app) {
  const book = app.book;
  const title = h("input", { "aria-label": "Book title", value: book.title, required: true });
  const description = area("Description", book.description ?? "");
  const languages = h("input", { "aria-label": "Languages", value: (book.languages ?? []).join(", ") });
  const conventions = area("Conventions", Array.isArray(book.conventions) ? book.conventions.join("\n") : JSON.stringify(book.conventions ?? {}).replace(/^\{\}$/, ""));
  const rules = area("Structure rules", JSON.stringify(book.rules ?? {}, null, 2), 10);
  rules.spellcheck = false;
  const choice = processingChoices(book);
  const finder = select("Region finder", FINDERS.map(profile => [profile.id, profile.label]), choice.finder.id);
  const reader = select("Reader", READERS.map(profile => [profile.id, profile.label]), choice.reader.id);
  const languagesForOCR = select("OCR languages", OCR_LANGUAGES, choice.options.ocr_languages);
  const api = h("div", { class: "v1-credentials" });
  const error = h("p", { class: "v1-error", role: "status" });
  const section = (heading, ...content) => h("section", { class: "v1-settings-section" }, h("h3", {}, heading), ...content);
  const save = () => {
    try {
      const storedRules = validRules(rules.value), bookTitle = title.value.trim();
      if (!bookTitle) throw new Error("Enter a book title.");
      const lineRules = conventions.value.trim().startsWith("{") ? JSON.parse(conventions.value) :
        conventions.value.split(/\r?\n/u).map(line => line.trim()).filter(Boolean);
      const change = book => ({ ...book, title: bookTitle, description: description.value.trim(), languages: names(languages.value),
        conventions: lineRules, rules: storedRules,
        reading: { ...book.reading, finder: finder.value, reader: reader.value, ocr_languages: languagesForOCR.value } });
      app.edit(change);
      panel.close();
    } catch (failure) { error.textContent = failure.message; }
  };
  const derive = button("Find structure now", async () => {
    try {
      const storedRules = validRules(rules.value);
      if (!confirm("Replace the book’s saved structure with the result of its rules? Undo restores your changes.")) return;
      derive.disabled = true;
      const hints = await app.structureHints();
      app.edit(book => findStructure({ ...book, rules: storedRules }, hints));
      error.textContent = "";
    } catch (failure) { error.textContent = failure.message; }
    finally { derive.disabled = false; }
  });
  const panel = app.dialog("Settings", h("div", {},
    section("Book", h("div", { class: "v1-settings-fields" }, field("Title", title), field("Description", description),
      field("Languages", languages), field("Conventions", conventions))),
    section("Types", typeTable(app)),
    section("Structure rules", rules, derive),
    section("Processing", h("div", { class: "v1-settings-fields" }, field("Region finder", finder), field("Reader", reader),
      field("OCR languages", languagesForOCR)), h("h4", {}, "API keys"), api),
    error, h("div", { class: "v1-settings-save" }, button("Save settings", save, { class: "primary" }))));
  panel.classList.add("v1-settings");
  let pending = 0;
  const showKeys = async () => {
    const serial = ++pending;
    try {
      const checks = await app.credentials();
      await checks.ready;
      if (!panel.open || serial !== pending) return;
      const selected = processingChoices({ ...app.book, reading: { ...app.book.reading, finder: finder.value, reader: reader.value } });
      const profiles = providerGroups(selected.finder, [selected.reader]);
      const providerName = { openai: "OpenAI", gemini: "Gemini", vision: "Cloud Vision" };
      api.replaceChildren(...[...profiles].map(([name, list]) =>
        stageKeyControls(checks.group(list), list[0], saveCredential, () => {}, `${providerName[name]} credential`)));
      if (!profiles.size) api.append(h("p", { class: "meta" }, "Both models run on this device."));
    } catch (failure) { api.replaceChildren(h("p", { class: "v1-error" }, failure.message)); }
  };
  finder.onchange = reader.onchange = showKeys;
  showKeys();
}
