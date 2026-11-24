import { h } from "./render.js";
import { settings } from "./store.js?v=20261124-images-1";
import { credentialsBox } from "./key-check.js?v=20261124-images-1";
import { FINDERS, finderById } from "./pipeline/finders.js?v=20261124-images-1";
import { OCR_LANGUAGES, READERS } from "./pipeline/readers.js?v=20261124-images-1";
import { renderTypeView } from "./typesview.js?v=20261124-images-1";
import { bookRules, ruleProblems } from "./rules.js?v=20261124-images-1";

// Settings → Structure: the book's structure rules (book.json `rules`, webapp/js/rules.js), as plain fields. Changing one
// saves the rules and reads the book again (Read, the page editor's structure and the checks derive from them).
export function structureSection(app, active) {
  const { book } = app;
  const rules = bookRules(book.rules), s = rules.sections, v = rules.verseGroups;
  const headingTypes = Object.entries(book.types.types).filter(([, type]) => type.region === "heading").map(([name]) => name);
  const status = h("p", { role: "status", class: "hint" });
  const text = (label, value, hint) => {
    const input = h("input", { type: "text", value: value || "" });
    return { input, row: h("label", { class: "rule-field", style: "display:block;margin:.5em 0" }, label, " ", input, hint ? h("div", { class: "hint" }, hint) : null) };
  };
  const area = (label, value, hint, rows) => {
    const input = h("textarea", { rows, cols: 40, spellcheck: "false" }, value);
    return { input, row: h("label", { class: "rule-field", style: "display:block;margin:.5em 0" }, label, h("br"), input, hint ? h("div", { class: "hint" }, hint) : null) };
  };
  const closing = text("Closing line type", s.closing, "the type of a line that ends an episode, such as “इति … ॥ ४२ ॥”");
  const partClosing = text("Closing of a part", s.partClosing, "a pattern; a closing line that matches it also ends its part");
  const partHeading = text("Heading of a part", s.partHeading, "a pattern; a heading that matches it starts a part");
  const partAfter = text("End a part after", s.partAfter, "a pattern; a closing line that matches it ends its part, though the book prints no end");
  const divisionClosing = text("Division closing", s.divisionClosing, "a pattern; a closing that matches stands between episodes without ending one");
  const partLabels = area("Part names, one per line, in the order of the parts", s.partLabels.join("\n"), "A blank line leaves a part untitled. Names given here are shown in parentheses, as the editor's.", 8);
  const marker = text("Verse-group marker type", v.markerType, "the type of a marker such as “(युगलकम्)”");
  const counts = area("Marker words and the number of verses each groups, one per line", Object.entries(v.counts).map(([word, n]) => `${word} = ${n}`).join("\n"), "for example: तिलकम् = 3", 6);
  const headings = area("Headings that start sections, one level per line, outermost first: heading type = section type",
    rules.headings.map(level => `${level.heading} = ${level.container}`).join("\n"),
    `A heading of the type starts a section, which holds what follows it up to the next heading of the same or a higher level, across pages, and is named by the heading's text. For example: chapter_heading = chapter, then section_heading = section. This book's heading types: ${headingTypes.join(", ") || "none"}.`, 3);
  const fields = [headings, closing, partClosing, partHeading, partAfter, divisionClosing, partLabels, marker, counts];
  const read = () => {
    const lines = value => value.split("\n").map(line => line.replace(/\r$/, ""));
    const labels = lines(partLabels.input.value);
    while (labels.length && labels.at(-1).trim() === "") labels.pop();
    const pairs = lines(counts.input.value).filter(line => line.trim()).map(line => line.split("=").map(part => part.trim()));
    return { sections: { closing: closing.input.value.trim(), partClosing: partClosing.input.value.trim() || null, partHeading: partHeading.input.value.trim() || null,
        partAfter: partAfter.input.value.trim() || null, divisionClosing: divisionClosing.input.value.trim() || null, partLabels: labels.map(label => label.trim()) },
      verseGroups: { markerType: marker.input.value.trim(), counts: Object.fromEntries(pairs.map(([word, n]) => [word, /^\d+$/.test(n || "") ? Number(n) : NaN])) },
      headings: lines(headings.input.value).filter(line => line.trim()).map(line => { const [heading, container] = line.split("=").map(part => (part || "").trim()); return { heading, container }; }) };
  };
  let saving = Promise.resolve();
  const save = () => {
    const next = read(), problems = ruleProblems(next);
    if (problems.length) { status.textContent = `Not saved: ${problems[0]}.`; return; }
    saving = saving.then(async () => {
      try {
        await book.saveRules(next);
        if (!active()) return;
        app.blocksProjection = null; app.blocksSource = null;
        app.refreshWorkflowFlags?.();
        status.textContent = book.writable ? "Saved. Read and the checks use these rules." : "Saved in this browser. Make an editable copy to keep it in the book.";
      } catch (error) { status.textContent = error.message; }
    });
  };
  for (const { input } of fields) input.addEventListener("change", save);
  const reset = h("button", { type: "button", onclick: async () => {
    await book.saveRules(null);
    app.blocksProjection = null; app.blocksSource = null;
    app.setMode("settings");
  } }, "Use the defaults");
  return h("details", { class: "region-section", open: true },
    h("summary", {}, "Structure"),
    h("p", { class: "hint" }, "How the book's sections, verse groups and notes are made from its blocks. These are kept in the book; a book with none uses the defaults."),
    ...fields.map(field => field.row), h("div", {}, reset), status);
}

export async function renderBookSettings(el, app) {
  const { book, routeToken } = app;
  const active = () => app.book === book && app.routeToken === routeToken;
  const types = h("div"), status = h("p", { role: "status" });
  const mode = app.routeView;
  const workspace = h("div", { class: "stage-overview" }, h("h1", {}, "Settings"));
  el.replaceChildren(workspace);
  await book.getRules();
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
      h("label", {}, "Transcription model ", reader)), credentials.element, structureSection(app, active));
    advanced.append(h("div", { class: "fields" }, h("label", {}, "OCR language pack ", language)), typeSection);
    workspace.append(advanced);
  } else {
    workspace.append(h("button", { onclick: () => app.continueBook("settings") }, "Make an editable copy"), structureSection(app, active));
    advanced.append(typeSection);
    workspace.append(advanced);
  }
  await showTypes();
}
