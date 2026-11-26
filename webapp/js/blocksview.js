import { TextPanel, renderInspector, structurePanel } from "./editor.js?v=20261125-v1-phase3";
import { blockContext, blockLineEnd, blockName, isProseBlock, pageBlocks } from "./blocks.js?v=20261125-v1-phase3";
import { bookReading } from "./reading.js?v=20261125-v1-phase3";
import { ignoredLines, linePosition, regionFlags, regionHasText, textFlags } from "./flags.js?v=20261125-v1-phase3";
import { h, bbox, cropInto } from "./render.js?v=20261125-v1-phase3";
import * as ops from "./ops.js?v=20261125-v1-phase3";
import { cp, MARKER, shiftSpans } from "./inline.js?v=20261125-v1-phase3";
import { noteProblems } from "./note-links.js?v=20261125-v1-phase3";
import { newTypeDialog, regionTools } from "./regionsview.js?v=20261125-v1-phase3";
import { suggestionButton } from "./review-view.js?v=20261125-v1-phase3";
import { itemNames, normalizeTypeName, proposedOnPage, readPendingProposals, typeNameStyle } from "./type-additions.js?v=20261125-v1-phase3";
import { pageReviewState } from "./layers.js?v=20261125-v1-phase3";
import { readingOrderWarnings } from "./schema.js?v=20261125-v1-phase3";
import { nextPageToCheck, noContent, REVIEW_LABELS } from "./workflow.js?v=20261125-v1-phase3";

export function projectOpenBook(app) {
  const { book, doc } = app;
  const saved = book.pages.map(page => page.id === doc?.page.id ? doc : app.pageStates.get(page.id)?.doc).filter(Boolean);
  return bookReading(book.pages, saved, book.types, book.skipped, book.rules);
}

const tag = (type, colors) => h("span", { class: "block-tag", style: `--block-color:${colors[type] || "#65716c"}` }, blockName(type));

function typesMenu(app, selected, changed) {
  const options = Object.entries(app.tl.types).filter(([, type]) => type.region);
  return h("select", { "aria-label": "Block type", disabled: !app.book.writable, onchange: event => changed(event.target.value) },
    selected ? null : h("option", { value: "", disabled: true, selected: true }, "Choose a type"),
    ...options.map(([type]) => h("option", { value: type, selected: type === selected }, blockName(type))));
}

// The type-list name a region's proposed type would have (spaces become underscores), or "".
export const proposedTypeName = region => typeNameStyle(region?.proposed_type || "");

// "Add type X": the new-type dialog filled in with the proposal (its definition and class from the saved proposals, when
// the book has them), which adds the type to the list and gives the area that type.
export async function addProposedType(app, name, region, index) {
  const key = normalizeTypeName(name);
  const record = await readPendingProposals(app.book).catch(() => null);
  const item = record?.items.find(item => item.kind === "new_type" && itemNames(item).some(value => normalizeTypeName(value) === key));
  const proposal = item?.proposal || {};
  newTypeDialog(app, type => app.restoreProposed(region.proposed_type || name, type), true, { name, description: proposal.description || "",
    region: proposal.region, furniture: proposal.furniture });
}

