// Sections from headings: a heading of a type the book's rules name starts a section, which holds what follows it up to
// the next heading of the same or a higher level, across pages. This is how most books are organized (chapters,
// sections, subsections), and the rule works from the blocks alone.
//
// `levels` is the book's `rules.headings`, outermost first: [{ heading: "chapter_heading", container: "chapter" },
// { heading: "section_heading", container: "section" }]. A section is labelled with its heading's text, as printed.
// Only the units at the top of a page's main flow take part (a heading the type list already puts inside a container
// stays where it is). A page that is not there (null) ends every open section: nothing joins across it, as in assembly.

// The book's printed contents, as the titles of its entries: on a page where most blocks end with a page reference (a
// number, a range, a roman numeral: "3. ಆಯುರ್ವೇದ ಮತ್ತು ಯೋಗ - 1   1-31"), each such block's text without its numbering
// and its page reference. Titles are compared normalized: no spaces, punctuation or digits, NFC.
const PAGE_REF = /[\s.…·_–—-]+(?:[0-9०-९೦-೯]{1,4}(?:\s*[-–]\s*[0-9०-९೦-೯]{1,4})?|[ivxlcdm]{1,6})\s*$/iu;
// A roman numeral standing as a word ("CANTO VI") goes too, so that the contents' "CANTO 1" and the heading "CANTO VI" agree.
const ROMAN = /(?<![\p{L}\p{M}])(?=[mdclxvi])m*(?:c[md]|d?c{0,3})(?:x[cl]|l?x{0,3})(?:i[xv]|v?i{0,3})(?![\p{L}\p{M}])/giu;
export const normalTitle = text => String(text || "").normalize("NFC").replace(ROMAN, "").replace(/[\s\p{P}\p{S}0-9०-९೦-೯]+/gu, "");
// Headings (`headingTypes`) are not entries: "CANTO 1" ends with a number but names a group of entries. Returns the titles,
// with `pages` the indices of the contents pages and `groups` the titles of the headings that group entries there (all
// but a page's first heading, the contents' own title).
export function contentsTitles(pages, headingTypes = new Set()) {
  const titles = [];
  titles.pages = new Set(); titles.groups = [];
  for (const [index, doc] of pages.entries()) {
    if (!doc) continue;
    const blocks = doc.page.regions.filter(region => !headingTypes.has(region.type))
      .map(region => (region.lines || []).map(line => line.text || "").join(" ").replace(/\s+/g, " ").trim()).filter(Boolean);
    const entries = blocks.filter(text => PAGE_REF.test(text));
    if (entries.length < 4 || entries.length < blocks.length / 2) continue;
    titles.pages.add(index);
    const headings = doc.page.regions.filter(region => headingTypes.has(region.type)).map(region => normalTitle((region.lines || []).map(line => line.text || "").join(" ")));
    titles.groups.push(...headings.slice(1).filter(title => title.length >= 2));
    for (const text of entries) {
      const title = normalTitle(text.replace(PAGE_REF, "").replace(/^[\s.—–-]*[0-9०-९೦-೯]+\s*[.)]+[\s.…—–-]*/u, ""));
      if (title.length >= 2) titles.push(title);
    }
  }
  return titles;
}
const editDistance = (a, b) => {
  a = [...a]; b = [...b];
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    previous = current;
  }
  return previous[b.length];
};
// A heading named in the contents: the same title, or nearly (a letter or two misread, a part number left out).
export function inContents(titles, text) {
  const heading = normalTitle(text);
  if (heading.length < 2) return false;
  return titles.some(title => {
    const [short, long] = heading.length <= title.length ? [heading, title] : [title, heading];
    if (long.startsWith(short) && short.length >= 0.75 * long.length) return true;
    return editDistance(heading, title) <= Math.max(1, Math.floor(0.15 * long.length));
  });
}

const idOf = (doc, base) => { let n = 1; const taken = new Set(doc.units.map(unit => unit.id)); while (taken.has(`${base}${n}`)) n++; return `${base}${n}`; };

