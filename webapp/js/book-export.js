import { assemble } from "./book.js?v=20261126-scan-preview";
import { bookDocument, bookText } from "./reader.js?v=20261126-scan-preview";
import { verseExport } from "./verses.js?v=20261126-scan-preview";
import { fileStem } from "./store.js?v=20261126-scan-preview";
import { h } from "./render.js?v=20261126-scan-preview";

const text = (value, mime) => new Blob([value], { type: mime });
const json = value => text(JSON.stringify(value, null, 2) + "\n", "application/json");
function urlOf(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function exportHtml(book, view, session) {
  const figures = new Map(), pageById = new Map(book.pages.map((page, i) => [page.id ?? String(i + 1), page]));
  const signal = new AbortController().signal;
  let bitmap, last;
  try {
    for (const [ref, { region, page }] of Object.entries(view.regions)) {
      if (view.tl.types[region.type]?.region !== "figure" || !region.box) continue;
      if (page !== last) {
        bitmap?.close();
        bitmap = await createImageBitmap(await session.scan(pageById.get(page.id), 1350, signal));
        last = page;
      }
      const [x0, y0, x1, y1] = region.box.map((value, i) => value / (i % 2 ? page.height : page.width) *
        (i % 2 ? bitmap.height : bitmap.width));
      const canvas = new OffscreenCanvas(Math.max(1, Math.ceil(x1 - x0)), Math.max(1, Math.ceil(y1 - y0)));
      canvas.getContext("2d").drawImage(bitmap, x0, y0, x1 - x0, y1 - y0, 0, 0, canvas.width, canvas.height);
      figures.set(ref, await urlOf(await canvas.convertToBlob({ type: "image/png" })));
    }
  } finally { bitmap?.close(); }
  return bookDocument(view, { title: book.title, lang: book.languages?.[0] ?? "", figureSrc: ref => figures.get(ref) });
}

export function openExport(app, download) {
  const book = app.book, session = app.session, filename = fileStem(book.title);
  const view = assemble(book);
  const manifest = { pages: book.pages.map((page, i) => ({ ...page, id: page.id ?? String(i + 1) })) };
  const verses = verseExport(view.book, view.tl, manifest, { numberedFallback: true });
  const status = h("p", { role: "status", class: "meta" });
  const buttons = h("div", { class: "v1-tools v1-export-options" });
  const add = (label, extension, make, primary = false, name = filename + extension) => {
    buttons.append(h("button", { type: "button", class: primary ? "primary" : "", onclick: async () => {
      const all = [...buttons.children];
      all.forEach(button => button.disabled = true);
      status.textContent = "Preparing the download…";
      try {
        await app.flush();
        download(await make(), name);
        status.textContent = "Download ready.";
      } catch (error) { status.textContent = error.message; }
      finally { all.forEach(button => button.disabled = false); }
    } }, label));
  };
  add("Save .chaya.pdf", ".chaya.pdf", () => session.export(book), true);
  add("Original PDF", ".pdf", () => session.original());
  add("Plain text", ".txt", () => text(bookText(view), "text/plain;charset=utf-8"));
  add("HTML", ".html", async () => text(await exportHtml(book, view, session), "text/html;charset=utf-8"));
  add("chaya.json", ".json", () => json(book), false, "chaya.json");
  if (verses.length) add("Verses JSON", "-verses.json", () => json({ format: "verses", book: { title: book.title, pdf: book.source ?? null }, verses }));
  return app.dialog("Export", h("div", {}, buttons, status));
}
