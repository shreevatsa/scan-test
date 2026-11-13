// A Web Worker running method 063's local step for the page editor, so the page stays responsive: it reads the page
// image itself (as PIL's grayscale conversion does), analyzes it once per page, and returns the outlines and line
// pieces for a list of boxes.
//   postMessage({id, pid, url, boxes})  ->  {id, geometry, seconds} or {id, error}

import { analyzePage } from "./ink.js";
import { regionsFromBoxes } from "./regions.js?v=20261113-usage-tree-2";
import { LINES, OWNERSHIP } from "./config.js";
import { lineBlocks } from "./blocks.js?v=20261113-usage-tree-2";

const cache = new Map();

async function grayOf(url) {
  const blob = await (await fetch(url)).blob();
  const bmp = await createImageBitmap(blob, { colorSpaceConversion: "none", premultiplyAlpha: "none" });
  const canvas = new OffscreenCanvas(bmp.width, bmp.height);
  const g = canvas.getContext("2d", { willReadFrequently: true });
  g.drawImage(bmp, 0, 0);
  const d = g.getImageData(0, 0, bmp.width, bmp.height).data;
  const gray = new Uint8Array(bmp.width * bmp.height);
  // ITU-R 601-2 luma with PIL's integer rounding, so the values are those method 043 reads.
  for (let i = 0, j = 0; i < gray.length; i++, j += 4) gray[i] = (d[j] * 19595 + d[j + 1] * 38470 + d[j + 2] * 7471 + 0x8000) >> 16;
  return { gray, W: bmp.width, H: bmp.height };
}

onmessage = async e => {
  const { id, pid, url, boxes } = e.data;
  const t0 = performance.now();
  try {
    const key = `${pid}:${url}`;
    if (!cache.has(key)) {
      const { gray, W, H } = await grayOf(url);
      cache.set(key, analyzePage(gray, W, H, LINES));
      while (cache.size > 3) cache.delete(cache.keys().next().value);
    }
    const a = cache.get(key);
    if (boxes === null && a.status !== "ok") {
      postMessage({ id, geometry: [], blocks: [], uncovered: [], method: "094-illumination-flattened-ink", charH: a.charH,
        angle: 0, warnings: [`Local line analysis found too little text (${a.status}). Check the scan for omitted material.`], seconds: (performance.now() - t0) / 1000 });
      return;
    }
    if (a.status !== "ok") throw new Error(`the page's line analysis failed (${a.status})`);
    const blocks = boxes === null ? lineBlocks(a) : null;
    const { geometry, uncovered } = regionsFromBoxes(a, blocks ? blocks.map(block => block.box) : boxes, OWNERSHIP);
    postMessage({ id, geometry, uncovered, blocks, method: "094-illumination-flattened-ink", charH: a.charH, angle: a.angle, lines: a.seg.lines.length, seconds: (performance.now() - t0) / 1000 });
  } catch (err) {
    postMessage({ id, error: err.message });
  }
};
