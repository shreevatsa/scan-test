// A whole proposed type list (methods 077, 078, 091 and 092, whose request code is kept in their snapshots): its
// response contract and its conversion to types.json, used to check and review a saved proposal for a new book
// (a plain-PDF link with &proposal=). Surveys of an existing book only add to its list (pipeline/type-survey.js).
import { FORMATTING, makeValidator, checkTypes } from "../schema.js?v=20261113-noink-1";
import { settings, idb } from "../store.js?v=20261113-noink-1";

export function samplePages(count) {
  const middle = Math.ceil(count / 2);
  return [...new Set([1, 2, 3, Math.round(count * 0.15), middle, middle + 1, Math.round(count * 0.8), count]
    .filter(n => n >= 1 && n <= count))].sort((a, b) => a - b);
}

const text = { type: "string" };
const strings = { type: "array", items: text };
const object = properties => ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false });
const namedDescription = object({ name: text, description: text });

export function discoverySchema(schema) {
  return object({
    description: text, languages: strings,
    flows: { type: "array", items: namedDescription },
    types: { type: "array", items: object({
      name: text, description: text,
      region: { type: "string", enum: ["container", ...schema.$defs.type_def.properties.region.enum] },
      contains: strings, flow: text, lang: text, role: { type: "string", enum: ["text", "furniture"] }, numbered: { type: "boolean" },
      sample_pages: { type: "array", items: { type: "integer", minimum: 1 } }, evidence: text,
    }) },
    relations: { type: "array", items: namedDescription },
    inline: { type: "array", items: object({ name: text, description: text, formatting: { type: "string", enum: ["", ...FORMATTING] } }) },
    conventions: strings, questions: strings,
  });
}

export function proposalTypes(proposal, { id, title, source, schema, pages }) {
  const errors = makeValidator(discoverySchema(schema))(proposal);
  if (errors.length) throw new Error(errors[0]);
  const named = (items, transform) => {
    if (new Set(items.map(item => item.name)).size !== items.length) throw new Error("The proposal repeats a name.");
    return Object.fromEntries(items.map(item => [item.name, transform(item)]));
  };
  const types = named(proposal.types, t => {
    if (t.sample_pages.some(page => !pages.includes(page))) throw new Error(`Type ${t.name} cites a page outside the samples.`);
    return { description: t.description, ...(t.region === "container" ? {} : { region: t.region }),
      ...(t.contains.length ? { contains: t.contains } : {}), ...(t.flow ? { flow: t.flow } : {}),
      ...(t.lang ? { lang: t.lang } : {}), ...(t.numbered ? { numbered: true } : {}),
      ...(t.role === "furniture" ? { role: "furniture" } : {}) };
  });
  const tl = { format: "types", schema_version: "0.3", book_id: id, title, description: proposal.description,
    languages: proposal.languages, flows: named(proposal.flows, t => t.description), types,
    relations: named(proposal.relations, t => t.description),
    inline: named(proposal.inline, t => ({ description: t.description, ...(t.formatting ? { formatting: t.formatting } : {}) })),
    conventions: proposal.conventions, source };
  const problems = [...makeValidator(schema)(tl), ...checkTypes(tl)];
  if (!Object.keys(types).length || !Object.keys(tl.flows).length) problems.push("The proposal needs text types and a reading flow.");
  if (problems.length) throw new Error(problems[0]);
  return tl;
}

// Keep every attempt in IndexedDB before a book folder exists, using Maker's normal call ledger.
// Once the book is created these work files travel with it in its .chaya.pdf.
export function discoveryStore(pdfSha) {
  const prefix = `type-discovery:${pdfSha}:`;
  return {
    readWork: path => settings.get(prefix + path),
    writeWork: (path, value) => settings.set(prefix + path, value),
    updateWork: (path, update) => settings.update(prefix + path, update),
    async copyTo(book) {
      for (const key of await idb.keys("settings")) {
        if (typeof key === "string" && key.startsWith(prefix + "work/")) {
          const path = key.slice(prefix.length), value = await settings.get(key);
          if (path === "work/reader-lab/ledger.json") await book.updateWork(path, old => ({ ...value,
            calls: [...(old?.calls || []), ...value.calls.filter(call => !(old?.calls || []).some(saved => saved.id === call.id))] }));
          else await book.writeWork(path, value);
        }
      }
    },
  };
}
