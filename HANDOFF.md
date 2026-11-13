# Scanned books, source-aware: handoff

Rewritten 2026-11-12 to describe the present. The previous handoff (a 1,200-line log holding the full stage-workflow design, build progress and earlier notes) is at [old/HANDOFF-2026-11-11.md](old/HANDOFF-2026-11-11.md); consult it for the detailed reasoning behind something already built, not for what to do next. Keep this file short: replace statements when they stop being true, and put test records in NOTEBOOK.md.

## Goal

Turn a book's PDF into a digital book in which every unit (paragraph, verse, footnote…) links to its regions on the scanned page, in a statically hosted web app that uses the user's own API keys. Structure comes first: each book has its own type list, and regions and their types are settled from the scans before transcription.

## Where things stand

- **The app works and is tested.** `webapp/` is plain HTML, CSS and JavaScript modules with no build step (about 13,000 lines in `webapp/js`). Tabs are Pages · Regions · Text · Read · Export, one per stage. `webapp/README.md` describes every screen; `schema/README.md` describes the format (draft 0.3).
- **Tests:** `node --test webapp/test/*.test.mjs` (312 pass) and `UV_NO_SYNC=1 uv run --offline python schema/test_book.py` (19 pass).
- **Running:** `uv run --offline python -m http.server 8765 --bind 127.0.0.1` from the repository root, then http://127.0.0.1:8765/webapp/. A book opens read only with `?book=/outputs/books/kale-1913.chaya.pdf`. The Tailscale HTTPS address for the user's other devices is in PRIVATE.md.
- **Books that exist** (`outputs/books/`, not in git): Kale 1913 (252 pages) and Telang, both made by the older one-pass pipeline (method 052), and the vachana book made from a digital PDF's text layer (methods 058 and 062, private).
- **Books are kept on disk as well as in the browser** (task 1, done 2026-11-12): a book in the browser can keep a `.chaya.pdf` on disk that the app rewrites after runs and moves and at most every five minutes while there are changes; paid runs wait for a copy; a book with unreadable files is not opened as if empty. `webapp/README.md`, "The copy on disk", describes it. Checked in Chrome with the file picker simulated; the real picker and a real file changing on disk still need one manual check by the user.
- **Screens are quiet for reading and reviewing** (task 2, done 2026-11-12): a read-only book shows no processing controls, only "Make an editable copy"; each stage grid has its controls in a "Process pages" section that starts open only while pages wait; layout rarity is a filter, not a flag, and Pages shows each page's flags at the stage it waits at. Flags on Kale are now 16 pages in Regions (6.3%), 32 in Text (12.7%), 8 in Read and in Pages (3.2%), down from 104 in Regions and 114 in Pages (NOTEBOOK, "Rare review flags on Kale"). `webapp/tools/flag_counts.mjs` recounts them.
- **One default recipe** (task 3, done 2026-11-12): a new book starts with Terra regions (042 + 063), Argon low transcription and Argon high completion, saved in its `book.json` (`webapp/js/recipe.js`). Each stage's "Process pages" line names the model and its cost a page, with "Change" leading to the model list and that stage's comparison (no longer a header tab). Estimates use the book's own calls, else the measured figures below; other models without calls say they have no measured cost yet.
- **No scanned book has gone through the staged workflow end to end.** This is the main gap. The user's 267-page private book was lost from browser storage on 2026-11-12 with about $3.86 of model work in it, and was started again; it now has 267 pages, the eleven draft types and nothing processed. A backup `.chaya.pdf` of that fresh state exists (PRIVATE.md says where).
- **Least tested stage:** completion (units, line joins, note links), compared on two private pages only, with nobody having checked which model was right. Region finding is the best tested (0 / 0 / 0 on the nine reference pages) and the cheapest.
- **Measured cost per page** on the private series: finding regions about $0.010, transcription $0.038 (Argon low), completion $0.032 (Argon high). About $21 for 267 pages.
- **An agent path exists beside the app:** `skills/transcribe-chaya-book/` is a portable skill (workflow, format reference, Python packer) by which an agent prepares a `.chaya.pdf` without the app.

## What to do next, in order

Each task is sized for one session. Finish, test and commit one before starting the next. Rules for all of them are under "Working rules". Tasks 1 (durable books), 2 (quiet screens) and 3 (one default recipe) are done.

### Task 4. Take the 267-page book through every stage (with the user)

This needs the user's browser, keys and spending approval; an agent does not start it alone. After tasks 1 and 2: regions for pages 1–10, review, then all pages; transcription the same way; completion the same way. Fix only what blocks the run. Write each real obstacle in PRIVATE.md (it is a private book) and turn each into a test with a public or synthetic fixture. The purpose is to learn what the workflow lacks, so resist adding features until the book is through.

### Task 5. Experiments that shrink completion

