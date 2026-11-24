import { regionTypePaths } from "./pipeline/provisional.js?v=20261124-verses-7";
import { layerState } from "./layers.js?v=20261124-verses-7";

export function orderedRegions(doc, types, furniture = true) {
  return (doc?.page.regions || []).map((region, index) => ({ region, index }))
    .filter(({ region }) => furniture || types.types[region.type]?.role !== "furniture")
    .sort((a, b) => (a.region.order ?? Infinity) - (b.region.order ?? Infinity) || a.index - b.index).map(value => value.region);
}

// A page's layout, for grouping pages and sorting the rarest first (it is not a flag): the kinds of printed content on
// it, in the type list's order. How many regions of each there are, the order they come in and the page furniture
// do not count, so that ordinary body pages fall into a few groups.
export function layoutSignature(doc, types) {
  if (!doc) return "";
  if (!doc.page.regions.length) return "Blank page";
  const order = Object.keys(types.types), present = new Set(doc.page.regions.map(region => region.type));
  const content = [...present].filter(type => types.types[type]?.role !== "furniture")
    .sort((a, b) => (order.indexOf(a) + 1 || Infinity) - (order.indexOf(b) + 1 || Infinity) || a.localeCompare(b));
  return content.join(" · ") || "Page furniture only";
}

// Layouts on fewer pages than this are offered as a filter in the page grids.
export const RARE_LAYOUT = 3;

export function layoutCounts(docs, types) {
  const counts = new Map();
  for (const doc of docs.filter(Boolean)) {
    const signature = layoutSignature(doc, types);
    counts.set(signature, (counts.get(signature) || 0) + 1);
  }
  return counts;
}

// A page's regions in each flow, in reading order, furniture left out. `cache` (a WeakMap) keeps them for a document
// that does not change while it is used.
function flowRegions(doc, types, cache = null) {
  const kept = cache?.get(doc);
  if (kept?.types === types) return kept.lists;
  const paths = regionTypePaths(types), lists = new Map();
  for (const region of orderedRegions(doc, types, false)) {
    const path = paths.get(region.type), flow = path && types.types[path[0]].flow;
    if (!flow) continue;
    if (!lists.has(flow)) lists.set(flow, []);
    lists.get(flow).push(region);
  }
  cache?.set(doc, { types, lists });
  return lists;
}

// The cells of a grid, every `step` pixels, inside a region's outline (its rings, filled even-odd).
function outlineCells(rings, step = 4) {
  const cells = new Set();
  const key = (x, y) => Math.floor(y / step) * 1e6 + Math.floor(x / step);
  for (const ring of rings || []) {
    if (ring.length < 3) continue;
    const ys = ring.map(point => point[1]), top = Math.min(...ys), bottom = Math.max(...ys);
    for (let y = Math.floor(top / step) * step + step / 2; y < bottom; y += step) {
      const xs = [];
      ring.forEach(([ax, ay], k) => {
        const [bx, by] = ring[(k + 1) % ring.length];
        if ((ay <= y) !== (by <= y)) xs.push(ax + (y - ay) * (bx - ax) / (by - ay));
      });
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2)
        for (let x = Math.ceil((xs[k] - step / 2) / step) * step + step / 2; x < xs[k + 1]; x += step) cells.add(key(x, y));
    }
  }
  return cells;
}

// How much of the smaller of two boxes the other covers.
function boxOverlap(a, b) {
  if (!a || !b) return 0;
  const area = box => Math.max(0, box[2] - box[0]) * Math.max(0, box[3] - box[1]);
  const overlap = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
  return overlap / Math.max(1, Math.min(area(a), area(b)));
}

// How much of the smaller of two regions the other covers: by their outlines where both have them (a region that
// wraps around a neighbor, as a two-line footnote beside one-line footnotes, has a box over it but no shared ink),
// else by their boxes.
export function regionOverlap(a, b) {
  if (a.polygons?.length && b.polygons?.length) {
    const first = outlineCells(a.polygons), second = outlineCells(b.polygons);
    if (first.size && second.size) {
      let shared = 0;
      for (const cell of first) if (second.has(cell)) shared++;
      return shared / Math.min(first.size, second.size);
    }
  }
  return boxOverlap(a.box, b.box);
}

// A page whose structure is settled decides a page break itself (Read checks those joins: assembly warnings), so the
// regions' continuation flags are compared only while either page has no settled structure. A page in the blocks form
// (0.4) always has one, derived from its regions, the book's rules and its overrides; an old page has one when its units
// were completed or made by hand.
const unitsSettled = doc => Boolean(doc?.overrides) || Boolean(doc?.source?.layers?.units && doc.source.layers.units.state !== "provisional");

