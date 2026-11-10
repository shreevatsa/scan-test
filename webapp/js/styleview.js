// The book's style sheet (schema 0.3), seen and edited: its font roles, the base style of all text, each type's
// style, and the page's text box, with a preview of a few pages set as printed that follows every change. A change
// is checked against the schema as it is made; "Save" writes it with the book (style.json in a folder, or this
// browser for a book opened by URL). Units' and line pieces' own styles are edited in the page view.

import { h, esc } from "./render.js";
import { prepare, bookHtml, fillFigures } from "./reader.js?v=20261110-partial-3";
import { baseCss } from "./style.js";

const clone = x => JSON.parse(JSON.stringify(x));
const canonical = x => JSON.stringify(x, (k, v) => (v && typeof v === "object" && !Array.isArray(v)
  ? Object.fromEntries(Object.keys(v).sort().map(key => [key, v[key]])) : v));

// The sheet without empty entries (a type with no properties, an empty page), as it is checked and saved.
function tidied(sheet) {
  const c = clone(sheet);
  for (const [k, v] of Object.entries(c.types || {})) if (!Object.keys(v).length) delete c.types[k];
  if (c.page && !Object.keys(c.page).length) delete c.page;
  return c;
}

// The properties shown for the base and each type: [key, column heading, kind or choices, what it is].
const PROPS = [
  ["font", "font", "role", "a font role (below)"],
  ["size_pt", "size", "num", "points"],
  ["leading_pt", "leading", "num", "baseline to baseline, points"],
  ["weight", "weight", ["", "normal", "bold"]],
  ["italic", "italic", ["", "no", "yes"]],
  ["align", "align", ["", "left", "center", "right", "justify"]],
  ["margin_left_pt", "left margin", "num", "every line, from the text's left edge"],
  ["indent_pt", "first line", "num", "the first line's indent from the others; negative where a number hangs out"],
  ["space_before_pt", "space above", "num", "beyond the normal line spacing"],
  ["space_after_pt", "space below", "num", ""],
];

function newSheet(book, tl) {
  return { format: "style", schema_version: "0.3", book_id: book.manifest.book_id,
           description: "Made in the web app.", fonts: { body: { family: ["serif"] } },
           base: { font: "body", size_pt: 12, leading_pt: 18, align: "justify" }, types: {} };
}

