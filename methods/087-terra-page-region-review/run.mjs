// One-page public verification of the frozen review request. Every run gets a fresh directory.
import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { PAGE_REVIEW_MODELS, requestPageReview } from "./snapshot/js/pipeline/page-review.js";
import { Maker } from "./snapshot/js/pipeline/run.js";

const [pid, model = "terra-page-review", run = "live-001", instructionFile] = process.argv.slice(2);
if (![pid, model, run].every(value => /^[a-zA-Z0-9_-]+$/.test(value || ""))) throw Error("Supply input ID, model profile ID and run name.");
const profile = PAGE_REVIEW_MODELS.find(value => value.id === model);
if (!profile) throw Error("Unknown page review model.");
const output = `outputs/${pid}/${profile.method}/${run}`;
let exists = false;
try { await access(output); exists = true; } catch {}
if (exists) throw Error("That output directory already exists. Choose a new run name.");
const metadata = JSON.parse(await readFile(`inputs/${pid}.json`));
const types = JSON.parse(await readFile(`schema/types/${metadata.book_id}.json`));
const source = { ...JSON.parse(await readFile(`outputs/${pid}/063-fragment-band-lines/regression-001/regions.json`)),
  width: metadata.width, height: metadata.height };
let key = profile.provider === "openai" ? process.env.OPENAI_API_KEY : process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
if (!key) {
  const keyFile = execFileSync("llm", ["keys", "path"], { encoding: "utf8" }).trim();
  const saved = JSON.parse(await readFile(keyFile));
  key = saved[profile.provider];
}
if (!key) throw Error("Configure the provider credential in the environment or llm.");
await mkdir(output, { recursive: true });
const book = { types, work: new Map(), index: { [pid]: 0 }, pages: [{ id: pid }],
  page: () => ({ id: pid, pdf_page: metadata.pdf_page }), current: async () => null, draft: async () => null,
  async readWork(path) { if (path === `work/${pid}.regions.json`) return source; try { return JSON.parse(await readFile(`${output}/${path}`)); } catch (error) { if (error.code === "ENOENT") return null; throw error; } },
  async writeWork(path, value) { const target = `${output}/${path}`; await mkdir(target.slice(0, target.lastIndexOf("/")), { recursive: true }); await writeFile(target, JSON.stringify(value, null, 2) + "\n"); },
  async updateWork(path, update) { const value = await update(await this.readWork(path)); await this.writeWork(path, value); return value; },
  imageBlob: async () => new Blob([await readFile(`inputs/${metadata.image}`)], { type: "image/png" }),
};
const networkFetch = globalThis.fetch;
globalThis.fetch = (url, options) => url instanceof URL && url.protocol === "file:"
  ? readFile(url).then(data => new Response(data)) : networkFetch(url, options);
const instruction = instructionFile ? await readFile(instructionFile, "utf8") : "Review the page layout and the types assigned to its regions. If this page supports a useful printed type more specific than formula, propose it and explain its visible evidence. Retain complete passage boundaries.";
try {
  const maker = new Maker(book, { keys: { [profile.provider]: key } });
  const result = await requestPageReview(maker, pid, profile, instruction);
  const report = { page: pid, method: profile.method, status: result.status, cost_usd: result.cost_usd,
    seconds: result.seconds, new_types: result.parsed.new_types.map(type => type.name), regions: result.parsed.regions.length,
    raw_call: result.path, instruction };
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report));
} catch {
  console.log(JSON.stringify({ page: pid, method: profile.method, status: "failed", output }));
  process.exitCode = 1;
}
