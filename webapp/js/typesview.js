// The book's type list (types.json): its own part of the schema. The format and its rules (schema/schema.json) are
// shared by every book; the type list says which kinds of unit this book's pages are divided into, which may
// contain which, its flows, relations, inline kinds and transcription conventions. The checks use both, and the
// prompts that find regions and transcribe pages are written from the type list. Shown here as the tree of what may
// contain what, from each flow's top level, and as a table with how many units of each type the book has.

import { h } from "./render.js";
import { prepare } from "./reader.js";

export async function renderTypes(el, app) {
  const { book, tl } = app;
  const types = tl.types || {};
  const badges = [];
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
    h("thead", {}, h("tr", {}, ...["type", "printed as", "may contain", "top level of", "language", "numbered", "in the book", "description"].map(x => h("th", {}, x)))),
    h("tbody", {}, ...Object.entries(types).map(([name, t]) => h("tr", { class: t.role === "furniture" ? "furn" : "" },
      h("th", {}, name),
      h("td", {}, t.region ? t.region + (t.role === "furniture" ? " (furniture)" : "") : "container"),
      h("td", {}, (t.contains || []).join(", ")),
      h("td", {}, t.flow || ""),
      h("td", {}, t.lang || ""),
      h("td", {}, yes(t.numbered)),
      h("td", { class: "num" }, badge(name, { short: true })),
      h("td", { class: "desc" }, t.description || "")))));

  const list = (obj, render) => h("ul", {}, ...Object.entries(obj).map(render));
  const download = h("button", { onclick: () => {
    const a = h("a", { href: URL.createObjectURL(new Blob([JSON.stringify(tl, null, 1) + "\n"], { type: "application/json" })), download: "types.json" });
    document.body.append(a); a.click(); a.remove();
  } }, "Download types.json");

  el.replaceChildren(h("div", { class: "typesview" },
    h("div", { class: "stylebar" }, h("h2", {}, "Types"), download),
    h("p", { class: "hint" }, "The book's type list is its own part of the schema: the kinds of unit its pages are divided into, which may contain which, its flows and relations. The format and its rules (schema/schema.json) are the same for every book. The checks use both, and the prompts that find regions and transcribe pages are written from this list. It is shown here, not edited; it was written for this book by looking at its pages",
      tl.source ? ` (${typeof tl.source === "string" ? tl.source : Object.values(tl.source).join(", ")})` : "", "."),
    h("h3", {}, tl.title || tl.book_id),
    tl.description ? h("p", {}, tl.description) : null,
    (tl.languages || []).length ? h("p", { class: "meta" }, `Languages: ${tl.languages.join(", ")}`) : null,
    h("h3", {}, "What may contain what"), ...flows,
    furniture.length ? h("div", { class: "flowtree" }, h("h4", {}, "page furniture", h("span", { class: "meta" }, " — belongs to the page, not to the text")),
      h("ul", { class: "ttree" }, ...furniture.map(([n, t]) => h("li", {}, h("span", { class: "tname", title: t.description || "" }, n), " ", h("span", { class: "rclass" }, `printed as ${t.region}`), " ", badge(n))))) : null,
    h("h3", {}, "Each type"), h("div", { class: "tablewrap" }, table),
    Object.keys(tl.relations || {}).length ? [h("h3", {}, "Relations"), list(tl.relations, ([n, d]) => h("li", {}, h("b", {}, n), ` — ${d}`))] : null,
    Object.keys(tl.inline || {}).length ? [h("h3", {}, "Inline kinds"), list(tl.inline, ([n, d]) => h("li", {}, h("b", {}, n), d.formatting ? ` (printed ${d.formatting})` : "", ` — ${d.description}`))] : null,
    (tl.conventions || []).length ? [h("h3", {}, "Transcription conventions"), h("ul", {}, ...tl.conventions.map(c => h("li", {}, c)))] : null));

  // How many units of each type the book has (assembled across pages), and furniture regions.
  const docs = await book.all();
  if (app.mode !== "types") return;
  const P = prepare(docs, tl);
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