export function renderStyle(el, app) {
  const { book, tl } = app;
  el.replaceChildren();
  const view = h("div", { class: "styleview" });
  el.append(view);
  if (!book.style && !app.styleDraft) {
    view.append(h("h2", {}, "Style sheet"),
      h("p", {}, "This book has no style sheet yet. A style sheet says how each type is printed (fonts, sizes, alignment, spacing), for the reader's “as printed” view and the web-page export. Method 061 measures one from a digital PDF; here you can start from plain defaults."),
      h("button", { class: "primary", onclick: () => { app.styleDraft = newSheet(book, tl); renderStyle(el, app); } }, "Start a style sheet"));
    return;
  }
  let sheet = app.styleDraft || clone(book.style);
  app.styleDraft = sheet;
  const saved = () => !!book.style && canonical(tidied(book.style)) === canonical(tidied(sheet));

  const status = h("span", { class: "status" });
  const errorsOf = () => app.validate(tidied(sheet));
  const showStatus = () => {
    const errs = errorsOf();
    status.className = "status " + (errs.length ? "bad" : saved() ? "ok" : "warn");
    status.textContent = errs.length ? `not valid: ${errs[0]}` : saved() ? (book.kind === "folder" ? "saved with the book" : book.styleEdited ? "your version, saved in this browser" : "the book's own") : "changes not saved";
    saveBtn.disabled = !!errs.length || saved();
  };
  const changed = () => { showStatus(); schedulePreview(); };

  const saveBtn = h("button", { class: "primary", onclick: async () => {
    try { await book.saveStyle(tidied(sheet)); app.toast("Saved with the book."); renderStyle(el, app); }
    catch (e) { app.toast(`Not saved: ${e.message}`, "bad"); }
  } }, "Save");
  const discard = h("button", { onclick: () => { app.styleDraft = null; renderStyle(el, app); } }, "Discard changes");
  const download = h("button", { onclick: () => {
    const a = h("a", { href: URL.createObjectURL(new Blob([JSON.stringify(tidied(sheet), null, 1) + "\n"], { type: "application/json" })), download: "style.json" });
    document.body.append(a); a.click(); a.remove();
  } }, "Download style.json");
  const revert = book.kind === "chaya" && book.styleEdited ? h("button", { title: "forget your version kept in this browser", onclick: async () => {
    await book.revertStyle(); app.styleDraft = null; app.toast("Back to the book's own style sheet."); renderStyle(el, app);
  } }, "Back to the book's own") : null;

  // ---- fonts
  const roles = () => Object.keys(sheet.fonts || {});
  const fontRows = h("tbody");
  const drawFonts = () => {
    fontRows.replaceChildren(...roles().map(role => {
      const f = sheet.fonts[role];
      return h("tr", {},
        h("th", {}, role),
        h("td", {}, h("input", { class: "wide", value: f.family.join(", "), title: "font families in order of preference, ending with serif or sans-serif",
          onchange: e => { const fam = e.target.value.split(",").map(x => x.trim().replace(/^["']|["']$/g, "")).filter(Boolean); f.family = fam.length ? fam : ["serif"]; changed(); } })),
        h("td", {}, h("input", { class: "wide", value: f.description || "", placeholder: "what the book uses",
          onchange: e => { if (e.target.value) f.description = e.target.value; else delete f.description; changed(); } })),
        h("td", {}, h("button", { class: "mini", title: "remove this role", onclick: () => { delete sheet.fonts[role]; drawFonts(); drawTable(); changed(); } }, "✕")));
    }));
  };
  const newRole = h("input", { placeholder: "new role (such as latin)", size: 18 });
  const fonts = h("section", {}, h("h3", {}, "Font roles"),
    h("p", { class: "hint" }, "Each role is a list of font families, as in CSS. Types and units name a role; the first family installed is used."),
    h("table", { class: "fonttable" }, h("thead", {}, h("tr", {}, h("th", {}, "role"), h("th", {}, "families"), h("th", {}, "description"), h("th"))), fontRows),
    h("div", { class: "row" }, newRole, h("button", { onclick: () => {
      const name = newRole.value.trim();
      if (!/^[a-z][a-z0-9_]*$/.test(name)) { app.toast("A role's name: lower-case letters, digits and _, starting with a letter.", "warn"); return; }
      (sheet.fonts ||= {})[name] ||= { family: ["serif"] };
      newRole.value = ""; drawFonts(); drawTable(); changed();
    } }, "Add a role")));

  // ---- base and types
  const typeNames = Object.entries(tl.types).filter(([, t]) => t.role !== "furniture").map(([n]) => n);
  const table = h("table", { class: "styletable" });
  // A cell of the table: `get(create)` gives the style it edits (a type's entry is made only when a value is set).
  const cell = (get, key, kind, inherited) => {
    const v = (get(false) || {})[key];
    const set = val => {
      const target = get(true);
      if (val === "" || val === null || val === undefined || (typeof val === "number" && !Number.isFinite(val))) delete target[key];
      else target[key] = val;
      changed();
    };
    if (kind === "num") return h("input", { type: "number", step: "0.5", value: v ?? "", placeholder: inherited ?? "", onchange: e => set(e.target.value === "" ? null : +e.target.value) });
    const choices = kind === "role" ? ["", ...roles()] : kind;
    const shown = key === "italic" ? (v === true ? "yes" : v === false ? "no" : "") : v ?? "";
    const sel = h("select", { onchange: e => set(key === "italic" ? (e.target.value === "" ? null : e.target.value === "yes") : e.target.value) },
      ...choices.map(c => h("option", { value: c, selected: c === shown ? true : null }, c === "" ? (inherited !== undefined && inherited !== "" ? `(${inherited})` : "—") : c)));
    return sel;
  };
  const inheritedShown = (key) => {
    const b = (sheet.base || {})[key];
    return key === "italic" ? (b === true ? "yes" : b === false ? "no" : undefined) : b;
  };
  const drawTable = () => {
    sheet.base ||= {};
    sheet.types ||= {};
    const head = h("tr", {}, h("th", {}, ""), ...PROPS.map(([, label, , what]) => h("th", { title: what || "" }, label)));
    const baseRow = h("tr", { class: "base" }, h("th", { title: "all text, unless its type or the unit says otherwise" }, "base (all text)"),
      ...PROPS.map(([key, , kind]) => h("td", {}, cell(() => sheet.base, key, kind, undefined))));
    const rows = typeNames.map(name => {
      const get = create => (create ? (sheet.types[name] ||= {}) : sheet.types[name]);
      const desc = tl.types[name].description || "";
      const tr = h("tr", {}, h("th", { title: desc }, name, h("span", { class: "rclass" }, tl.types[name].region || "container")),
        ...PROPS.map(([key, , kind]) => h("td", {}, cell(get, key, kind, key === "align" || key === "weight" || key === "italic" || key === "font" ? inheritedShown(key) : (sheet.base || {})[key]))));
      return tr;
    });
    table.replaceChildren(h("thead", {}, head), h("tbody", {}, baseRow, ...rows));
  };
  const styles = h("section", {}, h("h3", {}, "How each type is printed"),
    h("p", { class: "hint" }, "Lengths in points of the printed page. An empty cell takes the base value (shown grey); a unit's own style, set in the page view, overrides its type."),
    h("div", { class: "tablewrap" }, table));

  // ---- page
  sheet.page ||= {};
  const box = sheet.page.text_box_pt || [0, 0, 0, 0];
  const num = (val, set, title) => h("input", { type: "number", step: "0.5", value: val ?? "", title, onchange: e => { set(e.target.value === "" ? null : +e.target.value); changed(); } });
  const setBox = i => v => { const b = sheet.page.text_box_pt || [0, 0, 0, 0]; b[i] = v ?? 0; sheet.page.text_box_pt = b; };
  const page = h("section", {}, h("h3", {}, "Page"),
    h("p", { class: "hint" }, "The text box's width is the measure the reader and the export set the text in."),
    h("div", { class: "fields" },
      h("label", {}, "page width ", num(sheet.page.width_pt, v => { if (v === null) delete sheet.page.width_pt; else sheet.page.width_pt = v; })),
      h("label", {}, "height ", num(sheet.page.height_pt, v => { if (v === null) delete sheet.page.height_pt; else sheet.page.height_pt = v; })),
      h("label", {}, "text box: left ", num(box[0], setBox(0))), h("label", {}, "top ", num(box[1], setBox(1))),
      h("label", {}, "right ", num(box[2], setBox(2))), h("label", {}, "bottom ", num(box[3], setBox(3)))));

  // ---- preview
  const startSel = h("select", { onchange: () => drawPreview() },
    ...book.pages.map(p => h("option", { value: p.id, selected: p.id === (app.stylePreviewFrom || app.pid) ? true : null }, `${p.id.replace(/^.*-page-/, "")}${p.label ? ` (p. ${p.label})` : ""}`)));
  const countSel = h("select", { onchange: () => drawPreview() }, ...[1, 2, 3, 5].map(n => h("option", { value: n, selected: n === 3 ? true : null }, `${n} page${n > 1 ? "s" : ""}`)));
  const previewBody = h("article", { class: "reader printed" });
  let timer = null;
  const schedulePreview = () => { clearTimeout(timer); timer = setTimeout(drawPreview, 150); };
  async function drawPreview() {
    app.stylePreviewFrom = startSel.value;
    const i = book.index[startSel.value], n = +countSel.value;
    const docs = (await Promise.all(book.pages.slice(i, i + n).map(p => book.current(p.id)))).filter(Boolean);
    if (errorsOf().length) return;
    const P = prepare(docs, tl, tidied(sheet));
    previewBody.innerHTML = bookHtml(P, { printed: true });
    previewBody.style.cssText = baseCss(sheet);
    fillFigures(previewBody, app, P);
  }
  const preview = h("section", { class: "preview" }, h("h3", {}, "Preview, as printed"),
    h("div", { class: "row" }, "from page ", startSel, " ", countSel), previewBody);

  view.append(
    h("div", { class: "stylebar" }, h("h2", {}, "Style sheet"), status, saveBtn, discard, download, revert),
    h("p", { class: "hint" }, sheet.description || ""),
    h("div", { class: "stylecols" }, h("div", { class: "styleedit" }, styles, fonts, page), preview));
  drawFonts();
  drawTable();
  showStatus();
  drawPreview();
}
