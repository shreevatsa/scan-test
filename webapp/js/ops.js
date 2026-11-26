// JSON with object keys sorted, to compare documents whatever order their keys were written in.
export const canonical = x => JSON.stringify(x, (k, v) => (v && typeof v === "object" && !Array.isArray(v)
  ? Object.fromEntries(Object.keys(v).sort().map(key => [key, v[key]])) : v));

export const boxRing = ([x1, y1, x2, y2]) => [[x1, y1], [x2, y1], [x2, y2], [x1, y2]].map(p => p.map(Math.round));

// Set a region's editable box. Until the outline step runs in the browser, the outline becomes the box itself.
