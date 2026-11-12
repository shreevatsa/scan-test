import { suggestionButton } from "./review-view.js?v=20261111-cross-page-carbon-2";
import { typeRevision } from "./schema.js?v=20261110-reading-2";
import { h, esc, lineHtml } from "./render.js";
import * as ops from "./ops.js?v=20261110-finders-4";
import { orderedRegions, regionFlags } from "./flags.js?v=20261112-quiet-1";
import { REGION_CLASSES } from "./book-types.js?v=20261110-finders-4";
import { typeSetup } from "./type-setup.js?v=20261112-library-1";
import { pageSelectionText } from "./page-browser.js?v=20261110-reading-2";
import { sha256hex } from "./chayapdf.js";
import { reviewTypeChange, editTypeDialog } from "./type-operations.js?v=20261111-type-overview-4";

export function regionTypeSelect(app, current, changed, rid = null) {
  const select = h("select", { "aria-label": "Region type", onchange: async () => {
    if (select.value === "+new") {
      select.value = current;
      await newTypeDialog(app, changed, true);
    } else changed(select.value);
  } }, ...Object.entries(app.tl.types).filter(([, type]) => type.region).map(([name, type]) =>
    h("option", { value: name, selected: name === current }, `${name}${type.role === "furniture" ? " (furniture)" : ""}`)),
    h("option", { value: "+new", disabled: !app.book.writable }, "New type…"));
  if (rid) select.addEventListener("focus", () => { if (app.selection.region !== rid) app.select({ region: rid }); });
  return select;
}

export function newTypeDialog(app, use = () => {}, printedOnly = false) {
  const book = app.book;
  const dialogTitle = printedOnly ? "New region type" : "New unit type";
  const selected = app.doc?.page.regions.find(region => region.id === app.selection.region);
  const previous = selected && app.tl.types[selected.type];
  const name = h("input", { required: true, "aria-label": "New type name", placeholder: "verse_translation" });
  const description = h("textarea", { rows: 3, "aria-label": "New type description" });
  const category = h("select", { "aria-label": "Printed region class" }, ...(printedOnly ? REGION_CLASSES : ["container", ...REGION_CLASSES]).map(value =>
    h("option", { value, selected: value === (previous?.region || "paragraph") }, value)));
  const furniture = h("input", { type: "checkbox", checked: previous?.role === "furniture", "aria-label": "Page furniture" });
  const childChoices = Object.entries(app.tl.types).filter(([, type]) => type.role !== "furniture").map(([child], index) => ({
    child, box: h("input", { type: "checkbox", checked: index === 0, "aria-label": `May contain ${child}` })
  }));
  const children = h("fieldset", { hidden: true }, h("legend", {}, "May contain"), ...childChoices.map(({ child, box }) => h("label", { class: "type-child-choice" }, box, " ", child)));
  const location = h("select", { "aria-label": "New type’s parent or flow" },
    ...Object.keys(app.tl.flows).map(flow => h("option", { value: `flow:${flow}` }, `Reading flow · ${flow}`)),
    ...Object.entries(app.tl.types).filter(([, type]) => Array.isArray(type.contains)).map(([parent]) =>
      h("option", { value: `parent:${parent}` }, `Inside · ${parent}`)));
  const owner = selected && ops.ownerOf(app.doc, selected.id);
  const parent = owner && ops.placeOf(app.doc, owner.id)?.parent;
  if (parent) location.value = `parent:${parent.type}`;
  location.disabled = furniture.checked;
  const status = h("p", { class: "bad", role: "status" });
  const close = h("button", { type: "button", onclick: () => dialog.close() }, "Cancel");
  const save = h("button", { type: "submit", class: "primary" }, "Add type");
  const fields = h("fieldset", {}, h("label", {}, "Name ", name), h("label", {}, "Description ", description),
    h("label", {}, "Printed as ", category), children, h("label", {}, furniture, " Page furniture"),
    h("label", {}, "Place in the book ", location));
  furniture.onchange = () => { location.disabled = furniture.checked; };
  category.onchange = () => {
    if (category.value === "container") furniture.checked = false;
    furniture.disabled = category.value === "container";
    children.hidden = category.value !== "container";
    location.disabled = furniture.checked;
  };
  const form = h("form", { onsubmit: async event => {
    event.preventDefault(); fields.disabled = save.disabled = close.disabled = true;
    try {
      const value = location.value;
      await book.addType({ name: name.value, description: description.value, region: category.value,
        furniture: furniture.checked, parent: value.startsWith("parent:") ? value.slice(7) : null,
        flow: value.startsWith("flow:") ? value.slice(5) : null, contains: childChoices.filter(value => value.box.checked).map(value => value.child) }, types => app.validate(types));
      if (app.book === book) {
        app.syncTypes();
        await use(name.value.trim());
        app.regionTypePanel?.refresh();
        if (app.mode === "page") await app.refresh();
      }
      dialog.close();
    } catch (error) { status.textContent = error.message; }
    finally { fields.disabled = save.disabled = close.disabled = false; location.disabled = furniture.checked; }
  } }, h("h2", {}, dialogTitle), fields, h("p", { class: "hint" }, "Adds one type to the book’s next revision."), status, h("div", { class: "actions" }, save, close));
  const dialog = h("dialog", { class: "type-dialog", "aria-label": dialogTitle }, form);
  document.body.append(dialog);
  dialog.addEventListener("close", () => dialog.remove(), { once: true });
  dialog.showModal();
  name.focus();
}

