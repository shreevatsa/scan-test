// node call.mjs IMAGE.png OUT.json  (token in TOKEN, project in PROJECT)
import { readFileSync, writeFileSync } from "node:fs";
const [image, out] = process.argv.slice(2);
const body = { requests: [{ image: { content: readFileSync(image).toString("base64") }, features: [{ type: "DOCUMENT_TEXT_DETECTION" }], imageContext: { languageHints: ["sa", "hi"] } }] };
const started = Date.now();
const res = await fetch("https://vision.googleapis.com/v1/images:annotate", { method: "POST", headers: { Authorization: `Bearer ${process.env.TOKEN}`, "x-goog-user-project": process.env.PROJECT, "Content-Type": "application/json" }, body: JSON.stringify(body) });
const json = await res.json();
writeFileSync(out, JSON.stringify(json));
console.log(res.status, ((Date.now() - started) / 1000).toFixed(1) + "s", json.error ? JSON.stringify(json.error).slice(0, 600) : (json.responses?.[0]?.fullTextAnnotation?.text || "").slice(0, 300));
