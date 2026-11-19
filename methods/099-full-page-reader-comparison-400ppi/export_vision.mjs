import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const dir = new URL("./cloud-vision/", import.meta.url).pathname; mkdirSync(dir, { recursive: true });
for (const n of process.argv.slice(2)) {
  const j = JSON.parse(readFileSync(new URL(`../vision/v-${n}.json`, import.meta.url)));
  const all = j.responses[0].fullTextAnnotation.text.split("\n").filter(Boolean);
  let start = 0; while (start < all.length && all[start].replace(/[^ऀ-ॿ]/g, "").length < 15) start++;
  let cut = all.findIndex((l, i) => i > start && /^\s*[१२३४५६७८९]+\s*[.)]/.test(l));
  if (cut < 0) cut = all.length;
  writeFileSync(`${dir}${n}.json`, JSON.stringify({ model: "cloud vision document text", page: Number(n), parsed: { header: all.slice(0, start).join(" "), lines: all.slice(start, cut), footnotes: all.slice(cut) } }));
}
