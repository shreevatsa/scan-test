import { h } from "./render.js";
import { PAGE_REVIEW_MODELS, requestPageReview, latestPageReview, pendingTypeAdditions, pageReviewRegions } from "./pipeline/page-review.js?v=20261111-type-overview-4";
import { CredentialChecks, stageKeyControls } from "./key-check.js?v=20261111-type-overview-4";
import { settings } from "./store.js?v=20261112-library-1";
import { money } from "./reader-controls.js?v=20261111-type-overview-4";
import { reviewTypeChange } from "./type-operations.js?v=20261111-type-overview-4";
import { reviewPage } from "./review-view.js?v=20261111-cross-page-carbon-2";
import { runProgress } from "./run-progress.js";

export async function reviewPageWithAI(app) {
  if (app.workflowBusy || app.outlineBusy || app.maker?.processing) throw new Error("Wait for the active operation before reviewing this page.");
  await app.flush();
  if (app.dirty) throw new Error("Save this page’s changes before requesting a review.");
  const book = app.book, pid = app.pid, maker = await app.getMaker();
  let record = await latestPageReview(book, pid), busy = false;
  if (app.book !== book || app.pid !== pid) return;
  const checks = maker.credentials ||= new CredentialChecks(maker.keys);
  const choice = h("select", { "aria-label": "Page review model" }, ...PAGE_REVIEW_MODELS.map(profile =>
    h("option", { value: profile.id, selected: profile.id === record?.profile.id }, profile.label)));
  const instruction = h("textarea", { rows: 3, "aria-label": "Instruction for the model",
    placeholder: "Can you suggest a more specific unit type than reference_entry for this page?" }, record?.instruction || "Review this page’s regions and types. Suggest more specific types where supported. Split prose around separately boxed displays.");
  const credentials = h("div"), result = h("div"), status = h("p", { role: "status" });
  const progress = runProgress("Page AI review progress");
  const close = h("button", { onclick: () => dialog.close() }, "Close");
  const selectedProfile = () => PAGE_REVIEW_MODELS.find(profile => profile.id === choice.value);
  const updateReady = () => { run.disabled = busy || !checks.status(selectedProfile())?.valid; };
  const showCredentials = () => {
    credentials.replaceChildren(stageKeyControls(checks, selectedProfile(), (id, value) => settings.set(`key:${id}`, value), updateReady));
    if (record && credentials.firstElementChild) credentials.firstElementChild.open = false;
    updateReady();
  };
  const lock = value => {
    busy = app.workflowBusy = maker.processing = value;
    dialog.querySelectorAll("input,select,textarea,button").forEach(control => { control.disabled = value; });
    app.header.inert = value;
    if (!value) { showCredentials(); renderResult(); }
  };
  function renderResult() {
    result.replaceChildren();
    if (!record) return;
    result.append(h("h3", {}, "Model response"), h("p", { class: "meta" }, `${record.profile.label} · Estimated call cost ${money(record.cost_usd)} · Saved with this book`),
      h("p", { class: "page-review-explanation" }, record.parsed.explanation));
    let pending;
    try { pending = pendingTypeAdditions(record, book.types); }
    catch (error) { result.append(h("p", { class: "bad" }, error.message)); return; }
    if (record.parsed.new_types.length) result.append(h("h3", {}, "Proposed types"), ...record.parsed.new_types.map(type =>
      h("section", { class: "box" }, h("b", {}, type.name), h("span", { class: "meta" }, ` · ${type.region}${type.furniture ? " · furniture" : type.parent ? ` · inside ${type.parent}` : ` · ${type.flow} flow`}`),
        h("p", {}, type.description))));
    const addTypes = h("button", { disabled: !book.writable || !pending.length, onclick: async () => {
      try { await reviewTypeChange(app, pending, { applied: renderResult }); }
      catch (error) { status.textContent = error.message; }
    } }, pending.length ? `Review ${pending.length} type ${pending.length === 1 ? "addition" : "additions"}` : "Proposed types are available in the book");
    const regions = h("button", { disabled: !book.writable || !!pending.length, onclick: async () => {
      let path;
      lock(true); status.textContent = "Computing the proposed region outlines…";
      try { path = await pageReviewRegions(maker, pid, record); }
      catch (error) { status.textContent = error.message; }
      finally { lock(false); }
      if (path) {
        status.textContent = "Review the layout against the current page.";
        try { await reviewPage(app, { pid, layer: "regions", path, onSaved: () => app.route() }); }
        catch (error) { status.textContent = error.message; }
      }
    } }, "Review proposed regions");
    result.append(h("p", {}, `${record.parsed.regions.length} proposed regions.`),
      h("div", { class: "actions" }, record.parsed.new_types.length ? addTypes : null, regions));
    if (pending.length) result.append(h("p", { class: "hint" }, "Review the type additions, then review the page’s proposed regions."));
    if (!book.writable) result.append(h("p", {}, "Keep an editable copy of the book to apply these proposals."));
  }
  const run = h("button", { class: "primary", onclick: async () => {
    if (busy || app.workflowBusy || !checks.status(selectedProfile())?.valid) return;
    if (!await app.confirmSpending() || busy || app.workflowBusy) return;
    lock(true); progress.start(1); status.textContent = "The model is reviewing this page…";
    let outcome = "Failed";
    try {
      record = await requestPageReview(maker, pid, selectedProfile(), instruction.value.trim());
      progress.advance("completed"); outcome = "Finished";
      status.textContent = "Review saved. Read the response and preview any changes below.";
    } catch (error) { progress.advance("failed"); status.textContent = error.message; }
    finally { progress.finish(outcome); lock(false); app.diskCopy?.checkpoint(); }
  } }, "Review this page");
  choice.onchange = showCredentials;
  const dialog = h("dialog", { class: "type-dialog page-review-dialog", "aria-label": "Review page with AI" },
    h("h2", {}, `Review page ${book.index[pid] + 1} with AI`),
    h("p", {}, "The model receives this scan, its regions, the book’s type list and your instruction."),
    h("label", {}, "Model ", choice), h("label", {}, "Instruction for the model ", instruction), credentials,
    h("div", { class: "actions" }, run, close), progress.element, status, result);
  dialog.addEventListener("cancel", event => { if (busy) event.preventDefault(); });
  dialog.addEventListener("close", () => dialog.remove(), { once: true });
  document.body.append(dialog); showCredentials(); renderResult(); dialog.showModal();
}
