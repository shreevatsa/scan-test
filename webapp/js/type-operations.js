import { h } from "./render.js";
import { checkPage } from "./schema.js?v=20261110-reading-2";
import { REGION_CLASSES } from "./book-types.js?v=20261110-finders-4";
import { pageSelectionText } from "./page-browser.js?v=20261110-reading-2";
import { money } from "./reader-controls.js?v=20261112-library-2";

const labels = { description: "Edit description", rename: "Rename type", merge: "Merge into another type", split: "Split into a second type", rules: "Change containment or flow", class: "Change printed class", remove: "Remove unused type" };
const quantity = (n, name) => `${n} ${name}${n === 1 ? "" : "s"}`;

export async function reviewTypeChange(app, operations, { applied = () => {} } = {}) {
  if (app.workflowBusy || app.outlineBusy || app.maker?.processing) throw new Error("Wait for the active operation before revising types.");
  await app.flush();
  if (app.dirty) throw new Error("Save this page before revising the type list.");
  const book = app.book, options = { validate: app.validate, check: (doc, types) => checkPage(app.validate, doc, types)[0] };
  const content = h("div", {}, h("p", {}, "Checking the reach of this revision…"));
  const status = h("p", { role: "status", class: "bad" });
  const cancel = h("button", { onclick: () => dialog.close() }, "Cancel");
  const apply = h("button", { class: "primary", disabled: true }, "Apply revision");
  const dialog = h("dialog", { class: "type-dialog revision-dialog", "aria-label": "Review type-list revision" },
    h("h2", {}, "Review type-list revision"), content, status, h("div", { class: "actions" }, apply, cancel));
  document.body.append(dialog); dialog.showModal();
  dialog.addEventListener("close", () => dialog.remove(), { once: true });
  dialog.addEventListener("cancel", event => { if (apply.disabled && cancel.disabled) event.preventDefault(); });
  let plan;
  try {
    plan = await book.previewTypes(operations, options);
    if (!dialog.open) return;
    content.replaceChildren(h("p", {}, `Revision ${plan.revision} · ${operations.map(op => labels[op.kind] || { add: "Add type", metadata: "Book details and conventions", replace: "Replace the whole list", resolve_question: "Record a review decision" }[op.kind]).join(", ")}`),
      h("p", {}, `${quantity(plan.regions, "region")} and ${quantity(plan.units, "unit")} on ${quantity(plan.pages.length, "page")} use the affected types.`),
      h("p", {}, `${quantity(plan.changes.filter(change => change.kind === "model").length, "model page")}, ${quantity(plan.changes.filter(change => change.kind === "edit").length, "saved correction")} and ${quantity(plan.changes.filter(change => change.kind === "draft").length, "draft")} will be updated.`));
    for (const op of operations) {
      if (op.name) content.append(h("p", {}, h("b", {}, op.kind === "split" ? `${op.from} → ${op.name}` : op.to ? `${op.name} → ${op.to}` : op.name)));
      for (const [field, label] of Object.entries({ title: "Title", description: "Description", languages: "Languages", conventions: "Transcription conventions", contains: "May contain", flow: "Reading flow", region: "Printed class", question: "Review question", answer: "Decision" })) {
        if (op[field] === undefined) continue;
        const value = Array.isArray(op[field]) ? op[field].join("\n") : op[field];
        content.append(h("p", { class: "revision-detail" }, h("b", {}, label), " · ", value || (field === "flow" ? "Inside another unit" : "(empty)")));
      }
      if (op.kind === "replace") content.append(h("p", {}, h("b", {}, "New type list"), " · ", Object.keys(plan.types.types).join(", ")));
    }
    const numbers = ids => pageSelectionText(ids.map(pid => book.page(pid).pdf_page || book.index[pid] + 1), book.manifest.pdf?.page_count || book.pages.length);
    if (plan.pages.length) content.append(h("p", {}, `Affected PDF pages ${numbers(plan.pages)}.`));
    if (operations.some(op => op.kind === "split")) content.append(h("p", {}, "Retype the appropriate regions on these pages or find their regions again."));
    if (operations.some(op => op.kind === "replace")) content.append(h("p", { class: "box warn" }, "This replaces the type list and clears the listed page documents. Their previous versions are retained in the revision history."));
    if (operations.some(op => op.kind === "merge")) content.append(h("p", {}, "Merged uses take the target type’s existing style when one is defined."));
    if (plan.find.length) content.append(h("p", {}, `Find regions again on ${quantity(plan.find.length, "page")} (${numbers(plan.find)}).`));
    if (plan.complete.length) content.append(h("p", {}, `Complete provisional units on ${quantity(plan.complete.length, "page")} (${numbers(plan.complete)}). Existing transcription is reused.`));
    if (plan.manual.length) content.append(h("p", { class: "box warn" }, `Protected units need manual review on ${quantity(plan.manual.length, "page")} (${numbers(plan.manual)}).`));
    if (plan.invalid.length) content.append(h("details", {}, h("summary", {}, `${plan.invalid.length} page versions need repair`),
      ...plan.invalid.map(item => h("p", {}, `Page ${book.index[item.page] + 1}, ${item.kind} · ${item.errors.join(" · ")}`))));
    const ledger = await book.readWork("work/reader-lab/ledger.json"), choices = await book.getReaderOptions();
    let estimate = 0;
    for (const [stage, profile, count] of [["regions", "terra-regions", plan.find.length], ["structure", choices.structurer, plan.complete.length]]) {
      if (!count) continue;
      const calls = (ledger?.calls || []).filter(call => call.stage === stage && (!profile || call.profile === profile) && call.status === "completed" && Number.isFinite(call.cost_usd));
      if (!calls.length) { estimate = null; break; }
      estimate += count * calls.reduce((sum, call) => sum + call.cost_usd, 0) / calls.length;
    }
    content.append(h("p", { class: "hint" }, `Estimated subsequent model work ${estimate === null ? "unavailable until completed samples exist" : money(estimate, 2)}. Applying the revision saves the book locally.`));
    apply.disabled = false;
    apply.onclick = async () => {
      apply.disabled = cancel.disabled = true; app.workflowBusy = true;
      try {
        const saved = await book.saveTypes(plan.types, operations, { ...options, expected: plan.token });
        await app.afterTypesSaved(saved);
        dialog.close(); await applied(saved);
      } catch (error) {
        status.textContent = error.message;
        try {
          await book.recoverStages();
          if (JSON.stringify(book.types) === JSON.stringify(plan.types)) {
            await app.afterTypesSaved(plan); dialog.close(); await applied(plan);
          }
        } catch (recovery) { status.textContent = `${error.message} Recovery also needs a retry. ${recovery.message}`; }
      }
      finally { app.workflowBusy = false; apply.disabled = cancel.disabled = false; }
    };
  } catch (error) { status.textContent = error.message; }
  return plan;
}

