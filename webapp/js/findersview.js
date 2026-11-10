import { h, esc } from "./render.js";
import { FINDERS, finderById, finderPath, regionLayout, reviewedRegionLayout } from "./pipeline/finders.js?v=20261110-finders-4";
import { OCR_LANGUAGES, structurePath, projectBookCost } from "./pipeline/readers.js?v=20261110-partial-3";
import { pageRange } from "./pipeline/pdf.js";
import { stageKeyControls, CredentialChecks } from "./key-check.js?v=20261110-partial-3";
import { reviewPage } from "./review-view.js?v=20261110-partial-3";
import { settings } from "./store.js?v=20261110-finders-4";
import { money } from "./reader-controls.js?v=20261110-partial-3";
import { runProgress } from "./run-progress.js";

function scanCard(record, profile, image, reference, onReview) {
  const paths = record.regions.map(region => {
    const color = region.type === "other" ? "#ad6800" : "#2056a5";
    const box = region.model_box;
    const polygons = region.polygons.map(ring => `<polygon points="${ring.map(point => point.map(Number).join(",")).join(" ")}"/>`).join("");
    return `<g stroke="${color}" fill="${color}"><title>${esc(`r${region.region_id} · ${region.type}`)}</title>${polygons}<text x="${Number(box[0])}" y="${Math.max(18, Number(box[1]) - 4)}">${esc(`r${region.region_id} ${region.type}`)}</text></g>`;
  }).join("");
  return h("section", { class: `finder-card${reference ? " reference" : ""}` }, h("h3", {}, profile.label),
    h("p", { class: "meta" }, reference ? "Reference" : "Candidate"),
    h("p", {}, `${record.regions.length} regions · ${record.regions.filter(region => region.type === "other").length} need a type`),
    h("div", { class: "finder-scan" }, h("img", { src: image, alt: `Page scan with ${profile.label} regions` }),
      h("div", { class: "finder-overlay", html: `<svg viewBox="0 0 ${Number(record.width)} ${Number(record.height)}">${paths}</svg>` })),
    onReview ? h("button", { onclick: onReview }, `Review regions from ${profile.label}`) : null,
    h("details", {}, h("summary", {}, "Region types and reading order"), ...record.regions.map(region => h("p", {},
      `r${region.region_id} · ${region.type} · ${region.reading_order === null ? "outside reading order" : `position ${region.reading_order}`}`))),
    ...(record.warnings || []).map(warning => h("p", { class: "hint" }, warning)));
}

