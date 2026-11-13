import { h, cropInto, bbox, esc } from "./render.js";
import { regionPath } from "./pageimage.js?v=20261113-types-tidy-1";
import { clone } from "./ops.js?v=20261113-types-tidy-1";
import { parseLine, TAGS } from "./inline.js";
import { markedText } from "./pipeline/split.js";
import { transcriptionHtml } from "./transcription-diff.js";
import { renderStructureComparison } from "./structure-visual.js?v=20261113-types-tidy-1";
import { checkDocument } from "./schema.js?v=20261113-types-tidy-1";
import { assignmentOf, reviewCandidate, saveReview, settle } from "./review.js?v=20261113-types-tidy-1";
import { partialTextScope } from "./pipeline/partial-reading.js?v=20261113-types-tidy-1";

const titles = { regions: "Page regions", text: "Transcription", units: "Units and links" };

export async function reviewPage(app, { pid, layer, path = null, region = null, line, field, suggestion = false, correction: initialCorrection, onSaved = async () => {} }) {
  if (app.workflowBusy || app.maker?.processing) throw new Error("Wait for active processing before reviewing a choice.");
  await app.flush();
  if (app.dirty) throw new Error("Save the page’s current changes before reviewing a result.");
  const book = app.book, base = clone((await book.draft(pid))?.doc || await book.current(pid, { refresh: true }));
  if (!base) throw new Error("Prepare this page’s regions before saving a reviewed choice.");
  const types = clone(book.types);
  if (path) book.work.delete(path);
  const record = path ? await book.readWork(path) : null;
  if (path && !record) throw new Error("This saved model result is unavailable.");
  const label = record?.profile?.label || record?.profile?.id || (record ? "Saved model result" : "Current page");
  const repairScope = layer === "text" && suggestion && record ? partialTextScope(base, record) : null;
  const maker = layer === "regions" && record ? await app.getMaker() : null;
  const regionCandidate = maker?.provisional(pid, record, record.image_sha256 || base.page.image_sha256);
  let proposed, buildError = "";
  try { proposed = record ? reviewCandidate(base, record, layer, types, regionCandidate, { suggestion }) : clone(base); }
  catch (error) { proposed = clone(record?.doc || base); buildError = error.message; }
  const dialog = h("dialog", { class: "review-dialog", "aria-label": `Review ${titles[layer]}` });
  const status = h("p", { role: "status" }), preview = h("div"), controls = h("div", { class: "actions" });
  const scope = h("select", { "aria-label": "Review scope" }, h("option", { value: "" }, "Whole page"),
    ...base.page.regions.map(value => h("option", { value: value.id, selected: value.id === region }, value.id)));
  if (region) scope.value = region;
  if (layer === "regions") { scope.value = ""; scope.disabled = true; }
  const lineSelect = h("select", { "aria-label": "Review line" });
  const fieldSelect = h("select", { "aria-label": "Assignment to review" }, h("option", { value: "units" }, "Grouping, continuations and links"),
    h("option", { value: "line_ends" }, "Line joins"), h("option", { value: "type" }, "Region type"));
  if (field) fieldSelect.value = field;
  const correction = h("textarea", { rows: 3, "aria-label": "Correct chosen line" });
  const correctionLabel = h("label", { class: "stack" }, "Correct the chosen line after checking the scan", correction);
  const selectedScope = () => ({ ...(scope.value ? { region: scope.value } : {}),
    ...(lineSelect.value ? { line: Number(lineSelect.value) } : {}), ...(layer === "units" && scope.value ? { field: fieldSelect.value } : {}) });
  const effective = () => {
    if (buildError && !(layer === "units" && fieldSelect.value === "type" && scope.value)) throw new Error(buildError);
    const doc = layer === "units" && fieldSelect.value === "type" && scope.value ? clone(record?.doc || base) : clone(proposed);
    if (layer === "text" && scope.value && lineSelect.value) {
      const target = doc.page.regions.find(value => value.id === scope.value).lines.find(value => value.line === Number(lineSelect.value));
      if (correction.value !== markedText(target)) {
        const [text, spans] = parseLine(correction.value, [], 1); target.text = text;
        if (spans.length) target.spans = spans; else delete target.spans;
      }
    }
    return doc;
  };
  const close = h("button", { onclick: () => dialog.close() }, "Close");
  const apply = h("button", { class: "primary", onclick: () => save(false) }, "Use chosen version");
  const keep = h("button", { onclick: () => save(true) }, "Keep current version");
  const dismiss = h("button", { onclick: () => save(false, true) }, "Dismiss suggestion");
  let busy = false;
  async function save(keepCurrent, dismissed = false) {
    if (busy || app.workflowBusy || app.maker?.processing) return;
    busy = app.workflowBusy = true;
    dialog.querySelectorAll("button,input,select,textarea").forEach(control => { control.disabled = true; });
    status.textContent = "Saving reviewed choice…";
    try {
      await saveReview(book, pid, { base, types, candidate: keepCurrent || dismissed ? base : effective(), layer, scope: selectedScope(), record, path,
        profile: record?.profile?.id || null, keep: keepCurrent, dismiss: dismissed });
      await app.refreshWorkflowPage(pid);
      if (app.pid === pid) { app.doc = null; app.pageBuilt = false; }
      dialog.close();
      app.workflowBusy = false;
      await onSaved();
    } catch (error) { status.textContent = error.message; }
    finally {
      busy = app.workflowBusy = false;
      dialog.querySelectorAll("button,input,select,textarea").forEach(control => { control.disabled = false; });
      if (layer === "regions") scope.disabled = true;
      if (dialog.open) updatePreview();
    }
  }
  async function updatePreview() {
    const selection = selectedScope();
    preview.querySelectorAll("[data-review-region]").forEach(element => { element.hidden = !!scope.value && element.dataset.reviewRegion !== scope.value; });
    fieldSelect.hidden = layer !== "units" || !scope.value;
    lineSelect.hidden = layer !== "text" || !scope.value;
    correctionLabel.hidden = layer !== "text" || !lineSelect.value || !scope.value;
    try {
      const out = settle(base, effective(), types, layer, selection);
      const removed = base.page.regions.reduce((n, region) => n + (region.lines || []).filter(line => line.text !== undefined &&
        !out.doc.page.regions.find(value => value.id === region.id)?.lines?.some(value => value.line === line.line && value.text !== undefined)).length, 0);
      const removedLinks = Math.max(0, (base.relations || []).length - (out.doc.relations || []).length);
      const formattingCount = doc => doc.page.regions.reduce((sum, region) => sum + (region.lines || []).reduce((n, line) => n + (line.spans || []).filter(span => span.kind !== "note_marker").length, 0), 0);
      const removedFormatting = Math.max(0, formattingCount(base) - formattingCount(out.doc));
      status.textContent = `Saves ${out.regions.length} ${out.regions.length === 1 ? "region" : "regions"} on this page as a reviewed edit.${removed ? ` ${removed} transcribed lines become pending. The previous page is retained in history.` : ""}${removedLinks ? ` ${removedLinks} existing note or unit links are removed.` : ""}${removedFormatting ? ` ${removedFormatting} formatting spans are removed.` : ""}`;
      apply.disabled = !book.writable;
    } catch (error) { status.textContent = error.message; apply.disabled = true; }
    keep.disabled = !book.writable;
    dismiss.disabled = !book.writable || !path;
    if (!book.writable) status.textContent = "Keep an editable copy of this book to save reviewed choices.";
  }
  function chooseLine() {
    const region = proposed.page.regions.find(value => value.id === scope.value);
    lineSelect.replaceChildren(h("option", { value: "" }, "All lines in this region"), ...(region?.lines || []).map(value => h("option", {
      value: value.line, selected: value.line === line }, `Line ${value.line}`)));
    line = undefined; updateCorrection();
  }
  function updateCorrection() {
    const selected = proposed.page.regions.find(value => value.id === scope.value)?.lines?.find(value => value.line === Number(lineSelect.value));
    correction.value = initialCorrection ?? (selected ? markedText(selected) : ""); initialCorrection = undefined; updatePreview();
  }
  scope.onchange = chooseLine; lineSelect.onchange = updateCorrection; fieldSelect.onchange = updatePreview; correction.oninput = updatePreview;
  const image = await book.imageUrl(pid);
  if (layer === "units") {
    const sent = base.page.regions.map(value => ({ rid: value.id, region: { ...value, lines: (value.lines || []).map(line => ({ ...line, line_id: line.line })) }, line_ids: (value.lines || []).map(line => line.line) }));
    preview.append(renderStructureComparison({ rec: base.page, sent, reading: { regions: base.page.regions.map(value => ({ id: value.id, lines: (value.lines || []).map((line, index) => ({ n: index + 1, text: markedText(line) })) })) },
      models: [{ id: "current", label: "Current page", result: { parsed: assignmentOf(base), errors: checkDocument(base, types)[0] } },
        { id: "candidate", label, result: { parsed: assignmentOf(proposed), errors: checkDocument(proposed, types)[0] } }], reference: "current", image,
      onlyDifferences: false, selectedRegion: region, onSelect: rid => { scope.value = rid; chooseLine(); }, width: 1050 }));
  } else if (layer === "text") {
    const knownKinds = new Set([...Object.values(TAGS), "note_marker"]);
    const extraFormatting = region => {
      const extra = (region?.lines || []).flatMap(line => (line.spans || []).filter(span => !knownKinds.has(span.kind)).map(span => `line ${line.line} · ${span.kind}`));
      return extra.length ? h("p", { class: "meta" }, `Additional inline formatting · ${extra.join(", ")}`) : null;
    };
    for (const current of base.page.regions) {
      const other = proposed.page.regions.find(value => value.id === current.id), source = h("div", { class: "source-region" });
      cropInto(source, image, base.page, current.box || bbox(current.polygons), 950, 280);
      const left = (current.lines || []).map(markedText), right = (other?.lines || []).map(markedText);
      preview.append(h("section", { class: "trial-region", dataset: { reviewRegion: current.id } }, h("h3", {}, current.id), h("div", { class: "source-line-scroll" }, source),
        h("div", { class: "review-columns" }, h("section", {}, h("h4", {}, "Current page"), h("pre", { html: transcriptionHtml(right, left) }), extraFormatting(current)),
          h("section", {}, h("h4", {}, repairScope && !repairScope.includes(current.id) ? "Current text retained" : label), h("pre", { html: transcriptionHtml(left, right) }), extraFormatting(other)))));
    }
  } else {
    preview.append(h("div", { class: "review-columns" }, ...[{ doc: base, title: "Current page" }, { doc: proposed, title: label }].map(({ doc, title }) => {
      const polygons = doc.page.regions.map(value => `<g><title>${esc(value.id)} ${esc(value.type)}</title><path d="${esc(regionPath(value, types.types[value.type]?.region))}"/></g>`).join("");
      return h("section", {}, h("h3", {}, title), h("div", { class: "review-page" }, h("img", { src: image, alt: `${title} regions` }),
        h("div", { class: "review-overlay", html: `<svg viewBox="0 0 ${Number(doc.page.width)} ${Number(doc.page.height)}">${polygons}</svg>` })),
        ...doc.page.regions.map(value => h("p", {}, `${value.id} · ${value.type} · ${value.lines?.length || 0} line pieces`)));
    })));
  }
  controls.append(keep, apply, ...(path && base.source?.suggestions?.[layer] === path ? [dismiss] : []), close);
  dialog.append(h("h2", {}, `Review ${titles[layer]} · page ${book.index[pid] + 1}`),
    h("p", {}, "Check the scan, choose a scope, then save the version you judge correct. Reviewed choices become page edits and supply the model scores."),
    ...(layer === "regions" ? record?.warnings || [] : []).map(warning => h("p", { class: "box warn" }, warning)),
    h("div", { class: "fields" }, h("label", {}, "Scope ", scope), lineSelect, fieldSelect), correctionLabel, status, controls, preview);
  dialog.addEventListener("cancel", event => { if (busy) event.preventDefault(); });
  dialog.addEventListener("close", () => dialog.remove());
  document.body.append(dialog); chooseLine(); dialog.showModal();
}

export function suggestionButton(app, pid, layer = null, onSaved = () => app.route()) {
  const suggestions = (app.pageStates?.get(pid)?.doc || app.doc)?.source?.suggestions || {};
  const layers = layer ? [layer].filter(key => suggestions[key]) : Object.keys(suggestions).filter(key => titles[key]);
  if (!layers.length) return h("div", { class: "suggestion-actions", hidden: true });
  return h("div", { class: "suggestion-actions" }, ...layers.map(key => h("button", { class: "mini", onclick: () => reviewPage(app, {
    pid, layer: key, path: suggestions[key], suggestion: true, onSaved,
  }).catch(error => app.toast(error.message, "bad")) }, `Review ${titles[key].toLowerCase()} suggestion`)));
}