export function editTypeDialog(app, name) {
  const type = app.tl.types[name];
  const operation = h("select", { "aria-label": "Type-list operation" }, ...Object.entries(labels).filter(([kind]) => (type.region || !["split", "class"].includes(kind)) && (type.role !== "furniture" || kind !== "rules"))
    .map(([kind, label]) => h("option", { value: kind }, label)));
  const fields = h("div"), status = h("p", { role: "status", class: "bad" });
  let collect;
  const draw = () => {
    const kind = operation.value;
    fields.replaceChildren();
    if (kind === "description") {
      const description = h("textarea", { rows: 4, "aria-label": "Type description" }, type.description || "");
      fields.append(h("label", {}, "Description ", description)); collect = () => ({ kind, name, description: description.value });
    } else if (kind === "rename") {
      const to = h("input", { required: true, "aria-label": "New type name" });
      fields.append(h("label", {}, "New name ", to)); collect = () => ({ kind, name, to: to.value.trim() });
    } else if (kind === "merge") {
      const to = h("select", { "aria-label": "Merge target" }, ...Object.entries(app.tl.types).filter(([other, value]) => other !== name && value.region === type.region && (value.role === "furniture") === (type.role === "furniture"))
        .map(([other]) => h("option", { value: other }, other)));
      fields.append(h("label", {}, "Target type ", to)); collect = () => ({ kind, name, to: to.value });
    } else if (kind === "split") {
      const newName = h("input", { required: true, "aria-label": "New type name" });
      const description = h("textarea", { rows: 3, "aria-label": "New type description" });
      const parent = Object.entries(app.tl.types).find(([, value]) => value.contains?.includes(name))?.[0];
      fields.append(h("label", {}, "New type name ", newName), h("label", {}, "Description ", description), h("p", {}, `The second type starts with ${name}’s printed class and place in the book. Choose which regions use it after saving.`));
      collect = () => ({ kind, from: name, name: newName.value.trim(), description: description.value, region: type.region, furniture: type.role === "furniture", parent, flow: type.flow });
    } else if (kind === "rules") {
      const flow = h("select", { "aria-label": "Top-level reading flow" }, h("option", { value: "" }, "Inside another unit"),
        ...Object.keys(app.tl.flows).map(value => h("option", { value, selected: type.flow === value }, value)));
      const choices = Object.entries(app.tl.types).filter(([, value]) => value.role !== "furniture").map(([child]) => {
        const box = h("input", { type: "checkbox", checked: type.contains?.includes(child), "aria-label": `May contain ${child}` });
        return { child, box };
      });
      fields.append(h("label", {}, "Top level of ", flow), h("fieldset", {}, h("legend", {}, "May contain"), ...choices.map(({ child, box }) => h("label", { class: "type-child-choice" }, box, " ", child))));
      collect = () => ({ kind, name, flow: flow.value, contains: choices.filter(value => value.box.checked).map(value => value.child) });
    } else if (kind === "class") {
      const region = h("select", { "aria-label": "Printed region class" }, ...REGION_CLASSES.map(value => h("option", { value, selected: value === type.region }, value)));
      fields.append(h("label", {}, "Printed as ", region)); collect = () => ({ kind, name, region: region.value });
    } else {
      fields.append(h("p", {}, "The preview checks all model pages, saved corrections and drafts for uses of this type."));
      collect = () => ({ kind, name });
    }
  };
  operation.onchange = draw; draw();
  const form = h("form", { onsubmit: async event => {
    event.preventDefault();
    const op = collect();
    try { dialog.close(); await reviewTypeChange(app, [op]); } catch (error) { app.toast(error.message, "bad"); }
  } }, h("h2", {}, name), operation, fields, status, h("div", { class: "actions" }, h("button", { type: "submit", class: "primary" }, "Preview change"),
    h("button", { type: "button", onclick: () => dialog.close() }, "Cancel")));
  const dialog = h("dialog", { class: "type-dialog", "aria-label": "Edit type" }, form);
  document.body.append(dialog); dialog.showModal();
  dialog.addEventListener("close", () => dialog.remove(), { once: true });
}

