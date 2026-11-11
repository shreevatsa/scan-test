# The web app: reading and correcting digitized books

A static web app for the books this repository's methods produce. It runs entirely in the browser with plain HTML, CSS and JavaScript modules, bundled PDF and OCR runtimes, and no build step. A book consists of its PDF and page documents (schema 0.2 and 0.3, [schema/README.md](../schema/README.md)), kept in the browser and saved together as a **.chaya.pdf** ("Books" below).

The five workflow tabs are **Pages · Regions · Text · Read · Export**.

- **Pages** browses the scans and shows all three layers of progress. Open a thumbnail for a scan preview before processing anything.
- **Regions** finds page regions and contains the book's unit types. Move reviewed pages on to Text together.
- **Text** lists pages with accepted regions, compares and runs transcription models, and moves reviewed transcriptions on to Read.
- **Read** shows accepted text. Its Units and links view runs completion separately. Completion comparisons, Problems and Style sheet are also here. Omitted page ranges are marked, and units do not join across those gaps.
- **Export** saves the book PDF and source PDF at every stage. Text-based exports become available after some transcription exists.

Text and Read are disabled until pages are moved on from the preceding stage. Legacy documents infer acceptance. A book with pending pages opens at Pages, while a complete legacy book opens at Read. Old bookmarks route to their corresponding views. Each stage grid opens the page editor with previous/next eligible page, a next-flagged-page button and links to the same page in other stages. Regions, Text and Read each open the editor with controls for that stage.

The grids support checkbox selection, shift-click ranges and fields such as `all` or `1-50,62`. With no selection, actions target displayed pages. Filters cover layer states, flags, earlier type revisions and suggestions. Explicit selections hidden by a filter are counted in the selection summary. Moving on and sending back are saved in the document and survive a book PDF round trip.

Regions has three collapsible sections. **Unit types** holds the editable type list and the optional sample-page proposal and comparison. **Find regions** holds the finder choice, Draw by hand, credentials and the inline finder comparison. **Page regions** starts open and contains page selection, processing and review. A new book with draft types opens Unit types. The section summaries show the type count and selected finder. The page grid has colored region boxes and layout grouping, rarest first. The editor keeps the type colors and counts beside the scan. **Edit type list** opens the full list in a dialog and retains the current page and selected region after a revision. “Start by hand” creates an empty provisional page. Draw boxes, choose their types, set reading order and continuation flags, split at a line piece or merge same-type regions, then move the page on to Text. Existing transcription is shown read only. Keys 1–9 assign the corresponding printed type to the selected region, and Tab or Shift+Tab selects the next or previous region while working on the scan. On phones, the scan and controls stack vertically.

Unassigned model regions are hatched and have “Give it a type” controls. Review flags include uncertain or unknown types, missing order, empty regions, uncovered printed lines, overlapping boxes, provisional containment problems, continuation disagreements and layouts occurring fewer than three times. Text and completion flags are computed separately for their stages.

“＋ Type” adds printed types and containers. A container starts with at least one child type. “New type…” in a region menu adds a printed type for immediate assignment. Regions › Unit types has forms for descriptions, renaming, merging, splitting, containment, flow, printed class and unused-type removal. “Edit book details” changes the title, description, languages and transcription conventions. Each operation previews its reach across model pages, saved corrections and drafts, with affected PDF pages, follow-up work and estimated model cost.

Renames update region and unit types, containment rules and the style sheet, with old names recorded as aliases. Merges require the same printed class and furniture role, or two containers. An existing target style takes precedence. Transcription is preserved. Containment changes rebuild provisional or unprotected units where needed and flag protected units for manual repair. Figure-class changes retain text in provenance and flag region discovery. Unused-type removal checks every document version and draft.

**Unit types → Propose or load a type list** uses the selected grid pages and saves attempts inside the book. A reviewed proposal can replace the list while every page’s layers are unprotected. The preview identifies the documents to clear and the region work to repeat. Previous types and page versions are retained in revision history. Review questions link to cited sample pages and retain recorded decisions. Revisions, aliases and historical prose notes are saved with the book. Multi-file operations use a recovery journal and a book write lock, including draft migration and coherent book exports. Work records retain their original bytes, with aliases applied when reading copies.