export function regionTypesPanel(app, editTypes) {
  const list = h("div", { class: "region-type-list" });
  const legend = h("div", { class: "region-type-legend", "aria-label": "Region types on this page" });
  const status = h("p", { class: "hint" });
  const element = h("aside", { class: "region-types" }, h("h3", {}, "On this page"), legend,
    h("details", {}, h("summary", {}, "All book types"), status, list),
    h("div", { class: "actions" }, h("button", { disabled: !app.book.writable, onclick: () => newTypeDialog(app) }, "＋ Type"),
      h("button", { onclick: editTypes }, "Edit type list")));
  const refresh = () => {
    const counts = new Map();
    for (const [pid, state] of app.pageStates) for (const region of (app.mode === "page" && app.pid === pid ? app.doc : state.doc)?.page.regions || [])
      counts.set(region.type, (counts.get(region.type) || 0) + 1);
    status.textContent = `${app.tl.source?.draft ? "Draft type list · " : ""}Revision ${typeRevision(app.tl.source?.revision)}`;
    const shortcuts = Object.entries(app.tl.types).filter(([, type]) => type.region).map(([name]) => name);
    const pageCounts = new Map();
    for (const region of app.doc?.page.regions || []) pageCounts.set(region.type, (pageCounts.get(region.type) || 0) + 1);
    legend.replaceChildren(...[...pageCounts].map(([name, count]) => h("div", { class: "region-type-row", title: app.tl.types[name]?.description,
      onpointerenter: () => app.doc.page.regions.filter(region => region.type === name).forEach(region => app.hoverRegion(region.id, true)),
      onpointerleave: () => app.doc.page.regions.filter(region => region.type === name).forEach(region => app.hoverRegion(region.id, false)),
    }, h("i", { style: `background:${app.colors[name] || "#888"}` }),
      h("button", { class: "link", onclick: () => app.setRegionView("types", name), "aria-label": `Review examples of ${name}` }, name),
      shortcuts.indexOf(name) >= 0 && shortcuts.indexOf(name) < 9 ? h("kbd", { title: `Type shortcut ${shortcuts.indexOf(name) + 1}` }, shortcuts.indexOf(name) + 1) : null,
      h("span", { class: "meta", "aria-label": `${count} ${count === 1 ? "region" : "regions"}` }, count))));
    if (!pageCounts.size) legend.append(h("p", { class: "hint" }, "Draw or find regions to see their types here."));
    list.replaceChildren(...Object.entries(app.tl.types).map(([name, type]) =>
      h("div", { class: "region-type-row", title: type.description || "" },
        h("i", { style: `background:${app.colors[name] || "#888"}` }), h("span", {}, name),
        ...(app.mode === "page" && shortcuts.indexOf(name) >= 0 && shortcuts.indexOf(name) < 9 ? [h("kbd", { title: `Type shortcut ${shortcuts.indexOf(name) + 1}` }, shortcuts.indexOf(name) + 1)] : []),
        h("span", { class: "meta" }, type.region ? `${counts.get(name) || 0}` : "container"))));
  };
  if (app.mode === "page") element.append(h("p", { class: "hint" }, "Select a region on the scan. Keys 1–9 choose its type. Tab selects the next region, Shift+Tab the previous."));
  refresh();
  return { element, refresh };
}

