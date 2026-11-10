import { makeValidator, checkTypes } from "./schema.js?v=20261110-reading-2";
import { discoverySchema } from "./pipeline/type-discovery.js?v=20261110-partial-3";
import { readerOptions } from "./pipeline/readers.js?v=20261110-partial-3";

export function proposalPackage(result, callRecord = null) {
  return { format: "unit-type-proposal", version: 1, ...structuredClone(result), call_record: callRecord };
}

export function checkProposalPackage(packet, { pdfSha, pageCount, schema }) {
  if (packet?.format !== "unit-type-proposal" || packet.version !== 1) throw new Error("This file is not a supported unit-type proposal.");
  const errors = makeValidator(schema)(packet.types);
  if (errors.length) throw new Error(errors[0]);
  const types = packet.types, source = types.source?.discovery;
  if (source?.pdf_sha256 !== pdfSha) throw new Error("This unit-type proposal belongs to a different PDF.");
  if (!Array.isArray(source.sample_pages) || !source.sample_pages.length ||
      new Set(source.sample_pages).size !== source.sample_pages.length ||
      source.sample_pages.some(page => !Number.isInteger(page) || page < 1 || page > pageCount))
    throw new Error("The proposal has invalid sample page numbers.");
  errors.push(...checkTypes(types), ...makeValidator(discoverySchema(schema))(packet.proposal));
  if (!Object.keys(types.types).length || !Object.keys(types.flows).length) errors.push("The proposal needs unit types and a reading flow.");
  if (errors.length) throw new Error(errors[0]);
  if (packet.proposal.types.some(type => type.sample_pages.some(page => !source.sample_pages.includes(page))))
    throw new Error("The proposal cites a page outside its samples.");
  if (typeof source.model !== "string" || !packet.call || packet.call.path !== source.call ||
      !/^work\/reader-calls\/setup\/unit-types-[A-Za-z0-9-]+\.json$/.test(packet.call.path) ||
      !(packet.call.cost_usd === null || Number.isFinite(packet.call.cost_usd) && packet.call.cost_usd >= 0))
    throw new Error("The proposal has invalid call metadata.");
  if (packet.call_record) {
    const record = packet.call_record;
    if (typeof record.id !== "string" || !/^[A-Za-z0-9-]+$/.test(record.id) || record.page !== "setup" || record.stage !== "unit-types" || record.status !== "completed" ||
        packet.call.path !== `work/reader-calls/setup/unit-types-${record.id}.json` || record.profile?.method !== source.method ||
        record.response?.id !== source.response_id || record.cost_usd !== packet.call.cost_usd)
      throw new Error("The proposal's saved API record does not match its provenance.");
  }
  const result = structuredClone({ types, proposal: packet.proposal, call: packet.call });
  if (packet.reader_options) result.reader_options = readerOptions(packet.reader_options, types);
  result.types.source.discovery.reviewed = false;
  return result;
}

export async function keepProposalPackage(store, packet, context) {
  const result = checkProposalPackage(packet, context);
  if (packet.call_record) {
    const record = packet.call_record;
    await store.writeWork(result.call.path, record);
    await store.updateWork("work/reader-lab/ledger.json", old => ({ format: "reader-ledger", version: 1,
      calls: [...(old?.calls || []).filter(call => call.id !== record.id), { id: record.id, path: result.call.path,
        page: "setup", stage: "unit-types", profile: record.profile.id, status: record.status,
        cost_usd: record.cost_usd ?? null, seconds: record.seconds ?? null }] }));
  }
  await store.writeWork("work/type-discovery/selection.json", result);
  return result;
}
