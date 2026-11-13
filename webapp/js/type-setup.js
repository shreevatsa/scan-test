// The new-book form's type choice, used for an excerpt of an existing book (its types are the starting point) and for a
// plain-PDF link with &proposal=<url>, which preloads a saved whole-list proposal (methods 077, 078, 091, 092) for review.
// Proposing types for a book that exists is a survey in Regions, which only adds to the list (type-survey-view.js).
import { h } from "./render.js";
import { checkTypes } from "./schema.js?v=20261113-types-tidy-1";
import { money } from "./reader-controls.js?v=20261113-types-tidy-1";
import { renderPage } from "./pipeline/pdf.js";
import { samplePages, discoveryStore } from "./pipeline/type-discovery.js?v=20261113-types-tidy-1";
import { proposalPackage, checkProposalPackage, keepProposalPackage } from "./type-proposal.js?v=20261113-types-tidy-1";
import { readerById, structurerById } from "./pipeline/readers.js?v=20261113-types-tidy-1";
import { pageBrowser, pageSelectionText } from "./page-browser.js?v=20261113-types-tidy-1";
import { citedSamplePages } from "./type-revisions.js?v=20261113-types-tidy-1";

export function typeSetup({ app, title, bookId, description, index, template, proposalUrl = null, onBusy = () => {} }) {
  let pdf = null, store = null, result = null;
  let rendering = Promise.resolve();
  const drawPage = (doc, page, dpi) => {
    const task = rendering.then(() => renderPage(doc, page, dpi));
    rendering = task.catch(() => {});
    return task;
  };
  const starter = h("input", { type: "radio", name: "type-source", value: "starter", checked: !template && !proposalUrl });
  const mode = h("input", { type: "radio", name: "type-source", value: "discover", checked: !template && !!proposalUrl });
  const reuse = h("input", { type: "radio", name: "type-source", value: "existing", checked: !!template });
  const pages = h("input", { size: 30, readonly: true, "aria-label": "Sample PDF pages" });
  const browser = pageBrowser({ pages, render: drawPage });
  const status = h("p", { class: "meta", role: "status" });
  const review = h("div", { class: "type-review" });
  const approved = h("input", { type: "checkbox", "aria-label": "I have reviewed these unit types" });
  const approval = h("label", {}, approved, " I have reviewed these unit types and their grouping rules");
  approval.hidden = true;
  const typeSel = h("select", { "aria-label": "Existing unit type list" },
    ...(template ? [h("option", { value: "current" }, "This book’s types and model choices")] : []),
    h("option", { value: "" }, "Load a types.json file…"),
    h("optgroup", { label: "Examples: books this app was tested on" },
      ...index.filter(t => t.file !== "generic.json").map(t => h("option", { value: t.file }, `${t.book_id} · ${t.title}`))));
  const typeFile = h("input", { type: "file", accept: ".json", "aria-label": "Unit type list file" });
  const existing = h("div", { class: "fields col" }, typeSel, typeFile);
  const loadExisting = async () => template && typeSel.value === "current" ? structuredClone(template.types)
    : typeSel.value ? (await fetch(new URL(`../types/${typeSel.value}`, import.meta.url))).json()
    : typeFile.files[0] ? JSON.parse(await typeFile.files[0].text()) : null;
  const fillDescription = async () => {
    try {
      const types = await loadExisting();
      if (reuse.checked && types && !description.dataset.edited) description.value = types.description || "";
    } catch (error) { status.textContent = error.message; }
  };
  typeSel.addEventListener("change", () => { typeFile.hidden = !!typeSel.value; fillDescription(); });
  typeFile.addEventListener("change", fillDescription);
  typeFile.hidden = !!typeSel.value;

  const problems = types => {
    const errors = app.validate(types);
    if (!errors.length) errors.push(...checkTypes(types));
    if (!Object.keys(types.types || {}).length) errors.push("Add at least one unit type.");
    return errors;
  };
  const saveReview = async () => {
    if (result && store) await store.writeWork("work/type-discovery/selection.json", result);
  };
  const changed = () => {
    approved.checked = false;
    result.types.source.discovery.reviewed = false;
    const errors = problems(result.types);
    status.textContent = errors.length ? errors[0] : "Review the proposed types, then check the review box to continue.";
  };
  approved.addEventListener("change", async () => {
    if (!result) return;
    const errors = problems(result.types);
    if (errors.length) { approved.checked = false; status.textContent = errors[0]; return; }
    result.types.source.discovery.reviewed = approved.checked;
    try {
      await saveReview();
      status.textContent = approved.checked ? "Unit types reviewed. Make the book to continue." : "Review the proposed types before continuing.";
    } catch (error) { approved.checked = false; status.textContent = `Could not save the review. ${error.message}`; }
  });

  const renderReview = () => {
    if (!result) { review.replaceChildren(); approval.hidden = true; return; }
    const tl = result.types;
    tl.source.discovery.questions ||= [...result.proposal.questions];
    const cards = Object.entries(tl.types).map(([original, type]) => {
      let name = original;
      const evidence = result.proposal.types.find(t => t.name === original);
      const category = h("span", { class: "meta" });
      const grouping = h("p", { class: "meta" });
      const refreshRules = () => {
        category.textContent = type.role === "furniture" ? "page furniture" : type.region || "container";
        grouping.textContent = type.role === "furniture" ? "Belongs to the page."
          : `May contain ${(type.contains || []).join(", ") || "no child units"}. ${type.flow ? `Can stand in ${type.flow}.` : "Appears inside another unit."}`;
      };
      refreshRules();
      const nameInput = h("input", { value: name, "aria-label": `Name of ${name}` });
      const descriptionInput = h("textarea", { rows: 3, value: type.description, "aria-label": `Description of ${name}` });
      descriptionInput.value = type.description;
      descriptionInput.addEventListener("input", () => { type.description = descriptionInput.value; changed(); });
      const region = h("select", { "aria-label": `Printed form of ${name}` },
        ...["container", ...app.schema.$defs.type_def.properties.region.enum].map(value =>
          h("option", { value, selected: value === (type.region || "container") }, value)));
      region.addEventListener("change", () => {
        if (region.value === "container") delete type.region;
        else type.region = region.value;
        refreshRules();
        changed();
      });
      const contains = h("input", { value: (type.contains || []).join(", "), "aria-label": `Allowed children of ${name}`,
        oninput: () => {
          const children = contains.value.split(/[,\s]+/).filter(Boolean);
          if (children.length) type.contains = children;
          else delete type.contains;
          refreshRules();
          changed();
        } });
      const flow = h("select", { "aria-label": `Reading flow of ${name}` }, h("option", { value: "" }, "Inside another unit"),
        ...Object.keys(tl.flows).map(value => h("option", { value, selected: value === type.flow }, value)));
      flow.addEventListener("change", () => { if (flow.value) type.flow = flow.value; else delete type.flow; refreshRules(); changed(); });
      const furniture = h("input", { type: "checkbox", checked: type.role === "furniture",
        onchange: () => { type.role = furniture.checked ? "furniture" : "text"; refreshRules(); changed(); } });
      nameInput.addEventListener("blur", () => {
        const next = nameInput.value.trim();
        if (next === name) return;
        if (!/^[a-z][a-z0-9_]*$/.test(next) || Object.hasOwn(tl.types, next)) {
          nameInput.value = name;
          status.textContent = "Use a unique name with lowercase letters, digits and underscores, starting with a letter.";
          return;
        }
        tl.types[next] = type;
        delete tl.types[name];
        if (evidence) evidence.name = next;
        for (const overview of tl.source.discovery.overviews || []) for (const item of overview.inventory)
          item.types = item.types.map(type => type === name ? next : type);
        for (const definition of Object.values(tl.types)) if (definition.contains)
          definition.contains = definition.contains.map(child => child === name ? next : child);
        name = next;
        changed();
        renderReview();
      });
      return h("article", { class: "type-card" }, h("h4", {}, name, " ", category), descriptionInput, grouping,
        evidence ? h("p", { class: "type-evidence" }, evidence.sample_pages.length ? `PDF pages ${evidence.sample_pages.join(", ")} · ` : "", evidence.evidence) : null,
        h("details", {}, h("summary", {}, "Edit grouping rules"), h("div", { class: "fields col" },
          h("label", {}, "Name ", nameInput), h("label", {}, "Printed form ", region),
          h("label", {}, "May contain ", contains), h("label", {}, "Reading flow ", flow), h("label", {}, furniture, " Page furniture")),
          h("button", { onclick: () => { delete tl.types[name]; changed(); renderReview(); } }, "Remove this type")));
    });
    const json = h("textarea", { rows: 16, class: "type-json", "aria-label": "Complete unit type list JSON" });
    json.value = JSON.stringify(tl, null, 2);
    const packetText = h("textarea", { rows: 12, readonly: true, class: "type-json", "aria-label": "Saved unit-type proposal JSON" });
    review.replaceChildren(h("div", {}, h("h3", {}, "Review this book’s unit types"),
      h("p", {}, `${tl.source.discovery.model} inspected ${tl.source.discovery.sample_pages.length} of ${pdf.doc.numPages} PDF pages (${pageSelectionText(tl.source.discovery.sample_pages, pdf.doc.numPages)}). Estimated proposal cost ${money(result.call.cost_usd)}.`),
      h("p", {}, tl.description), h("p", { class: "meta" }, `Languages ${(tl.languages || []).join(", ")}`),
      browser.element,
      result.reader_options ? h("p", { class: "hint" }, `Models for this book after setup · ${readerById(result.reader_options.reader).label} for transcription · ${structurerById(result.reader_options.structurer).label} for schema assignment.`) : null,
      Array.isArray(tl.source.review_notes) ? h("div", {}, h("h4", {}, "Adjustments from review"),
        h("ul", {}, ...tl.source.review_notes.map(note => h("li", {}, note)))) : null,
      h("p", { class: "hint" }, "Check the descriptions and grouping rules against the sample pages. Edit descriptions directly. Each type’s grouping rules can also be changed."),
      ...cards,
      h("button", { onclick: () => {
        let name = "new_type";
        while (name in tl.types) name += "_new";
        tl.types[name] = { description: "", region: "paragraph", flow: Object.keys(tl.flows)[0] };
        changed(); renderReview();
      } }, "Add a unit type"),
      h("h4", {}, "Reading flows"), ...Object.entries(tl.flows).map(([name, desc]) => h("p", {}, h("b", {}, name), " · ", desc)),
      Object.keys(tl.relations || {}).length ? [h("h4", {}, "Links"), ...Object.entries(tl.relations).map(([name, desc]) => h("p", {}, h("b", {}, name), " · ", desc))] : null,
      Object.keys(tl.inline || {}).length ? [h("h4", {}, "Inline kinds"), ...Object.entries(tl.inline).map(([name, kind]) =>
        h("p", {}, h("b", {}, name), " · ", kind.description, kind.formatting ? ` (${kind.formatting})` : ""))] : null,
      h("h4", {}, "Transcription conventions"), h("ul", {}, ...(tl.conventions || []).map(item => h("li", {}, item))),
      result.proposal.questions.length ? h("div", { class: "type-questions" }, h("h4", {}, "Questions to review"),
        h("ul", {}, ...result.proposal.questions.map(question => {
          const cited = citedSamplePages(question, tl.source.discovery.sample_pages);
          const answer = h("textarea", { rows: 2, "aria-label": `Review decision for ${question}` }, tl.source.discovery.resolved_questions?.[question]?.answer || "");
          const answerStatus = h("p", { class: "ok" }, tl.source.discovery.resolved_questions?.[question] ? "Decision recorded" : "");
          return h("li", {}, h("p", {}, question), ...cited.map(number => h("button", { onclick: () => browser.showPage(number) }, `Page ${number}`)),
            answer, h("button", { onclick: () => {
              if (!answer.value.trim()) { status.textContent = "Record the review decision first."; return; }
              tl.source.discovery.resolved_questions = { ...tl.source.discovery.resolved_questions, [question]: { answer: answer.value.trim(), at_utc: new Date().toISOString() } };
              changed(); saveReview().catch(error => { status.textContent = error.message; });
              answerStatus.textContent = "Decision recorded";
              status.textContent = "Review decision recorded. Apply any type or convention changes above before approving the list.";
            } }, "Record review decision"), answerStatus);
        }))) : null,
      h("details", { ontoggle: event => { if (event.currentTarget.open) json.value = JSON.stringify(result.types, null, 2); } }, h("summary", {}, "Edit the complete type list as JSON"), json,
        h("button", { onclick: () => {
          try {
            const next = JSON.parse(json.value), errors = problems(next);
            if (errors.length) throw new Error(errors[0]);
            next.source = { ...next.source, discovery: { ...tl.source.discovery, reviewed: false } };
            result.types = next;
            changed(); renderReview();
          } catch (error) { status.textContent = error.message; }
        } }, "Apply type list changes")),
      h("details", { ontoggle: async event => {
        if (!event.currentTarget.open) return;
        try { packetText.value = JSON.stringify(proposalPackage(result, await store.readWork(result.call.path)), null, 2); }
        catch (error) { status.textContent = error.message; }
      } }, h("summary", {}, "Saved proposal JSON"), packetText)));
    approval.hidden = false;
  };

  const discoverLabel = h("label", {}, mode, " Use the saved AI proposal");
  const discover = h("div", {}, review, approval);
  const element = h("section", { class: "type-setup" }, h("h2", {}, "Determine this book’s unit types"),
    h("label", {}, starter, " Start with draft types and refine them in Regions"), " ",
    discoverLabel, " ", h("label", {}, reuse, " Start from an existing type list"),
    discover, existing, status);
  const changeMode = () => {
    discover.hidden = !mode.checked;
    existing.hidden = !reuse.checked;
    if (starter.checked) status.textContent = "Start with common draft types, then add book-specific types while reviewing Regions.";
    else if (reuse.checked) status.textContent = "A close relative, such as another edition of the same work, makes a good starting point. Your own file works too. Revise the list in Regions.";
    else status.textContent = "Review the saved proposal before continuing.";
    discoverLabel.hidden = !result && !mode.checked;
    if (reuse.checked) fillDescription();
    else if (!description.dataset.edited) description.value = result?.types.description || template?.types.description || "";
  };
  mode.addEventListener("change", changeMode);
  reuse.addEventListener("change", changeMode);
  starter.addEventListener("change", changeMode);
  changeMode();
  return {
    element,
    async usePdf(value) {
      pdf = value;
      store = value ? discoveryStore(value.sha) : null;
      result = null; approved.checked = false; renderReview();
      pages.value = value ? pageSelectionText(samplePages(value.doc.numPages), value.doc.numPages) : "";
      browser.usePdf(value);
      if (store) {
        let saved = await store.readWork("work/type-discovery/selection.json");
        if (proposalUrl) {
          status.textContent = "Opening the saved proposal for this book…";
          const response = await fetch(new URL(proposalUrl, location.href));
          if (!response.ok) throw new Error(`Could not open the saved proposal (HTTP ${response.status}).`);
          const packet = await response.json();
          if (pdf !== value) return;
          const context = { pdfSha: value.sha, pageCount: value.doc.numPages, schema: app.schema };
          if (!saved) saved = await keepProposalPackage(store, packet, context);
          else {
            const preloaded = checkProposalPackage(packet, context);
            if (!saved.reader_options && preloaded.reader_options) saved.reader_options = preloaded.reader_options;
          }
        }
        if (pdf !== value) return;
        if (saved) {
          result = saved;
          if (!title.dataset.edited) title.value = saved.types.title;
          if (!bookId.dataset.edited) bookId.value = saved.types.book_id;
          if (!description.dataset.edited) description.value = saved.types.description || "";
          pages.value = pageSelectionText(saved.types.source.discovery.overviews?.length ? samplePages(value.doc.numPages) : saved.types.source.discovery.sample_pages, value.doc.numPages);
          browser.refreshSelection();
          approved.checked = !!saved.types.source.discovery.reviewed;
          renderReview();
          status.textContent = "Saved proposal ready. Review the types, then make the book.";
        }
      }
      changeMode();
    },
    async loadTypes() {
      if (starter.checked) {
        const types = await (await fetch(new URL("../types/generic.json", import.meta.url))).json();
        types.source = { ...types.source, draft: true };
        return types;
      }
      if (reuse.checked) return loadExisting();
      if (!result) throw new Error("There is no saved proposal for this PDF. Start with draft types or an existing list.");
      if (!approved.checked) throw new Error("Review the proposed unit types and check the review box before continuing.");
      const errors = problems(result.types);
      if (errors.length) throw new Error(errors[0]);
      result.types.source.discovery.reviewed = true;
      await saveReview();
      return structuredClone(result.types);
    },
    async saveToBook(book) {
      if (store && store !== book) await store.copyTo(book);
      if (mode.checked && result?.reader_options) await book.saveReaderOptions(result.reader_options);
    },
  };
}
