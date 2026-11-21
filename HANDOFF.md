# Scanned books, source-aware: handoff

Rewritten 2026-11-21 to describe the present. Earlier versions are in git history; the long design log of 2026-11-11 is at [old/HANDOFF-2026-11-11.md](old/HANDOFF-2026-11-11.md). Keep this file short: replace statements when they stop being true, and put test records in NOTEBOOK.md.

## Goal

Turn a book's PDF into a digital book in which every passage links to where it is printed on the scanned page, in a statically hosted web app that uses the user's own API keys. Models do the first pass; a person checks and corrects; the result reads well and exports cleanly.

## Where things stand

- **One scanned book is finished:** the Rāmāyaṇa-mañjarī (Kāvyamālā 83, 1903, an archive.org scan). It has 532 PDF pages, 517 in the book. Every page was read again with Gemini 4 Hydrogen (method 100, $9.86), then shaped by rules:
  - verse, episode and page numbers checked by their sequence;
  - verse groups ((युगलकम्), (तिलकम्));
  - parts and 202 episodes from the closing lines;
  - 616 of 711 footnotes linked to their markers.

  It has no check failures and no unjoined page breaks. The rebuild from the reading is `methods/100-hydrogen-low-whole-page-reading/pipeline.sh`. The files are kept outside git:
  - `outputs/books/ramayana-manjari.chaya.pdf`, the book. It is the same file as `ramayana-manjari-hydrogen.chaya.pdf`, which older links name.
  - `ramayana-manjari-read.chaya.pdf`, the pipeline's input.
  - `ramayana-manjari.html`, the book as one web page.
  - `superseded/`, older versions.

  This book went through the app's stages only partly; most of its finishing was done by the command-line tools below.
- **Other books:** Kale 1913 and Telang were made by the older one-pass pipeline (method 052). The vachana book came from a digital PDF's text layer (058, 062). The user's 267-page private book has regions only; PRIVATE.md says where it is.
- **The app** (`webapp/`, about 16,600 lines of JavaScript, no build step) has tabs Pages · Regions · Text · Read · Export. `webapp/README.md` describes every screen; `schema/README.md` describes the format (draft 0.3). Recent changes:
  - **One page editor** at `#page&p=<id>`, the same from every stage. Old `#regions&p=`, `#text&p=` and `#read&p=` addresses open it. It edits text, regions (type, box, draw, split, merge, order, delete), units, joins and note links. It shows the page's flags, and a Page menu offers review with AI, no content, find regions again, and read again. A region with no line piece takes text when clicked.
  - **Read → Book view:** the book to read, with a contents sidebar that follows the reading, footnotes as sidenotes, no page numbers, and printed contents lines linked to their episodes. Part names the editor gave are shown in parentheses. The HTML export uses the same layout; `webapp/tools/chaya_html.mjs` writes it from the command line.
  - **Dimmed pages** are left out of the book, not gaps, so a unit goes on across a duplicate scan.
  - **Pages are drawn at the scan's resolution:** `scanImage` takes the sharpest image on a page. An archive.org page is a 133 ppi colour background under a 400 ppi text layer.
  - **Opening a book shows progress bars** for downloading, reading, and saving its files into the browser.
  - **The front page lists example books,** served from `outputs/books/` by a local server only.
- **Command-line tools** (`webapp/tools/`, each documented at the end of `webapp/README.md`) work on a `.chaya.pdf`:
  - `chaya_baseline` puts units back to their provisional grouping;
  - `chaya_verse_numbers` checks verse numbers, and episode numbers with `--type=section_closing`;
  - `chaya_verse_groups` makes verse groups;
  - `chaya_sections` makes parts and episodes from closing lines and headings;
  - `chaya_notes` links note markers;
  - `chaya_page_labels` corrects page numbers;
  - `chaya_rescale` redraws a book's pages at another size;
  - `chaya_html` writes the book as one web page.
- **Readers:** method 099 compared readers at 400 ppi on eleven pages, one whole page per call:
  - Hydrogen, Carbon and Neon (all at low thinking) were about 0.5% wrong words, and all three placed all 16 footnote markers;
  - Flash 3.8 and Cloud Vision were about 4.4%; Vision never sees markers;
  - Flash-Lite was 12.8%;
  - every reader misreads this font's digits, so numbers need the sequence checks.

  Method 100 then read the whole book with Hydrogen low, one page image per call with the page's regions listed in the prompt, at 1.9¢ a page. **The app's own reading request still sends an overview plus every region crop as a separate image** (18,000–56,000 image tokens a page against about 1,100 for one page image); it should change (task 3). Vertex AI is enabled on the user's Google Cloud project; a `gcloud auth print-access-token` token lasts an hour, so long runs need a fresh one.
- **Open items on the finished book:**
  - 88 notes have no marker in the text;
  - 4 regions kept their old text (line counts differed);
  - 9 verse-number breaks and 3 episode-number breaks are listed, not changed;
  - 5 contents lines link to a page instead of an episode (the "…हननम्" entries);
  - 9 front-matter pages keep the provisional grouping.
