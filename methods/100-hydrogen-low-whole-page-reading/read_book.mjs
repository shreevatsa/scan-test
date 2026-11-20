// Method 100: read a book's pages with one whole-page image per call (Gemini 4 Hydrogen, low thinking, on Vertex AI),
// telling the model the page's regions (id, type, number of line pieces, box) and asking for each region's printed
// lines. Lines go onto the regions' line pieces in order; a region whose line count differs keeps its old text and is
// reported. Footnote markers written as [n] become zero-width note-marker spans. Each call is cached (CACHE/<page>.json)
// and entered in the book's ledger (work/reader-lab/ledger.json) with its record under work/reader-calls/.
//   TOKEN=… PROJECT=… node read_book.mjs IN.chaya.pdf OUT.chaya.pdf PDF CACHE [--pages=25,60] [--limit-usd=13] [--parallel=8] [--dpi=400]
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readChaya, writeChaya } from "../../webapp/js/chayapdf.js";
import { makeValidator, checkPage } from "../../webapp/js/schema.js";

const [input, output, pdfPath, cache, ...flags] = process.argv.slice(2);
const opt = Object.fromEntries(flags.map(flag => flag.replace(/^--/, "").split(/=(.*)/s).slice(0, 2)));
const MODEL = "gemini-4-hydrogen", THINKING = "LOW", RATES = { input: 1.5, output: 7.5 }, METHOD = "100-hydrogen-low-whole-page-reading";
const LIMIT = Number(opt["limit-usd"] || 13), PARALLEL = Number(opt.parallel || 8), DPI = Number(opt.dpi || 400);
mkdirSync(cache, { recursive: true });

export function prompt(types, regions) {
  return `This is one page of a printed book: ${types.title}. ${types.description || ""}
Read the visible print exactly as printed. The page has these regions, listed in reading order, each with its id, its kind, how many printed lines it has, and its box as [ymin, xmin, ymax, xmax] in thousandths of the page:
${regions.map(r => `- ${r.id}: ${r.type}, ${r.lines} line${r.lines === 1 ? "" : "s"}, box [${r.box.join(", ")}]`).join("\n")}
For every region, return its printed lines in order, exactly as many as listed, one string per printed line, holding only that region's text.
Use Unicode NFC in the script printed. Keep spelling, punctuation, digits, dandas and verse numbers exactly as printed; do not correct the text.
Footnote markers: in the text, a small raised numeral or sign is printed over or just after a word to point to a footnote. Write each such marker in square brackets where it is printed, for example तीर[१]स्य or धन्यतावहम्[३]. Do not put a footnote's own number, at the start of the footnote, in brackets.
Return JSON matching the schema.`;
}
const MARK = /\[([^\]\s]{1,3})\]/g;
export function toLine(text, newId) {   // "तीर[१]स्य" → { text: "तीरस्य", spans: [note marker at 3] }
  let out = "", spans = [], last = 0;
  for (const match of text.matchAll(MARK)) {
    out += text.slice(last, match.index); last = match.index + match[0].length;
    spans.push({ start: [...out].length, end: [...out].length, kind: "note_marker", id: newId(), marker: match[1] });
  }
  out += text.slice(last);
  return { text: out.normalize("NFC"), spans };
}

