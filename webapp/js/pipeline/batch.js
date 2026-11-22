// Every workflow stage uses this loop. A stop or spend threshold is checked between calls.
export async function runBatch({ maker, ids, stage, stageOf, limit, force = false, stopped = () => false, onProgress = () => {}, onPage = async () => {} }) {
  if (!Number.isFinite(limit) || limit <= 0) throw new Error("Enter a positive processing spend threshold.");
  if (maker.processing || maker.jobs.size) throw new Error("Wait for the active processing to finish.");
  const result = { total: ids.length, processed: 0, failed: 0, reused: 0, spend: 0, unknown: 0, paused: false };
  const previousCost = maker.onCost;
  maker.processing = true;
  maker.onCost = cost => {
    previousCost(cost);
    if (Number.isFinite(cost)) result.spend += cost; else result.unknown++;
  };
  const shouldStop = () => stopped() || maker.persistenceFailure || result.unknown || result.spend >= limit;
  const run = async (pid, step) => {
    let value;
    if (step === "regions") value = await maker.findRegions(pid, { force });
    else if (step === "text") value = await maker.read(pid, null, { force, save: true });
    else if (step === "read") value = await maker.complete(pid, { force });
    else throw new Error(`Unknown processing stage ${step}.`);
    if (value.errors?.length) throw new Error(value.errors[0]);
    return value;
  };
  try {
    for (const pid of ids) {
      if (shouldStop()) { result.paused = true; break; }
      onProgress({ ...result, pid });
      let value, error;
      try {
        if (stage === "pages") {
          const first = stageOf(pid);
          value = first ? await run(pid, first) : {};
          if (first === "regions" && !value.suggestion && !shouldStop() && stageOf(pid) === "text") {
            const reading = await run(pid, "text");
            value = { ...reading, cached: Boolean(value.cached && reading.cached) };
          }
        } else value = await run(pid, stage);
        if (value.cached) result.reused++;
      } catch (failure) { error = failure; result.failed++; }
      result.processed++;
      await onPage(pid, value, error);
      onProgress({ ...result, pid, error, value });
    }
    result.paused ||= Boolean(shouldStop());
    return result;
  } finally { maker.processing = false; maker.onCost = previousCost; }
}
