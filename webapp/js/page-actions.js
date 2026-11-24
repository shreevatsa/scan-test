// Page actions use the same batch loop as Process pages. They reuse saved model results
// and send a suggestion when the page already has protected work. Settings checks credentials.
import { h } from "./render.js";
import { runBatch } from "./pipeline/batch.js?v=20261124-spreads-2";
import { finderById } from "./pipeline/finders.js?v=20261124-spreads-2";
import { READERS } from "./pipeline/readers.js?v=20261124-spreads-2";
import { eligible, noContent } from "./workflow.js?v=20261124-spreads-2";
import { money } from "./reader-controls.js?v=20261124-spreads-2";

const NAMES = { regions: "Find regions on this page again", text: "Read this page again" };

// Why the action cannot run on this page now, or null.
export function pageRunBlocked(app, stage) {
  const state = app.pageStates.get(app.pid);
  if (!app.book.writable) return "A read-only book runs no models.";
  if (stage === "text" && !eligible("text", state)) return "This page needs valid scan boxes before it can be read.";
  if (stage === "text" && noContent(state?.doc)) return "This page has no content: there is nothing to read.";
  return null;
}

// The model the stage's grid would use, when it is ready to run here; else null.
async function readyProfile(app, maker, stage) {
  const options = await maker.options();
  let profile = null;
  try { profile = stage === "regions" ? finderById(options.finder) : READERS.find(item => item.id === options.reader) || null; } catch { return null; }
  return profile && maker.credentials?.status(profile)?.valid ? profile : null;
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
  if (!profile) {
    app.setMode("settings");
    return app.toast("Check the chosen model’s credential in Settings, then return to this page.", "warn");
  }
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
  app.toast(value?.cached ? `${profile.label}'s saved result for this page was used again without a new call.`
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
      item("Revert page", "Return to this page’s last stage save", () => app.revertPage()),
      item("Review page with AI", "ask a model to review this page's regions and types, and choose what to take", () => reviewPageWithAI(app)),
      item("No content on this page", "for a page that is not part of the book, such as a library’s cover or a blank page: remove its regions. A blank page needs no transcription",
        () => app.markNoContent()),
      item(NAMES.regions, "the book's chosen region finder on this page; your edits are kept and its result waits as a suggestion", () => runPageAgain(app, "regions"), pageRunBlocked(app, "regions")),
      item(NAMES.text, "the book's chosen transcription model on this page; your text is kept and its result waits as a suggestion", () => runPageAgain(app, "text"), pageRunBlocked(app, "text")));
  } }, h("summary", { title: "actions on the whole page" }, "Page ▾"), items);
  return menu;
}