// `previous` and `next` are the pages around this one, for its continuation flags: each a page document (or null), or a
// function that takes a test of the pages to look past and returns the nearest page that fails it, or null where the
// book does not go on (workflow.js pageWalker).
// Where on the page a printed line is, in words: the third of the page it is in, and a side if the line is clearly to
// one side (narrower than most of the page and centred in the left or right two fifths).
export function linePosition(box, page) {
  if (!box || !page?.width || !page?.height) return "";
  const cx = (box[0] + box[2]) / 2 / page.width, cy = (box[1] + box[3]) / 2 / page.height, narrow = (box[2] - box[0]) / page.width < 0.6;
  const band = cy < 1 / 3 ? "top" : cy < 2 / 3 ? "middle" : "bottom", side = narrow && cx < 0.4 ? "left" : narrow && cx > 0.6 ? "right" : "";
  return `near the ${band} of the page${side ? `, on the ${side}` : ""}`;
}

export function uncoveredMessage(box, page, text = null) {
  const where = linePosition(box, page), read = text?.trim() ? `, reading “${text.trim().slice(0, 60)}”` : "";
  return `A printed line outside all regions${where ? `, ${where}` : ""}${read}`;
}

// Ignored lines are {line_id, box} (a plain id is also accepted). A line is ignored when one of them lies over it, so a
// page analysed again, with its lines numbered differently, keeps what the user ignored.
export function ignoredLines(doc) { return [...(doc?.source?.ignored_lines || [])]; }
export function lineIgnored(ignored, line) {
  return ignored.some(entry => typeof entry === "number" ? entry === line.line_id
    : entry.box && line.box ? boxShare(entry.box, line.box) >= 0.5 : entry.line_id === line.line_id);
}
// The share of the smaller box that the two boxes have in common.
function boxShare(a, b) {
  const w = Math.min(a[2], b[2]) - Math.max(a[0], b[0]), h = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
  if (w <= 0 || h <= 0) return 0;
  return w * h / Math.min((a[2] - a[0]) * (a[3] - a[1]), (b[2] - b[0]) * (b[3] - b[1]));
}

// The saved proposal's outline summary belongs in its preview. The applied page has individual flags
// for boxes that still need a decision.
const outlinePreviewNotice = /^The outline step found ink in \d+ of \d+ proposed regions\. Review the proposed boxes before applying this layout\.$/;

export function regionWarnings(doc) {
  return (doc?.source?.warnings || []).map(String).filter(warning => !outlinePreviewNotice.test(warning));
}

export const regionHasText = region => (region.lines || []).some(line => line.text?.trim());