// For every top-level unit of the main flow, in book order: { pageIndex, id, path }, where path lists the open sections
// from the outermost in ({ id, level, label }).
function sectionPaths(pages, levels, textOf, contents = null) {
  const levelOf = new Map(levels.map((level, index) => [level.heading, index]));
  // With one level and a printed contents, a heading the contents name opens a chapter (level 0) and any other heading
  // a section inside the chapter (level 1, of the same container type).
  // On a contents page only its first heading (the contents' own title) starts a section; the others group its entries.
  const levelFor = (doc, unit, pageIndex, firstHeading) => {
    const level = levelOf.get(unit?.type);
    if (level === undefined || !contents) return level;
    if (contents.pages.has(pageIndex) && !firstHeading) return undefined;
    // Where the contents group their entries under headings, those name the chapters and the entries their sections.
    if (contents.groups.length >= 2) return inContents(contents.groups, textOf(doc, unit)) ? 0 : 1;
    return inContents(contents, textOf(doc, unit)) ? 0 : 1;
  };
  const items = [];
  let stack = [], next = 0, titling = null;   // titling: the section whose headings are all it has so far
  pages.forEach((doc, pageIndex) => {
    if (!doc) { stack = []; titling = null; return; }
    let headings = 0;
    for (const id of doc.flows.main || []) {
      const unit = doc.units.find(value => value.id === id);
      const level = levelFor(doc, unit, pageIndex, levelOf.has(unit?.type) && headings++ === 0);
      // A heading of the same level straight after its section's heading (a title in two parts, a subtitle, an epigraph
      // set as a heading) belongs to that section; one of another level starts its own (a section opening a chapter).
      if (level !== undefined && titling && level === titling.level) {
        // A section whose first heading has no text (an ornament, a line not read) takes its name from the next.
        titling.label ||= (textOf(doc, unit) || "").replace(/\s+/g, " ").trim() || null;
        items.push({ pageIndex, id, path: stack });
        continue;
      }
      if (level === undefined) titling = null;
      if (level !== undefined) {
        // A new array each time: earlier units keep the path they had.
        stack = [...stack.filter(section => section.level < level), { id: next++, level, label: (textOf(doc, unit) || "").replace(/\s+/g, " ").trim() || null }];
        titling = stack.at(-1);
      }
      items.push({ pageIndex, id, path: stack });
    }
  });
  return items;
}

// Group each page's top-level units into the sections the headings start. Returns the number of sections made.
export function headingSections(pages, levels, { textOf, types }) {
  if (!levels?.length) return 0;
  // One level and a printed contents: two levels, the contents' entries being the chapters.
  const titles = levels.length === 1 ? contentsTitles(pages, new Set(levels.map(level => level.heading))) : [];
  const contents = titles.length >= 3 ? titles : null;
  if (contents) levels = [levels[0], levels[0]];
  const items = sectionPaths(pages, levels, textOf, contents);
  const byPage = Map.groupBy(items, item => item.pageIndex);
  let made = 0;
  for (const [pageIndex, here] of byPage) {
    const doc = pages[pageIndex];
    const before = items[items.indexOf(here[0]) - 1], after = items[items.indexOf(here.at(-1)) + 1];
    // The neighbour on the page before or after, if it is the adjacent page (a gap ends every section).
    const previous = before?.pageIndex === pageIndex - 1 ? before : null, next = after?.pageIndex === pageIndex + 1 ? after : null;
    const build = (run, depth) => {
      const out = [];
      for (let i = 0; i < run.length;) {
        const section = run[i].path[depth];
        if (!section) { out.push(run[i].id); i++; continue; }
        let j = i;
        while (j + 1 < run.length && run[j + 1].path[depth]?.id === section.id) j++;
        const members = run.slice(i, j + 1), level = levels[section.level];
        const open = {};
        if (members[0] === here[0] && previous?.path[depth]?.id === section.id) open.start = true;
        if (members.at(-1) === here.at(-1) && next?.path[depth]?.id === section.id) open.end = true;
        // The inner sections first: each takes the next free id as it is made.
        const children = build(members, depth + 1).map(id => ({ unit: id }));
        const unit = { id: idOf(doc, "hd-"), type: level.container, children, source: { made_by: "rule: headings start sections (book rules)" } };
        // The label belongs to the page where the heading is; assembly carries it to the section's later pages.
        if (section.label && !open.start) unit.label = section.label;
        if (open.start || open.end) unit.open = open;
        doc.units.push(unit);
        made++;
        // What the section holds may go in it.
        const container = types.types[level.container];
        if (container) container.contains = [...new Set([...(container.contains || []), ...unit.children.map(child => doc.units.find(value => value.id === child.unit)?.type).filter(Boolean)])];
        out.push(unit.id);
        i = j + 1;
      }
      return out;
    };
    doc.flows.main = build(here, 0);
  }
  return made;
}
