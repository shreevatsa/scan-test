// One public benchmark call through the preserved app pipeline, with source pixels and local outlines.
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { Maker } from "./snapshot/js/pipeline/run.js";
import { analyzePage } from "../079-local-line-block-regions/snapshot/local/ink.js";
import { regionsFromBoxes } from "../079-local-line-block-regions/snapshot/local/regions.js";
import { LINES, OWNERSHIP } from "../079-local-line-block-regions/snapshot/local/config.js";

const [pid, finder, outputPath, grayPath] = process.argv.slice(2);
const metadata = JSON.parse(await readFile(`inputs/${pid}.json`));
const types = JSON.parse(await readFile(`schema/types/${metadata.book_id}.json`));
const file = new Blob([await readFile(`inputs/${pid}.png`)], { type: "image/png" });
const gray = new Uint8Array(await readFile(grayPath));
const output = resolve(outputPath);
const nativeFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  if (String(url).startsWith("file:")) {
    const contents = await readFile(url);
    return new Response(contents);
  }
  return nativeFetch(url, options);
};
globalThis.createImageBitmap = async () => ({ width: metadata.width, height: metadata.height, close() {} });
const records = new Map();
const book = { writable: false, types, pages: [{ id: pid }], index: { [pid]: 0 },
  page: () => ({ id: pid, image: `${pid}.png` }),
  imageBlob: async () => file, imageUrl: async () => "source pixels supplied locally",
  getReaderOptions: async () => ({}), current: async () => null,
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
const maker = new Maker(book, { keys: { openai: process.env.OPENAI_API_KEY, gemini: process.env.GEMINI_API_KEY }, check: () => [[], []],
  outlines: async (page, url, boxes) => {
    analysis ||= analyzePage(gray, metadata.width, metadata.height, LINES);
    if (analysis.status !== "ok") throw new Error(analysis.status);
    return { ...regionsFromBoxes(analysis, boxes, OWNERSHIP), charH: analysis.charH, angle: analysis.angle, method: "063-fragment-band-lines" };
  } });
try {
  const record = await maker.findRegions(pid, { finder, force: true, save: false, trial: true });
  await writeFile(resolve(output, "regions.json"), JSON.stringify({ ...record,
    input: metadata, api_calls: 1, work_root: outputPath }, null, 1) + "\n");
  process.stdout.write(JSON.stringify({ page: pid, finder, status: "completed", cost_usd: record.region_call.cost_usd, seconds: record.region_call.seconds }));
} catch (error) {
  const call = [...records.values()].find(record => record.format === "reader-call");
  const report = { page: pid, finder, status: "failed", cost_usd: call?.cost_usd ?? null, error: error.message };
  await writeFile(resolve(output, "failure.json"), JSON.stringify(report, null, 1) + "\n");
  process.stdout.write(JSON.stringify(report));
  process.exitCode = 1;
}