// The page's checks: [{ text, label, action, leaveOut?, leaveLabel?, extra?, at?, selects? }]. `at` is what the check is
// about, where it has a place on the scan ({ region } a block, { omitted } an area without a type, { box } a line):
// such a check is marked "!" there (and on its block); the others are listed at the top of the page. `selects` marks
// an action that only selects that place, which a click on its "!" does already.
export function blockChecks(app, doc, projection) {
  const { tl } = app;
  const findings = [], add = (text, label, action, leaveOut, at = null, selects = false) => findings.push({ text, label, action, leaveOut, at, selects });
  const openBlock = rid => rid && app.select({ region: rid });
  const scan = box => { app.pageView.markLine({ pinned: box }); app.pageView.revealBox(box); };
  const details = () => app.textPanel.showDetails(doc);
  const plain = {
    uncertain: "Check this block’s type and outline.",
    "unknown-type": "Give this block a type.",
    "missing-order": "Place this block in reading order.",
    "no-ink": "Check this area of the scan for faint text.",
    overlap: "Two scan boxes overlap.",
    "missing-text": "Some lines in this block need text.",
    continuation: "Check whether this passage continues on the next or previous page.",
    geometry: "Check the scan outlines.",
    "line-count": "Some transcribed lines need to be matched to the scan.",
    "region-warning": "The region finder flagged something to review.",
    "type-revision": "Check whether a figure’s outline needs to be drawn again.",
  };
  // A region the finder could not match to a listed type carries `proposed_type`: it can be added to the type list, and
  // the region given that type, or reviewed or left out as any unassigned area.
  // One decision for the book: adding (or using) the type makes every area waiting for it a block, with its text.
  const waitingInBook = name => [...(app.pageStates?.values() || [])].reduce((n, state) => n + proposedOnPage(state.doc, new Set([normalizeTypeName(name)])), 0);
  const addProposed = (proposed, text, region, index, leave, { review, leaveLabel, at = null } = {}) => {
    const known = tl.types[proposed]?.region, count = waitingInBook(region.proposed_type || proposed);
    findings.push({ text: count > 1 ? `${text} The finder marked ${count} areas in the book this way.` : text, leaveOut: leave, leaveLabel, at,
      label: known ? `Use type ${proposed}` : `Add type ${proposed}`,
      action: () => known ? app.restoreProposed(region.proposed_type || proposed, proposed) : addProposedType(app, proposed, region, index),
      extra: [{ label: review ? "Show block" : "Review area", action: review || (() => app.select({ omitted: index })), selects: true }] });
  };
  const flags = [...regionFlags(doc, tl, app.regionFlagContext(doc)), ...textFlags(doc, tl)];
  const see = new Set();
  for (const flag of flags) {
    const key = `${flag.code}:${flag.region || flag.line_id || ""}`;
    if (see.has(key)) continue;
    see.add(key);
    if (flag.code === "uncovered") {
      const line = doc.source.uncovered_lines.find(line => line.line_id === flag.line_id);
      add(`Possible missed line ${linePosition(flag.box, doc.page)}${line?.text?.trim() ? `: “${line.text.trim().slice(0, 60)}”` : ""}.`, "Review line", () => {
        scan(flag.box);
        app.textPanel.reviewFinding(line);
      }, () => app.edit(next => ops.ignoreLine(next, line)), flag.box ? { box: flag.box, line: flag.line_id } : null);
      if (line) Object.assign(findings.at(-1), { addAs: type => app.addRegionOverLine(line.line_id, type), selects: true });
    } else if (flag.code === "marks-only") {
      add("The region finder kept nothing on this page, though the scan has some marks. A cover, a library's notice or a blank leaf is best left out of the book.",
        app.book.writable && !app.book.isSkipped(doc.page.id) ? "Leave the page out" : "Show the marks",
        app.book.writable && !app.book.isSkipped(doc.page.id) ? async () => { await app.book.setSkipped([doc.page.id], true); await app.refreshWorkflowPage(doc.page.id); app.refreshWorkflowFlags(); app.toast("The page is left out of the book (Pages: ↺ brings it back)."); app.textPanel?.render(); }
          : () => app.pageView.markLine({ pinned: doc.source.uncovered_lines[0]?.box }));
    } else if (flag.code === "omitted") {
      const index = doc.source.omitted_regions.findIndex(region => region.region === flag.region);
      const region = doc.source.omitted_regions[index], proposed = proposedTypeName(region);
      const leave = () => app.edit(next => { ops.ignoreOmittedRegion(next, index); app.selection = {}; });
      if (proposed) addProposed(proposed, `An area may be a new type, “${region.proposed_type}”.`, region, index, leave, { at: { omitted: index } });
      else add("An area on the scan needs a type.", "Review area", () => app.select({ omitted: index }), leave, { omitted: index }, true);
    } else if (flag.code === "proposed") {
      // A block kept under a type of its kind while the type proposed for it waits: add that type (for every such block of
      // the book), or keep the block as it is.
      const region = doc.page.regions.find(value => value.id === flag.region), proposed = typeNameStyle(region.source.proposed_type);
      const keep = () => app.edit(next => { const block = next.page.regions.find(value => value.id === region.id); if (block) delete block.source.kept_as; });
      addProposed(proposed, `This block may be a new type, “${region.source.proposed_type}”; it is a ${region.type.replaceAll("_", " ")} meanwhile.`,
        { proposed_type: region.source.proposed_type }, null, keep, { review: () => openBlock(region.id), leaveLabel: `Keep as ${region.type.replaceAll("_", " ")}`, at: { region: region.id } });
    } else if (plain[flag.code]) {
      add(plain[flag.code], flag.region ? "Show block" : flag.box ? "Show scan" : "Review",
        flag.region ? () => openBlock(flag.region) : flag.box ? () => scan(flag.box) : details, null,
        flag.region ? { region: flag.region } : flag.box ? { box: flag.box } : null, Boolean(flag.region || flag.box));
    }
  }
  for (const region of pageBlocks(doc, tl)) {
    if (tl.types[region.type]?.region === "figure" || regionHasText(region)) continue;
    if (!see.has(`missing-text:${region.id}`) && !see.has(`no-ink:${region.id}`)) add(`This ${blockName(region.type).toLowerCase()} needs text.`, "Show block", () => openBlock(region.id), null, { region: region.id }, true);
  }
  const derived = projection?.docs.find(item => item?.page.id === doc.page.id);
  if (derived) {
    const { notes, markers } = noteProblems(derived, projection.noteTypes, projection.mainTypes);
    if (notes.length || markers.length) {
      add(`${notes.length ? `${notes.length} ${notes.length === 1 ? "note has" : "notes have"} no matching marker` : ""}${notes.length && markers.length ? " and " : ""}${markers.length ? `${markers.length} ${markers.length === 1 ? "marker has" : "markers have"} no matching note` : ""}.`,
        "Review notes", () => openBlock(doc.page.regions.find(region => projection.noteTypes.has(region.type))?.id ||
          doc.page.regions.find(region => region.lines?.some(line => line.spans?.some(span => span.kind === "note_marker")))?.id));
    }
  }
  if (doc.source?.dropped_overrides) add("A grouping you made here no longer applies.", "OK", () => app.edit(next => { delete next.source.dropped_overrides; }));
  if (Object.keys(doc.source?.suggestions || {}).length) add("A model suggestion is ready to review.", "Review suggestion", () => app.textPanel.showSuggestion());
  const [errors, warnings] = app.check(doc);
  const orderWarning = warning => warning.includes("The saved box order puts ");
  // A page in the blocks form is read as reading.js derives it, so its order is checked there.
  const order = warnings.find(orderWarning) || (doc.overrides && derived ? readingOrderWarnings(derived, app.tl)[0] : undefined);
  if (order && app.book.writable && derived) add(order.replace(/^page .+?, flow .+?: /, ""), "Use reader order",
    () => app.edit(next => ops.orderAsRead(next, derived, app.tl)));
  if (errors.length || warnings.some(warning => !orderWarning(warning)) || !app.book.writable && warnings.length)
    add("Review the page checks.", "Show details", details);
  return findings;
}

