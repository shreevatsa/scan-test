// A PDF's pages as page images, with the bundled pdf.js (webapp/vendor/): a scanned page at 300 dpi, or at the scan's
// own resolution when that is lower; a digital page at 300 dpi (inputs/render_pages.py's rule, with its cap limited
// to pages that are a scan, so that an ornament does not lower a digital page's resolution); white background, PNG.
// Each page's make-up (its images and text layer) is recorded too.

const VENDOR = new URL("../../vendor/pdfjs-6.5.438/", import.meta.url);
export const PDFJS_VERSION = "6.5.438";
let lib = null;

async function pdfjs() {
  if (!lib) {
    lib = await import(new URL("pdf.min.mjs?v=20261127-replay-any-reader", VENDOR).href);
    lib.GlobalWorkerOptions.workerSrc = new URL("pdf.worker.min.mjs?v=20261127-replay-any-reader", VENDOR).href;
  }
  return lib;
}

export async function openPdf(file) {
  return openPdfData(new Uint8Array(await file.arrayBuffer()));
}

// A PDF from its bytes (pdf.js takes them over: pass a copy if they are needed afterwards).
export async function openPdfData(data) {
  const L = await pdfjs();
  return L.getDocument({
    data, wasmUrl: new URL("wasm/", VENDOR).href, iccUrl: new URL("iccs/", VENDOR).href,
    cMapUrl: new URL("cmaps/", VENDOR).href, cMapPacked: true, standardFontDataUrl: new URL("standard_fonts/", VENDOR).href,
  }).promise;
}

// What a page is made of: each image drawn on it, with its own pixel size and the area it covers on the page (from
// the transformation in force where it is drawn), and its text layer (characters, and those drawn invisibly, as a
// scan's hidden OCR text is). A page whose largest image covers at least half of it is a scan.
export async function pageInfo(doc, n) {
  const L = await pdfjs();
  const page = await doc.getPage(n);
  const base = page.getViewport({ scale: 1 });
  const ops = await page.getOperatorList();
  const O = L.OPS;
  const mul = (m, t) => [m[0] * t[0] + m[2] * t[1], m[1] * t[0] + m[3] * t[1], m[0] * t[2] + m[2] * t[3], m[1] * t[2] + m[3] * t[3],
                         m[0] * t[4] + m[2] * t[5] + m[4], m[1] * t[4] + m[3] * t[5] + m[5]];
  let ctm = [1, 0, 0, 1, 0, 0];
  const stack = [], images = [];
  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i], a = ops.argsArray[i];
    if (fn === O.save) stack.push(ctm);
    else if (fn === O.restore) ctm = stack.pop() || ctm;
    else if (fn === O.transform) ctm = mul(ctm, a);
    else if (fn === O.paintFormXObjectBegin) { stack.push(ctm); if (Array.isArray(a?.[0]) && a[0].length === 6) ctm = mul(ctm, a[0]); }
    else if (fn === O.paintFormXObjectEnd) ctm = stack.pop() || ctm;
    else {
      let w, h;
      if (fn === O.paintImageXObject || fn === O.paintImageXObjectRepeat) { w = a[1]; h = a[2]; }
      else if (fn === O.paintInlineImageXObject || fn === O.paintImageMaskXObject) { w = a[0]?.width; h = a[0]?.height; }
      if (!w || !h) continue;
      // The image fills the unit square, mapped by the current matrix: its size on the page in points.
      const pw = Math.hypot(ctm[0], ctm[1]), ph = Math.hypot(ctm[2], ctm[3]);
      images.push({ pixels: [w, h], points: [Math.round(pw * 10) / 10, Math.round(ph * 10) / 10],
                    coverage: Math.round(Math.min(1, (pw * ph) / (base.width * base.height)) * 1000) / 1000,
                    dpi: pw ? Math.round((w / (pw / 72)) * 10) / 10 : null });
    }
  }
  const text = await page.getTextContent({ includeMarkedContent: false });
  let chars = 0;
  for (const it of text.items) chars += (it.str || "").replace(/\s/g, "").length;
  const scan = scanImage(images);
  page.cleanup();
  return { size_points: [base.width, base.height], images, text_characters: chars, kind: scan ? "scan" : "digital", scan_image: scan };
}

