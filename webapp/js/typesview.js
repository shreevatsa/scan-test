// The book's type list (types.json): its own part of the schema. The format and its rules (schema/schema.json) are
// shared by every book; the type list says which kinds of unit this book's pages are divided into, which may
// contain which, its flows, relations, inline kinds and transcription conventions. The checks use both, and the
// prompts that find regions and transcribe pages are written from the type list. Shown here as the tree of what may
// contain what, from each flow's top level, with how many units of each type the book has, and as each type's card.

import { h, cropInto } from "./render.js";
import { typeForest } from "./type-tree.js?v=20261113-flags-5";
import { prepare } from "./reader.js?v=20261113-flags-5";
import { typeRevision } from "./schema.js?v=20261113-flags-5";
import { editTypeDialog, editBookTypesDialog, reviewTypeChange } from "./type-operations.js?v=20261113-flags-5";
import { newTypeDialog } from "./regionsview.js?v=20261113-flags-5";
import { renderSurvey } from "./type-survey-view.js?v=20261113-flags-5";
import { readPendingProposals, pendingItems, decideProposal } from "./type-additions.js?v=20261113-flags-5";
import { unusedDraftTypes } from "./draft-types.js?v=20261113-flags-5";
import { citedSamplePages } from "./type-revisions.js?v=20261113-flags-5";
import { typeExampleIndex } from "./type-examples.js?v=20261113-flags-5";
import { regionPath } from "./pageimage.js?v=20261113-flags-5";

// The optional survey box of the Regions tab (type-survey-view.js), closed until opened, which loads the source PDF only
// then.
export function surveyBox(app, { credentialsBox, onBusy, selected, onProposals }) {
  const book = app.book, token = app.routeToken;
  app.typeOverview ||= {};
  const discovery = h("div");
  const section = h("details", { class: "region-section survey-section", open: app.routeView === "proposal" || !!app.typeOverview.open },
    h("summary", {}, "Find unit types using a survey of pages (optional)"), discovery);
  let loaded = false;
  const load = async () => {
    app.typeOverview.open = section.open;
    if (!section.open || !section.isConnected || loaded || app.book !== book || app.routeToken !== token) return;
    loaded = true;
    try { await renderSurvey(discovery, app, { selected: selected(), credentialsBox, onBusy, onProposals }); }
    catch (error) { discovery.replaceChildren(h("p", { class: "bad", role: "status" }, error.message)); loaded = false; }
  };
  section.addEventListener("toggle", load);
  return { element: section, load };
}

// By type: what may contain what (each type name selects its card), the cards with scan examples, then the book's
// details and the questions to review. Returns what to run when leaving the view.
export async function renderTypeView(el, app) {
  const book = app.book, token = app.routeToken;
  app.typeOverview ||= {};
  const tree = h("div", { class: "type-side" }), detail = h("section", { class: "type-detail", "aria-label": "Selected unit type" }), details = h("div");
  const reviewPages = ids => {
    app.pendingStageSelection = { stage: "regions", ids };
    app.setMode("regions");
  };
  const mark = name => {
    for (const row of tree.querySelectorAll("[data-type]")) {
      const on = row.dataset.type === name;
      row.classList.toggle("on", on);
      if (on) row.setAttribute("aria-current", "true"); else row.removeAttribute("aria-current");
    }
  };
  const browser = h("div", { class: "type-browser" }, tree, detail);
  el.replaceChildren(h("div", { class: "type-overview" }, browser, details));
  const examples = await renderTypeExamples(detail, app, reviewPages, mark);
  if (app.book !== book || app.routeToken !== token) return () => {};
  if (!examples) { browser.replaceWith(detail); } else
  await renderTypeTree(tree, app, { removeUnused: true, selected: () => app.typeOverview.selected, onSelect: examples.choose,
    bar: h("div", { class: "stylebar" }, book.writable ? h("button", { onclick: () => newTypeDialog(app) }, "＋ Type") : null,
      h("span", { class: "meta" }, `Revision ${typeRevision(app.tl.source?.revision)}${app.tl.source?.draft ? " · draft types" : ""}`)) });
  await renderBookDetails(details, app, { onReviewPages: reviewPages });
  return () => examples?.dispose();
}