// The key of a check's place (`at`), and its box on the scan.
const checkKey = at => at.region ? `r:${at.region}` : at.omitted !== undefined ? `o:${at.omitted}` : `b:${at.box.join(",")}`;
function placeBox(doc, at) {
  if (at.region) { const region = doc.page.regions.find(value => value.id === at.region); return region && (region.box || bbox(region.polygons)); }
  if (at.omitted !== undefined) return doc.source?.omitted_regions?.[at.omitted]?.box;
  return at.box;
}

export class BlocksPanel extends TextPanel {
  get textEditable() { return this.app.book.writable && super.textEditable; }
  get unitsEditable() { return false; }

  render() {
    const { app, el } = this, { doc, tl, colors } = app;
    const oldScroll = el.scrollTop;
    this.projection = app.reading();
    this.context = blockContext(app.derivedDoc());
    const review = pageReviewState(doc);
    this.findings = h("div", { class: "block-findings" });
    this.reviewItem = h("div", { class: "block-review-item" });
    el.replaceChildren(h("section", { class: "block-check" },
      h("div", { class: "block-check-head" }, h("h2", {}, "Check this page"),
        !app.book.isSkipped(doc.page.id) && !noContent(doc) ? h("div", { class: "block-review-status" }, h("span", {}, REVIEW_LABELS[review.status]),
          app.book.writable ? h("button", { onclick: () => app.setPageReviewed(!review.checked) }, review.checked ? "Reopen review" : "Mark checked") : null) : null,
        h("button", { onclick: () => this.nextPageToCheck() }, "Next page to check")),
      this.findings, this.reviewItem));
    const ignored = ignoredLines(doc);
    if (ignored.length) el.firstChild.append(h("details", {}, h("summary", {}, `Ignored lines (${ignored.length})`),
      ...ignored.map(entry => {
        const box = typeof entry === "number" ? doc.source.uncovered_lines?.find(line => line.line_id === entry)?.box : entry.box;
        return h("p", {}, `Line ${linePosition(box, doc.page) || "outside the boxes"} `,
          app.book.writable ? h("button", { onclick: () => app.edit(next => ops.restoreLine(next, entry)) }, "Restore") : null);
      })));
    const ignoredRegions = doc.source?.ignored_regions || [];
    if (ignoredRegions.length) el.firstChild.append(h("details", {}, h("summary", {}, `Left out of the book (${ignoredRegions.length})`),
      ...ignoredRegions.map((region, index) => h("p", {}, `${region.block ? `A ${blockName(region.block.type).toLowerCase()}` : "An area"} ${linePosition(region.box, doc.page) || "on the scan"}${region.block && regionHasText(region.block) ? `: “${(region.block.lines || []).map(line => line.text || "").join(" ").trim().slice(0, 50)}”` : ""} `,
        app.book.writable ? h("button", { onclick: () => app.edit(next => ops.restoreOmittedRegion(next, index)) }, "Restore") : null))));
    const blocks = pageBlocks(doc, tl, this.context);
    let prior = [];
    for (const region of blocks) {
      const path = this.context.get(region.id)?.containers || [];
      const block = this.block(region, path.length);
      block.prepend(...path.filter((container, index) => container !== prior[index]).map(container =>
        h("div", { class: "block-bracket" }, [container.number, container.label || blockName(container.type)].filter(Boolean).join(" · "))));
      if (path.length) prior = path;
      else if (tl.types[region.type]?.role !== "furniture" && tl.types[region.type]?.region !== "note") prior = [];
      el.append(block);
    }
    if (!blocks.length) el.append(h("p", { class: "hint" }, "There are no blocks on this page."));
    this.refreshFindings();
    el.scrollTop = oldScroll;
    this.markSelection();
  }

