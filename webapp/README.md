# The web app: reading and correcting digitized books

A static web app for the books this repository's methods produce. It runs entirely in the browser: plain HTML, CSS and JavaScript modules, with no build step and bundled PDF and OCR runtimes. It works on **books**: a book's PDF with its page documents (schema 0.2 and 0.3, [schema/README.md](../schema/README.md)), kept in the browser and saved as one file, a **.chaya.pdf** ("Books" below). It offers four modes:
- **Read** and **Export** work on the whole book.
- **Edit book** has tabs for the book-level views: Types, Style sheet, Problems, Transcription models, Schema assignment, and Make pages for a book opened from a folder.
- **Edit pages** edits one page at a time, with a page navigator (← and →, or Alt ← and Alt →), undo and redo, and the page's save status.
- Each Edit mode reopens where it was left.

- **Edit pages:** the page image with every region's and line piece's outline, next to the page's units in reading order with their text, line by line.
  - Hovering a line highlights it on the image.
  - The image is zoomed with − and + (or ⌘ + scroll), "fit width" (the page's whole width in the pane) or "fit height" (the whole page in view). Fit height is kept as the window is resized, from page to page, and when coming back from another mode.
  - Text is corrected by typing. Formatting (bold, italics, small capitals, superscript, subscript, underline, letter spacing, and the book's own inline kinds) is toggled on a selection.
  - Note markers are inserted at the caret, given their printed sign, and linked to their notes.
  - Units are retyped, renumbered, relabeled, split (✂ between two children), joined, wrapped in a container, unwrapped, moved and deleted. "Make it page furniture…" takes a unit out of the text: its regions stay on the page as furniture of the chosen type (an ornament, a running header), and the unit goes. Their open ends at the page edges are toggled (↑ ↓).
  - How a unit is printed (schema 0.3 styles) is set in the unit inspector: its alignment, its size, and "side by side with the next unit" (a row). Making a column with "Move the text after the caret to a column on the right" puts the two units in a row.
  - A region is split at the caret's line piece, into a new unit of the same type ("Start a new unit at the caret's line") or within its unit. For a block printed in two columns but read across both, "Move the text after the caret to a column on the right" moves the rest of the caret's line to a column region beside it. That region is made the first time, in its own unit, and added to after that.
  - A figure (a type whose region class is `figure`) is a region with no line pieces, shown as its part of the page image; its unit's label says what it shows. A picture that is not part of the text (an ornament) is taken out of the reading order by giving its region a furniture type with region class `figure` (such as an `ornament` type). Given a text type again, a region without a unit goes back into the unit on the page that may hold it and that it falls in.
  - Regions are retyped, moved to another unit, resized or moved by their box's handles on the image, drawn new (＋ Region), and deleted. After a box changes, method 063's local step runs in the browser (in a worker) and recomputes every region's outline and line pieces from the page's ink. Detached glyph parts join their parent line. Each parent keeps its original line ID, and text edited on a former fragment follows its parent. Each line piece keeps its text, following its line to another region if the line moves. A piece whose line has left the region keeps its text and is marked as having no outline. Line pieces are added and deleted. A line's join with the next (space, hyphen, nothing, line break) is set by clicking its right edge.
  - Every change is checked as it is made, with the same rules as `schema/book.py check`, and saved when the page passes. Undo and redo cover every change (⌘Z, ⇧⌘Z). "Revert page" goes back to the model's version.
- **Read:** the whole book as one text, assembled from its pages as `book.py assemble` does, with the user's corrections.
  - Headings, verses, paragraphs, tables and notes are shown according to their types, with formatting. Figures are shown as their part of the page image, with their label.
  - Note markers link to their notes and back.
  - The printed page number is shown where each page starts.
  - Hovering any passage shows its region on the page image, and double-clicking it opens the page in the editor.
  - "Show the units" shows the unit tree in the margin.
  - Units in a row stand side by side where the width allows, and one under the other where it is narrow.
  - "As printed" (for a book with a style sheet) sets each unit as the book prints it: fonts, sizes, alignment, margins, indents and spacing, from the style sheet and the units' own styles, at the book's measure.
- **Edit book, Types:** the book's type list, its own part of the schema (the format, `schema/schema.json`, is shared by every book):
  - the tree of what may contain what, from each flow's top level, with how many units of each type stand in each place;
  - the page furniture types;
  - a table of each type: its region class, what it may contain, its flow, language, numbering, total and description;
  - the relations, inline kinds and transcription conventions.

  It is shown here, not edited; "Download types.json" gives the file.
- **Edit book, Style sheet:** the book's style sheet (schema 0.3), seen and edited:
  - the base style of all text and each type's style (font role, size, leading, weight, italic, alignment, left margin, first-line indent, space above and below), in a table where an empty cell inherits the base;
  - the font roles and their font families;
  - the page's size and text box (whose width is the measure).

  A preview of a few pages, set as printed, follows every change, and each change is checked against the schema. "Save" writes `style.json` into a book folder (and names it in `book.json`). For a book opened by URL, the sheet is kept in this browser over the served one, until "Back to the book's own". "Download style.json" gives the file. A book with no style sheet can start one from plain defaults. Units' and line pieces' own styles are set in the page view.
- **Edit book, Problems:** what the checks find across the book (as method 047's `book_report.py`):
  - pages whose document fails the checks (the schema and the type list's rules, as `book.py check`), whose corrections are kept as drafts until they pass;
  - page breaks where units marked as going on do not join;
  - printed page numbers out of sequence. Pages that print no number, as a chapter's first page, are listed apart, as a note;
  - which pages the user corrected, and the transcription model's notes.
- **Export:** the book as one document of the book schema (JSON), the book as plain text with page references (a figure as `[figure: label]`), the book as one web page (HTML, as printed where the book has a style sheet, with its figures embedded), and the user's corrections as one file (and importing such a file).
- **Edit book, Make pages** (editable books) makes page documents in the browser with the user's API credentials, using Terra regions and separately selected transcription and schema assignment models. The comparison views offer an editable copy of a URL book. For an excerpt with a larger cost-projection target, “Start from the full PDF with these settings” opens a new-book form carrying the current types and model choices.
  - **Making a book:** Open a plain PDF from the library to create a book from the whole PDF or a page range. The form defaults to proposing this book's unit types from sample pages. Browse all PDF pages as thumbnails, open larger previews and check pages to include. The sample field accepts `all`, ranges such as `1-50`, and lists such as `1, 7, 43-44`. Request a proposal from GPT-6.1 Terra with reasoning off or Gemini 4 Argon with high thinking. The review shows descriptions, containment rules, reading flows, links, inline kinds, transcription conventions, supporting page references and questions. Descriptions and grouping rules can be edited before approval. A reviewed, valid list is required before creating the book. An existing type list can also be supplied from a bundled list or a file. Continuing from an excerpt carries over that book's types and model choices.
  - **Unit-type proposals** use rendered page images and the user's description. The default sample spans the beginning, middle and end, including two neighboring middle pages. The sample is editable to include contents, section openings, ordinary text and special layouts. Each explicit proposal is one model call whose estimated charge is shown with the result. API keys are configured in this browser. Attempts and the latest saved proposal are retained by PDF hash before a book exists. Creating the book includes these records in its work files for export. The recipes are [method 077](../methods/077-gpt-6-1-terra-unit-types/README.md) and [method 078](../methods/078-gemini-4-argon-high-unit-types/README.md).
  - **The source PDF:** the PDF is copied into the folder as `source.pdf`, the book's source.
  - **Page images:** each page is analyzed (its images, where they are drawn and how much of the page they cover, and its text layer's characters) and rendered with the bundled pdf.js. A scanned page (an image covering at least half of it) is rendered at 300 dpi, or at the scan's own resolution when that is lower; any other page at 300 dpi. The cap no longer applies to a digital page with a small ornament, which it used to lower to 240 dpi.
  - **What each page records:** its PDF page, its rendering, its images and its text layer's size.
  - **Regions:** each page goes to the region call (OpenAI GPT-6.1 Terra, method 042's prompt and schema generated from the type list), and then to method 063's local step in the worker. The result is saved in `work/<page>.regions.json`.
  - **Transcription** uses the per-book choice of Argon low or high, Flash low, Flash-Lite minimal, local Tesseract, or Cloud Vision Text Detection or Document Text Detection. The language models receive the overview and numbered region cut-outs. Tesseract and Cloud Vision map full-page word boxes to shared source-line polygons.
  - **Schema assignment** uses text-only input with Argon high or low, Flash low, Flash-Lite minimal, or Terra with reasoning off. It builds unit trees, joins, continuations and note links while the app retains the selected transcription model’s text. Argon high is the default for existing books. Transcription and schema assignment are saved independently for each model. Batches transcribe all queued pages before schema assignment, so adjacent readings are available.
  - **Retries and caching** reuse matching successful stages. A failed structural call can be retried without repeating transcription. The Transcription models tab also offers an explicit new structural call for a selected result.
  - The keys are kept in the browser (IndexedDB) and sent only to OpenAI and Google. Costs are estimated from returned usage, including thinking, cached input and OpenAI cache writes, at the recorded paid-tier prices. Unavailable costs are displayed explicitly and stop further calls in the batch.
  - **Processing a book** starts by choosing a range such as `all`, `1-20` or `1-20,25`, setting a spend threshold and clicking “Process selected pages”. Missing regions are found automatically, then the range is transcribed and assigned to schema. Existing model documents are skipped unless reprocessing is enabled. Saved corrections take priority in reading and editing. A paused batch resumes from cached stages. Review Problems, correct pages in Edit pages and save the `.chaya.pdf` from Export.

## Choosing and comparing transcription models

Open **Edit book → Transcription models** (`#readers`). This also works on published books opened by URL. The selected transcription model, schema assignment model and OCR language pack are saved per book. Trial page selections, reference, inspection choices and estimate page count survive reload. Argon low is the default transcription model for existing books. Page-region detection uses GPT-6.1 Terra. The page runs from sample comparison to source review, then ends with “Choose the transcription model for this book”. Select a model and press “Use transcription model for this book” to save that choice, then continue to the schema comparison. Whole-book estimates hold the selected schema assignment model fixed across transcriptions. Its optional execution checkbox is under “Whole-book estimate settings”.

Choose sample pages, candidate transcription models, a reference transcription and a spend threshold. The reference source can be a model’s saved transcription or the current page text. Argon high is the default reference. Schema assignment is included by default. A progress bar counts processed steps across shared region checks, transcriptions and optional schema assignments. The display includes elapsed time, reused results, failures and skipped steps. Stopping or reaching the spend threshold keeps the actual processed count and percentage. The table shows one whole-book cost estimate, transcription-plus-schema elapsed time and schema checks. Set the target book’s page count, or enter 1,000 for a normalized comparison. It defaults to the manifest’s optional `cost_projection.page_count`, then the source PDF’s page count, then the listed pages. An optional `cost_projection.label` names the default target for an excerpt. The estimate averages the complete sample-page costs of region detection, transcription and schema assignment, then multiplies by the target page count. Shared region detection counts once per page in every model’s projected pipeline. All sample-stage costs must be available, including region costs in older books. Projections cover one pass at the sample calls’ recorded prices, with schema validity shown separately. Failed attempts and unresolved charges appear in the ledger. The threshold is checked between calls and can be exceeded by the final call.

Each printed text region with a difference between any model and the reference shows its source crop and all models’ transcriptions. The reference appears first and carries a label. Full region text retains context around differing lines. Amber highlights mark text changes, blue marks formatting differences, and red struck-through text marks reference text omitted by a model. Inline formatting renders as formatting. Highlights keep grapheme clusters and virama-linked Indic conjuncts together, including Kannada conjuncts that the built-in segmenter splits. The comparison uses NFC for matching and retains each model’s original code points for display. Omissions are generated visually and excluded from the model’s DOM text and ordinary text selection. Browsers without `Intl.Segmenter` use whole-line highlights. Models awaiting a result have a placeholder. Turn off “Show differing regions only” to inspect regions where the transcriptions agree. “Optional schema check diagnostics” retains the saved units, links and retry control used for cost-estimate checks.

“Review reference lines against the scan” opens the line crops and reference-editing controls for a region. Edit a reference line, explicitly mark it checked against the scan and save it. Only checked lines contribute to the checked-reference error score. Character differences use Unicode code points after NFC, whitespace normalization and removal of ZWJ/ZWNJ. Formatting and note-marker differences are shown separately. The attempt ledger also shows failed calls and unresolved charges. Schema validity covers structural consistency. Semantic structure still needs source review.

Completed transcriptions live in `work/readings/`, structures in `work/structures/`, immutable API attempts in `work/reader-calls/`, and checked reference lines and the cost ledger in `work/reader-lab/`. Cache fingerprints include the source image, geometry, model settings and generated prompt. Structuring additionally fingerprints its transcription, type definitions and neighboring text. For a URL book, these records are kept in IndexedDB. They are included when saving the book as a `.chaya.pdf`, together with the per-book transcription model setting. API keys stay in browser settings. A failed write after a paid response still counts its cost and stops subsequent API calls until storage is recovered.

Tesseract.js 6.0.1 and its English, Kannada and Sanskrit language data are bundled in `vendor/tesseract-6.0.1/`. Local transcription has zero API cost. It supplies plain text, so inline formatting and note markers need review. Page-region detection and schema assignment have API costs. The first local transcription loads and initializes the OCR runtime.

Cloud Vision Text Detection and Document Text Detection run as separate OCR options using one image and one feature per page. Their estimates use the standard $1.50 per 1,000 units before monthly free usage and volume discounts. Under API keys, choose API-key or OAuth authentication and supply the corresponding credential. OAuth may also need a Google Cloud quota project with Vision enabled and billing configured. API keys and project settings persist in the browser. OAuth access tokens stay in the current book session. The app sends credentials in request headers. Cloud Vision produces plain text, so inline formatting and note markers need review. API error responses and missing word geometry are recorded as failed stages.

## Comparing schema assignment models

Open **Edit book → Schema assignment** (`#structures`). The fixed input is the transcription model saved for this book on the Transcription models page. Choose sample pages, candidate schema models and a reference model. Each candidate receives the same transcription and neighboring text. Missing transcriptions are prepared once per page, then reused. Its progress bar covers those prerequisites and every selected schema model, including the reference. The table shows a single complete book-cost projection, region disagreements with the reference, schema validation and schema-call time. Invalid results remain visible with their costs and validation details.

The visual comparison shows every model’s unit tree in columns, with the reference pinned while scrolling on wider screens. Unit boxes, indentation and continuation labels expose grouping. Matching region labels, colors and text snippets connect the same print across models. Amber and explicit labels identify changes to grouping, labels, types and page-edge flags. “Focus on differing regions” filters the region navigator and line-join rows while trees retain context. Selecting a region highlights it across models and opens its inspector. That inspector shows ancestry, grouped regions, reading order and links in plain language. Its scan and fixed transcription can be expanded for source review. Join previews show the actual neighboring text and highlight complete grapheme clusters at the join, retaining Indic conjuncts and joiners. Raw JSON and validation messages are available under collapsed diagnostics.

Comparisons ignore arbitrary unit IDs and retain ancestry, membership, grouping and order. They localize a unit’s metadata changes to its own members. Reading-order differences compare flow membership and position, and links compare their source, marker and destination. Changes elsewhere in a containing unit’s tree do not propagate to every member’s comparison. Agreement and schema validity require source review to judge accuracy. The final “Choose the schema assignment model for this book” section has its own model selector and explicit save button. Saving this choice preserves the transcription model. Continue to Make pages from the end of this page, creating an editable browser copy first when needed. Changing it reuses compatible transcription caches. Schema results for other models stay available. The original Argon-high results retain their legacy cache paths. Selection settings, including the inspected region, live in work/structure-lab/ and all trials are included in book exports.

Frozen transcription profiles are methods 065–069, with the original Argon-high schema assignment in method 070 and source hashes under method 065. Methods 071 and 072 add Cloud Vision’s two OCR modes. Methods 073–076 add Argon low, Flash, Flash-Lite and Terra schema assignment. Their shared source archive and hashes are under method 071.

## Running it

Serve the repository root and open the app, for example:

```sh
uv run --offline python -m http.server 8765 --bind 127.0.0.1      # from the repository root
open "http://127.0.0.1:8765/webapp/"
```

Then, in the library:
- **Open a PDF or a .chaya.pdf…** A plain PDF starts a new book, or opens the book this browser already has from it. A `.chaya.pdf` goes into this browser, or offers to replace the browser's copy, open it, or keep both.
- **Books in this browser:** open one, download its `.chaya.pdf`, or delete it.
- **Open a PDF by URL** (`?book=<url>`): a book's PDF on a server opens read only, such as `http://127.0.0.1:8765/webapp/?book=../outputs/books/kale-1913.chaya.pdf`. Corrections are kept in the browser (IndexedDB), and can be exported and imported, or saved with the book as a `.chaya.pdf`. A plain PDF starts a new book. Book folders are not opened by URL; a `.chaya.pdf` publishes a book.
- A plain PDF can also supply `&proposal=<url>` to preload a saved unit-type proposal. Its source PDF hash, type rules, page evidence and call metadata are checked before review. Reviewing this saved result and creating the book require no API key. The user must approve the types. Saved call records and optional transcription/schema model choices are copied into the created book. The proposal review's **Saved proposal JSON** section provides the transferable package. Locally edited proposals take priority when reopening the same PDF.
- **Book folders (the repository's tools):** in Chrome or Edge, a folder on disk can be opened and corrected in place.

Keeping books in the browser, and the hashing that checks a `.chaya.pdf`'s original, need a secure context: `https`, or `localhost`. Served over plain `http` to another name (such as a Tailscale address), the app opens a `.chaya.pdf` read only, and says so in the library.

For access from a phone or another device on your tailnet, run `tailscale serve --bg http://127.0.0.1:8765` and open `https://<machine>.<tailnet>.ts.net/webapp/` with Tailscale connected. On macOS the CLI may be `/Applications/Tailscale.app/Contents/MacOS/Tailscale`. [Tailscale Serve](https://tailscale.com/docs/reference/tailscale-cli/serve) provides HTTPS within the tailnet. Keep the host and local server running. Browser books and API keys are separate on each device and origin, including when switching from localhost to HTTPS. Export a `.chaya.pdf` and open it in the other browser to transfer a book and its saved work.

If the page says the app could not start, a content or ad blocker has probably blocked one of its files (the browser's console names it): allow the page in the blocker. File names that blockers match, such as "pageview" or "analytics", are avoided.

The app is static, so it can also be hosted anywhere (GitHub Pages and the like); `?book=` then needs a URL the browser may fetch.

## Books

A book is kept as a book folder. The PDF is the only input format (the user's decision, 2026-11-07): page images are to be made into a PDF first, for example with img2pdf.

```
book.json     {format: "book-folder", version: 1, book_id, title, types: "types.json", style: "style.json" (optional),
               pdf: {path: "source.pdf", name, sha256, page_count},
               pages: [{id, document, label, valid, pdf_page, width, height, image (optional), source}]}
source.pdf    the book's source PDF, exactly as given
types.json    the book's type list
style.json    optional: the book's style sheet (schema 0.3), named in book.json as style
pages/        one page document per page: the model's results, never changed by the editor
edits/        the user's corrected page documents, one per corrected page (no history)
work/         processing records, cached readings and structures, immutable API attempts, trial references and costs
images/       page images: a cache of pages drawn from the PDF (or, in the repository's folders, their rendered images)
```

**Where a book lives:**
- **In the browser** (the usual place): the origin private file system, under `books/<name>/`, in any current browser. It is saved as you work. The address carries `?local=<name>`, so a reload reopens the book. The browser is asked to keep this storage, but it can be cleared, so a book worth keeping should be downloaded as a `.chaya.pdf`.
- **On disk** (Chrome and Edge): a folder opened with the File System Access API, as the repository's tools make them.
- **At a URL**, read only: a book's PDF.

**Page images:** a page is drawn from its PDF page, at exactly the `width` × `height` its regions are measured in, when it is first needed. A book in the browser keeps the drawing in `images/`; that cache is not part of the book's data. The size comes from the page's analysis when the book is made: a scanned page at 300 dpi, or the scan's own resolution when lower; any other page at 300 dpi. A page with an `image` file (the repository's folders) uses that file.

**A `.chaya.pdf`** (`js/chayapdf.js`) is the book as one file: its PDF with the book's data attached. The name is only a convention: the app recognizes a book's PDF by what is inside it, an attached `chaya.json` of format `chaya-book`, whatever the file is called.
- **What it holds:** the original PDF's bytes, unchanged, followed by one incremental update. The update attaches `chaya.json` (compressed, as an embedded file, also listed in the catalog's associated files).
- **chaya.json** is `{format: "chaya-book", version: 1, original: {name, sha256, length}, saved_at_utc, saved_by, files}`, where `files` holds the folder's files but `source.pdf` and `images/` (JSON files as objects, others as text).
- **Recovering the original:** a comment right after the original's bytes records their length and sha256, so the original is recovered exactly by cutting the file there, and checked.
- **No growth:** saving again rebuilds the update on the original, so the file does not grow.
- **The PDF's own attachments** are kept, in one flat list with `chaya.json`.
- **Viewers:** it opens as the book in any PDF viewer.
- **Encrypted PDFs** are refused.
- **Saving:** Export's "Save as .chaya.pdf" saves it. In Chrome and Edge it saves into a chosen file, and "Save to … again" writes the same file again; elsewhere it is a download. Export also offers the source PDF alone.

**Edits:** an edited document keeps its `source` and adds `source.edited` (when, from which model result). A page whose corrections are all undone goes back to having no file in `edits/`. Versions that do not pass the checks yet are kept in the browser as drafts, and reopened with the page.

**Tools** (repository side):
- `tools/make_book_folder.py` makes a book folder from a transcription run (method 052, 054, 055 or the PDF methods' outputs). It upgrades 0.1 documents to 0.2 with `schema/inline.py`, gives each region its `box` from the region step's box, hard-links the page images, and hard-links the source PDF (`tools/add_source_pdf.py`, which also adds it to an existing folder).
- `tools/make_chaya_pdf.mjs FOLDER [OUT]` makes a folder's `.chaya.pdf`, reads it back and checks it. Each page entry gains its width and height, and drops its image.
- **The books so far** are in `outputs/books/`, as folders and as `.chaya.pdf` files:

| Book | Folder | .chaya.pdf |
|---|---|---|
| Kale, all 252 pages (method 052, run `book-002`) | `kale-1913-book-002` | `kale-1913.chaya.pdf`, 15.6 MB |
| Telang, the 195 pages with text (methods 052 and 054) | `telang-dli-book-001` | `telang-dli.chaya.pdf`, 67 MB |

  `kale-1913-formatting-test` and `telang-dli-formatting-test` hold the six pages of method 055's formatting test. A private book ("vachana", methods 056–062) is kept on the machine only, out of the repository.

## Code

| File | What it does |
| --- | --- |
| `js/schema.js` | The schema checks: a port of `schema/book.py` (`validate`, `check_types`, `check_document`) |
| `js/assemble.js` | Pages into a book: a port of `book.py assemble` |
| `js/inline.js` | Spans and markers: a port of `schema/inline.py`, plus span editing |
| `js/ops.js` | Every edit, as functions on a page document |
| `js/store.js` | Books: in the browser (origin private file system), on disk (File System Access API), at a URL, or from a `.chaya.pdf`; pages drawn from the PDF; saving as a `.chaya.pdf`; corrections, drafts and remembered folders in IndexedDB |
| `js/chayapdf.js` | A book inside its PDF: writing and reading a `.chaya.pdf` (a small PDF parser for the catalog and cross-references; the original recovered and checked) |
| `js/style.js` | Styles (schema 0.3) as CSS |
| `js/styleview.js` | The style sheet view, with its preview |
| `js/typesview.js` | The type list view |
| `js/type-setup.js` | Initial unit-type proposals and review in the new-book form |
| `js/page-browser.js`, `js/type-proposal.js` | Lazy PDF thumbnails, sample selection and source-checked saved proposals |
| `js/pageimage.js` | The page image with outlines, selection, box handles and drawing |
| `js/editor.js` | The units and their editable lines, reading typed text back into text and spans; the inspector |
| `js/reader.js` | The assembled book as one text (as printed, with rows side by side), the source preview, the plain-text and HTML exports |
| `js/readersview.js`, `js/reader-controls.js` | Per-book transcription model settings, sample trials and source review |
| `js/main.js` | The app: the library (opening PDFs and `.chaya.pdf` files, books in this browser), the new-book form, the modes and routing, undo, checking and saving, the problems and export views |
| `js/local/` | Method 063's local step, extending method 043 with joined glyph-fragment bands: `ink.js` (ink components, page angle, text lines), `regions.js` (rule pieces, line ownership, outlines from the nearest-ink partition), `config.js` (its settings), `worker.js` (runs it for the editor) |
| `js/pipeline/` | Making page documents: `pdf.js` (a PDF page's analysis, and the page drawn at its size), `prompts.js` (both calls' prompts and schemas from a type list), `steps.js` (requests, box scaling, region records, the page document), `images.js` (overview, cut-outs and context on a canvas), `run.js` (independent cached stages), `readers.js` (profiles and costs), `split.js` (reading and structure contracts), `ocr.js` (local OCR), `compare.js` (checked-reference and disagreement scores) |
| `pipeline/` | The methods' prompt templates, schema template and prices (copies; a test checks them) |
| `vendor/pdfjs-6.5.438/` | pdf.js (Apache-2.0), unchanged, with its decoders and fonts |
| `types/` | The repository's type lists (copies of `schema/types/`; a test checks them), offered when making a book |
| `schema.json` | A copy of `schema/schema.json` (a test checks that they are the same) |

## Tests

```sh
node --test webapp/test/*.test.mjs                 # from the repository root; needs uv and outputs/books/
node webapp/test/browser.mjs SCRIPT.mjs            # drives headless Chrome through a script (see the file)
```

- `parity.test.mjs` runs the app's checks and assembly against `book.py` and `inline.py`: every page of the two books (447), 233 broken copies of 23 of their pages (12 kinds of fault, such as an unknown type, a duplicate unit, an open end on a middle child, a span outside its text or an unknown anchor), the two assembled books, and inline parsing cases.
- `ops.test.mjs` runs every kind of edit on real pages, checks the results, and undoes them.
- `fragment-lines.test.mjs` checks detached glyph parts, separate short lines, stable line IDs, text and span preservation, repeatable updates, and relations addressed by line. The current settings match method 063.
- `local.test.mjs` runs the port with the legacy settings on six pages against method 043. The threshold, component count, character height, page angle and line centers are identical; every region gets the same line pieces; and the outlines' pixel overlap is 0.98–1.0 per region. It also checks that recomputed outlines keep every line's text.
- `pipeline.test.mjs` checks the region and transcription prompts and schemas against methods 042 and 055 for every type list (byte for byte), and the copied templates and type lists.
- `pagedoc.test.mjs` builds the page documents of method 055's six test pages from their saved answers and region records, and compares them with method 055's. Two additions are left out of the comparison: each region's `box`, and a relation without a marker sign anchored to its line's only marker.
- `readers.test.mjs` covers reader options, costs, reading contracts, authoritative reader text, OCR word mapping, checked-reference scoring, cache reuse and invalidation, failed paid calls, concurrency, neighbor context and URL-book export persistence.
- `browser.mjs` is a small headless-Chrome driver over the DevTools protocol (no packages), for scripted runs of the app itself.

## Not yet

- **Preprocessing** such as `render_pages.py`'s background flattening and rotation, and method 054's cut-outs for dark-band pages.
- **Automatic retries** of schema-invalid structure results. Use the Transcription models tab’s explicit structural retry to make a new call.
- **Interruptions below the top level of a flow** (schema/README.md), as on Kale page 34.