// The scan among a page's images: of those covering at least half of the page, the one with the most pixels per inch.
// A scan from archive.org is often two images over the whole page, a coarse colour background and the text as a sharp
// black-and-white layer; the text's resolution is the scan's (inputs/render_pages.py likewise takes the largest image).
export function scanImage(images) {
  return images.filter(im => im.coverage >= 0.5).reduce((b, im) => (!b || (im.dpi || 0) > (b.dpi || 0) ? im : b), null);
}

// Page n (from 1) as a PNG blob, with how it was rendered: a scanned page at 300 dpi, or at the scan's own resolution
// when that is lower; any other page (a digital page, with text and at most small pictures) at 300 dpi.
export async function renderPage(doc, n, maxDpi = 300, part = null) {
  const L = await pdfjs();
  const info = await pageInfo(doc, n);
  const page = await doc.getPage(n);
  const base = page.getViewport({ scale: 1 }), [x0, x1] = part || [0, 1];
  let scale = maxDpi / 72;
  if (info.scan_image?.dpi) scale = Math.min(scale, info.scan_image.dpi / 72);
  const viewport = page.getViewport({ scale, offsetX: -x0 * base.width * scale });
  const W = Math.round(base.width * (x1 - x0) * scale), H = Math.round(viewport.height);
  const canvas = new OffscreenCanvas(W, H);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, W, H);
  await page.render({ canvas, canvasContext: ctx, viewport, background: "#ffffff" }).promise;
  const blob = await canvas.convertToBlob({ type: "image/png" });
  page.cleanup();
  return { blob, width: W, height: H, info,
           render: { library: `pdf.js ${PDFJS_VERSION}`, effective_dpi: Math.round(scale * 72 * 100) / 100, page_kind: info.kind,
                     scan_image: info.scan_image, page_size_points: [base.width, base.height],
                     rule: "a scanned page (an image covering at least half of it) at 300 dpi, or the scan's own resolution when lower; other pages at 300 dpi" } };
}

// Page n drawn at exactly W × H pixels (the size its regions are measured in), as a PNG blob.
// `part`: a book page that is one side of a two-page spread is drawn from that part of the PDF page, [x0, x1] as
// fractions of its width (the store's page.pdf_part); W × H is then the size of the part.
export async function renderPageSized(doc, n, W, H, part = null) {
  return (await drawPage(doc, n, W, H, part)).convertToBlob({ type: "image/png" });
}

async function drawPage(doc, n, W, H, part = null) {
  const page = await doc.getPage(n);
  const base = page.getViewport({ scale: 1 }), [x0, x1] = part || [0, 1];
  if (!W || !H) { W = Math.round(base.width * (x1 - x0) * 300 / 72); H = Math.round(base.height * 300 / 72); }
  const scale = W / (base.width * (x1 - x0));
  const viewport = page.getViewport({ scale, offsetX: -x0 * base.width * scale });
  const canvas = new OffscreenCanvas(W, H);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, W, H);
  await page.render({ canvas, canvasContext: ctx, viewport, background: "#ffffff" }).promise;
  page.cleanup();
  return canvas;
}

// A two-page spread (a photograph or scan of an open book, two pages side by side) is cut into its pages at the fold:
// where, as a fraction of the page's width. Drawn small, each column of the page is scored by its changes between
// light and dark from top to bottom: a column of text has many, the margins and the shadow of the fold few. The cut is
// in the quiet band nearest the middle, within the middle 30–70%: at the middle if that is quiet, else at the centre of
// the nearest quiet run; null where no column there is far quieter than text (text crosses the middle: not a spread).
export async function spreadFold(doc, n) {
  const page = await doc.getPage(n);
  const base = page.getViewport({ scale: 1 });
  page.cleanup();
  const W = Math.max(60, Math.round(base.width * 40 / 72)), H = Math.max(40, Math.round(base.height * 40 / 72));
  const canvas = await drawPage(doc, n, W, H);
  return foldOf(canvas.getContext("2d").getImageData(0, 0, W, H));
}

