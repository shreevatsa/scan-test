// One public reference page through method 097's runtime snapshot, with the model call sent to Gemini 4 Hydrogen on Vertex AI
// instead of GPT-6.1 Terra. Derived from methods/097-terra-regions-proposing-types/run.mjs; only the request hook differs.
// The hook takes 097's OpenAI request as built (prompt, schema, page image), sends the same prompt, image and schema to
// Vertex generateContent, and hands the JSON text back to 097's parsing and checks (scaleProposingRegions), so everything
// after the call (outlines, the 094 local step, region records) is 097's code.
// Environment: TOKEN (gcloud access token), PROJECT, THINKING (LOW or MINIMAL). Nothing secret is written to disk.
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
const SNAP = "../097-terra-regions-proposing-types/snapshot/js";
const { Maker } = await import(`${SNAP}/pipeline/run.js`);
const { analyzePage } = await import(`${SNAP}/local/ink.js`);
const { regionsFromBoxes } = await import(`${SNAP}/local/regions.js`);
const { LINES, OWNERSHIP } = await import(`${SNAP}/local/config.js`);

const MODEL = "gemini-4-hydrogen", THINKING = process.env.THINKING || "LOW";
const RATES = { input: 1.5, output: 7.5 };  // USD per million tokens; thinking tokens billed as output

// Vertex responseSchema is the OpenAPI subset: no additionalProperties, no type arrays (nullable instead), and properties
// are generated in alphabetical order unless propertyOrdering is given. Everything else in 097's schema carries over.
export function vertexSchema(schema) {
  if (Array.isArray(schema)) return schema.map(vertexSchema);
  if (!schema || typeof schema !== "object") return schema;
  const out = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === "additionalProperties") continue;
    if (key === "type" && Array.isArray(value)) {
      const kinds = value.filter(kind => kind !== "null");
      if (kinds.length !== 1) throw new Error(`Cannot express type ${value}`);
      out.type = kinds[0];
      if (value.includes("null")) out.nullable = true;
    } else if (key === "properties") {
      out.properties = Object.fromEntries(Object.entries(value).map(([name, sub]) => [name, vertexSchema(sub)]));
      out.propertyOrdering = Object.keys(value);
    } else out[key] = vertexSchema(value);
  }
  return out;
}

const [pid, outputPath, grayPath] = process.argv.slice(2);
const metadata = JSON.parse(await readFile(`inputs/${pid}.json`));
const types = JSON.parse(await readFile(`schema/types/${metadata.book_id}.json`));
const file = new Blob([await readFile(`inputs/${pid}.png`)], { type: "image/png" });
const gray = new Uint8Array(await readFile(grayPath));
const output = resolve(outputPath);
await mkdir(output, { recursive: true });
const nativeFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => String(url).startsWith("file:") ? new Response(await readFile(new URL(String(url)))) : nativeFetch(url, options);
globalThis.createImageBitmap = async () => ({ width: metadata.width, height: metadata.height, close() {} });

