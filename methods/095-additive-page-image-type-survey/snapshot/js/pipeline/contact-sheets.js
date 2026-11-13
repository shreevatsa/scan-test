// Labelled contact sheets of PDF pages: the image form of a survey of more than a few pages (methods 091, 092 and 096).
import { sha256hex } from "../chayapdf.js";

export const CONTACT_SHEET_RECIPE = { version: 1, columns: 4, rows: 5, cell_width: 256, cell_height: 384,
  padding: 8, label_height: 24, mime_type: "image/jpeg", quality: 0.85, max_sheets: 16, max_payload_bytes: 12000000 };

// The sheets for the given PDF page numbers (or for pages 1 to n), twenty cells to a sheet in the given order.
export function contactSheetPlan(pages) {
  if (Number.isInteger(pages)) pages = Array.from({ length: Math.max(0, pages) }, (_, index) => index + 1);
  if (!Array.isArray(pages) || !pages.length || pages.some(page => !Number.isInteger(page) || page < 1)) throw new Error("Choose at least one PDF page.");
  const recipe = CONTACT_SHEET_RECIPE, capacity = recipe.columns * recipe.rows;
  return Array.from({ length: Math.ceil(pages.length / capacity) }, (_, index) => {
    const part = pages.slice(index * capacity, (index + 1) * capacity);
    return { index: index + 1, pages: part, width: recipe.columns * recipe.cell_width,
      height: Math.ceil(part.length / recipe.columns) * recipe.cell_height };
  });
}

export async function renderContactSheets(pdf, pages, progress = () => {}) {
  const sheets = [], recipe = CONTACT_SHEET_RECIPE, plan = contactSheetPlan(pages), total = plan.reduce((sum, sheet) => sum + sheet.pages.length, 0);
  let done = 0;
  for (const sheet of plan) {
    const canvas = new OffscreenCanvas(sheet.width, sheet.height), context = canvas.getContext("2d");
    context.fillStyle = "white"; context.fillRect(0, 0, canvas.width, canvas.height);
    for (const [cell, number] of sheet.pages.entries()) {
      progress(++done, total);
      const page = await pdf.getPage(number), base = page.getViewport({ scale: 1 });
      const width = recipe.cell_width - recipe.padding * 2, height = recipe.cell_height - recipe.label_height - recipe.padding * 2;
      const viewport = page.getViewport({ scale: Math.min(width / base.width, height / base.height) });
      const tile = new OffscreenCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      await page.render({ canvas: tile, canvasContext: tile.getContext("2d"), viewport, background: "#ffffff" }).promise;
      const x = cell % recipe.columns * recipe.cell_width, y = Math.floor(cell / recipe.columns) * recipe.cell_height;
      context.fillStyle = "#111"; context.font = "16px sans-serif";
      context.fillText(`PDF ${number}`, x + recipe.padding, y + 19);
      context.drawImage(tile, x + (recipe.cell_width - tile.width) / 2, y + recipe.label_height + recipe.padding);
      page.cleanup();
    }
    const blob = await canvas.convertToBlob({ type: recipe.mime_type, quality: recipe.quality });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let encoded = "";
    for (let offset = 0; offset < bytes.length; offset += 0x8000) encoded += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    sheets.push({ ...sheet, sha256: await sha256hex(bytes), dataUrl: `data:${blob.type};base64,${btoa(encoded)}` });
  }
  return sheets;
}

// Requests of at most sixteen sheets and 12 MB each.
export function sheetBatches(sheets) {
  const batches = [];
  let batch = [], bytes = 0;
  for (const sheet of sheets) {
    const size = sheet.dataUrl.length;
    if (size > CONTACT_SHEET_RECIPE.max_payload_bytes - 100000) throw new Error("A contact sheet is too large for this recipe.");
    if (batch.length && (batch.length >= CONTACT_SHEET_RECIPE.max_sheets || bytes + size > CONTACT_SHEET_RECIPE.max_payload_bytes - 100000)) {
      batches.push(batch); batch = []; bytes = 0;
    }
    batch.push(sheet); bytes += size;
  }
  if (batch.length) batches.push(batch);
  return batches;
}