  // The page's checks: those about a place on the scan marked "!" there and on their block (a click opens them:
  // openCheck), the others listed at the top.
  refreshFindings() {
    const { app } = this, doc = app.doc;
    const findings = blockChecks(app, doc, this.projection), loose = [];
    this.placed = new Map();
    for (const finding of findings) {
      const box = finding.at && placeBox(doc, finding.at);
      if (!box) { loose.push(finding); continue; }
      const key = checkKey(finding.at);
      if (!this.placed.has(key)) this.placed.set(key, { key, at: finding.at, box, findings: [] });
      this.placed.get(key).findings.push(finding);
    }
    const places = [...this.placed.values()].sort((a, b) => a.box[1] - b.box[1] || a.box[0] - b.box[0]);
    app.pageView.setChecks(places.map(place => ({ key: place.key, box: place.box, title: place.findings.map(finding => finding.text).join("\n") })));
    this.el.querySelectorAll(".block-check-badge").forEach(badge => badge.remove());
    for (const place of places) if (place.at.region) {
      const label = this.el.querySelector(`.block-card[data-rid="${CSS.escape(place.at.region)}"] > .block-label`);
      label?.after(h("button", { class: "block-check-badge", title: place.findings.map(finding => finding.text).join("\n"),
        "aria-label": `Check: ${place.findings[0].text}`, onclick: event => { event.stopPropagation(); this.openCheck(place.key, event.currentTarget); } }, "!"));
    }
    const n = places.length;
    this.findings.replaceChildren(...[
      loose.length ? h("ul", {}, ...loose.map(finding => h("li", {}, h("span", {}, finding.text), h("div", { class: "actions" }, ...this.findingButtons(finding))))) : null,
      n ? h("p", { class: "block-check-placed" }, h("span", { class: "check-mark" }, "!"),
        ` ${n === 1 ? "One place" : `${n} places`} on the scan ${n === 1 ? "has" : "have"} something to check. `,
        h("button", { class: "link", onclick: () => this.openCheck(places[0].key) }, n === 1 ? "Show it" : "Show the first")) : null,
      !loose.length && !n ? h("div", { class: "block-check-clear" }, h("span", {}, "Nothing to check here.")) : null].filter(Boolean));
  }