export function regionFlags(doc, types, { errors = [], previous = null, next = null, cache = null } = {}) {
  if (!doc) return [];
  const flags = [], add = (code, message, region = null, box = null, extra = {}) => flags.push({ code, message, region, box, ...extra });
  const regions = doc.page.regions;
  for (const region of regions) {
    if (region.source?.uncertain) add("uncertain", `${region.id} has an uncertain type or boundary`, region.id);
    if (!Object.hasOwn(types.types, region.type)) add("unknown-type", `${region.id} needs a known type`, region.id, region.box);
    if (types.types[region.type]?.role !== "furniture" && !Number.isFinite(region.order)) add("missing-order", `${region.id} has no reading order`, region.id);
    if (region.source?.no_ink && !regionHasText(region)) add("no-ink", `${region.id} has no detected ink`, region.id, region.box);
  }
  // A small area the finder could not type ("other", no type proposed), at most two characters high and wide, in the top
  // or bottom 15% of the page and clear of every text block (a printer’s signature mark at the foot of each gathering’s first
  // page, a library's stamp), is no content to decide on.
  const textRegions = regions.filter(region => types.types[region.type]?.role !== "furniture" && region.box);
  const pageH = doc.page.height || 0;
  const margin = omitted => {
    const charH = doc.source?.char_h || 0, box = omitted.box;
    return omitted.type === "other" && !omitted.proposed_type && charH > 0 && pageH > 0 && box?.length === 4 &&
      box[2] - box[0] <= 2 * charH && box[3] - box[1] <= 2 * charH && (box[1] >= 0.85 * pageH || box[3] <= 0.15 * pageH) &&
      !textRegions.some(region => boxOverlap(region.box, box) > 0.25);
  };
  for (const omitted of doc.source?.omitted_regions || []) if (!margin(omitted))
    add("omitted", `${omitted.region} needs a type${omitted.proposed_type ? ` (proposed: ${omitted.proposed_type})` : ""}`, omitted.region, omitted.box);
  for (const warning of regionWarnings(doc)) add("region-warning", warning);
  for (const skipped of doc.source?.regions_skipped || []) {
    // A region the person has since drawn over the same place replaces it: nothing is left to report.
    if (skipped.model_box && regions.some(region => region.box && boxShare(region.box, skipped.model_box) >= 0.5)) continue;
    const what = skipped.status === "no_ink" || !skipped.status ? "no ink was found inside its box" : skipped.status;
    add("no-ink", `Region ${skipped.region_id}${skipped.type ? ` (${skipped.type})` : ""} was left out: ${what}`, null, skipped.model_box || null);
  }
  const ignored = ignoredLines(doc);
  // A mark narrower than a character at the very edge of the scan (a speck, the shadow of the binding), or a hairline
  // anywhere (under half a character wide and at least twice as tall: the scan's edge, a fold, a rule), is no printed line.
  const charH = doc.source?.char_h || 0, W = doc.page.width || 0, H = doc.page.height || 0;
  const speck = line => {
    if (!charH || !W || !line.box) return false;
    const width = line.box[2] - line.box[0], height = line.box[3] - line.box[1];
    return width < charH && Math.min(line.box[0], W - line.box[2], line.box[1], H - line.box[3]) < 0.03 * W || width < 0.5 * charH && height >= 2 * width;
  };
  // A line a whole-page reader read with no letters or digits, or only one repeated ("* * *", "-- * --", a row of rings
  // read as "00000"), or with nothing at all, is an ornament or a rule; so is one it read with little confidence (a
  // page's ornamental frame read as rows of letters, "NANANANA FYFYF", at under 0.8; print is read at 0.9 and over).
  const ornament = line => {
    if (typeof line.text !== "string") return false;
    const signs = line.text.replace(/[^\p{L}\p{N}]/gu, "");
    return !signs || signs.length >= 3 && /^(.)\1*$/u.test(signs) || typeof line.confidence === "number" && line.confidence < 0.8;
  };
  const marks = (doc.source?.uncovered_lines || []).filter(line => !lineIgnored(ignored, line) && !speck(line) && !ornament(line));
  // A page where the region finder kept nothing (a cover, a library's notice or stamp, a blank leaf) has one check for
  // all its marks, not one for each speck the line analysis found.
  const keptNothing = !regions.length && !(doc.source?.omitted_regions || []).length && Boolean(doc.source?.layers?.regions || doc.source?.regions_method || doc.source?.method);
  if (keptNothing && marks.length) add("marks-only", `The region finder kept nothing on this page, though the scan has ${marks.length} ${marks.length === 1 ? "mark" : "marks"} that may be print`, null, null, { count: marks.length });
  else for (const line of marks) add("uncovered", uncoveredMessage(line.box, doc.page, line.text), null, line.box, { line_id: line.line_id });
  for (const problem of doc.source?.provisional_problems || []) add("provisional", problem);
  if (doc.source?.geometry_error) add("geometry", doc.source.geometry_error);
  if (doc.source?.type_review?.regions) add("type-revision", "Find regions again after the figure-class change");
  for (let i = 0; i < regions.length; i++) for (let j = i + 1; j < regions.length; j++) {
    if (boxOverlap(regions[i].box, regions[j].box) > 0.2 && regionOverlap(regions[i], regions[j]) > 0.2)
      add("overlap", `${regions[i].id} and ${regions[j].id} overlap by more than a fifth of the smaller region`, regions[i].id);
  }
  for (const error of errors) add("invalid", error);
  // A page with no regions (no content) has no continuation to compare, on either side of it.
  if (regions.length) for (const [flow, list] of flowRegions(doc, types, cache)) {
    for (const [code, message, region, neighbor] of continuationFlags(flow, list, doc, types, previous, next, cache)) add(code, message, region, null, { page: neighbor });
  }
  return flags;
}

