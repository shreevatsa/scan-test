import { h } from "./render.js";

export function runProgress(label) {
  let total = 0, processed = 0, reused = 0, failed = 0, skipped = 0, started = 0, timer = null;
  let state = "";
  const bar = h("progress", { max: 1, value: 0, "aria-label": label });
  const count = h("span", { role: "status" });
  const elapsed = h("span", { class: "meta", "aria-live": "off" });
  const details = h("span", { class: "meta" });
  const element = h("div", { class: "run-progress", hidden: true },
    h("div", { class: "run-progress-label" }, count, elapsed), bar, details);
  const updateTime = () => {
    const seconds = Math.floor((Date.now() - started) / 1000);
    elapsed.textContent = `Elapsed ${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  };
  const update = () => {
    bar.max = total;
    bar.value = processed;
    count.textContent = `${state ? `${state} · ` : ""}${processed} of ${total} steps processed · ${Math.floor(processed / total * 100)}%`;
    details.textContent = [`${processed - failed - skipped} completed`, reused ? `${reused} reused saved results` : "",
      failed ? `${failed} failed` : "", skipped ? `${skipped} skipped` : ""].filter(Boolean).join(" · ");
    updateTime();
  };
  return {
    element,
    start(steps) {
      clearInterval(timer);
      total = steps;
      processed = reused = failed = skipped = 0;
      state = "";
      started = Date.now();
      element.hidden = false;
      update();
      timer = setInterval(updateTime, 1000);
    },
    advance(outcome = "completed") {
      processed++;
      if (outcome === "reused") reused++;
      if (outcome === "failed") failed++;
      if (outcome === "skipped") skipped++;
      update();
    },
    finish(message) {
      clearInterval(timer);
      state = message;
      if (message === "Finished" && failed) state = "Finished with failures";
      else if (message === "Finished" && skipped) state = "Finished with skipped steps";
      update();
    },
  };
}