  // A check's buttons; in its "!"'s popup (`popup`), without those that only select its place, and with a type menu for a
  // line outside the blocks.
  findingButtons(finding, popup = false) {
    const { app } = this, out = [];
    if (popup && finding.addAs && app.book.writable) out.push(typesMenu(app, "", finding.addAs));
    if (!(popup && finding.selects)) out.push(h("button", { onclick: finding.action }, finding.label));
    for (const item of finding.extra || []) if (!(popup && item.selects)) out.push(h("button", { onclick: item.action }, item.label));
    if (app.book.writable && finding.leaveOut) out.push(h("button", { onclick: finding.leaveOut,
      title: finding.leaveLabel ? "Keep this block's type; the proposal is dropped." : "This is outside the printed text." }, finding.leaveLabel || "Leave out"));
    return out;
  }

  // The checks about one place (`key`), in a popup beside its "!" (`anchor`; else the "!" on its block, scrolled into
  // view, or for a place with no block the "!" on the scan); the place is selected.
  openCheck(key, anchor = null) {
    const { app } = this, place = this.placed?.get(key);
    document.querySelectorAll(".check-pop").forEach(pop => pop.remove());
    if (!place) return;
    const cardBadge = place.at.region && this.el.querySelector(`.block-card[data-rid="${CSS.escape(place.at.region)}"] > .block-check-badge`);
    if (!anchor && cardBadge) anchor = cardBadge;
    if (place.at.region) app.select({ region: place.at.region }, { keepFocus: anchor === cardBadge });
    else if (place.at.omitted !== undefined) app.select({ omitted: place.at.omitted });
    else { app.select({}); app.pageView.markLine({ pinned: place.box }); app.pageView.revealBox(place.box); }
    anchor ||= app.pageView.marks.querySelector(`.pv-badge[data-key="${CSS.escape(key)}"]`);
    if (!anchor) return;
    const pop = h("div", { class: "popup check-pop", role: "dialog", "aria-label": "Check" },
      ...place.findings.map(finding => h("div", { class: "check-pop-item" }, h("p", {}, finding.text),
        h("div", { class: "actions" }, ...this.findingButtons(finding, true)))));
    const close = () => { pop.remove(); document.removeEventListener("pointerdown", outside, true); };
    const outside = event => { if (!pop.contains(event.target) && !event.target.closest?.(".pv-badge, .block-check-badge")) close(); };
    // An action taken closes it (the page is drawn again).
    pop.addEventListener("click", event => { if (event.target.closest("button")) setTimeout(close); });
    pop.addEventListener("change", () => setTimeout(close));
    const card = anchor.closest(".block-card");
    if (card) {
      // In the text column: inside the block's card, above its text, which moves down for it.
      pop.className = "check-pop check-inline";
      anchor.after(pop);
      card.scrollIntoView({ block: "nearest" });
    } else {
      // Beside its "!" on the scan.
      document.body.append(pop);
      requestAnimationFrame(() => {
        const r = anchor.getBoundingClientRect();
        pop.style.left = `${Math.max(8, Math.min(r.right + 6, innerWidth - pop.offsetWidth - 8))}px`;
        pop.style.top = `${Math.max(8, Math.min(r.top - 4, innerHeight - pop.offsetHeight - 8))}px`;
      });
    }
    setTimeout(() => document.addEventListener("pointerdown", outside, true));
  }

  markSelection() {
    const target = super.markSelection(), many = this.app.selection.many;
    for (const rid of many?.regions || []) this.el.querySelector(`.region[data-rid="${CSS.escape(rid)}"]`)?.classList.add("sel");
    return target;
  }

  // The next page whose card on Pages has something to check (workflow.js's pageCheck).
  nextPageToCheck() {
    const { app } = this, { book } = app;
    const next = nextPageToCheck(book.pages, app.pageStates, app.pid, pid => book.isSkipped(pid));
    if (next) app.openPage(next);
    else app.toast("Every page has been checked.");
  }

