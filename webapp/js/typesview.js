// The book's type list (types.json): its own part of the schema. The format and its rules (schema/schema.json) are
// shared by every book; the type list says which kinds of unit this book's pages are divided into, which may
// contain which, its flows, relations, inline kinds and transcription conventions. The checks use both, and the
// prompts that find regions and transcribe pages are written from the type list. Shown here as the tree of what may
// contain what, from each flow's top level, and as a table with how many units of each type the book has.

import { h, cropInto } from "./render.js";
import { prepare } from "./reader.js?v=20261112-hover-box-1";
import { typeRevision } from "./schema.js?v=20261112-hover-box-1";
import { editTypeDialog, editBookTypesDialog, reviewTypeChange } from "./type-operations.js?v=20261112-hover-box-1";
import { newTypeDialog, renderTypeDiscovery } from "./regionsview.js?v=20261112-hover-box-1";
import { citedSamplePages } from "./type-revisions.js?v=20261112-hover-box-1";
import { typeExampleIndex } from "./type-examples.js?v=20261112-hover-box-1";
import { regionPath } from "./pageimage.js?v=20261112-hover-box-1";

export async function renderTypeOverview(el, app) {
  const book = app.book, token = app.routeToken;
  const list = h("div"), discovery = h("div"), fullList = h("div");
  app.typeOverview ||= {};
  const section = h("details", { class: "region-section", open: app.routeView === "proposal" || (app.typeOverview.open ?? !!book.types.source?.draft) },
    h("summary", {}, "Propose and compare unit types"), discovery);
  let loaded = false;
  const load = async () => {
    app.typeOverview.open = section.open;
    if (!section.open || !section.isConnected || loaded || app.book !== book || app.routeToken !== token) return;
    loaded = true;
    try {
      await renderTypeDiscovery(discovery, app, { selected: [...(app.regionOverview?.selected || [])], onBusy: value => {
        app.workflowBusy = app.header.inert = list.inert = value;
      } });
    } catch (error) { discovery.replaceChildren(h("p", { class: "bad", role: "status" }, error.message)); loaded = false; }
  };
  section.addEventListener("toggle", load);
  const reviewPages = ids => {
    app.pendingStageSelection = { stage: "regions", ids };
    app.setMode("regions");
  };
  const schema = h("details", { class: "region-section", open: app.typeOverview.schema },
    h("summary", {}, "Full schema and revision history"), fullList);
  let schemaLoaded = false;
  const loadSchema = async () => {
    app.typeOverview.schema = schema.open;
    if (!schema.open || schemaLoaded || app.routeToken !== token) return;
    schemaLoaded = true;
    await renderTypes(fullList, app, { onReviewPages: reviewPages });
  };
  schema.addEventListener("toggle", () => loadSchema().catch(error => app.toast(error.message, "bad")));
  el.replaceChildren(h("div", { class: "stage-overview type-overview" }, h("h1", {}, "Regions"),
    ...(book.writable && book.manifest.pdf ? [section] : []), list, schema));
  await renderTypeExamples(list, app, reviewPages);
  await loadSchema();
  await load();
}

