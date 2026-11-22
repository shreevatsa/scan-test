// The page editor's "Find regions on this page again" and "Read this page again" take the stage's run path for the one
// page open, with the book's chosen model. Missing credentials open Settings.
import { test } from "node:test";
import assert from "node:assert/strict";
import { runPageAgain, pageRunBlocked } from "../js/page-actions.js";

function fakeApp({ finder = "local-blocks", reader = "argon-low", valid = () => false, regionsAccepted = true } = {}) {
  const calls = [], toasts = [], modes = [];
  const maker = { processing: false, jobs: new Map(), onCost: () => {}, options: async () => ({ finder, reader }),
    credentials: { status: profile => (profile.provider === "local" ? { valid: true } : { valid: valid(profile) }) },
    findRegions: async (pid, options) => { calls.push(["regions", pid, options.force]); maker.onCost(0); return { cached: false }; },
    read: async (pid, options, flags) => { calls.push(["text", pid, flags.force, flags.save]); maker.onCost(0.01); return { cached: false }; } };
  const state = { valid: true, doc: { page: { id: "p2", regions: [{ id: "r1" }] } }, layers: { regions: regionsAccepted ? { accepted: true } : { state: "model" } }, runErrors: {} };
  const app = { book: { writable: true }, pid: "p2", pageStates: new Map([["p2", state]]), dirty: false,
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

test("a page action with unchecked credentials opens Settings without calling the model", async () => {
  for (const [stage, options] of [["text", {}], ["regions", { finder: "terra-regions" }]]) {
    const { app, calls, modes } = fakeApp(options);
    await runPageAgain(app, stage);
    assert.deepEqual(calls, [], stage);
    assert.deepEqual(modes, ["settings"]);
  }
});

test("reading again needs valid boxes and can use them before review", async () => {
  const early = fakeApp({ regionsAccepted: false, valid: () => true });
  assert.equal(pageRunBlocked(early.app, "text"), null);
  await runPageAgain(early.app, "text");
  assert.deepEqual(early.calls, [["text", "p2", false, true]]);
  const invalid = fakeApp({ valid: () => true });
  invalid.app.pageStates.get("p2").valid = false;
  assert.match(pageRunBlocked(invalid.app, "text"), /needs valid scan boxes/);
  assert.equal(pageRunBlocked(early.app, "regions"), null);
  await runPageAgain(invalid.app, "text");
  assert.deepEqual(invalid.calls, []);
  const readOnly = fakeApp();
  readOnly.app.book.writable = false;
  assert.match(pageRunBlocked(readOnly.app, "regions"), /read-only/);
});
