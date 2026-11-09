// A PDF's pages as page images, with the bundled pdf.js (webapp/vendor/): a scanned page at 300 dpi, or at the scan's
// own resolution when that is lower; a digital page at 300 dpi (inputs/render_pages.py's rule, with its cap limited
// to pages that are a scan, so that an ornament does not lower a digital page's resolution); white background, PNG.
// Each page's make-up (its images and text layer) is recorded too.

const VENDOR = new URL("../../vendor/pdfjs-6.5.438/", import.meta.url);
export const PDFJS_VERSION = "6.5.438";
let lib = null;

async function pdfjs() {
  if (!lib) {
    lib = await import(new URL("pdf.min.mjs", VENDOR).href);
    lib.GlobalWorkerOptions.workerSrc = new URL("pdf.worker.min.mjs", VENDOR).href;
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
  const scan = images.reduce((b, im) => (!b || im.coverage > b.coverage ? im : b), null);
  page.cleanup();
  return { size_points: [base.width, base.height], images, text_characters: chars,
           kind: scan && scan.coverage >= 0.5 ? "scan" : "digital", scan_image: scan && scan.coverage >= 0.5 ? scan : null };
}

// Page n (from 1) as a PNG blob, with how it was rendered: a scanned page at 300 dpi, or at the scan's own resolution
// when that is lower; any other page (a digital page, with text and at most small pictures) at 300 dpi.
export async function renderPage(doc, n, maxDpi = 300) {
  const L = await pdfjs();
  const info = await pageInfo(doc, n);
  const page = await doc.getPage(n);
  const base = page.getViewport({ scale: 1 });
  let scale = maxDpi / 72;
  if (info.scan_image?.dpi) scale = Math.min(scale, info.scan_image.dpi / 72);
  const viewport = page.getViewport({ scale });
  const W = Math.round(viewport.width), H = Math.round(viewport.height);
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
export async function renderPageSized(doc, n, W, H) {
  const page = await doc.getPage(n);
  const base = page.getViewport({ scale: 1 });
  if (!W || !H) { W = Math.round(base.width * 300 / 72); H = Math.round(base.height * 300 / 72); }
  const viewport = page.getViewport({ scale: W / base.width });
  const canvas = new OffscreenCanvas(W, H);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, W, H);
  await page.render({ canvas, canvasContext: ctx, viewport, background: "#ffffff" }).promise;
  page.cleanup();
  return canvas.convertToBlob({ type: "image/png" });
}

// The size a page is drawn at, by the rule renderPage uses, from its analysis (pageInfo).
export function drawnSize(info, maxDpi = 300) {
  let dpi = maxDpi;
  if (info.scan_image?.dpi) dpi = Math.min(dpi, info.scan_image.dpi);
  const scale = dpi / 72;
  return { width: Math.round(info.size_points[0] * scale), height: Math.round(info.size_points[1] * scale), dpi: Math.round(dpi * 100) / 100 };
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
