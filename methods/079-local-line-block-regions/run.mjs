import { readFileSync } from "node:fs";
import { analyzePage } from "./snapshot/local/ink.js";
import { lineBlocks, classifyBlocks } from "./snapshot/local/blocks.js";
import { regionsFromBoxes } from "./snapshot/local/regions.js";
import { LINES, OWNERSHIP } from "./snapshot/local/config.js";
import { regionRecords } from "./snapshot/pipeline/steps.js";

const [grayPath, width, height, typesPath, blocksPath] = process.argv.slice(2);
const W = Number(width), H = Number(height), gray = new Uint8Array(readFileSync(grayPath));
if (gray.length !== W * H) throw new Error("The grayscale buffer dimensions do not match.");
const types = JSON.parse(readFileSync(typesPath));
const start = performance.now();
const analysis = analyzePage(gray, W, H, LINES);
const blocks = blocksPath ? JSON.parse(readFileSync(blocksPath)) : lineBlocks(analysis);
const regions = classifyBlocks(blocks, W, H, types);
const local = analysis.status === "ok" ? regionsFromBoxes(analysis, regions.map(region => region.box), OWNERSHIP) : { geometry: [], uncovered: [] };
if (analysis.status !== "ok" && regions.length) throw new Error(`Local line analysis failed (${analysis.status}).`);
process.stdout.write(JSON.stringify({ width: W, height: H, char_h: analysis.charH,
  page_angle_deg: analysis.angle || 0, regions: regionRecords(regions, local.geometry),
  uncovered_lines: local.uncovered, blocks, analysis_status: analysis.status,
  seconds: (performance.now() - start) / 1000 }));
