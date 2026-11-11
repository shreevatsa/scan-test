// A book inside its PDF (a ".chaya.pdf"): the book's data as one attached file, chaya.json, compressed, in the PDF's
// embedded files. chaya.json is {format: "chaya-book", version: 1, original: {name, sha256, length}, saved_at_utc,
// saved_by, files}, where files holds the book folder's files but source.pdf and the page images (which are drawn
// from the PDF): "book.json", "types.json", "style.json", "pages/<id>.json", "edits/<id>.json" and "work/..." (JSON
// files as objects, others as text).
//
// Written as the original PDF's bytes, unchanged, followed by one incremental update: the attached file, its file
// specification, the document catalog (and names dictionary) with the attachment added, and a cross-reference
// section of the same kind as the original's last one. A comment right after the original's bytes records their
// length and sha256, so the original is recovered exactly by cutting the file there, and checked. Saving again
// rebuilds the update on the original's bytes, so the file does not grow.
//
// No dependencies: a small PDF parser (objects, classic and stream cross-references, object streams, Flate with PNG
// predictors) reads what the update needs: the trailer, the catalog and its names dictionary. Encrypted PDFs are
// refused. Runs in browsers and in Node (CompressionStream, DecompressionStream, crypto.subtle).

const ATTACHMENT = "chaya.json";
const MARKER = "%chaya-book 1 ";

// ---------------------------------------------------------------- bytes

const latin1 = u8 => { let s = ""; for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode.apply(null, u8.subarray(i, i + 8192)); return s; };
const bytesOf = s => { const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) & 255; return u; };

async function pipe(u8, stream) {
  return new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(stream)).arrayBuffer());
}
export const inflate = u8 => pipe(u8, new DecompressionStream("deflate"));
export const deflate = u8 => pipe(u8, new CompressionStream("deflate"));

// (Browsers give crypto.subtle only to secure contexts: https or localhost. Elsewhere this returns null, and the
// original is not checked.)
export async function sha256hex(u8) {
  if (!globalThis.crypto?.subtle) return null;
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", u8));
  return [...d].map(b => b.toString(16).padStart(2, "0")).join("");
}

// The last occurrence of an ASCII string in a byte array, searching back from `from`, or -1.
function lastIndexOf(u8, str, from = u8.length - str.length) {
  const first = str.charCodeAt(0);
  outer: for (let i = Math.min(from, u8.length - str.length); i >= 0; i--) {
    if (u8[i] !== first) continue;
    for (let k = 1; k < str.length; k++) if (u8[i + k] !== str.charCodeAt(k)) continue outer;
    return i;
  }
  return -1;
}

// ---------------------------------------------------------------- lexer and parser

const WS = new Set([0, 9, 10, 12, 13, 32]);
const DELIM = new Set([40, 41, 60, 62, 91, 93, 123, 125, 47, 37]);

class PdfError extends Error {}
const fail = m => { throw new PdfError(m); };

