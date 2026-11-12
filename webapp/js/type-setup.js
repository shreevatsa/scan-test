import { mergeTypeProposals, typeAgreement } from "./type-draft.js?v=20261111-type-overview-4";
import { h } from "./render.js";
import { checkTypes } from "./schema.js?v=20261110-reading-2";
import { settings } from "./store.js?v=20261112-url-1";
import { money } from "./reader-controls.js?v=20261111-type-overview-4";
import { renderPage, pageRange } from "./pipeline/pdf.js";
import { TYPE_MODELS, samplePages, discoveryStore, discoverTypes } from "./pipeline/type-discovery.js?v=20261111-type-overview-4";
import { OVERVIEW_MODELS, renderContactSheets, discoverOverview } from "./pipeline/type-overview.js?v=20261111-type-overview-4";
import { proposalPackage, checkProposalPackage, keepProposalPackage } from "./type-proposal.js?v=20261111-type-overview-4";
import { readerById, structurerById } from "./pipeline/readers.js?v=20261111-carbon-high-5";
import { pageBrowser, pageSelectionText } from "./page-browser.js?v=20261110-reading-2";
import { CredentialChecks, stageKeyControls } from "./key-check.js?v=20261111-type-overview-4";
import { citedSamplePages } from "./type-revisions.js?v=20261110-finders-4";

function overviewInventory(overview, types, openPage) {
  const uncertain = overview.inventory.filter(item => item.uncertain).map(item => item.page);
  const links = pages => pages.map(page => h("button", { class: "link", onclick: () => openPage(page) }, String(page)));
  const present = new Set(overview.inventory.flatMap(item => item.types));
  const rows = Object.keys(types).filter(name => present.has(name)).map(name => {
    const pages = overview.inventory.filter(item => item.types.includes(name)).map(item => item.page);
    return h("tr", {}, h("th", {}, name), h("td", {}, pages.length), h("td", {}, ...links(pages.slice(0, 6)),
      pages.length > 6 ? h("details", {}, h("summary", {}, `All ${pages.length} pages`), ...links(pages)) : null));
  });
  return h("details", { class: "overview-inventory", open: true },
    h("summary", {}, `${overview.model} · Overview estimates · ${overview.inventory.length} pages`),
    h("p", { class: "hint" }, `The model marked ${uncertain.length} ${uncertain.length === 1 ? "page" : "pages"} uncertain. Counts describe types visible in the thumbnails. Open an evidence page to inspect it at a larger size.`),
    h("table", {}, h("thead", {}, h("tr", {}, h("th", {}, "Type"), h("th", {}, "Pages"), h("th", {}, "Evidence pages"))), h("tbody", {}, ...rows)),
    uncertain.length ? h("details", {}, h("summary", {}, `Inspect ${uncertain.length} uncertain pages`), ...links(uncertain)) : null);
}