export async function renderFinders(el, app) {
  const token = app.routeToken, book = app.book, maker = await app.getMaker();
  const active = () => app.routeToken === token && app.book === book;
  const options = await maker.options(), saved = await book.readWork("work/region-lab/selection.json") || {};
  if (!active()) return;
  const checks = maker.credentials ||= new CredentialChecks(maker.keys);
  const candidates = new Set((saved.models || FINDERS.map(profile => profile.id)).filter(id => FINDERS.some(profile => profile.id === id)));
  const samples = h("input", { value: saved.pages || `1-${Math.min(3, book.pages.length)}`, "aria-label": "Region comparison sample pages" });
  const inspect = h("select", { "aria-label": "Inspect region comparison page" }, ...book.pages.map((page, index) =>
    h("option", { value: page.id, selected: page.id === saved.focus }, `Page ${index + 1}${page.label ? ` · ${page.label}` : ""}`)));
  const reference = h("select", { "aria-label": "Reference region finder" }, ...FINDERS.map(profile =>
    h("option", { value: profile.id, selected: profile.id === (saved.reference || "terra-regions") }, profile.label)));
  const choice = h("select", { "aria-label": "Chosen region finder" }, ...FINDERS.map(profile =>
    h("option", { value: profile.id, selected: profile.id === finderById(options.finder).id }, profile.label)));
  const languages = h("select", { "aria-label": "Region comparison OCR language pack" }, ...OCR_LANGUAGES.map(([id, name]) =>
    h("option", { value: id, selected: id === options.ocr_languages }, name)));
  const budget = h("input", { type: "number", min: 0.1, step: 0.5, value: saved.budget || 5, "aria-label": "Region comparison spend threshold" });
  const pageCount = h("input", { type: "number", min: 1, step: 1, value: saved.page_count || book.manifest.pdf?.page_count || book.pages.length,
    "aria-label": "Book pages for region cost estimate" });
  const fresh = h("input", { type: "checkbox", "aria-label": "Request fresh region results" });
  const status = h("p", { role: "status" }), summary = h("div"), detail = h("div", { class: "finder-cards" });
  const progress = runProgress("Region finder comparison progress"), results = new Map(), credentials = h("div");
  let busy = false, stopped = false, refreshVersion = 0;
  const pageIds = () => pageRange(samples.value, book.pages.length).map(number => book.pages[number - 1].id);
  const selectedModels = () => [...new Set([reference.value, ...candidates])].map(finderById);
  const saveSelection = () => book.writeWork("work/region-lab/selection.json", { pages: samples.value, models: [...candidates],
    focus: inspect.value, reference: reference.value, budget: budget.value, page_count: pageCount.value });

  function updateCredentials() {
    const selected = selectedModels(), panels = [];
    for (const provider of ["openai", "gemini"]) {
      const profiles = selected.filter(profile => profile.provider === provider);
      if (!profiles.length) continue;
      const group = {
        keys: checks.keys,
        status: () => profiles.every(profile => checks.status(profile)?.valid)
          ? { valid: true, message: "Key checked successfully for the selected models." }
          : profiles.map(profile => checks.status(profile)).find(result => result && !result.valid),
        check: async () => {
          for (const profile of profiles) {
            if (checks.status(profile)?.valid) continue;
            const result = await checks.check(profile);
            if (!result.valid) return result;
          }
          return group.status();
        },
      };
      panels.push(h("section", {}, h("p", { class: "hint" }, profiles.map(profile => profile.label).join(" · ")),
        stageKeyControls(group, profiles[0], (id, value) => settings.set(`key:${id}`, value), updateRunButton)));
    }
    if (selected.some(profile => profile.provider === "local")) panels.push(h("p", { class: "hint" }, "The selected free finders run on this device."));
    credentials.replaceChildren(...panels);
    updateRunButton();
  }

  function updateRunButton() {
    runButton.disabled = busy || !selectedModels().every(profile => checks.status(profile)?.valid);
  }

  async function refresh() {
    const version = ++refreshVersion, ids = pageIds(), rows = [], loaded = new Map();
    for (const pid of [...new Set([...ids, inspect.value])]) {
      const runs = new Map();
      for (const profile of FINDERS) {
        const record = await maker.finderResult(pid, profile.id, { compatible: true });
        if (record) runs.set(profile.id, { record, doc: maker.provisional(pid, record, record.image_sha256) });
      }
      loaded.set(pid, runs);
    }
    if (!active() || version !== refreshVersion) return;
    results.clear();
    for (const [pid, runs] of loaded) results.set(pid, runs);
    for (const profile of FINDERS) {
      const available = ids.filter(pid => results.get(pid)?.has(profile.id));
      if (!available.length) continue;
      let differences = 0, compared = 0, reviewed = 0, matches = 0;
      const costs = [];
      for (const pid of available) {
        const run = results.get(pid).get(profile.id), ref = results.get(pid).get(reference.value);
        if (ref) { compared++; differences += Number(regionLayout(run.doc) !== regionLayout(ref.doc)); }
        const current = await book.current(pid);
        if (current) {
          const score = reviewedRegionLayout(current, run.doc);
          reviewed += score.reviewed; matches += score.matches;
        }
        const reading = await book.readWork(`work/readings/${pid}/${options.reader}.json`);
        const structure = await book.readWork(structurePath(pid, options.reader, options.structurer));
        costs.push({ regions: run.record.region_call, reading, structure });
      }
      rows.push(h("tr", {}, h("td", {}, profile.label, h("div", { class: "meta" }, `${available.length}/${ids.length} sample pages`)),
        h("td", {}, money(projectBookCost(costs, Number(pageCount.value)), 2)),
        h("td", {}, compared ? `${differences} / ${compared} pages` : "Awaiting reference"),
        h("td", {}, reviewed ? `${matches} / ${reviewed} pages` : "—"),
        h("td", {}, available.every(pid => Number.isFinite(results.get(pid).get(profile.id).record.region_call?.seconds))
          ? `${(available.reduce((sum, pid) => sum + results.get(pid).get(profile.id).record.region_call.seconds, 0) / available.length).toFixed(1)} s` : "—")));
    }
    if (!active() || version !== refreshVersion) return;
    summary.replaceChildren(rows.length ? h("div", { class: "table-scroll" }, h("table", { class: "pages" },
      h("thead", {}, h("tr", {}, ...["Region finder", `Estimated book total / ${Number(pageCount.value).toLocaleString()} pages`, "Layouts differing from reference", "Matches reviewed layout", "Region finding / page"].map(label => h("th", {}, label)))), h("tbody", {}, ...rows)))
      : h("p", {}, "Run a sample comparison to inspect region layouts."));
    const pid = inspect.value, runs = results.get(pid), image = await book.imageUrl(pid), current = await book.current(pid);
    if (!active() || version !== refreshVersion) return;
    detail.replaceChildren(...FINDERS.filter(profile => runs?.has(profile.id)).map(profile => scanCard(runs.get(profile.id).record,
      profile, image, profile.id === reference.value, current ? async () => {
        try {
          const path = finderPath(pid, profile.id);
          await book.updateWork(path, latest => latest || runs.get(profile.id).record);
          await reviewPage(app, { pid, layer: "regions", path, onSaved: refresh });
        } catch (error) { status.textContent = error.message; }
      } : null)));
  }

  async function trial() {
    if (busy || app.workflowBusy || maker.processing || maker.jobs.size) return;
    let ids;
    try { ids = pageIds(); } catch (error) { status.textContent = error.message; return; }
    const limit = Number(budget.value), profiles = selectedModels();
    if (!ids.length || !Number.isFinite(limit) || limit <= 0) { status.textContent = "Choose sample pages and a positive spend threshold."; return; }
    if (!profiles.every(profile => checks.status(profile)?.valid)) { status.textContent = "Check the credentials for the selected finders."; return; }
    busy = app.workflowBusy = maker.processing = true; stopped = false;
    const fields = [...content.querySelectorAll("button,input,select"), ...app.header.querySelectorAll("button,select")].filter(field => field !== stopButton);
    fields.forEach(field => { field.disabled = true; }); stopButton.disabled = false;
    const previousCost = maker.onCost;
    let spend = 0, unknown = 0, outcome = "Interrupted";
    maker.onCost = cost => { previousCost(cost); if (Number.isFinite(cost)) spend += cost; else unknown++; };
    const paused = () => stopped || spend >= limit || unknown || maker.persistenceFailure;
    progress.start(ids.length * profiles.length);
    const failures = [];
    try {
      await saveSelection();
      await book.saveReaderOptions({ ...await maker.options(), ocr_languages: languages.value });
      for (const profile of profiles) for (const pid of ids) {
        if (paused()) break;
        status.textContent = `Finding regions on page ${book.index[pid] + 1} with ${profile.label}…`;
        try {
          const result = await maker.findRegions(pid, { finder: profile.id, force: fresh.checked, save: false, trial: true });
          progress.advance(result.cached ? "reused" : "completed");
        } catch (error) { failures.push(`${pid} · ${profile.label} · ${error.message}`); progress.advance("failed"); }
      }
      outcome = maker.persistenceFailure ? "Save failed" : stopped ? "Stopped" : unknown ? "Cost unavailable" : spend >= limit ? "Spend threshold reached" : "Finished";
      status.textContent = `${outcome} · ${money(spend)} new API spend${failures.length ? ` · ${failures.join(" · ")}` : ""}`;
    } catch (error) { status.textContent = error.message; }
    finally {
      maker.onCost = previousCost;
      progress.finish(outcome);
      busy = app.workflowBusy = maker.processing = false;
      fields.forEach(field => { field.disabled = false; }); stopButton.disabled = true;
      app.updateWorkflowNavigation(); updateCredentials();
      await refresh();
    }
  }

  const runButton = h("button", { class: "primary", onclick: trial }, "Run region comparison");
  const stopButton = h("button", { disabled: true, onclick: () => { stopped = true; status.textContent = "Stopping after the active finder…"; } }, "Stop after the active finder");
  const models = FINDERS.map(profile => h("label", {}, h("input", { type: "checkbox", checked: candidates.has(profile.id), onchange: async event => {
    if (event.target.checked) candidates.add(profile.id); else candidates.delete(profile.id);
    updateCredentials(); await saveSelection();
  } }), ` ${profile.label}`));
  const saveChoice = h("button", { class: "primary", onclick: async () => {
    try { await book.saveReaderOptions({ ...await maker.options(), finder: choice.value, ocr_languages: languages.value });
      choiceStatus.textContent = `Selected for this book · ${finderById(choice.value).label}`;
    } catch (error) { status.textContent = error.message; }
  } }, "Use region finder for this book");
  const choiceStatus = h("p", { role: "status" }, `Selected for this book · ${finderById(options.finder).label}`);
  const content = h("div", { class: "checkview reader-lab finder-lab" }, h("h2", {}, "Compare region finders"),
    h("p", {}, "Compare the grouping, types and reading order against the scans. Free finders make coarse blocks that need review. Amber outlines mark blocks needing a type."),
    h("h3", {}, "1. Run a region comparison"),
    h("div", { class: "fields" }, h("label", {}, "Sample PDF pages ", samples), h("button", { onclick: () => app.setMode("pages") }, "Browse all pages")),
    h("p", { class: "hint" }, "Use all, a range such as 1-50, or a list such as 1, 7, 43-44. Page numbers are positions in the PDF."),
    h("fieldset", { class: "finder-selection" }, h("legend", {}, "Region finders"), ...models),
    h("div", { class: "fields" }, h("label", {}, "Reference finder ", reference), h("label", {}, "Tesseract language pack ", languages)), credentials,
    h("p", { class: "hint" }, "The reference finder is included in every run."),
    h("div", { class: "fields" }, h("label", {}, fresh, " Request fresh results"), h("label", {}, "Stop after new API spend reaches $", budget)),
    h("p", { class: "hint" }, "Compatible saved trials are reused. The final API call can exceed the spend threshold. Choosing a free finder runs it on this device."),
    h("div", { class: "actions" }, runButton, stopButton, h("button", { onclick: () => refresh().catch(error => { status.textContent = error.message; }) }, "Refresh saved region results")), progress.element, status,
    h("h3", {}, "2. Review region layouts"), h("label", {}, "Book pages ", pageCount),
    h("p", { class: "hint" }, "The total includes this finder plus the selected transcription and completion models at their recorded whole-page sample costs. Region repairs are excluded from this projection. It becomes available when all three stages have samples. It assumes downstream costs stay at their sampled level. Exact layout matches count only pages explicitly reviewed against the scan."), summary,
    h("label", {}, "Inspect ", inspect), h("p", { class: "hint" }, "For a page already prepared in Regions, review a candidate to keep or replace the whole layout. You can edit its individual blocks in Regions."), detail,
    h("fieldset", { class: "model-choice" }, h("legend", {}, "3. Choose the region finder for this book"), h("label", {}, "Region finder ", choice), saveChoice, choiceStatus,
      h("button", { onclick: () => app.setMode("regions") }, "Continue to Regions")));
  el.replaceChildren(content);
  for (const control of [samples, inspect, reference, pageCount, budget]) control.addEventListener("change", async () => {
    try { pageIds(); updateCredentials(); await saveSelection(); await refresh(); } catch (error) { status.textContent = error.message; }
  });
  updateCredentials();
  try { await refresh(); } catch (error) { status.textContent = error.message; }
}
