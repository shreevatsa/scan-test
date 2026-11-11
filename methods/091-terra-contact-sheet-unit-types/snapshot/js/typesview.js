// The book's type list (types.json): its own part of the schema. The format and its rules (schema/schema.json) are
// shared by every book; the type list says which kinds of unit this book's pages are divided into, which may
// contain which, its flows, relations, inline kinds and transcription conventions. The checks use both, and the
// prompts that find regions and transcribe pages are written from the type list. Shown here as the tree of what may
// contain what, from each flow's top level, and as a table with how many units of each type the book has.

import { h } from "./render.js";
import { prepare } from "./reader.js?v=20261111-type-overview-2";
import { typeRevision } from "./schema.js?v=20261110-reading-2";
import { editTypeDialog, editBookTypesDialog, reviewTypeChange } from "./type-operations.js?v=20261111-type-overview-2";
import { newTypeDialog, renderTypeDiscovery } from "./regionsview.js?v=20261111-type-overview-2";
import { citedSamplePages } from "./type-revisions.js?v=20261110-finders-4";

export async function renderTypeOverview(el, app) {
  const book = app.book, token = app.routeToken;
  const list = h("div"), discovery = h("div");
  app.typeOverview ||= {};
  const section = h("details", { class: "region-section", open: app.routeView === "proposal" || (app.typeOverview.open ?? !!book.types.source?.draft) },
    h("summary", {}, "Propose and compare unit types"), discovery);
  let loaded = false;
  const load = async () => {
    app.typeOverview.open = section.open;
    if (!section.open || loaded || app.book !== book || app.routeToken !== token) return;
    loaded = true;
    try {
      await renderTypeDiscovery(discovery, app, { selected: [...(app.regionOverview?.selected || [])], onBusy: value => {
        app.workflowBusy = app.header.inert = list.inert = value;
      } });
    } catch (error) { discovery.replaceChildren(h("p", { class: "bad", role: "status" }, error.message)); loaded = false; }
  };
  section.addEventListener("toggle", load);
  el.replaceChildren(h("div", { class: "stage-overview type-overview" }, h("h1", {}, "Unit types"),
    h("p", { class: "hint" }, "Define the kinds of content in this book and how they fit together. Inspect the scans, compare proposals, then continue to Regions."),
    ...(book.manifest.pdf || book.kind === "chaya" ? [section] : []), list,
    h("button", { class: "primary", onclick: () => app.setMode("regions") }, "Continue to Regions")));
  await renderTypes(list, app, { onReviewPages: ids => {
    app.pendingStageSelection = { stage: "regions", ids };
    app.setMode("regions");
  } });
  await load();
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
