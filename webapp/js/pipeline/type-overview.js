import { discoverySchema, discoveryPrompt, proposalTypes, TYPE_MODELS } from "./type-discovery.js?v=20261112-regions-layout-1";
import { geminiReadingRequest } from "./readers.js?v=20261112-regions-layout-1";
import { Maker, templates, jsonHash } from "./run.js?v=20261112-regions-layout-1";
import { makeValidator } from "../schema.js?v=20261112-regions-layout-1";
import { openaiCost } from "./steps.js?v=20261112-regions-layout-1";
import { sha256hex } from "../chayapdf.js";
import { mergeTypeProposals } from "../type-draft.js?v=20261112-regions-layout-1";

export const OVERVIEW_RECIPE = { version: 1, columns: 4, rows: 5, cell_width: 256, cell_height: 384,
  padding: 8, label_height: 24, mime_type: "image/jpeg", quality: 0.85, max_sheets: 16, max_payload_bytes: 12000000 };
export const OVERVIEW_MODELS = [
  { ...TYPE_MODELS[0], id: "terra-overview", method: "091-terra-contact-sheet-unit-types", request_timeout_ms: 300000 },
  { ...TYPE_MODELS[1], id: "argon-overview", label: "Gemini 4 Argon · low thinking", thinking: "low",
    method: "092-argon-low-contact-sheet-unit-types", request_timeout_ms: 300000 },
];

export function contactSheetPlan(pageCount) {
  if (!Number.isInteger(pageCount) || pageCount < 1) throw new Error("The PDF must have at least one page.");
  const recipe = OVERVIEW_RECIPE, capacity = recipe.columns * recipe.rows;
  return Array.from({ length: Math.ceil(pageCount / capacity) }, (_, index) => {
    const pages = Array.from({ length: Math.min(capacity, pageCount - index * capacity) }, (_, cell) => index * capacity + cell + 1);
    return { index: index + 1, pages, width: recipe.columns * recipe.cell_width,
      height: Math.ceil(pages.length / recipe.columns) * recipe.cell_height };
  });
}