async function renderTypeExamples(el, app, reviewPages) {
  const book = app.book, types = app.tl, token = app.routeToken, state = app.typeOverview;
  const docs = await book.all();
  if (app.book !== book || app.routeToken !== token) return;
  const index = typeExampleIndex(docs, types), names = Object.keys(types.types);
  if (!names.length) {
    el.replaceChildren(h("div", {}, h("p", {}, "Add a type to start assigning page regions."),
      book.writable ? h("button", { onclick: () => newTypeDialog(app) }, "＋ Type") : null));
    return;
  }
  if (!types.types[state.selected]) state.selected = names[0];
  state.offsets ||= {};
  const choices = h("nav", { class: "type-choices", "aria-label": "Unit types" });
  const detail = h("section", { class: "type-detail", "aria-label": "Selected unit type" });
  const cards = h("div", { class: "type-examples", "aria-label": "Region examples" });
  const buttons = new Map(), loaded = new Map();
  const active = () => app.book === book && app.routeToken === token;
  const fit = () => {
    for (const [button, { crop, url, example }] of loaded) cropInto(crop, url, example.page, example.box, Math.max(1, button.clientWidth - 20), 260);
  };
  const observer = new ResizeObserver(fit);
  observer.observe(cards);
  app.onLeaveGrid = () => observer.disconnect();
  const draw = () => {
    const name = state.selected, type = types.types[name], examples = index.get(name) || [];
    const ids = [...new Set(examples.map(example => example.page.id))];
    const size = 6, offset = Math.min(state.offsets[name] || 0, Math.max(0, Math.ceil(examples.length / size) - 1) * size);
    state.offsets[name] = offset;
    for (const [value, button] of buttons) {
      button.classList.toggle("on", value === name);
      button.setAttribute("aria-pressed", String(value === name));
    }
    const parents = Object.entries(types.types).filter(([, value]) => value.contains?.includes(name)).map(([parent]) => parent);
    const jump = value => h("button", { class: "link", onclick: () => choose(value) }, value);
    const previous = h("button", { disabled: !offset, onclick: () => { state.offsets[name] = offset - size; draw(); } }, "← Previous examples");
    const next = h("button", { disabled: offset + size >= examples.length, onclick: () => { state.offsets[name] = offset + size; draw(); } }, "Next examples →");
    detail.replaceChildren(...[h("div", { class: "type-detail-head" }, h("h2", {}, name),
      book.writable ? h("button", { onclick: () => editTypeDialog(app, name) }, "Edit type…") : null),
      type.description ? h("p", {}, type.description) : null,
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
  for (const name of names) {
    const pages = new Set(index.get(name).map(example => example.page.id)).size;
    const button = h("button", { onclick: () => choose(name), title: types.types[name].description || "" },
      h("i", { style: `background:${app.colors[name] || "#888"}` }), h("span", {}, name), h("span", { class: "meta" }, `${pages} ${pages === 1 ? "page" : "pages"}`));
    buttons.set(name, button); choices.append(button);
  }
  el.replaceChildren(h("div", { class: "stylebar" },
    book.writable ? h("button", { onclick: () => newTypeDialog(app) }, "＋ Type") : null,
    h("span", { class: "meta" }, `Revision ${typeRevision(types.source?.revision)}${types.source?.draft ? " · draft types" : ""}`)),
    h("div", { class: "type-browser" }, choices, detail));
  draw();
}

export async function renderTypes(el, app, { onAdded = () => app.route(), onReviewPages, onOpenPage = pid => app.openPage(pid, {}, "regions") } = {}) {
  const { book, tl } = app;
  const types = tl.types || {};
  const badges = [];
  const pageButtons = new Map(), typePages = new Map();
  // A count to fill in once the book is assembled: of a type in the book (short: just the number), or of a type in
  // one place of the tree (within: the parent type, or flow:<name> at a flow's top level).
  const badge = (name, { short = false, within = "" } = {}) => {
    const b = h("span", { class: "count", dataset: { type: name, short: short ? "1" : "", within } }, "…");
    badges.push(b);
    return b;
  };

  // What may contain what, from a flow's top-level types down (a type met again on its own path is not repeated).
  const node = (name, path, within) => {
    const t = types[name];
    if (!t) return h("li", {}, h("span", { class: "tname bad" }, name), " (not in the type list)");
    const kids = t.contains || [];
    const again = path.includes(name);
    return h("li", {},
      h("span", { class: "tname", title: t.description || "" }, name), " ",
      h("span", { class: "rclass" }, t.region ? `printed as ${t.region}` : "container"), " ", badge(name, { within }),
      kids.length && !again ? h("ul", {}, ...kids.map(k => node(k, [...path, name], name))) : again ? h("span", { class: "meta" }, " (as above)") : null);
  };
  const flows = Object.entries(tl.flows || {}).map(([flow, desc]) => {
    const tops = Object.entries(types).filter(([, t]) => t.flow === flow).map(([n]) => n);
    return h("div", { class: "flowtree" }, h("h4", {}, `flow ${flow}`, h("span", { class: "meta" }, ` — ${desc}`)),
      tops.length ? h("ul", { class: "ttree" }, ...tops.map(n => node(n, [], `flow:${flow}`))) : h("p", { class: "meta" }, "No type stands at its top level."));
  });
  const furniture = Object.entries(types).filter(([, t]) => t.role === "furniture");

  const yes = v => (v ? "yes" : "");
  const table = h("table", { class: "typetable" },
    h("thead", {}, h("tr", {}, ...["type", "printed as", "may contain", "top level of", "language", "numbered", "in the book", "pages with this type", "description"].map(x => h("th", {}, x)))),
    h("tbody", {}, ...Object.entries(types).map(([name, t]) => h("tr", { class: t.role === "furniture" ? "furn" : "" },
      h("th", {}, name, book.writable ? h("button", { class: "mini", "aria-label": `Edit type ${name}`, onclick: () => editTypeDialog(app, name) }, "Edit…") : null),
      h("td", {}, t.region ? t.region + (t.role === "furniture" ? " (furniture)" : "") : "container"),
      h("td", {}, (t.contains || []).join(", ")),
      h("td", {}, t.flow || ""),
      h("td", {}, t.lang || ""),
      h("td", {}, yes(t.numbered)),
      h("td", { class: "num" }, badge(name, { short: true })),
      h("td", {}, (() => {
        const button = h("button", { class: "link", disabled: true, onclick: () => {
          const ids = typePages.get(name) || [];
          if (onReviewPages) onReviewPages(ids);
          else if (ids.length) onOpenPage(ids[0]);
        } }, "…");
        pageButtons.set(name, button);
        return button;
      })()),
      h("td", { class: "desc" }, t.description || "")))));

  const list = (obj, render) => h("ul", {}, ...Object.entries(obj).map(render));
  const download = h("button", { onclick: () => {
    const a = h("a", { href: URL.createObjectURL(new Blob([JSON.stringify(tl, null, 1) + "\n"], { type: "application/json" })), download: "types.json" });
    document.body.append(a); a.click(); a.remove();
  } }, "Download types.json");

  el.replaceChildren(h("div", { class: "typesview" },
    h("div", { class: "stylebar" }, download,
      book.writable ? h("button", { onclick: () => editBookTypesDialog(app) }, "Edit book details") : null,
      book.writable ? h("button", { onclick: () => newTypeDialog(app, onAdded) }, "＋ Type") : null),
    h("p", { class: "hint" }, `Revision ${typeRevision(tl.source?.revision)}. The type list defines this book’s units, containment, reading flows and transcription conventions. Preview a change to see its reach before applying it.`),
    app.lastTypeRevision ? h("p", { class: "box" }, `Revision ${app.lastTypeRevision.revision} saved. `,
      app.lastTypeRevision.pages.length && onReviewPages ? h("button", { onclick: () => onReviewPages(app.lastTypeRevision.pages) },
        `Review ${app.lastTypeRevision.pages.length} affected ${app.lastTypeRevision.pages.length === 1 ? "page" : "pages"}`) : null) : null,
    h("h3", {}, tl.title || tl.book_id),
    tl.description ? h("p", {}, tl.description) : null,
    (tl.languages || []).length ? h("p", { class: "meta" }, `Languages: ${tl.languages.join(", ")}`) : null,
    h("h3", {}, "What may contain what"), ...flows,
    furniture.length ? h("div", { class: "flowtree" }, h("h4", {}, "page furniture", h("span", { class: "meta" }, " — belongs to the page, not to the text")),
      h("ul", { class: "ttree" }, ...furniture.map(([n, t]) => h("li", {}, h("span", { class: "tname", title: t.description || "" }, n), " ", h("span", { class: "rclass" }, `printed as ${t.region}`), " ", badge(n))))) : null,
    h("h3", {}, "Each type"), h("div", { class: "tablewrap" }, table),
    Object.keys(tl.relations || {}).length ? [h("h3", {}, "Relations"), list(tl.relations, ([n, d]) => h("li", {}, h("b", {}, n), ` — ${d}`))] : null,
    Object.keys(tl.inline || {}).length ? [h("h3", {}, "Inline kinds"), list(tl.inline, ([n, d]) => h("li", {}, h("b", {}, n), d.formatting ? ` (printed ${d.formatting})` : "", ` — ${d.description}`))] : null,
    (tl.conventions || []).length ? [h("h3", {}, "Transcription conventions"), h("ul", {}, ...tl.conventions.map(c => h("li", {}, c)))] : null,
    tl.source?.discovery?.questions?.length ? [h("h3", {}, "Questions to review"), ...tl.source.discovery.questions.map(question => {
      const decision = tl.source.discovery.resolved_questions?.[question];
      const answer = h("textarea", { rows: 2, "aria-label": `Review decision for ${question}` }, decision?.answer || "");
      const cited = citedSamplePages(question, tl.source.discovery.sample_pages || []);
      return h("section", { class: "box" }, h("p", {}, question), ...cited.map(number => h("button", { onclick: () => {
        const page = book.pages.find(page => page.pdf_page === number); if (page) onOpenPage(page.id);
      } }, `Page ${number}`)), decision ? h("p", { class: "ok" }, `Resolved · ${decision.answer}`) : null,
      book.writable ? [answer, h("button", { onclick: () => reviewTypeChange(app, [{ kind: "resolve_question", question, answer: answer.value }]).catch(error => app.toast(error.message, "bad")) }, "Preview review decision")] : null);
    })] : null,
    h("details", {}, h("summary", {}, "Revision history"), ...(tl.source?.revisions || []).map(entry => h("p", {}, `Revision ${entry.n} · ${entry.at_utc} · ${entry.operations.map(op => `${op.kind}${op.name ? ` ${op.name}` : ""}${op.to ? ` → ${op.to}` : ""}`).join(", ")}`)),
      tl.source?.legacy_revision ? h("p", {}, tl.source.legacy_revision) : null)));

  // How many units of each type the book has (assembled across pages), and furniture regions.
  const docs = await book.all();
  if (!el.isConnected || app.book !== book || app.tl !== tl) return;
  const P = prepare(docs, tl);
  for (const doc of docs) {
    const names = new Set([...doc.page.regions.map(region => region.type), ...doc.units.map(unit => unit.type)]);
    for (const name of names) {
      if (!typePages.has(name)) typePages.set(name, []);
      typePages.get(name).push(doc.page.id);
    }
  }
  for (const [name, button] of pageButtons) {
    button.textContent = `${typePages.get(name)?.length || 0} / ${docs.length} processed pages`;
    button.disabled = !typePages.get(name)?.length;
  }
  const n = {}, at = {};
  const add = (obj, k) => { obj[k] = (obj[k] || 0) + 1; };
  for (const u of P.book.units) {
    add(n, u.type);
    for (const c of u.children) if (c.unit && P.units[c.unit]) add(at, `${u.type}>${P.units[c.unit].type}`);
  }
  for (const [flow, tops] of Object.entries(P.book.flows)) for (const uid of tops) if (P.units[uid]) add(at, `flow:${flow}>${P.units[uid].type}`);
  for (const p of P.book.pages) for (const r of p.regions) if (types[r.type]?.role === "furniture") add(n, r.type);
  for (const b of badges) {
    const { type, short, within } = b.dataset;
    const k = within ? at[`${within}>${type}`] || 0 : n[type] || 0;
    b.textContent = short ? String(k) : types[type]?.role === "furniture" ? `${k} on the pages` : within.startsWith("flow:") ? `${k} in the book` : `${k} here`;
    b.classList.toggle("zero", !k);
  }
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