  block(region, depth) {
    const { app } = this, { id, type } = region;
    const block = h("section", { class: "region block-card", dataset: { rid: id }, style: `--block-depth:${depth}` },
      h("button", { class: "block-label link", onclick: () => app.select({ region: id }), "aria-label": `Select ${blockName(type).toLowerCase()}` }, tag(type, app.colors)));
    block.addEventListener("mouseenter", () => app.pageView.highlightRegion(id, true));
    block.addEventListener("mouseleave", () => app.pageView.highlightRegion(id, false));
    if (app.tl.types[type]?.region === "figure") {
      const preview = h("div", { class: "block-figure" });
      cropInto(preview, app.pageView.img.src, app.doc.page, region.box || bbox(region.polygons), 240, 150);
      block.append(preview);
      return block;
    }
    const uncertain = region.source?.transcription?.uncertain;
    if (uncertain) block.append(h("span", { class: "block-uncertain-label" }, "Check transcription"));
    const host = h("div", { class: "rtext block-text" + (isProseBlock(region, app.tl) ? " block-prose" : "") + (uncertain ? " block-uncertain" : ""), contenteditable: this.textEditable ? "true" : null,
      role: "textbox", "aria-multiline": "true", "aria-label": `${blockName(type)} text`, spellcheck: "false", lang: app.tl.types[type]?.lang || null, dataset: { rid: id } });
    this.fillHost(host, region);
    this.wire(host);
    if (this.textEditable) host.addEventListener("focusout", () => {
      const current = app.doc?.page.regions.find(value => value.id === id);
      if (!current || !this.projection.mainTypes.has(current.type) || app.mode !== "page") return;
      let changed = false;
      for (const [index, line] of (current.lines || []).entries()) {
        const before = line.text || "";
        const tokens = [...before.matchAll(MARKER)].filter(token => /^[0-9०-९*†‡§]+$/.test(token[1]));
        if (!tokens.length) continue;
        let text = "", start = 0, spans = line.spans || [];
        for (const token of tokens) {
          text += before.slice(start, token.index);
          start = token.index + token[0].length;
          spans = [...spans, { kind: "note_marker", id: nextId(app.doc, spans), marker: token[1], start: cp(before.slice(0, token.index)).length,
            end: cp(before.slice(0, token.index)).length }];
        }
        text += before.slice(start);
        // Move pre-existing spans one deletion at a time, so spans between markers stay in place.
        let currentText = before;
        for (const token of tokens.reverse()) {
          const after = currentText.slice(0, token.index) + currentText.slice(token.index + token[0].length);
          spans = shiftSpans(spans, cp(currentText), cp(after));
          currentText = after;
        }
        app.typed(id, index, text, spans);
        changed = true;
      }
      if (changed && host.isConnected) this.fillHost(host, current);
    });
    block.append(host);
    return block;
  }

  fillHost(host, region) {
    super.fillHost(host, region);
    for (const [index, line] of [...host.children].entries()) {
      line.dataset.end = region.lines?.[index]?.end || blockLineEnd(region.lines?.[index] || {}, region, this.app.tl);
      if (!index && line.classList.contains("notext") && !region.lines?.some(value => value.text?.trim())) line.dataset.empty = this.textEditable ? "(no text — click to type it)" : "(no text)";
      if (!index || region.lines?.[index]?.text) continue;
      delete line.dataset.empty;
    }
  }

  highlightRegion(rid, on, reveal) {
    const block = this.el.querySelector(`.region[data-rid="${CSS.escape(rid)}"]`);
    block?.classList.toggle("hl", on);
    if (on && reveal && block) block.scrollIntoView({ block: "nearest" });
  }

  showDetails(doc) {
    this.reviewItem.replaceChildren(...this.app.check(doc).flat().map(message => h("p", { class: "warn" }, message)));
  }

  showSuggestion() {
    this.reviewItem.replaceChildren(suggestionButton(this.app, this.app.doc.page.id));
  }

  reviewFinding(line) {
    const { app } = this;
    const crop = h("div", { class: "block-review-crop" });
    cropInto(crop, app.pageView.img.src, app.doc.page, line.box, 240, 90);
    this.reviewItem.replaceChildren(crop, h("p", {}, "Add the line as a block, or leave out a stamp, shelf mark or blemish."),
      this.app.book.writable ? typesMenu(this.app, "", type => this.app.addRegionOverLine(line.line_id, type)) : null,
      this.app.book.writable ? h("button", { onclick: () => this.app.edit(doc => ops.ignoreLine(doc, line)) }, "Leave it out") : null);
  }
}

