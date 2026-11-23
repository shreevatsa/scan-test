import { h } from "./render.js";
import * as ops from "./ops.js?v=20261123-blocks-a";
import { REGION_CLASSES } from "./book-types.js?v=20261123-blocks-a";
import { classSelect } from "./class-labels.js?v=20261123-blocks-a";
import { editTypeDialog } from "./type-operations.js?v=20261123-blocks-a";

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

export function newTypeDialog(app, use = () => {}, printedOnly = false, prefill = {}) {
  const book = app.book;
  const dialogTitle = printedOnly ? "New region type" : "New unit type";
  const selected = app.doc?.page.regions.find(region => region.id === app.selection.region);
  const previous = selected && app.tl.types[selected.type];
  const name = h("input", { required: true, "aria-label": "New type name", placeholder: "verse_translation" });
  const description = h("textarea", { rows: 3, "aria-label": "New type description" });
  const { select: category, el: categoryField } = classSelect((printedOnly ? REGION_CLASSES : ["container", ...REGION_CLASSES]).filter(value => value !== "other"), previous?.region || "paragraph", "Draw regions like");
  // A type a finder proposed arrives with its name and, where known, its definition and class.
  if (prefill.name) name.value = prefill.name;
  if (prefill.description) description.value = prefill.description;
  if (prefill.region && [...category.options].some(option => option.value === prefill.region)) category.value = prefill.region;
  const furniture = h("input", { type: "checkbox", checked: prefill.furniture ?? previous?.role === "furniture", "aria-label": "Page furniture" });
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
    h("label", {}, "Draw regions like: ", categoryField), children, h("label", {}, furniture, " Page furniture"),
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

// A region a finder could not give a type, selected on the scan: choose its type to add it to the page.
export function omittedInspector(el, app, index) {
  const omitted = app.doc.source?.omitted_regions?.[index];
  if (!omitted) return;
  if (!omitted.box) { el.append(h("p", {}, "This older record has no saved box. Draw the region on the scan to restore it.")); return; }
  const choose = regionTypeSelect(app, "", type => app.recoverOmitted(index, type));
  choose.prepend(h("option", { value: "", selected: true, disabled: true }, "Choose its type…"));
  el.append(h("h3", {}, `Unassigned region ${omitted.region}`), h("p", {}, "Choose a type to add this outlined region to the page."), choose);
}

// What can be done to a region: its type, box, split, merge, reading order, outlines and deletion (the page editor's
// region inspector). A region's continuation flags are not offered: the page editor sets a unit's open ends instead.
export function regionTools(app, region) {
  const { doc } = app, out = [];
  const box = region.box || ops.boxesOf({ page: { regions: [region] } })[0];
  const coords = box.map((value, index) => h("input", { type: "number", required: true, min: 0,
    max: index % 2 ? doc.page.height : doc.page.width, value, "aria-label": ["Left", "Top", "Right", "Bottom"][index] }));
  const furniture = app.tl.types[region.type]?.role === "furniture";
  out.push(...[regionTypeSelect(app, region.type, type => app.retypeRegion(region.id, type)),
    app.tl.types[region.type]?.description ? h("p", { class: "desc" }, app.tl.types[region.type].description) : null,
    h("div", { class: "actions" }, h("button", { onclick: () => app.setRegionView("types", region.type) }, "Examples of this type"),
      app.book.writable ? h("button", { onclick: () => editTypeDialog(app, region.type) }, "Edit type…") : null),
    h("div", { class: "actions region-order" }, h("span", { class: "meta" }, furniture ? "Page furniture: not in the reading order" : "Reading order: "),
      h("button", { disabled: furniture, onclick: () => app.edit(next => ops.moveRegionOrder(next, app.tl, region.id, -1)) }, "Earlier"),
      h("button", { disabled: furniture, onclick: () => app.edit(next => ops.moveRegionOrder(next, app.tl, region.id, 1)) }, "Later")),
    h("div", { class: "region-coordinates" }, ...coords), h("button", { onclick: () => {
      if (!coords.every(input => input.reportValidity())) return;
      if (app.edit(next => ops.setBox(next, region.id, coords.map(input => Number(input.value))))) app.recompute();
    } }, "Set box")].filter(Boolean));
  const split = h("select", { "aria-label": "Split before line piece" }, ...(region.lines || []).slice(1).map((line, index) => h("option", { value: index + 1 }, `Before piece ${index + 2}${line.text ? ` · ${line.text.slice(0, 30)}` : ""}`)));
  const merge = h("select", { "aria-label": "Region to merge" }, ...doc.page.regions.filter(value => value.id !== region.id && value.type === region.type)
    .map(value => h("option", { value: value.id }, value.id)));
  out.push(h("div", { class: "actions" }, split, h("button", { disabled: (region.lines || []).length < 2, onclick: () => {
    if (app.edit(next => { const id = ops.splitRegionAt(next, region.id, Number(split.value)); app.selection = { region: id }; })) app.recompute();
  } }, "Split region")), h("div", { class: "actions" }, merge, h("button", { disabled: !merge.options.length, onclick: () => {
    if (app.edit(next => ops.mergeRegions(next, app.tl, region.id, merge.value))) app.recompute();
  } }, "Merge regions")), h("div", { class: "actions" }, h("button", { onclick: () => app.recompute() }, "Recompute outlines"),
  h("button", { class: "danger", onclick: () => {
    if (app.edit(next => { ops.deleteRegion(next, region.id); app.selection = {}; })) app.recompute();
  } }, "Delete region")));
  return out;
}
