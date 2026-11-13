// Tesseract runs in a local worker using bundled engine and language assets.
import { bbox } from "../render.js";
import { tesseractBlocks } from "../local/blocks.js?v=20261113-flags-5";

let workerPromise = null, workerLanguages = null, queue = Promise.resolve();

async function workerFor(languages, progress) {
  if (workerPromise && workerLanguages !== languages) {
    await (await workerPromise).terminate();
    workerPromise = null;
  }
  if (!workerPromise) {
    const { default: { createWorker } } = await import("../../vendor/tesseract-6.0.1/tesseract.esm.min.js");
    const base = new URL("../../vendor/tesseract-6.0.1/", import.meta.url).href;
    workerLanguages = languages;
    workerPromise = createWorker(languages, 1, {
      workerPath: `${base}worker.min.js`, corePath: base, langPath: base,
      workerBlobURL: false, logger: event => progress?.(event.status),
    });
  }
  return workerPromise;
}

function inside(x, y, rings) {
  return rings.some(ring => {
    let hit = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [ax, ay] = ring[i], [bx, by] = ring[j];
      if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) hit = !hit;
    }
    return hit;
  });
}

export function tesseractWords(data) {
  const words = [];
  for (const block of data.blocks || []) for (const paragraph of block.paragraphs || [])
    for (const line of paragraph.lines || []) for (const word of line.words || []) {
      if (word.text?.trim() && word.bbox) words.push({ text: word.text.trim(), bbox: word.bbox, confidence: word.confidence });
    }
  return words;
}

export function wordsToReading(words, sent, note = "Local OCR supplies plain text. Review inline formatting and note markers.") {
  const targets = sent.flatMap(s => s.line_ids.map((id, i) => {
    const line = s.region.lines.find(L => L.line_id === id);
    return { rid: s.rid, n: i + 1, rings: line.polygons, box: bbox(line.polygons), words: [] };
  }));
  for (const word of words) {
    const b = word.bbox, x = (b.x0 + b.x1) / 2, y = (b.y0 + b.y1) / 2;
    const area = Math.max(1, (b.x1 - b.x0) * (b.y1 - b.y0));
    let best = null, bestScore = 0;
    for (const target of targets) {
      const [x0, y0, x1, y1] = target.box;
      const overlap = Math.max(0, Math.min(x1, b.x1) - Math.max(x0, b.x0)) * Math.max(0, Math.min(y1, b.y1) - Math.max(y0, b.y0));
      const score = overlap / area + (inside(x, y, target.rings) ? 1 : 0);
      if (score > bestScore) { best = target; bestScore = score; }
    }
    if (best) best.words.push(word);
  }
  return { regions: sent.filter(s => s.line_ids.length).map(s => {
    const lines = targets.filter(t => t.rid === s.rid).map(t => ({ n: t.n,
      text: t.words.sort((a, b) => a.bbox.x0 - b.bbox.x0).map(w => w.text).join(" ").normalize("NFC") }));
    return { id: s.rid, lines, uncertain: lines.some(L => !L.text),
      note };
  }) };
}

function recognizeQueued(image, languages, segmentation, progress, convert) {
  const job = queue.catch(() => {}).then(async () => {
    try {
      const worker = await workerFor(languages, progress);
      await worker.setParameters({ tessedit_pageseg_mode: segmentation });
      const { data } = await worker.recognize(image, {}, { text: true, blocks: true });
      return convert(data);
    } catch (error) {
      const failed = workerPromise;
      workerPromise = null;
      failed?.then(worker => worker.terminate()).catch(() => {});
      throw error;
    }
  });
  queue = job;
  return job;
}

export function localReading(image, sent, languages, progress) {
  return recognizeQueued(image, languages, "6", progress, data => {
    const words = tesseractWords(data);
    if (!words.length && sent.some(s => s.line_ids.length)) throw new Error("Tesseract returned no words for the page.");
    return { reading: wordsToReading(words, sent), words: words.length, confidence: data.confidence };
  });
}

export function localLayout(image, languages, progress) {
  return recognizeQueued(image, languages, "3", progress, data => ({ blocks: tesseractBlocks(data),
    block_count: data.blocks?.length || 0, paragraph_count: (data.blocks || []).reduce((count, block) => count + (block.paragraphs?.length || 0), 0),
    confidence: data.confidence }));
}