export async function renderContactSheets(pdf, progress = () => {}) {
  const sheets = [], recipe = OVERVIEW_RECIPE;
  for (const plan of contactSheetPlan(pdf.numPages)) {
    const canvas = new OffscreenCanvas(plan.width, plan.height), context = canvas.getContext("2d");
    context.fillStyle = "white"; context.fillRect(0, 0, canvas.width, canvas.height);
    for (const [cell, number] of plan.pages.entries()) {
      progress(number, pdf.numPages);
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
    sheets.push({ ...plan, sha256: await sha256hex(bytes), dataUrl: `data:${blob.type};base64,${btoa(encoded)}` });
  }
  return sheets;
}

export function overviewSchema(schema) {
  return { type: "object", additionalProperties: false, required: ["proposal", "page_inventory"], properties: {
    proposal: discoverySchema(schema),
    page_inventory: { type: "array", items: { type: "object", additionalProperties: false,
      required: ["page", "types", "uncertain"], properties: { page: { type: "integer", minimum: 1 },
        types: { type: "array", items: { type: "string" } }, uncertain: { type: "boolean" } } } },
  } };
}

export function validateOverview(value, context) {
  const errors = makeValidator(overviewSchema(context.schema))(value);
  if (errors.length) throw new Error(errors[0]);
  proposalTypes(value.proposal, context);
  const pages = value.page_inventory.map(item => item.page);
  if (new Set(pages).size !== pages.length || pages.length !== context.pages.length || context.pages.some(page => !pages.includes(page)))
    throw new Error("The overview must inventory every supplied PDF page exactly once.");
  const names = new Set(value.proposal.types.map(type => type.name));
  for (const item of value.page_inventory) {
    if (new Set(item.types).size !== item.types.length || item.types.some(name => !names.has(name)))
      throw new Error(`PDF page ${item.page} names an unknown or repeated unit type.`);
  }
  return value;
}

export function overviewRequest(profile, prompt, sheets, schema) {
  const caption = sheet => `Contact sheet ${sheet.index}, ${OVERVIEW_RECIPE.columns} columns, left to right then top to bottom. PDF pages ${sheet.pages.join(", ")}. Each cell is labelled PDF plus its page number.`;
  if (profile.provider === "gemini") return geminiReadingRequest(profile, [{ type: "text", text: prompt },
    ...sheets.flatMap(sheet => [{ type: "text", text: caption(sheet) }, { type: "image", data: sheet.dataUrl.split(",")[1], mime_type: OVERVIEW_RECIPE.mime_type, resolution: "high" }])], schema, 16384);
  return { model: profile.model, store: false, reasoning: { effort: profile.reasoning }, max_output_tokens: 16384,
    input: [{ role: "user", content: [{ type: "input_text", text: prompt }, ...sheets.flatMap(sheet => [
      { type: "input_text", text: caption(sheet) }, { type: "input_image", image_url: sheet.dataUrl, detail: "original" }])] }],
    text: { format: { type: "json_schema", name: "book_overview_types", strict: true, schema } } };
}

export function overviewBatches(sheets) {
  const batches = [];
  let batch = [], bytes = 0;
  for (const sheet of sheets) {
    const size = sheet.dataUrl.length;
    if (size > OVERVIEW_RECIPE.max_payload_bytes - 100000) throw new Error("A contact sheet is too large for this overview recipe.");
    if (batch.length && (batch.length >= OVERVIEW_RECIPE.max_sheets || bytes + size > OVERVIEW_RECIPE.max_payload_bytes - 100000)) {
      batches.push(batch); batch = []; bytes = 0;
    }
    batch.push(sheet); bytes += size;
  }
  if (batch.length) batches.push(batch);
  return batches;
}

export async function discoverOverview({ store, keys, profile, sheets, title, description, pageCount, id, pdfSha, schema, request,
  progress = () => {}, stopped = () => false, limit = 5, onCost = () => {}, retryUnresolved = false }) {
  const batches = overviewBatches(sheets), results = [], inventories = [];
  let spent = 0;
  for (const [index, batch] of batches.entries()) {
    if (stopped()) throw new Error("Overview stopped. Completed batches are saved and will be reused.");
    if (spent >= limit) throw new Error("The overview spend threshold was reached. Completed batches are saved.");
    const pages = batch.flatMap(sheet => sheet.pages);
    const prompt = discoveryPrompt({ title, description, pages, pageCount }) + `
The images are low-resolution contact sheets covering ${pages.length === pageCount ? "the entire book" : "part of the book"}. Use them to survey layouts and propose semantic types. Some small print cannot be read. Cite evidence pages and put fine distinctions needing a larger view in questions. Do not invent text from tiny thumbnails.
Return a proposal and page_inventory. Inventory every supplied PDF page exactly once. Each entry lists the proposed type names visibly present on that page, including furniture and supported containers. Use an empty types list for a blank page. Set uncertain when the thumbnail cannot establish its types confidently. Use only names in your proposal. Counts will be calculated from this inventory.`;
    const payload = overviewRequest(profile, prompt, batch, overviewSchema(schema));
    if (new TextEncoder().encode(JSON.stringify(payload)).length > OVERVIEW_RECIPE.max_payload_bytes)
      throw new Error("The overview request exceeds its payload budget. Reduce the contact-sheet batch size.");
    const fingerprint = await jsonHash({ pdfSha, payload, profile, recipe: OVERVIEW_RECIPE });
    const path = `work/type-discovery/overview/${profile.id}/${fingerprint}.json`;
    let result = await store.readWork(path);
    progress({ index: index + 1, total: batches.length, pages, cached: !!result });
    if (!result) {
      const source = { discovery: { method: profile.method, model: profile.label, pdf_sha256: pdfSha, sample_pages: pages,
        rendering: "Labelled contact sheets", reviewed: false } };
      const context = { id, title, source, schema, pages };
      const pricing = profile.provider === "openai" ? (await templates()).regionPricing : null;
      const requestHash = await jsonHash(payload);
      const ledger = await store.readWork("work/reader-lab/ledger.json");
      let recovered = null;
      for (const attempt of [...(ledger?.calls || [])].reverse().filter(item => item.profile === profile.id)) {
        const record = await store.readWork(attempt.path);
        if (record?.request_sha256 !== requestHash) continue;
        if (record.status === "completed") { validateOverview(record.parsed, context); recovered = { ...record, path: attempt.path }; break; }
        if (!retryUnresolved && record.cost_usd == null)
          throw new Error("An earlier overview attempt has an unresolved charge. Inspect the saved attempts and select Allow a new call after an unresolved attempt to retry.");
      }
      const maker = new Maker(store, { keys, request, onCost: cost => { spent += cost || 0; onCost(cost); } });
      const call = recovered || await maker.callJSON("setup", "unit-types", profile, payload, value => validateOverview(value, context),
        pricing ? (usage, body) => openaiCost(usage, pricing, body.service_tier) : null, null,
        { contact_sheets: batch.map(({ dataUrl, ...sheet }) => sheet), rendering: OVERVIEW_RECIPE });
      source.discovery.call = call.path;
      source.discovery.response_id = call.response.id;
      source.discovery.questions = call.parsed.proposal.questions;
      source.discovery.overviews = [{ model: profile.label, recipe: OVERVIEW_RECIPE, sheets: batch.map(({ dataUrl, ...sheet }) => sheet),
        inventory: call.parsed.page_inventory }];
      result = { types: proposalTypes(call.parsed.proposal, context), proposal: call.parsed.proposal,
        call: { path: call.path, cost_usd: call.cost_usd, seconds: call.seconds } };
      await store.writeWork(path, result);
    }
    results.push({ profile: { ...profile, label: `${profile.label} · batch ${index + 1}` }, result });
    inventories.push(...result.types.source.discovery.overviews);
    if (result.call.cost_usd == null && index + 1 < batches.length)
      throw new Error("The overview call's charge is unavailable. Its result is saved. Check the attempt before continuing.");
  }
  if (!results.length) throw new Error("Prepare contact sheets before requesting an overview.");
  const result = results.length === 1 ? results[0].result : mergeTypeProposals(results);
  result.types.source.discovery.sample_pages = sheets.flatMap(sheet => sheet.pages);
  result.types.source.discovery.overviews = [{ model: profile.label, recipe: OVERVIEW_RECIPE, sheets: inventories.flatMap(item => item.sheets),
    inventory: inventories.flatMap(item => item.inventory).sort((a, b) => a.page - b.page) }];
  return result;
}