- **Page editing** shows the scan and line outlines beside the transcription.
  - Regions edits boxes, region types, reading order and continuation flags. Its transcription is read only.
  - Text edits line text, inline formatting, printed note markers and the printed page label. Boxes, unit grouping and line joins are locked. “Review re-transcription of this page” selects the page in the Text overview with reprocessing enabled.
  - Read edits unit types, numbers, labels, grouping, open ends, note links and line joins. Transcription and page geometry are locked. A unit can be split between children, joined to the next unit, wrapped, unwrapped or converted to page furniture. Unit and line presentation styles remain available in this fallback editor.
  - Hovering a line highlights its outline. Zoom, fit width and fit height work in every focus. Fit height is retained across pages and resizes.
  - Text inserts note markers at the caret and changes their printed signs. Read assigns their note links. Line joins have explicit controls and can also be cycled at a line’s right edge in Read.
  - Changes are checked and autosaved. Invalid edits are retained as drafts. Undo and redo cover page edits. “Revert page” returns to the latest stage save.
  - Focused saves preserve newer work in other layers. Concurrent changes to the same text or unit grouping require a fresh selection or reload.
- **Read:** the whole book as one text, assembled from its pages as `book.py assemble` does, with the user's corrections.
  - Headings, verses, paragraphs, tables and notes are shown according to their types, with formatting. Figures are shown as their part of the page image, with their label.
  - Note markers link to their notes and back.
  - The printed page number is shown where each page starts.
  - Clicking a passage opens its scan and clickable unit ancestry in a side panel. Editable books expose unit fields, grouping, line joins and note links there. Double-clicking opens the page fallback.
  - A cross-page unit has page-fragment navigation. Its semantic fields and wrapping apply across all fragments. Splits and open ends apply to the selected fragment. Joining at a page break opens the matching ancestor paths on both pages. Nonconsecutive pages and conflicting metadata require review.
  - Each saved change reassembles the reading and retains its scroll position. Problems appear beside their passages and in a list. Read-only books expose inspection controls.
  - Text can be read before completion, with provisional grouping identified and line ends treated as spaces until completion. The side panel stacks below the text on narrow screens.
  - "Show the units" shows the unit tree in the margin.
  - Units in a row stand side by side where the width allows, and one under the other where it is narrow.
  - "As printed" (for a book with a style sheet) sets each unit as the book prints it: fonts, sizes, alignment, margins, indents and spacing, from the style sheet and the units' own styles, at the book's measure.
- **Regions, Unit types** the book's type list, its own part of the schema (the format, `schema/schema.json`, is shared by every book):
  - the tree of what may contain what, from each flow's top level, with how many units of each type stand in each place;
  - the page furniture types;
  - a table of each type: its region class, what it may contain, its flow, language, numbering, total and description;
  - the relations, inline kinds and transcription conventions.

  Operation forms preview and apply changes. “Download types.json” gives the file, and the revision history records applied operations.
- **Read, Style sheet** the book's style sheet (schema 0.3), seen and edited:
  - the base style of all text and each type's style (font role, size, leading, weight, italic, alignment, left margin, first-line indent, space above and below), in a table where an empty cell inherits the base;
  - the font roles and their font families;
  - the page's size and text box (whose width is the measure).

  A preview of a few pages, set as printed, follows every change, and each change is checked against the schema. "Save" writes `style.json` into a book folder (and names it in `book.json`). For a book opened by URL, the sheet is kept in this browser over the served one, until "Back to the book's own". "Download style.json" gives the file. A book with no style sheet can start one from plain defaults. Units' and line pieces' own styles are set in the page view.
