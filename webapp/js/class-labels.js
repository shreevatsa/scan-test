// How a type's region class is shown to the user. The class (saved as `region` on a type definition) picks the built-in
// rule the region finder is given for that kind of region (CLASS_RULES in pipeline/prompts.js), so it decides how finely
// regions are cut; a figure has no text lines. The user sees "Draw regions like: …", a short label and the rule in
// plain words. The rule wording is the first sentence of CLASS_RULES, so the two cannot drift apart.
import { h } from "./render.js";
import { CLASS_RULES } from "./pipeline/prompts.js?v=20261113-noink-1";

export const CLASS_LABELS = {
  verse: "verse (one region per verse, with its number)",
  paragraph: "paragraph (one region per paragraph)",
  heading: "heading",
  lead_in: "lead-in line",
  list_item: "list entry (one region per entry)",
  formula: "formula",
  note: "note (with its marker)",
  table: "table (one region per table)",
  figure: "figure (an illustration, no text)",
  caption: "caption",
  running_header: "running header (page furniture)",
  page_number: "page number (page furniture)",
  other: "no region rule yet",
  container: "container (holds other units; no regions of its own)",
};
// Classes whose finder rule is empty get a plain sentence of their own.
const OWN_RULES = {
  heading: "A heading is one region, however many lines it has.",
  running_header: "The line repeated at the top of pages; one region.",
  page_number: "The page number; one region.",
  other: "No rule is given to the region finder for this type. Choose one so regions of it are cut sensibly.",
  container: "A container holds other units. It has no regions of its own, so the region finder is not given a rule for it.",
};
const firstSentence = text => (text.match(/^.*?[.!?](?=\s|$)/u) || [text])[0];

export const classLabel = region => CLASS_LABELS[region] || String(region || "");
export const classShort = region => classLabel(region).replace(/\s*\(.*$/u, "");
export const classRule = region => CLASS_RULES[region] ? firstSentence(CLASS_RULES[region]) : OWN_RULES[region] || "";
// The line shown in a tree row when the class differs from the type's name.
export const classNote = region => `like ${classShort(region)}`;

export const DEFAULT_CLASS = "paragraph";
export const DEFAULT_CLASS_NOTE = "No class fitted; paragraph is the default. Change it if regions of this type should be cut differently.";
const isRealClass = region => region === "container" || (Object.hasOwn(CLASS_LABELS, region) && region !== "other");
// The class a proposal starts with: its own when it names a real one, else paragraph with a note saying so.
export function defaultClass(region) {
  return isRealClass(region) ? { region, note: "" } : { region: DEFAULT_CLASS, note: DEFAULT_CLASS_NOTE };
}

// A select of classes: friendly label as the option text, the rule as its tooltip, and the rule of the chosen class in
// grey under it. Returns { el, select }.
export function classSelect(values, selected, ariaLabel) {
  const rule = h("p", { class: "hint class-rule" }, classRule(selected));
  const select = h("select", { "aria-label": ariaLabel }, ...values.map(value =>
    h("option", { value, selected: value === selected, title: classRule(value) }, classLabel(value))));
  select.title = classRule(select.value);
  select.addEventListener("change", () => { rule.textContent = classRule(select.value); select.title = classRule(select.value); });
  return { select, el: h("div", { class: "class-select" }, select, rule) };
}

// "Draw regions like: paragraph (…)" with a small "change" control that shows the select. `note` (when the class was
// defaulted) is shown under it. Returns { el, select } (select.value is the chosen class).
export function classPicker(values, region, note, ariaLabel, onchange = () => {}) {
  const { select, el: chooser } = classSelect(values, region, ariaLabel);
  chooser.hidden = true;
  const current = h("b", {}, classLabel(select.value));
  const change = h("button", { type: "button", class: "link", onclick: () => { chooser.hidden = !chooser.hidden; change.textContent = chooser.hidden ? "change" : "done"; } }, "change");
  select.addEventListener("change", () => { current.textContent = classLabel(select.value); onchange(select.value); });
  const el = h("div", { class: "class-picker" }, h("span", {}, "Draw regions like: ", current, " "), change, chooser,
    note ? h("p", { class: "hint" }, note) : null);
  return { el, select };
}