export function typeSetup({ app, title, bookId, description, index, template, book = null, initialSource = "starter", proposalUrl = null, onBusy }) {
  let pdf = null, store = null, result = null, busy = false;
  let rendering = Promise.resolve();
  const drawPage = (doc, page, dpi) => {
    const task = rendering.then(() => renderPage(doc, page, dpi));
    rendering = task.catch(() => {});
    return task;
  };
  const images = new Map();
  let sheets = null, stopped = false;
  let checks = new CredentialChecks({}), credentialsToken = 0;
  const credentials = h("div");
  const starter = h("input", { type: "radio", name: "type-source", value: "starter", checked: !template && !proposalUrl && initialSource === "starter" });
  const mode = h("input", { type: "radio", name: "type-source", value: "discover", checked: !template && (!!proposalUrl || initialSource === "discover") });
  const reuse = h("input", { type: "radio", name: "type-source", value: "existing", checked: !!template });
  const model = h("select", { "aria-label": "Unit type discovery model" }, ...TYPE_MODELS.map(profile =>
    h("option", { value: profile.id }, profile.label)), h("option", { value: "both" }, "Both models · review a merged draft"));
  const coverage = h("select", { "aria-label": "Type discovery coverage" },
    h("option", { value: "overview" }, "Whole-book contact sheets"), h("option", { value: "samples" }, "Selected pages in detail"));
  const profilesForCoverage = () => coverage.value === "overview" ? OVERVIEW_MODELS : TYPE_MODELS;
  const selectedProfiles = () => profilesForCoverage().filter(profile => model.value === "both" || profile.id === model.value);
  const credentialsReady = () => selectedProfiles().every(profile => checks.status(profile)?.valid);
  const pages = h("input", { size: 30, "aria-label": "Sample PDF pages", placeholder: "all, 1-50, or 1, 7, 43-44" });
  const browser = pageBrowser({ pages, render: drawPage });
  const status = h("p", { class: "meta", role: "status" });
  const review = h("div", { class: "type-review" });
  const sheetPreview = h("details", { class: "contact-preview" }, h("summary", {}, "Contact sheets sent to the model"));
  sheetPreview.hidden = true;
  const limit = h("input", { type: "number", min: 0.1, step: 0.5, value: 5, "aria-label": "Type discovery spend threshold" });
  const retryUnresolved = h("input", { type: "checkbox", "aria-label": "Allow a new call after an unresolved attempt" });
  const attempts = h("details", {}, h("summary", {}, "Saved type-discovery attempts"));
  const showAttempts = async () => {
    if (!store) return;
    const ledger = await store.readWork("work/reader-lab/ledger.json");
    attempts.replaceChildren(h("summary", {}, "Saved type-discovery attempts"),
      ...(ledger?.calls || []).filter(call => call.stage === "unit-types").map(call =>
        h("p", {}, `${call.profile} · ${call.status} · ${money(call.cost_usd)} · ${call.seconds == null ? "duration unavailable" : `${call.seconds.toFixed(1)} s`}`)),
      h("label", {}, retryUnresolved, " Allow a new call after an unresolved attempt"),
      h("p", { class: "hint" }, "An interrupted call may have a provider charge. Retrying keeps the earlier attempt and can add another charge."));
  };
  attempts.addEventListener("toggle", () => { if (attempts.open) showAttempts().catch(error => { status.textContent = error.message; }); });
  const stop = h("button", { disabled: true, onclick: () => { stopped = true; status.textContent = "Stopping after the active overview call…"; } }, "Stop after the active call");
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
      status.textContent = approved.checked ? (book ? "Unit types reviewed. Preview the type-list replacement to continue." : "Unit types reviewed. Make the book to continue.") : "Review the proposed types before continuing.";
    } catch (error) { approved.checked = false; status.textContent = `Could not save the review. ${error.message}`; }
  });

  const renderReview = () => {
    sampling.open = !result;
    samplingTitle.textContent = result ? "Request another proposal" : "Choose a survey and model";
    if (!result) { review.replaceChildren(); approval.hidden = true; return; }
    const tl = result.types;
    result.merged ||= tl.source.discovery.comparison;
    const merged = result.merged;
    if (merged) tl.source.discovery.comparison = merged;
    const draftChoices = merged ? h("section", { class: "box" }, h("h4", {}, "Types found across the models"),
      h("p", {}, "Keep or drop each proposed type, then review its definition and grouping below. Matching names are combined. Book details and conflicting shared definitions initially use the first proposal."),
      ...Object.entries(merged.types).map(([name, variants]) => {
        const keep = h("input", { type: "checkbox", checked: merged.kept[name], "aria-label": `Keep proposed type ${name}`, onchange: () => {
          if (!keep.checked) { merged.kept[name] = false; merged.saved ||= {}; merged.saved[name] = tl.types[name]; delete tl.types[name]; }
          else { merged.kept[name] = true; tl.types[name] = structuredClone(merged.saved?.[name] || variants[0].definition); }
          changed(); renderReview();
        } });
        return h("div", { class: "type-draft-choice" }, h("label", {}, keep, ` ${name} · ${typeAgreement(variants)}`),
          h("p", { class: "meta" }, variants.map(variant => variant.model).join(" · ")),
          variants.length > 1 ? h("details", {}, h("summary", {}, "Compare definitions"), ...variants.map(variant => h("section", {},
            h("b", {}, variant.model), h("p", {}, variant.definition.description),
            h("p", {}, `${variant.definition.region || "container"} · contains ${(variant.definition.contains || []).join(", ") || "no children"} · ${variant.definition.flow || "inside another unit"}`),
            h("button", { disabled: !keep.checked, onclick: () => { tl.types[name] = structuredClone(variant.definition); changed(); renderReview(); } }, `Use ${variant.model} definition`)))) : null);
      })) : null;
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
        if (result.merged?.types[name]) {
          result.merged.types[next] = result.merged.types[name]; delete result.merged.types[name];
          result.merged.kept[next] = result.merged.kept[name]; delete result.merged.kept[name];
          if (result.merged.saved?.[name]) { result.merged.saved[next] = result.merged.saved[name]; delete result.merged.saved[name]; }
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
      h("p", {}, `${tl.source.discovery.model} inspected ${tl.source.discovery.sample_pages.length} of ${pdf.doc.numPages} PDF pages (${pageSelectionText(tl.source.discovery.sample_pages, pdf.doc.numPages)}). Estimated proposal cost ${money(merged ? merged.cost_usd : result.call.cost_usd)}.`),
      h("p", {}, tl.description), h("p", { class: "meta" }, `Languages ${(tl.languages || []).join(", ")}`),
      ...(tl.source.discovery.overviews || []).map(overview => overviewInventory(overview, tl.types, page => browser.showPage(page))),
      result.reader_options ? h("p", { class: "hint" }, `Models for this book after setup · ${readerById(result.reader_options.reader).label} for transcription · ${structurerById(result.reader_options.structurer).label} for schema assignment.`) : null,
      Array.isArray(tl.source.review_notes) ? h("div", {}, h("h4", {}, "Adjustments from review"),
        h("ul", {}, ...tl.source.review_notes.map(note => h("li", {}, note)))) : null,
      h("p", { class: "hint" }, "Check the descriptions and grouping rules against the sample pages. Edit descriptions directly. Each type’s grouping rules can also be changed."),
      ...(draftChoices ? [draftChoices] : []), ...cards,
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
      !book ? h("details", { ontoggle: event => { if (event.currentTarget.open) json.value = JSON.stringify(result.types, null, 2); } }, h("summary", {}, "Edit the complete type list as JSON"), json,
        h("button", { onclick: () => {
          try {
            const next = JSON.parse(json.value), errors = problems(next);
            if (errors.length) throw new Error(errors[0]);
            next.source = { ...next.source, discovery: { ...tl.source.discovery, reviewed: false } };
            result.types = next;
            changed(); renderReview();
          } catch (error) { status.textContent = error.message; }
        } }, "Apply type list changes")) : null,
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
  const overviewImages = async () => {
    if (!pdf) throw new Error("Choose a PDF and wait for it to open.");
    if (!sheets) sheets = await renderContactSheets(pdf.doc, (page, count) => {
      status.textContent = `Preparing contact sheets · ${page} of ${count} PDF pages…`;
    });
    sheetPreview.replaceChildren(h("summary", {}, `${sheets.length} contact sheets · ${pdf.doc.numPages} PDF pages`),
      h("div", { class: "contact-sheets" }, ...sheets.map(sheet => h("figure", {},
        h("button", { class: "contact-sheet-open", onclick: () => {
          const dialog = h("dialog", { class: "contact-sheet-dialog" }, h("button", { onclick: () => dialog.close() }, "Close"),
            h("img", { src: sheet.dataUrl, alt: `Contact sheet ${sheet.index}, PDF pages ${sheet.pages.join(", ")}` }));
          dialog.addEventListener("close", () => dialog.remove(), { once: true }); document.body.append(dialog); dialog.showModal();
        } }, h("img", { src: sheet.dataUrl, alt: `Sheet ${sheet.index}, PDF pages ${sheet.pages[0]}–${sheet.pages.at(-1)}` })),
        h("figcaption", {}, `PDF pages ${sheet.pages[0]}–${sheet.pages.at(-1)}`)))));
    sheetPreview.hidden = false;
    return sheets;
  };
  const lock = value => {
    busy = value;
    element.querySelectorAll("input,select,textarea,button").forEach(control => { control.disabled = value; });
    onBusy(value);
    if (!value) { generate.disabled = !credentialsReady(); stop.disabled = true; }
  };
  const preview = h("button", { onclick: () => {
    try { selectedPages(); browser.showSelection(); status.textContent = "Open any selected page for a larger preview."; }
    catch (error) { status.textContent = error.message; }
  } }, "Preview sample pages");
  const previewSheets = h("button", { onclick: async () => {
    lock(true);
    try { await overviewImages(); sheetPreview.open = true; status.textContent = "Contact sheets ready. Open a sheet to enlarge it."; }
    catch (error) { status.textContent = error.message; }
    finally { lock(false); }
  } }, "Preview contact sheets");
  const generate = h("button", { class: "primary", disabled: true, onclick: async () => {
    if (book && !await app.confirmSpending()) return;
    lock(true);
    stopped = false; stop.disabled = coverage.value !== "overview";
    try {
      const profiles = selectedProfiles();
      const id = bookId.value.trim();
      if (!/^[A-Za-z0-9._-]+$/.test(id)) throw new Error("Give the book an id using letters, digits, dots, dashes and underscores.");
      if (!credentialsReady()) throw new Error("Check the credentials for the selected models before proposing types.");
      const keys = checks.keys;
      if (!limit.reportValidity() || !(Number(limit.value) > 0)) throw new Error("Enter a positive spend threshold.");
      const isOverview = coverage.value === "overview";
      const samples = isOverview ? await overviewImages() : await sampleImages();
      const proposals = [];
      let spent = 0;
      for (const profile of profiles) {
        if (stopped || spent >= Number(limit.value)) break;
        status.textContent = `${profile.label} is inspecting ${samples.length} ${isOverview ? "contact sheets" : "sample pages"}…`;
        const args = { store, keys, profile, title: title.value.trim(), description: description.value.trim(),
          pageCount: pdf.doc.numPages, id, pdfSha: pdf.sha, schema: app.schema, request: book ? (await app.getMaker()).request : undefined };
        const proposed = isOverview ? await discoverOverview({ ...args, sheets: samples, limit: Number(limit.value) - spent, stopped: () => stopped, retryUnresolved: retryUnresolved.checked,
          onCost: cost => { spent += cost || 0; }, progress: batch => {
            status.textContent = `${profile.label} · ${batch.cached ? "Reusing" : "Inspecting"} batch ${batch.index} of ${batch.total} · PDF pages ${batch.pages[0]}–${batch.pages.at(-1)} · up to 5 minutes per request`;
          } }) : await discoverTypes({ ...args, images: samples });
        await store.writeWork(`work/type-discovery/proposals/${profile.id}.json`, proposed);
        proposals.push({ profile, result: proposed });
        if (proposed.call.cost_usd == null) break;
      }
      if (!proposals.length) throw new Error("No new proposal was completed. Saved overview batches can be reused.");
      const proposed = proposals.length > 1 ? mergeTypeProposals(proposals) : proposals[0].result;
      if (result?.reader_options) proposed.reader_options = result.reader_options;
      const previous = await store.readWork("work/type-discovery/selection.json");
      if (previous) await store.writeWork(`work/type-discovery/history/${crypto.randomUUID()}.json`, previous);
      await store.writeWork("work/type-discovery/selection.json", proposed);
      result = proposed;
      approved.checked = false;
      if (!description.dataset.edited) description.value = result.types.description;
      renderReview();
      status.textContent = book ? "Proposal saved. Review the types and questions below before previewing the type-list replacement." : "Proposal saved. Review the types and questions below before making the book.";
    } catch (error) {
      status.textContent = `Could not propose unit types. ${error.message}${error.record ? ` Estimated attempt cost ${money(error.record.cost_usd)}. The attempt is saved.` : ""}`;
    } finally {
      lock(false); stop.disabled = true;
      if (book) app.diskCopy?.checkpoint();
      await showAttempts().catch(error => { status.textContent += ` Could not read the saved attempts. ${error.message}`; });
    }
  } }, "Propose unit types");
  const samplingTitle = h("summary", {}, "Choose a survey and model");
  const sampling = h("details", { open: true }, samplingTitle,
    h("p", {}, "Survey the whole book or inspect selected pages to identify its unit types. Review the proposal before processing regions."),
    browser.element,
    h("label", {}, "Survey ", coverage),
    h("p", { class: "hint overview-hint" }, "Survey every page in labelled contact sheets, then inspect evidence pages at full size. An overview request can take up to five minutes. Larger books are split into saved batches."),
    h("div", { class: "fields col sample-settings" }, h("label", {}, "Sample PDF pages ", pages),
      h("p", { class: "hint" }, "Use all, a range such as 1-50, or a list such as 1, 7, 43-44. Page numbers are positions in the PDF. Include contents, ordinary text, section openings and different layouts.")),
    h("label", {}, "Propose types with ", model), h("label", {}, " Stop once new spend reaches $", limit),
    h("div", { class: "actions" }, preview, previewSheets, generate, stop), sheetPreview,
    h("p", { class: "hint" }, "Proposing types sends the selected page images or whole-book contact sheets to the selected provider. The estimated charge is saved with the result. A spend threshold can be exceeded by the final call."),
    credentials, attempts);
  const changeCoverage = () => {
    const previous = model.value;
    model.replaceChildren(...profilesForCoverage().map(profile => h("option", { value: profile.id }, profile.label)),
      h("option", { value: "both" }, "Both models · review a merged draft"));
    if (previous === "both") model.value = "both";
    else if (previous.startsWith("argon")) model.value = profilesForCoverage()[1].id;
    sampling.querySelector(".sample-settings").hidden = coverage.value !== "samples";
    sampling.querySelector(".overview-hint").hidden = coverage.value !== "overview";
    browser.element.querySelector(':scope > [role="status"]').hidden = coverage.value === "overview";
    preview.hidden = coverage.value !== "samples";
    previewSheets.hidden = coverage.value !== "overview";
    stop.hidden = coverage.value !== "overview";
  };
  changeCoverage();
  const showCredentials = async () => {
    const token = ++credentialsToken, profiles = selectedProfiles();
    if (book) {
      const maker = await app.getMaker();
      checks = maker.credentials ||= new CredentialChecks(maker.keys);
    } else for (const profile of profiles) checks.keys[profile.provider] = await settings.get(`key:${profile.provider}`) || "";
    if (token !== credentialsToken) return;
    credentials.replaceChildren(...profiles.map(profile => stageKeyControls(checks, profile, (id, value) => settings.set(`key:${id}`, value), () => {
      if (!busy) generate.disabled = !credentialsReady();
    })));
    generate.disabled = !credentialsReady();
  };
  model.addEventListener("change", () => showCredentials().catch(error => { status.textContent = error.message; }));
  coverage.addEventListener("change", () => { changeCoverage(); showCredentials().catch(error => { status.textContent = error.message; }); });
  showCredentials().catch(error => { status.textContent = error.message; });
  const discover = h("div", {}, sampling, review, approval);
  const element = h("section", { class: "type-setup" }, h("h2", {}, "Determine this book’s unit types"),
    h("label", {}, starter, " Start with draft types and refine them in Regions"), " ",
    h("label", {}, mode, " Propose this book’s types with AI"), " ", h("label", {}, reuse, " Use a type list I already have"),
    discover, existing, status);
  const changeMode = () => {
    discover.hidden = !mode.checked;
    existing.hidden = !reuse.checked;
    if (starter.checked) status.textContent = "Start with common draft types, then add book-specific types while reviewing Regions.";
    else if (reuse.checked) status.textContent = "Choose the type list to use for this book.";
    else status.textContent = result ? "Review the saved proposal before continuing." : "Choose sample pages, then propose this book’s unit types.";
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
      store = value ? book || discoveryStore(value.sha) : null;
      images.clear(); sheets = null; sheetPreview.hidden = true; result = null; approved.checked = false; renderReview();
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
          coverage.value = saved.types.source.discovery.overviews?.length ? "overview" : "samples";
          changeCoverage(); showCredentials().catch(error => { status.textContent = error.message; });
          if (!title.dataset.edited) title.value = saved.types.title;
          if (!bookId.dataset.edited) bookId.value = saved.types.book_id;
          if (!description.dataset.edited) description.value = saved.types.description || "";
          pages.value = pageSelectionText(saved.types.source.discovery.overviews?.length ? samplePages(value.doc.numPages) : saved.types.source.discovery.sample_pages, value.doc.numPages);
          browser.refreshSelection();
          approved.checked = !!saved.types.source.discovery.reviewed;
          renderReview();
          status.textContent = book ? "Saved proposal ready. Review the types, then preview the replacement." : "Saved proposal ready. Review the types, then make the book.";
        } else status.textContent = "Choose sample pages, then propose this book’s unit types.";
      }
      if (!mode.checked) changeMode();
    },
    async loadTypes() {
      if (busy) throw new Error("Wait for unit type discovery to finish.");
      if (starter.checked) {
        const types = await (await fetch(new URL("../types/generic.json", import.meta.url))).json();
        types.source = { ...types.source, draft: true };
        return types;
      }
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
      if (store && store !== book) await store.copyTo(book);
      if (mode.checked && result?.reader_options) await book.saveReaderOptions(result.reader_options);
    },
  };
}
