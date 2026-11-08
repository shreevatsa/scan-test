# Scanned books, source-aware: session handoff

Updated 2026-11-07 UTC. "Current state" below is the summary to start from. The later sections are earlier notes, kept for reference; where they differ from it, "Current state" wins. NOTEBOOK.md has every test, in order.

## Current state (2026-11-07)

**Goal (unchanged):**
- turn a book's PDF into a digital book whose every unit (paragraph, verse, saying, footnote…) links to its page regions;
- do it in a statically hosted web app that uses the user's own API keys.

**Two pipelines into page documents:**
- **scans** (model calls), as the app's Make pages runs them:
  1. method 042: page regions, with GPT-6.1 Terra;
  2. method 043: the local step (ink lines, outlines);
  3. method 055: transcription with formatting, with Gemini 4 Argon, writing schema 0.2;

  Earlier book runs: Kale (method 052) and Telang (methods 052 and 054);
- **digital PDFs** (no model calls):
  1. method 058: our Nudi/Baraha converter, `nudi.py`, which reads the PDF's legacy-encoded text;
  2. method 062: units from the typography, with figures and ornaments, columns, hidden text left out, and styles. Method 062 supersedes 059, 060 and 061.

  The vachana book (252 pages, 1,286 units, all valid) is made this way. Its type list (`schema/types/vachana.json`) was written by Claude and is not yet reviewed by the user.

**Schema (draft 0.3):**
- 0.2's line pieces, spans, note markers and relations;
- optional styles (a per-book style sheet, and `style` on units and line pieces, presentation only), with rows for side-by-side units;
- figures: a region class with no line pieces;
- type lists: one per book in `schema/types/`, written by hand so far. 0.1 and 0.2 documents stay valid.

**The web app (`webapp/`, README there):**
- **modes:** Read (as printed, with rows side by side) · Edit book (Types, Style sheet, Problems, Make pages) · Edit pages · Export (book JSON, text, a web page as printed, a .chaya.pdf, the source PDF);
- **input:** PDFs only;
- **storage:** books are kept in the browser's private file system, with autosave, and saved as one file, a `.chaya.pdf`. That is the original PDF's bytes, unchanged, plus one update attaching `chaya.json` with the book's data; the original is recoverable exactly. Pages are drawn from the PDF;
- **published books** open by URL, read only;
- **editing:** split at the caret, move text to a column, make a unit page furniture, unit styles, the style sheet editor;
- **tests:** `node --test webapp/test/*.test.mjs` (57) and `uv run --offline python schema/test_book.py`.

**Running:**
- `uv run --offline python -m http.server 8765 --bind 127.0.0.1` from the repository root, then http://127.0.0.1:8765/webapp/;
- in this session the same server was also bound to the Tailscale address (100.115.7.63:8765) for the user's other machine. Over plain http to a non-local name the browser gives no secure context, so the app only opens `.chaya.pdf` files read only there;
- `tailscale serve --bg 8765` (HTTPS within the tailnet) would give the full app. It changes the user's Tailscale settings, so it is not done without the user's go-ahead.

**Books ready to open** (`outputs/books/`):
- `vachana.chaya.pdf` (1.6 MB), `kale-1913.chaya.pdf` (15.6 MB) and `telang-dli.chaya.pdf` (67 MB), made with `webapp/tools/make_chaya_pdf.mjs`;
- their folders;
- the earlier vachana folders (`vachana-059`, `-060`, `-061`), and `superseded/`.

**The user's decisions, by date:**
- **2026-11-04:**
  - source-aware and structure-aware from the start;
  - book-specific type lists;
  - spreads may be split; unreadable scans need not be handled;
- **2026-11-06:**
  - the GPL knconverter was for testing only; the app needs our own converter;
  - illustrations are kept (the schema accounts for them);
- **2026-11-07:**
  - unlabelled pictures (ornaments) are page furniture by default;
  - styling is kept separate from the semantic structure;
  - modes Read · Edit book · Edit pages · Export;
  - PDF is the only input (page images go through img2pdf first);
  - the book is kept inside its PDF (`.chaya.pdf`): append-only saving is not required, but the original PDF must be recoverable.

**Open, roughly in order:**
1. **Committing** (done 2026-11-07, the user's option (a); NOTEBOOK, "Committing: what goes into git"):
   - the source and the irreplaceable results are committed. Regenerable binaries are left out by `.gitignore`: page images and crops, requests that embed images, book folders and `.chaya.pdf` files;
   - the private book ("vachana", methods 056–062) is kept out completely: rules in `.git/info/exclude`, where its files are in `PRIVATE.md` (both local only);
   - **open:** the public books' `.chaya.pdf` files (Kale, Telang) could go on a GitHub Release; the private one never;
   - committed to `main` (e810f45, 18,813 files) and pushed; later work also goes straight to `main`, as the user prefers.
2. **The text-layer path in the app:**
   - port `nudi.py` and method 062's rules to JavaScript;
   - recognize legacy-encoded fonts;
   - infer the font roles and the typography profile, which are written per book now;
   - use scanned PDFs' hidden OCR text layers (Kale's has one) as a free first reading or check.
3. **Type lists:** draft one from a few sample pages with one model call; edit them in the app (with care: removing or renaming a type invalidates page documents); the user's review of the vachana list.
4. **vachana:** line joins are about 87% right; a cheap text-only pass could fix the rest. The ornaments have no labels.
5. **Output:** a LaTeX or Typst export from the styles; bundled web fonts (Noto Serif and Sans Kannada); contents entries' page numbers flush right.
6. **Smaller items:**
   - Safari's fallback for saving into browser storage is untested;
   - Telang's 27 flattened pages are drawn unflattened;
   - retries of invalid pages, preprocessing (flatten, rotate), and interruptions below a flow's top level, as listed in `webapp/README.md` under "Not yet".

**Where the evidence is:**
- NOTEBOOK.md (every test, newest last);
- `methods/NNN-*/README.md`;
- `outputs/surveys/<method>/<run>/`;
- `outputs/<page id>/<method>/<run>/`.

The conventions at the end of this file still hold: method ids, immutable runs, NOTEBOOK entries, `uv run --offline`, and keys never printed.

## Earlier notes (2026-11-04 to 2026-11-06)

The earlier handoff, as it was last updated:

Updated 2026-11-05 UTC, after the cross-book test (Terra 025 and method 033 on 43 more pages from seven books), method 035, the user's review of the six new references (version 2 of four of them, with re-evaluation), method 036, the explicit-unit prompt (methods 037 and 038), the band-chained line finder (method 039), a held-out test on 54 fresh pages from ten books, a continuation test on seven four-page runs (methods 040 and 041), the user's review of the continuation truth, a first draft of the book schema (`schema/`) and the user's answers on it, methods 042 and 043 (region types generated from the book's type list), type lists for all ten books, tested with them and accepted by the user, transcription methods 044–047 (second call, single call, neighbor context, whole-book runs), a Kale full-book walk, and a test of whether a second reading catches transcription errors. Repository: `/Users/shreevatsa/w/scan-test`. Starting revision: `3c04e63` (`Try more methods`). The user committed the work in progress as `4013d31` (`Everything`) and, on 2026-11-05 at 14:41 UTC, `f67b3cd` (`more stuff`); it holds the Ten Princes type list and outputs but not their NOTEBOOK entry. Everything after that is uncommitted: the Ten Princes NOTEBOOK entry, the Nītiśataka, Vavilla and Gita type lists, methods 044–047, the transcription references, the extended Kale type list, the Kale page renders and all their outputs and records. All experiments below are complete.

## Goal

The ultimate goal is to turn scanned books into digital equivalents in which every paragraph, verse, footnote or other unit is traceable to its page region. The approach should work for a wide range of books. Kale (1913) is the first test case, and nothing should be tuned to it alone.

The end product is a web app, ideally statically hosted. It calls models with keys the user provides, and runs the processing before and after those calls in the user's browser. Think of it as source-aware OCR: for each paragraph or verse, a reader can go back and see the original on the page. The web app is being built in a separate session and worktree. This repository investigates which page regions can be produced automatically, so local processing here should stay portable to the browser: thresholding, connected components, histograms, sorting and polygon construction, without heavy libraries.

The two ideas that set the project apart, as the user put it on 2026-11-04:
- **Source-aware:** every transcribed passage links back to its page regions and polygons.
- **Structure-aware from the start:** pages are divided into structural units (headings, verses, footnotes…) before or while transcribing, rather than OCR first and structuring the raw text in a later pass.

The user's planned sequence, stated on 2026-11-04; the later steps may happen in other sessions:
1. **Regions:** automatic page regions, the current work.
2. **Transcription:** a method that goes all the way to a digitized book, with schema-aware transcription linked back to the page regions and polygons. The schema covers paragraphs, verses, footnotes, commentary and so on.
3. **Web app:** the statically hosted app, in which a user generates, edits and views such books, for example in a side-by-side view where the polygons, their classification or the transcription can be edited.

Scope guidance from the user:
- Two-page spreads are common in scans. Splitting them into single pages first is fine if handling two columns is a burden.
- Really unreadably bad scans need not be handled.

## Current decision

The user selected these two methods as the current shortlist:

- [025 — GPT-6.1 Terra, reasoning disabled](methods/025-gpt-6.1-terra-none-footnotes/README.md): `gpt-6.1-terra`, reasoning effort `none`. Main candidate for further work.
- [020 — GPT-6 Astra, low reasoning](methods/020-gpt-6-astra-low-footnotes/README.md): `gpt-6-astra`, reasoning effort `low`. Comparison reference. On pages 97 and 113 the API reported 0 reasoning tokens for Astra (49 on page 17), so on those two pages the comparison is effectively two models without reasoning.