- **Tests:** `node --test $(ls webapp/test/*.test.mjs | grep -v page-joins)` (373 pass), then `node --test webapp/test/page-joins.test.mjs` on its own (17 pass). Its Python reference helper sometimes hangs waiting for input in a parallel run; `pkill -f py_reference.py` and rerun it alone. Also `UV_NO_SYNC=1 uv run --offline python schema/test_book.py` (19 pass).
- **Running:**
  - A loopback server, `python3 -m http.server 8765 --bind 127.0.0.1`, runs from the repository root.
  - `tailscale serve --https=8765 http://127.0.0.1:8765` makes it reachable from the user's other devices; the address is in PRIVATE.md.
  - Open a book with `?book=../outputs/books/<file>.chaya.pdf`.
- **Not pushed:** 24 commits on `main`. One of them, `3f817602` (fetch the example books from a release when deploying), is the approach the user set aside in favour of a separate small repository for the examples; drop or revert it before pushing, and ask the user before pushing.

## The redesign: blocks, as in Wikisource

### What we found

Wikisource digitizes books with about five concepts:
- an Index page for the book;
- one page of wikitext per scan, edited beside the image;
- four proofreading states;
- chapters made by including page ranges;
- a few conventions: `<ref>`, `<poem>`, header and footer fields, and a template for a word hyphenated across pages.

This app has, besides the PDF and pages:
- regions, with outlines and line pieces;
- text as line pieces with spans;
- units, a separate tree with open ends across pages;
- flows and relations;
- a type list with revisions, aliases, proposals and surveys;
- three layers per page with four states each;
- five stages with move-on gates;
- many model profiles.

Measured on the finished Rāmāyaṇa-mañjarī:

| Concept | In the finished book |
|---|---|
| Leaf units | 7,575, of which 7,564 (99.85%) are exactly one region |
| Containers | 1,205, all made by rules except 4 by hand |
| Note links | 616, all made by the same-number-on-the-page rule |
| Line endings | 15,127 of 15,144 are the default |
| Spans | 620, almost all note markers |
| Pages edited by hand | 4 |

The units layer, the relations, the line endings, the layer states and the stages carried data that rules produced from blocks and their text.

### What is essential

- **A box per block on the scan.** It is what makes the book source-aware (every line traced to its place), how a model is told what to read, how figures are cropped, and how reading order is checked.
- **Types instead of markup.** A block is a verse, a heading, a note or a running head.
- **Models for the first pass,** with people checking.

### What to keep, simplify or drop

| Concept | Verdict |
|---|---|
| Regions | Keep, as **blocks**: type, box, text lines, reading order |
| Region outlines and line pieces | Keep text as lines; make line outlines optional, computed when needed for highlighting (whole-page reading no longer needs them) |
| Text spans | Keep note markers and the rare formatting; edit each block as plain text with markers shown as `[१]`, as models already write them |
| Units as an authored layer | **Drop.** A block is its unit. A passage running onto the next page has a "continues" flag. Containers and numbers come from rules. |
| Flows | Drop as a concept: a note block is a note, a commentary block is commentary |
| Relations | Derive by rule; store only a person's overrides |
| Line endings per line piece | Drop the field; join or break by the block's type; fix the odd case in the text |
| Layers × states, stages, move-on gates | **Replace** with one status per page (unchecked, checked, model suggestion waiting) and one rule: a model never overwrites a person's edit |
| Type-list revision machinery | Shrink to a short editable list (name, plain description, how it reads); a rename just applies |
| Model profiles, finder and reader comparisons, surveys | Move to a "lab" page; the product uses one recipe |

### The result

Wikisource's two panes, with boxes:
- **The page editor:** the scan on the left; on the right the page's blocks in reading order, each a type and a text box. Clicking a block highlights its box; drawing a box adds a block.
- **The book's structure:** a few rules set once per book, as the command-line tools take them now (what closes an episode, what starts a part, verse-group markers, how markers find their notes), each with an override on a block ("a new section starts here", "this marker goes to that note").

### What needs care