export class RegionsPanel {
  constructor(el, app) {
    this.el = el; this.app = app; this.lastSel = null;
    el.addEventListener("click", event => { if (event.target === el) app.select({}); });
  }
  selectionInfo() { return null; }
  placeCaret() {}
  format() {}
  render() {
    const app = this.app, scroll = this.el.scrollTop;
    const regions = orderedRegions(app.doc, app.tl);
    const idWidth = regions.reduce((width, region) => Math.max(width, region.id.length), 3);
    this.el.style.setProperty("--region-id-width", `${idWidth}ch`);
    const cards = regions.map(region => {
      const card = h("section", { class: "region", dataset: { rid: region.id }, style: `border-left-color:${app.colors[region.type] || "#888"}`,
        onpointerenter: () => app.hoverRegion(region.id, true), onpointerleave: () => app.hoverRegion(region.id, false),
      }, h("div", { class: "fields" }, h("button", { class: "link region-select", onclick: () => app.select({ region: region.id }), "aria-label": `Select region ${region.id}` }, region.id),
          regionTypeSelect(app, region.type, type => app.retypeRegion(region.id, type), region.id),
          h("span", { class: "meta region-position" }, Number.isFinite(region.order) ? `Position ${region.order}` : "Page furniture"),
          h("button", { onclick: () => app.edit(doc => ops.moveRegionOrder(doc, app.tl, region.id, -1)), disabled: app.tl.types[region.type]?.role === "furniture" }, "Earlier"),
          h("button", { onclick: () => app.edit(doc => ops.moveRegionOrder(doc, app.tl, region.id, 1)), disabled: app.tl.types[region.type]?.role === "furniture" }, "Later")));
      const text = h("div", { class: "rtext readonly", dataset: { rid: region.id }, "aria-label": `${region.id} transcription, read only` });
      if (region.lines?.some(line => typeof line.text === "string")) {
        for (const [index, line] of region.lines.entries()) text.append(h("div", { class: "lp", dataset: { i: index },
          html: line.text === undefined ? '<span class="hint">Text pending</span>' : lineHtml(line.text, line.spans || [], marker => `<sup>${esc(marker.marker)}</sup>`) }));
      }
      if (text.childNodes.length) card.append(text);
      return card;
    });
    const omitted = (app.doc.source?.omitted_regions || []).map((region, index) => h("p", { class: "box warn" },
      `${region.region} · unassigned type `, h("button", { onclick: () => app.select({ omitted: index }) }, "Give it a type")));
    const flags = regionFlags(app.doc, app.tl, app.regionFlagContext(app.doc));
    this.el.replaceChildren(
      ...(flags.length ? [h("details", { class: "region-review-flags" }, h("summary", {}, `${flags.length} review flags`),
        ...flags.map(flag => h("p", {}, h("button", { class: "link", onclick: () => flag.region && app.select({ region: flag.region }) }, flag.message))))] : []),
      ...cards, ...omitted);
    this.el.scrollTop = scroll;
    this.markSelection();
  }
  markSelection() {
    let selected = null;
    for (const card of this.el.querySelectorAll(".region")) {
      const on = card.dataset.rid === this.app.selection.region;
      card.classList.toggle("sel", on);
      if (on) selected = card;
    }
    return selected;
  }
  highlightRegion(rid, on, reveal = false) {
    const card = this.el.querySelector(`.region[data-rid="${CSS.escape(rid)}"]`);
    card?.classList.toggle("hl", on);
    if (card && on && reveal) card.scrollIntoView({ block: "nearest" });
  }
}