// BOX_ORDER=yxyx reads each box_1000 as [y1,x1,y2,x2] (Gemini's native order) and swaps it to 097's [x1,y1,x2,y2] before
// 097's checks. REPLAY=<vertex-call.json> reuses a saved answer instead of calling (no cost), to score it another way.
function convertBoxes(text) {
  if (process.env.BOX_ORDER !== "yxyx") return text;
  const parsed = JSON.parse(text);
  for (const region of parsed.regions || []) if (Array.isArray(region.box_1000)) { const [a, b, c, d] = region.box_1000; region.box_1000 = [b, a, d, c]; }
  return JSON.stringify(parsed);
}
let vertex = null;  // the raw Vertex exchange, saved beside the result
async function request(provider, payload) {
  if (process.env.REPLAY) {
    vertex = { ...JSON.parse(await readFile(process.env.REPLAY)), replayed_from: process.env.REPLAY, box_order: process.env.BOX_ORDER || "xyxy" };
    const saved = vertex;
    vertex = { ...saved, cost_usd: 0, original_cost_usd: saved.cost_usd };
    await writeFile(resolve(output, "vertex-call.json"), JSON.stringify(vertex, null, 1) + "\n");
    return { seconds: saved.seconds, body: { id: saved.response_id, model: `${MODEL} (${saved.thinking})`, usage: saved.usage, status: saved.finish_reason === "STOP" ? "completed" : `incomplete (${saved.finish_reason})`,
      output: [{ type: "message", content: [{ type: "output_text", text: convertBoxes(saved.text) }] }] } };
  }
  const content = payload.input[0].content;
  const prompt = content.find(part => part.type === "input_text").text;
  const image = content.find(part => part.type === "input_image").image_url;
  if (!image.startsWith("data:image/png;base64,")) throw new Error("Expected a PNG data URL.");
  const schema = vertexSchema(payload.text.format.schema);
  const body = { contents: [{ role: "user", parts: [{ text: prompt }, { inlineData: { mimeType: "image/png", data: image.split(",")[1] } }] }],
    generationConfig: { responseMimeType: "application/json", responseSchema: schema, mediaResolution: "MEDIA_RESOLUTION_HIGH",
      maxOutputTokens: payload.max_output_tokens, thinkingConfig: { thinkingLevel: THINKING } } };
  const url = `https://aiplatform.googleapis.com/v1/projects/${process.env.PROJECT}/locations/global/publishers/google/models/${MODEL}:generateContent`;
  const t0 = performance.now();
  const res = await nativeFetch(url, { method: "POST", headers: { Authorization: `Bearer ${process.env.TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(body), signal: AbortSignal.timeout(300000) });
  const seconds = (performance.now() - t0) / 1000;
  const json = await res.json().catch(() => ({}));
  const u = json.usageMetadata || {};
  const cost = res.ok ? ((u.promptTokenCount || 0) * RATES.input + ((u.candidatesTokenCount || 0) + (u.thoughtsTokenCount || 0)) * RATES.output) / 1e6 : 0;
  const candidate = json.candidates?.[0] || {};
  const text = (candidate.content?.parts || []).filter(part => !part.thought && part.text).map(part => part.text).join("");
  vertex = { model: MODEL, thinking: THINKING, box_order: process.env.BOX_ORDER || "xyxy", http_status: res.status, seconds, cost_usd: cost, usage: u, finish_reason: candidate.finishReason || null,
    model_version: json.modelVersion || null, response_id: json.responseId || null, text, error: res.ok ? undefined : json.error,
    request: { prompt, response_schema: schema, image: `inputs/${pid}.png as sent by 097 (original PNG)`, generation_config: { ...body.generationConfig, responseSchema: "response_schema above" } } };
  await writeFile(resolve(output, "vertex-call.json"), JSON.stringify(vertex, null, 1) + "\n");
  if (!res.ok) throw new Error(`Vertex HTTP ${res.status}: ${json.error?.message || ""}`.slice(0, 500));
  return { seconds, body: { id: json.responseId, model: `${MODEL} (${THINKING})`, usage: u,
    status: candidate.finishReason === "STOP" ? "completed" : `incomplete (${candidate.finishReason})`,
    output: [{ type: "message", content: [{ type: "output_text", text: res.ok && text ? convertBoxes(text) : text }] }] } };
}

const records = new Map();
const book = { writable: false, types, pages: [{ id: pid }], index: { [pid]: 0 },
  page: () => ({ id: pid, image: `${pid}.png` }),
  imageBlob: async () => file, imageUrl: async () => "source pixels supplied locally",
  getReaderOptions: async () => ({}), current: async () => null, draft: async () => null,
  readWork: async path => records.get(path) || null,
  writeWork: async (path, value) => {
    records.set(path, value);
    const target = resolve(output, path);
    if (!target.startsWith(output + "/")) throw new Error("Invalid work path.");
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, JSON.stringify(value, null, 1) + "\n");
  },
  updateWork: async (path, update) => book.writeWork(path, update(await book.readWork(path))),
};
let analysis;
const maker = new Maker(book, { keys: { openai: "vertex-token-from-environment" }, check: () => [[], []], request,
  outlines: async (page, url, boxes) => {
    analysis ||= analyzePage(gray, metadata.width, metadata.height, LINES);
    if (analysis.status !== "ok") throw new Error(analysis.status);
    return { ...regionsFromBoxes(analysis, boxes, OWNERSHIP), charH: analysis.charH, angle: analysis.angle, method: "094-illumination-flattened-ink" };
  } });
const base = () => ({ page: pid, model: MODEL, thinking: THINKING, cost_usd: vertex?.cost_usd ?? null, seconds: vertex?.seconds ?? null,
  finish_reason: vertex?.finish_reason ?? null, usage: vertex?.usage ?? null });
try {
  const record = await maker.findRegions(pid, { finder: "terra-proposals", force: true, save: false, trial: true });
  record.profile = { ...record.profile, id: `hydrogen-${THINKING.toLowerCase()}-proposals`, provider: "vertex", model: MODEL, thinking: THINKING,
    method: "101-hydrogen-low-regions", request_from: "097-terra-regions-proposing-types" };
  Object.assign(record.region_call, { cost_usd: vertex.cost_usd, usage: vertex.usage, finish_reason: vertex.finish_reason });
  await writeFile(resolve(output, "regions.json"), JSON.stringify({ ...record, input: metadata, api_calls: 1, work_root: outputPath }, null, 1) + "\n");
  process.stdout.write(JSON.stringify({ ...base(), status: "completed", proposals: record.type_proposals || [], warnings: record.warnings,
    other_regions: record.regions.filter(region => region.type === "other" && !region.proposed_type).length }));
} catch (error) {
  const report = { ...base(), status: "failed", error: String(error.message).slice(0, 1000) };
  await writeFile(resolve(output, "failure.json"), JSON.stringify(report, null, 1) + "\n");
  process.stdout.write(JSON.stringify(report));
  process.exitCode = 1;
}