async function call(page, regions, types) {
  const file = `${cache}/${page.id}.json`;
  if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8"));
  const png = `${cache}/${page.id}.png`;
  execFileSync("pdftoppm", ["-f", String(page.pdf_page), "-l", String(page.pdf_page), "-r", String(DPI), "-gray", "-png", "-singlefile", pdfPath, png.replace(/\.png$/, "")]);
  const image = readFileSync(png).toString("base64"); rmSync(png);
  const text = prompt(types, regions);
  const schema = { type: "OBJECT", required: ["regions"], properties: { regions: { type: "ARRAY", items: { type: "OBJECT", required: ["id", "lines"],
    properties: { id: { type: "STRING", enum: regions.map(r => r.id) }, lines: { type: "ARRAY", items: { type: "STRING" } } } } } } };
  const body = { contents: [{ role: "user", parts: [{ inlineData: { mimeType: "image/png", data: image } }, { text }] }],
    generationConfig: { responseMimeType: "application/json", responseSchema: schema, mediaResolution: "MEDIA_RESOLUTION_HIGH", maxOutputTokens: 32768, thinkingConfig: { thinkingLevel: THINKING } } };
  const url = `https://aiplatform.googleapis.com/v1/projects/${process.env.PROJECT}/locations/global/publishers/google/models/${MODEL}:generateContent`;
  for (let attempt = 1; ; attempt++) {
    const started = Date.now();
    try {
      const res = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${process.env.TOKEN}`, "x-goog-user-project": process.env.PROJECT, "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(240000) });
      const json = await res.json(), seconds = (Date.now() - started) / 1000;
      if (json.error) throw new Error(`${res.status} ${json.error.message}`);
      const u = json.usageMetadata || {}, thought = u.thoughtsTokenCount || 0;
      const cost = ((u.promptTokenCount || 0) * RATES.input + ((u.candidatesTokenCount || 0) + thought) * RATES.output) / 1e6;
      const answer = json.candidates?.[0]?.content?.parts?.filter(p => !p.thought).map(p => p.text).join("") || "";
      let parsed = null; try { parsed = JSON.parse(answer); } catch {}
      const record = { id: randomUUID(), method: METHOD, model: MODEL, thinking: THINKING, page: page.id, pdf_page: page.pdf_page, dpi: DPI, at_utc: new Date().toISOString(), seconds, cost_usd: cost, usage: u, finish: json.candidates?.[0]?.finishReason, request: { prompt: text, schema, image: `PDF page ${page.pdf_page} at ${DPI} dpi, gray PNG` }, parsed, raw: parsed ? undefined : answer };
      writeFileSync(file, JSON.stringify(record));
      return record;
    } catch (error) {
      if (attempt >= 3) return { error: String(error.message || error), page: page.id };
      await new Promise(r => setTimeout(r, 4000 * attempt));
    }
  }
}

const { data, original } = await readChaya(new Uint8Array(readFileSync(input)));
const files = data.files, manifest = files["book.json"], types = files["types.json"], skipped = new Set(manifest.skipped || []);
const want = opt.pages ? new Set(opt.pages.split(",").map(Number)) : null;
const pages = manifest.pages.filter(p => !skipped.has(p.id) && files[`pages/${p.id}.json`] && !files[`edits/${p.id}.json`] && (!want || want.has(p.pdf_page)));
const report = { pages: 0, calls: 0, cost_usd: 0, failed: [], mismatched: [], markers: 0, regions: 0, regions_kept: 0 };
const ledger = files["work/reader-lab/ledger.json"];
let index = 0, stop = false;
async function worker() {
  while (!stop && index < pages.length) {
    const page = pages[index++], doc = files[`pages/${page.id}.json`];
    const regions = [...doc.page.regions].filter(r => (r.lines || []).length).sort((a, b) => (a.order ?? 1e6 + a.box[1]) - (b.order ?? 1e6 + b.box[1]) || a.box[1] - b.box[1]);
    if (!regions.length) continue;
    const W = doc.page.width, H = doc.page.height;
    const list = regions.map(r => ({ id: r.id, type: r.type, lines: r.lines.length, box: [r.box[1] / H, r.box[0] / W, r.box[3] / H, r.box[2] / W].map(v => Math.round(v * 1000)) }));
    const record = await call(page, list, types);
    if (record.error || !record.parsed) { report.failed.push(`${page.pdf_page}: ${record.error || record.finish}`); continue; }
    report.calls++; report.cost_usd += record.cost_usd;
    if (report.cost_usd > LIMIT) { stop = true; console.error(`spend limit reached at $${report.cost_usd.toFixed(2)}`); }
    // the record and the ledger entry, as the app keeps them
    const path = `work/reader-calls/${page.id}/reading-${record.id}.json`;
    if (!ledger.calls.some(c => c.id === record.id)) {
      files[path] = record;
      ledger.calls.push({ id: record.id, path, page: page.id, stage: "reading", profile: "hydrogen-low-page", status: "completed", cost_usd: record.cost_usd, seconds: record.seconds, method: METHOD });
    }
    // the text onto the line pieces
    let n = 0; const newId = () => `nm${++n}`;
    const got = new Map(record.parsed.regions.map(r => [r.id, r.lines]));
    for (const region of regions) {
      report.regions++;
      const lines = got.get(region.id);
      if (!lines || lines.length !== region.lines.length) { report.regions_kept++; report.mismatched.push(`${page.pdf_page} ${region.id} ${region.type}: ${region.lines.length} pieces, ${lines ? lines.length : "no"} lines`); continue; }
      region.lines.forEach((piece, k) => {
        const { text, spans } = toLine(lines[k], newId);
        piece.text = text; if (spans.length) piece.spans = spans; else delete piece.spans;
        report.markers += spans.length;
      });
    }
    // markers left in regions that kept their old text keep their spans; give them fresh ids
    for (const region of doc.page.regions) for (const piece of region.lines || []) for (const span of piece.spans || []) if (span.kind === "note_marker" && !/^nm\d+$/.test(span.id) ) span.id = newId();
    delete doc.relations;   // the old marker ids are gone; links are made again from the new markers
    doc.source = { ...doc.source, reader: "hydrogen-low-page", model: MODEL,
      layers: { ...doc.source.layers, text: { ...doc.source.layers.text, state: "model", made_by: METHOD, call: record.id } } };
    report.pages++;
    if (report.pages % 25 === 0) console.error(`${report.pages} pages, $${report.cost_usd.toFixed(2)}`);
  }
}
await Promise.all(Array.from({ length: PARALLEL }, worker));
const validate = makeValidator(JSON.parse(readFileSync(new URL("../../webapp/schema.json", import.meta.url), "utf8")));
const invalid = pages.map(p => [p.pdf_page, checkPage(validate, files[`pages/${p.id}.json`], types)[0]]).filter(([, e]) => e.length);
report.invalid = invalid.length; report.firstInvalid = invalid.slice(0, 3).map(([p, e]) => `${p}: ${e[0]}`);
report.cost_usd = Math.round(report.cost_usd * 10000) / 10000;
data.saved_at_utc = new Date().toISOString(); data.saved_by = `methods/${METHOD}/read_book.mjs`;
if (!invalid.length) writeFileSync(output, await writeChaya(original, data));
console.log(JSON.stringify({ ...report, mismatched: report.mismatched.length, firstMismatched: report.mismatched.slice(0, 8), failed: report.failed }, null, 1));
writeFileSync(`${cache}/report.json`, JSON.stringify(report, null, 1));
