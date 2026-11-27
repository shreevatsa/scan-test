import { openWorkZip } from "./work-zip.js?v=20261127-furniture-in-place";
import { readBook, writeBook, sha256hex } from "./chayapdf.js?v=20261127-furniture-in-place";
import { drawnSize, openPdfData, pageInfo, spreadFold } from "./pipeline/pdf.js?v=20261127-furniture-in-place";

export const PREVIOUS = "/scan-test/versions/0.4/";

async function library() {
  return (await navigator.storage.getDirectory()).getDirectoryHandle("chaya-v1", { create: true });
}

async function file(dir, name) {
  return (await dir.getFileHandle(name)).getFile();
}

async function write(dir, name, data) {
  const writable = await (await dir.getFileHandle(name, { create: true })).createWritable();
  try { await writable.write(data); await writable.close(); }
  catch (error) { await writable.abort().catch(() => {}); throw error; }
}

export function fileStem(name) {
  return name.replace(/\s+/g, "-").replace(/[^\p{L}\p{N}_.-]/gu, "").replace(/^\.+/, "").slice(0, 100) || "book";
}

export async function browserBooks() {
  const found = [];
  for await (const [id, dir] of (await library()).entries()) {
    if (dir.kind !== "directory") continue;
    try {
      const json = await file(dir, "chaya.json");
      const book = JSON.parse(await json.text());
      found.push({ id, title: book.title, pages: book.pages.length, saved: json.lastModified });
    } catch (error) {
      found.push({ id, title: id, error: error.message });
    }
  }
  return found.sort((a, b) => (b.saved ?? 0) - (a.saved ?? 0));
}

export async function removeBook(id) {
  await (await library()).removeEntry(id, { recursive: true });
}

async function plainBook(original, name, progress) {
  const pdf = await openPdfData(original.slice());
  try {
    const info = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      progress(`Examining PDF page ${n} of ${pdf.numPages}…`, n, pdf.numPages);
      info.push(await pageInfo(pdf, n));
    }
    const scans = info.filter(page => page.kind === "scan");
    const wide = page => page.kind === "scan" && page.size_points[0] > 1.2 * page.size_points[1];
    const split = scans.length > 0 && scans.filter(wide).length >= scans.length / 2;
    const pages = [];
    for (const [i, page] of info.entries()) {
      const fold = split && wide(page) ? await spreadFold(pdf, i + 1) : null;
      for (const part of fold ? [[0, fold], [fold, 1]] : [null]) {
        const { width, height } = drawnSize(page, 300, part);
        pages.push({ pdf_page: i + 1, size: [width, height], ...(part ? { crop: [part[0], 0, part[1], 1] } : {}) });
      }
    }
    const title = name.replace(/\.pdf$/i, "");
    return { chaya: 1, title, source: { name, sha256: await sha256hex(original) }, types: {
      paragraph: {}, heading: { heading: true, lines: true }, verse: { lines: true },
      footnote: { flow: "notes" }, figure: { figure: true }, section: { contains: ["heading", "paragraph", "verse", "figure"] },
    }, flows: { main: "Text", notes: "Footnotes" }, pages };
  } finally { await pdf.loadingTask.destroy(); }
}

export class OldBookError extends Error {}

function checkBook(book) {
  if (book?.chaya !== 1) throw new OldBookError("This book uses the earlier Chaya format.");
  if (typeof book.title !== "string" || !book.types || Array.isArray(book.types) || !Array.isArray(book.pages))
    throw new Error("The Chaya attachment is missing its title, types, or pages.");
  if (Object.values(book.types).some(type => Object.hasOwn(type, "kind")))
    throw new Error("This PDF uses an earlier v1 draft. Migrate the original book again to open it here.");
}


export async function importBook(input, progress = () => {}) {
  const bytes = new Uint8Array(await input.arrayBuffer());
  let result;
  try { result = await readBook(bytes); }
  catch (error) {
    if (error.message.includes("does not contain a Chaya version 1 book")) throw new OldBookError("This book uses the earlier Chaya format.");
    throw error;
  }
  if (!result.original) throw new Error("The original PDF could not be recovered from this book.");
  const book = result.data ?? await plainBook(result.original, input.name, progress);
  checkBook(book);
  const root = await library(), id = crypto.randomUUID();
  const dir = await root.getDirectoryHandle(id, { create: true });
  try {
    progress("Saving the book in this browser…");
    await write(dir, "book.pdf", result.original);
    await dir.getDirectoryHandle("work", { create: true });
    await write(dir, "chaya.json", JSON.stringify(book));
  } catch (error) {
    await root.removeEntry(id, { recursive: true });
    throw error;
  }
  return new StoredBook(id, dir, book);
}

