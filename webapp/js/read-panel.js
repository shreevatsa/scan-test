import { ownerOf } from "./ops.js?v=20261123-tidy-2";
import { checkPage } from "./schema.js?v=20261123-tidy-2";

export function readingIssues(docs, types, validate, warnings, canonical) {
  const issues = [];
  for (const doc of docs) {
    const [errors, notes] = checkPage(validate, doc, types);
    for (const message of [...errors, ...notes]) {
      const unit = /\bunit ([^\s:]+)/.exec(message)?.[1];
      const region = /\bregion [^#\s]+#([^\s:]+)/.exec(message)?.[1];
      const uid = unit && doc.units.some(value => value.id === unit) ? unit : region ? ownerOf(doc, region)?.id : doc.flows.main?.[0] || doc.units[0]?.id;
      issues.push({ message, targets: [{ page: doc.page.id, unit: uid, region }] });
    }
  }
  for (const message of warnings) {
    const targets = [...message.matchAll(/([A-Za-z0-9._-]+)#([A-Za-z0-9._-]+)/g)].filter(match => canonical[match[0]])
      .map(match => ({ page: match[1], unit: match[2] }));
    const boundary = /page ([^,\s]+), flow ([^:]+):/.exec(message), doc = boundary && docs.find(doc => doc.page.id === boundary[1]);
    const root = doc?.flows[boundary[2]]?.[0];
    if (root && !targets.some(target => target.page === doc.page.id && target.unit === root)) targets.push({ page: doc.page.id, unit: root });
    issues.push({ message, targets });
  }
  return issues;
}
