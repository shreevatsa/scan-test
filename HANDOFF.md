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
- **Other books:** Kale 1913 and Telang were made by the older one-pass pipeline (method 052). The vachana book came from a digital PDF's text layer (058, 062). The user's 267-page private book has been read in the user's browser (regions by Terra, text by Argon); PRIVATE.md says where it and the rest of its series are.
- **Sample books (2026-11-23):** eight public books started from their PDFs in the app, driven headlessly as a person would, with the default recipe (Terra regions with proposed types, Hydrogen whole page): Cole, Ryder's Gita and Ten Princes, Dutt (Drona 1–4), Vavilla, Gopinath 1896 and 1914, Hertel; 4–15 pages each, about 3¢ a page, $3.17 in all. They are saved with every model response in `outputs/books/samples/` (outside git). The driver scripts are not in the repository; NOTEBOOK.md (2026-11-23) has what the books met. What changed because of them:
  - **Headings start sections** (book rules `headings`, `webapp/js/heading-rules.js`; a new book starts with `heading = section`); the contents list named containers in books without top-level sections.
  - **Proposed types:** an area waiting for one is in the book meanwhile, as a block of the type of its kind with its text (2026-11-25: all text is in the books by default); adding the type gives every such block that type, in one decision (`restoreProposed`), and keeping them drops the proposal (`keepProposed`); the Pages screen lists them (Add type, Keep them as they are, See one). In books made before, such areas were left out until decided (Leave them out still applies there).
  - **A reading that does not fit** a region's line pieces fills an empty region, spread over its pieces (uncertain), instead of leaving it empty.
  - **A nearly blank page** keeps the finder's boxes (no ink found) instead of failing.
  - **Missed lines:** a page where the finder kept nothing (a cover, a library's notice) has one check for its marks, with Leave the page out; a speck at the scan's edge is not listed.
  - **A verse** whose reading does not fit keeps its printed lines whole.
- **The private series, read with Cloud Vision (2026-11-23/24):** its volumes are processed in the app, driven headlessly, with Terra regions and Cloud Vision document OCR (0.15¢ a page; much better than Tesseract or Argon on Sanskrit in Kannada script). PRIVATE.md says where they are. What changed because of them (all in the public code):
  - **Vision's text** (`pipeline/vision.js`): spaces as Vision detected them; a lone "s" in an Indic line is the avagraha, "|" and "||" the dandas; words Vision is unsure of are dropped as show-through (under 0.3, or a Latin word under 0.6 in an Indic line unless it stands in parentheses, a gloss), and so is a word under 0.7 that Vision set apart in a paragraph of its own and that looks foreign to the line (a letter or two, Latin amid another script; not a number, a sign or a lone vowel letter): a page frame's sides, letters showing through. A saved reading is parsed again, free, when `VISION_PARSE` changes (now 15). A page image over Vision's 10 MB limit (a colour scan) is sent as JPEG at the same size.
  - **Lines Vision misses** (short last lines, a heading; about 1 in 600) are read alone by Tesseract in the block's script, the block left uncertain with a note; an empty piece that is a glyph fragment, the strip of a line's subscripts (thin, overlapping a line with text), or a piece over other pieces' words (straddling two lines) is not a missed line (Tesseract repeated or garbled the neighbours' text).
  - **Lines outside all regions:** a hairline (the scan's edge, a fold) is not one; Vision's text inside each tells an ornament or a rule (no letters, or read at under 0.8 confidence: a page frame read as letters) from missed text, which the check then quotes.
  - **Page breaks** (`blocks-format.js` settleBreaks, `provisional.js`): one-sided marks settled by the text between blocks of one or two types and in the notes; a quotation across the break stays as printed; both sides marked but typed differently makes the later piece the earlier's type; a figure or caption at a page's edge floats so the text around it joins. Unjoined breaks on two volumes went from 10 and 6 to 1 and 0.
  - **Contents and headings** (`heading-rules.js`): the printed contents give chapter and section levels; an imprint, numbered verses or an index are not taken for contents; a heading that recurs three times or more ("PURPORT.", a running header typed as a heading) is a label and starts no section. A page whose own heading calls it the contents is one though its page numbers were not read; a heading matches a contents title by its start or its end (a title on two lines, one lost); contents that name few of the book's headings (under two, or a quarter) are not used; where the contents are at the front, a list in the book's second half (every subheading with its page) is not; a group heading on a contents page counts only if the book prints it as a heading.
  - **Verses of a śataka edition** (`verses.js`, for the Bhartṛhari site): a verse's number is read in the printed forms Cloud Vision gives ("।। ३५ ।।", "…।६", "… ११", before a colophon "इति …"); a verse whose number was not read takes the one its neighbours leave; a verse quoted with its anthology's number among the notes is no verse of the text; only a heading that says "śataka" changes the śataka. `private/tools/gopinath-csv-check.mjs` compares an edition's verses with the site's alignment CSV page by page (Gopinath 1914: every verse so far on its CSV page, in order).
  - **Printed page numbers** misread (a stray digit, "8137" for 137; one digit for another; one dropped; an odd printed form), or not read at all where the page has a number block, are settled by neighbours that agree on both sides, what was printed kept as `label_as_printed`; furniture is not listed as uncertain text.
  - **Note markers** Vision reads as a number standing apart become markers `[n]` when a note on the page has that number.
  - **Silent failures fixed:** a page with a no-ink region never got its reading applied (`sourceRegions`); a Cloud Vision OAuth credential check now survives the hourly token; page images are cached only while half the browser's quota stays free.
  - **Floats in assembly:** a figure or caption at a page's edge is looked past by the open marks, `assemble.js`/`book.py` and the document check.
  - **Printer's signature marks** in the margin ask for no type.
- **The app** (`webapp/`, about 15,000 lines of JavaScript, no build step) has tabs Pages · Read · Export, with Settings for models, credentials and types. `webapp/README.md` describes every screen; `schema/README.md` describes the format (draft 0.3). Recent changes:
  - **One page editor** at `#page&p=<id>`, the same from every stage. Old `#regions&p=`, `#text&p=` and `#read&p=` addresses open it. It edits text, regions (type, box, draw, split, merge, order, delete), units, joins and note links. It shows the page's flags, and a Page menu offers review with AI, no content, find regions again, and read again. A region with no line piece takes text when clicked.
  - **Research tools are out of the app.** The region-finder and transcription-model comparisons, type surveys and the Proposed types box were removed (the `methods/` folders keep their code and results). Settings keeps the region finder, transcription model, OCR language pack (under Advanced) and Book types. A region the default finder (097) could not type carries `proposed_type`, and the page editor's check list offers "Add type X", "Review area" and "Leave out" for it.
  - **Pages screen:** the processing box is one line ("All pages processed · Process again…") unless pages wait or a run goes; each card shows one state (Checked, N to check, Not processed); "Next page to check" is in the page editor's check box; the header says "Saved in this browser" or "Saved to <file>".
  - **Reading-order warnings** name the first pair of region IDs that the reader and the saved box order put in different positions.
  - **One review status per page.** Pages and the blocks editor show unchecked, checked or suggestion waiting on material to review. Dismiss or restore scan artifacts from the page's checks. Uncertain transcription is shown on the affected block. The existing layer records carry compatibility and overwrite protection for stored books.
  - **Stage gates retired.** Process pages finds regions and reads text. Read is available as soon as text is saved. Review marks still protect the work from model replacement.
  - **One blocks editor and book reader.** The editor displays the scan, blocks and checks. The reader and exports use saved structure where present, with rule-derived grouping on ungrouped runs. Existing addresses reach the new views.
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
- **Tests:** `node --test $(ls webapp/test/*.test.mjs | grep -v page-joins)` (360 pass), then `node --test webapp/test/page-joins.test.mjs` on its own (17 pass). Its Python reference helper sometimes hangs waiting for input in a parallel run; `pkill -f py_reference.py` and rerun it alone. Also `UV_NO_SYNC=1 uv run --offline python schema/test_book.py` (19 pass).
- **Running:**
  - A loopback server, `python3 -m http.server 8765 --bind 127.0.0.1`, runs from the repository root.
  - `tailscale serve --https=8765 http://127.0.0.1:8765` makes it reachable from the user's other devices; the address is in PRIVATE.md.
  - Open a book with `?book=../outputs/books/<file>.chaya.pdf`.
- **Examples hosting:** the release-fetch deployment was reverted in `262390ed`. Use the separate examples repository when requested. Ask the user before pushing.

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
- five processing views;
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
| Review states | One visible status per page. Existing layer records still protect the saved regions, text and units. |
| Type-list revision machinery | Shrink to a short editable list (name, plain description, how it reads); a rename just applies |
| Model profiles, finder and reader comparisons, surveys | Removed from the app (done); the product uses one recipe |

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
5. **Three tabs:** Pages (progress, flags, runs), Read (Book view and the editor), Export.

## What to do next, in order

Each task is sized for one session. Finish, test and commit one before starting the next.

1. **Blocks spike (done).** The comparison works on Kale and the Rāmāyaṇa-mañjarī. See NOTEBOOK.md and the audit command there for the differences to preserve before retiring authored grouping, metadata, joins or line endings.
2. **Retire what the spike shows unneeded,** one at a time, each with tests. The duplicate reader and editor, stage gates and separate review badges are retired. The three tabs and combined Process pages action are in place. Settings holds models and types. The completion stage has left the UI, while saved structure remains readable. Keep saved grouping, numbering, labels, links, flows and line joins readable when changing how new books are stored. Stage A of the blocks storage is done (2026-11-22): `webapp/js/blocks-format.js` converts page documents to a 0.4 "blocks" form (regions plus overrides, `schema/README.md`) and back, losslessly on Kale and the Rāmāyaṇa-mañjarī (only Kale's model-made groups, numbers and labels remain as overrides); from 2026-11-23 (stage B1) the app reads every book through it (`webapp/js/reading.js`) and validates 0.4 pages (`schema.json`, `book.py`, `checkPage`), and since stage B2 (2026-11-23) it stores 0.4 pages: a book with 0.3 pages is converted when opened, each page's old structure kept under `work/pre-0.4/<page id>.json`; the page editor's structure panel edits overrides; the unit-authoring code and the unit review are gone. Read is byte-for-byte what it was before B2 on both books. Left from B2: verse and page number sequence fixing for new books lives only in the `chaya_*` tools (`webapp/js/number-rules.js`), which were written for 0.3 pages and are untested on 0.4 ones; a structure change that cuts a section stores the page's whole group tree, labels included, as one override, so a later change to the book's part labels does not reach that page; the conversion's failure path (a page left 0.3 and retried on the next open) is tested on fixtures only.
3. **The app reads like method 100 (done, 2026-11-22).** The reader "Gemini 4 Hydrogen · low thinking · whole page" sends one page image with the regions listed, is the default for new books (existing books keep theirs), estimates 1.9 cents a page, and takes markers from `[n]`; tested on saved responses only, never against the live API.
4. **The structure rules move into the app (done, 2026-11-23, stage B1).** A book's `rules` in `book.json` (`webapp/js/rules.js`, `schema/README.md` "Book rules") replace the code that tied the Rāmāyaṇa-mañjarī's settings to its book id; Settings → Structure edits them; `tools/chaya_rules.mjs` sets them (the Rāmāyaṇa-mañjarī has them; the file before is `outputs/books/superseded/ramayana-manjari-before-rules-2026-11-23.chaya.pdf`). Everything that assembles or reads a book goes through `toBlocks`/`fromBlocks` (`webapp/js/reading.js`), proved equal to the saved reading on both books and the fixtures. Note links and number checks have no settings of their own: same-number linking is the only rule, and number fixing still runs only for pages with no saved structure. Stage B2 is done (2026-11-24, task 2 complete): the app writes 0.4 pages (`webapp/js/upgrade.js` converts a book's 0.3 pages when it is opened and keeps their old structure in `work/pre-0.4/<page id>.json`), the page editor edits overrides (`webapp/js/structure.js`, the structure panel), and `readingProjection`/`projectBlocks` and the unit-authoring operations are gone. A changed rule now changes every page. Left: the unit review of model suggestions (`review.js`, `structure-visual.js`), assembly warnings that name generated unit ids, and verse and page number sequence fixing for new unstructured pages (only the `chaya_*` tools do it).
5. **What the sample books still show** (NOTEBOOK.md, 2026-11-23), roughly in order of value:
   - photographed two-page spreads (Ryder) are split into pages when a book is started (done 2026-11-24, README "Two-page spreads"); a book already started keeps its pages; tried end to end on four pages of Ten Princes (`outputs/books/samples/ryder-ten-princes-1927-split.chaya.pdf`, 5.8¢): each side found, read and numbered as its own page, a paragraph joined across the fold and across spreads;
   - printed lines outside every region ("Possible missed line": the Gita 18, Gopinath 22) could join the region beside them without a decision; Gopinath's are its ornamental page frame, which a Tesseract reading cannot tell from text (a Vision reading can);
   - heading levels: one heading type cannot tell a division from a chapter (Dutt) where the book prints no contents; a second heading type, proposed by the finder or set by a person, gives two levels (the size of a heading's lines does not tell them apart: on a sample, most headings are 0.9–1.1 times the body's line height, with no gap between titles and sub-headings);
   - a formula's line pieces take its text in the first piece; English verse indentation could come from the line pieces' outlines.
6. **The examples hosting:** a separate small repository with Pages enabled (the user's choice), when the user asks.

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
- **Layers:** a page document has two layers, `regions` and `text` (`source.layers`, `webapp/js/layers.js`). A layer is protected when a person has edited it or it has been accepted. Structure is not a layer: it is derived, and a person's changes to it are `overrides` on the page, which a model never writes.
- **Page documents are 0.4** (regions plus overrides). A model step writes regions and text only. Units, flows and relations are derived (`webapp/js/blocks-format.js`, `reading.js`) from the regions, the book's rules and the overrides; a book with 0.3 pages is converted when opened.
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
