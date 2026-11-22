const idOf = (doc, base) => { let n = 1; const taken = new Set(doc.units.map(unit => unit.id)); while (taken.has(`${base}${n}`)) n++; return `${base}${n}`; };

// For the units of a page's main flow in order: { id, part, episode } (null outside the body of the book).
// A closing line's name and number: "इति रावणवधः ॥ ४२ ॥" → { label: "रावणवधः", number: "४२" }; "इत्ययोध्या…" is इति + अयोध्या….
const SIGNS = { "ा": "आ", "ि": "इ", "ी": "ई", "ु": "उ", "ू": "ऊ", "े": "ए", "ै": "ऐ", "ो": "ओ", "ौ": "औ" };
export function closingName(text) {
  const match = /^\s*\(?\s*(इति\s+|इती\s+|इत्य|इती|इति)(.+?)\s*(?:॥\s*([०-९0-9]+)\s*॥)?\s*[।॥]?\s*\)?\s*$/.exec(text || "");
  if (!match) return {};
  let label = match[2].trim().replace(/\s+समाप्त[ःम्]?$/, "");
  if (match[1] === "इत्य") label = SIGNS[label[0]] ? SIGNS[label[0]] + label.slice(1) : "अ" + label;
  if (match[1] === "इती") label = "इ" + label;   // इति + इक्ष्वाकु…
  return { label, ...(match[3] ? { number: match[3] } : {}) };
}

export function sectionKeys(pages, { closing, partClosing, partHeading = null, partAfter = null, divisionClosing = null, textOf }) {
  const list = [];
  for (const [pageIndex, doc] of pages.entries()) for (const id of doc.flows.main || []) {
    const unit = doc.units.find(value => value.id === id);
    const heading = Boolean(partHeading) && unit.type === "heading";
    list.push({ pageIndex, id, unit, closing: unit.type === closing, part: null, episode: null, partEnd: false,
      text: unit.type === closing || heading ? textOf(doc, unit) : "" });
  }
  const firstVerse = list.findIndex(item => item.unit.type === "verse");
  if (firstVerse < 0) return list;
  const start = list.findIndex(item => item.pageIndex === list[firstVerse].pageIndex);        // the page where the verses begin
  const isDivision = item => item.closing && divisionClosing && divisionClosing.test(item.text);
  const isPartClosing = item => item.closing && !isDivision(item) && partClosing.test(item.text);
  // The body ends at the last part's closing line (what follows, such as the book's own closing, stays outside the
  // parts), or at the last closing line where no part closes.
  let end = -1, lastPart = -1;
  list.forEach((item, index) => { if (item.closing) { end = index; if (isPartClosing(item)) lastPart = index; } });
  if (lastPart >= 0) end = lastPart;
  let part = 0, episode = 0, partHasItems = false;
  const parts = [{ starts: "where the verses begin" }];
  const next = starts => { parts.at(-1).ends ||= starts.replace(/^after /, "at "); part++; episode++; partHasItems = false; parts.push({ starts }); };
  for (let index = start; index <= end; index++) {
    const item = list[index];
    // A part's heading starts a new part where the one before it has no closing line of its own.
    if (partHeading && item.unit.type === "heading" && partHeading.test(item.text) && partHasItems) { parts.at(-1).ends = "at the next part's heading"; next(`printed heading: ${item.text}`); }
    item.part = part; if (item.unit.type !== "heading") partHasItems = true;   // a title before a part's heading is not its content
    if (isPartClosing(item)) { item.partEnd = true; parts.at(-1).ends = `printed closing: ${item.text}`; next("after a printed closing"); }
    else if (isDivision(item)) episode++;                              // stands between episodes, inside the part
    else {
      item.episode = episode;
      if (item.closing) { episode++; if (partAfter && partAfter.test(item.text)) { parts.at(-1).ends = `inferred: after ${item.text}`; next(`inferred: after ${item.text}`); } }
    }
  }
  parts.length = part + (partHasItems ? 1 : 0);
  // Names: each episode from its closing line.
  const names = new Map();
  for (const item of list) if (item.closing && item.episode !== null) names.set(item.episode, closingName(item.text));
  for (const item of list) if (item.episode !== null) { item.episodeName = names.get(item.episode) || {}; item.episodeClosed = names.has(item.episode); }
  list.parts = parts;
  return list;
}

// Rewrite one page's main flow with section containers. Returns the number of containers made.
export function groupPage(doc, items, previous, next, { partLabels = [], parts = [] } = {}) {
  const flow = doc.flows.main || [];
  const here = items.filter(item => item.unit && flow.includes(item.id));
  if (!here.some(item => item.part !== null)) return 0;
  const sameAs = (a, b, key) => Boolean(a && b && a[key] !== null && a[key] === b[key] && (key === "part" || a.part === b.part));
  const top = [], made = [];
  let made_n = 0;
  const container = (children, open, meta = {}) => {
    const unit = { id: idOf(doc, "sec-"), type: "section", children: children.map(id => ({ unit: id })) };
    if (meta.number) unit.number = meta.number;
    if (meta.label) unit.label = meta.label;
    if (open.start || open.end) unit.open = open;
    unit.source = { made_by: "rule: closing lines (webapp/tools/chaya_sections.mjs)", ...(meta.source || {}) };
    doc.units.push(unit); made_n++; return unit.id;
  };
  for (let i = 0; i < here.length;) {
    const first = here[i];
    if (first.part === null) { top.push(first.id); i++; continue; }
    let j = i; while (j + 1 < here.length && here[j + 1].part === first.part) j++;
    const partItems = here.slice(i, j + 1), partChildren = [];
    for (let a = 0; a < partItems.length;) {
      const item = partItems[a];
      // A stretch with no closing line of its own (the end of a part, before its closing) is not an episode.
      if (item.episode === null || item.episodeClosed === false) { partChildren.push(item.id); a++; continue; }
      let b = a; while (b + 1 < partItems.length && partItems[b + 1].episode === item.episode) b++;
      const run = partItems.slice(a, b + 1);
      const open = { start: run[0] === here[0] && sameAs(previous, run[0], "episode") && previous.part === run[0].part, end: run.at(-1) === here.at(-1) && sameAs(next, run.at(-1), "episode") && next.part === run.at(-1).part };
      partChildren.push(container(run.map(value => value.id), open, run[0].episodeName || {}));
      a = b + 1;
    }
    const open = { start: partItems[0] === here[0] && sameAs(previous, partItems[0], "part"), end: partItems.at(-1) === here.at(-1) && sameAs(next, partItems.at(-1), "part") };
    const info = parts[first.part] || {};
    // A part's name from --part-labels is the editor's, not the book's: so marked, and shown as such.
    top.push(container(partChildren, open, { label: partLabels[first.part], source: { starts: info.starts, ends: info.ends, ...(partLabels[first.part] ? { label: "editor" } : {}) } }));
    i = j + 1;
  }
  doc.flows.main = top;
  return made_n;
}
