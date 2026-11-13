import { canonical } from "./ops.js?v=20261112-regions-layout-1";

export function mergeTypeProposals(results) {
  if (!results.length) throw new Error("At least one type proposal is needed.");
  const first = structuredClone(results[0].result), types = {}, variants = {}, kept = {};
  for (const { profile, result } of results) for (const [name, definition] of Object.entries(result.types.types)) {
    (variants[name] ||= []).push({ model: profile.label, id: profile.id, definition: structuredClone(definition) });
    types[name] ||= structuredClone(definition); kept[name] = true;
  }
  const merge = key => Object.assign({}, ...[...results].reverse().map(({ result }) => result.types[key] || {}));
  first.types.types = types;
  for (const key of ["flows", "relations", "inline"]) first.types[key] = merge(key);
  for (const key of ["languages", "conventions"]) first.types[key] = [...new Set(results.flatMap(({ result }) => result.types[key] || []))];
  first.merged = { sources: results.map(({ profile, result }) => ({ id: profile.id, label: profile.label, call: result.call.path, cost_usd: result.call.cost_usd, seconds: result.call.seconds })), types: variants, kept };
  first.types.source.discovery = { ...first.types.source.discovery, model: results.map(({ profile }) => profile.label).join(" + "), reviewed: false,
    comparison: first.merged, questions: [...new Set(results.flatMap(({ result }) => result.proposal.questions || []))] };
  const overviews = results.flatMap(({ result }) => result.types.source.discovery.overviews || []);
  if (overviews.length) first.types.source.discovery.overviews = overviews;
  first.proposal.types = Object.keys(types).map(name => results.flatMap(({ result }) => result.proposal.types).find(type => type.name === name));
  first.proposal.questions = first.types.source.discovery.questions;
  first.merged.cost_usd = results.every(({ result }) => Number.isFinite(result.call.cost_usd)) ? results.reduce((sum, { result }) => sum + result.call.cost_usd, 0) : null;
  first.merged.seconds = results.reduce((sum, { result }) => sum + result.call.seconds, 0);
  return first;
}

export function typeAgreement(variants) {
  return variants.length === 1 ? "Found in one proposal" : variants.every(value => canonical(value.definition) === canonical(variants[0].definition))
    ? "Proposals agree" : "Proposals use different definitions";
}
