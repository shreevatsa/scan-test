// Tesseract runs in a local worker using bundled engine and language assets.
import { bbox } from "../render.js?v=20261127-close-contents";
import { tesseractBlocks } from "../local/blocks.js?v=20261127-close-contents";

let workerPromise = null, workerLanguages = null, queue = Promise.resolve();

async function workerFor(languages, progress) {
  if (workerPromise && workerLanguages !== languages) {
    await (await workerPromise).terminate();
    workerPromise = null;
  }
  if (!workerPromise) {
    const { default: { createWorker } } = await import("../../vendor/tesseract-6.0.1/tesseract.esm.min.js?v=20261127-close-contents");
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

// A word with `space: false` is followed by no space (as the OCR detected it); `clean` tidies each line's text.
// `keep(word, lineWords)` may leave out a word of a line (Cloud Vision's unlikely words, vision.js).
export function wordsToReading(words, sent, note = "Local OCR supplies plain text. Review inline formatting and note markers.", clean = text => text, keep = () => true) {
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
    // A word only partly on a line and not centred in it is not that line's: print showing through from the other side
    // of the leaf lies between the lines, and the OCR reads it too ("caricane" amid Kannada).
    if (best && bestScore >= 0.5) { best.words.push(word); word.placed = true; }
  }
  return { regions: sent.filter(s => s.line_ids.length).map(s => {
    const mine = targets.filter(t => t.rid === s.rid);
    // A word left out keeps the space after it (dot leaders between a title and its page: "Title 14", not "Title14").
    for (const t of mine) {
      const kept = [];
      for (const w of [...t.words].sort((a, b) => a.bbox.x0 - b.bbox.x0)) {
        if (keep(w, t.words)) kept.push({ ...w });
        else if (kept.length && w.space !== false) kept.at(-1).space = true;
      }
      t.text = clean(kept.map((w, i, all) => w.text + (i < all.length - 1 && w.space !== false ? " " : "")).join("").normalize("NFC"));
    }
    // A piece that got no words is a line the reader missed, unless it is a fragment of the lines beside it (a vowel
    // sign or a subscript the line analysis cut off): narrow, and lying mostly within a neighbouring line's height.
    // So is a thin piece (well under the lines' usual height) overlapping a line with text: the strip of that line's
    // subscript consonants or vowel signs, which the reader read with the line's words (Tesseract made junk of it).
    const heights = mine.filter(o => o.text).map(o => o.box[3] - o.box[1]).sort((a, b) => a - b);
    const usual = heights[Math.floor(heights.length / 2)] || 0;
    const fragment = t => {
      const width = piece => piece.box[2] - piece.box[0], height = Math.max(1, t.box[3] - t.box[1]);
      const overlap = Math.max(0, ...mine.filter(o => o !== t && o.text).map(o => Math.min(t.box[3], o.box[3]) - Math.max(t.box[1], o.box[1])));
      return (width(t) < 0.15 * Math.max(...mine.map(width)) && overlap >= 0.4 * height) || (height < 0.7 * usual && overlap > 0);
    };
    // Nor is a piece over which other pieces' words lie (their centres within it, across half its width): the line
    // analysis made a piece straddling two lines, or a second piece of one line, whose text is read already (reading it
    // again repeated the lines' words).
    const readElsewhere = t => {
      const [x0, y0, x1, y1] = t.box;
      const over = targets.filter(o => o !== t).flatMap(o => o.words).filter(w => {
        const x = (w.bbox.x0 + w.bbox.x1) / 2, y = (w.bbox.y0 + w.bbox.y1) / 2;
        return x >= x0 && x <= x1 && y >= y0 && y <= y1;
      });
      return over.reduce((sum, w) => sum + Math.max(0, Math.min(x1, w.bbox.x1) - Math.max(x0, w.bbox.x0)), 0) >= 0.5 * (x1 - x0);
    };
    const missed = mine.filter(t => !t.text && !fragment(t) && !readElsewhere(t)).map(t => t.n);
    return { id: s.rid, lines: mine.map(t => ({ n: t.n, text: t.text })), uncertain: missed.length > 0, note, ...(missed.length ? { missed } : {}) };
  }) };
}

function recognizeQueued(image, languages, segmentation, progress, convert, options = {}) {
  const job = queue.catch(() => {}).then(async () => {
    try {
      const worker = await workerFor(languages, progress);
      await worker.setParameters({ tessedit_pageseg_mode: segmentation });
      const { data } = await worker.recognize(image, options, { text: true, blocks: true });
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

// Single lines, each read alone within its box: [{ key, box: [x0, y0, x1, y1] }] → Map key → text. Words Tesseract is
// unsure of (confidence under 50) are left out: print showing through from the other side of the leaf is often inside a
// line's box. Page segmentation 6 (a uniform block), not 7 (one line): with show-through beside the word, 7 is unsure
// of it (5-22) and 6 sure (96).
export async function localLines(image, lines, languages, progress) {
  const out = new Map();
  for (const { key, box } of lines) {
    const [left, top, right, bottom] = box.map(Math.round);
    out.set(key, await recognizeQueued(image, languages, "6", progress,
      data => tesseractWords(data).filter(word => !(word.confidence < 50)).map(word => word.text).join(" ").normalize("NFC"),
      { rectangle: { left, top, width: right - left, height: bottom - top } }));
  }
  return out;
}

export function localLayout(image, languages, progress) {
  return recognizeQueued(image, languages, "3", progress, data => ({ blocks: tesseractBlocks(data),
    block_count: data.blocks?.length || 0, paragraph_count: (data.blocks || []).reduce((count, block) => count + (block.paragraphs?.length || 0), 0),
    confidence: data.confidence }));
}