// The continuation flags of a page's regions in one flow (`list`), by the rule assembly follows (assemble.js), with
// each region taken as a unit. A page's open ends in a flow are those its provisional units get (provisional.js): its
// first region there if marked as going on from earlier, its last if marked as going on later (a marked pair inside the
// page joins there). An open end continues in the open start of a later page, if of its type, past pages with no region
// of that type in the flow and no open end there (a blank page, a plate and its caption). Such a page between is not
// flagged; the pages on either side are flagged where their marks do not match. An open start with nothing open to
// join is flagged as assembly reports it: where the flow has regions before it, its earlier side being the nearest
// page with a region of its type or an open end, else the nearest with regions. A neighbor given as a document is the
// only page looked at.
function continuationFlags(flow, list, doc, types, previous, next, cache) {
  const out = [], inFlow = page => flowRegions(page, types, cache).get(flow) || [];
  const walk = value => (typeof value === "function" ? value : () => (value?.page.regions.length ? value : null));
  const back = walk(previous), ahead = walk(next);
  const startOf = regions => (regions[0]?.source?.continues_from_earlier ? regions[0] : null);
  const endOf = regions => (regions.at(-1)?.source?.continues_later ? regions.at(-1) : null);
  const plain = regions => !startOf(regions) && !endOf(regions);
  const has = (regions, type) => regions.some(region => region.type === type);
  const between = (regions, type) => plain(regions) && !has(regions, type);
  const settled = other => !other || unitsSettled(doc) && unitsSettled(other);
  const start = startOf(list), last = list[list.length - 1];

  // Back past pages with no open end in the flow to the nearest page with one (null where the book does not go on before).
  const passed = [];
  const found = back(page => { if (!plain(inFlow(page))) return false; passed.push(page); return true; });
  // The region open at its end that reaches this page: that page's last, if it goes on and no page passed has its type.
  const end = found && endOf(inFlow(found));
  const carry = end && !passed.some(page => has(inFlow(page), end.type)) ? end : null;
  // This page sits between that region and its continuation.
  const passes = !!carry && between(list, carry.type);
  let earlier = null, before = false;
  if (carry) [earlier, before] = [found, start ? start.type !== carry.type : !passes];
  else if (start) {
    earlier = passed.find(page => has(inFlow(page), start.type)) || found || passed.find(page => inFlow(page).length) || null;
    before = !!earlier;
  }
  if (before && !settled(earlier)) out.push(["continuation", `${flow} continuation does not match the previous page`, (start || list[0]).id, earlier?.page.id]);

  // Ahead, unless this page is between: where its last region goes on, the nearest page past pages between; where it
  // does not, the nearest page with an open end, if its open start has this page as its earlier side.
  if (!passes) {
    let page = null, after = false;
    if (endOf(list)) {
      page = ahead(other => between(inFlow(other), last.type));
      after = !!page && startOf(inFlow(page))?.type !== last.type;
    } else {
      const skipped = [];
      page = ahead(other => { if (!plain(inFlow(other))) return false; skipped.push(other); return true; });
      const later = page && startOf(inFlow(page));
      after = !!later && !skipped.some(other => has(inFlow(other), later.type)) && (!between(list, later.type)
        || !skipped.some(other => inFlow(other).length) && !back(other => between(inFlow(other), later.type)));
    }
    if (after && !settled(page)) out.push(["continuation", `${flow} continuation does not match the next page`, last.id, page?.page.id]);
  }
  return out;
}

export function textFlags(doc, types) {
  if (!doc?.source?.layers?.text && !doc?.page.regions.some(region => region.lines?.some(line => typeof line.text === "string"))) return [];
  const flags = [];
  for (const region of doc.page.regions) {
    if (types.types[region.type]?.region === "figure") continue;
    const missing = (region.lines || []).filter(line => line.polygons?.length && typeof line.text !== "string").length;
    if (missing) flags.push({ code: "missing-text", message: `${region.id} is missing text on ${missing} line pieces`, region: region.id });
    const reading = region.source?.transcription;
    if (reading?.uncertain && /did not fit its lines/.test(reading.note || "")) flags.push({ code: "reading-unfit", message: `${region.id}: the reading of this area did not fit its lines`, region: region.id });
    // Furniture (a page number, a running header) is not the book's text: an uncertain reading of it is not listed (a
    // book printing its page numbers in Kannada digits, which Cloud Vision misses, would list one on every page).
    else if (reading?.uncertain && types.types[region.type]?.role !== "furniture") flags.push({ code: "uncertain-text", message: `${region.id} has an uncertain transcription`, region: region.id });
  }
  for (const message of doc.source?.problems || []) if (/line.*(count|mismatch)|missing.*line/i.test(message)) flags.push({ code: "line-count", message });
  return flags;
}

export function readFlags(doc, errors = [], warnings = [], assembly = []) {
  if (!doc) return [];
  const flags = [...errors, ...warnings, ...assembly].map(message => ({ code: "structure", message }));
  for (const region of doc.page.regions) if (region.source?.uncertain || region.source?.completion?.uncertain)
    flags.push({ code: "uncertain-units", message: `${region.id} has an uncertain completion`, region: region.id });
  if (Object.keys(doc.source?.suggestions || {}).length) flags.push({ code: "suggestion", message: "A model suggestion is waiting" });
  if (doc.source?.type_review?.units) flags.push({ code: "type-revision", message: "Complete units under the revised containment rules" });
  if (doc.source?.type_review?.manual) flags.push({ code: "type-revision", message: "Review protected units under the revised containment rules" });
  return flags;
}
