import { reviewPage } from "./review-view.js?v=20261110-partial-3";
import { assignmentOf, settledStructureScore } from "./review.js?v=20261110-partial-3";
import { h } from "./render.js";
import { modelChoice, keyControls, money, continueControls } from "./reader-controls.js?v=20261110-partial-3";
import { STRUCTURERS, STRUCTURER, readerById, readerOptions, structurePath, projectBookCost } from "./pipeline/readers.js?v=20261110-partial-3";
import { selectPageRegions } from "./pipeline/split.js";
import { structureDifferences } from "./pipeline/structure-compare.js";
import { renderStructureComparison } from "./structure-visual.js?v=20261110-review-3";
import { settings } from "./store.js?v=20261110-finders-4";
import { runProgress } from "./run-progress.js";

export async function renderStructures(el, app) {
  const token = Symbol();
  app.structureViewToken = token;
  el.replaceChildren(h("p", {}, "Loading schema assignment comparisons…"));
  const book = app.book, maker = await app.getMaker();
  const options = readerOptions(await book.getReaderOptions(), book.types);
  const saved = await book.readWork("work/structure-lab/selection.json") || {};
  const transcriptionSelection = await book.readWork("work/reader-lab/selection.json") || {};
  const choice = await modelChoice(book, "schema assignment", () => renderStructures(el, app));
  const active = () => app.mode === "structures" && app.structureViewToken === token;
  if (!active()) return;
  const chosen = new Set((saved.pages || transcriptionSelection.pages || book.pages.slice(0, 3).map(p => p.id)).filter(pid => pid in book.index));
  const candidates = new Set((saved.models || STRUCTURERS.map(profile => profile.id)).filter(id => STRUCTURERS.some(profile => profile.id === id)));
  const pageSelect = h("select", { "aria-label": "Inspect schema assignment page" }, ...book.pages.map(page => h("option", {
    value: page.id, selected: page.id === (saved.focus || [...chosen][0]),
  }, page.label ? `${page.id} · ${page.label}` : page.id)));
  const reference = h("select", { "aria-label": "Reference schema assignment model" }, ...STRUCTURERS.map(profile => h("option", {
    value: profile.id, selected: profile.id === (saved.reference || STRUCTURER.id),
  }, profile.label)));
  const pageCount = h("input", { type: "number", min: 1, step: 1, "aria-label": "Book pages for schema cost estimate",
    value: saved.page_count ?? transcriptionSelection.projection_pages ?? book.manifest.cost_projection?.page_count ?? book.manifest.pdf?.page_count ?? book.pages.length });
  const budget = h("input", { type: "number", min: 0.1, step: 0.5, value: saved.budget || 5, "aria-label": "Schema trial spend threshold" });
  const onlyDifferences = h("input", { type: "checkbox", checked: saved.only_differences ?? true });
  const status = h("p", { role: "status" }), summary = h("div", { class: "reader-summary" }), detail = h("div");
  const progress = runProgress("Schema assignment comparison progress");
  const pages = book.pages.map(page => {
    const box = h("input", { type: "checkbox", checked: chosen.has(page.id), onchange: () => box.checked ? chosen.add(page.id) : chosen.delete(page.id) });
    return h("label", {}, box, " ", page.label ? `${page.id} · ${page.label}` : page.id);
  });
  const models = STRUCTURERS.map(profile => {
    const box = h("input", { type: "checkbox", checked: candidates.has(profile.id), onchange: () => box.checked ? candidates.add(profile.id) : candidates.delete(profile.id) });
    return h("label", {}, box, " ", profile.label);
  });
  const results = new Map(), inputs = new Map(), geometry = new Map();
  let busy = false, stop = false, selectedRegion = saved.region, refreshVersion = 0;

  async function save() {
    await book.writeWork("work/structure-lab/selection.json", { pages: [...chosen], models: [...candidates], focus: pageSelect.value,
      reader: options.reader, reference: reference.value, page_count: pageCount.value, budget: budget.value, only_differences: onlyDifferences.checked, region: selectedRegion });
  }

  async function load(pid) {
    const rec = await maker.sourceRegions(pid).catch(() => null);
    if (!rec) return;
    geometry.set(pid, rec);
    const prepared = await maker.completionInput(pid, { options }).catch(() => null);
    const reading = prepared?.input;
    if (!reading) { inputs.delete(pid); results.delete(pid); return; }
    inputs.set(pid, reading);
    const runs = new Map();
    for (const profile of STRUCTURERS) {
      const structure = await book.readWork(structurePath(pid, options.reader, profile.id));
      if (structure?.reading_fingerprint !== reading.fingerprint) continue;
      const [errors, warnings] = app.check(structure.doc);
      runs.set(profile.id, { ...structure, errors, warnings });
    }
    results.set(pid, runs);
  }

  async function show() {
    const rows = [];
    for (const profile of STRUCTURERS) {
      const runs = [...chosen].flatMap(pid => results.get(pid)?.has(profile.id) ? [{ pid, structure: results.get(pid).get(profile.id) }] : []);
      if (!runs.length) continue;
      const cost = projectBookCost(runs.map(({ pid, structure }) => ({ regions: geometry.get(pid)?.region_call, reading: inputs.get(pid), structure })), Number(pageCount.value));
      let compared = 0, differences = 0, reviewed = 0, reviewedErrors = 0;
      for (const { pid, structure } of runs) {
        const current = await book.current(pid);
        const score = current ? settledStructureScore(current, structure.doc) : { reviewed: 0, errors: 0 };
        reviewed += score.reviewed; reviewedErrors += score.errors;
        const ref = results.get(pid)?.get(reference.value);
        if (ref) { compared++; differences += structureDifferences(structure.parsed, ref.parsed).length; }
      }
      rows.push(h("tr", {}, h("td", {}, profile.label, h("div", { class: "meta" }, `${runs.length}/${chosen.size} pages`),
        profile.id === options.structurer ? h("div", { class: "ok" }, "Selected for this book") : null), h("td", {}, money(cost, 2)), h("td", {}, compared ? `${differences} regions across ${compared} pages` : "Awaiting reference"), h("td", {}, reviewed ? `${reviewedErrors} / ${reviewed} reviewed regions` : "—"),
        h("td", { class: runs.every(run => !run.structure.errors.length) ? "ok" : "bad" }, `${runs.filter(run => !run.structure.errors.length).length}/${runs.length} valid`),
        h("td", {}, `${(runs.reduce((sum, run) => sum + run.structure.seconds, 0) / runs.length).toFixed(1)} s`)));
    }
    if (!active()) return;
    summary.replaceChildren(rows.length ? h("div", { class: "table-scroll" }, h("table", { class: "pages" },
      h("thead", {}, h("tr", {}, ...["Schema assignment model", `Estimated total / ${Number(pageCount.value).toLocaleString()} pages`, "Differences from reference", "Reviewed errors", "Schema checks", "Schema time / page"].map(label => h("th", {}, label)))),
      h("tbody", {}, ...rows))) : h("p", {}, "Run a sample comparison to inspect schema assignment choices."));
    const pid = pageSelect.value, rec = geometry.get(pid), reading = inputs.get(pid), runs = results.get(pid);
    const ref = runs?.get(reference.value);
    if (!rec || !reading || !ref) { detail.replaceChildren(h("p", {}, "A transcription and reference schema assignment are needed for this page.")); return; }
    const { sent } = selectPageRegions(rec.regions), referenceId = reference.value;
    const image = await book.imageUrl(pid);
    if (!active() || pid !== pageSelect.value || referenceId !== reference.value) return;
    const current = await book.current(pid);
    const choose = (id, rid = null, field = null) => reviewPage(app, { pid, layer: "units", region: rid, field,
      path: id === "current" ? null : structurePath(pid, options.reader, id), onSaved: refresh,
    }).catch(error => { status.textContent = error.message; });
    const models = [...(current ? [{ id: "current", label: "Current page", result: { parsed: assignmentOf(current), errors: app.check(current)[0] } }] : []),
      ...STRUCTURERS.map(profile => ({ ...profile, result: runs?.get(profile.id) || null }))];
    detail.replaceChildren(h("details", {}, h("summary", {}, "Review a whole-page assignment"),
      ...models.filter(model => model.result).map(model => h("button", { onclick: () => choose(model.id) }, model.label))),
      renderStructureComparison({ rec, sent, reading: reading.parsed, image,
      reference: referenceId, models, onReview: choose,
      onlyDifferences: onlyDifferences.checked, selectedRegion, width: el.clientWidth || 900,
      onSelect: rid => { selectedRegion = rid; save().catch(error => { status.textContent = error.message; }); },
    }));
  }

  async function refresh() {
    const version = ++refreshVersion;
    for (const pid of new Set([...chosen, pageSelect.value])) await load(pid);
    if (version !== refreshVersion) return;
    await show();
  }

  async function trial() {
    if (busy || maker.processing || maker.jobs.size) { status.textContent = "Wait for active processing to finish."; return; }
    const limit = Number(budget.value), reader = options.reader;
    if (!chosen.size || !candidates.size || !Number.isFinite(limit) || limit <= 0) { status.textContent = "Select sample pages and models, and enter a positive spend threshold."; return; }
    busy = maker.processing = true; stop = false;
    const ids = new Set([...candidates, reference.value]);
    progress.start(chosen.size * (2 + ids.size));
    let outcome = "Interrupted";
    let spend = 0, unknown = 0;
    const failures = [];
    const fields = [...content.querySelectorAll("input, select, button")].filter(field => field !== stopButton);
    for (const field of fields) field.disabled = true;
    maker.onCost = cost => cost === null ? unknown++ : spend += cost;
    const paused = () => stop || spend >= limit || unknown;
    try {
      await save();
      for (const pid of chosen) {
        if (paused()) break;
        let regionOutcome = "reused";
        try {
          if (!await maker.regions(pid) && !await book.current(pid)) {
            status.textContent = `Finding shared regions on ${pid}…`;
            await maker.findRegions(pid, { save: false });
            regionOutcome = "completed";
          }
        } catch (error) {
          failures.push(`${pid} · ${error.message}`);
          progress.advance("failed");
          progress.advance("skipped");
          continue;
        }
        progress.advance(regionOutcome);
        if (paused()) break;
        status.textContent = `Preparing the current transcription on ${pid}…`;
        try {
          await maker.completionInput(pid, { options: { ...options, reader } });
          progress.advance("reused");
        } catch (error) { failures.push(`${pid} · ${error.message}`); progress.advance("failed"); }
      }
      for (const id of ids) for (const pid of chosen) {
        if (paused()) break;
        await load(pid);
        const reading = inputs.get(pid);
        if (!reading) { progress.advance("skipped"); continue; }
        status.textContent = `Assigning schema on ${pid} with ${STRUCTURERS.find(profile => profile.id === id).label}…`;
        try {
          const structure = await maker.structure(pid, reading, { structurer: id });
          progress.advance(structure.cached ? "reused" : "completed");
        }
        catch (error) { failures.push(`${pid} · ${id} · ${error.message}`); progress.advance("failed"); }
      }
      status.replaceChildren(`New API spend ${money(spend)}. ${unknown} charges unavailable.${paused() ? " Stopped after the active call." : " Comparison saved."}`,
        ...failures.length ? [h("details", { open: true }, h("summary", {}, `${failures.length} failed stages`), ...failures.map(message => h("div", { class: "bad" }, message)))] : []);
      outcome = stop ? "Stopped" : unknown ? "Cost unavailable" : spend >= limit ? "Spend limit reached" : "Finished";
    } catch (error) {
      status.textContent = `Comparison interrupted. ${error.message}`;
    } finally {
      progress.finish(outcome);
      busy = maker.processing = false;
      for (const field of fields) field.disabled = false;
      await refresh();
    }
  }

  const stopButton = h("button", { onclick: () => { stop = true; } }, "Stop after the active call");
  for (const field of [reference, pageSelect, pageCount, budget, onlyDifferences, ...pages.flatMap(label => [...label.querySelectorAll("input")]), ...models.flatMap(label => [...label.querySelectorAll("input")])])
    field.addEventListener("change", async () => { try { await save(); await refresh(); } catch (error) { status.textContent = error.message; } });
  const content = h("div", { class: "checkview reader-lab" }, h("h2", {}, "Compare schema assignment models"),
    h("p", {}, "Compare units, line-end joins, continuations, reading flows and links using the same transcription for every model. Differences are measured against the selected reference. Schema validity checks consistency. Check the scan and book conventions to judge correctness."),
    h("p", { class: "box" }, `Fixed input · the current page transcription, including saved corrections. The book’s transcription model is ${readerById(options.reader).label}. `,
      h("button", { class: "link", onclick: () => app.setMode("readers") }, "Review transcription choice")),
    h("h3", {}, "1. Run a schema assignment comparison"),
    keyControls(maker.keys, (id, value) => settings.set(`key:${id}`, value)),
    h("details", { open: true }, h("summary", {}, "Sample pages and schema assignment models"), h("div", { class: "trial-selection" },
      h("fieldset", {}, h("legend", {}, "Sample pages"), ...pages), h("fieldset", {}, h("legend", {}, "Schema assignment models"), ...models))),
    h("div", { class: "fields col" }, h("label", {}, "Reference schema assignment from ", reference),
      h("label", {}, "Stop after an API call once new trial spend reaches $", budget)),
    h("p", { class: "hint" }, "Existing compatible transcriptions and schema assignments are reused. Transcribe pages before comparing their assignments. Every model receives the same printed text and neighboring transcription. A spend threshold can be exceeded by the final call. Failed and unresolved calls are saved in the shared attempt ledger on the Transcription models tab."),
    h("div", { class: "actions" }, h("button", { class: "primary", onclick: trial }, "Run schema comparison"), " ", stopButton, " ", h("button", { onclick: refresh }, "Refresh saved schema results")), progress.element, status,
    h("h3", {}, "2. Review costs and schema assignments"), h("label", {}, "Book pages ", pageCount),
    h("p", { class: "hint" }, "The single total includes region detection, the fixed input transcription and each model’s schema assignment. It projects one pass from whole-page samples at their recorded prices. Region repairs are excluded from this projection. Schema checks flag invalid results. All stage costs must be available."), summary,
    h("h3", {}, "Inspect schema choices"), h("label", {}, "Page ", pageSelect), " ", h("label", {}, onlyDifferences, " Focus on differing regions"),
    h("p", { class: "hint" }, "Amber marks assignments that differ from the reference. Number badges count changed categories. Select matching region labels to compare their unit membership and joins. Trees retain surrounding regions for context."), detail,
    choice, continueControls(app));
  el.replaceChildren(content);
  await refresh();
}
