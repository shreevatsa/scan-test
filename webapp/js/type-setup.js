import { h } from "./render.js";
import { checkTypes } from "./schema.js";
import { settings } from "./store.js";
import { money } from "./reader-controls.js";
import { renderPage, pageRange } from "./pipeline/pdf.js";
import { TYPE_MODELS, samplePages, discoveryStore, discoverTypes } from "./pipeline/type-discovery.js";
import { proposalPackage, checkProposalPackage, keepProposalPackage } from "./type-proposal.js";
import { readerById, structurerById } from "./pipeline/readers.js";
import { pageBrowser, pageSelectionText } from "./page-browser.js";

export function typeSetup({ app, title, bookId, description, index, template, proposalUrl = null, onBusy }) {
  let pdf = null, store = null, result = null, busy = false;
  let rendering = Promise.resolve();
  const drawPage = (doc, page, dpi) => {
    const task = rendering.then(() => renderPage(doc, page, dpi));
    rendering = task.catch(() => {});
    return task;
  };
  const images = new Map();
  const mode = h("input", { type: "radio", name: "type-source", value: "discover", checked: !template });
  const reuse = h("input", { type: "radio", name: "type-source", value: "existing", checked: !!template });
  const model = h("select", { "aria-label": "Unit type discovery model" }, ...TYPE_MODELS.map(profile =>
    h("option", { value: profile.id }, profile.label)));
  const pages = h("input", { size: 30, "aria-label": "Sample PDF pages", placeholder: "all, 1-50, or 1, 7, 43-44" });
  const browser = pageBrowser({ pages, render: drawPage });
  const status = h("p", { class: "meta", role: "status" });
  const review = h("div", { class: "type-review" });
  const approved = h("input", { type: "checkbox", "aria-label": "I have reviewed these unit types" });
  const approval = h("label", {}, approved, " I have reviewed these unit types and their grouping rules");
  approval.hidden = true;
  const typeSel = h("select", { "aria-label": "Existing unit type list" },
    ...(template ? [h("option", { value: "current" }, "This book’s types and model choices")] : []),
    ...index.map(t => h("option", { value: t.file }, `${t.book_id} · ${t.title}`)),
    h("option", { value: "" }, "Load types.json from a file…"));
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
    sampling.open = !result;
    samplingTitle.textContent = result ? "Choose more sample pages or request another proposal" : "Choose sample pages and a model";
    if (!result) { review.replaceChildren(); approval.hidden = true; return; }
    const tl = result.types;
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
      h("p", {}, `${tl.source.discovery.model} inspected ${tl.source.discovery.sample_pages.length} of ${pdf.doc.numPages} PDF pages (${pageSelectionText(tl.source.discovery.sample_pages, pdf.doc.numPages)}). Estimated call cost ${money(result.call.cost_usd)}.`),
      h("p", {}, tl.description), h("p", { class: "meta" }, `Languages ${(tl.languages || []).join(", ")}`),
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
        h("ul", {}, ...result.proposal.questions.map(question => h("li", {}, question)))) : null,
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

  const selectedPages = () => {
    if (!pdf) throw new Error("Choose a PDF and wait for it to open.");
    if (!pages.value.trim()) throw new Error("Choose at least one sample page, or enter all.");
    return pageRange(pages.value, pdf.doc.numPages);
  };
  const sampleImages = async () => {
    const selected = selectedPages();
    for (const [index, page] of selected.entries()) {
      if (images.has(page)) continue;
      status.textContent = `Preparing sample ${index + 1} of ${selected.length}, PDF page ${page}…`;
      const rendered = await drawPage(pdf.doc, page, 150);
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(rendered.blob);
      });
      images.set(page, { page, dataUrl });
    }
    return selected.map(page => images.get(page));
  };
  const lock = value => {
    busy = value;
    element.querySelectorAll("input,select,textarea,button").forEach(control => { control.disabled = value; });
    onBusy(value);
  };
  const preview = h("button", { onclick: () => {
    try { selectedPages(); browser.showSelection(); status.textContent = "Open any selected page for a larger preview."; }
    catch (error) { status.textContent = error.message; }
  } }, "Preview sample pages");
  const generate = h("button", { class: "primary", onclick: async () => {
    lock(true);
    try {
      const profile = TYPE_MODELS.find(profile => profile.id === model.value);
      const id = bookId.value.trim();
      if (!/^[A-Za-z0-9._-]+$/.test(id)) throw new Error("Give the book an id using letters, digits, dots, dashes and underscores.");
      const keys = { [profile.provider]: await settings.get(`key:${profile.provider}`) };
      if (!keys[profile.provider]) throw new Error(`Add your ${profile.provider === "openai" ? "OpenAI" : "Gemini"} API key below.`);
      const samples = await sampleImages();
      status.textContent = `${profile.label} is inspecting ${samples.length} sample pages…`;
      const proposed = await discoverTypes({ store, keys, profile, images: samples, title: title.value.trim(), description: description.value.trim(),
        pageCount: pdf.doc.numPages, id, pdfSha: pdf.sha, schema: app.schema });
      if (result?.reader_options) proposed.reader_options = result.reader_options;
      await store.writeWork("work/type-discovery/selection.json", proposed);
      result = proposed;
      approved.checked = false;
      if (!description.dataset.edited) description.value = result.types.description;
      renderReview();
      status.textContent = "Proposal saved. Review the types and questions below before making the book.";
    } catch (error) {
      status.textContent = `Could not propose unit types. ${error.message}${error.record ? ` Estimated attempt cost ${money(error.record.cost_usd)}. The attempt is saved.` : ""}`;
    } finally { lock(false); }
  } }, "Propose unit types");
  const samplingTitle = h("summary", {}, "Choose sample pages and a model");
  const sampling = h("details", { open: true }, samplingTitle,
    h("p", {}, "Inspect a small set of pages to identify this book’s units, such as chapters, articles, verses, translations or commentary. Review the proposal before processing pages."),
    browser.element,
    h("div", { class: "fields col" }, h("label", {}, "Sample PDF pages ", pages),
      h("p", { class: "hint" }, "Use all, a range such as 1-50, or a list such as 1, 7, 43-44. Page numbers are positions in the PDF. Include contents, ordinary text, section openings and different layouts."),
      h("label", {}, "Propose types with ", model)),
    h("div", { class: "actions" }, preview, " ", generate),
    h("p", { class: "hint" }, "Proposing types sends the selected page images to the selected provider using your API key. The estimated charge is shown with the saved result."),
    h("details", {}, h("summary", {}, "API keys for unit type discovery"), ...[["openai", "OpenAI"], ["gemini", "Gemini"]].map(([provider, label]) => {
      const input = h("input", { type: "password", autocomplete: "off", size: 30,
        "aria-label": `${label} API key for unit type discovery`,
        oninput: () => { input.dataset.edited = "1"; },
        onblur: async () => {
          if (!input.dataset.edited) return;
          try { await settings.set(`key:${provider}`, input.value.trim()); }
          catch (error) { status.textContent = error.message; }
        } });
      settings.get(`key:${provider}`).then(value => {
        if (!input.dataset.edited) input.value = value || "";
      }).catch(error => { status.textContent = error.message; });
      return h("label", { class: "type-key" }, `${label} API key `, input);
    })));
  const discover = h("div", {}, sampling, review, approval);
  const element = h("section", { class: "type-setup" }, h("h2", {}, "Determine this book’s unit types"),
    h("label", {}, mode, " Propose types from sample pages"), " ", h("label", {}, reuse, " Use a type list I already have"),
    discover, existing, status);
  const changeMode = () => {
    discover.hidden = !mode.checked;
    existing.hidden = !reuse.checked;
    if (reuse.checked) fillDescription();
    else if (!description.dataset.edited) description.value = result?.types.description || template?.types.description || "";
  };
  mode.addEventListener("change", changeMode);
  reuse.addEventListener("change", changeMode);
  changeMode();
  return {
    element,
    async usePdf(value) {
      pdf = value;
      store = value ? discoveryStore(value.sha) : null;
      images.clear(); result = null; approved.checked = false; renderReview();
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
          pages.value = pageSelectionText(saved.types.source.discovery.sample_pages, value.doc.numPages);
          browser.refreshSelection();
          approved.checked = !!saved.types.source.discovery.reviewed;
          renderReview();
          status.textContent = "Saved proposal ready. Review the types, then make the book.";
        } else status.textContent = "Choose sample pages, then propose this book’s unit types.";
      }
    },
    async loadTypes() {
      if (busy) throw new Error("Wait for unit type discovery to finish.");
      if (reuse.checked) return loadExisting();
      if (!result) throw new Error("Propose this book’s unit types from sample pages first.");
      if (!approved.checked) throw new Error("Review the proposed unit types and check the review box before continuing.");
      const errors = problems(result.types);
      if (errors.length) throw new Error(errors[0]);
      result.types.source.discovery.reviewed = true;
      await saveReview();
      return structuredClone(result.types);
    },
    async saveToBook(book) {
      if (store) await store.copyTo(book);
      if (result?.reader_options) await book.saveReaderOptions(result.reader_options);
    },
  };
}
