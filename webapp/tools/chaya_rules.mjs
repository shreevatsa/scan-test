// Set a book's structure rules (book.json `rules`, webapp/js/rules.js; schema/README.md "Book rules") and write a copy;
// the input is never changed. Only what is given is set: the other settings keep their value (or the default).
//   node webapp/tools/chaya_rules.mjs IN.chaya.pdf OUT.chaya.pdf [--closing=TYPE] [--part-closing=PATTERN]
//     [--part-heading=PATTERN] [--part-after=PATTERN] [--division-closing=PATTERN] [--part-labels=A,B,…]
//     [--marker-type=TYPE] [--counts=WORD=N,WORD=N,…] [--headings=HEADING=CONTAINER,…] [--clear]
// --headings lists, outermost first, the heading types that start sections and their container types ("" for none).
// A pattern of "" removes that setting; --part-labels uses a comma between names and an empty name for an untitled part.
// For the Rāmāyaṇa-mañjarī (the same settings methods/100-hydrogen-low-whole-page-reading/pipeline.sh gives chaya_sections.mjs):
//   node webapp/tools/chaya_rules.mjs in.chaya.pdf out.chaya.pdf --part-closing='कथासारे' --part-heading='काण्ड' \
//     --division-closing='किष्किन्धापर्व' --part-labels='बालकाण्डम् – अयोध्याकाण्डम्,अरण्यकाण्डम्,किष्किन्धाकाण्डम्,सुन्दरकाण्डम्,युद्धकाण्डम्,,उत्तरकाण्डम्'
import { readFileSync, writeFileSync } from "node:fs";
import { readChaya, writeChaya } from "../js/chayapdf.js";
import { bookRules, ruleProblems } from "../js/rules.js";

export function setRules(manifest, opt) {
  if ("clear" in opt) { delete manifest.rules; return null; }
  const rules = bookRules(manifest.rules), s = rules.sections;
  const set = (key, name) => { if (name in opt) s[key] = opt[name] || null; };
  if (opt.closing) s.closing = opt.closing;
  set("partClosing", "part-closing"); set("partHeading", "part-heading"); set("partAfter", "part-after"); set("divisionClosing", "division-closing");
  if ("part-labels" in opt) s.partLabels = opt["part-labels"] === "" ? [] : opt["part-labels"].split(",");
  if (opt["marker-type"]) rules.verseGroups.markerType = opt["marker-type"];
  if ("headings" in opt) rules.headings = opt.headings === "" ? [] : opt.headings.split(",").map(pair => { const [heading, container] = pair.split("="); return { heading, container }; });
  if (opt.counts) rules.verseGroups.counts = Object.fromEntries(opt.counts.split(",").map(pair => { const [word, n] = pair.split("="); return [word, Number(n)]; }));
  const problems = ruleProblems(rules);
  if (problems.length) throw new Error(problems.join("; "));
  manifest.rules = rules;
  return rules;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  const [input, output, ...flags] = process.argv.slice(2);
  const opt = Object.fromEntries(flags.map(flag => flag.replace(/^--/, "").split(/=(.*)/s).slice(0, 2)).map(([key, value]) => [key, value ?? ""]));
  if (!input || !output) { console.error("usage: node webapp/tools/chaya_rules.mjs IN OUT [--closing=TYPE] [--part-closing=PATTERN] [--part-heading=PATTERN] [--part-after=PATTERN] [--division-closing=PATTERN] [--part-labels=A,B,…] [--marker-type=TYPE] [--counts=WORD=N,…] [--clear]"); process.exit(2); }
  const { data, original } = await readChaya(new Uint8Array(readFileSync(input)));
  const manifest = data.files["book.json"];
  const rules = setRules(manifest, opt);
  data.saved_at_utc = new Date().toISOString(); data.saved_by = "webapp/tools/chaya_rules.mjs";
  writeFileSync(output, await writeChaya(original, data));
  console.log(JSON.stringify(rules, null, 1));
  console.log("wrote", output);
}
