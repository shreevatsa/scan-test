import { suggestionButton } from "./review-view.js?v=20261113-noink-1";
import { h, bbox, cropInto } from "./render.js";
import * as ops from "./ops.js?v=20261113-noink-1";
import { applyUnitAction, applyUnitChanges, assertJoinMetadata, joinPartnerId, nextPageUnit, unitPath, unitRegionIds, unitSnapshot } from "./editing.js?v=20261113-noink-1";
import { joinFollowingUnit } from "./reading-edit.js?v=20261113-noink-1";
import { renderInspector } from "./editor.js?v=20261113-noink-1";
import { checkPage } from "./schema.js?v=20261113-noink-1";

const nameOf = unit => [unit.type, unit.number, unit.label].filter(Boolean).join(" · ");

export function readingIssues(docs, types, validate, warnings, canonical) {
  const issues = [];
  for (const doc of docs) {
    const [errors, notes] = checkPage(validate, doc, types);
    for (const message of [...errors, ...notes]) {
      const unit = /\bunit ([^\s:]+)/.exec(message)?.[1];
      const region = /\bregion [^#\s]+#([^\s:]+)/.exec(message)?.[1];
      const uid = unit && doc.units.some(value => value.id === unit) ? unit : region ? ops.ownerOf(doc, region)?.id : doc.flows.main?.[0] || doc.units[0]?.id;
      issues.push({ message, targets: [{ page: doc.page.id, unit: uid, region }] });
    }
  }
  for (const message of warnings) {
    const targets = [...message.matchAll(/([A-Za-z0-9._-]+)#([A-Za-z0-9._-]+)/g)].filter(match => canonical[match[0]])
      .map(match => ({ page: match[1], unit: match[2] }));
    const boundary = /page ([^,\s]+), flow ([^:]+):/.exec(message), doc = boundary && docs.find(doc => doc.page.id === boundary[1]);
    const root = doc?.flows[boundary[2]]?.[0];
    if (root && !targets.some(target => target.page === doc.page.id && target.unit === root)) targets.push({ page: doc.page.id, unit: root });
    issues.push({ message, targets });
  }
  return issues;
}

export async function wireReadingPanel({ app, body, panel, workspace, docs, P, issues, redraw }) {
  const book = app.book, byPage = new Map(docs.map(doc => [doc.page.id, doc]));
  let active = true, sequence = 0, busy = false;
  const check = (doc, types) => checkPage(app.validate, doc, types)[0];
  const select = async (input, initial = false) => {
    if (!active || busy || app.workflowBusy && !initial) return;
    const doc = byPage.get(input.page);
    if (!doc) return;
    let uid = input.unit && doc.units.some(unit => unit.id === input.unit) ? input.unit : ops.ownerOf(doc, input.region)?.id;
    const rid = input.region && doc.page.regions.some(region => region.id === input.region) ? input.region : uid ? unitRegionIds(doc, uid)[0] : doc.page.regions[0]?.id;
    const region = doc.page.regions.find(region => region.id === rid), current = ++sequence;
    app.readSelection = { page: doc.page.id, unit: uid, region: rid, marker: input.marker };
    panel.hidden = false; workspace.classList.add("with-selection");
    const canonical = uid && P.unitCanonical[`${doc.page.id}#${uid}`], fragments = P.unitFragments[canonical] || [];
    for (const el of body.querySelectorAll("[data-uid]")) el.classList.toggle("selected", el.dataset.uid === canonical);
    const heading = h("div", { class: "read-panel-head" }, h("h3", {}, "Selected passage"), h("button", { "aria-label": "Close passage panel", onclick: () => {
      app.readSelection = null; panel.hidden = true; workspace.classList.remove("with-selection");
      body.querySelectorAll(".selected").forEach(el => el.classList.remove("selected"));
    } }, "Close"));
    const crumbs = h("nav", { class: "unit-crumbs", "aria-label": "Unit hierarchy" });
    if (uid) for (const unit of unitPath(doc, uid)) crumbs.append(h("button", { class: "link", onclick: () => select({ page: doc.page.id, unit: unit.id, region: rid }) }, nameOf(unit)), " › ");
    const source = h("div", { class: "read-unit-source", "aria-label": `Source on page ${book.index[doc.page.id] + 1}` });
    const controls = h("div", { class: "read-unit-controls inspector" }), status = h("p", { role: "status" });
    panel.replaceChildren(heading, crumbs, h("p", { class: "hint" }, `Page ${book.index[doc.page.id] + 1}${doc.page.label ? ` · printed ${doc.page.label}` : ""}${region ? ` · ${region.id}` : ""}`), source);
    if (fragments.length > 1) panel.append(h("p", { class: "hint" }, `This unit has ${fragments.length} page fragments. Its semantic fields and wrapping apply to the whole unit. Splits and open ends apply to this fragment.`),
      h("div", { class: "actions" }, ...fragments.map(fragment => h("button", { class: "mini", onclick: () => select({ page: fragment.page, unit: fragment.unit }) }, `Page ${book.index[fragment.page] + 1}`))));
    const owned = uid ? unitRegionIds(doc, uid) : region ? [rid] : [];
    if (owned.length > 1) panel.append(h("label", {}, "Source region ", h("select", { "aria-label": "Source region", onchange: event => select({ page: doc.page.id, unit: uid, region: event.target.value }) },
      ...owned.map(id => h("option", { value: id, selected: id === rid }, id)))));
    panel.append(h("p", {}, h("button", { onclick: () => app.openPage(doc.page.id, uid ? { unit: uid } : { region: rid }, "read") }, "Open this page")), status);
    const setBusy = value => {
      busy = value; app.workflowBusy = value;
      panel.querySelectorAll("button,input,select,textarea").forEach(control => { control.disabled = value; });
      if (value) status.textContent = "Saving changes…";
      else if (status.textContent === "Saving changes…") status.textContent = "";
    };
    const save = async operation => {
      if (busy || app.workflowBusy) return;
      setBusy(true);
      try {
        const changed = await operation();
        for (const pid of Object.keys(changed)) await app.refreshWorkflowPage(pid);
        app.readSelection = { page: doc.page.id, region: rid, ...adapter.selection };
        await redraw();
      } catch (error) {
        status.textContent = error.message; app.toast(error.message, "warn");
        await redraw();
      } finally { setBusy(false); }
    };
    const adapter = {
      book, doc, tl: book.types, stage: "read", readPanel: true, selection: input.marker ? { marker: input.marker } : uid ? { unit: uid } : { region: rid },
      lineJoinsOpen: app.readLineJoins ||= new Set(),
      colors: app.colors, furniture: app.furniture, textPanel: { lastSel: null },
      select: selection => select({ page: doc.page.id, ...selection }),
      displayUnit: id => {
        const unit = P.units[P.unitCanonical[`${doc.page.id}#${id}`]];
        return unit ? { type: unit.type, number: unit.number, label: unit.label, lang: unit.lang } : {};
      },
      edit: fn => {
        if (busy || app.workflowBusy) return false;
        try {
          const preview = structuredClone(doc); fn(preview);
          save(() => book.editPages([doc.page.id], latest => {
            latest.set(doc.page.id, applyUnitChanges(doc, preview, latest.get(doc.page.id))); return latest;
          }, { check, expected: new Map([[doc.page.id, unitSnapshot(doc)]]) }));
          return true;
        } catch (error) { app.toast(error.message, "warn"); return false; }
      },
      unitAction: (id, action, value) => {
        const whole = ["type", "number", "label", "lang", "wrap", "unwrap", "furniture"].includes(action);
        const pieces = whole ? P.unitFragments[P.unitCanonical[`${doc.page.id}#${id}`]] || [{ page: doc.page.id, unit: id }] : [{ page: doc.page.id, unit: id }];
        const ids = [...new Set(pieces.map(piece => piece.page))];
        save(() => book.editPages(ids, (latest, types) => {
          for (const piece of pieces) {
            const selection = applyUnitAction(latest.get(piece.page), types, piece.unit, action, value);
            if (piece.page === doc.page.id) adapter.selection = selection;
          }
          return latest;
        }, { check, expected: new Map(ids.map(pid => [pid, unitSnapshot(byPage.get(pid))])) }));
      },
      joinNext: id => {
        const pieces = P.unitFragments[P.unitCanonical[`${doc.page.id}#${id}`]] || [{ page: doc.page.id, unit: id }], last = pieces.at(-1);
        save(async () => {
          const left = byPage.get(last.page), place = ops.placeOf(left, last.unit), sibling = place?.list[place.index + 1];
          // Across a page break the partner is the next page, or the first later page with a unit of its kind (past a blank page or a plate).
          const partner = sibling ? null : await joinPartnerId(book.pages, book.index[last.page], left, last.unit, pid => byPage.get(pid));
          const right = sibling ? left : partner && partner !== "missing" ? byPage.get(partner) : null;
          if (!right) throw new ops.EditError(partner === null && !sibling ? "There is no consecutive next page to join." : "Move the next page on from Text before joining it.");
          const next = sibling ? typeof sibling === "string" ? sibling : sibling.unit : nextPageUnit(left, right, last.unit);
          if (!next) throw new ops.EditError("The next item is a region. Join its unit from the page editor.");
          const a = sibling ? [ops.unitById(left, last.unit)] : unitPath(left, last.unit);
          const b = sibling ? [ops.unitById(right, next)] : unitPath(right, next);
          const ids = new Set();
          for (let i = 0; i < a.length; i++) {
            const first = P.unitCanonical[`${left.page.id}#${a[i].id}`], second = P.unitCanonical[`${right.page.id}#${b[i].id}`];
            assertJoinMetadata(P.units[first], P.units[second]);
            for (const piece of [...P.unitFragments[first], ...P.unitFragments[second]]) ids.add(piece.page);
          }
          return joinFollowingUnit(app, last.page, last.unit, new Map([...ids].map(pid => [pid, unitSnapshot(byPage.get(pid))])));
        });
      },
    };
    for (const issue of issues.filter(issue => issue.targets.some(target => target.page === doc.page.id && (!target.unit || target.unit === uid)))) panel.append(h("p", { class: "box warn" }, issue.message));
    if (P.provisionalPages.has(doc.page.id)) panel.append(h("p", { class: "box warn" }, "This page has provisional unit grouping."), book.writable ? h("button", { onclick: () => {
      app.pendingStageSelection = { stage: "read", ids: [doc.page.id] }; app.setMode("read&view=pages");
    } }, "Review completion of this page") : null);
    panel.append(suggestionButton(app, doc.page.id, null, redraw));
    if (book.writable) { panel.append(controls); renderInspector(controls, adapter); }
    else panel.append(h("p", { class: "hint" }, "Inspection of a read-only book."));
    if (region) {
      try {
        const url = await book.imageUrl(doc.page.id);
        if (!active || sequence !== current) return;
        cropInto(source, url, doc.page, region.box || bbox(region.polygons), 360, 260);
      } catch (error) { source.textContent = error.message; }
    }
  };
  for (const issue of issues) {
    const marked = new Set();
    for (const target of issue.targets) {
      const canonical = P.unitCanonical[`${target.page}#${target.unit}`];
      const unit = canonical && body.querySelector(`[data-uid="${CSS.escape(canonical)}"]`);
      if (!unit || marked.has(canonical)) continue;
      marked.add(canonical);
      unit.classList.add("r-problem");
      const badge = h("button", { class: "r-problem-mark", title: issue.message, "aria-label": issue.message, onclick: event => { event.stopPropagation(); select(target); } }, "⚠ Review");
      unit.prepend(badge);
    }
  }
  body.addEventListener("click", event => {
    if (event.target.closest(".r-pb,.r-problem-mark")) return;
    const marker = event.target.closest(".r-mk"), back = event.target.closest(".r-back");
    if (marker || back) {
      event.preventDefault();
      const id = (marker || back).getAttribute("href")?.slice(1), target = id && body.querySelector(`#${CSS.escape(id)}`);
      target?.scrollIntoView({ block: "center" });
    }
    const region = event.target.closest(".r-reg");
    if (region) {
      const [page, rid] = region.dataset.ref.split("#");
      const sid = marker?.id?.replace(/^mk-/, "").split("#")[1];
      select({ page, region: rid, marker: sid });
    } else {
      const unit = event.target.closest("[data-uid]");
      const first = P.unitFragments[unit?.dataset.uid]?.[0];
      if (first) select({ page: first.page, unit: first.unit });
    }
  });
  const selectIssue = issue => { const target = issue.targets.at(-1); if (target) select(target); };
  app.selectReadingIssue = selectIssue;
  if (app.readSelection && byPage.has(app.readSelection.page)) await select(app.readSelection, true);
  return () => { active = false; sequence++; if (app.selectReadingIssue === selectIssue) app.selectReadingIssue = null; };
}
