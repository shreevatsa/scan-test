// Coarse page blocks from method 063's lines. All coordinates remain in source pixels.
import { ROLE } from "./ink.js";

const median = values => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length ? (sorted[middle] + sorted[Math.ceil(sorted.length / 2) - 1]) / 2 : 0;
};

export function lineBlocks(analysis) {
  if (analysis.status !== "ok") return [];
  const { comp, seg, charH } = analysis;
  const lines = seg.lines.map(line => ({ ...line, box: [Infinity, Infinity, -Infinity, -Infinity] }));
  for (let index = 1; index < comp.count; index++) {
    const line = lines[seg.lineOf[index]];
    if (!line || comp.role[index] !== ROLE.text) continue;
    line.box[0] = Math.min(line.box[0], comp.x0[index]);
    line.box[1] = Math.min(line.box[1], comp.y0[index]);
    line.box[2] = Math.max(line.box[2], comp.x1[index]);
    line.box[3] = Math.max(line.box[3], comp.y1[index]);
  }
  const blocks = [];
  for (const column of [...new Set(lines.map(line => line.column))]) {
    const ordered = lines.filter(line => line.column === column && Number.isFinite(line.box[0]))
      .sort((a, b) => a.center - b.center);
    const gaps = ordered.slice(1).map((line, index) => line.core_top - ordered[index].core_bottom).filter(gap => gap > 0);
    const gapLimit = Math.max(0.75 * charH, 1.6 * median(gaps));
    let block = null, previous = null;
    for (const line of ordered) {
      const height = line.core_bottom - line.core_top + 1;
      const startsBlock = !previous || line.core_top - previous.core_bottom > gapLimit ||
        Math.abs(height - previous.height) > 0.3 * Math.max(height, previous.height) ||
        line.rx0 - previous.rx0 > charH || previous.rx0 - line.rx0 > 2 * charH;
      if (startsBlock) {
        block = { box: [...line.box], column, lines: [], heights: [] };
        blocks.push(block);
      }
      for (const coordinate of [0, 1]) block.box[coordinate] = Math.min(block.box[coordinate], line.box[coordinate]);
      for (const coordinate of [2, 3]) block.box[coordinate] = Math.max(block.box[coordinate], line.box[coordinate]);
      block.lines.push(line.line_id);
      block.heights.push(height);
      previous = { ...line, height };
    }
  }
  return blocks.map(block => ({ box: block.box, column: block.column, line_count: block.lines.length, text_height: median(block.heights) }));
}

export function classifyBlocks(blocks, width, height, types) {
  const bodyHeight = median(blocks.flatMap(block => Array(block.line_count).fill(block.text_height)));
  const candidates = blocks.map((block, index) => {
    const [left, top, right, bottom] = block.box;
    const isolated = !blocks.some((other, otherIndex) => otherIndex !== index && other.column === block.column &&
      Math.max(other.box[1] - bottom, top - other.box[3], 0) < 1.5 * bodyHeight);
    let regionClass = "paragraph";
    if (block.line_count === 1 && right - left < 0.6 * width && isolated && (bottom < 0.12 * height || top > 0.88 * height)) regionClass = "running_header";
    else if (top > 0.7 * height && block.text_height < 0.85 * bodyHeight) regionClass = "note";
    const matches = Object.entries(types.types).filter(([, type]) => type.region === regionClass);
    const type = matches.length === 1 ? matches[0][0] : "other";
    return { region_id: index + 1, type, region_class: type === "other" ? "other" : regionClass,
      keep: type === "other" || types.types[type].role !== "furniture", reading_order: null,
      uncertain: true, continues_from_earlier: false, continues_later: false, box: [...block.box] };
  });
  let order = 0;
  for (const candidate of candidates) if (candidate.keep) candidate.reading_order = ++order;
  return candidates;
}

export function tesseractBlocks(data) {
  return (data.blocks || []).flatMap(block => (block.paragraphs || []).map(paragraph => {
    const lines = paragraph.lines || [], box = paragraph.bbox;
    if (!box || !lines.length) return null;
    const bounds = [box.x0, box.y0, box.x1, box.y1];
    if (!bounds.every(Number.isFinite) || box.x0 >= box.x1 || box.y0 >= box.y1) return null;
    return { box: bounds, column: 0, line_count: lines.length,
      text_height: median(lines.map(line => line.bbox.y1 - line.bbox.y0)) };
  }).filter(Boolean));
}