async function renderTypeExamples(el, app, reviewPages, mark) {
  const book = app.book, types = app.tl, token = app.routeToken, state = app.typeOverview;
  const docs = await book.all();
  if (app.book !== book || app.routeToken !== token) return;
  const index = typeExampleIndex(docs, types), names = Object.keys(types.types);
  if (!names.length) {
    el.replaceChildren(h("div", {}, h("p", {}, "Add a type to start assigning page regions."),
      book.writable ? h("button", { onclick: () => newTypeDialog(app) }, "＋ Type") : null));
    return null;
  }
  if (!types.types[state.selected]) state.selected = names[0];
  state.offsets ||= {};
  const detail = el;
  const cards = h("div", { class: "type-examples", "aria-label": "Region examples" });
  const loaded = new Map();
  const active = () => app.book === book && app.routeToken === token;
  const fit = () => {
    for (const [button, { crop, url, example }] of loaded) cropInto(crop, url, example.page, example.box, Math.max(1, button.clientWidth - 20), 260);
  };
  const observer = new ResizeObserver(fit);
  observer.observe(cards);
  const draw = () => {
    const name = state.selected, type = types.types[name], examples = index.get(name) || [];
    const ids = [...new Set(examples.map(example => example.page.id))];
    const size = 6, offset = Math.min(state.offsets[name] || 0, Math.max(0, Math.ceil(examples.length / size) - 1) * size);
    state.offsets[name] = offset;
    mark(name);
    const parents = Object.entries(types.types).filter(([, value]) => value.contains?.includes(name)).map(([parent]) => parent);
    const jump = value => h("button", { class: "link", onclick: () => choose(value) }, value);
    const previous = h("button", { disabled: !offset, onclick: () => { state.offsets[name] = offset - size; draw(); } }, "← Previous examples");
    const next = h("button", { disabled: offset + size >= examples.length, onclick: () => { state.offsets[name] = offset + size; draw(); } }, "Next examples →");
    detail.replaceChildren(...[h("div", { class: "type-detail-head" }, h("h2", {}, name),
      book.writable ? h("button", { onclick: () => editTypeDialog(app, name) }, "Edit type…") : null),
      type.description ? h("p", {}, type.description) : null,
      type.region === "other" ? h("p", { class: "bad" }, "This type needs a class: ", h("button", { class: "link", onclick: () => editTypeDialog(app, name, "class") }, "choose how it is printed")) : null,
      h("p", { class: "meta" }, [type.region || "container", type.role === "furniture" ? "page furniture" : type.flow ? `${type.flow} flow` : "inside another unit", type.lang].filter(Boolean).join(" · ")),
      parents.length ? h("p", { class: "type-rules" }, "May be inside ", ...parents.flatMap((value, i) => [i ? ", " : "", jump(value)])) : null,
      type.contains?.length ? h("p", { class: "type-rules" }, "May contain ", ...type.contains.flatMap((value, i) => [i ? ", " : "", jump(value)])) : null,
      h("div", { class: "actions" }, h("span", {}, `Saved assignments on ${ids.length} of ${docs.length} processed pages`),
        ids.length ? h("button", { onclick: () => reviewPages(ids) }, "Show these pages") : null),
      h("h3", {}, "Examples from the scans"),
      examples.length ? h("p", { class: "hint" }, "Open an example to review its assignment on the full page.")
        : h("p", { class: "hint" }, "This type has no saved region examples yet. Draw or find regions in By page to try it on the scans."), cards,
      examples.length > size ? h("div", { class: "example-pager" }, previous, h("span", { role: "status" }, `${offset + 1}–${Math.min(offset + size, examples.length)} of ${examples.length} examples`), next) : null].filter(Boolean));
    loaded.clear();
    cards.replaceChildren();
    for (const example of examples.slice(offset, offset + size)) {
      const page = book.page(example.page.id), number = page.pdf_page || book.index[page.id] + 1;
      const crop = h("div", { class: "type-example-crop" });
      const button = h("button", { class: "type-example-open", "aria-label": `Open page ${number}, ${example.unit || example.regions[0].id}`, onclick: () => app.openPage(page.id, { region: example.regions[0].id }, "regions") }, crop);
      const status = h("span", { class: "meta" }, "Preparing scan…");
      cards.append(h("figure", {}, button, h("figcaption", {}, `PDF page ${number}${page.label ? ` · printed ${page.label}` : ""} · ${example.unit || example.regions[0].id}`,
        h("span", { class: "meta" }, example.unit ? ` · ${example.regions.length} regions${example.provisional ? " · provisional grouping" : ""}` : "")), status));
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      const [x1, y1, x2, y2] = example.box;
      svg.setAttribute("viewBox", `${x1} ${y1} ${x2 - x1} ${y2 - y1}`);
      for (const region of example.regions) {
        const path = document.createElementNS(svg.namespaceURI, "path");
        path.setAttribute("d", regionPath(region, types.types[region.type]?.region));
        path.setAttribute("stroke", app.colors[region.type] || "#888");
        svg.append(path);
      }
      crop.append(svg);
      book.imageUrl(page.id).then(url => {
        if (!active() || !button.isConnected) return;
        loaded.set(button, { crop, url, example }); fit(); status.remove();
      }).catch(error => { if (active()) status.textContent = `Scan unavailable · ${error.message}`; });
    }
  };
  const choose = name => {
    if (!types.types[name]) return;
    state.selected = name;
    draw();
  };
  draw();
  return { choose, dispose: () => observer.disconnect() };
}