New method IDs from 095, with NOTEBOOK entries and recorded costs. In this order:
1. **A narrow completion call:** with units fixed by the local rule (`provisionalUnits`) and the user's region types, ask only for line ends, unit numbers and labels, and note links. Expect lower cost and fewer invalid results than 070 and 073–076.
2. **Container starts from region finding:** one extra field per region naming the container that begins there, the tree built locally, compared with trees a person corrected.
3. **Line joins by rule** on transcribed scans (the digital book's rule was about 87% right).
4. **Completion over a run of pages** for joins and notes that cross page breaks.

Still open from before, lower priority: the text-layer path in the app (port `nudi.py` and method 062 to JavaScript; tell a real text layer from invisible OCR text, which is not to be trusted); LaTeX or Typst export; Safari's storage fallback; the public `.chaya.pdf` files on a GitHub Release.

## Thoughts on redesign

These are opinions formed on 2026-11-12 from reading the code and using the app. Tasks 1 to 3 are the parts already decided above; the rest is for the user to accept or reject.

1. **The file on disk should be the book; the browser should be a cache.** `.chaya.pdf` is the best idea here, and the app treats it as an export. Task 1 moves toward the reverse. The end state is "open a file, work, it saves", as a desktop editor does, with browser storage holding only what makes reopening fast.
2. **Bulk processing does not belong in a browser tab.** A 267-page run is hundreds of calls over an hour or more, exposed to tab reloads, sleep, 75-second deadlines and storage loss. The pipeline modules (`webapp/js/pipeline/`) already run under Node in the tests. A small command-line runner (`node webapp/tools/run_book.mjs book.chaya.pdf --stage regions --pages 1-50`) that reads and writes the same `.chaya.pdf` would make long runs resumable and scriptable, and would let an agent do them. The app would then be for what needs eyes: reviewing regions, correcting text, reading. Whether page rendering and the local ink step run under Node without a canvas has not been checked; check that first. The static-app goal is kept: the in-browser run stays for small ranges.
3. **Research and product are mixed in the interface.** The 92 methods and the comparison screens were how the recipe was found. They are evidence, and the user of a book needs the result of that evidence (task 3). If a comparison is needed again for a new kind of book, it is an advanced action.
4. **Completion is the wrong shape.** It is the costliest text-only step, the least validated, and it may contradict structure the user already reviewed. Regions already carry type, order and continuation flags, and the local rule builds a valid tree from them. The remaining model work is small and checkable (line ends, numbers, note links), which is what task 5 tests. If it holds, the stages become Regions (structure, final) → Text → Read (corrections only), and "Units and links" stops being a stage.
5. **Review by exception only works if exceptions are few.** A stage should be judged by how many pages it asks a person to open. Every flag kind should have a measured rate on a real book, and one that fires on a third of pages is a defect in the flag (task 2).
6. **Fewer, larger views.** `main.js` (1,100 lines) and the many `*view.js` files grew by accretion, with sub-tabs under tabs (Read has five). After task 4 shows which screens are used, remove the ones that were not.

## Invariants of the built design

Details are in the archived handoff under "Data model"; these are the rules code must keep.

- **Layers:** a page document has three layers, `regions`, `text` and `units` (`source.layers`, helpers in `webapp/js/layers.js`). A layer is protected when a person has edited it or it has been accepted (moved on to the next stage).
- **A model never overwrites a person's work.** Model steps write only unprotected layers (`webapp/js/pipeline/apply.js`); the rest becomes a suggestion to take or dismiss.
- **Transcription depends on shapes, never on the type list.** A reading is reused when page image, region and line shapes and model match (`geometry_key`). Changing types never forces paying for transcription again.
- **A merge that would make a valid page invalid is not applied.**
- **Type lists change through operations** (rename, merge, split, containment…) with a preview of their reach, a revision number and aliases; never by free-form JSON editing. Work records are never rewritten.
- **`.chaya.pdf`:** the original PDF's bytes unchanged, plus one update attaching `chaya.json`. The original must be recoverable exactly.
- **PDF is the only input.** Styling is separate from semantic structure. Unlabelled ornaments are page furniture.
- **Requests have a 75-second deadline** (five minutes for whole-book contact sheets, by the user's choice). Attempts are entered in the ledger before the request is sent. Keys are checked where they are entered.

## Working rules

- **Private material stays out of git and out of this file:** the private books' names, pages, results and personal URLs go in `PRIVATE.md` and `private/` (both local; `.git/info/exclude` lists the rest). Read PRIVATE.md at the start of a session on this machine.
- **Methods:** code and README under `methods/<id>-<name>/`. A changed prompt, model, setting or recipe gets a new ID (next unused: 095); a repeated request gets a new `run-NNN` directory. Saved requests, responses and prior method code are immutable.
- **NOTEBOOK.md** records actual tests only (settings, observations, costs, images), newest last, one physical line per paragraph. Plans and conclusions go here.
- **Python:** `uv run --offline python`. **Keys:** from the environment or the `llm` key store (`openai`, `gemini`); never printed or written to files.
- **Spending:** no paid model call without the user's approval for that run; record every charge.
- **The user's browser storage holds their work.** Do not clear site data, and do not create or delete books in the user's own browser profile without being asked. Test in a separate profile.
- **Commits:** finished, tested work goes straight to `main` and is pushed, as the user prefers. Update `webapp/README.md` with any change to a screen, and this file when a statement in it stops being true.
