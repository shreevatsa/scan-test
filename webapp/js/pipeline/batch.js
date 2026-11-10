// Every workflow stage uses this loop. A stop or spend threshold is checked between calls.
export async function runBatch({ maker, ids, stage, limit, force = false, stopped = () => false, onProgress = () => {}, onPage = async () => {} }) {
  if (!Number.isFinite(limit) || limit <= 0) throw new Error("Enter a positive processing spend threshold.");
  if (maker.processing || maker.jobs.size) throw new Error("Wait for the active processing to finish.");
  const result = { total: ids.length, processed: 0, failed: 0, reused: 0, spend: 0, unknown: 0, paused: false };
  const previousCost = maker.onCost;
  maker.processing = true;
  maker.onCost = cost => {
    previousCost(cost);
    if (Number.isFinite(cost)) result.spend += cost; else result.unknown++;
  };
  try {
    for (const pid of ids) {
      if (stopped() || maker.persistenceFailure || result.unknown || result.spend >= limit) { result.paused = true; break; }
      onProgress({ ...result, pid });
      let value, error;
      try {
        if (stage === "regions") value = await maker.findRegions(pid, { force });
        else if (stage === "text") value = await maker.read(pid, null, { force, save: true });
        else if (stage === "read") value = await maker.complete(pid, { force });
        else throw new Error(`Unknown processing stage ${stage}.`);
        if (value.errors?.length) throw new Error(value.errors[0]);
        if (value.cached) result.reused++;
      } catch (failure) { error = failure; result.failed++; }
      result.processed++;
      await onPage(pid, value, error);
      onProgress({ ...result, pid, error });
    }
    result.paused ||= stopped() || !!maker.persistenceFailure || !!result.unknown || result.spend >= limit;
    return result;
  } finally { maker.processing = false; maker.onCost = previousCost; }
}