// What may contain what: each type once per reading flow (type-tree.js), with how many units of it the book has.
// A type name selects that type (onSelect), or opens its edit form where nothing selects.
export async function renderTypeTree(el, app, { onSelect, removeUnused = false, selected = null, bar = null } = {}) {
  const { book, tl } = app;
  const types = tl.types || {};
  const name = (value, description) => {
    const act = onSelect ? () => onSelect(value) : book.writable ? () => editTypeDialog(app, value) : null;
    return act ? h("button", { class: "link tname", title: description || "", onclick: act }, value) : h("span", { class: "tname", title: description || "" }, value);
  };
  // "other" is the region finder's escape class, not one a type should have: marked, with a link to the class operation.
  const needsClass = type => types[type]?.region === "other"
    ? h("span", { class: "needs-class" }, " ", book.writable ? h("button", { class: "link", onclick: () => editTypeDialog(app, type, "class") }, "needs a class") : "needs a class") : "";
  const draw = (counts, unusedNames = []) => {
    const nodeEl = r => {
      const unused = unusedNames.includes(r.name);
      // A type used nowhere is one muted line: its name and "unused draft type" (or "unused"), without a count.
      const quiet = r.zero && r.kind !== "container" && r.kind !== "furniture" && !!counts;
      const notes = [r.kind === "container" ? "container" : "", r.printedAs ? `printed as ${r.printedAs}` : "", ...r.notes].filter(Boolean).join(" · ");
      return h("li", { class: `tnode${quiet || (unused && r.zero) ? " unused-draft" : ""}${r.multi ? " multi" : ""}`, "data-type": r.name },
        h("div", { class: "trow" }, h("i", { class: "dot", style: `background:${app.colors?.[r.name] || "#888"}` }), name(r.name, types[r.name]?.description),
          r.multi ? h("span", { class: "also-mark", title: "This type is used in more than one place", "aria-hidden": "true" }, "⇄") : null,
          notes ? h("span", { class: "rclass" }, notes) : null, needsClass(r.name),
          quiet ? null : h("span", { class: `count${r.zero ? " zero" : ""}` }, r.count),
          (quiet || (unused && r.zero)) ? h("span", { class: "meta unused-draft-note" }, unused ? "unused draft type" : "unused") : null),
        r.children.length ? h("ul", {}, ...r.children.map(nodeEl)) : null);
    };
    const root = (title, description, nodes) => h("div", { class: "flowtree" }, h("h4", {}, title, description ? h("span", { class: "meta" }, ` — ${description}`) : null),
      nodes.length ? h("ul", { class: "ttree" }, ...nodes.map(nodeEl)) : h("p", { class: "meta" }, "No type stands here."));
    const { flows, furniture, unplaced } = typeForest(tl, counts);
    el.querySelector(":scope > .type-tree-body")?.remove();
    el.append(h("div", { class: "type-tree-body" },
      ...flows.map(f => root(`flow ${f.flow}`, f.description, f.nodes)),
      furniture.length ? root("page furniture", "belongs to the page, not to the text", furniture) : null,
      unplaced.length ? root("not in any flow", "no flow and no container holds these", unplaced) : null));
    if (selected) markSelected(selected());
  };
  // All appearances of a type light up together (hover or keyboard focus), as the selected type's do.
  const light = value => { for (const row of el.querySelectorAll("[data-type]")) row.classList.toggle("same", !!value && row.dataset.type === value); };
  const typeOf = event => event.target.closest?.("[data-type]")?.dataset.type;
  el.addEventListener("mouseover", event => light(typeOf(event)));
  el.addEventListener("mouseleave", () => light(null));
  el.addEventListener("focusin", event => light(typeOf(event)));
  el.addEventListener("focusout", () => light(null));
  const markSelected = value => {
    for (const row of el.querySelectorAll("[data-type]")) {
      const on = row.dataset.type === value;
      row.classList.toggle("on", on);
      if (on) row.setAttribute("aria-current", "true"); else row.removeAttribute("aria-current");
    }
  };
  el.replaceChildren(h("h3", {}, "What may contain what"), ...(bar ? [bar] : []));
  draw(null);

  const docs = await book.all();
  const generic = await fetch(new URL("../types/generic.json", import.meta.url)).then(response => response.ok ? response.json() : null).catch(() => null);
  const proposals = pendingItems(await readPendingProposals(book).catch(() => ({ items: [] })), "new_type");
  if (!el.isConnected || app.book !== book || app.tl !== tl) return;
  const unused = unusedDraftTypes(tl, generic, docs, proposals);
  const P = prepare(docs, tl);
  const n = {}, at = {};
  const add = (obj, k) => { obj[k] = (obj[k] || 0) + 1; };
  for (const u of P.book.units) {
    add(n, u.type);
    for (const c of u.children) if (c.unit && P.units[c.unit]) add(at, `${u.type}>${P.units[c.unit].type}`);
  }
  for (const [flow, tops] of Object.entries(P.book.flows)) for (const uid of tops) if (P.units[uid]) add(at, `flow:${flow}>${P.units[uid].type}`);
  for (const p of P.book.pages) for (const r of p.regions) if (types[r.type]?.role === "furniture") add(n, r.type);
  draw({ n, at }, unused.names);
  // Removing is offered only once regions are found on at least half of the pages not dimmed: before that, an unused
  // type may just not have been met yet.
  const found = docs.filter(doc => doc?.page?.regions?.length).length;
  const pages = book.pages.filter(page => !book.isSkipped?.(page.id)).length;
  if (removeUnused && book.writable && unused.names.length && found && found * 2 < pages)
    el.prepend(h("p", { class: "meta" }, `${unused.names.length} draft types are unused so far. Removing them is offered once regions are found on at least half the pages (now ${found} of ${pages}).`));
  if (removeUnused && book.writable && unused.names.length && found && found * 2 >= pages) {
    el.prepend(h("div", { class: "actions" }, h("button", { onclick: () => reviewTypeChange(app, unused.names.map(name => ({ kind: "remove", name })),
      { applied: () => app.route() }).catch(error => app.toast(error.message, "bad")) }, `Remove unused draft types (${unused.names.length})`),
      h("span", { class: "meta" }, `${unused.names.join(", ")}: used on no page and not in a proposal.`)));
  }
}

