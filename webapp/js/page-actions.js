// The page editor's page actions that call a model for the open page: "Find regions on this page again" and "Read this
// page again". They take the stage's own run path (pipeline/batch.js, as the Regions and Text grids' run buttons do) for
// a selection of this one page, with the same rules: the book's current finder or reader, its checked key (a local
// finder needs none), the spending check, costs in the ledger, saved model results reused unless the grid's "Ignore saved
// model results" is used, and a person's work never overwritten (a protected layer gets the result as a suggestion).
// When the choice is not ready here (no checked key, "Draw by hand" chosen), the stage's grid opens with this page
// selected and its run box ready.
import { h } from "./render.js";
import { runBatch } from "./pipeline/batch.js?v=20261121-blocks";
import { finderById } from "./pipeline/finders.js?v=20261121-blocks";
import { READERS } from "./pipeline/readers.js?v=20261121-blocks";
import { eligible, noContent } from "./workflow.js?v=20261121-blocks";
import { money } from "./reader-controls.js?v=20261121-blocks";

const NAMES = { regions: "Find regions on this page again", text: "Read this page again" };

// Why the action cannot run on this page now, or null.
export function pageRunBlocked(app, stage) {
  const state = app.pageStates.get(app.pid);
  if (!app.book.writable) return "A read-only book runs no models.";
  if (stage === "text" && !eligible("text", state)) return "Move this page on from Regions first.";
  if (stage === "text" && noContent(state?.doc)) return "This page has no content: there is nothing to read.";
  return null;
}

// The model the stage's grid would use, when it is ready to run here; else null.
async function readyProfile(app, maker, stage) {
  const options = await maker.options();
  if (stage === "regions" && app.regionOverview?.manual) return null;
  let profile = null;
  try { profile = stage === "regions" ? finderById(options.finder) : READERS.find(item => item.id === options.reader) || null; } catch { return null; }
  return profile && maker.credentials?.status(profile)?.valid ? profile : null;
}

function openStageGrid(app, stage, pid, why) {
  app.pendingStageSelection = { stage, ids: [pid], reprocess: true };
  app.setMode(stage);
  app.toast(`${why} ${stage === "regions" ? "Regions" : "Text"} opens with this page selected: run it from the run box there.`, "warn");
}

export async function runPageAgain(app, stage) {
  const blocked = pageRunBlocked(app, stage);
  if (blocked) return app.toast(blocked, "warn");
  if (app.workflowBusy || app.outlineBusy || app.maker?.processing) return app.toast("Wait for the active operation to finish.");
  await app.flush();
  if (app.dirty) return app.toast("This page has changes that do not pass the checks yet; correct them before calling a model.", "warn");
  const book = app.book, pid = app.pid, maker = await app.getMaker();
  const profile = await readyProfile(app, maker, stage);
  if (app.book !== book || app.pid !== pid) return;
  if (!profile) return openStageGrid(app, stage, pid, stage === "regions" && app.regionOverview?.manual
    ? "Regions is set to draw by hand." : "The chosen model's key has not been checked in this browser.");
  if (profile.provider !== "local" && !await app.confirmSpending()) return;
  if (app.book !== book || app.pid !== pid || app.workflowBusy) return;
  app.workflowBusy = true;
  app.toast(`${NAMES[stage]} with ${profile.label}…`);
  let out, failure = null, value = null;
  try {
    out = await runBatch({ maker, ids: [pid], stage, limit: 5, onPage: async (id, result, error) => {
      value = result; failure = error || null;
      await app.refreshWorkflowPage(id);
      const state = app.pageStates.get(id);
      if (state) { if (error) state.runErrors[stage] = error.message; else delete state.runErrors[stage]; }
    } });
  } catch (error) { failure = error; }
  finally { app.workflowBusy = false; }
  app.diskCopy?.checkpoint();
  if (app.book !== book) return;
  if (app.pid === pid) { app.doc = null; app.pageBuilt = false; await app.route(); }
  const state = app.pageStates.get(pid);
  if (failure) return app.toast(`${NAMES[stage]}: ${failure.message}`, "bad");
  const spend = out?.spend ? ` · ${money(out.spend)}` : "";
  app.toast(value?.cached ? `${profile.label}'s saved result for this page was used again (no new call). To call it afresh, use "Ignore saved model results" in the ${stage === "regions" ? "Regions" : "Text"} run box.`
    : state?.suggestion ? `Done${spend}. The page has your work, so the result waits as a suggestion: review it from the inspector.` : `Done${spend}.`);
}

// The toolbar's "Page" menu: what acts on the whole page. Its items are made when it opens, for the page open then.
export function pageMenu(app, { reviewPageWithAI }) {
  const item = (label, title, run, blocked = null) => h("button", { class: "link", title: blocked || title, disabled: !!blocked, onclick: () => {
    menu.open = false;
    Promise.resolve(run()).catch(error => app.toast(error.message, "bad"));
  } }, label);
  const items = h("div", { class: "page-menu-items" });
  const menu = h("details", { class: "page-menu", ontoggle: () => {
    if (!menu.open) return;
    items.replaceChildren(
      item("Review page with AI", "ask a model to review this page's regions and types, and choose what to take", () => reviewPageWithAI(app)),
      item("No content on this page", "for a page that is not part of the book, such as a library’s cover or a blank page: remove its regions (and move it on to Text if it is at Regions), where it needs no transcription",
        () => app.markNoContent()),
      item(NAMES.regions, "the book's chosen region finder on this page; your edits are kept and its result waits as a suggestion", () => runPageAgain(app, "regions"), pageRunBlocked(app, "regions")),
      item(NAMES.text, "the book's chosen transcription model on this page; your text is kept and its result waits as a suggestion", () => runPageAgain(app, "text"), pageRunBlocked(app, "text")));
  } }, h("summary", { title: "actions on the whole page" }, "Page ▾"), items);
  return menu;
}
