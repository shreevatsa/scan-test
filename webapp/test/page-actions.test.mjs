// The page editor's "Find regions on this page again" and "Read this page again" take the stage's run path for the one
// page open, with the book's chosen model; when that choice cannot run here they open the stage's grid with the page
// selected instead.
import { test } from "node:test";
import assert from "node:assert/strict";
import { runPageAgain, pageRunBlocked } from "../js/page-actions.js";

function fakeApp({ finder = "local-blocks", reader = "argon-low", valid = () => false, regionsAccepted = true, manual = false } = {}) {
  const calls = [], toasts = [], modes = [];
  const maker = { processing: false, jobs: new Map(), onCost: () => {}, options: async () => ({ finder, reader }),
    credentials: { status: profile => (profile.provider === "local" ? { valid: true } : { valid: valid(profile) }) },
    findRegions: async (pid, options) => { calls.push(["regions", pid, options.force]); maker.onCost(0); return { cached: false }; },
    read: async (pid, options, flags) => { calls.push(["text", pid, flags.force, flags.save]); maker.onCost(0.01); return { cached: false }; } };
  const state = { doc: { page: { id: "p2", regions: [{ id: "r1" }] } }, layers: { regions: regionsAccepted ? { accepted: true } : { state: "model" } }, runErrors: {} };
  const app = { book: { writable: true }, pid: "p2", pageStates: new Map([["p2", state]]), dirty: false, regionOverview: { manual },
    flush: async () => {}, getMaker: async () => maker, confirmSpending: async () => true, refreshWorkflowPage: async () => {},
    route: async () => { app.routed = true; }, toast: (message, kind) => toasts.push([message, kind]), setMode: mode => modes.push(mode) };
  return { app, calls, toasts, modes };
}

test("finding regions on the open page again runs the chosen local finder on that page only", async () => {
  const { app, calls, toasts } = fakeApp({ finder: "local-blocks" });
  await runPageAgain(app, "regions");
  assert.deepEqual(calls, [["regions", "p2", false]]);
  assert.equal(app.routed, true);
  assert.match(toasts.at(-1)[0], /^Done/);
});

test("reading the open page again uses the chosen reader once its key checks, and saves as a run does", async () => {
  const { app, calls } = fakeApp({ valid: () => true });
  await runPageAgain(app, "text");
  assert.deepEqual(calls, [["text", "p2", false, true]]);
});

test("without a checked key, or with Draw by hand chosen, the stage's grid opens with the page selected", async () => {
  for (const [stage, options] of [["text", {}], ["regions", { finder: "terra-regions" }], ["regions", { manual: true }]]) {
    const { app, calls, modes } = fakeApp(options);
    await runPageAgain(app, stage);
    assert.deepEqual(calls, [], stage);
    assert.deepEqual(modes, [stage]);
    assert.deepEqual(app.pendingStageSelection, { stage, ids: ["p2"], reprocess: true });
  }
});

test("reading again waits until the page has been moved on from Regions; a read-only book runs nothing", async () => {
  const early = fakeApp({ regionsAccepted: false, valid: () => true });
  assert.match(pageRunBlocked(early.app, "text"), /Move this page on from Regions/);
  assert.equal(pageRunBlocked(early.app, "regions"), null);
  await runPageAgain(early.app, "text");
  assert.deepEqual(early.calls, []);
  const readOnly = fakeApp();
  readOnly.app.book.writable = false;
  assert.match(pageRunBlocked(readOnly.app, "regions"), /read-only/);
});