- **Several parallel flows** (Kale's commentary and translation) work as types.
- **A block interrupted on its own page** (by a figure) gets the same "continues" flag.
- **Prose hyphenated across lines** (Kannada) needs a joining rule plus fixes in the text.
- **Existing books** keep the `.chaya.pdf` envelope; their units are derivable, as the finished book shows.

### The page editor, simplified meanwhile

From the user's review of the one page editor (2026-11-20):
1. **Lead with what to do.** One short "Check this page" list at the top, each item one sentence with one button, in place of the flags, ignored lines and unassigned-region rows. Library stamps and shelf marks get "Leave them out". An empty list says so and offers "Next page to check".
2. **Plain words.** No "FLOW MAIN", `title_page`, `r2`, `f1`, "unowned regions" or "edits/". Show the page as it reads, with small type tags and containers as quiet brackets. A plainer save status.
3. **Tools in context.** Formatting buttons only while typing; zoom and ＋ Region on the scan; Revert in the Page menu; "(no text — click to type it)" only on text blocks.
4. **A small inspector.** For the selected block: its type, "continues" only at a page's top or bottom, and number and label only for types that have them; the rest under "More…". Line joins shown as marks at line ends in the text, for prose only.
5. **Three tabs:** Pages (progress, flags, runs; model comparisons under Advanced), Read (Book view and the editor), Export.

## What to do next, in order

Each task is sized for one session. Finish, test and commit one before starting the next.

1. **Blocks spike.** Build the blocks-only page editor and reader as a view over the existing data: blocks from regions, containers and numbers from the tools' rules, note links by rule. Try it on Kale (prose, several flows) and the Rāmāyaṇa-mañjarī, and count how many hand overrides each needs. Include items 1–4 of the simplified page editor. Report to the user before retiring anything.
2. **Retire what the spike shows unneeded,** one at a time, each with tests: the units layer as authored data, the layer states and stage gates, flows, the line-ending field, the type-revision machinery. Then the three tabs (item 5).
3. **The app reads like method 100.** One page image per call with the page's blocks listed, Hydrogen low by default, an updated cost estimate, and markers taken from `[n]`.
4. **The structure rules move into the app** as a book's settings (closings, part headings, verse groups, note linking, number checks), with the command-line tools kept for batch work.
5. **The examples hosting:** a separate small repository with Pages enabled (the user's choice), when the user asks.

Lower priority: a command-line runner for long model runs; the text-layer path in the app (port `nudi.py` and method 062); LaTeX or Typst export; Safari's storage fallback.

## Decisions the user has accepted

- **Follow the print** where it speaks:
  - parts end at their printed closings;
  - the Bāla and Ayodhyā are one part, as printed (heading at the start, closing at the end);
  - the ten renumbered episodes after the Yuddhakāṇḍa's closing are a part the book leaves untitled, kept untitled;
  - names the editor gives are marked as such (`source.label: "editor"`) and shown in parentheses.
- **Readers:** Hydrogen low reads whole pages (method 100). Carbon low is as accurate but slow; Neon costs about 3.4¢ a page.
- **One page editor** for all stages, with text editable at every stage, and nothing removed that the user still needs.
- **The Book view** with footnotes as sidenotes, no page numbers, and a verse group's marker floated in the free space after its last line.
- **Examples** are hosted from a separate repository with Pages enabled (set aside for now); nothing is pushed without asking.
- **Model profiles:** two (Terra, Argon low) under one method ID, as in 095, 096 and 098; method 097 is the default region finder.

## Invariants of the built design

These hold until the redesign replaces them; change them only deliberately.

- **A model never overwrites a person's work.** Model steps write only unprotected layers (`webapp/js/pipeline/apply.js`); the rest becomes a suggestion to take or dismiss. A person's edits are saved under `edits/`.
- **Layers:** a page document has three layers, `regions`, `text` and `units` (`source.layers`, `webapp/js/layers.js`). A layer is protected when a person has edited it or it has been accepted.
- **Transcription depends on shapes, never on the type list.** A reading is reused when the page image, region and line shapes and model match (`geometry_key`).
- **A merge that would make a valid page invalid is not applied.**
- **Type lists change through operations** with a preview, a revision number and aliases. Work records (calls, runs) are never rewritten.
- **`.chaya.pdf`:** the original PDF's bytes unchanged, plus one update attaching `chaya.json`; the original is recoverable exactly.
- **PDF is the only input.** Styling is separate from semantic structure.
- **Pages:** drawn from the sharpest image covering at least half the page (`scanImage`), at 300 dpi or less. A dimmed page is left out of the book, not a gap.
- **Requests have a 75-second deadline** (five minutes for contact sheets). Attempts are entered in the ledger before the request is sent.

## Working rules

- **Private material** stays out of git and out of this file: the private books' names, pages, results and personal URLs go in `PRIVATE.md` and `private/`. Read PRIVATE.md at the start of a session on this machine.
- **Methods:** code and README under `methods/<id>-<name>/`. A changed prompt, model, setting or recipe gets a new ID (next unused: 101). Saved requests, responses and prior method code are immutable.
- **NOTEBOOK.md** records actual tests (settings, observations, costs), newest last. Plans and conclusions go here.
- **Spending:** no paid model call without the user's approval for that run; record every charge (the book's ledger for app calls, the method's README for calls made outside the app).
- **The user's browser storage holds their work.** Do not clear site data or create or delete books in the user's own browser profile. Test in a separate profile; the headless checks use a fresh Playwright context with `channel: 'chrome'`.
- **Cache-busting:** every `?v=` string in `webapp/` must be one value; change it everywhere when a module changes.
- **Commits:** commit finished, tested work to `main`; ask the user before pushing. Update `webapp/README.md` with any change to a screen, and this file when a statement in it stops being true.
- **Python:** `uv run --offline python`. **Keys:** from the environment or the `llm` key store; never printed or written to files.
