// node run.mjs MODEL THINKING PAGE...   (TOKEN, PROJECT in the environment; images in ../vision/p-NNN.png)
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
const [model, thinking, ...pages] = process.argv.slice(2);
const dir = new URL(`./${model}/`, import.meta.url).pathname; mkdirSync(dir, { recursive: true });
const PROMPT = `This is a page of the Rāmāyaṇa-mañjarī of Kṣemendra (Kāvyamālā 83, Bombay 1903): Sanskrit verse in Devanagari, with footnotes that mostly give variant readings.
Read the visible print exactly as printed. Return the running header line, then every line of the text above the footnotes (verses, headings, closing lines) in reading order, one entry per printed line, then the footnotes, one entry per footnote.
Use Unicode NFC Devanagari. Keep spelling, punctuation, digits, dandas and verse numbers exactly as printed; do not correct the text.
Footnote markers: in the text above the footnotes, a small raised numeral (१, २, ३ …) is printed over or just after a word to point to a footnote. Write each such marker in square brackets where it is printed, for example तीर[१]स्य or धन्यतावहम्[३]. Do not put a footnote's own number in brackets.
Return JSON matching the schema.`;
const SCHEMA = { type: "OBJECT", properties: { header: { type: "STRING" }, lines: { type: "ARRAY", items: { type: "STRING" } }, footnotes: { type: "ARRAY", items: { type: "STRING" } } }, required: ["header", "lines", "footnotes"] };
const url = `https://aiplatform.googleapis.com/v1/projects/${process.env.PROJECT}/locations/global/publishers/google/models/${model}:generateContent`;
await Promise.all(pages.map(async n => {
  const out = `${dir}${n}.json`; if (existsSync(out)) return;
  const image = readFileSync(new URL(`../vision/p-${String(n).padStart(3, "0")}.png`, import.meta.url)).toString("base64");
  const body = { contents: [{ role: "user", parts: [{ inlineData: { mimeType: "image/png", data: image } }, { text: PROMPT }] }],
    generationConfig: { responseMimeType: "application/json", responseSchema: SCHEMA, mediaResolution: "MEDIA_RESOLUTION_HIGH", maxOutputTokens: 32768, thinkingConfig: { thinkingLevel: thinking } } };
  const started = Date.now();
  const res = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${process.env.TOKEN}`, "x-goog-user-project": process.env.PROJECT, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json(), seconds = (Date.now() - started) / 1000;
  if (json.error) { console.log(model, n, "ERROR", res.status, JSON.stringify(json.error).slice(0, 300)); return; }
  const text = json.candidates?.[0]?.content?.parts?.filter(p => !p.thought).map(p => p.text).join("") || "";
  let parsed = null; try { parsed = JSON.parse(text); } catch {}
  writeFileSync(out, JSON.stringify({ model, thinking, page: n, seconds, usage: json.usageMetadata, finish: json.candidates?.[0]?.finishReason, parsed, raw: parsed ? undefined : text }));
  console.log(model, n, seconds.toFixed(1) + "s", JSON.stringify(json.usageMetadata), parsed ? "ok" : "UNPARSED " + json.candidates?.[0]?.finishReason);
}));