function nextId(doc, pending) {
  const used = new Set([...pending, ...doc.page.regions.flatMap(region => (region.lines || []).flatMap(line => line.spans || []))].map(span => span.id));
  let count = 1;
  while (used.has(`m${count}`)) count++;
  return `m${count}`;
}

export function blockInspector(el, app) {
  const { selection, doc, book, tl } = app;
  el.replaceChildren();
  if (selection.many) {
    const n = selection.many.regions.length + selection.many.omitted.length;
    app.pageView.markLine({ pinned: null });
    el.append(h("h3", {}, `${n} selected`),
      h("p", { class: "hint" }, "Shift-click a block on the scan to add it or take it away. The Delete key leaves them out."),
      book.writable && n ? h("button", { onclick: () => app.leaveOut(selection.many) }, `Leave ${n === 1 ? "it" : `these ${n}`} out of the book`) : null);
    return;
  }
  const omitted = doc.source?.omitted_regions?.[selection.omitted];
  if (omitted) {
    app.pageView.markLine({ pinned: omitted.box });
    app.pageView.revealBox(omitted.box);
    el.append(h("h3", {}, "Area without a type"),
      typesMenu(app, "", type => app.recoverOmitted(selection.omitted, type)),
      book.writable ? h("button", { onclick: () => app.edit(next => {
        ops.ignoreOmittedRegion(next, selection.omitted);
        app.selection = {};
      }) }, "Leave it out") : null);
    return;
  }
  app.pageView.markLine({ pinned: null });
  if (selection.marker) { renderInspector(el, app); return; }
  const region = doc.page.regions.find(value => value.id === selection.region);
  if (!region) return;
  const type = tl.types[region.type];
  const fields = [h("label", {}, "Type", typesMenu(app, region.type, value => app.retypeRegion(region.id, value)))];
  const content = pageBlocks(doc, tl).filter(value => tl.types[value.type]?.role !== "furniture" && tl.types[value.type]?.region !== "note");
  const stream = type?.region === "note" ? pageBlocks(doc, tl).filter(value => tl.types[value.type]?.region === "note") : content;
  const context = app.textPanel.context?.get(region.id);
  if (context) for (const [at, key, end, name] of [[stream[0], "continues_from_earlier", "start", "From previous page"],
    [stream.at(-1), "continues_later", "end", "On next page"]]) {
    if (at !== region) continue;
    fields.push(h("label", {}, h("input", { type: "checkbox", checked: !!region.source?.[key], disabled: !book.writable,
      onchange: event => app.edit(next => {
        const value = ops.regionById(next, region.id);
        value.source = { ...value.source, [key]: event.target.checked };
      }) }), name));
  }
  const unit = context?.unit;
  const numbered = type?.region === "page_number" ? app.textPanel.projection.docs.find(value => value?.page.id === doc.page.id)?.page.label : unit?.number;
  if (numbered) fields.push(h("span", {}, "Number ", numbered));
  if (unit?.label) fields.push(h("span", {}, "Label ", unit.label));
  const more = h("details", { class: "block-more" }, h("summary", {}, "More…"),
    book.writable && type?.region !== "figure" ? h("button", { onclick: () => app.edit(next => ops.addLine(next, region.id, region.lines.length)) }, "Add text line") : null,
    book.writable ? regionTools(app, region) : null);
  el.append(h("div", { class: "block-fields" }, ...fields));
  structurePanel(el, app, region.id);
  el.append(more);
}

export function drawBlock(app, box, event) {
  app.pageView.setDrawing(false);
  app.main.querySelector(".draw")?.classList.remove("on");
  // A drawn block takes its place in the structure as the rules derive it; the structure panel can group it differently.
  const add = type => {
    menu.remove();
    if (app.edit(doc => { app.selection = { region: ops.addRegion(doc, app.tl, type, box) }; })) app.recompute();
  };
  const menu = h("div", { class: "popup block-draw-menu", style: `left:${event.clientX}px;top:${event.clientY}px` },
    typesMenu(app, "", add),
    h("button", { onclick: () => { menu.remove(); newTypeDialog(app, add, true); } }, "New type…"),
    h("button", { onclick: () => menu.remove() }, "Cancel"));
  document.body.append(menu);
  menu.querySelector("select").focus();
}