// Values: {t: "num"|"name"|"str"|"arr"|"dict"|"ref"|"kw", v, s, e, buf}; s and e span the value's text in buf.
class Lexer {
  constructor(buf, pos = 0) { this.b = buf; this.p = pos; }
  skip() {
    const b = this.b;
    for (;;) {
      while (this.p < b.length && WS.has(b[this.p])) this.p++;
      if (b[this.p] !== 37) return;
      while (this.p < b.length && b[this.p] !== 10 && b[this.p] !== 13) this.p++;
    }
  }
  word() {
    this.skip();
    const s = this.p, b = this.b;
    while (this.p < b.length && !WS.has(b[this.p]) && !DELIM.has(b[this.p])) this.p++;
    return latin1(b.subarray(s, this.p));
  }
  expect(kw) { const w = this.word(); if (w !== kw) fail(`expected ${kw}, found ${JSON.stringify(w)} at ${this.p}`); }
  int() { const w = this.word(); if (!/^[+-]?\d+$/.test(w)) fail(`expected an integer, found ${JSON.stringify(w)} at ${this.p}`); return +w; }
  value() {
    this.skip();
    const b = this.b, s = this.p, c = b[s];
    const node = (t, v) => ({ t, v, s, e: this.p, buf: b });
    if (c === 47) { // name
      this.p++;
      while (this.p < b.length && !WS.has(b[this.p]) && !DELIM.has(b[this.p])) this.p++;
      return node("name", latin1(b.subarray(s + 1, this.p)).replace(/#([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16))));
    }
    if (c === 60 && b[s + 1] === 60) { // dictionary
      this.p += 2;
      const m = new Map();
      for (;;) {
        this.skip();
        if (b[this.p] === 62 && b[this.p + 1] === 62) { this.p += 2; break; }
        if (this.p >= b.length) fail("unterminated dictionary");
        const k = this.value();
        if (k.t !== "name") fail(`a dictionary key is not a name at ${k.s}`);
        m.set(k.v, this.value());
      }
      return node("dict", m);
    }
    if (c === 60) { // hex string
      while (this.p < b.length && b[this.p] !== 62) this.p++;
      this.p++;
      return node("str", null);
    }
    if (c === 40) { // literal string, with nesting and escapes
      let depth = 0;
      do {
        const x = b[this.p++];
        if (x === 92) this.p++;
        else if (x === 40) depth++;
        else if (x === 41) depth--;
      } while (depth > 0 && this.p < b.length);
      return node("str", null);
    }
    if (c === 91) { // array
      this.p++;
      const a = [];
      for (;;) {
        this.skip();
        if (b[this.p] === 93) { this.p++; break; }
        if (this.p >= b.length) fail("unterminated array");
        a.push(this.value());
      }
      return node("arr", a);
    }
    const w = this.word();
    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(w)) {
      // An indirect reference: two integers and R.
      if (/^\d+$/.test(w)) {
        const save = this.p;
        const g = this.word();
        if (/^\d+$/.test(g) && this.word() === "R") return { t: "ref", n: +w, g: +g, s, e: this.p, buf: b };
        this.p = save;
      }
      return node("num", +w);
    }
    if (!w) fail(`unexpected byte ${c} at ${s}`);
    return node("kw", w);
  }
}

export const raw = x => latin1(x.buf.subarray(x.s, x.e));

// The text of a literal or hex string value (simple escapes; enough for names in a name tree).
function stringText(x) {
  const t = raw(x);
  if (t[0] === "<") return t.slice(1, -1).replace(/\s/g, "").replace(/(..)/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  return t.slice(1, -1).replace(/\\([nrtbf()\\]|[0-7]{1,3})/g, (_, e) => ({ n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", "(": "(", ")": ")", "\\": "\\" }[e] ?? String.fromCharCode(parseInt(e, 8))));
}

// PNG predictors (Predictor 10-15), as cross-reference streams use them.
function unpredict(data, parms) {
  const pred = parms?.get("Predictor")?.v || 1;
  if (pred < 10) return data;
  const colors = parms.get("Colors")?.v || 1, bpc = parms.get("BitsPerComponent")?.v || 8, cols = parms.get("Columns")?.v || 1;
  const bpp = Math.max(1, Math.ceil((colors * bpc) / 8)), row = Math.ceil((colors * bpc * cols) / 8);
  const out = new Uint8Array(Math.floor(data.length / (row + 1)) * row);
  let prev = new Uint8Array(row);
  for (let r = 0, i = 0; i + row < data.length + 1 && r * row < out.length; r++) {
    const type = data[i++], cur = out.subarray(r * row, (r + 1) * row);
    for (let k = 0; k < row; k++) {
      const x = data[i + k], a = k >= bpp ? cur[k - bpp] : 0, up = prev[k], c = k >= bpp ? prev[k - bpp] : 0;
      let v;
      if (type === 0) v = x;
      else if (type === 1) v = x + a;
      else if (type === 2) v = x + up;
      else if (type === 3) v = x + ((a + up) >> 1);
      else { const p = a + up - c, pa = Math.abs(p - a), pb = Math.abs(p - up), pc = Math.abs(p - c); v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? up : c); }
      cur[k] = v & 255;
    }
    i += row;
    prev = cur;
  }
  return out;
}

// ---------------------------------------------------------------- a PDF file, read

class PdfFile {
  constructor(bytes) { this.b = bytes; this.entries = new Map(); this.objStreams = new Map(); }

  static async open(bytes) {
    const f = new PdfFile(bytes);
    const sx = lastIndexOf(bytes, "startxref");
    if (sx < 0) fail("no startxref: this is not a PDF, or it is damaged");
    const lx = new Lexer(bytes, sx);
    lx.expect("startxref");
    f.lastXref = lx.int();
    const seen = new Set();
    let off = f.lastXref, first = true;
    while (off !== null && off !== undefined && !seen.has(off)) {
      seen.add(off);
      const { trailer, kind } = await f.readSection(off);
      if (first) { f.trailer = trailer; f.lastKind = kind; first = false; }
      const stm = trailer.get("XRefStm");
      if (stm && !seen.has(stm.v)) { seen.add(stm.v); await f.readSection(stm.v); }
      off = trailer.get("Prev")?.v ?? null;
    }
    if (!f.trailer) fail("no cross-reference section");
    return f;
  }

  // One cross-reference section at `off`: its entries (older ones do not replace newer) and its trailer.
  async readSection(off) {
    const lx = new Lexer(this.b, off);
    lx.skip();
    const save = lx.p;
    if (lx.word() === "xref") {
      for (;;) {
        lx.skip();
        const p = lx.p, w = lx.word();
        if (w === "trailer") break;
        if (!/^\d+$/.test(w)) fail(`bad cross-reference table at ${p}`);
        const start = +w, count = lx.int();
        for (let i = 0; i < count; i++) {
          const o = lx.int(), g = lx.int(), kind = lx.word();
          if (!this.entries.has(start + i)) this.entries.set(start + i, kind === "n" ? { type: 1, off: o, gen: g } : { type: 0 });
        }
      }
      const trailer = lx.value();
      if (trailer.t !== "dict") fail("the trailer is not a dictionary");
      return { trailer: trailer.v, kind: "table" };
    }
    lx.p = save;
    lx.int(); lx.int(); lx.expect("obj");
    const d = lx.value();
    if (d.t !== "dict" || d.v.get("Type")?.v !== "XRef") fail(`no cross-reference at ${off}`);
    const data = await this.streamData(d.v, lx);
    const W = d.v.get("W").v.map(x => x.v);
    const size = d.v.get("Size").v;
    const index = d.v.get("Index")?.v.map(x => x.v) || [0, size];
    const rowLen = W[0] + W[1] + W[2];
    const field = (pos, len, dflt) => { if (!len) return dflt; let v = 0; for (let k = 0; k < len; k++) v = v * 256 + data[pos + k]; return v; };
    let pos = 0;
    for (let s = 0; s < index.length; s += 2) {
      for (let i = 0; i < index[s + 1]; i++, pos += rowLen) {
        const num = index[s] + i;
        if (this.entries.has(num)) continue;
        const type = field(pos, W[0], 1), a = field(pos + W[0], W[1], 0), c = field(pos + W[0] + W[1], W[2], 0);
        this.entries.set(num, type === 1 ? { type: 1, off: a, gen: c } : type === 2 ? { type: 2, stm: a, idx: c } : { type: 0 });
      }
    }
    return { trailer: d.v, kind: "stream" };
  }

  // A stream's decoded bytes; `lx` stands just after its dictionary.
  async streamData(dict, lx) {
    lx.expect("stream");
    let p = lx.p;
    if (this.bufOf(lx)[p] === 13) p++;
    if (this.bufOf(lx)[p] === 10) p++;
    let len = dict.get("Length");
    if (len?.t === "ref") len = (await this.object(len.n)).v;
    else len = len?.v;
    if (!Number.isInteger(len)) fail("a stream without a usable length");
    let data = this.bufOf(lx).subarray(p, p + len);
    const filters = dict.get("Filter");
    const list = !filters ? [] : filters.t === "arr" ? filters.v.map(x => x.v) : [filters.v];
    const parmsAll = dict.get("DecodeParms");
    for (const [i, f] of list.entries()) {
      if (f !== "FlateDecode") fail(`a stream filter this reader does not know: ${f}`);
      data = await inflate(data);
      const parms = parmsAll?.t === "arr" ? parmsAll.v[i] : parmsAll;
      if (parms?.t === "dict") data = unpredict(data, parms.v);
    }
    return data;
  }

  bufOf(lx) { return lx.b; }

  // Object `num` (its value node), from the file or from an object stream.
  async object(num) {
    const e = this.entries.get(num);
    if (!e || e.type === 0) return null;
    if (e.type === 1) {
      const lx = new Lexer(this.b, e.off);
      const n = lx.int(); lx.int(); lx.expect("obj");
      if (n !== num) fail(`object ${num} is not where the cross-reference says`);
      const v = lx.value();
      v.lexer = lx;
      return v;
    }
    let stm = this.objStreams.get(e.stm);
    if (!stm) {
      const se = this.entries.get(e.stm);
      const lx = new Lexer(this.b, se.off);
      lx.int(); lx.int(); lx.expect("obj");
      const d = lx.value();
      const data = await this.streamData(d.v, lx);
      const first = d.v.get("First").v, n = d.v.get("N").v;
      const hl = new Lexer(data, 0), offsets = [];
      for (let i = 0; i < n; i++) offsets.push([hl.int(), hl.int()]);
      stm = { data, first, offsets };
      this.objStreams.set(e.stm, stm);
    }
    const [, off] = stm.offsets[e.idx];
    return new Lexer(stm.data, stm.first + off).value();
  }

  async resolve(x) { return x?.t === "ref" ? this.object(x.n) : x; }
}

// ---------------------------------------------------------------- reading a book from a PDF

// The original PDF's bytes inside a .chaya.pdf (the bytes before the marker, if their sha256 is the one recorded
// there), or null.
export async function recoverOriginal(bytes) {
  const m = lastIndexOf(bytes, MARKER);
  if (m < 0) return null;
  const line = latin1(bytes.subarray(m, Math.min(bytes.length, m + 200))).split(/[\r\n]/)[0];
  const len = +(/length=(\d+)/.exec(line) || [])[1], sha = (/sha256=([0-9a-f]{64})/.exec(line) || [])[1];
  if (!Number.isInteger(len) || len > m || !sha) return null;
  const got = await sha256hex(bytes.subarray(0, len));
  return got === sha ? bytes.slice(0, len) : null;
}

// The book's data (the parsed chaya.json) in a PDF, or null; and the original PDF's bytes when recoverable.
export async function readChaya(bytes) {
  const pdf = await PdfFile.open(bytes);
  const catalog = await pdf.resolve(pdf.trailer.get("Root"));
  const names = catalog && await pdf.resolve(catalog.v.get("Names"));
  const tree = names && await pdf.resolve(names.v.get("EmbeddedFiles"));
  let spec = null;
  const walk = async node => {
    if (!node || spec) return;
    const ns = node.v.get("Names");
    if (ns) for (let i = 0; i + 1 < ns.v.length; i += 2) if (stringText(ns.v[i]) === ATTACHMENT) { spec = await pdf.resolve(ns.v[i + 1]); return; }
    for (const k of node.v.get("Kids")?.v || []) await walk(await pdf.resolve(k));
  };
  await walk(tree);
  if (!spec) return { data: null, original: bytes, recovered: false };
  const ef = await pdf.resolve(spec.v.get("EF"));
  const fileRef = ef.v.get("F") || ef.v.get("UF");
  const fileObj = await pdf.object(fileRef.n);
  const content = await pdf.streamData(fileObj.v, fileObj.lexer);
  const data = JSON.parse(new TextDecoder().decode(content));
  const original = await recoverOriginal(bytes);
  return { data, original, recovered: !!original };
}

// ---------------------------------------------------------------- writing a book into a PDF

const pdfDate = d => "D:" + d.toISOString().replace(/[-:T]/g, "").slice(0, 14) + "Z";
const pdfString = s => "(" + s.replace(/[\\()]/g, c => "\\" + c) + ")";

// The original PDF's bytes followed by one update that attaches `data` (an object, written as chaya.json).
// Given a .chaya.pdf rather than an original, its original is used (so the file does not grow with each save).
export async function writeChaya(original, data, { description = "The book's data for the Chaya web app: its types, page documents, corrections and styles." } = {}) {
  original = (await recoverOriginal(original)) || original;
  const pdf = await PdfFile.open(original);
  if (pdf.trailer.get("Encrypt")) fail("this PDF is encrypted; the app cannot add the book's data to it");
  const rootRef = pdf.trailer.get("Root");
  if (rootRef?.t !== "ref") fail("the PDF's trailer has no catalog reference");
  const catalog = await pdf.object(rootRef.n);
  if (catalog?.t !== "dict") fail("the PDF's catalog is not a dictionary");
  let next = Math.max(pdf.trailer.get("Size")?.v || 0, Math.max(...pdf.entries.keys()) + 1);
  const emb = next++, spec = next++, leaf = next++;
  const objects = [];   // [num, gen, text or bytes parts]
  // The attachment.
  const json = new TextEncoder().encode(JSON.stringify(data));
  const z = await deflate(json);
  const now = new Date();
  objects.push([emb, 0, [`<< /Type /EmbeddedFile /Subtype /application#2Fjson /Filter /FlateDecode /Length ${z.length} /Params << /Size ${json.length} /ModDate ${pdfString(pdfDate(now))} >> >>\nstream\n`, z, "\nendstream"]]);
  objects.push([spec, 0, [`<< /Type /Filespec /F ${pdfString(ATTACHMENT)} /UF ${pdfString(ATTACHMENT)} /Desc ${pdfString(description)} /AFRelationship /Data /EF << /F ${emb} 0 R /UF ${emb} 0 R >> >>`]]);
  // The names dictionary's EmbeddedFiles: one flat, sorted list of the original's attachments (from all its tree's
  // leaves; one named chaya.json is replaced) and ours. Some readers handle only a flat list at the root.
  const namesVal = catalog.v.get("Names");
  const names = namesVal ? await pdf.resolve(namesVal) : null;
  const entries = [];
  const collect = async (node, depth = 0) => {
    if (!node || node.t !== "dict" || depth > 32) return;
    const ns = node.v.get("Names");
    if (ns?.t === "arr") for (let i = 0; i + 1 < ns.v.length; i += 2) entries.push([stringText(ns.v[i]), raw(ns.v[i]), raw(ns.v[i + 1])]);
    for (const k of node.v.get("Kids")?.v || []) await collect(await pdf.resolve(k), depth + 1);
  };
  if (names?.v.get("EmbeddedFiles")) await collect(await pdf.resolve(names.v.get("EmbeddedFiles")));
  const kept = entries.filter(([k]) => k !== ATTACHMENT);
  kept.push([ATTACHMENT, pdfString(ATTACHMENT), `${spec} 0 R`]);
  kept.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  objects.push([leaf, 0, [`<< /Names [${kept.map(([, k, v]) => `${k} ${v}`).join(" ")}] >>`]]);
  const efText = `${leaf} 0 R`;
  const dictText = (m, replace) => {
    let t = "<<";
    for (const [k, v] of m) if (!(k in replace)) t += ` /${k} ${raw(v)}`;
    for (const [k, v] of Object.entries(replace)) if (v !== null) t += ` /${k} ${v}`;
    return t + " >>";
  };
  const namesText = dictText(names ? names.v : new Map(), { EmbeddedFiles: efText });
  const catReplace = {};
  if (namesVal?.t === "ref") {
    const g = pdf.entries.get(namesVal.n)?.gen ?? namesVal.g;
    objects.push([namesVal.n, g, [namesText]]);
  } else catReplace.Names = namesText;
  // The catalog's associated files (PDF/A-3): ours added to a direct array, or a new array.
  const af = catalog.v.get("AF");
  if (!af) catReplace.AF = `[${spec} 0 R]`;
  else if (af.t === "arr") catReplace.AF = `[${af.v.map(raw).join(" ")} ${spec} 0 R]`;
  objects.push([rootRef.n, rootRef.g, [dictText(catalog.v, catReplace)]]);

  // Assemble: the original, the marker, the objects, the cross-reference section and the trailer.
  const sha = await sha256hex(original);
  const parts = [original];
  let pos = original.length;
  const add = x => { const u = typeof x === "string" ? bytesOf(x) : x; parts.push(u); pos += u.length; };
  add(`\n${MARKER}length=${original.length} sha256=${sha}\n`);
  const offsets = new Map();
  for (const [num, gen, body] of objects) {
    offsets.set(num, [pos, gen]);
    add(`${num} ${gen} obj\n`);
    for (const b of body) add(b);
    add("\nendobj\n");
  }
  const keep = ["Root", "Info", "ID"].filter(k => pdf.trailer.get(k)).map(k => ` /${k} ${raw(pdf.trailer.get(k))}`).join("");
  if (pdf.lastKind === "table") {
    const size = next;
    const xrefPos = pos;
    let t = "xref\n";
    const nums = [...offsets.keys()].sort((a, b) => a - b);
    for (let i = 0; i < nums.length;) {
      let j = i;
      while (j + 1 < nums.length && nums[j + 1] === nums[j] + 1) j++;
      t += `${nums[i]} ${j - i + 1}\n`;
      for (let k = i; k <= j; k++) { const [o, g] = offsets.get(nums[k]); t += `${String(o).padStart(10, "0")} ${String(g).padStart(5, "0")} n\r\n`; }
      i = j + 1;
    }
    t += `trailer\n<< /Size ${size}${keep} /Prev ${pdf.lastXref} >>\nstartxref\n${xrefPos}\n%%EOF\n`;
    add(t);
  } else {
    const xnum = next++;
    const xrefPos = pos;
    offsets.set(xnum, [xrefPos, 0]);
    const nums = [...offsets.keys()].sort((a, b) => a - b);
    const rows = new Uint8Array(nums.length * 7);
    const index = [];
    nums.forEach((n, i) => {
      const [o, g] = offsets.get(n);
      rows[i * 7] = 1;
      rows[i * 7 + 1] = (o >>> 24) & 255; rows[i * 7 + 2] = (o >>> 16) & 255; rows[i * 7 + 3] = (o >>> 8) & 255; rows[i * 7 + 4] = o & 255;
      rows[i * 7 + 5] = (g >> 8) & 255; rows[i * 7 + 6] = g & 255;
      if (index.length && index[index.length - 2] + index[index.length - 1] === n) index[index.length - 1]++;
      else index.push(n, 1);
    });
    add(`${xnum} 0 obj\n<< /Type /XRef /Size ${next} /W [1 4 2] /Index [${index.join(" ")}]${keep} /Prev ${pdf.lastXref} /Length ${rows.length} >>\nstream\n`);
    add(rows);
    add(`\nendstream\nendobj\nstartxref\n${xrefPos}\n%%EOF\n`);
  }
  const out = new Uint8Array(pos);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

export { PdfError };