- **Read, Problems** what the checks find across the book (as method 047's `book_report.py`):
  - pages whose document fails the checks (the schema and the type list's rules, as `book.py check`), whose corrections are kept as drafts until they pass;
  - page breaks where units marked as going on do not join;
  - printed page numbers out of sequence. Pages that print no number, as a chapter's first page, are listed apart, as a note;
  - which pages the user corrected, and the transcription model's notes.
- **Export:** the book as one document of the book schema (JSON), the book as plain text with page references (a figure as `[figure: label]`), the book as one web page (HTML, as printed where the book has a style sheet, with its figures embedded), and the user's corrections as one file (and importing such a file).
- **Stage processing** makes page documents in the browser with the user's API credentials. Regions finds and types regions with its selected finder, Text runs the selected transcription model, and Read completes units and links with its selected model. The comparison views offer an editable copy of a URL book. For an excerpt with a larger cost-projection target, “Start from the full PDF with these settings” opens a new-book form carrying the current types and model choices.
  - **Making a book.** Open a plain PDF from the library to create a book from the whole PDF or a page range. The form defaults to common draft types, which can be refined in Regions. Alternatively, propose book-specific types from sample pages or supply an existing list. Browse all PDF pages as thumbnails, open larger previews and check pages to include. The sample field accepts `all`, ranges such as `1-50`, and lists such as `1, 7, 43-44`. Request a proposal from GPT-6.1 Terra with reasoning off or Gemini 4 Argon with high thinking after checking the credential. The review shows descriptions, containment rules, reading flows, links, inline kinds, transcription conventions, supporting page references and questions. Descriptions and grouping rules can be edited before approval. A model proposal must be reviewed before use. Continuing from an excerpt carries over that book's types and model choices.
  - **Unit-type proposals** use rendered page images and the user's description. The default sample spans the beginning, middle and end, including two neighboring middle pages. The sample is editable to include contents, section openings, ordinary text and special layouts. Each explicit proposal is one model call whose estimated charge is shown with the result. API keys are configured in this browser. Attempts and the latest saved proposal are retained by PDF hash before a book exists. Creating the book includes these records in its work files for export. The recipes are [method 077](../methods/077-gpt-6-1-terra-unit-types/README.md) and [method 078](../methods/078-gemini-4-argon-high-unit-types/README.md).
  - **The source PDF:** the PDF is copied into the folder as `source.pdf`, the book's source.
  - **Page images:** each page is analyzed (its images, where they are drawn and how much of the page they cover, and its text layer's characters) and rendered with the bundled pdf.js. A scanned page (an image covering at least half of it) is rendered at 300 dpi, or at the scan's own resolution when that is lower; any other page at 300 dpi. The cap no longer applies to a digital page with a small ornament, which it used to lower to 240 dpi.
  - **What each page records:** its PDF page, its rendering, its images and its text layer's size.
  - **Regions** use the selected finder and method 063's local step in the worker. Models use method 042's book-specific prompt and schema. Free finders supply coarse blocks for manual review. Per-finder results are saved under `work/region-finders/<page>/<profile>.json`. Normal stage processing also writes the active `work/<page>.regions.json` and merges an editable provisional page document.
  - **Transcription** uses the per-book choice of Argon low or high, Flash low, Flash-Lite minimal, local Tesseract, or Cloud Vision Text Detection or Document Text Detection. The language models receive the overview and numbered region cut-outs. Tesseract and Cloud Vision map full-page word boxes to shared source-line polygons.
  - **Schema assignment** uses text-only input with Argon high or low, Flash low, Flash-Lite minimal, or Terra with reasoning off. It builds unit trees, joins, continuations and note links while the app retains the selected transcription model’s text. Argon high is the default for existing books. Transcription and schema assignment are saved independently for each model. Batches transcribe all queued pages before schema assignment, so adjacent readings are available.
  - **Retries and caching** reuse matching successful stages. Transcriptions also match by image, model and region/line polygons, so changing types, conventions or reading order reuses the reading. Older reading records gain this geometry key when used. Completion takes current corrected text, formatting and note markers, retaining the old completion fingerprint when their content is equivalent. A failed structural call can be retried without repeating transcription. The Transcription models tab also offers an explicit new structural call for a selected result.
  - **Changed-region transcription** compares the current shapes with the same model's saved reading. Only changed or added text regions need new model output. The result combines them with compatible saved regions. After a box edit, open Text, include the processed page and click “Transcribe”. Leave “Request fresh model results” unchecked to use repairs. “Review re-transcription of this page” prepares that selection from the editor. An explicit fresh request processes the whole page. A full pass is also needed when there is no compatible saved text for the scan, chosen model and OCR language.
  - **OCR repairs** reuse Cloud Vision's saved full-page word boxes when available, with no new Vision charge. Tesseract runs locally on the full page to keep word assignment consistent, then merges only the changed regions. Completion uses the full current transcription, including human corrections.
  - **Repair recovery** archives the prior reading and retains each contributing call. Completed partial responses can be reused after an interrupted save. An unresolved partial attempt requires review before an explicit fresh whole-page request. A newer cached reading is preserved when an older call finishes later.
  - **Saving stages** merges the latest page and preserves edited or accepted layers. Conflicting candidates are recorded in `source.suggestions` with their work-record paths. A valid draft participates as edited content. An invalid draft stops the model step. A journal in `work/pending-stage/` makes the model document, manifest and removal of the merged edit recoverable together. The previous protected page is retained in `work/history/`. Opening or exporting a book recovers pending saves. Comparisons and read-only books keep their trials in work records. Suggestions open in the shared review dialog.
  - The keys are kept in the browser (IndexedDB) and sent only to OpenAI and Google. Costs are estimated from returned usage, including thinking, cached input and OpenAI cache writes, at the recorded paid-tier prices. Unavailable costs are displayed explicitly and stop further calls in the batch.
  - **Processing a book** starts in Regions. Select pages, check the credential and find regions. Move reviewed regions on to Text, transcribe there and move reviewed text on to Read. Complete units and links in Read’s grid. Each stage has a spend threshold, progress and a stop button. Existing layers are skipped unless included explicitly. A separate checkbox requests fresh model results. Compatible cached trials are reused. Review Problems, correct individual pages and save the `.chaya.pdf` from Export.

Book cost projections use whole-page samples and exclude composite region repairs. An estimate is unavailable when only repaired samples remain. The saved API-attempt ledger includes repair and retry charges. Composite readings deduplicate contributions from a reused OCR response by its call path.

## Reviewing suggestions and model differences

A saved result held back by protected work appears as a suggestion in its stage grid, page editor and reading panel. Open it to compare current and proposed versions against the scan. Keep the current version, take the proposed version or dismiss the suggestion. Saving a choice protects the reviewed layer. A partial choice retains the suggestion for the remaining items.

For a repair using the same model as the page, the suggestion keeps current transcription in unchanged regions, including human corrections and printed-marker identities. Those regions are labelled “Current text retained”. Model comparisons continue to show the model's saved text.

The same dialog is available from transcription and completion comparisons. Choose a whole page, one region or one text line, and correct the chosen line when needed. A grouping choice replaces the smallest complete shared subtree. Changes to ancestry, flow or linked units may require the whole page. The preview reports the number of regions affected, transcriptions becoming pending and removed links. Invalid or stale choices require a fresh review.

Reviewed text supplies checked-error scores. Completion scores use reviewed structural fields whose input and current page choices still match. Counts of model differences remain separate. Review saves and their evidence share a recovery journal, with the previous page retained in work history. Saving choices requires an editable copy of the book.

Type discovery can run both existing proposal models and build one draft. It identifies shared names and model-specific types, shows definition differences, and lets the reviewer keep, drop or choose a source definition. Approval and application use the same type-list preview as single-model proposals.

## Choosing and comparing region finders

Open **Regions → Find regions → Compare finders**. Use the page grid selection or enter sample positions with `all`, ranges or lists. Compare Terra, Astra low, GPT-6.1 Sol low, the four Gemini variants, local line blocks and Tesseract paragraphs. The reference finder is included in each run. Select a free reference and free candidates to compare with zero API cost. Credential checks are grouped by provider and verify access to the selected models. Progress, stopping, a spend threshold and cache reuse work as in the other comparisons.

Every saved candidate has a scan overlay, its region types and reading order. Amber blocks need a type. A page already prepared in Regions can be reviewed against a candidate in the shared dialog. Replacing its layout is a whole-page decision, with a preview of affected transcription. Exact matches to explicit human choices are counted separately from differences against a model reference. Click **Use this finder** on a result to save the choice, then process selected pages in Page regions. Existing work remains protected through suggestions.

Free blocks are intended for manual correction. They guess only coarse classes and map a class to a book type only when exactly one matching type exists. All local guesses are marked uncertain. Tesseract uses automatic segmentation mode 3 for layout and the selected OCR language pack. Its transcription path uses mode 6. The region choice and shared OCR language pack are saved per book. The single whole-book cost estimate includes region finding plus the selected transcription and completion sample costs. It assumes downstream costs stay at their sampled level and requires all three stage samples.

Methods 079–086 retain the nine-page public benchmark and frozen runtime. The 54 model calls cost an estimated $1.700885. Astra, Sol and Argon high matched every reference passage boundary and grouping in this run. Semantic type and continuation accuracy require separate review. Lower Gemini settings and both free finders had substantial grouping errors on several pages. See NOTEBOOK.md for the full table.

## Choosing and comparing transcription models

Open **Edit book → Transcription models** (`#readers`). This also works on published books opened by URL. The selected transcription model, schema assignment model and OCR language pack are saved per book. Trial page selections, reference, inspection choices and estimate page count survive reload. Argon low is the default transcription model for existing books. Page-region detection uses the finder selected under Regions. The page runs from sample comparison to source review, then ends with “Choose the transcription model for this book”. Select a model and press “Use transcription model for this book” to save that choice, then continue to the schema comparison. Whole-book estimates hold the selected schema assignment model fixed across transcriptions. Its optional execution checkbox is under “Whole-book estimate settings”.

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
| `js/layers.js` | Layer content, legacy acceptance, edit protection and acceptance transitions |
| `js/pipeline/provisional.js`, `js/pipeline/apply.js` | Provisional region documents and pure stage merges used by the processing pipeline |
| `js/workflow.js`, `js/pagesview.js` | Stage availability, routing, transitions, page grids and previews |
| `js/regionsview.js`, `js/book-types.js`, `js/flags.js` | Regions editing, atomic type additions and initial lists, stage review flags and layout grouping |
| `js/key-check.js`, `js/pipeline/batch.js` | Credential tests and the shared stage processing loop |
| `js/store.js` | Books: in the browser (origin private file system), on disk (File System Access API), at a URL, or from a `.chaya.pdf`; pages drawn from the PDF; saving as a `.chaya.pdf`; corrections, drafts and remembered folders in IndexedDB |
| `js/chayapdf.js` | A book inside its PDF: writing and reading a `.chaya.pdf` (a small PDF parser for the catalog and cross-references; the original recovered and checked) |
| `js/style.js` | Styles (schema 0.3) as CSS |
| `js/styleview.js` | The style sheet view, with its preview |
| `js/typesview.js` | The type list view |
| `js/type-revisions.js`, `js/type-operations.js` | Pure type-list migrations and reach previews, editing forms and review decisions |
| `js/type-setup.js` | Sample-page type proposals and review in new books and Regions |
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
- `readers.test.mjs` covers reader options, costs, reading contracts, authoritative reader text, OCR word mapping, checked-reference scoring, cache reuse and invalidation, failed paid calls, concurrency, neighbor context and URL-book export persistence. Integration cases check request and fingerprint parity, geometry-key migration, corrected page inputs, drafts, protected edits and comparison isolation.
- `store.test.mjs` checks style saving, journal recovery at every stage-save file boundary, failed writes and retries, newer drafts, cross-instance edits and concurrent manifest updates.
- `stages.test.mjs` validates provisional documents on the nine public region references and checks stage states, legacy blank/illustrated pages, protected edits, geometry and text compatibility, marker parsing, invalid candidates and note-link matching. The pipeline uses these foundations. The five-tab interface and page grid are step 3 of HANDOFF.md.
- `workflow.test.mjs` covers stage availability and routes, reading gaps, acceptance persistence through a book PDF round trip, batch stopping, credential errors and stale checks.
- `finders.test.mjs` checks block grouping, coarse type guesses, saved choices, reviewed layouts and frozen provider requests.
- `review.test.mjs` checks human choices, marker links, stale scores and snapshots, subtree scope, replacement stages, interrupted review saves and merged type drafts.
- `editing.test.mjs` checks focus locks, provisional reading, logical-unit fragments, semantic metadata, stage-preserving saves, stale snapshots, cross-page joins, recovery after interrupted two-page writes and coherent export.
- `browser.mjs` is a small headless-Chrome driver over the DevTools protocol (no packages), for scripted runs of the app itself.

## Not yet

- **Preprocessing** such as `render_pages.py`'s background flattening and rotation, and method 054's cut-outs for dark-band pages.
- **Automatic retries** of schema-invalid structure results. Use the Transcription models tab’s explicit structural retry to make a new call.
- **Interruptions below the top level of a flow** (schema/README.md), as on Kale page 34.
