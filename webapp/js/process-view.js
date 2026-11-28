import { h } from "./render.js?v=20261127-display-type";
import { pageCaption } from "./bookchecks.js?v=20261127-display-type";
import { pagesToProcess, processingChoices, processBook } from "./book-processing.js?v=20261127-display-type";
import { dollars } from "./recipe.js?v=20261127-display-type";

const button = (text, attrs) => h("button", { type: "button", ...attrs }, text);
const frame = () => new Promise(requestAnimationFrame);

export async function openProcess(app, index, restore = false) {
  const session = app.session, original = app.book;
  const current = index ?? (app.mode === "scans" ? app.scans.currentPosition().index : app.textPosition().index);
  const ledger = await session.readWork("work/reader-lab/ledger.json").catch(() => null);
  const choices = processingChoices(original, ledger?.calls ?? []);
  const archive = await session.workArchive();
  if (app.session !== session) return;
  const allPages = h("option", { value: "unprocessed" }, "All unprocessed pages");
  const scope = h("select", { "aria-label": "Pages to process" }, allPages,
    h("option", { value: "all" }, "All pages"),
    h("option", { value: "range" }, "These pages"),
    h("option", { value: "page" }, `This page · ${pageCaption(original.pages[current])}`));
  scope.value = index == null ? "unprocessed" : "page";
  const range = h("input", { placeholder: "1–4, 8", "aria-label": "Scan range" });
  const rangeRow = h("label", {}, "Scan numbers ", range);
  const localOnly = h("input", { type: "checkbox", checked: restore || !!archive });
  const missingOnly = h("input", { type: "checkbox", checked: restore });
  const missingRow = h("label", {}, missingOnly, " Fill in missing text only");
  const limit = h("input", { type: "number", min: "0", step: "0.01", value: original.reading?.spend_limit ?? "1.00", "aria-label": "Spend threshold" });
  const archiveStatus = h("span", { class: "meta" }, archive ? "Work archive attached" : "");
  const file = h("input", { type: "file", accept: ".zip", "aria-label": "Open saved work archive", hidden: true });
  const attach = button("Open work archive…", { onclick: () => file.click() });
  const estimate = h("p", { class: "v1-estimate" });
  const models = h("dl", { class: "v1-models" },
    h("dt", {}, "Region finder"), h("dd", {}, choices.finder.label), h("dt", {}, "Reader"), h("dd", {}, choices.reader.label));
  const status = h("p", { role: "status", class: "v1-process-status" });
  const gauge = h("progress", { "aria-label": "Pages complete", hidden: true, value: "0", max: "1" });
  const failures = h("ul", { class: "v1-process-errors" });
  const start = button("Start", { class: "primary" });
  const stop = button("Stop", { hidden: true });
  const controls = h("div", { class: "v1-process-fields" },
    h("label", {}, "Pages ", scope), rangeRow, models,
    h("label", {}, "Spend threshold (USD) ", limit),
    h("div", { class: "v1-tools" }, attach, file, archiveStatus),
    h("label", {}, localOnly, " Use saved records only"), missingRow, estimate);
  const panel = app.dialog(index == null ? "Process pages" : `Process ${pageCaption(original.pages[index])}`,
    h("div", {}, controls, h("div", { class: "v1-process-progress" }, gauge, status, failures),
      h("div", { class: "v1-tools" }, start, stop)));
  panel.classList.add("v1-process");
  const close = panel.querySelector(".v1-dialog-head button");
  let busy, importing = false;
  const restoring = () => localOnly.checked && missingOnly.checked;
  const selected = () => pagesToProcess(app.book, scope.value, current, range.value, restoring());
  const refresh = () => {
    allPages.textContent = restoring() ? "All pages with missing text" : "All unprocessed pages";
    rangeRow.hidden = scope.value !== "range";
    missingRow.hidden = !localOnly.checked;
    limit.disabled = localOnly.checked || !!busy;
    try {
      const pages = selected().length;
      const { finderCost, readerCost } = choices;
      const cost = localOnly.checked ? 0 : finderCost == null || readerCost == null ? null : (finderCost + readerCost) * pages;
      estimate.textContent = !pages && scope.value === "unprocessed" && !restoring()
        ? "Every page has been processed. Choose All pages, These pages or This page to process pages again."
        : `${pages} ${pages === 1 ? "page" : "pages"} · ${cost == null ? "Cost estimate unavailable" : `Estimated new work ${dollars(cost)}`}`;
      start.disabled = !!busy || importing || !pages;
    } catch (error) { estimate.textContent = error.message; start.disabled = true; }
  };
  for (const input of [scope, range, localOnly, missingOnly, limit]) input.addEventListener("input", refresh);
  panel.addEventListener("cancel", event => { if (busy || importing) event.preventDefault(); });
  file.addEventListener("change", async () => {
    const item = file.files[0];
    if (!item) return;
    importing = true;
    close.disabled = attach.disabled = true;
    status.textContent = "Reading the work archive…";
    refresh();
    try {
      await session.attachWorkArchive(item);
      archiveStatus.textContent = "Work archive attached";
      localOnly.checked = true;
      status.textContent = "";
    } catch (error) { status.textContent = error.message; }
    finally {
      file.value = "";
      close.disabled = attach.disabled = importing = false;
      refresh();
    }
  });
  start.onclick = async () => {
    if (busy || importing || app.session !== session) return;
    failures.replaceChildren();
    try {
      const pages = selected(), threshold = Number(limit.value);
      const paid = !localOnly.checked && [choices.finder, choices.reader].some(profile => profile.provider !== "local");
      if (paid && (!Number.isFinite(threshold) || threshold <= 0)) throw new Error("Enter a positive spend threshold for API calls.");
      const overwrite = pages.filter(i => app.book.pages[i].regions).length;
      const restoreText = restoring();
      if (!restoreText && overwrite && !confirm(`Replace the regions and text on ${overwrite} processed ${overwrite === 1 ? "page" : "pages"}? Undo restores this run.`)) return;
      const initial = app.book, checked = localOnly.checked, job = busy = new AbortController();
      const inputControls = [...controls.querySelectorAll("input, select, button")];
      for (const input of inputControls) input.disabled = true;
      close.disabled = start.disabled = true;
      stop.hidden = false;
      stop.disabled = false;
      stop.onclick = () => { job.abort(); stop.disabled = true; status.textContent = "Stopping…"; };
      gauge.hidden = false;
      gauge.max = pages.length;
      gauge.value = 0;
      status.textContent = checked ? "Loading saved records…" : "Starting…";
      let first = true;
      try {
        await frame();
        const credentials = paid ? await app.credentials() : null;
        const result = await processBook(session, initial, pages, { choices, keys: credentials?.keys, savedOnly: checked, missingOnly: restoreText, limit: threshold,
          signal: job.signal,
          async change(book) {
            if (first) {
              app.undo.push(initial);
              app.redo.length = 0;
              app.typing = null;
              first = false;
            }
            app.apply(book, false);
            await app.flush();
          },
          progress({ completed, total, step, index, spend, reused }) {
            gauge.value = completed;
            status.textContent = `${step}${index == null ? "" : ` · ${pageCaption(initial.pages[index])}`} · ${completed} of ${total} · ${dollars(spend)} spent${reused ? ` · ${reused} reused` : ""}`;
          },
        });
        status.textContent = `${result.stopped ? "Stopped" : "Finished"} · ${result.completed} of ${pages.length} pages · ${result.reused} from saved work · ${dollars(result.spend)} spent`;
        if (restoreText) status.append(` · ${result.restored} ${result.restored === 1 ? "region" : "regions"} filled`);
        if (result.unknown) status.append(" · a call's cost could not be determined");
        failures.replaceChildren(...result.errors.map(({ index, message }) => h("li", {}, `${pageCaption(initial.pages[index])} · ${message}`)));
      } finally {
        busy = null;
        close.disabled = false;
        for (const input of inputControls) input.disabled = false;
        stop.hidden = true;
        refresh();
      }
    } catch (error) { status.textContent = error.message; }
  };
  refresh();
  return panel;
}