// The fold of a spread from its pixels ({ width, height, data } as ImageData), as spreadFold.
export function foldOf({ width: W, height: H, data }) {
  const grey = (x, y) => { const i = (y * W + x) * 4; return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]; };
  const changes = Array.from({ length: W }, (_, x) => {
    let sum = 0;
    for (let y = 1; y < H; y++) { const d = Math.abs(grey(x, y) - grey(x, y - 1)); if (d > 40) sum += d; }
    return sum;
  });
  const score = changes.map((_, x) => (changes[Math.max(0, x - 1)] + changes[x] + changes[Math.min(W - 1, x + 1)]) / 3);
  const level = [...score].sort((a, b) => a - b)[Math.floor(0.8 * W)];
  if (!level) return null;
  const lo = Math.floor(0.3 * W), hi = Math.ceil(0.7 * W), mid = Math.round(W / 2);
  // Quiet: near the quietest column of the middle (a photograph's paper is never quite still), which must itself be far
  // quieter than text.
  const least = Math.min(...score.slice(lo, hi + 1));
  if (least > 0.2 * level) return null;
  const quiet = x => score[x] <= Math.max(0.08 * level, 2 * least);
  let at = null;
  for (let d = 0; at === null && (mid - d >= lo || mid + d <= hi); d++) {
    if (mid - d >= lo && quiet(mid - d)) at = mid - d;
    else if (mid + d <= hi && quiet(mid + d)) at = mid + d;
  }
  if (at === null) return null;
  if (at === mid) return 0.5;
  let a = at, b = at;
  while (a - 1 >= lo && quiet(a - 1)) a--;
  while (b + 1 <= hi && quiet(b + 1)) b++;
  return Math.round(((a + b) / 2 / W) * 1000) / 1000;
}

// Whether the page `other` comes straight after (delta 1) or before (delta -1) the page `here` in their PDF, for joining
// text across them: pages of the PDF one apart, or the two sides of one spread (a right side counting half a page on).
// Pages with no PDF page (a book of images) are taken to follow.
const pdfPosition = page => page.pdf_page + (page.pdf_part?.[0] > 0 ? 0.5 : 0);
export function pdfFollows(here, other, delta) {
  if (!here?.pdf_page || !other?.pdf_page) return true;
  const step = delta * (pdfPosition(other) - pdfPosition(here));
  return step > 0 && step <= 1;
}

// The size a page is drawn at, by the rule renderPage uses, from its analysis (pageInfo).
export function drawnSize(info, maxDpi = 300, part = null) {
  let dpi = maxDpi;
  if (info.scan_image?.dpi) dpi = Math.min(dpi, info.scan_image.dpi);
  const scale = dpi / 72, [x0, x1] = part || [0, 1];
  return { width: Math.round(info.size_points[0] * (x1 - x0) * scale), height: Math.round(info.size_points[1] * scale), dpi: Math.round(dpi * 100) / 100 };
}

// Page numbers from a range like "1-20, 25, 30-" (from 1, inclusive), within 1..count; empty means all.
export function pageRange(text, count) {
  const t = (text || "").trim();
  if (!t || t.toLowerCase() === "all") return Array.from({ length: count }, (_, i) => i + 1);
  const out = new Set();
  for (const part of t.split(/[,\s]+/).filter(Boolean)) {
    const m = /^(\d*)\s*[-–]\s*(\d*)$/.exec(part) || /^(\d+)$/.exec(part);
    if (!m) throw new Error(`"${part}" is not a page or a range of pages`);
    const a = m[2] === undefined ? +m[1] : (m[1] ? +m[1] : 1), b = m[2] === undefined ? +m[1] : (m[2] ? +m[2] : count);
    for (let i = Math.max(1, a); i <= Math.min(count, b); i++) out.add(i);
  }
  if (!out.size) throw new Error(`no pages of the PDF's ${count} in "${t}"`);
  return [...out].sort((p, q) => p - q);
}