Both use image detail `original`, the unchanged raw PNG, strict JSON Schema output, a maximum of 16,384 output tokens including reasoning, and `store=false`. They share the same prompt, which asks for one region per numbered footnote, and x/y coordinates normalized to 0–1000.

Their passage grouping is right on all three tested pages: whole multi-line verses, separate commentary and lead-ins, individual footnotes, and excluded running headers and page numbers. Exact crop boundaries remain the problem.

Exact crop boundaries are now computed locally. [Method 033](methods/033-gpt-6.1-terra-none-line-polygons/README.md) keeps Terra 025's grouping and replaces its rectangles with ink-derived polygons; [method 034](methods/034-gpt-6-astra-low-line-polygons/README.md) does the same for Astra 020. [Method 035](methods/035-gpt-6.1-terra-none-column-margin-ownership/README.md) is method 033 with two fixes found in the cross-book test. [Method 036](methods/036-gpt-6.1-terra-none-unlined-ink-ownership/README.md) is method 035 with two more, found through the corrected references: ink on no line joins the nearby region whose box holds it, and pieces of broken printed rules are separators. Method 036 is the current local step. [Method 037](methods/037-gpt-6.1-terra-none-explicit-units/README.md), a Terra prompt with explicit units and book-neutral types, makes grouping much more repeatable. Its finer split of apparatus entries is acceptable. The user has since confirmed method 037 + method 039 as the pipeline (below). See below.

**Current pipeline, confirmed by the user on 2026-11-05 after the continuation test:**
- **Model:** [method 040](methods/040-gpt-6.1-terra-none-explicit-units-continuations/README.md) (Terra, explicit units, book-neutral types, two continuation flags per region).
- **Local step:** [method 041](methods/041-gpt-6.1-terra-none-explicit-units-continuations-band-chained-lines/README.md) (method 039's recipe on method 040's boxes, carrying the flags into the polygon regions).
- **Book level:** method 040's `link.py`, which links consecutive regions of a stream when both flags agree.
- **Fallback:** the model's boxes where the local ink mask fails.

It replaces method 037 + method 039, confirmed on 2026-11-04 after the held-out test.

**Evidence for method 037 + 039 (held-out test):** on 54 fresh pages chosen by rule before any model saw them, prompts 025 and 037 are equally repeatable between requests (48 of 54 pages identical each). They group 43 of the 54 pages identically. Method 037 splits a little more finely (apparatus readings, source citations), which the user judged acceptable. Its types (paragraph, verse, heading, lead_in, note, list_item, formula, table) suit the transcription schema to come.

**Evidence for the switch to 040 + 041 (continuation test, below):** on the 28 run pages, grouping is as good as under 037 + 039: 0 / 0 / 0 on all seven referenced pages in both requests, with differences between the prompts of the same kind as between two requests. The flags let the linker find 11 of 13 truth links with no wrong ones. They cost about 55% more output tokens (48 against 32 per region), or about 17% more per first request ($0.0112 against $0.0096 per page).

Methods 025 and 036 remain in the repository as the earlier baseline. All their outputs are kept.

The user earlier excluded asking the model to revise existing boxes in a second call, and detection experiments so far are single-pass. On 2026-11-05 the user said that rule is not a strong one and may be ignored where a second call helps. A second call for transcription is fine, and so is that call assigning regions to larger units. Anthropic exploration was stopped earlier.

## What this session found

[Method 032](methods/032-line-skew-separability/README.md) is a local measurement method. It makes no API calls. It measures text-line angle and bow, and tests whether neighboring lines or passages can be separated by four kinds of boundary:

- tight axis-aligned rectangles;
- rectangles at the page text angle;
- a straight cut at any angle;
- a per-column staircase cut, which corresponds to polygons.

The full log is in [NOTEBOOK.md](NOTEBOOK.md), in the page sections and the new survey section.

**Page 113 is skewed, and skew explains most of its forced overlap.**

- Text lines are at −1.43°, with long-line angles from −1.69° to −1.14°. That is steeper than the rules: −1.19° for the long rule and −1.09° for the short one.
- Against the passage reference, tight axis-aligned rectangles unavoidably include 3,966 px of other passages' ink. Rectangles at the page angle include 614 px, and the best angle per passage 283 px.
- Terra 025's boxes include 3,053 px of other passages' ink, and Astra 020's include 3,930 px. That is close to the axis-aligned floor.
- Four of the five verse/commentary boundaries cannot be drawn cleanly with any axis-aligned rectangles.

**The models are not to blame for everything.**

- Verse 43 / commentary 43 is cleanly separable with axis-aligned rectangles, yet both models' commentary-43 boxes include verse-43 ink: 173 px for Terra and 337 px for Astra.
- At the other boundaries the model edges cost 1.0–4.4 times the best achievable axis-aligned edge.
- Terra's footnote-5 box includes 357 px of the long rule.

**Even page-aligned rectangles are not enough.** Verse 42 / commentary 42 and verse 44 / commentary 44 cannot be separated by any straight cut, because of marks above and below neighboring lines and slight line bending. Every line pair on the three test pages has a clear per-column gap of at least 4 px.

**Skew is uncommon; interlocking lines are common.** Across all 252 Kale pages, the median absolute text angle is 0.06°. Only 18 pages reach 0.5°, and 4 reach 1°: pages 113, 146, 58 and 246. Page 113 is the most skewed page in the book. On the 18 skewed pages, rotation cuts non-separable line pairs from 48% to 23%; elsewhere it doesn't help. Five other local scanned books (12 sampled pages each) and Cole (1903) all stay below 0.35°. Yet in most of them, 13–27% of adjacent line pairs cannot be separated by either axis-aligned or page-angle rectangles, and 11–22% cannot be separated by any straight cut. The exceptions are the two-column Dutt pages with wide leading (1.5%) and the 1914 Nītiśataka edition, whose ornament border makes its 49% unreliable. A staircase or polygon boundary separates at least 99.5% of line pairs in every book.

**Implication.** Axis-aligned rectangles, which is what the shortlisted methods return, cannot represent tight passage regions on a substantial fraction of ordinary pages, even without skew. Deskewing helps only on skewed pages. A representation that follows the inter-line whitespace generalizes: line or component ownership, with polygon or mask outlines. The model's grouping is the part worth keeping from 025/020.

**Line ownership plus polygons works on all three test pages** ([method 033](methods/033-gpt-6.1-terra-none-line-polygons/README.md) for Terra 025 boxes, [method 034](methods/034-gpt-6-astra-low-line-polygons/README.md) for Astra 020 boxes):
- **How it works.** Each detected line goes to the model box holding most of its ink. Lines shared by several narrower boxes, such as footnotes and the header line, are split by component. Regions are outlined by a nearest-ink partition clipped to a padded rectangle at the page angle, and each line gets its own outline inside its region.
- **Results.** Against the references, both give 0 pixels of other passages' ink, 0 own ink left out and 0 separator pixels on pages 17, 97 and 113. Terra's raw boxes include 3,053 px of other passages' ink on page 113, and Astra's 3,930 px. Terra and Astra boxes lead to identical ownership.
- **Caveat.** The references use the same ink mask and line finder, so on the Kale pages this checks grouping plus ownership, not the line finder. All three Kale references were reviewed by the user. Three of the later cross-book references (version 2) add hand-written rules for ink the line finder misses or misattaches, so they partly check it too. That is how the ownership step's blind spots showed up (see the cross-book findings).
- **Robustness to real boxes.** Applied to every saved box result in the repository (43 page results from 27 methods), ownership is error-free in 30 of the 32 results that group a page as the reference does. The two exceptions are Claude 015/016 on page 17. Their own footnote boxes put a numeral in the preceding note.
- **Robustness to perturbed boxes.**
  - Whole-line ownership survived every trial with independent edge errors within ±10 px (a quarter of a character height), and a common vertical shift of ±20 px.
  - It breaks when boxes are off by about a full line. Six other results on page 17 are like that, and ownership follows their boxes.
  - **Weak point: lines shared by several passages.** Their split follows the model's horizontal box edges, so horizontal shifts of 20 px or scaling by 3% misassign a few hundred pixels there.
- **Cost.** Local processing takes about 1.2 s per page in Python/OpenCV. Passage polygons take 6–10 KB of compact JSON per page, and line polygons about 40–47 KB.

**Cross-book test: the approach generalizes, with two local fixes (method 035).** Terra 025 ran single-pass, with its Kale-written prompt unchanged, on 43 more pages: nine Kale pages of other layouts and six pages each from the Telang, Vavilla, Nītiśataka 1896 and 1914 and Dutt books, plus four Cole pages. The pages were chosen systematically from the method 032 survey sample. Estimated cost was $0.36 in total, about $0.008 per page. Full record: the "Cross-book test" section of NOTEBOOK.md.
- **Grouping.** Terra's grouping matched the visible structure on every page except Telang's sideways table, by inspection of all 43 overlays:
  - Kale's contents page, translations and notes;
  - verses, commentary, metre lines and lead-ins;
  - Hindi and English translations;
  - each variant-reading entry and note item;
  - Dutt's interleaved half-verses and paragraphs in two columns, with column-wise reading order;
  - Cole's prose blocks, displayed formulas and footnotes.

  On six new references (one per book, proposed by Claude, written before any output was viewed), it matched at the finest unit: no merges and no missing passages. The only difference was Cole's running header returned as two regions. Types are Kale's vocabulary, so prose is "commentary" and translations are "commentary" or "verse".