export function editBookTypesDialog(app) {
  const title = h("input", { required: true, value: app.tl.title, "aria-label": "Book title" });
  const description = h("textarea", { rows: 4, "aria-label": "Book description" }, app.tl.description || "");
  const languages = h("input", { value: (app.tl.languages || []).join(", "), "aria-label": "Book languages" });
  const conventions = h("textarea", { rows: 5, "aria-label": "Transcription conventions" }, (app.tl.conventions || []).join("\n"));
  const form = h("form", { onsubmit: async event => {
    event.preventDefault(); dialog.close();
    try { await reviewTypeChange(app, [{ kind: "metadata", title: title.value.trim(), description: description.value,
      languages: languages.value.split(",").map(value => value.trim()).filter(Boolean), conventions: conventions.value.split("\n").map(value => value.trim()).filter(Boolean) }]); }
    catch (error) { app.toast(error.message, "bad"); }
  } }, h("h2", {}, "Book details and conventions"), h("label", {}, "Title ", title), h("label", {}, "Description ", description),
    h("label", {}, "Languages, separated by commas ", languages), h("label", {}, "One transcription convention per line ", conventions),
    h("div", { class: "actions" }, h("button", { type: "submit", class: "primary" }, "Preview change"), h("button", { type: "button", onclick: () => dialog.close() }, "Cancel")));
  const dialog = h("dialog", { class: "type-dialog", "aria-label": "Book details and conventions" }, form);
  document.body.append(dialog); dialog.showModal(); dialog.addEventListener("close", () => dialog.remove(), { once: true });
}
