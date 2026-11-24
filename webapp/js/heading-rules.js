// Sections from headings: a heading of a type the book's rules name starts a section, which holds what follows it up to
// the next heading of the same or a higher level, across pages. This is how most books are organized (chapters,
// sections, subsections), and the rule works from the blocks alone.
//
// `levels` is the book's `rules.headings`, outermost first: [{ heading: "chapter_heading", container: "chapter" },
// { heading: "section_heading", container: "section" }]. A section is labelled with its heading's text, as printed.
// Only the units at the top of a page's main flow take part (a heading the type list already puts inside a container
// stays where it is). A page that is not there (null) ends every open section: nothing joins across it, as in assembly.

const idOf = (doc, base) => { let n = 1; const taken = new Set(doc.units.map(unit => unit.id)); while (taken.has(`${base}${n}`)) n++; return `${base}${n}`; };

// For every top-level unit of the main flow, in book order: { pageIndex, id, path }, where path lists the open sections
// from the outermost in ({ id, level, label }).
function sectionPaths(pages, levels, textOf) {
  const levelOf = new Map(levels.map((level, index) => [level.heading, index]));
  const items = [];
  let stack = [], next = 0, titling = null;   // titling: the section whose headings are all it has so far
  pages.forEach((doc, pageIndex) => {
    if (!doc) { stack = []; titling = null; return; }
    for (const id of doc.flows.main || []) {
      const unit = doc.units.find(value => value.id === id);
      const level = levelOf.get(unit?.type);
      // A heading of the same level straight after its section's heading (a title in two parts, a subtitle, an epigraph
      // set as a heading) belongs to that section; one of another level starts its own (a section opening a chapter).
      if (level !== undefined && titling && level === titling.level) { items.push({ pageIndex, id, path: stack }); continue; }
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
  const items = sectionPaths(pages, levels, textOf);
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
