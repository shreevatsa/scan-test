// Styles (schema 0.3): how a unit or line piece is printed, from the book's style sheet (base, then its type) and
// its own style. Presentation only: the reader's "as printed" view and the HTML export use it; the structure and
// the text do not depend on it. Lengths are points of the printed page, scaled by the CSS variable --pt.

const GENERIC = /^(serif|sans-serif|monospace|cursive|fantasy|system-ui)$/;
const len = v => `calc(var(--pt, 1pt) * ${+v.toFixed(2)})`;

// A type's style with a unit's own on top (the base is applied once, to the whole text).
export const unitStyle = (sheet, type, own) => ({ ...(sheet?.types?.[type] || {}), ...(own || {}) });

export function family(sheet, font) {
  const f = sheet?.fonts?.[font];
  return f ? f.family.map(x => (GENERIC.test(x) ? x : `"${x.replace(/["\\]/g, "")}"`)).join(", ") : null;
}

// CSS declarations for a style (s), as one string. With `block`, the paragraph properties too.
export function css(sheet, s, { block = true } = {}) {
  const out = [];
  const fam = s.font && family(sheet, s.font);
  if (fam) out.push(`font-family:${fam}`);
  if (s.size_pt) out.push(`font-size:${len(s.size_pt)}`);
  if (s.weight) out.push(`font-weight:${s.weight === "bold" ? 700 : 400}`);
  if (s.italic !== undefined) out.push(`font-style:${s.italic ? "italic" : "normal"}`);
  if (!block) {
    if (s.size_pt) out.push("line-height:1.25");
    if (s.align) out.push(`display:block;text-align:${s.align}`);
    return out.join(";");
  }
  if (s.leading_pt) out.push(`line-height:${len(s.leading_pt)}`);
  if (s.align) out.push(`text-align:${s.align}`);
  if (s.margin_left_pt) out.push(`margin-left:${len(s.margin_left_pt)}`);
  if (s.indent_pt !== undefined) out.push(`text-indent:${len(s.indent_pt)}`);
  if (s.space_before_pt !== undefined) out.push(`margin-top:${len(s.space_before_pt)}`);
  if (s.space_after_pt !== undefined) out.push(`margin-bottom:${len(s.space_after_pt)}`);
  return out.join(";");
}

// The whole text's base style and measure (the text block's width), for the element that holds the book.
export function baseCss(sheet) {
  if (!sheet) return "";
  const box = sheet.page?.text_box_pt;
  return css(sheet, { ...(sheet.base || {}), align: sheet.base?.align }) + (box ? `;max-width:${len(box[2] - box[0])}` : "");
}