export async function openBook(id) {
  const dir = await (await library()).getDirectoryHandle(id);
  const book = JSON.parse(await (await file(dir, "chaya.json")).text());
  checkBook(book);
  return new StoredBook(id, dir, book);
}

export async function downloadInput(url, progress) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} while downloading the PDF.`);
  const total = Number(response.headers.get("content-length")) || 0;
  const reader = response.body.getReader(), chunks = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    got += value.length;
    progress(`Downloading ${(got / 1e6).toFixed(1)} MB…`, got, total);
  }
  const name = new URL(url, location.href).pathname.split("/").pop() || "book.pdf";
  return new File(chunks, decodeURIComponent(name), { type: "application/pdf" });
}

class StoredBook {
  constructor(id, dir, book) {
    Object.assign(this, { id, dir, book, writes: Promise.resolve() });
  }

  save(book) {
    this.book = book;
    const snapshot = JSON.stringify(book);
    this.writes = this.writes.catch(() => {}).then(() => write(this.dir, "chaya.json", snapshot));
    return this.writes;
  }

  async workFile(path, create = false) {
    const parts = path.split("/");
    if (parts.length < 2 || parts[0] !== "work" ||
        parts.some(part => !/^[\w.-]+$/.test(part) || part === "." || part === "..")) throw new Error("Invalid work record path.");
    let dir = this.dir;
    for (const part of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(part, { create });
    return [dir, parts.at(-1)];
  }

  async readWork(path, localOnly = false) {
    try {
      const [dir, name] = await this.workFile(path);
      return JSON.parse(await (await file(dir, name)).text());
    } catch (error) {
      if (error.name !== "NotFoundError") throw error;
      return localOnly ? null : (await this.workArchive())?.zip.json(path) ?? null;
    }
  }

  async writeWork(path, record) {
    const [dir, name] = await this.workFile(path, true);
    await write(dir, name, JSON.stringify(record));
  }

  async updateWork(path, change) {
    const task = (this.workWrites ?? Promise.resolve()).catch(() => {}).then(async () =>
      this.writeWork(path, change(await this.readWork(path))));
    this.workWrites = task;
    return task;
  }

  async workArchive() {
    this.archive ??= (async () => {
      try {
        const [dir, name] = await this.workFile("work/archive.zip");
        const zip = await openWorkZip(await file(dir, name));
        return { zip, manifest: await zip.json("book.json") };
      } catch (error) {
        if (error.name === "NotFoundError") return null;
        throw error;
      }
    })();
    return this.archive;
  }

  async attachWorkArchive(archive) {
    const zip = await openWorkZip(archive), manifest = await zip.json("book.json");
    const sha = this.book.source?.sha256 || await sha256hex(new Uint8Array(await (await this.original()).arrayBuffer()));
    if (!sha || manifest?.pdf?.sha256 !== sha) throw new Error("This work archive belongs to a different source PDF.");
    const [dir, name] = await this.workFile("work/archive.zip", true);
    await write(dir, name, archive);
    this.archive = null;
    return manifest;
  }

  async original() { return file(this.dir, "book.pdf"); }

  async export(book) {
    const original = new Uint8Array(await (await this.original()).arrayBuffer());
    return new Blob([await writeBook(original, book)], { type: "application/pdf" });
  }

  async close() {
    const pdf = this.pdf;
    this.pdf = null;
    if (pdf) await (await pdf).loadingTask.destroy();
  }

  async scan(page, width, signal, storedHeight = null) {
    this.pdf ??= this.original().then(async pdf => openPdfData(new Uint8Array(await pdf.arrayBuffer())));
    const document = await this.pdf;
    signal.throwIfAborted();
    const source = await document.getPage(page.pdf_page);
    signal.throwIfAborted();
    const base = source.getViewport({ scale: 1 }), [x0, y0, x1, y1] = page.crop ?? [0, 0, 1, 1];
    const scale = width / (base.width * (x1 - x0)), height = storedHeight ?? Math.max(1, Math.round(base.height * (y1 - y0) * scale));
    const viewport = source.getViewport({ scale, offsetX: -x0 * base.width * scale, offsetY: -y0 * base.height * scale });
    const canvas = new OffscreenCanvas(width, height);
    const task = source.render({ canvas, canvasContext: canvas.getContext("2d"), viewport, background: "#fff" });
    const cancel = () => task.cancel();
    signal.addEventListener("abort", cancel, { once: true });
    try {
      await task.promise;
      return await canvas.convertToBlob({ type: "image/png" });
    } finally {
      signal.removeEventListener("abort", cancel);
      source.cleanup();
    }
  }
}
