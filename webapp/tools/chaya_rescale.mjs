// Redraw a book's pages at another size, keeping its regions: each page's width and height become its size in points at
// DPI, and every outline and box in its documents (pages/ and edits/) is scaled to match. For a book made before
// `scanImage` took the sharpest image on a page, as the Rāmāyaṇa-mañjarī was (617 × 1048 px, from a 133 ppi
// background; its text layer is 400 ppi). The page images are drawn again by the app at the new size; the documents
// lose `image_sha256`, which named the old image, and the saved model records under work/ are left as they were made.
//   node webapp/tools/chaya_rescale.mjs IN OUT [--dpi=300]
import { readFileSync, writeFileSync } from "node:fs";
import { readChaya, writeChaya } from "../js/chayapdf.js";
import { makeValidator, checkPage } from "../js/schema.js";

const BOXES = new Set(["box", "model_box", "bounds"]);
const scalePoints = (value, fx, fy) => Array.isArray(value[0]) ? value.map(v => scalePoints(v, fx, fy)) : [Math.round(value[0] * fx), Math.round(value[1] * fy)];
export function scaleGeometry(node, fx, fy) {
  if (Array.isArray(node)) { node.forEach(v => scaleGeometry(v, fx, fy)); return; }
  if (!node || typeof node !== "object") return;
  for (const [key, value] of Object.entries(node)) {
    if (key === "polygons" && Array.isArray(value)) node[key] = value.map(ring => scalePoints(ring, fx, fy));
    else if (BOXES.has(key) && Array.isArray(value) && value.length === 4 && value.every(v => typeof v === "number"))
      node[key] = [value[0] * fx, value[1] * fy, value[2] * fx, value[3] * fy].map(v => Math.round(v));
    else if (key === "char_h" && typeof value === "number") node[key] = Math.round(value * fy * 10) / 10;
    else scaleGeometry(value, fx, fy);
  }
}

export async function rescale(bytes, dpi = 300) {
  const { data, original } = await readChaya(bytes);
  const files = data.files, manifest = files["book.json"], report = { pages: 0, documents: 0, sizes: new Set() };
  for (const page of manifest.pages) {
    const points = page.source?.render?.page_size_points;
    if (!points) continue;
    const width = Math.round(points[0] * dpi / 72), height = Math.round(points[1] * dpi / 72);
    if (width === page.width && height === page.height) continue;
    const fx = width / page.width, fy = height / page.height;
    for (const path of [`pages/${page.id}.json`, `edits/${page.id}.json`]) {
      const doc = files[path];
      if (!doc) continue;
      doc.page.width = width; doc.page.height = height; delete doc.page.image_sha256;
      scaleGeometry(doc.page.regions, fx, fy); scaleGeometry(doc.source, fx, fy);
      report.documents++;
    }
    page.source.render = { ...page.source.render, effective_dpi: dpi, scan_image: null,
      redrawn: { from: [page.width, page.height], by: "webapp/tools/chaya_rescale.mjs", at_utc: new Date().toISOString() } };
    page.width = width; page.height = height;
    report.pages++; report.sizes.add(`${width}×${height}`);
  }
  const validate = makeValidator(JSON.parse(readFileSync(new URL("../schema.json", import.meta.url), "utf8")));
  const problems = Object.entries(files).filter(([path]) => /^(pages|edits)\//.test(path)).map(([path, doc]) => [path, checkPage(validate, doc, files["types.json"])[0]]).filter(([, errors]) => errors.length);
  report.invalid = problems.length; report.firstProblems = problems.slice(0, 3).map(([path, errors]) => `${path}: ${errors[0]}`); report.sizes = [...report.sizes].slice(0, 5);
  data.saved_at_utc = new Date().toISOString(); data.saved_by = "webapp/tools/chaya_rescale.mjs";
  return { bytes: problems.length ? null : await writeChaya(original, data), report };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  const [input, output, ...flags] = process.argv.slice(2), opt = Object.fromEntries(flags.map(flag => flag.replace(/^--/, "").split(/=(.*)/s).slice(0, 2)));
  if (!input || !output) { console.error("usage: node webapp/tools/chaya_rescale.mjs IN OUT [--dpi=300]"); process.exit(2); }
  const { bytes, report } = await rescale(new Uint8Array(readFileSync(input)), Number(opt.dpi || 300));
  console.log(JSON.stringify(report));
  if (bytes) { writeFileSync(output, bytes); console.log("wrote", output); } else { console.error("not written"); process.exit(1); }
}
