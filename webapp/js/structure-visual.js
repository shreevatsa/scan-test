import { h, bbox, cropInto, PALETTE } from "./render.js";
import { structureDecisions, structureUnits, unitDecision } from "./pipeline/structure-compare.js";
import { parseLine } from "./inline.js";
import { graphemes, transcriptionHtml } from "./transcription-diff.js";

const fields = { type: "Region type", units: "Unit hierarchy and grouping", flows: "Reading order", relations: "Links", line_ends: "Line joins" };
const joinLabels = { space: "Insert a space", join: "Join without a space", hyphen: "Drop the hyphen and join", line: "Keep a line break" };
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const name = value => String(value || "Unknown").replaceAll("_", " ");
const printedText = line => parseLine(line || "", [], 1)[0];

export function renderStructureComparison({ rec, sent, reading, models, reference, image, onlyDifferences, selectedRegion, onSelect, width, onReview = null }) {
  const sources = new Map(sent.map(source => [source.rid, source]));
  const text = new Map(reading.regions.map(region => [region.id, region.lines.map(line => line.text)]));
  const colors = new Map(sent.map((source, index) => [source.rid, PALETTE[index % PALETTE.length]]));
  const referenceModel = models.find(model => model.id === reference);
  const expected = structureDecisions(referenceModel.result.parsed);
  const referenceUnits = [...structureUnits(referenceModel.result.parsed).values()];
  const ordered = [...models].sort((a, b) => Number(b.id === reference) - Number(a.id === reference));
  const decisions = new Map(ordered.map(model => [model.id, model.result ? structureDecisions(model.result.parsed) : null]));
  const changed = new Map(sent.map(source => [source.rid, Object.keys(fields).filter(key => ordered.some(model => {
    const actual = decisions.get(model.id);
    return actual && !same(actual.get(source.rid)?.[key], expected.get(source.rid)?.[key]);
  }))]));
  const listed = sent.filter(source => !onlyDifferences || changed.get(source.rid).length);
  let focus = sources.has(selectedRegion) ? selectedRegion : listed[0]?.rid || sent[0]?.rid;
  const root = h("div", { class: "schema-visual" });
  const board = h("div", { class: "schema-board", tabindex: 0, "aria-label": "Unit trees for all schema models" });
  const inspector = h("section", { class: "schema-inspector", "aria-label": "Selected region’s assignments" });
  let selectionButtons = [];
  const changedFields = (model, rid) => Object.keys(fields).filter(key => !same(decisions.get(model.id)?.get(rid)?.[key], expected.get(rid)?.[key]));
  const snippet = rid => printedText((text.get(rid) || []).find(line => printedText(line).trim()) || sources.get(rid)?.region.type || "").trim();

  function select(rid) {
    if (!sources.has(rid)) return;
    focus = rid;
    onSelect(rid);
    for (const { button, id } of selectionButtons) {
      button.classList.toggle("selected", id === rid);
      button.setAttribute("aria-pressed", String(id === rid));
    }
    showRegion();
    inspector.scrollIntoView({ block: "start" });
  }

  function regionButton(rid, full = false, model = null) {
    if (!sources.has(rid)) return h("span", { class: "bad" }, `Unknown region ${rid}`);
    const differences = model?.result ? changedFields(model, rid) : changed.get(rid) || [];
    const button = h("button", { class: `schema-region${full ? " full" : ""}${differences.length ? " differs" : ""}${rid === focus ? " selected" : ""}`,
      style: `--region-color:${colors.get(rid) || "#777"}`, "aria-pressed": rid === focus ? "true" : "false",
      "aria-label": `Inspect ${rid}${model ? ` in ${model.label}` : ""}`,
      title: `${rid} · ${snippet(rid)}${differences.length ? ` · Differences in ${differences.map(key => fields[key]).join(", ")}` : ""}`, onclick: () => select(rid),
    }, h("span", { class: "schema-region-id" }, rid), full ? h("span", { class: "schema-snippet" }, snippet(rid)) : null,
    full && differences.length ? h("span", { class: "schema-change-count" }, differences.length) : null);
    selectionButtons.push({ button, id: rid });
    return button;
  }

  function unitLabel(unit) {
    return h("span", {}, name(unit.type), unit.number ? ` ${unit.number}` : "", unit.label ? ` · ${unit.label}` : "");
  }

  function continuation(unit) {
    return [unit.open_start ? h("span", { class: "schema-flag" }, "← From previous page") : null,
      unit.open_end ? h("span", { class: "schema-flag" }, "To next page →") : null];
  }

  function unitChanges(unit) {
    const choice = unitDecision(unit);
    if (referenceUnits.some(expected => same(unitDecision(expected), choice))) return [];
    const baseline = referenceUnits.find(expected => expected.type === unit.type && same(expected.members, unit.members));
    if (!baseline) {
      const matchingMembers = referenceUnits.some(expected => same(expected.members, unit.members));
      return [matchingMembers ? "Unit type changed" : "Grouping changed"];
    }
    return [["label", "Label changed"], ["number", "Number changed"], ["open_start", "Previous-page flag changed"], ["open_end", "Next-page flag changed"]]
      .filter(([key]) => !same(unitDecision(baseline)[key], choice[key])).map(([, label]) => label);
  }

  function modelHeader(model) {
    return h("div", { class: "schema-model-header" }, h("h4", {}, model.label),
      model.id === reference ? h("span", { class: "schema-tag" }, "Reference") : null,
      model.result?.errors.length ? h("span", { class: "bad" }, `${model.result.errors.length} schema errors`) : null);
  }

  function renderTree(model) {
    const card = h("section", { class: `schema-tree-card${model.id === reference ? " reference" : ""}`, "aria-label": `${model.label} unit tree` }, modelHeader(model));
    if (!model.result) { card.append(h("p", { class: "hint" }, "Awaiting schema assignment.")); return card; }
    const parsed = model.result.parsed, units = structureUnits(parsed);
    const seen = new Set(), owned = new Set();
    function tree(id, path = []) {
      if (sources.has(id)) {
        owned.add(id);
        const type = decisions.get(model.id)?.get(id)?.type;
        return h("li", { class: "schema-leaf" }, regionButton(id, true, model), h("span", { class: "schema-leaf-type" }, name(type)));
      }
      const unit = units.get(id);
      if (!unit || path.includes(id)) return h("li", { class: "bad" }, !unit ? `Unknown unit ${id}` : "Circular unit reference");
      seen.add(id);
      const changes = model.id === reference ? [] : unitChanges(unit);
      return h("li", { class: "schema-unit" }, h("div", { class: `schema-unit-label${changes.length ? " differs" : ""}` }, unitLabel(unit), ...continuation(unit),
        ...changes.map(label => h("span", { class: "schema-unit-change" }, label))),
      h("ul", {}, ...(unit.children || []).map(child => tree(child, [...path, id]))));
    }
    for (const flow of parsed.flows || []) card.append(h("section", { class: "schema-flow" }, h("h5", {}, `${name(flow.flow)} flow`),
      h("ol", { class: "schema-tree" }, ...flow.units.map(id => tree(id)))));
    const orphans = [];
    for (const unit of units.values()) if (!seen.has(unit.id)) orphans.push(tree(unit.id));
    if (orphans.length) card.append(h("section", { class: "schema-flow" }, h("h5", { class: "bad" }, "Outside reading flows"), h("ul", { class: "schema-tree" }, ...orphans)));
    const unowned = sent.filter(source => !owned.has(source.rid));
    if (unowned.length) card.append(h("section", { class: "schema-flow" }, h("h5", {}, "Regions outside units"),
      h("ul", { class: "schema-tree" }, ...unowned.map(source => tree(source.rid)))));
    return card;
  }

  function pathsView(paths) {
    if (!paths.length) return h("p", { class: "meta" }, "Outside units");
    return h("div", {}, ...paths.map(path => {
      const levels = path.map(unit => {
        const changes = unit.invalid ? [] : unitChanges({ ...unit, members: unit.regions });
        return h("li", {}, unit.invalid ? h("span", { class: "bad" }, unit.invalid) : unitLabel(unit), ...continuation(unit),
          ...changes.map(label => h("span", { class: "schema-unit-change" }, label)));
      });
      return h("div", { class: "schema-path" }, h("ol", {}, ...levels),
        h("div", { class: "schema-members" }, "Regions in this unit ", ...(path.at(-1).regions || []).map(rid => regionButton(rid))));
    }));
  }

  function linksView(links) {
    if (!links.length) return h("span", { class: "meta" }, "No links");
    return h("ul", { class: "schema-links" }, ...links.map(link => h("li", {}, name(link.type), " ", regionButton(link.region), ` line ${link.line}`,
      link.marker ? ` [${link.marker}]` : "", " → ", link.to.invalid ? h("span", { class: "bad" }, link.to.invalid) : unitLabel(link.to),
      ...(link.to.regions || []).map(rid => regionButton(rid)))));
  }

  function preview(lines, index, end) {
    const last = index === lines.length - 1, first = printedText(lines[index]);
    const left = graphemes(end === "hyphen" && !last ? first.replace(/[-‐]$/u, "") : first).slice(-20);
    if (last) return h("div", { class: "schema-join-preview" }, `…${left.join("")}`, h("span", { class: "meta" }, " · End of region"));
    const right = graphemes(printedText(lines[index + 1])).slice(0, 20);
    const separators = { space: " ", join: "", hyphen: "", line: "\n" };
    const boundary = `${left.pop() || ""}${separators[end] ?? ""}${right.shift() || ""}`;
    return h("div", { class: "schema-join-preview" }, `…${left.join("")}`,
      h("mark", { class: "schema-join-boundary", title: joinLabels[end] }, boundary), `${right.join("")}…`);
  }

  function joinsView(rid, lines) {
    const boundaries = lines.map((_, index) => index).filter(index => !onlyDifferences || ordered.some(model => model.result &&
      decisions.get(model.id)?.get(rid)?.line_ends[index] !== expected.get(rid)?.line_ends[index]));
    if (!boundaries.length) return h("p", { class: "hint" }, "The available models agree on line joins here. Turn off the difference filter to inspect every line boundary.");
    return h("div", { class: "table-scroll" }, h("table", { class: "pages schema-joins" },
      h("thead", {}, h("tr", {}, h("th", {}, "Printed lines"), ...ordered.map(model => h("th", {}, model.label)))),
      h("tbody", {}, ...boundaries.map(index => h("tr", {}, h("th", {}, index === lines.length - 1 ? `After line ${index + 1}` : `${index + 1} → ${index + 2}`),
        ...ordered.map(model => {
          const end = decisions.get(model.id)?.get(rid)?.line_ends[index];
          return h("td", { class: end !== undefined && end !== expected.get(rid)?.line_ends[index] ? "schema-cell-diff" : "" },
            end === undefined ? "Awaiting result" : h("div", {}, h("strong", {}, joinLabels[end] || end), preview(lines, index, end)));
        }))))));
  }

  function showRegion() {
    selectionButtons = selectionButtons.filter(({ button }) => !inspector.contains(button));
    const sourceOpen = inspector.querySelector(".schema-source")?.open || false;
    const source = sources.get(focus);
    if (!source) { inspector.replaceChildren(h("p", {}, "No page regions are available.")); return; }
    const lines = text.get(focus) || [], crop = h("div", { class: "source-region" });
    const [x0, y0, x1, y1] = bbox(source.region.polygons);
    cropInto(crop, image, rec, [Math.max(0, x0 - 4), Math.max(0, y0 - 4), Math.min(rec.width, x1 + 5), Math.min(rec.height, y1 + 5)], Math.min(width, 1080), 600);
    const assignments = ordered.map(model => {
      const decision = decisions.get(model.id)?.get(focus), baseline = expected.get(focus);
      const card = h("section", { class: `schema-assignment${model.id === reference ? " reference" : ""}` }, modelHeader(model));
      if (!decision) { card.append(h("p", {}, "Awaiting this model’s assignment.")); return card; }
      const parts = [
        ["type", h("span", {}, name(decision.type))],
        ["units", pathsView(decision.units)],
        ["flows", decision.flows.length ? h("ul", {}, ...decision.flows.map(flow => h("li", {}, `${name(flow.flow)} flow · position ${flow.order + 1}`))) : h("span", { class: "meta" }, "Outside reading flows")],
        ["relations", linksView(decision.relations)],
      ];
      card.append(...parts.map(([key, value]) => h("section", { class: `schema-field${!same(decision[key], baseline?.[key]) ? " differs" : ""}` },
        h("h5", {}, fields[key], !same(decision[key], baseline?.[key]) ? h("span", { class: "schema-unit-change" }, "Differs") : null), value,
        onReview ? h("button", { class: "mini", "aria-label": `Review ${fields[key]} from ${model.label}`, onclick: () => onReview(model.id, focus, key === "type" ? "type" : "units") }, "Review this choice") : null)));
      if (onReview) card.append(h("div", { class: "actions" }, h("button", { class: "mini", onclick: () => onReview(model.id, focus, "line_ends") }, "Review line joins")));
      return card;
    });
    inspector.replaceChildren(h("div", { class: "schema-inspector-title" }, h("h3", {}, `Selected region ${focus}`),
      h("button", { onclick: () => board.scrollIntoView({ block: "center" }) }, "Back to unit trees ↑")),
      h("p", { class: "hint" }, (changed.get(focus) || []).length ? `Models differ in ${(changed.get(focus) || []).map(key => fields[key].toLowerCase()).join(", ")}.` : "Available models agree on this region’s assignments."),
      h("p", { class: "schema-focus-snippet" }, snippet(focus)),
      h("details", { class: "schema-source", open: sourceOpen }, h("summary", {}, "Printed source and fixed transcription"),
        h("div", { class: "source-line-scroll" }, crop), h("div", { class: "schema-input", html: transcriptionHtml(lines, lines) })),
      h("div", { class: "schema-assignment-grid" }, ...assignments), h("h4", {}, "How the printed lines join"), joinsView(focus, lines));
  }

  const regionList = h("nav", { class: "schema-region-list", "aria-label": "Choose a page region" }, ...listed.map(source => regionButton(source.rid, true)));
  board.append(h("div", { class: "schema-model-grid", style: `--model-count:${ordered.length}` }, ...ordered.map(renderTree)));
  const overview = h("div", { class: "schema-overview" }, h("div", {}, h("h4", {}, "Choose a region"), regionList,
    !listed.length ? h("p", {}, "Available models agree on this page.") : null),
    h("div", {}, h("h4", {}, "Units and reading order"), h("p", { class: "hint" }, "Each box is a unit. Indentation shows its children. Matching region colors identify the same print across models. Select a region to inspect its assignments below."),
      h("div", { class: "schema-scroll-controls" }, h("button", { onclick: () => board.scrollBy({ left: -280 }) }, "← Previous models"),
        h("button", { onclick: () => board.scrollBy({ left: 280 }) }, "More models →")), board));
  const diagnostics = h("details", { class: "schema-diagnostics" }, h("summary", {}, "Validation details and raw responses"));
  for (const model of ordered.filter(model => model.result)) diagnostics.append(h("section", {}, h("h4", {}, model.label),
    ...(model.result.errors || []).map(error => h("p", { class: "bad" }, error)),
    h("details", {}, h("summary", {}, "Raw schema response"), h("pre", {}, JSON.stringify(model.result.parsed, null, 2)))));
  root.append(overview, inspector, diagnostics);
  showRegion();
  return root;
}
