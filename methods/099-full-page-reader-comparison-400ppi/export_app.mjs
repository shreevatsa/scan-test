// The app's current transcription (Flash-Lite on 617-px pages) of the compared pages, as lines with [n] markers.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { readChaya } from "/Users/shreevatsa/w/scan-test/webapp/js/chayapdf.js";
const { data } = await readChaya(new Uint8Array(readFileSync(process.env.HOME + "/Downloads/ramayana-manjari-sections.chaya.pdf")));
const f = data.files, m = f["book.json"], dir = new URL("./app-flash-lite-133/", import.meta.url).pathname; mkdirSync(dir, { recursive: true });
for (const n of process.argv.slice(2).map(Number)) {
  const p = m.pages.find(p => p.pdf_page === n), d = f[`pages/${p.id}.json`];
  const lineText = l => { const chars = [...(l.text || "")]; const marks = (l.spans || []).filter(s => s.kind === "note_marker"); let out = ""; chars.forEach((c, i) => { for (const s of marks) if (s.start === i) out += `[${s.marker}]`; out += c; }); for (const s of marks) if (s.start >= chars.length) out += `[${s.marker}]`; return out; };
  const lines = d.page.regions.filter(r => ["verse", "paragraph", "heading", "section_closing", "verse_group_marker"].includes(r.type)).flatMap(r => (r.lines || []).map(lineText));
  const footnotes = d.page.regions.filter(r => r.type === "footnote").map(r => (r.lines || []).map(l => l.text).join(" "));
  writeFileSync(`${dir}${n}.json`, JSON.stringify({ model: "app flash-lite @133ppi", page: n, parsed: { header: "", lines, footnotes } }));
}