- **Ownership.** Method 033 polygons gave 0 other-passage ink, 0 own ink left out and 0 separator pixels on all six new references as first proposed, against up to 613 / 541 px for the raw boxes. The user's review then found that version 1 of three references inherited the line finder's blind spots: ink on no line was unlabeled, and frame or rule pieces attached to text lines were labeled as text. Against the corrected version 2, methods 033 and 035 give identical results, and two pages show errors that version 1 hid:
  - **Cole page 3:** 208 px of a ≡ sign on no line fall outside display-4's outline, and 314 px of footnote-rule pieces fall inside two regions.
  - **Nītiśataka 1914, page 258:** the outline misses 137 px, the tail of a merged word that is on no line.

  The ownership image leaves all ink on no line unassigned: 803, 174 and 8,664 px on the three revised pages, the last being a whole word. Raw boxes did better against version 2 than version 1 suggested.

  [Method 036](methods/036-gpt-6.1-terra-none-unlined-ink-ownership/README.md) fixes both.
  - **Ink on no line:** a text component on no line joins the region whose box holds it and whose ink is within 2 character heights, chaining if needed.
  - **Rule pieces:** thin pieces that continue a printed rule's rule-like rows become separators.

  Results:
  - **References:** 0 / 0 / 0 on all nine references for both Terra requests. The ownership check is 0 except Cole's split header.
  - **Robustness:** never worse than 035, either in the 153 perturbation conditions (107 identical, 46 better) or on the 49 saved box results (46 identical, 3 better).
  - **How it was checked:** every component it attaches or reclassifies on the 46 pages was looked at in development. Two false rule pieces, on Kale pages 58 and 113, led to the rule-like-rows test before any output was written.

  Two failures appeared on pages without references:
  - On one Dutt page the line finder did not separate the columns, so 033 gave whole lines across both columns to one region, and 19 of 31 regions owned ink in the other column.
  - On framed pages, frame pieces attached to text lines linked scanner-edge marks to regions.

  [Method 035](methods/035-gpt-6.1-terra-none-column-margin-ownership/README.md) fixes both:
  - **Side-by-side reassignment:** a component wholly beside its box moves to a horizontally separate box that holds it.
  - **In-box isolation:** for a component beyond the outermost edge of all boxes, the isolation test measures distance only to line ink that some box holds.

  The isolation change applies only to components beyond the outermost box edge. A first version that applied it on every line hurt robustness, and was replaced before any result was recorded. Method 035 changes ownership on six of 46 pages only, and matches 033 exactly on all nine references. Cross-column ink on the Dutt page fell to 15 px. In the perturbation sweep it matches 033 in 149 of 153 page–condition pairs; the four differences come where both fail.
- **Single-pass grouping is mostly repeatable.** A second Terra request per page cost $0.10 for all 43, because the provider's prompt cache served the image. Ownership and keep flags came out identical on 35 of 43 pages, and on the six new references both passes match at the finest unit. The differences are in granularity:
  - Kale's contents page: 28 regions against 6;
  - one Dutt page: consecutive verses grouped into blocks, 37 regions against 25;
  - one Nītiśataka page: three note items joined;
  - small splits elsewhere;
  - plus one keep flag on a signature mark.

  Reading order of matched regions never changed.
- **An explicit-unit prompt removes most of that variation, with one new failure.** [Method 037](methods/037-gpt-6.1-terra-none-explicit-units/README.md) is Terra 025 with a prompt that defines the unit ("the finest unit that the page sets apart visually") and book-neutral types: verse, paragraph, heading, lead_in, list_item, formula, note, table, figure, caption, and furniture. [Method 038](methods/038-gpt-6.1-terra-none-explicit-units-line-polygons/README.md) applies method 036 to its boxes. It was tested on 46 pages with two requests each, for $0.52.
  - **Stability:** on 43 pages the mean ink agreement between requests rose from 0.972 to 0.998, and the worst page from 0.204 to 0.962. Kale contents now gives 28 / 28 regions and Dutt 13F 37 / 37.
  - **Corrections:** Dutt blocks that ran from the end of one verse into the next are split at the verse number.
  - **References:** eight of nine still give 0 / 0 / 0.
  - **Finer apparatus and citations:** apparatus entries in Telang are split into individual readings and line pieces (12 → 18 regions on page 79), and in one request, source citations after quoted verses in Nītiśataka notes. The user judged that either granularity is fine for the apparatus. The pieces hold only their own passage's ink and are in reading order, so nothing is lost.
    - The evaluation still charges such a split as own ink left out: 6,714 px on the Telang 108 reference. It should report a split into regions that hold only one passage's ink, consecutive in reading order, as a grouping difference, as it already does for merges.
  - **Status:** method 037 looks like an improvement over 025. Its rules were written from the test pages' own variation, so confirm it on fresh pages before making it the pinned source (next experiment 1).