// The book's details: title, description (the one description every model call uses), languages, relations, inline
// kinds and transcription conventions, with the forms that change them, and the questions a type proposal left to review.
export function renderBookDetails(el, app, { onAdded = () => app.route(), onReviewPages, onOpenPage = pid => app.openPage(pid, {}, "regions") } = {}) {
  const { book, tl } = app;
  const list = (obj, render) => h("ul", {}, ...Object.entries(obj).map(render));
  const download = h("button", { onclick: () => {
    const a = h("a", { href: URL.createObjectURL(new Blob([JSON.stringify(tl, null, 1) + "\n"], { type: "application/json" })), download: "types.json" });
    document.body.append(a); a.click(); a.remove();
  } }, "Download types.json");
  // Questions from surveys of pages (possible duplicates and other distinctions), kept with the pending proposals.
  const surveyQuestions = h("div", { class: "survey-questions" });
  readPendingProposals(book).then(record => {
    const questions = pendingItems(record, "question");
    if (!questions.length || app.book !== book) return;
    const decide = (item, decision) => decideProposal(book, item.id, decision).then(() => renderBookDetails(el, app, { onAdded, onReviewPages, onOpenPage }))
      .catch(error => app.toast(error.message, "bad"));
    surveyQuestions.replaceChildren(...(tl.source?.discovery?.questions?.length ? [] : [h("h3", {}, "Questions to review")]), ...questions.map(item => {
      const answer = h("textarea", { rows: 2, "aria-label": `Review decision for ${item.proposal.question}` });
      return h("section", { class: "box" }, h("p", {}, item.proposal.question),
        h("p", { class: "meta" }, `${item.proposal.duplicate ? "Possible duplicate · " : ""}From a survey by ${item.source.model ?? item.source.kind}`),
        ...citedSamplePages(item.proposal.question, item.source.pages || []).map(number => h("button", { onclick: () => {
          const page = book.pages.find(page => page.pdf_page === number); if (page) onOpenPage(page.id);
        } }, `Page ${number}`)),
        ...item.proposal.types.filter(name => tl.types[name]).map(name => book.writable ? h("button", { onclick: () => editTypeDialog(app, name) }, `Edit ${name}…`) : null),
        book.writable ? [answer, h("div", { class: "actions" }, h("button", { onclick: () => {
          if (!answer.value.trim()) { app.toast("Write the decision first.", "bad"); return; }
          decide(item, { status: "answered", answer: answer.value.trim() });
        } }, "Record decision"), h("button", { onclick: () => decide(item, { status: "dismissed" }) }, "Dismiss"))] : null);
    }));
  }).catch(error => surveyQuestions.replaceChildren(h("p", { class: "bad" }, error.message)));
  el.replaceChildren(h("div", { class: "typesview book-details" },
    app.lastTypeRevision ? h("p", { class: "box" }, `Revision ${app.lastTypeRevision.revision} saved. `,
      app.lastTypeRevision.pages.length && onReviewPages ? h("button", { onclick: () => onReviewPages(app.lastTypeRevision.pages) },
        `Review ${app.lastTypeRevision.pages.length} affected ${app.lastTypeRevision.pages.length === 1 ? "page" : "pages"}`) : null) : null,
    h("div", { class: "stylebar" }, h("h3", {}, "Book details"),
      book.writable ? h("button", { onclick: () => editBookTypesDialog(app) }, "Edit book details") : null),
    h("p", {}, h("b", {}, tl.title || tl.book_id)),
    tl.description ? h("p", {}, tl.description) : h("p", { class: "hint" }, "No description yet. Describe the book (its parts, languages and layout) with Edit book details; every model call uses it."),
    (tl.languages || []).length ? h("p", { class: "meta" }, `Languages: ${tl.languages.join(", ")}`) : null,
    Object.keys(tl.relations || {}).length ? [h("h4", {}, "Relations"), list(tl.relations, ([n, d]) => h("li", {}, h("b", {}, n), ` — ${d}`))] : null,
    Object.keys(tl.inline || {}).length ? [h("h4", {}, "Inline kinds"), list(tl.inline, ([n, d]) => h("li", {}, h("b", {}, n), d.formatting ? ` (printed ${d.formatting})` : "", ` — ${d.description}`))] : null,
    (tl.conventions || []).length ? [h("h4", {}, "Transcription conventions"), h("ul", {}, ...tl.conventions.map(c => h("li", {}, c)))] : null,
    h("div", { class: "stylebar" }, download,
      h("span", { class: "meta" }, "The type list defines this book’s units, containment, reading flows and transcription conventions. Preview a change to see its reach before applying it.")),
    tl.source?.discovery?.questions?.length ? [h("h3", {}, "Questions to review"), ...tl.source.discovery.questions.map(question => {
      const decision = tl.source.discovery.resolved_questions?.[question];
      const answer = h("textarea", { rows: 2, "aria-label": `Review decision for ${question}` }, decision?.answer || "");
      const cited = citedSamplePages(question, tl.source.discovery.sample_pages || []);
      return h("section", { class: "box" }, h("p", {}, question), ...cited.map(number => h("button", { onclick: () => {
        const page = book.pages.find(page => page.pdf_page === number); if (page) onOpenPage(page.id);
      } }, `Page ${number}`)), decision ? h("p", { class: "ok" }, `Resolved · ${decision.answer}`) : null,
      book.writable ? [answer, h("button", { onclick: () => reviewTypeChange(app, [{ kind: "resolve_question", question, answer: answer.value }]).catch(error => app.toast(error.message, "bad")) }, "Preview review decision")] : null);
    })] : null, surveyQuestions));
}

// The type list as a dialog: the tree (a type name opens its edit form) and the book's details.
export async function renderTypes(el, app, options = {}) {
  const tree = h("div"), details = h("div");
  el.replaceChildren(tree, details);
  renderBookDetails(details, app, options);
  await renderTypeTree(tree, app);
}

export async function openTypeList(app) {
  if (app.workflowBusy || app.outlineBusy || app.maker?.processing) throw new Error("Wait for the active operation before editing types.");
  const content = h("div");
  const dialog = h("dialog", { class: "type-dialog type-list-dialog", "aria-label": "Edit type list" },
    h("div", { class: "stylebar" }, h("h2", {}, "Unit types"), h("button", { onclick: () => dialog.close() }, "Close")), content);
  const refresh = () => renderTypes(content, app, { onAdded: refresh, onOpenPage: pid => {
    dialog.close(); app.openPage(pid, {}, "regions");
  } });
  app.refreshTypeList = refresh;
  dialog.addEventListener("close", () => { dialog.remove(); app.refreshTypeList = null; }, { once: true });
  document.body.append(dialog);
  dialog.showModal();
  await refresh();
}
