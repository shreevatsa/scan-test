import { reviewPage } from "./review-view.js?v=20261112-regions-layout-1";
import { settledChecks } from "./review.js?v=20261112-regions-layout-1";
import { h, bbox, cropInto } from "./render.js";
import { modelChoice, keyControls, money, costEstimate } from "./reader-controls.js?v=20261112-regions-layout-1";
import { READERS, DEFAULT_TRANSCRIPTION_REFERENCE, readerById, readerOptions, bookCostEstimate, wholePageReading, structurePath, structurerById } from "./pipeline/readers.js?v=20261112-regions-layout-1";
import { finderById } from "./pipeline/finders.js?v=20261112-regions-layout-1";
import { CredentialChecks } from "./key-check.js?v=20261112-regions-layout-1";
import { transcriptionHtml } from "./transcription-diff.js";
import { selectPageRegions, readingFromDocument, plainReading } from "./pipeline/split.js";
import { compareReadings, comparePages } from "./pipeline/compare.js?v=20261112-regions-layout-1";
import { jsonHash, REQUEST_TIMEOUT_MS } from "./pipeline/run.js?v=20261112-regions-layout-1";
import { settings } from "./store.js?v=20261112-regions-layout-1";
import { runProgress } from "./run-progress.js";
import { readingFits } from "./pipeline/partial-reading.js?v=20261112-regions-layout-1";
import { sha256hex } from "./chayapdf.js";
import { layerState } from "./layers.js?v=20261112-regions-layout-1";

