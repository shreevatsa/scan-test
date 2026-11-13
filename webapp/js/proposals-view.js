// The "Proposed types (N)" box of the Regions tab, between the survey box and the Find regions box: pending proposals
// for the type list from surveys (methods 095, 096) and from the region finder (method 097), each added through the
// type-list revision operations, found to be the same as an existing type, or dismissed. When a proposal becomes a
// type, the unassigned regions that carry its name get that type on every page a person has not edited or moved on;
// the others are listed with links, to be given the type by hand.
import { h } from "./render.js";
import { readPendingProposals, pendingItems, decideProposal, additionChoice, additionOperations, proposalAssignments,
  waitingRegions, normalizeTypeName, itemNames, proposalEvidence } from "./type-additions.js?v=20261113-types-tidy-2";
import { reviewTypeChange } from "./type-operations.js?v=20261113-types-tidy-2";
import { REGION_CLASSES } from "./book-types.js?v=20261113-types-tidy-2";
import { isProtected, LAYERS } from "./layers.js?v=20261113-types-tidy-2";

const where = type => type.furniture ? "Page furniture"
  : [type.parents.length ? `Inside ${type.parents.join(", ")}` : "", type.flow ? `Top level of ${type.flow}` : ""].filter(Boolean).join(" · ");
const sourceText = source => source.kind === "survey" ? `Survey of ${source.pages.length} ${source.pages.length === 1 ? "page" : "pages"} · ${source.model} · method ${source.method.slice(0, 3)}`
  : source.kind === "finder" ? `Region finder · ${source.model || "model"} · method ${String(source.method).slice(0, 3)}` : `Page ${source.page} · ${source.kind}`;
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const pageName = pid => pid.replace(/^.*-page-/, "page ");