- **Still weak:**
  - frame and ornament pieces next to text are owned by text regions, so outlines bulge into borders;
  - rotated text (Telang's sideways table) is not handled;
  - outlines next to short lines are spiky in empty space;
  - ink on no line that no model box holds stays unassigned (method 036 attaches it only when a box holds it);
  - a speck inside a box next to text is attached, so ownership can differ by a few pixels between requests (Telang page 108).
  - margin furniture such as line numbers: when the model omits a region for it, ownership gives each numeral to the text line it sits on (Hertel page 152, one request: 2,303 px);
  - unevenly lit photographs (the Ryder Gita spreads): the global ink threshold masks most of the page, so only the model's boxes are usable. The app needs a mask-failure check (for example, more than about a third of the page masked) and a fallback to model boxes; an adaptive threshold could rescue such pages.

- **Short glyphs on the wrong line (fixed in method 039).** The user found "sarvasvam" on Nītiśataka 1914 page 119 split between a note and the paragraph below.
  - **Cause:** the line finder put short glyphs before a line's first normal-height glyph onto the next line.
  - **Fix:** method 039 chains such glyphs into the line whose band they sit in.
  - **References:** the fix also exposed a reference error. The closing quote of note (b) on Nītiśataka 1896 page 123 was labeled with note (a), inherited from the old line finder, and reference version 3 corrects it.
  - **Fresh pages:** it rejoins "genius." and "follows :--".
  - **Results:** method 039 scores 0 / 0 / 0 on all nine earlier references and is no less robust than 038 in the sweep, except one condition where both fail.
- **Held-out test (54 fresh pages, ten books, $1.13 for 216 requests).**
  - **Four new references**, reviewed and confirmed by the user, as was 1896 version 3: Hertel 152, Ten Princes 30, Kale 106 and Dutt 17F 001. On three of them, every local method scores 0 / 0 / 0 for both prompts and both requests, with no merges or misses. On Hertel 152, method 037's first request omitted the margin line numbers (2,303 px in text regions); every other result is clean apart from grouping differences in furniture.
  - **Prompts:** equally repeatable; see the recommended pipeline above.
  - **Spreads:** two-page spreads are not a problem when evenly lit. On Ten Princes, the line finder treats the pages as two columns and Terra groups each page correctly, so splitting spreads is optional. It may still be cleaner for the app, with one image per printed page.
  - **Hertel:** handled well (prose blocks, verses, lead-ins, story headings, footnotes). The weak spots are the margin line numbers and a margin bracket.

## Where the evidence is

| PDF page / 252 | Raw input | Dimensions at 300 dpi | Returned structure, methods 020 and 025 | Text angle, method 032 |
| --- | --- | --- | --- | ---: |
| 17 | [kale-1913-page-017.png](inputs/kale-1913-page-017.png) | 1407 × 2135 | 2 verse, 2 commentary, 2 lead-in, 6 footnote, header, page number | −0.05° |
| 97 | [kale-1913-page-097.png](inputs/kale-1913-page-097.png) | 1374 × 2114 | 2 verse, 2 commentary, 1 lead-in, 6 footnote, header, page number | −0.57° |
| 113 | [kale-1913-page-113.png](inputs/kale-1913-page-113.png) | 1370 × 2118 | 3 verse, 3 commentary, 6 footnote, header, page number | −1.43° |

Each input has a matching JSON provenance record. The original PDF is `Kale-1913-pp21-272.pdf` in the project root, SHA-256 `ccabe9850493a8e5d6ecd61660407933f757481cb892985b007e6ff222d9f3b0`. [inputs/README.md](inputs/README.md) has reproduction commands; the page-17 command was checked to reproduce the saved PNG byte for byte.

Results live under `outputs/<input_id>/<method_id>/`. Methods 033 and 034 add `regions.json`, `ownership.png`, `overlay.png` and `lines.png` per page. Method 033 also adds `reference-evaluation/` per page, with [the page-113 verse 42 / commentary 42 boundary](outputs/kale-1913-page-113/033-gpt-6.1-terra-none-line-polygons/reference-evaluation/boundary-verse-42--commentary-42.png) comparing all four results, and `outputs/surveys/033-gpt-6.1-terra-none-line-polygons/robustness.json`. Method 032 adds:

- `lines.json` and `lines.png` for each test page;
- `outputs/kale-1913-page-113/032-line-skew-separability/passage-boundaries/`, with [representations.png](outputs/kale-1913-page-113/032-line-skew-separability/passage-boundaries/representations.png) and [the verse 42 / commentary 42 boundary](outputs/kale-1913-page-113/032-line-skew-separability/passage-boundaries/boundary-verse-42--commentary-42.png);
- `outputs/surveys/032-line-skew-separability/`, with per-book page records, contact sheets and `summary.json`.

The first passage reference is [references/kale-1913-page-113](references/kale-1913-page-113/README.md). It is a component-level label image. Claude chose which method 032 lines belong to which passage, plus the split points on the header and footnote lines; `reference.py` then labeled every ink component by its line. No model API was involved. The user reviewed `review.png` on 2026-11-04 and confirmed every label is correct. [references/kale-1913-page-017](references/kale-1913-page-017/README.md) and [references/kale-1913-page-097](references/kale-1913-page-097/README.md) were made the same way before any method 033/034 output existed for those pages, and the user reviewed them on 2026-11-04. They leave scanner-edge marks and a smudge unlabeled, which needed a small extension of the builder (`reference.py` in method 033). Six more references, one per other book, were proposed, and the user reviewed them on 2026-11-04.
- **Dutt 14F 225:** the labels were correct, but the review image was hard to read.
- **Three corrected:** the 1896 and 1914 Nītiśataka pages and Cole page 3 each had an error.
- **Version 2:** the four pages above now have one, built by method 035's `reference.py`. That builder adds component rules: a box that labels the components wholly inside it. Its review images label right-column passages on the right. Version 1 files are kept in `version-1/` in each folder, and each folder has a README.
- **Evaluations:** those against version 2 are in `reference-evaluation-version-2/` beside the version 1 evaluations, and in `outputs/surveys/035-gpt-6.1-terra-none-column-margin-ownership/references-version-2/`.
- **Confirmed:** the user then confirmed version 2 of the three corrected references, and version 1 of `references/telang-dli-page-108` and `vavilla-page-034`. **All nine references are now reviewed.**
- **Stale status text:** the `status` text inside the specs predates these reviews; each folder's README records the review.

The 43 cross-book inputs are listed in `inputs/pages.json` and rendered by `inputs/render_pages.py`, with a provenance record per page. Cross-page summaries and overlay contact sheets are in `outputs/surveys/033-gpt-6.1-terra-none-line-polygons/`, `outputs/surveys/035-gpt-6.1-terra-none-column-margin-ownership/` and `outputs/surveys/036-gpt-6.1-terra-none-unlined-ink-ownership/`. Method 036 outputs, with `reference-evaluation/` on the nine referenced pages, are under `outputs/<input>/036-gpt-6.1-terra-none-unlined-ink-ownership/` and its `run-002/`.

The survey reads local PDFs outside the repository:

- `~/w/bhartrhari/data/images/`: the Telang DLI scan, the Vavilla edition, and two Google Books editions of the Nītiśataka.
- `~/w/mahabharata-dutt/pdfs/`
- `~/w/pages/docs/cole-factor/`

Their SHA-256 hashes are recorded in the survey summary.

| Page | Terra 025 estimated API cost | Terra API time | Astra 020 estimated API cost | Astra API time |
| --- | ---: | ---: | ---: | ---: |
| 17 | $0.00720925 | 8.36 s | $0.0746425 | 11.36 s |
| 97 | $0.00694925 | 8.83 s | $0.0694925 | 9.71 s |
| 113 | $0.00710425 | 7.00 s | $0.0710425 | 11.94 s |

These per-request estimates come from recorded usage and the pricing snapshot checked on 2026-11-03, including default 30-minute cache writes. All six shortlisted runs reported zero cache-read tokens. This session made 486 API calls, all Terra:
- **Method 025:** 86 calls on the 43 cross-book pages, two requests per page, estimated $0.3627 for the first pass and $0.0966 for the repeat. The repeat read the image from the prompt cache.
- **Method 037:** 92 calls on 46 pages, $0.4039 and $0.1112.
- **Held-out test:** 216 calls on 54 fresh pages, methods 025 and 037 with two requests each, $1.1341.
- **Continuation test:** 92 calls, method 040 on 28 run pages ($0.3127 and $0.1190) and method 037 on the 18 new ones ($0.1689 and $0.0474), two requests each.

The total is about $2.76.

## Earlier local refinements

- Methods 026/027 complete connected components and pad saved Argon/Flash boxes. On page 97 they took in parts of the slanted separator.
- Methods 030/031 add separator handling. They exclude detected separator pixels on all three pages, and on page 97 they have zero audited cuts and overlaps. On pages 17 and 113, padding expands into neighboring text at existing overlaps. Method 032's results explain why: those overlaps cannot be removed by moving rectangle edges.

## What the web app should retain (current thinking)

- **Store polygons, not ink.** The ink mask is the means of computing a region, not the thing to keep: it depends on thresholds and is bulky, and it can be recomputed from the page image. A polygon outline in original-page pixels is small, can be drawn over the page as SVG or used as a clip path for a crop, and includes rectangles as the four-point case. The web app can therefore start with model rectangles and switch to computed polygons later without a format change.
- **Keep lines inside regions.** Each passage region can list its text lines, each with its own polygon. This allows later line-level linking between text and image. It mirrors PAGE-XML (`TextRegion` → `TextLine`, each with `Coords`), which makes export to PAGE-XML, or to W3C Web Annotation / IIIF with SVG selectors, straightforward.
- **Keep provenance.** Store the model's original box and grouping alongside the computed geometry.
- **A candidate format.** Method 033's `regions.json` has, per model region:
  - the model's fields unchanged (type, keep, reading order, uncertainty and original box);
  - `polygons`, the outer rings in page pixel indices; add 0.5 for SVG;
  - `bounds`;
  - `lines`, each with its own polygons and a flag for lines shared with other regions.

  It also records a decision per line and an audit.
- **How much rectangles hurt.** On unskewed Kale pages, most rectangle conflicts are a few ascender or descender tips: only 5.0% of line pairs have conflicts larger than a quarter character-height square. Rectangles are cosmetically imperfect but usually point at the right place. On skewed pages they are much worse: on Kale's 18 pages at 0.5° or more, 22.2% of line pairs have conflicts that large.
- **Division of labor.** The model provides grouping, types and reading order (and later text). Browser-side code provides exact geometry. A further variant is for the model to name detected lines instead of returning coordinates; this would remove the dependence on model coordinate accuracy.
- **Risk.** Ink-based geometry depends on binarization. Bleed-through, stains, handwriting and figures can attach stray ink to lines, as the 1914 Nītiśataka border did. The app needs a fallback to the model box where local analysis and the model disagree.


**Continuation test (2026-11-04/05): methods 040 and 041.** See "Continuation flags" in NOTEBOOK.md.
- **Setup:**
  - **Prompt:** method 040 is method 037's prompt with `continues_from_earlier` and `continues_later` per region.
  - **Linker:** `link.py`, local, pairs each region with the next region of its stream (notes, or body) on the same or the next page. It links them if both flags agree.
  - **Truth:** [references/continuations/](references/continuations/README.md), with 103 page and column edges and 13 links on seven four-page runs, written before any output was opened. The user reviewed it on 2026-11-05 through the truth-only review images `references/continuations/review-<run>.png`: every answer is right for regions.
- **Flags:** 95 and 94 of 103 edges are correct, against 68 for flags that are always false.
- **Links:** 11 of 13 truth links in each request, with no wrong links. That is every body link, including left-to-right page continuations inside the Ten Princes spreads.
- **Misses:** the two links through Telang's critical apparatus. The model never flags the last apparatus entry on a page as continuing.
- **False flags:** five, all on a page's first region and the same five in both requests. None became a wrong link, because both flags must agree:
  - two commentaries after a verse on the previous page (Kale);
  - one plain error (a new verse in Nītiśataka 1914);
  - two judgment calls, a sentence running from verse 25 into verse 26 (Dutt) and prose resuming after a quoted verse (Hertel);
  - **after the user's review:** the four Kale, Dutt and Hertel cases are nesting. The region starts on the new page, and a larger unit around it continues (below).
- **Grouping:** unchanged in quality through method 041, as described under the proposed change above.

## Suggested next experiments

1. **Toward transcription (the user's step 2).**
   - **Schema: drafted on 2026-11-05 at the user's request; the user answered its three open questions the same day (below).** See [schema/README.md](schema/README.md).
     - **Structure:** regions with polygons, line pieces and per-line text; a tree of units with book-specific types over the regions; flows such as main text and notes; furniture attached to pages; relations for footnote markers and the like.
     - **Continuation is derived:** a unit continues across a page break when its regions lie on both pages. Each page document marks units open at its top or bottom, and `schema/book.py assemble` joins them level by level.
     - **Type lists:** Hertel, Kale 1913 and Dutt (`schema/types/`).
     - **Worked examples:** method 041 regions on Hertel 152–153, Kale 107–109 and Dutt 2–3, with hand-written unit trees (`schema/examples/`). They validate, assemble and print. All model region classes match their book types' classes.
     - **Tests:** `schema/test_book.py`.
     - **The user's decisions on the draft (2026-11-05):**
       - the Dutt page 2 translation of verse 15 ends "…duties of the Kshatriya sect; and," and the sentence seems to go on in the next group's translation. The user called it an oddity of this instance, not to be handled: the unit ends with "and,". The `sentence_continues` relation was dropped, and Dutt keeps groups rather than a separate translation flow;
       - Hertel inner tales stay children of the frame story (the simpler option), not of the introducing paragraph;
       - Dutt speaker lines stay where printed. On page 2, संजय उवाच and Sanjaya said stand one unit too early, above verse 13, which is still Dhṛtarāṣṭra's question. The user called this a mistake in the text, not something to complicate the schema for.
     - **The user's answers on the remaining open items (2026-11-05):** type lists for the other seven books one book at a time, written by Claude for the user's review; who speaks in a Hertel paragraph is not recorded (it is just a paragraph); spreads as drafted; in the app, a model proposes a book's type list and the user reviews it. After Claude explained the editing question (how the app stores a user's corrections), the user chose to keep it simple: the model's page document stays unchanged and the user's corrected version is saved beside it, with no history.
     - **The user's review of the Telang draft (2026-11-05):** accepted. The apparatus stays a separate flow, linked to stanzas by number later; साहंकारं पुरुषमुद्दिश्याह । is a lead-in. The books have title and contents pages, not yet covered by any type list; later, Claude is to go over one full book (Kale and Telang first) to see what a whole book looks like. The user also said that API spending is not a hard limit.
   - **Method 042 + 043: done on 2026-11-05 at the user's request, not yet reviewed by the user.** [Method 042](methods/042-gpt-6.1-terra-none-book-types-continuations/README.md) is method 040 with the prompt's types and the schema's type enum generated from the book's type list (`prompt.py`); [method 043](methods/043-gpt-6.1-terra-none-book-types-continuations-band-chained-lines/README.md) is method 041's local step on its boxes. Two requests on the 12 run pages of Kale, Hertel and Dutt (NOTEBOOK, "Book types from the type list"):
     - **book types:** 139 of 139 regions of the hand-written example trees typed as in the tree, in both requests;
     - **grouping:** 0 / 0 / 0 on the three referenced pages; the differences from method 041 all follow the type lists (Kale 108 footnote 3 as one region, Hertel margin line numbers found on pages 154–155, Hertel header as one region, Dutt page 1's three-line chapter heading as one region);
     - **flags:** 36 of 40 truth edges in each request, as under method 040, and 3 of 3 links with none wrong. Dutt verse 26 is no longer wrongly flagged; Kale's commentary at the top of pages 108–109 still is; one new wrong flag at the foot of Hertel 153. Hertel's paragraphs are now flagged on both sides of each quoted verse, as the type list asks, so the consecutive-region linker no longer fits Hertel; the transcription call's unit tree should do the joining;
     - **cost and latency:** about 2.5% more than method 040 ($0.0138 against $0.0134 per page, first request); median API time 12.7 s against 12.4 s.
     - **Telang, with Claude's draft type list:** one apparatus_entry region per entry, identical in both requests (method 040: 3 to 23 note regions per page, unstable). 043 ownership identical between requests on all 4 run pages (041: none). Telang 108 reference 0 / 0 / 0 with no split entry. Flags 14 of 15 (040: 12 and 11); 3 of 4 links with none wrong (040: 2), including the 109 → 110 apparatus link; the entry at the foot of page 108 is still not flagged.
     - **Cole, with Claude's draft type list (2026-11-05; the user then found the recommendations "fine overall" and said not to worry much about the journal case for now):** article and numbered section as containers; heading, byline, read_before, paragraph (may contain formulas), formula, signoff and footnote as region types. Both requests return the same regions, types and flags on all 4 pages. The running header is one region (methods 040/041: two on every page), the article heads and signoffs get their own types (041's varied between requests), and the "and" between two formulas is a paragraph region. Cole page 3 reference 0 / 0 / 0. Flags 16 of 16 and both links, as under method 040. $0.067 for both requests.
     - **The other five books, with Claude's draft type lists (2026-11-05, after the user said "Go ahead to the other books"; the user then accepted all five as drafted, "Yes all this sounds good. Go ahead"):** Ten Princes, Nītiśataka 1896 and 1914, Vavilla, the Gita (`schema/types/`; NOTEBOOK has one entry per book). Two requests on every input page of each book, 54 pages in all, $0.64:
       - **references:** 0 / 0 / 0 on all four referenced pages in both requests;
       - **stability:** same regions, types and flags in both requests on 50 of 54 pages (the differences are flags only); 043 ownership identical on 51 of 54, at least 0.997 on the rest;
       - **grouping against method 039:** the differences follow the lists. Ten Princes' chapter number and title are one heading. Each below-rule Nītiśataka note is one region, where 039 split some parallels into lead-in, verse and note. Vavilla's commentary keeps its line before a quotation;
       - **flags:** Ten Princes 16 of 16 and 4 of 4 links (as 040); Nītiśataka 1914 control 16 and 15 of 16 (040: 15 and 15). By inspection, a probable missed continuation on Gita spread 11 (right page flush left after a full stop);
       - **1896 list revised once:** it first lacked hindi_gloss, and page 195's glosses came back as uncertain bhavartha; with the 1914 list's gloss type added, both repeats typed them hindi_gloss (`run-003/`, `run-004/`). The other 1896 pages were not repeated.
     - **Proposed:** method 042 + 043 as the region step for books with a type list, method 040 + 041 for books without one.
   - **Type lists: done.** All ten books have one, all accepted by the user by 2026-11-05 (Telang, Cole, then Ten Princes, the two Nītiśataka editions, Vavilla and the Gita, drafted by Claude and tested before review).
   - **Method 044, the transcription call: done on 2026-11-05, not yet reviewed by the user.** [Method 044](methods/044-gpt-6.1-terra-none-region-transcription/README.md) sends the page with method 043's regions outlined and tagged, plus a cut-out of each region with its line pieces numbered, and gets back one line of text per line piece and a flat unit tree with open ends; a local step writes a schema page document and checks it. Two requests on the 12 Kale, Hertel and Dutt run pages, $0.56 in all (NOTEBOOK, "Transcription and unit tree on method 043's regions"):
     - **transcription references:** Claude wrote three (Hertel 152, Kale 106, Dutt page 2) before the first run; not yet reviewed by the user;
     - **text:** character error rate, markers ignored, 0.44% / 1.31% (Hertel, first request / repeat), 1.87% / 2.25% (Kale's worn scan), 0.34% / 0.43% (Dutt). The errors are misread words, often a familiar form for an unusual one; Kale's tiny footnote markers are missed;
     - **trees:** all 159 example units found with the right type and regions (one missed in the repeat), all region types right; open ends wrong at four of nine page breaks, always at a page edge, the same in both requests;
     - **validity:** 10 of 12 page documents valid in the first request, 9 in the repeat (an open start not on a first child; a misnumbered unit id; a unit in no flow);
     - **stability:** units identical between requests on 11 of 12 pages; text differs on 0.1–3.3% of characters.
   - **Method 045, the single call, and method 046, the second call with neighbor context: done on 2026-11-05, not yet reviewed by the user.** Two requests each on the same 12 pages (NOTEBOOK, "Method 045" and "Method 046"):
     - [method 045](methods/045-gpt-6.1-terra-none-single-call-regions-text-units/README.md) (one call for regions, line text and units, then method 043's local step): regions 0 / 0 / 0 on the three referenced pages; text on the line pieces of 233 of 236 regions; text error 0.44–2.31%, a little worse than method 044 in the repeats; the same tree quality and the same open-end mistakes except at Dutt page 2; $0.35 for 12 pages against $0.55 for methods 042 + 044, but a longer wait (median 38 s against about 41 s for both calls one after the other);
     - [method 046](methods/046-gpt-6.1-terra-none-region-transcription-neighbor-context/README.md) (method 044 plus the neighboring pages' edge lines, from their method 043 regions, as context): open ends right at every page break in the first request (method 044: wrong at four of nine), one wrong in the repeat; Kale 106–109 assembles without a warning in both requests; text error 0.27–2.25%; cost as method 044.
     - **Claude's recommendation:** method 042 + 043 + 046 for whole books, since the region step for all pages comes first anyway, and the context then costs nothing in parallelism.
     - **Remaining tree errors:** Hertel's frame story resuming after an inner tale on the same page (page 153, invalid in every method), and the flat unit list's ids (Dutt page 1: a group given another group's id). A nested unit tree in the response, with no ids to keep, would remove the second kind.
   - **The Kale full-book walk: done on 2026-11-06, not yet reviewed by the user.** NOTEBOOK, "The Kale full-book walk":
     - **survey and type list:** the scan has an English contents page, the Sanskrit text (pages 2–113), an English translation (114–165) and English notes (166–252). `schema/types/kale-1913.json` was extended by Claude for the parts outside the Sanskrit text (schema/README.md, "Decided on 2026-11-05", lists the additions);
     - **run:** method 042 + 043 on all 252 pages, run `book-001`, then [method 047](methods/047-gpt-6.1-terra-none-region-transcription-neighbor-context-runs/README.md) (method 046 with a `--run` option). The OpenAI credits ran out after 125 pages; after the user added credits, the 127 refused attempts were renamed `book-001-refused-429` and rerun. $7.45 in all;
     - **result** (`outputs/surveys/047-…/kale-book-001-full/`, with `book/transcript.txt`): 251 of 252 pages valid; 2,136 units; open-end mismatches at 5 of 250 page breaks. Verse counts match the contents (133 and 145). The number-sequence check found five misread verse numbers (९ as १) and a few oddities in the English parts;
     - **three gaps in Claude's extension of the type list, found by the walk:**
       1. commentary allowed directly in a section (for the commentator's introduction) let page 4 put a continued commentary there instead of in its group;
       2. paragraph is allowed only in the contents, so page 130's editor's note made the page invalid;
       3. the translation and notes descriptions do not say that each is one unit across both śatakas, so the model closed them before the headings on pages 138 and 208.

       Proposed fixes: a separate type for the commentator's introduction, with commentary only in groups; paragraph for editor's notes in the translation and notes too; and descriptions saying each part is one unit with headings inside. Then rerun the whole book as `book-002`, together with whatever transcription fix the error tests choose.
   - **Transcription errors such as दौर्योधने → दुर्योधने (the user's question, 2026-11-06), tested the same day at the user's request.** NOTEBOOK: "Transcription errors: are they caught by a second reading?", "Stronger readers…" and "A check call…":
     - **the error:** the OpenAI readers write the familiar form of a word or verse. On 6 lines, all four readings (methods 044 and 046, two requests each) agree on the same wrong text, so repeats and voting cannot catch it;
     - **Tesseract as a second reader:** it flags 21–22 of 22 wrong words, and 25–33% of all words once its zero-width non-joiners are removed;
     - **stronger readers** (method 047's request, two requests on the three referenced pages; character error rate with markers ignored):
       - Terra with reasoning (048): no better;
       - Astra (049): slightly better at ten times the cost, with the same substitutions;
       - **Gemini 4 Argon with low thinking (052): 0% / 0% on Hertel 152, 0.19% / 0.06% on Kale 106, 0.03% / 0% on Dutt page 2.** It reads all six "familiar form" lines as printed, and finds and relates all four of Kale 106's footnote markers. Its trees are as good as Terra's. About $0.08 per page. Gemini refused the schema with fixed line counts and one property per region as too complex on a 29-region page (methods 050 and 051), so method 052 uses a region list;
     - **check call** (053: Terra checks the words Tesseract disputes): as run, worse (51 → 68 edits) because of two mechanical faults; with outside punctuation removed, 51 → 26 edits and five of the six familiar-form errors fixed. Still well behind Gemini reading the page itself;
     - **Claude's recommendation:** use Gemini 4 Argon (method 052's request) as the transcription reader; keep the region step on Terra. Keep the number-sequence check, and a check for characters outside the book's scripts, as cheap flags. Tesseract plus a check call is not needed for now.
   - **The second Kale full-book run, `book-002`: done on 2026-11-06, after the user agreed to the recommendation** (NOTEBOOK, "The second Kale full-book run"):
     - **setup:** the revised Kale type list, the region step on Terra (method 042 + 043), and transcription by Gemini 4 Argon (method 052 with `--run book-002`); $18.12;
     - **result** (`outputs/surveys/052-…/kale-book-002/`, with `book/transcript.txt` and `report.txt`): 250 of 252 pages valid; 2,105 units; open-end mismatches at 4 page breaks; the translation and the notes each one unit; the Vairāgyaśataka's verse numbers complete with no misreading; no stray characters;
     - **against `book-001`:** the print agrees with Gemini in 16 of 18 sampled word differences. Gemini also keeps the book's own misprints, as asked;
     - **retry and page numbers (2026-11-06, at the user's request):** the two invalid pages (29 and 47) were retried once and are now valid, so all 252 pages are in the book (2,142 units; mismatches at 2 page breaks). A page-number check in `book_report.py` flags 9 pages whose transcribed number does not fit its neighbors. The viewer marks them;
     - **open:** the heading inside a continued group on page 34, which the schema cannot express yet (interruptions are allowed only at the top level of a flow); the commentary at 38 → 39; misread page numbers.
   - **Viewer for looking at a book:** `schema/viewer/build.py` writes static HTML per page (image with outlines next to units and text, line hover, note markers linked to their notes, open ends, problems). The user finds the exact marker position useful (2026-11-06): markers stay where the superscript is printed, even inside a word. The Kale `book-002` viewer is `outputs/surveys/052-…/kale-book-002/viewer/index.html`. It is a review tool, not the web app.
   - **The Telang full-book walk: done on 2026-11-06, not yet reviewed by the user** (the Gemini prepaid credits ran out once, and the user added more; NOTEBOOK, "The Telang full-book walk"):
     - **inputs:** a series of its own, `telang-dli-book-page-NNN` (`inputs/pages-telang-book.json`), rendered with per-page preprocessing in `inputs/render_pages.py`: background flattening for the dark preface and gray pages (1, 5–12, 158, 200), and a quarter turn for the sideways index tables (35–50);
     - **type list:** `schema/types/telang-dli.json` extended and revised three times by Claude, not yet reviewed. It adds the critical notice, the corrigenda, scan matter, footnotes everywhere, a table convention (rows as lines, cells separated by " | "), and parts that go on across their internal headings;
     - **pipeline:** Terra regions (method 042 + 043), Gemini transcription (method 052, run `book-001`). On the 11 pages whose ink mask is dominated by dark bands, method 054 (cut-outs that keep unowned ink in the region's box) restores the words at the line ends;
     - **result** (`outputs/surveys/052-…/telang-book-001-full/`, viewer in `viewer/index.html`): 195 pages, all valid; 1,070 units; open-end mismatches at 4 page breaks, all in the critical notice and the index; verse counts 133 and 156 with no gaps; one notes unit of 287 notes; index tables transcribed row by row; $13.14;
     - **open:** the region outlines on the banded pages still exclude the words in the bands (the text is complete); two Vairāgyaśataka note gaps unchecked; INDEX No. 2 as a second index unit.
   - **Before the web app: chaya, the user's ProseMirror doc, inline formatting and editing (2026-11-06, at the user's request).** The user noticed that inline formatting such as bold, very common in books, had not come up yet, and asked that regions, marker–note links and everything else be easy to edit:
     - **chaya** (`~/w/chaya`, all versions):
       - **the 2024 OCR editor** (root, with snapshots 2024.01–2024.04 on branches): a ProseMirror document of chunks typed paragraph, verse or heading. Each chunk holds lines, and each line carries its page number, vertical range and words, with text marked strong or em. Chunks can be joined, split, deleted and retyped, with a line image strip beside each line. Text comes from Tesseract (kan+eng) or Google Vision, and is saved as `.chaya` JSON. This is already close to schema 0.2: chunks are units, lines are line pieces, marks are spans. What it lacks: nesting, polygons and note links;
       - **`versions/splitchunk`:** unfinished;
       - **Bookchop and `bookchop-markonly`** (2025): labeled rectangle regions in fractional page coordinates, Gemini text with Vision word boxes, few-shot examples, and a Read tab. A `.chaya` ZIP bundles the PDF with the annotations. Continuation across pages is a shared label, and links are a label convention. Lessons: a rectangle is the natural handle for editing a region (schema 0.2's `box`), and a single file with scan plus annotations is portable;
       - **`versions/prototypes`:** retry experiments;
     - **the user's doc "ProseMirror: What and Why"** (2023, for Ambuda): a schema-driven structured editor with no visible markup, where structuring is part of proofreading. Also a preview, proofreading tools (spellcheck, ligatures, metre), and closing the loop from reader to editor so a text is always improvable. Its costs: complexity, diffs and history, and testing on mobile and with Devanagari input methods;
     - **schema 0.2, drafted by Claude, not yet reviewed by the user** ([schema/README.md](schema/README.md), "Inline spans and note markers" and "Editing"):
       - formatting as spans on line pieces, which map one to one onto ProseMirror marks;
       - note markers as zero-width spans with ids, outside the running text, so search is not broken by markers;
       - note relations by anchor, which survives text edits;
       - a region's editable `box`, from which the outline is recomputed locally;
       - one natural edit per kind of element, and an edited document must pass `book.py check`.

       `schema/inline.py upgrade` turns 0.1 documents into 0.2: both books' documents upgrade with all pages valid and every located marker anchored;
     - **formatting test, done** (NOTEBOOK, "Inline formatting: schema 0.2 and method 055 on six pages"): [method 055](methods/055-gemini-4-argon-low-region-transcription-formatting/README.md) is method 052 asked for `<b>`, `<i>`, `<sc>`, `<sup>` and `<sub>`, writing 0.2 documents. On six pages with 24 reference spans (Kale 2, 166, 208; Telang 13, 25, 127; references by Claude, unreviewed), it found 22 exactly and 1 with its text read differently, missed 1 (a bold अथ), and made no false marks. Kale's uniformly heavy Devanagari was not taken as bold. Its plain text is at least as faithful as method 052's: 16 edits where 055 agrees with the print and 052 does not, against 4 the other way. $0.31. The viewer now reads 0.2;
     - **open:**
       - method 055 on plain pages, to measure false marks;
       - a type list's `inline` kinds (such as Kale's bold pratīkas), not yet tried;
       - relation slips (a relation with no marker sign, or a sign not in its line; 2 of 9 here, the same as method 052), to be fixed locally: by the line's only marker, or by the note's own sign;
       - whether to transcribe Kale and Telang again with method 055 for their formatting: about $16 and $11 at method 052's cost.
   - **The web app, first version: built on 2026-11-06** (the user: "go ahead with the web app. You don't have to use the chaya app and the doc, just use your judgment"). See [webapp/README.md](webapp/README.md) and NOTEBOOK, "The web app, first version":
     - **form:** static, plain JavaScript modules, no build step, no dependencies, running entirely in the browser;
     - **document model:** schema 0.2 page documents. The editor works at the line-piece level, with one editing host per region, so ProseMirror was not needed: text is typed, and every other change is a function in `js/ops.js` on a copy of the document, which keeps the previous one for undo;
     - **storage:** book folders, with the model's results in `pages/` and the user's corrected versions in `edits/` beside them (the decision of 2026-11-05: no history). A folder opens from disk (Chrome or Edge) or read-only from a URL, with corrections in IndexedDB;
     - **checks:** the same rules as `book.py`, ported and tested for parity on both books and on broken pages. A page is saved only when it passes; otherwise it is kept as a draft;
     - **views:** page editor (text, formatting, markers and links, units, regions and boxes, line pieces), reader (assembled book with source preview), check, export;
     - **method 043's local step in the browser: done** (`webapp/js/local/`; NOTEBOOK, "Method 043's local step in the browser"). On six pages, the analysis is identical to Python's, every region gets the same line pieces, and the outline overlap is 0.98–1.0. A box edit or a drawn region recomputes all outlines in a worker (about 2.5 s per page), and every line piece keeps its text;
     - **making a book in the app: done** (`webapp/js/pipeline/`; NOTEBOOK, "Making a book in the browser"). "Make a new book from scans…" and the Make view run method 042's region call (OpenAI), the local step and method 055's transcription call (Gemini) with the user's own keys, which are kept in the browser. The prompts and schemas equal the methods' byte for byte for all 10 type lists, and the page documents equal method 055's on its six test pages. A three-page Kale book made in headless Chrome cost an estimated $0.26 and took 19 s for regions and 42 s for transcription. Its scan page 106 has the same regions, types and units as `book-002`, with 238 of 245 words the same;
     - **tests:** `node --test webapp/test/*.test.mjs` (43 tests: parity with `book.py`, `inline.py`, methods 042, 043 and 055, and the edits); `webapp/test/browser.mjs` for scripted runs in headless Chrome;
     - **book folders made so far:** `outputs/books/` (Kale `book-002`, Telang, and the two formatting-test books). Their images are hard links to `inputs/`;
     - **open:**
       - PDF import: done (bundled pdf.js, render_pages.py's resolution rule), with a generic type list (`schema/types/generic.json`, unreviewed). render_pages.py's preprocessing (flattening, rotation) is not in the app yet;
       - method 054's cut-outs for dark-band pages;
       - an automatic retry of invalid pages;
       - interruptions below a flow's top level;
       - a type-list editor;
       - dragging regions and units in the tree;
       - hosting (any static host; `?book=` needs a fetchable URL).
   - **Cheaper readers (the user's brainstorm, 2026-11-06; nothing built):** transcription is about 85–90% of the cost (NOTEBOOK, "Where the cost goes"). Ideas to measure on the referenced pages before choosing, with error rate and cost per page as in the "Stronger readers" table:
     - a lighter request: no overview image, a lower image resolution, no neighbor context, and the providers' batch modes;
     - cheaper models as a per-book setting;
     - OCR engines: Google Cloud Vision's document text detection, or Document AI, with words placed on our line pieces by geometry and units from the region call; and Tesseract in the browser (free; poor on the Kale scans, where it disagreed on 25–33% of words);
     - cascades: a cheap reader, with the strong model only where readers disagree or confidence is low;
     - for digital PDFs, no reading at all: the text layer converted (from a legacy font encoding where needed, as in the vachana PDF), lines and fonts from the PDF's spans, and units from the region call or a text-only call.
   - **Digital PDFs with legacy-font text (tried 2026-11-06; NOTEBOOK, "The vachana PDF's text layer"):** converting the text layer of the vachana PDF with the GPL tool knconverter agreed with a Gemini reading on 99.2% of characters. The converter's own errors come from three gaps in its table (8 words in 906). Gemini made 3 errors where the converted text is right. The user's decision (2026-11-06): the GPL tool was for testing only; conversion in the web app needs our own converter (no GPL code). Plan, not yet started:
     - **converter:** our own Nudi/Baraha-style mapping and reordering rules, written and tested against the converted pages and Gemini readings, with per-font tables for punctuation (`|`→।, `||`→॥, `` ` ``/``` `` ```/`''`→‘ “ ”), for the `Ç` o-sign form, the avagraha `„`, and the Sanskrit fonts' variants;
     - **checks:** a check for leftover Latin-1 characters, plus a cheap second reader on a sample of pages (method 057 costs about $0.01 a page);
     - **page documents:** line pieces with exact boxes from the PDF's spans; formatting from a per-font style table; units from the region call (about $0.009 a page) or a text-only call;
     - **rendering:** for digital PDFs, 300 dpi without render_pages.py's embedded-image cap, which an ornament triggered here (pages 61 and 115 came out at 240 dpi).
   - **The vachana PDF transcribed (2026-11-06, at the user's request; NOTEBOOK, "The vachana PDF transcribed"):**
     - **result:** our own converter (method 058, `nudi.py`) and units from the typography (method 059). No model calls; checking cost $0.21;
     - **text:** 99.86% agreement with Gemini readings on 15 random pages, with no converter error among the differences: they are Gemini's errors, misprints Gemini corrected, and conventions;
     - **structure:** 4 volumes, 46 chapters, 801 sayings, 258 paragraphs, 66 footnotes, all 252 pages valid;
     - **files:** the book folder `outputs/books/vachana`, and its text `vachana.txt`;
     - **open:**
       - line ends: about 87% right; a cheap text-only model pass, or the user's corrections, would fix the missed joins;
       - the type list and the structure are not yet reviewed by the user;
       - for the web app: port `nudi.py` to JS, detect legacy-encoded fonts automatically, and infer a typography profile, which is now written per book.
   - **After the user's review of the front matter (2026-11-06; NOTEBOOK, "The vachana book after the user's review"):**
     - **method 060** replaces 059 for this book. Its fixes:
       - figures from the PDF's images;
       - columns;
       - text that is not printed (white, or under a later fill or image) left out;
       - the page's own margins;
       - verses set in heading fonts;
       - invocations and ornaments belong to the chapter they precede;
       - gaps between blocks;
       - kept line breaks in short lines;
       - lines on one baseline merged.
     - **book folder:** `outputs/books/vachana` is now 060's `book-008` (1,367 units, 85 figures, all pages valid, 65 of 65 markers linked). The 059 folder is `outputs/books/vachana-059`;
     - **schema and app:**
       - figures are units of a `figure` type with a region and no line pieces, labelled in the unit;
       - the reader shows figures and the text export names them;
       - the editor has "Start a new unit at the caret's line", "Split the region at the caret's line" and "Move the text after the caret to a column on the right";
     - **open:**
       - the user's review of the rest of the book;
       - figure labels for the ornaments (unlabelled now), or making them `ornament` furniture (a type added at the user's question, so that a picture can leave the reading order without being deleted); the generic type list has no such type yet;
       - whether title-page groups should be a type of their own rather than headings;
       - the same detections (images, columns, hidden text) for the app's own PDF import, when the converter is ported.
     - **styles and ornaments (2026-11-06; NOTEBOOK, "Ornaments as furniture, side-by-side blocks, and the book's typography"):**
       - **schema draft 0.3:** a per-book style sheet (format `style`) and `style` on units and line pieces, presentation only;
       - **method 061:** measures styles from the PDF, makes unlabelled pictures `ornament` furniture, and finds chapter 2's 31 sayings that 059 and 060 missed;
       - **the app:** an "as printed" reading view, rows side by side, an HTML export as printed, style controls in the unit inspector, and a Style view to see and edit the style sheet with a live preview (saved in the folder, or in the browser for a book opened by URL);
       - **method 062 (2026-11-07):** 061 with inline bold and italic taken from the font roles too (9 missed bold spans, such as a title on page 7); `outputs/books/vachana` is now 062's `book-001`, and 061's folder is `vachana-061`;
       - **the app's modes (2026-11-07, the user's proposals):**
         - Read · Edit book · Edit pages · Export;
         - Edit book has tabs: Types (the type list, view only, with counts), Style sheet, Problems (was Check) and Make pages;
         - Edit pages has the page navigator, undo and redo;
       - **PDF is the only input format (the user's decision, 2026-11-07; NOTEBOOK, "PDF as the only input"):**
         - **done:** the app makes books from a PDF only; the folder keeps `source.pdf`; pages are rendered at 300 dpi, with the scan's resolution cap only for scanned pages; each page records its images and text layer;
         - **existing folders:** all eight have their source PDF (hard links);
         - **a book inside its PDF (2026-11-07, the user's request; NOTEBOOK, "A book inside its PDF"):**
           - `.chaya.pdf` = the original PDF's bytes and one update attaching `chaya.json` (the folder's files but the PDF and the images); the original is recoverable by its recorded length and sha256, and saving again does not grow the file;
           - books are kept in the browser's private file system, with autosave, and pages are drawn from the PDF;
           - the library opens PDFs and `.chaya.pdf` files; Export saves a `.chaya.pdf`;
           - `outputs/books/{vachana,kale-1913,telang-dli}.chaya.pdf` were made with `webapp/tools/make_chaya_pdf.mjs`;
           - **open:** over plain http (Tailscale) only read-only opening works, so `tailscale serve` would give the full app; Telang's 27 flattened pages are drawn unflattened; a `.chaya.pdf` from a book opened by URL takes the served folder's pages and the browser's corrections;
         - **next:** the text-layer path in the app, with the converter and the typography rules ported to JavaScript, legacy fonts recognized, and the font roles inferred. Scanned PDFs often carry a hidden OCR text layer (Kale's: 1,433 characters on page 106), a possible free first reading or check;
       - **type lists are written by hand so far** (the user asked whether they are generated by sampling pages: not yet). Open: drafting a type list from a few sample pages with one model call, and editing type lists in the app (with care: removing or renaming a type invalidates page documents);
       - **open:** a LaTeX or Typst export from the same styles; bundled web fonts (Noto Serif and Sans Kannada, OFL); contents entries' page numbers flush right; the style step for scanned books (from the region boxes and the line finder's heights, where there is no PDF).
     - **access:** the app is also served on the Tailscale address (port 8765) for the user's other machine. There, plain http has no secure context, so only reading by URL works; `tailscale serve` (HTTPS) would give the full app, but needs the user's go-ahead because it changes their Tailscale settings.
   - **Next:** the user's review of the app (webapp/README.md, "Running it"), then the open items above. Possible improvements, for later: allow an interruption before a continued unit at every level of the tree (Kale page 34); a nested unit tree in the response (no ids to keep); retry an invalid page once automatically (two retries fixed both invalid Kale pages); the model-box fallback where the ink mask fails (Telang's preface); a markers convention check (relations whose marker is not in the line).
   - **Book-specific types (the user's requirement, 2026-11-04):** the schema must be flexible, with a book-specific set of unit types, because some books have no verses or commentary and some have no formulas. One option is a small common core (passage, page region, line, note link, continuation) plus a per-book type list with descriptions:
     - **Kale:** verse, commentary, lead-in, footnote;
     - **Telang:** verse, apparatus entry;
     - **Cole:** paragraph, formula, footnote.

     The region prompt and its JSON Schema enum would be generated from the book's type list, which the user could edit in the app. Method 037's neutral types could serve as the default list, or as the coarse class behind each book-specific type.
   - **Levels (Claude's proposal):**
     - **Region:** one passage's portion of one page; required. It carries the structure.
     - **Line piece:** the part of one printed line in one region, derived locally and already written under `lines` in `regions.json`. It is optional, but enables line-level source links and transcription checks.
     - **Ink:** the glyphs owned by each region, mainly for checking.
   - **Continuations (Claude's proposal, tested with flags; the user has since proposed explicit links, below):** keep page-local regions apart from book-level passages, so that a passage is an ordered list of regions.
     - **Flags:** the region call adds `continues_from_previous` and `continues_on_next`.
     - **Linking:** a local book-level step links the last flagged region of page n to the first flagged region of page n+1, in the same stream (main text and footnotes separately).
     - **Confirmation:** transcription confirms the link, from a word hyphenated across the break or a sentence completing across it.
     - **Interruptions:** the same mechanism covers interruptions within a page, such as Dutt's verse halves or Cole's paragraph broken by a display.
     - **Breaks in the text:** the transcription keeps line and page breaks as markers, so that text offsets map back to lines.
     - **Tested (methods 040 and 041, above):** the flags plus a both-flags linker work for body text across page and column breaks. Still open:
       - continuations across an interruption in the same stream, such as prose resuming after a quoted verse, which the consecutive-pair linker cannot link;
       - notes the model types as paragraphs, which fall into the body stream;
       - apparatus entries continued at the foot of a page;
       - relations that are not continuations, such as commentary on a verse, which belong in the schema rather than the flags. The model sometimes marks them as continuations.
     - **The user's input (2026-11-05):**
       - Whether something continues depends on what a unit is, so continuation truth should follow the book's unit definitions. Claude's three doubtful truth cases are all unit-definition questions:
         - Hertel page 153: a prose block, or a whole speech with a quoted verse nested inside it;
         - Kale pages 108 and 109: a commentary, or a verse-plus-commentary group;
         - Dutt verse 26: a verse, or a sentence.
       - Instead of flags, the reading order should mark continuations. This covers interruptions such as a kept running title, or a figure or table at the top of the next page.
       - **Hertel page 153 is nesting, not an interruption.** The quoted verse is part of the speech. So the speech continues across the break, and the verse inside it does not.
       - **Kale: keep a group of lead-in + verse + commentary.** The user agreed to the group, which is also what the app needs to split a book apart, for example one group per page. So on Kale pages 108 and 109 the group continues across the break, and the commentary starts there.
       - **Dutt: keep a group of a set of verses + the translation of the set.** That is the book's usual pattern (the user, correcting Claude's description of one verse per translation). Verses 25 and 26 form one set, translated together after verse 26; verse 25 ends page 2 and verse 26 starts page 3. So the set and its group continue across the break, and each verse is complete.
     - **Claude's response on nesting (not yet decided):**
       - Continuation is per level. If units form a tree whose leaves are page regions, a unit continues exactly when its leaves lie on more than one page, and no separate relation is needed.
       - The tree also separates nesting (a quoted verse is a child of the speech) from interruption (a figure or running title between two pieces is not part of the paragraph).
       - On Hertel, prose after a verse is always flush left, so the page layout cannot show that the speech continues; the text can (`यतः ।` introducing the quotation). The region step would give the leaves and layout-visible continuations, and the higher levels would be built once text is available.
     - **Claude's response (not yet decided):**
       - Links should name their target. A bare "is a continuation" mark carries the same information as the start flag.
       - Within a page, the model names the region (`continues: 3`).
       - Across a break, the two flags stay as each page's evidence. The linker joins page n's unfinished region to page n+1's continuing region whatever lies between them, and matches by kind only when several are open.
       - The truth's two edges per break are one fact: all 41 breaks recorded from both sides agree. The edges exist to score the model's two guesses. The bottom-of-page flag was the reliable side: alone, it found the same 11 links with none wrong.
       - Do this with the schema step, as method 042, with the truth rewritten as links between regions.
   - **Method:** a transcription method keyed by region IDs, returning the format of `schema/`. The user chose a second call after the region step, and a single call is to be tried as well (decided 2026-11-05, below).
   - **Checking:** this needs checked reference transcriptions for a few pages; none exist yet. Hertel, Kale and Dutt pages would test Devanagari, mixed scripts and footnotes.
2. **Mask-failure check and fallback.** Detect when the local ink mask is unusable (on the Gita spreads, 64–78% of the page is masked and 57–74% is in large components; on good pages, under about 20%) and fall back to the model's boxes. Optionally, an adaptive threshold for unevenly lit photographs, tested on the Gita pages.
3. **Margin furniture.** Margin line numbers (Hertel) and similar marks are either returned as non-kept regions or pulled into text regions, depending on the request. Options:
   - a prompt that names them as furniture, tested on fresh pages;
   - a local rule for a numeral run in the margin beside many lines.
4. **Frames and ornament borders.** Frame pieces attached to text lines are still owned by text regions, so outlines bulge into borders on the Nītiśataka pages. Hertel's margin bracket is a similar case.
5. **Strengthen shared lines.** This is still the weak point under horizontal box error. One generic option is to move each split between side-by-side boxes to the widest ink-free gap near the model's edge.
6. **Line naming instead of coordinates.** Give the model the detected lines and ask which lines form each passage. Still one call.
7. **Port to the browser.** The method 039 recipe (thresholding, connected components, sums, sorting, a labeled distance transform and contour tracing) has to be ported for the web app, with the model box as a fallback.
8. **Lower priority:**
   - **Tighter outlines** next to short lines: clip each line's cell to its own padded line rectangle.
   - **A deskewed analysis image** for the model.
   - **Spread splitting** by gutter detection, if the app wants one image per printed page.

**Transcription in the same call or a separate one (decided 2026-11-05).** The current prompts ask for regions only and forbid transcription. The user accepted Claude's recommendation of a second call, and wants a single call tried as well. Cost is not a concern; lower latency is a nice-to-have, which favors the single call. Claude's recommendation, as written before the decision:
- Use chained calls. The first call returns passages; the browser computes outlines; the second call transcribes each passage, keyed by the first call's passage IDs. Matching is a problem only when two calls each divide the page independently.
- Reasons:
  - Regions and transcription can be optimized, and their models chosen, separately.
  - The user can check regions before paying for text, and redo text without changing regions.
  - Transcribing clean cut-outs lets local geometry, not the model, decide which words belong to a passage.
  - Failures and long outputs stay contained.
- Costs:
  - The page image is sent twice: Terra's page-113 request used 3,852 input tokens, about $0.005.
  - The two calls run one after the other.
  - A cut-out loses page context, which could be mitigated by also sending the page.
- One call remains the baseline to test. It is cheapest and consistent by construction, and writing the text might sharpen grouping. With line IDs (method 035 above), one call could return text per line, again without matching.
- Deciding needs checked reference transcriptions for a few pages; none exist yet.
- The user confirmed that a transcription call is allowed, and that it may also assign regions to larger units (a speech, a verse group) that only the text can decide.

## Conventions to preserve

- Keep code and README under `methods/<method_id>/`, shared inputs under `inputs/`, human or proposed references under `references/<input_id>/`, the draft book schema and its type lists under `schema/`, and outputs indexed by input and method. Cross-page surveys go under `outputs/surveys/<method_id>/`.
- A frozen method keeps its ID on new data. Changing the prompt, model, settings or processing recipe gets a new ID; the next unused ID is 044. Repeated requests use a fresh output subdirectory such as `run-002`, not a new method ID.
- Keep prior runtime code and saved requests/responses immutable: hashes tie them to results. Save new derived coordinates separately with their source result and every adjustment.
- Keep NOTEBOOK.md limited to actual tests, settings, observations and images. Use self-contained entries, full method names, stable method IDs, and one physical line per prose paragraph. Method README links and image references are expected. Keep planning and cross-experiment conclusions in this handoff or another separate document.
- Add results within the appropriate test-page section while preserving previous entries. Do not label tests on a new page as newly numbered methods.
- Preserve original pixels and distinguish model grouping from local boundary processing.
- Use `uv run --offline python` with the existing environment; all method READMEs now say so. For a local request check, use the runner's `--check` flag. Existing output directories are protected against overwriting.
- OpenAI authentication checks `OPENAI_API_KEY`, then the stored `llm` key named `openai`; Google runners similarly use configured Google variables or the stored `gemini` key. Do not print or copy key values into logs or documents.
- The older material under `old/Kale-vision-handoff/` is historical.

This handoff is kept up to date during the session rather than written only at the end.

A useful next-session opening instruction is: “Read HANDOFF.md and schema/README.md. Both full-book walks (Kale, Telang) are done; write the brief for the web app session, then pick up the improvements listed under experiment 1.”