export async function renderReaders(el, app) {
  const token = Symbol();
  app.readerViewToken = token;
  el.replaceChildren(h("p", {}, "Loading transcription model settings…"));
  const book = app.book, maker = await app.getMaker();
  const defaults = readerOptions(await book.getReaderOptions(), book.types);
  const selection = await book.readWork("work/reader-lab/selection.json") || {};
  const choice = await modelChoice(book, "transcription", () => renderReaders(el, app));
  if (app.readerViewToken !== token || app.mode !== "readers") return;
  const candidates = new Set((selection.readers || READERS.filter(reader => reader.id !== "carbon-high").map(reader => reader.id))
    .filter(id => READERS.some(reader => reader.id === id)));
  const chosenPages = new Set((selection.pages || []).filter(id => id in book.index));
  const count = Math.min(6, book.pages.length);
  if (!selection.pages) for (let i = 0; i < count; i++) chosenPages.add(book.pages[Math.round(i * (book.pages.length - 1) / Math.max(1, count - 1))].id);
  let busy = false, stop = false, sessionCost = 0, unknownCosts = 0, refreshVersion = 0, detailVersion = 0;
  let differenceOffset = Number.isSafeInteger(selection.difference_offset) && selection.difference_offset >= 0 ? selection.difference_offset : 0;
  const differenceLimit = 20;
  const trialStatus = h("p", { class: "hint", role: "status" });
  const progress = runProgress("Transcription comparison progress");
  const summary = h("div", { class: "reader-summary" });
  const ledgerSummary = h("div", { class: "reader-ledger hint" });
  const detail = h("div", { class: "reader-detail" });
  const referenceId = selection.reference || DEFAULT_TRANSCRIPTION_REFERENCE;
  const referenceSelect = h("select", { "aria-label": "Reference transcription source" }, h("option", { value: "current", selected: referenceId === "current" }, "Current page text"),
    ...READERS.map(r => h("option", { value: r.id, selected: r.id === referenceId }, r.label)));
  const onlyDifferences = h("input", { type: "checkbox", checked: selection.only_differences ?? true });
  const includeStructure = h("input", { type: "checkbox", checked: selection.include_structure ?? true });
  const budget = h("input", { type: "number", min: "0.1", step: "0.5", value: selection.budget || "5", "aria-label": "Trial spend threshold" });
  const projectionPages = h("input", { type: "number", min: "1", step: "1", "aria-label": "Book pages for cost estimate",
    value: selection.projection_pages ?? book.manifest.cost_projection?.page_count ?? book.manifest.pdf?.page_count ?? book.pages.length });
  const pageBoxes = book.pages.map(p => {
    const input = h("input", { type: "checkbox", checked: chosenPages.has(p.id), onchange: () => input.checked ? chosenPages.add(p.id) : chosenPages.delete(p.id) });
    return h("label", {}, input, " ", p.label ? `${p.id} · ${p.label}` : p.id);
  });
  const readerBoxes = READERS.map(r => {
    const input = h("input", { type: "checkbox", checked: candidates.has(r.id), onchange: () => input.checked ? candidates.add(r.id) : candidates.delete(r.id) });
    return h("label", {}, input, " ", r.label);
  });
  const active = () => app.mode === "readers" && app.readerViewToken === token;
  const results = new Map(), geometry = new Map(), checks = new Map();
  const credentialChecks = maker.credentials ||= new CredentialChecks(maker.keys), credentials = h("div");

  function requiredProfiles(retry = null, options = defaults) {
    const ids = retry ? [retry.reader] : [...new Set([...candidates, ...(referenceSelect.value === "current" ? [] : [referenceSelect.value])])];
    const profiles = ids.map(readerById);
    if (includeStructure.checked || retry) profiles.push(structurerById(options.structurer));
    if ((retry ? [retry.pid] : [...chosenPages]).some(pid => !geometry.has(pid))) profiles.push(finderById(options.finder));
    return profiles;
  }

  function updateRun() { run.disabled = busy || !requiredProfiles().every(profile => credentialChecks.status(profile)?.valid); }
  function updateCredentials(retry = null) {
    credentials.replaceChildren(keyControls(credentialChecks, requiredProfiles(retry), (id, value) => settings.set(`key:${id}`, value), updateRun));
    updateRun();
  }

  async function saveSelection() {
    await book.writeWork("work/reader-lab/selection.json", { pages: [...chosenPages], readers: [...candidates], difference_offset: differenceOffset,
      reference: referenceSelect.value, only_differences: onlyDifferences.checked,
      include_structure: includeStructure.checked, budget: budget.value, projection_pages: projectionPages.value });
  }

  async function loadPage(pid, onlyProcessed = false) {
    const readings = await Promise.all(READERS.map(reader => book.readWork(`work/readings/${pid}/${reader.id}.json`)));
    results.delete(pid); geometry.delete(pid); checks.delete(pid);
    if (onlyProcessed && !readings.some(reading => reading?.status === "completed")) return null;
    let rec;
    try { rec = await maker.sourceRegions(pid); } catch { return null; }
    const { sent } = selectPageRegions(rec.regions);
    const signature = await jsonHash(rec.regions);
    const imageHash = await sha256hex(new Uint8Array(await (await book.imageBlob(pid)).arrayBuffer()));
    geometry.set(pid, { rec, sent, signature });
    const checked = { ...(await book.readWork(`work/reader-lab/checked/${pid}/${signature}.json`))?.lines };
    const current = await book.current(pid);
    for (const key of Object.keys(current?.source?.review?.text || {})) delete checked[key];
    checks.set(pid, { ...checked, ...(current ? settledChecks(current, sent) : {}) });
    const runs = new Map();
    for (const [index, reader] of READERS.entries()) {
      const reading = readings[index];
      let structure = await book.readWork(structurePath(pid, reader.id, defaults.structurer));
      const costStructure = structure;
      if (!readingFits(reading, rec, imageHash)) continue;
      if (structure?.reading_fingerprint !== reading.fingerprint) structure = null;
      if (structure) {
        const [errors, warnings] = app.check(structure.doc);
        structure = { ...structure, errors, warnings };
      }
      runs.set(reader.id, { reading, structure, costReading: await wholePageReading(book, reading), costStructure });
    }
    results.set(pid, runs);
    return { rec, sent, signature };
  }

  async function reference(pid, source = referenceSelect.value) {
    if (source !== "current") return results.get(pid)?.get(source)?.reading.parsed || null;
    const doc = await book.current(pid);
    return doc && layerState(doc, "text") && geometry.has(pid) ? readingFromDocument(doc, geometry.get(pid).sent) : null;
  }

  async function showSummary() {
    const rows = [];
    const shared = [...chosenPages].map(pid => {
      const runs = results.get(pid);
      const values = [runs?.get(defaults.reader), runs?.get(referenceSelect.value), ...(runs?.values() || [])].filter(Boolean);
      return { pid, regions: geometry.get(pid)?.rec.region_call || values.find(value => value.costReading?.regions_record?.region_call)?.costReading.regions_record.region_call,
        structure: values.find(value => Number.isFinite(value.costStructure?.cost_usd))?.costStructure };
    });
    for (const reader of READERS) {
      const runs = [...chosenPages].map(pid => ({ pid, value: results.get(pid)?.get(reader.id) })).filter(x => x.value);
      if (!runs.length) continue;
      let chars = 0, edits = 0, checkedChars = 0, checkedEdits = 0, valid = 0, structured = 0, compared = 0;
      for (const { pid, value } of runs) {
        const ref = await reference(pid);
        if (ref) {
          const score = compareReadings(value.reading.parsed, ref, geometry.get(pid).sent, book.types, checks.get(pid));
          chars += score.characters; edits += score.edits;
          checkedChars += score.checked_characters; checkedEdits += score.checked_edits; compared++;
        }
        valid += Number(value.structure && !value.structure.errors.length);
        structured += Number(Boolean(value.structure));
      }
      const estimate = bookCostEstimate(shared.map(sample => ({ ...sample, reading: results.get(sample.pid)?.get(reader.id)?.costReading })), Number(projectionPages.value));
      const historical = runs.filter(run => run.value.reading.partial && run.value.costReading).length;
      const seconds = runs.reduce((sum, x) => sum + x.value.reading.seconds + (x.value.structure?.seconds || 0), 0) / runs.length;
      rows.push(h("tr", {}, h("td", {}, reader.label, h("div", {}, `${runs.length}/${chosenPages.size} pages`),
        runs.some(run => run.value.reading.partial) ? h("div", { class: "meta" }, "Includes saved region repairs") : null,
        reader.id === defaults.reader ? h("div", { class: "ok" }, "Selected for this book") : null),
        h("td", {}, costEstimate(estimate), historical ? h("div", { class: "meta" }, `Uses ${historical} saved whole-page transcription prices from before region edits.`) : null),
        h("td", {}, chars ? (edits / chars * 1000).toFixed(2) : "—", compared ? h("div", { class: "meta" }, `${chars.toLocaleString()} characters`) : null),
        h("td", {}, checkedChars ? (checkedEdits / checkedChars * 1000).toFixed(2) : "—", checkedChars ? h("div", { class: "meta" }, `${checkedChars} checked characters`) : null),
        h("td", {}, structured ? `${valid}/${structured} valid` : "Pending"), h("td", {}, `${seconds.toFixed(1)} s`)));
    }
    if (!active()) return;
    summary.replaceChildren(rows.length ? h("div", { class: "table-scroll" }, h("table", { class: "pages" },
      h("thead", {}, h("tr", {}, ...["Transcription model", `Estimated total / ${Number(projectionPages.value).toLocaleString()} pages`, "Differences / 1,000 characters", "Checked errors / 1,000 characters", "Schema checks", "Transcription + schema time / page"].map(label => h("th", {}, label)))), h("tbody", {}, ...rows)))
      : h("p", { class: "hint" }, "Choose sample pages and transcription models, then run a trial. Saved trial results appear here."));
  }

  async function showLedger() {
    const ledger = await book.readWork("work/reader-lab/ledger.json");
    if (!active() || !ledger?.calls.length) return;
    const known = ledger.calls.filter(call => Number.isFinite(call.cost_usd));
    const detailed = ledger.calls.filter(call => call.partial || ["failed", "requesting"].includes(call.status));
    const messages = [];
    for (const call of detailed) {
      const record = await book.readWork(call.path);
      messages.push(`${call.page} · ${call.profile} · ${call.stage}${call.partial ? ` · regions ${call.region_ids.join(", ")}` : ""} · ${money(call.cost_usd)} · ${record?.error || call.status}`);
    }
    if (!active()) return;
    ledgerSummary.replaceChildren(h("p", {}, `Saved API attempts total ${money(known.reduce((sum, call) => sum + call.cost_usd, 0))} in known estimated charges. ${ledger.calls.length - known.length} charges are unresolved.`),
      ...messages.length ? [h("details", {}, h("summary", {}, "Region repairs and interrupted API attempts"), ...messages.map(message => h("div", {}, message)))] : []);
  }

  async function showDetail() {
    const version = ++detailVersion;
    const referenceId = referenceSelect.value;
    const referenceLabel = referenceSelect.selectedOptions[0].textContent;
    const pages = [];
    for (const page of book.pages) {
      const runs = results.get(page.id), geo = geometry.get(page.id);
      if (!runs?.size || !geo) continue;
      const models = READERS.map(model => ({ id: model.id, label: model.label, transcription: runs.get(model.id)?.reading.parsed || null }));
      models.sort((a, b) => Number(b.id === referenceId) - Number(a.id === referenceId));
      pages.push({ id: page.id, referenceId, reference: await reference(page.id, referenceId), models, sent: geo.sent });
    }
    const regions = comparePages(pages, book.types);
    const differing = regions.filter(region => region.differs);
    const shown = onlyDifferences.checked ? differing : regions;
    differenceOffset = Math.min(differenceOffset, Math.max(0, Math.ceil(shown.length / differenceLimit) - 1) * differenceLimit);
    const visible = shown.slice(differenceOffset, differenceOffset + differenceLimit);
    const visiblePages = [...new Set(visible.map(region => region.page))];
    const images = new Map(await Promise.all(visiblePages.map(async pid => [pid, await book.imageUrl(pid)])));
    if (!active() || version !== detailVersion) return;
    const move = async offset => {
      differenceOffset = Math.max(0, offset);
      try { await saveSelection(); await showDetail(); detail.scrollIntoView({ block: "start" }); }
      catch (error) { trialStatus.textContent = error.message; }
    };
    const pagination = () => h("nav", { class: "actions", "aria-label": "Transcription difference pagination" },
      h("button", { disabled: busy || differenceOffset === 0, onclick: () => move(differenceOffset - differenceLimit) }, "← Previous 20"),
      h("span", { role: "status" }, `Showing ${differenceOffset + 1}–${differenceOffset + visible.length} of ${shown.length} regions`),
      h("button", { disabled: busy || differenceOffset + differenceLimit >= shown.length, onclick: () => move(differenceOffset + differenceLimit) }, "Next 20 →"));
    const width = Math.min(1080, detail.clientWidth || el.clientWidth);
    const sections = [];
    for (const pid of visiblePages) {
      const geo = geometry.get(pid), models = pages.find(page => page.id === pid).models, runs = results.get(pid);
      const image = images.get(pid), page = book.page(pid);
      const pageTitle = `PDF page ${page.pdf_page || book.index[pid] + 1}${page.label ? ` · ${page.label}` : ""}`;
      const blocks = visible.filter(region => region.page === pid).map(region => {
        const crop = h("div", { class: "source-region", title: "Printed source region" });
        const [x0, y0, x1, y1] = bbox(region.source.polygons);
        cropInto(crop, image, geo.rec, [Math.max(0, x0 - 4), Math.max(0, y0 - 4), Math.min(geo.rec.width, x1 + 5), Math.min(geo.rec.height, y1 + 5)], width, 720);
        const referenceLines = region.lines.map(line => line.raw);
        const transcriptions = region.models.map(model => {
          const reference = model.id === referenceId;
          const note = model.transcription?.regions.find(source => source.id === region.id);
          return h("section", { class: `trial-transcription${reference ? " reference" : ""}`, "aria-label": `${pageTitle} · ${region.id} · ${model.label}` },
            h("h4", {}, model.label), h("div", { class: "meta" }, reference ? "Reference transcription"
              : model.lines ? `${model.edits} character differences · ${model.formatting_differences} lines differ in formatting or markers` : "Awaiting transcription"),
            model.lines ? h("pre", { html: transcriptionHtml(referenceLines, model.lines.map(line => line.candidate)) })
              : h("p", { class: "hint" }, "Run this transcription model on this page to add its result."),
            model.lines ? h("button", { class: "mini", onclick: () => reviewPage(app, { pid, layer: "text", region: region.id,
              path: `work/readings/${pid}/${model.id}.json`, onSaved: refresh }).catch(error => { trialStatus.textContent = error.message; }) }, "Review and choose transcription") : null,
            note?.uncertain || note?.note ? h("p", { class: "hint" }, `${note.uncertain ? "Uncertain transcription. " : ""}${note.note || ""}`) : null);
        });
        const referenceReview = region.lines.map(row => {
          const lineCrop = h("div", { class: "source-line", title: "Printed source line" });
          if (row.polygons.length) {
            const [x0, y0, x1, y1] = bbox(row.polygons);
            cropInto(lineCrop, image, geo.rec, [Math.max(0, x0 - 4), Math.max(0, y0 - 4), Math.min(geo.rec.width, x1 + 5), Math.min(geo.rec.height, y1 + 5)], width, 190);
          }
          const saved = checks.get(pid)[row.key];
          const corrected = h("textarea", { rows: "2", "aria-label": `Checked text ${pid} ${row.key}` });
          corrected.value = saved?.text ?? plainReading(row.raw);
          const checked = h("input", { type: "checkbox", checked: Boolean(saved?.checked) });
          const status = h("span", { class: "meta", role: "status" });
          corrected.addEventListener("input", () => { checked.checked = false; });
          const save = h("button", { class: "mini", onclick: async () => {
            try {
              if (checked.checked) return await reviewPage(app, { pid, layer: "text", region: row.region, line: row.line,
                correction: corrected.value, onSaved: refresh });
              const path = `work/reader-lab/checked/${pid}/${geo.signature}.json`;
              const next = await book.updateWork(path, old => ({ format: "checked-reading", version: 1,
                lines: { ...(old?.lines || {}), [row.key]: { text: corrected.value, checked: checked.checked } } }));
              checks.set(pid, next.lines);
              status.textContent = "Saved.";
              await showSummary();
            } catch (error) { status.textContent = error.message; }
          } }, "Save reference line");
          return h("section", { class: "trial-line" }, h("div", { class: "meta" }, `${row.region}, line ${row.n}`), h("div", { class: "source-line-scroll" }, lineCrop),
            h("label", { class: "stack" }, "Correct text after checking the scan", corrected),
            h("label", {}, checked, " I checked this line against the scan"), " ", save, " ", status);
        });
        return h("section", { class: "trial-region", "aria-label": `${pageTitle} · Region ${region.id}` }, h("h3", {}, `${pageTitle} · ${region.id} · ${region.source.type}`),
          h("div", { class: "source-line-scroll" }, crop),
          ...(referenceId === "current" ? [h("section", { class: "trial-transcription reference" }, h("h4", {}, referenceLabel), h("div", { class: "meta" }, "Reference transcription"), h("pre", { html: transcriptionHtml(referenceLines, referenceLines) }),
            h("button", { class: "mini", onclick: () => reviewPage(app, { pid, layer: "text", region: region.id, onSaved: refresh }).catch(error => { trialStatus.textContent = error.message; }) }, "Review current transcription"))] : []),
          ...transcriptions, h("details", {}, h("summary", {}, "Review reference lines against the scan"), ...referenceReview));
      });
      const pageReview = h("details", {}, h("summary", {}, `Review whole-page transcriptions for ${pageTitle}`),
        ...models.filter(model => model.transcription).map(model => h("button", { onclick: () => reviewPage(app, {
          pid, layer: "text", path: `work/readings/${pid}/${model.id}.json`, onSaved: refresh,
        }).catch(error => { trialStatus.textContent = error.message; }) }, model.label)));
      const diagnostics = h("details", { class: "trial-structure" }, h("summary", {}, "Optional schema check diagnostics"),
        ...models.filter(model => model.transcription).map(model => {
          const value = runs.get(model.id), structure = value?.structure;
          return h("details", {}, h("summary", {}, model.label), structure
            ? h("pre", {}, JSON.stringify({ units: structure.doc.units, flows: structure.doc.flows, relations: structure.doc.relations,
              errors: structure.errors, warnings: structure.warnings, problems: structure.problems }, null, 2))
            : h("p", { class: "hint" }, "Schema check pending for this transcription."),
          h("button", { class: "mini", disabled: busy, onclick: () => trial({ pid, reader: model.id }) }, "Retry this structural check with a new API call"));
        }));
      sections.push(h("section", { class: "trial-page", "aria-label": pageTitle }, pageReview, diagnostics, ...blocks));
    }
    detail.replaceChildren(h("p", { role: "status" }, `${differing.length} differing regions across ${new Set(differing.map(region => region.page)).size} pages.`),
      ...(shown.length > differenceLimit ? [pagination()] : []),
      ...sections,
      ...(!shown.length ? [h("p", { class: "hint" }, regions.length
        ? "The available transcriptions agree. Turn off the difference filter to inspect agreeing regions."
        : "Comparable pages need a reference and at least one other model’s transcription. Run a sample comparison to add them.")] : []),
      ...(shown.length > differenceLimit ? [pagination()] : []));
  }

  async function refresh() {
    const version = ++refreshVersion;
    for (const page of book.pages) {
      if (!active() || version !== refreshVersion) return;
      await loadPage(page.id, !chosenPages.has(page.id));
    }
    if (!active() || version !== refreshVersion) return;
    await showSummary();
    await showLedger();
    await showDetail();
    updateCredentials();
  }

  async function trial(retry = null) {
    const retryStructure = Boolean(retry);
    if (busy) return;
    if (maker.processing || maker.jobs.size) { trialStatus.textContent = "Wait for the active processing to finish."; return; }
    const limit = Number(budget.value);
    if (!chosenPages.size || !candidates.size || !Number.isFinite(limit) || limit <= 0) {
      trialStatus.textContent = "Select pages and transcription models, and enter a positive spend threshold.";
      return;
    }
    const samplePages = retry ? [retry.pid] : [...chosenPages];
    const ids = retry ? [retry.reader] : [...candidates];
    if (!retryStructure && referenceSelect.value !== "current" && !ids.includes(referenceSelect.value)) ids.push(referenceSelect.value);
    const withStructure = includeStructure.checked || retryStructure;
    const options = readerOptions(await book.getReaderOptions(), book.types);
    if (!requiredProfiles(retry, options).every(profile => credentialChecks.status(profile)?.valid)) {
      updateCredentials(retry);
      trialStatus.textContent = "Check the API credentials for the selected comparison models before running.";
      credentials.scrollIntoView({ block: "start" });
      return;
    }
    if (!await app.confirmSpending() || busy || maker.processing || maker.jobs.size) return;
    progress.start(samplePages.length * (1 + ids.length * (withStructure ? 2 : 1)));
    let outcome = "Interrupted";
    busy = true; maker.processing = true; stop = false; sessionCost = 0; unknownCosts = 0;
    const failures = [];
    const inputs = [...content.querySelectorAll("input,select,button")].filter(input => input !== stopButton);
    for (const input of inputs) input.disabled = true;
    maker.onCost = cost => { if (cost === null) unknownCosts++; else sessionCost += cost; };
    try {
      for (const pid of samplePages) {
        if (stop || sessionCost >= limit || unknownCosts) break;
        let regionOutcome = "reused";
        try {
          if (!await maker.regions(pid) && !await book.current(pid)) {
            trialStatus.textContent = `Finding shared regions on ${pid}…`;
            await maker.findRegions(pid, { save: false });
            regionOutcome = "completed";
          }
        } catch (error) { failures.push(`${pid} · ${error.message}`); regionOutcome = "failed"; }
        progress.advance(regionOutcome);
      }
      // Read all sample pages first so schema assignment can use their neighboring text.
      for (const reader of ids) {
        for (const pid of samplePages) {
          if (stop || sessionCost >= limit || unknownCosts) break;
          if (!candidates.has(reader) && results.get(pid)?.has(reader)) { progress.advance("reused"); continue; }
          trialStatus.textContent = `Transcribing ${pid} with ${READERS.find(model => model.id === reader).label}…`;
          try {
            const reading = await maker.read(pid, { ...options, reader });
            progress.advance(reading.cached ? "reused" : "completed");
          }
          catch (error) { failures.push(`${pid} · ${reader} · ${error.message}`); progress.advance("failed"); }
          await loadPage(pid);
          await showSummary();
        }
      }
      if (withStructure) for (const reader of ids) for (const pid of samplePages) {
        if (stop || sessionCost >= limit || unknownCosts) break;
        const reading = results.get(pid)?.get(reader)?.reading;
        if (!reading) { progress.advance("skipped"); continue; }
        trialStatus.textContent = `Building units for ${pid} from the ${READERS.find(model => model.id === reader).label} transcription…`;
        try {
          const structure = await maker.structure(pid, reading, { force: retryStructure, structurer: options.structurer });
          progress.advance(structure.cached ? "reused" : "completed");
        }
        catch (error) { failures.push(`${pid} · ${reader} · ${error.message}`); progress.advance("failed"); }
        await loadPage(pid);
        await showSummary();
      }
      trialStatus.replaceChildren(`Saved ${[...results.values()].reduce((n, runs) => n + runs.size, 0)} transcriptions. New API spend was ${money(sessionCost)}${unknownCosts ? `, with ${unknownCosts} costs unavailable` : ""}.${stop ? " Stopped after the active call." : sessionCost >= limit ? " Reached the spend threshold." : ""}`,
        ...failures.length ? [h("details", { open: true }, h("summary", {}, `${failures.length} failed stages`), ...failures.map(message => h("div", { class: "bad" }, message)))] : []);
      outcome = stop ? "Stopped" : unknownCosts ? "Cost unavailable" : sessionCost >= limit ? "Spend limit reached" : "Finished";
    } catch (error) {
      trialStatus.textContent = `Comparison interrupted. ${error.message}`;
    } finally {
      progress.finish(outcome);
      busy = false; maker.processing = false;
      for (const input of inputs) input.disabled = false;
      app.diskCopy?.checkpoint();
      await refresh();
    }
  }

  const run = h("button", { class: "primary", onclick: () => trial() }, "Run sample comparison");
  const stopButton = h("button", { onclick: () => { stop = true; } }, "Stop after the active call");
  const refreshButton = h("button", { onclick: refresh }, "Refresh saved results");
  for (const input of [referenceSelect, onlyDifferences, includeStructure, budget, projectionPages,
    ...pageBoxes.flatMap(x => [...x.querySelectorAll("input")]), ...readerBoxes.flatMap(x => [...x.querySelectorAll("input")])]) input.addEventListener("change", async () => {
    updateCredentials();
    if (input === referenceSelect || input === onlyDifferences) differenceOffset = 0;
    try { await saveSelection(); await refresh(); }
    catch (error) { trialStatus.textContent = error.message; }
  });
  const content = h("div", { class: "checkview reader-lab" }, h("h2", {}, "Compare transcription models"),
    h("p", {}, "Compare how models transcribe the same printed pages. Review the text differences and costs, then choose the transcription model for this book at the end of this page."),
    h("h3", {}, "1. Run a transcription comparison"),
    credentials,
    h("details", { open: true }, h("summary", {}, "Sample pages and transcription models"), h("div", { class: "trial-selection" },
      h("fieldset", {}, h("legend", {}, "Sample pages"), ...pageBoxes), h("fieldset", {}, h("legend", {}, "Transcription models"), ...readerBoxes))),
    h("div", { class: "fields col" }, h("label", {}, "Reference transcription from ", referenceSelect),
      h("label", {}, "Stop after an API call once new trial spend reaches $", budget)),
    h("details", { class: "trial-cost-settings" }, h("summary", {}, "Whole-book estimate settings"),
      h("p", { class: "hint" }, `For total-cost estimates, every transcription uses the fixed ${structurerById(defaults.structurer).label} schema assignment model. Its measured price is shared across the transcription models. Page-region detection uses ${finderById(defaults.finder).label}. Schema models are compared on the next page.`),
      h("label", {}, includeStructure, " Include fixed-model schema assignment in this trial")),
    h("p", { class: "hint" }, `The reference transcription comes from the selected source above. Argon high is the default reference. Error scores use only the reference lines you mark checked against the scan. Missing regions are detected once and shared across transcription models. Requests time out after ${REQUEST_TIMEOUT_MS / 1000} seconds. A spend threshold can be exceeded by the final call.`),
    h("div", { class: "actions" }, run, " ", stopButton, " ", refreshButton), progress.element, trialStatus,
    h("h3", {}, "2. Review costs and transcription differences"), h("label", {}, "Book pages ", projectionPages),
    h("p", { class: "hint" }, `${book.manifest.cost_projection?.label ? `Default target is ${book.manifest.cost_projection.label}. ` : ""}Change the page count to estimate another book size, including 1,000 pages. Each stage uses its available sample costs, including region detection once per page. Original whole-page readings supply transcription prices after region edits. Unmeasured stages are named beside the subtotal. Repair and retry charges appear in the saved-attempt ledger.`),
    summary, ledgerSummary,
    h("h3", {}, "Inspect the transcriptions"), h("div", { class: "fields" },
      h("label", {}, onlyDifferences, " Show differing regions only")),
    h("p", { class: "diff-legend hint" }, h("span", { class: "diff-text" }, "Text difference"), " · ", h("span", { class: "diff-format" }, "Formatting difference"), " · ",
      h("span", { class: "diff-omitted", "data-missing": "Omitted reference text", "aria-label": "Omitted reference text" }), " · Highlights keep grapheme clusters and Indic conjuncts together."), detail,
    choice, h("section", { class: "reader-next" },
      h("p", {}, "After saving the transcription model, compare schema assignment models using its transcription."),
      h("button", { onclick: () => app.setMode("structures") }, "Compare schema assignment with the saved transcription model →")));
  el.replaceChildren(content);
  await refresh();
}
