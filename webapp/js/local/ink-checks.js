// Keep the scan check conservative. A rule may tilt or carry an ornament that makes its box taller than its stroke.
export function hasTextInk([left, top, right, bottom], charH, width, height, ruleStroke = Infinity, verticalStroke = Infinity) {
  const w = right - left, h = bottom - top;
  if (w < 12 || h < 5) return false;
  if (!charH) return true;
  const edge = Math.min(left, width - right, top, height - bottom) < 0.03 * width;
  if (edge && w < 0.45 * charH && h < 0.45 * charH) return false;
  if ((edge ? w < charH : w < 0.5 * charH) && h >= 1.8 * w && verticalStroke < 0.16 * charH) return false;
  if (h < 0.3 * charH) return false;
  return !(w >= 6 * h && (h < 0.5 * charH || h <= 1.12 * charH && ruleStroke < 0.5 * charH));
}

// A connected stroke spanning almost the whole box can be a tilted or decorated rule. Measure its typical thickness
// down each column of ink, using its own pixels so that surrounding marks don't widen the stroke.
export function ruleStroke(comp, members, [left, top, right, bottom], vertical = false) {
  const [start, end, near, far, span] = vertical ? ["y0", "y1", "x0", "x1", bottom - top]
    : ["x0", "x1", "y0", "y1", right - left];
  const label = members.find(k => comp[end][k] - comp[start][k] >= 0.9 * span);
  if (label == null) return Infinity;
  const { labels, W } = comp;
  const from = comp[start][label], to = comp[end][label], low = comp[near][label], high = comp[far][label];
  const thickness = [];
  for (let along = from; along < to; along++) {
    let first = high, last = low - 1;
    for (let across = low; across < high; across++) {
      const pixel = vertical ? along * W + across : across * W + along;
      if (labels[pixel] === label) {
        first = Math.min(first, across);
        last = across;
      }
    }
    if (last >= first) thickness.push(last - first + 1);
  }
  return thickness.sort((a, b) => a - b)[Math.floor(thickness.length / 2)] ?? Infinity;
}