export function renderRegionInspector(el, app) {
  const { doc, selection } = app;
  el.hidden = !selection.region && selection.omitted === undefined && !Object.keys(doc.source?.suggestions || {}).length;
  el.replaceChildren();
  el.append(suggestionButton(app, doc.page.id));
  if (selection.omitted !== undefined) {
    const omitted = doc.source?.omitted_regions?.[selection.omitted];
    if (!omitted) return;
    if (!omitted.box) { el.append(h("p", {}, "This older record has no saved box. Draw the region on the scan to restore it.")); return; }
    const choose = regionTypeSelect(app, "", type => app.recoverOmitted(selection.omitted, type));
    choose.prepend(h("option", { value: "", selected: true, disabled: true }, "Choose its type…"));
    el.append(h("h3", {}, `Unassigned region ${omitted.region}`), h("p", {}, "Choose a type to add this outlined region to the page."), choose);
    return;
  }
  const region = doc.page.regions.find(value => value.id === selection.region);
  if (!region) return;
  const box = region.box || ops.boxesOf({ page: { regions: [region] } })[0];
  const coords = box.map((value, index) => h("input", { type: "number", required: true, min: 0,
    max: index % 2 ? doc.page.height : doc.page.width, value, "aria-label": ["Left", "Top", "Right", "Bottom"][index] }));
  el.append(...[h("h3", {}, `Region ${region.id}`), regionTypeSelect(app, region.type, type => app.retypeRegion(region.id, type)),
    app.tl.types[region.type]?.description ? h("p", { class: "desc" }, app.tl.types[region.type].description) : null,
    h("div", { class: "actions" }, h("button", { onclick: () => app.setRegionView("types", region.type) }, "Examples of this type"),
      app.book.writable ? h("button", { onclick: () => editTypeDialog(app, region.type) }, "Edit type…") : null),
    h("div", { class: "region-coordinates" }, ...coords), h("button", { onclick: () => {
      if (!coords.every(input => input.reportValidity())) return;
      if (app.edit(next => ops.setBox(next, region.id, coords.map(input => Number(input.value))))) app.recompute();
    } }, "Set box")].filter(Boolean));
  for (const [flag, label] of [["continues_from_earlier", "Continued from the previous page"], ["continues_later", "Continues on the next page"]])
    el.append(h("label", { class: "region-continuation" }, h("input", { type: "checkbox", checked: !!region.source?.[flag], onchange: event => app.edit(next => {
      const target = ops.regionById(next, region.id); target.source = { ...target.source, [flag]: event.target.checked };
    }) }), ` ${label}`));
  const split = h("select", { "aria-label": "Split before line piece" }, ...(region.lines || []).slice(1).map((line, index) => h("option", { value: index + 1 }, `Before piece ${index + 2}${line.text ? ` · ${line.text.slice(0, 30)}` : ""}`)));
  const merge = h("select", { "aria-label": "Region to merge" }, ...doc.page.regions.filter(value => value.id !== region.id && value.type === region.type)
    .map(value => h("option", { value: value.id }, value.id)));
  el.append(h("div", { class: "actions" }, split, h("button", { disabled: (region.lines || []).length < 2, onclick: () => {
    if (app.edit(next => { const id = ops.splitRegionAt(next, region.id, Number(split.value)); app.selection = { region: id }; })) app.recompute();
  } }, "Split region")), h("div", { class: "actions" }, merge, h("button", { disabled: !merge.options.length, onclick: () => {
    if (app.edit(next => ops.mergeRegions(next, app.tl, region.id, merge.value))) app.recompute();
  } }, "Merge regions")), h("div", { class: "actions" }, h("button", { onclick: () => app.recompute() }, "Recompute outlines"),
  h("button", { class: "danger", onclick: () => {
    if (app.edit(next => { ops.deleteRegion(next, region.id); app.selection = {}; })) app.recompute();
  } }, "Delete region")));
}

export async function renderTypeDiscovery(el, app, { selected, onBusy }) {
  const book = app.book, token = app.routeToken;
  el.replaceChildren(h("p", { class: "loading" }, "Opening the source PDF for type discovery…"));
  const index = await (await fetch(new URL("../types/index.json", import.meta.url))).json();
  const title = h("input", { value: book.title, dataset: { edited: "1" } });
  const bookId = h("input", { value: book.manifest.book_id, dataset: { edited: "1" } });
  const description = h("textarea", { rows: 3, "aria-label": "Description of this book" }, book.types.description || "");
  description.addEventListener("input", () => { description.dataset.edited = "1"; });
  const setup = typeSetup({ app, title, bookId, description, index, book, initialSource: "discover", onBusy: value => {
    onBusy(value);
    description.disabled = value;
    apply.disabled = value || !book.writable;
  } });
  const pdf = await book.pdf();
  const sha = book.manifest.pdf?.sha256 || await sha256hex(await book.originalPdf());
  await setup.usePdf({ doc: pdf, sha });
  if (app.book !== book || app.routeToken !== token) return;
  if (selected.length) {
    const field = setup.element.querySelector('[aria-label="Sample PDF pages"]');
    field.value = pageSelectionText(selected.map(pid => book.page(pid).pdf_page || book.index[pid] + 1), pdf.numPages);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  }
  const status = h("p", { role: "status" });
  const apply = h("button", { class: "primary", disabled: !book.writable, onclick: async () => {
    apply.disabled = true;
    try {
      await reviewTypeChange(app, [{ kind: "replace", types: await setup.loadTypes() }]);
    } catch (error) { status.textContent = error.message; }
    finally { apply.disabled = !book.writable; }
  } }, "Preview replacing the type list");
  el.replaceChildren(h("div", {},
    h("p", { class: "hint" }, "Review the proposal before replacing the list. You can replace the list while the book’s page layers are unprotected."),
    h("label", { class: "stack" }, "Description of the book ", description), setup.element, status,
    h("div", { class: "actions" }, apply)));
}
