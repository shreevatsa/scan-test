import { TextPanel, renderInspector, structurePanel } from "./editor.js?v=20261123-blocks-b2-3";
import { blockContext, blockLineEnd, blockName, isProseBlock, pageBlocks } from "./blocks.js?v=20261123-blocks-b2-3";
import { bookReading } from "./reading.js?v=20261123-blocks-b2-3";
import { ignoredLines, linePosition, regionFlags, regionHasText, textFlags } from "./flags.js?v=20261123-blocks-b2-3";
import { h, bbox, cropInto } from "./render.js";
import * as ops from "./ops.js?v=20261123-blocks-b2-3";
import { cp, MARKER, shiftSpans } from "./inline.js";
import { noteProblems } from "./note-links.js?v=20261123-blocks-b2-3";
import { newTypeDialog, regionTools } from "./regionsview.js?v=20261123-blocks-b2-3";
import { suggestionButton } from "./review-view.js?v=20261123-blocks-b2-3";
import { itemNames, normalizeTypeName, readPendingProposals, typeNameStyle } from "./type-additions.js?v=20261123-blocks-b2-3";
import { pageReviewState } from "./layers.js?v=20261123-blocks-b2-3";
import { nextPageToCheck, noContent, REVIEW_LABELS } from "./workflow.js?v=20261123-blocks-b2-3";

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
  newTypeDialog(app, type => app.recoverOmitted(index, type), true, { name, description: proposal.description || "",
    region: proposal.region, furniture: proposal.furniture });
}

export function blockChecks(app, doc, projection) {
  const { tl } = app;
  const findings = [], add = (text, label, action, leaveOut) => findings.push({ text, label, action, leaveOut });
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
  const addProposed = (proposed, text, region, index, leave) => {
    const known = tl.types[proposed]?.region;
    findings.push({ text, leaveOut: leave, label: known ? `Use type ${proposed}` : `Add type ${proposed}`,
      action: () => known ? app.recoverOmitted(index, proposed) : addProposedType(app, proposed, region, index),
      extra: [{ label: "Review area", action: () => app.select({ omitted: index }) }] });
  };
  const flags = [...regionFlags(doc, tl, app.regionFlagContext(doc)), ...textFlags(doc, tl)];
  const see = new Set();
  for (const flag of flags) {
    const key = `${flag.code}:${flag.region || flag.line_id || ""}`;
    if (see.has(key)) continue;
    see.add(key);
    if (flag.code === "uncovered") {
      const line = doc.source.uncovered_lines.find(line => line.line_id === flag.line_id);
      add(`Possible missed line ${linePosition(flag.box, doc.page)}.`, "Review line", () => {
        scan(flag.box);
        app.textPanel.reviewFinding(line);
      }, () => app.edit(next => ops.ignoreLine(next, line)));
    } else if (flag.code === "omitted") {
      const index = doc.source.omitted_regions.findIndex(region => region.region === flag.region);
      const region = doc.source.omitted_regions[index], proposed = proposedTypeName(region);
      const leave = () => app.edit(next => { ops.ignoreOmittedRegion(next, index); app.selection = {}; });
      if (proposed) addProposed(proposed, `An area may be a new type, “${region.proposed_type}”.`, region, index, leave);
      else add("An area on the scan needs a type.", "Review area", () => app.select({ omitted: index }), leave);
    } else if (plain[flag.code]) {
      add(plain[flag.code], flag.region ? "Show block" : flag.box ? "Show scan" : "Review",
        flag.region ? () => openBlock(flag.region) : flag.box ? () => scan(flag.box) : details);
    }
  }
  for (const region of pageBlocks(doc, tl)) {
    if (tl.types[region.type]?.region === "figure" || regionHasText(region)) continue;
    if (!see.has(`missing-text:${region.id}`) && !see.has(`no-ink:${region.id}`)) add(`This ${blockName(region.type).toLowerCase()} needs text.`, "Show block", () => openBlock(region.id));
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
  const order = warnings.find(orderWarning);
  if (order && app.book.writable) add(order.replace(/^page .+?, flow .+?: /, ""), "Use reader order",
    () => app.edit(next => ops.orderFromUnits(next, app.tl)));
  if (errors.length || warnings.some(warning => !orderWarning(warning)) || !app.book.writable && warnings.length)
    add("Review the page checks.", "Show details", details);
  return findings;
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
      h("h2", {}, "Check this page"),
      !app.book.isSkipped(doc.page.id) && !noContent(doc) ? h("div", { class: "block-review-status" }, h("span", {}, REVIEW_LABELS[review.status]),
        app.book.writable ? h("button", { onclick: () => app.setPageReviewed(!review.checked) }, review.checked ? "Reopen review" : "Mark checked") : null) : null,
      this.findings, this.reviewItem, h("div", { class: "actions" }, h("button", { onclick: () => this.nextPageToCheck() }, "Next page to check"))));
    this.refreshFindings();
    const ignored = ignoredLines(doc);
    if (ignored.length) el.firstChild.append(h("details", {}, h("summary", {}, `Ignored lines (${ignored.length})`),
      ...ignored.map(entry => {
        const box = typeof entry === "number" ? doc.source.uncovered_lines?.find(line => line.line_id === entry)?.box : entry.box;
        return h("p", {}, `Line ${linePosition(box, doc.page) || "outside the boxes"} `,
          app.book.writable ? h("button", { onclick: () => app.edit(next => ops.restoreLine(next, entry)) }, "Restore") : null);
      })));
    const ignoredRegions = doc.source?.ignored_regions || [];
    if (ignoredRegions.length) el.firstChild.append(h("details", {}, h("summary", {}, `Ignored areas (${ignoredRegions.length})`),
      ...ignoredRegions.map((region, index) => h("p", {}, `Area ${linePosition(region.box, doc.page) || "on the scan"} `,
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
    el.scrollTop = oldScroll;
    this.markSelection();
  }

  refreshFindings() {
    const { app } = this;
    const findings = blockChecks(app, app.doc, this.projection);
    this.findings.replaceChildren(findings.length
      ? h("ul", {}, ...findings.map(({ text, label, action, leaveOut, extra }) => h("li", {}, h("span", {}, text),
        h("div", { class: "actions" }, h("button", { onclick: action }, label),
          ...(extra || []).map(item => h("button", { onclick: item.action }, item.label)),
          app.book.writable && leaveOut ? h("button", { onclick: leaveOut, title: "This area is outside the printed text." }, "Leave out") : null))))
      : h("div", { class: "block-check-clear" }, h("span", {}, "Nothing to check here.")));
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
  const owning = ops.drawnInto(app.doc, app.selection);
  const into = owning ? h("input", { type: "checkbox" }) : null;
  const add = type => {
    menu.remove();
    if (app.edit(doc => { app.selection = { region: ops.addRegion(doc, app.tl, type, box, into?.checked ? owning : null) }; })) app.recompute();
  };
  const menu = h("div", { class: "popup block-draw-menu", style: `left:${event.clientX}px;top:${event.clientY}px` },
    typesMenu(app, "", add),
    into ? h("label", {}, into, " Add to the selected group") : null,
    h("button", { onclick: () => { menu.remove(); newTypeDialog(app, add, true); } }, "New type…"),
    h("button", { onclick: () => menu.remove() }, "Cancel"));
  document.body.append(menu);
  menu.querySelector("select").focus();
}