export function proposalsBox(app) {
  const book = app.book;
  const list = h("div", { class: "proposal-list" }), status = h("p", { role: "status" });
  const summary = h("summary", {}, "Proposed types");
  const section = h("details", { class: "region-section proposals-section", open: true, hidden: true }, summary, h("div", {}, status, list));
  const pageLink = pid => h("button", { class: "link", onclick: () => app.openPage(pid, {}, "regions"), "aria-label": `Open ${pageName(pid)} in the page editor` }, pageName(pid));
  const pidOfPdfPage = page => book.pages.find(value => value.pdf_page === page)?.id || book.pages[page - 1]?.id;
  const docOf = async pid => app.pageStates?.get(pid)?.doc ?? await book.current(pid);
  const protectedPage = doc => LAYERS.some(layer => isProtected(doc, layer));

  // Every page with unassigned regions carrying one of these names: rebuilt with the type where nothing protects it.
  const assign = async (item, type) => {
    const keys = new Set(itemNames(item).map(normalizeTypeName));
    // Pages are rebuilt with every decided name, so an earlier addition on the same page is kept.
    const assignments = proposalAssignments(await readPendingProposals(book), app.tl);
    if (![...keys].some(key => assignments.has(key))) return;
    const maker = await app.getMaker(), done = [], held = [];
    let regions = 0;
    for (const page of book.pages) {
      const waiting = waitingRegions(await docOf(page.id), keys);
      if (!waiting.length) continue;
      const outcome = await maker.assignProposedRegions(page.id, assignments);
      if (outcome === "assigned") { done.push(page.id); regions += waiting.length; await app.refreshWorkflowPage?.(page.id); }
      else if (outcome === "protected") held.push(page.id);
    }
    if (done.length) app.diskCopy?.checkpoint();
    // Kept on the app: adding a type redraws the Regions tab, and the new box shows the message.
    app.proposalMessage = { book, regions, pages: done.length, type, held };
    showMessage();
  };
  const showMessage = () => {
    const message = app.proposalMessage;
    if (message?.book !== book) return;
    const { regions, pages, type, held } = message;
    status.replaceChildren(`${plural(regions, "region")} on ${plural(pages, "page")} now ${regions === 1 ? "has" : "have"} type ${type}.`,
      ...held.length ? [` ${plural(held.length, "moved-on page")} ${held.length === 1 ? "has" : "have"} regions waiting for this type: `, ...held.flatMap(pid => [pageLink(pid), " "])] : []);
  };
  const decide = async (item, decision) => {
    try {
      await decideProposal(book, item.id, decision);
      app.diskCopy?.checkpoint();
      const type = decision.status === "added" ? decision.as : decision.same_as;
      if (type) await assign(item, type);
    } catch (error) { status.textContent = error.message; }
    // Adding a type redraws the Regions tab: the box on screen may be a newer one.
    await (app.proposalsBoxRefresh || refresh)();
  };

  const additionForm = item => {
    const choice = additionChoice(item.proposal), types = app.tl.types;
    const name = h("input", { value: choice.name, "aria-label": `Name for ${choice.name}` });
    const description = h("textarea", { rows: 3, "aria-label": `Definition of ${choice.name}` }, choice.description);
    // "other" is the region finder's escape class, not one a type may have: the choice starts empty unless the proposal names a real class.
    const region = h("select", { "aria-label": `Printed as, for ${choice.name}` }, h("option", { value: "", selected: !choice.region }, "(choose)"),
      ...["container", ...REGION_CLASSES.filter(value => value !== "other")].map(value =>
      h("option", { value, selected: value === choice.region }, value === "container" ? "container (groups other units)" : value)));
    const classHint = h("p", { class: "hint" }, "Choose how it is printed: heading, paragraph, …");
    const furniture = h("input", { type: "checkbox", checked: choice.furniture, "aria-label": "Page furniture" });
    const textTypes = Object.entries(types).filter(([, type]) => type.role !== "furniture");
    const box = (entries, checked, label) => entries.map(([other]) => ({ other, input: h("input", { type: "checkbox", checked: checked.includes(other), "aria-label": `${label} ${other}` }) }));
    const parents = box(textTypes.filter(([, type]) => type.contains || !type.region), choice.parents, "May appear inside");
    const children = box(textTypes, choice.contains, "May contain");
    const flow = h("select", { "aria-label": "Top level of reading flow" }, h("option", { value: "" }, "No (only inside another unit)"),
      ...Object.keys(app.tl.flows).map(value => h("option", { value, selected: value === choice.flow }, value)));
    const childField = h("fieldset", {}, h("legend", {}, "May contain"), ...children.map(({ other, input }) => h("label", { class: "type-child-choice" }, input, " ", other)));
    const placeField = h("div", {}, h("fieldset", {}, h("legend", {}, "May appear inside"), ...parents.map(({ other, input }) => h("label", { class: "type-child-choice" }, input, " ", other))),
      h("label", {}, "Top level of ", flow));
    let add;
    const refreshFields = () => { childField.hidden = region.value !== "container"; placeField.hidden = furniture.checked; classHint.hidden = !!region.value; if (add) add.disabled = !book.writable || !region.value; };
    region.onchange = furniture.onchange = refreshFields;
    const same = h("select", { "aria-label": "Same as existing type" }, ...Object.keys(types).map(other => h("option", { value: other }, other)));
    const note = h("p", { role: "status", class: "bad" });
    add = h("button", { class: "primary", disabled: !book.writable, onclick: async () => {
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
    refreshFields();
    return h("div", { class: "fields col proposal-form" }, h("label", {}, "Name ", name), h("label", {}, "Definition ", description),
      h("label", {}, "Printed as ", region), classHint, h("label", {}, furniture, " Page furniture"), childField, placeField,
      h("div", { class: "actions" }, add), note,
      h("div", { class: "actions" }, h("label", {}, "Same as existing type ", same),
        h("button", { disabled: !book.writable, onclick: () => decide(item, { status: "dismissed", same_as: same.value }) }, "Use this type")));
  };

  const typeCard = item => {
    const type = item.proposal, exists = Object.hasOwn(app.tl.types, type.name), evidence = proposalEvidence(item);
    const regionsBy = new Map();
    for (const entry of item.evidence || []) regionsBy.set(entry.page, (regionsBy.get(entry.page) || 0) + entry.regions.length);
    const form = additionForm(item);
    form.hidden = true;
    return h("article", { class: "type-card proposal-card", "aria-label": `Proposed type ${type.name}` },
      h("h4", {}, type.name, " ", h("span", { class: "meta" }, type.furniture ? `${type.region} · furniture` : type.region)),
      h("p", {}, type.description || h("span", { class: "meta" }, "No definition was given.")),
      where(type) ? h("p", { class: "meta" }, where(type)) : null,
      evidence.pdf_pages.length ? h("p", { class: "type-evidence" }, "Survey evidence: PDF pages ",
        ...evidence.pdf_pages.flatMap(page => { const pid = pidOfPdfPage(page); return [pid ? h("button", { class: "link", onclick: () => app.openPage(pid, {}, "regions"), "aria-label": `Open PDF page ${page}` }, String(page)) : String(page), " "]; }),
        type.evidence ? `· ${type.evidence}` : "") : null,
      evidence.pages.length ? h("p", { class: "type-evidence" }, `Found by the region finder: ${plural(evidence.regions, "region")} on `,
        ...evidence.pages.flatMap(pid => [pageLink(pid), regionsBy.get(pid) > 1 ? ` (${regionsBy.get(pid)})` : "", " "])) : null,
      type.aliases?.length ? h("p", { class: "meta" }, `Also proposed as ${type.aliases.join(", ")}`) : null,
      exists ? h("p", { class: "bad" }, `The list already has a type named ${type.name}: rename this one or use the existing type.`) : null,
      h("p", { class: "meta" }, sourceText(item.source)),
      h("div", { class: "actions" }, h("button", { class: "primary", disabled: !book.writable, onclick: () => { form.hidden = !form.hidden; } }, "Add…"),
        h("button", { disabled: !book.writable, onclick: () => decide(item, { status: "dismissed" }) }, "Dismiss")), form);
  };
  // A proposed description of the book: editable, then written through the book-details operation (as Edit book details does).
  const descriptionCard = item => {
    const text = h("textarea", { rows: 5, "aria-label": "Proposed book description" }, item.proposal.description);
    const note = h("p", { role: "status", class: "bad" });
    return h("article", { class: "type-card proposal-card", "aria-label": "Proposed book description" },
      h("h4", {}, "Proposed book description"),
      h("p", { class: "hint" }, app.tl.description?.trim() ? "The book already has a description; using this one replaces it." : "The book has no description yet. Model calls use it, so edit it until it is right."),
      h("label", {}, "Description ", text), note, h("p", { class: "meta" }, sourceText(item.source)),
      h("div", { class: "actions" }, h("button", { class: "primary", disabled: !book.writable, onclick: async () => {
        const value = text.value.trim();
        if (!value) { note.textContent = "The description is empty."; return; }
        try { await reviewTypeChange(app, [{ kind: "metadata", description: value }], { applied: () => decide(item, { status: "applied", description: value }) }); }
        catch (error) { note.textContent = error.message; }
      } }, "Use"), h("button", { disabled: !book.writable, onclick: () => decide(item, { status: "dismissed" }) }, "Dismiss")));
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

  async function refresh() {
    if (app.book !== book) return;
    const record = await readPendingProposals(book);
    const assignments = proposalAssignments(record, app.tl);
    app.proposalAssignments = assignments;
    const types = pendingItems(record, "new_type"), descriptions = pendingItems(record, "book_description"), edits = pendingItems(record, "definition_edit"), questions = pendingItems(record, "question");
    // Pages a person protects that still have regions waiting for a type that now exists.
    const waiting = [];
    if (assignments.size) for (const page of book.pages) {
      const doc = await docOf(page.id), regions = waitingRegions(doc, new Set(assignments.keys()));
      if (regions.length && protectedPage(doc)) waiting.push({ pid: page.id, types: [...new Set(regions.map(region => assignments.get(normalizeTypeName(region.proposed_type))))] });
    }
    const decided = record.items.filter(item => item.status !== "pending" && item.kind !== "question");
    summary.replaceChildren(`Proposed types (${types.length})`, edits.length ? h("span", { class: "meta" }, plural(edits.length, "definition edit")) : "");
    showMessage();
    section.hidden = !types.length && !descriptions.length && !edits.length && !waiting.length && app.proposalMessage?.book !== book;
    list.replaceChildren(...[
      types.length ? h("p", { class: "hint" }, "Types proposed by surveys and by Find regions. Regions of a proposed type stay unassigned (hatched) until the type is added; then they get it on every page you have not edited or moved on.") : null,
      ...descriptions.map(descriptionCard),
      ...types.map(typeCard),
      edits.length ? h("h4", {}, "Suggested definition edits") : null, ...edits.map(editCard),
      waiting.length ? h("div", { class: "box" }, h("p", {}, `${plural(waiting.length, "moved-on page")} ${waiting.length === 1 ? "has" : "have"} regions waiting for an added type: `),
        h("p", {}, ...waiting.flatMap(({ pid, types: names }) => [pageLink(pid), ` (${names.join(", ")}) `]))) : null,
      questions.length ? h("p", { class: "box" }, `${plural(questions.length, "question")} from surveys ${questions.length === 1 ? "is" : "are"} in Questions to review. `,
        h("button", { onclick: () => app.setRegionView("types") }, "Open By type")) : null,
      decided.length ? h("details", {}, h("summary", {}, `${decided.length} decided`), h("ul", {}, ...decided.map(item => h("li", {},
        `${item.proposal.name || "Book description"} · ${item.status}${item.decision?.as && item.decision.as !== item.proposal.name ? ` as ${item.decision.as}` : ""}${item.decision?.same_as ? ` (same as ${item.decision.same_as})` : ""}`)))) : null].filter(Boolean));
  }
  app.proposalsBoxRefresh = () => refresh().catch(error => { section.hidden = false; status.textContent = error.message; });
  return { element: section, refresh: () => refresh().catch(error => { section.hidden = false; status.textContent = error.message; }) };
}
