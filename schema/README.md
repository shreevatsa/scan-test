# Draft schema for a digitized book (version 0.2)

This is a draft data model for a scanned book turned into text, where every unit of text links back to its regions and polygons on the page images. Claude wrote it on 2026-11-05, after the user's decisions in the continuation review:
- continuation depends on what a unit is;
- units nest: a verse quoted in a speech, a verse with its commentary, a set of verses with their translation;
- units should be book-specific, with groups the app can show on their own;
- transcription is a second call, which may also assign regions to larger units, and a single call is worth trying too.

Methods 044–054 produce version 0.1 page documents (transcription and unit tree on method 043's regions, or in a single call), and method 055 version 0.2 documents with inline formatting. The examples are built from method 041's regions with unit trees Claude wrote by hand. The user hasn't reviewed them.

## In brief

- **Regions** belong to pages: an outline (polygons), line pieces and, once transcribed, the text of each line piece.
- **Units** form a tree over the regions, with types from the book's own type list. A unit owns the regions printed as it and contains smaller units, in reading order.
- **Continuation is not stored.** A unit continues across a page break exactly when its regions lie on both pages, at whatever level that happens.
- **Pages are processed one at a time** into page documents, whose units may be open at the top or bottom of the page. A local step joins the open ends into the book.
- **Flows** keep separate sequences apart, such as the main text and the footnotes. **Furniture** (running headers, page numbers, margin line numbers) belongs to its page, not to any unit.
- **Relations** cover what the tree cannot: a footnote marker pointing to its note, or an apparatus entry giving the readings of a stanza.

## Files

| File | What it is |
|---|---|
| `schema.json` | JSON Schema (2020-12) for the three document kinds: a type list, a page document and a book document |
| `book.py` | Checks documents against the schema and the rules below, assembles page documents into a book, and prints a book's tree |
| `inline.py` | 0.2: turns tagged model text into plain text and spans, and upgrades 0.1 page documents |
| `test_book.py` | Tests for `book.py`, including rule violations that must be caught |
| `types/<book_id>.json` | Type lists for all ten books, all reviewed by the user: Hertel's Pañcatantra, Kale 1913 and Dutt's Mahābhārata, and Claude's drafts for Telang, Cole, Ten Princes, the two Nītiśataka editions, Vavilla and the Gita |
| `examples/<name>/tree.txt` | Hand-written unit trees over method 041 regions, for three page runs |
| `examples/build.py` | Builds `pages/*.json`, `book.json` and `tree-printed.txt` from each `tree.txt` |
| `viewer/build.py` | Renders a run's page documents as a static, read-only HTML viewer: each page image with its region and line outlines next to its units and text, with note markers linked to their notes |

```sh
uv run --offline python schema/test_book.py
uv run --offline python schema/book.py check schema/types/*.json schema/examples/*/pages/*.json schema/examples/*/book.json
uv run --offline python schema/examples/build.py schema/examples/dutt-17f-002-003
uv run --offline python schema/book.py tree schema/examples/dutt-17f-002-003/book.json
```

No JSON Schema package is installed in the environment, so `book.py` includes a validator for the subset of the standard that `schema.json` uses.

## The book's type list

Each book has its own list of unit types (`types/<book_id>.json`), which the user can edit. Each type has:
- **`description`:** what the unit is in this book. Descriptions go into the prompts.
- **`region`:** the book-neutral region class from method 037 (verse, paragraph, heading, lead_in, note, …). A type with a class is printed as regions, so a region of that type can be found on the page. A type without one, such as a group, is a container only.
- **`contains`:** the unit types allowed as its children.
- **`flow`:** if set, the flow in which units of this type may stand at the top level.
- **`role: furniture`:** page furniture. Its regions belong to the page and to no unit.
- **`lang`** and **`numbered`:** a default language, and whether the unit usually carries a printed number.

The type list also names the book's flows, its relation types, and its transcription conventions.

The app records numeric revisions in `source.revision` and operations in `source.revisions`, with a revision number, UTC timestamp, author and operation list. Operations cover descriptions, book metadata and conventions, adding, renaming, merging, splitting, containment and flow, printed class, unused-type removal, list replacement and resolving discovery questions. `source.aliases` maps historical names to current names. Removed names are reserved in `source.retired_types`. Common starter lists have `source.draft`. Historical prose values of `source.revision` count as revision 1 and move to `source.legacy_revision` on the first type-list operation. These fields live in free-form provenance.

Replacement is allowed while every page’s layers are unprotected, with drafts also protecting their pages. It clears current page documents and sets `source.region_reset_revision` to invalidate earlier region trials. `work/type-revisions/<n>.json` retains prior types, style, manifest and changed document versions. `work/pending-types.json` journals multi-file writes for recovery. Original work records are preserved, and readers map aliases on copies of region and unit data. A revision preview fingerprints the saved inputs, so concurrent changes require another preview. Book exports take the same write lock to capture consistent types and pages.

Migrated page versions record `source.types_migration_revision` separately from the revision under which a model layer ran. `source.type_review.regions` identifies figure-class changes needing region discovery, `units` identifies provisional units needing completion, and `manual` flags protected units needing repair. Values are the revision that requested the work. Protected unit trees are preserved during containment changes. `source.discovery.questions` and `resolved_questions` retain review questions and decisions with UTC timestamps.

The lists written so far:

| Book | Containers | Printed types | Flows |
|---|---|---|---|
| Hertel | story (frame story or inner tale) | paragraph (may contain verses and lead-ins), verse, lead_in, heading | main |
| Kale 1913 (extended by Claude for the full-book walk, revised after its first run) | contents, section (one śataka), group (lead-in + verse + commentary), translation, notes | heading, paragraph, contents_entry, commentator_verse, introduction, lead_in, verse, commentary, translated_stanza, stanza_note, footnote | main, notes |
| Dutt | chapter, group (verse set + translation), verse_set | verse, translation, speaker, heading | main |
| Telang (Claude's draft, reviewed; extended for the full-book walk, not yet reviewed) | introduction, critical_notice, corrigenda, index, shataka, section, notes | heading, paragraph, corrigendum, table, lead_in, verse, apparatus_entry, stanza_note, footnote; furniture includes scan_matter | main, apparatus, notes |
| Cole (Claude's draft, reviewed) | article, section (numbered) | heading, byline, read_before, paragraph (may contain formulas), formula, signoff, footnote | main, notes |
| Ten Princes (Claude's draft, reviewed) | introduction, contents, chapter | heading, paragraph (may contain verse), verse, contents_entry, signoff | main |
| Nītiśataka 1896 and 1914 (Claude's drafts, reviewed) | preface, shataka, group (stanza + translations), variants, notes, stanza_note, back_lists | heading, paragraph, table, verse, hindi_translation, bhavartha, hindi_gloss, english_translation, english_comment, note, variant_entry, note_paragraph (may contain quotation), quotation, list_entry | main, notes |
| Vavilla (Claude's draft, reviewed) | shataka, section, group (verse + commentary + metre) | heading, verse, commentary (may contain quotation), quotation, metre, colophon | main |
| Gita (Claude's draft, reviewed) | introduction, contents, canto | heading, argument, speaker, topic, verse, paragraph, contents_entry, signoff | main |

The region prompt for a book is generated from its list by [method 042](../methods/042-gpt-6.1-terra-none-book-types-continuations/README.md). The prompt offers the types that have a region class, and furniture, each with the book's description followed by the rule for its neutral class. It lists the containers for context only. Each region the model returns also records its neutral class.

## Pages and regions

A page is one input image: its id, file, checksum, size and printed page label. It holds its regions. A region has:
- **`type`:** the type of the unit that owns it, or a furniture type;
- **`polygons`:** the outline in page pixels, as written by method 041 (pixel-center convention);
- **`lines`:** line pieces in reading order, each with the line finder's page-level line id, its polygons and, once transcribed, its `text`;
- **`order`:** the reading order the region step gave. This is evidence only: the book's order is the order of the units;
- **`source`:** provenance, including the model's box, its class and its continuation flags.

When local processing fails (the mask-failure fallback), the polygon is the model's box, and `source` says so.

**Text lives on line pieces.** Each piece's `end` says how it joins the next piece of the same unit:
- `space` (the default);
- `hyphen`: a printed hyphen to drop, because the word continues;
- `join`: the word continues without a hyphen;
- `line`: a line break to keep, as between the lines of a verse.

A unit's text is its pieces' text, joined in reading order. Every character can therefore be traced to a line piece and its polygon. A word hyphenated across a page break is just the last piece of one page joining the first piece of the next, inside the same unit.

## Inline spans and note markers (0.2)

Version 0.2 (2026-11-06; 0.1 documents remain valid) adds formatting and makes note markers first-class.

**Spans.** A line piece may have `spans`, each a stretch of its plain text with a `kind`. A span has `start` and `end` offsets (in code points), and optionally an `id`. The kinds:
- generic formatting: `bold`, `italic`, `small_caps`, `superscript`, `subscript`, `underline`, `spaced`;
- the book's own inline kinds, named in the type list's `inline`, each with a description and the formatting it is printed in, such as a pratīka printed in bold;
- `note_marker`, below.

Formatting that runs across a line break has a span on each piece, and a viewer joins them. The plain text stays as printed and searchable; spans map one to one onto ProseMirror marks.

**What counts as formatting:** words that the printer sets apart from the text around them in the same script. A script printed throughout in a heavier face, such as the Devanagari of Kale's English notes, is not bold. Headings in capitals, letter-spaced headings and type sizes are structure (unit types), not spans.

**Note markers** are zero-width spans of kind `note_marker`, at the position where the marker is printed, with an `id` and the printed `marker` (such as १ or *). The marker characters are not in the running text, so "च वदने" is found whether or not a marker stands after च. A relation of type `note` names its marker by `from.anchor` (`<page id>#<span id>`). That survives edits to the text, where character offsets would not.

**Writing them:** a model writes formatting as simple tags (`<b>`, `<i>`, `<sc>`, `<sup>`, `<sub>`, `<u>`) and markers in square brackets (`[१]`). `inline.py` turns them into plain text and spans, carrying a tag left open at a line's end on to the next line. `inline.py upgrade` turns a 0.1 page document, with `[x]` markers in its text, into 0.2.

## Editing (0.2)

The model's page documents are never changed: the user's corrected version is saved beside each one (decided on 2026-11-05). Every element has a stable id, and each kind of element has one natural edit:
- **text and formatting:** edit the line pieces' text and toggle spans, as in any rich-text editor;
- **units:** join, split, change type, move to another parent, change number or label;
- **regions:**
  - a region may carry `box`, the editable rectangle its outline is computed from;
  - moving or resizing the box, moving a line piece to another region, or claiming ink with a new box re-runs the local outline step;
  - polygons and line pieces are derived from the box and the page's ink, and are not edited point by point;
- **relations:** pick a marker and the note it refers to, or remove the link;
- **continuations:** set or clear a unit's open ends at a page edge.

An edited document must pass the same checks (`book.py check`) before it is saved.

## Units

A unit has an id, a type, optional `number`, `label` and `lang`, and its `children` in reading order. Each child is one of:
- one of its own regions, which must be of the unit's own type;
- a child unit, of a type its type `contains`.

**Rules,** checked by `book.py`:
- every text region is owned by exactly one unit, and furniture by none;
- every unit is either one unit's child or at the top level of one flow, in a flow its type allows;
- the units form a tree.

**Figures.** A figure (a picture, emblem, symbol printed as an image, or ornament) is a unit of a type whose region class is `figure`. Its region has a box and an outline but usually no line pieces. The unit's `label` says what it shows, if known, and serves as its text in plain-text exports.

**Styles (draft 0.3, 2026-11-06).** How the book is printed is kept apart from what it says, so that an export can be semantic while still able to look like the book:
- **the style sheet:** a book may have a style sheet (format `style`). It holds the base style of its text and, for each type, how units of that type are usually printed. It also names the page's size and text box, and font roles (`body`, `display`, `latin`) with font families in order of preference;
- **own styles:** a unit (`style`) or a line piece (`style`) records only where it differs from its type, such as a centered heading line at 29 pt or a right-aligned signature;
- **properties:** font role, size, leading, weight, italic, alignment (left, center, right, justify), left margin, first-line indent (negative for a hanging number), and space before and after. All lengths are points of the printed page;
- **rows:** `row` puts consecutive sibling units side by side (the two columns of an address), each with its `width` as a share of the text width.

Renderings that resemble the book use styles: the app's "as printed" view, its HTML export, and later a LaTeX or Typst export. The structure, the reading order and the text never depend on them, and a semantic export may ignore them. Documents of 0.1 and 0.2 have no styles and remain valid; the style sheet and `style` properties are 0.3.

**Nesting and interruption are different.** A verse quoted in a Hertel speech is a child of the paragraph, and the prose after it is the same paragraph's next region. A figure that the printer set between two pieces of a paragraph is not part of the paragraph. It is a sibling in the flow, and the paragraph simply has two pieces. On the page the two cases look alike; the tree tells them apart.

**Inner tales** (Hertel) are children of the story they are told in. Each comes after the paragraph whose "सो ऽब्रवीत्" introduces it, not inside that paragraph. The user chose this simpler option on 2026-11-05.

## Page documents and assembly

Pages are processed one at a time, so a page document describes the units on its page only. A unit that began on an earlier page has `open.start`; one that goes on on a later page has `open.end`. The rules:
- **Last and first children:** a unit open at its end must be the last child of its parent, and the parent must be open at its end too. The same holds for open starts and first children.
- **Top level:** at the top of a flow, the unit open at its end must be the flow's last unit on the page. Only one unit per flow may be open at its start, and it need not be the first unit. This allows for a figure or table at the top of the next page that interrupts a paragraph.

**Assembly** (`book.py assemble`) takes the page documents in order. For each flow, it joins the last unit of the earlier page, if open at its end, to the later page's unit open at its start, if they have the same type. It then joins their last and first children the same way, level by level, down to the deepest open unit. Regions simply follow one another, so a paragraph split by the page becomes one unit with a region on each page.

Ends that don't match are reported and left unjoined. Units still open at the edges of the pages included keep their flags.

This generalizes method 040's two flags, which only described regions, to every level. At the Dutt break between pages 2 and 3, three units are open:

```
page 2:  chapter (open end) > group 25–26 (open end) > verse_set (open end) > verse 25 (complete)
page 3:  chapter (open start) > group 25–26 (open start) > verse_set (open start) > verse 26 (complete), translation
```

Assembly joins the chapter, the group and the verse set; the two verses stay separate units. The same pattern covers a verse ending one column and the next verse beginning the next column, but there no assembly is needed, because both are on one page.

## Stage layers in page provenance

The stage foundations store bookkeeping in the free-form page `source.layers` object. `regions` owns geometry, region types and reading order. `text` owns line text, spans and the page label. `units` owns the unit tree, flows, relations, line joins and unit/line presentation styles. Region and text states are `model` or `edited`. Units can also be `provisional`. A new provisional page has region and unit states, with text pending. Empty and figure-only pages can acquire a completed text layer with an empty transcription.

`accepted_at_utc` records the user's acceptance of a layer. Either acceptance or an `edited` state protects that layer. The layer helpers infer acceptance for older completed documents and persist that inference as `accepted_legacy: true` when materializing their records, without inventing a historical timestamp. A legacy page with zero text lines is treated as having completed text. `layerState` returns a derived `accepted` boolean, while `layerRecords` produces the records to save. Sending a layer back clears its acceptance markers and retains its edit state.

`layerView` compares stage-owned content, including formatting and note markers, while excluding provenance. The pure stage merges return a new document, the layers taken and a suggestion flag. Protected content is retained. Completion uses the current text and geometry, maps note anchors onto current markers, and can fill empty metadata on protected units where their type and first region identify a unique match. Region replacement can reuse text on matching geometry. Full page validation is passed to merges when replacing a saved document through the normal processing pipeline.

Manual Regions edits keep pending text pending and retain provisional units while rebuilding their containment and flows. `source.provisional_problems` separates temporary grouping problems from other diagnostics. The local geometry step returns `source.uncovered_lines`, with a line ID and bounding box for ink left outside every region. Empty recomputed regions have `region.source.no_ink`. Unassigned regions retain their boxes in `source.omitted_regions`. Merging retains the removed region in `region.source.merged_from` and preserves compatible text, spans and links. Temporarily retyping a provisional text region as a figure retains its line pieces in `region.source.kept_text` for restoration.

Focused Text edits preserve provisional unit grouping while allowing note-marker cleanup. A manual unit edit in Read changes that layer to `edited`, protecting it from replacement. Unit language is included in the unit-layer comparison. Before completion, the reading view treats every line end on a provisional page as a space.

Cross-page joins save edits to both pages under the book write lock. Matching ancestor paths receive `open.end` on the earlier page and `open.start` on the next. `work/pending-pages.json` journals the page versions and prior drafts for replay after an interrupted write. Exports share the lock and recover pending writes before collecting files. Text saves merge changed text fields into the latest document, preserving newer grouping and independent text corrections. Conflicting changes to the same field or unit snapshot require reloading.

## Page-specific AI review records

A page-review call is a normal reader-call with stage page-review and method profile 087 or 088. Its additional fields include instruction, input_types, image_sha256, width and height. The response contains explanation, new_types and the complete proposed regions. Proposed types become individual add operations through the existing type-revision preview. Current definitions are checked when returning to a saved proposal.

A work/page-reviews/<page>/latest.json pointer references the latest successful raw call. The call ledger supplies recovery when the pointer write failed. Derived region records are saved separately under work/page-reviews/<page>/<hash>.regions.json and refer to the raw call in region_call. Their local outlines use the normal geometry step, and page choices use the shared review journal. Reopening the form restores the saved response and instruction.

## Partial transcription work records

`work/readings/<page>/<profile>.json` remains a complete `page-reading`, including after a repair. Compatibility uses the scan hash, model profile, OCR options, image dimensions, region IDs and region/line polygons. Type descriptions and reading order are excluded. A composite adds `partial: true`, changed `region_ids`, `reused_regions`, `base_fingerprint`, `previous_reading` and `parts`. Each part records its immutable `path`, contributing `region_ids`, `cost_usd` and `seconds`. Composite totals count each path once. The complete prior reading is archived at `work/reading-history/<page>/<profile>/<hash>.json`.

A raw partial `reader-call` retains the same profile and method and adds the target and reuse metadata. Its deterministic pointer at `work/reading-parts/<page>/<profile>/<hash>.json` identifies the raw call path using the request hash and target region IDs. The raw call and ledger entry are persisted as requesting before the provider request. A completed response can recover an interrupted combined save. A requesting call, or a failed call with unknown cost, blocks automatic repetition. An explicit fresh whole-page request bypasses this partial pointer after the attempt has been reviewed. A concurrent newer full reading wins the cache save check.

Local partial results without a raw API call are retained as `reading-part` files. Tesseract still recognizes the full page for consistent word ownership. Vision reuses the complete saved response's word boxes when available and remaps recovered responses against the latest geometry. Its repeated contribution refers to the same call path, so it adds no charge.

`source.calls.reading` carries `partial` and `parts` after a composite is applied by the model-stage merge. A repair suggestion for the page's existing model replaces only target or missing text regions. Other current text and marker identities are preserved. Explicit model comparisons use the full model reading. The API ledger retains repair charges. Whole-book projections exclude composite reading samples because they contain incremental repair spending.

## Human review provenance

`source.review.text` records reviewed lines by region and line ID, with their marked text, line geometry, timestamp, model profile, cache path, fingerprint and immutable call path where available. Matching printed markers keep their IDs and links. A unique marker may move within a line. Replaced markers receive fresh IDs and obsolete anchor links are removed.

`source.review.units` and `regions` record reviewed region decisions and their fields. Each structural layer has a shared geometry context, and units also record the printed input and region order. Structural comparison uses canonical membership and ancestry rather than model-local unit IDs. Scores exclude reviews whose current content or input no longer matches. Older records with geometry on each item remain readable.

Human choices are saved as protected edits. A whole-page choice or dismissal clears its layer’s `source.suggestions` entry. Partial choices leave it available. Coordinated page-save journals can include previous pages, saved at `work/history/<pid>.json` before edits. Review evidence and suggestion removal recover with the chosen document. Work records retain their original data.

Merged type proposals retain source definitions and keep/drop choices in `types.source.discovery.comparison`. Each proposal has its own call record. Comparison totals are separate from the primary call metadata, so existing proposal packages retain their provenance checks.

Whole-book contact-sheet proposals add `types.source.discovery.overviews`. Each entry records its model, rendering recipe, sheet hashes and cell-to-PDF-page maps, and an inventory of `{page, types, uncertain}` entries. Page positions are one-based. Inventory validation requires every supplied page exactly once and type names defined by the proposal. Overview page counts derive from unique inventory positions and remain estimates. Counts from current regions and units use processed page documents. Each contact-sheet batch has a normal unit-types call record and a fingerprinted cache under `work/type-discovery/overview/`. Completed raw calls can recover a failed cache-pointer save. An unresolved attempt requires an explicit retry choice. Earlier selected proposals are retained under `work/type-discovery/history/` before a newly completed proposal becomes the selection.

## Region finder choices and trials

`reader_options.finder` holds the book's region finder profile. A missing choice uses the legacy Terra profile. The existing OCR language setting also selects the language pack for Tesseract layout. Finder trials are independent work records at `work/region-finders/<page>/<profile>.json`, with the scan hash, type revision, compatibility fingerprint, model or local profile, geometry and cost provenance. Compatibility includes the method, type list and language pack where applicable. The active geometry record remains at `work/<page>.regions.json` for existing consumers. Comparison trials preserve it.

`source.review.regions_page` holds an explicitly reviewed whole-page layout and its call provenance. The canonical layout includes region types, reading order, outlines, line geometry, continuation flags and omitted blocks. It ignores local region and line IDs and transcribed text. Exact matching scores expire when the current layout changes. The review dialog replaces whole layouts because different finders assign independent region IDs.

## Relations

A relation has a type from the book's list, a source and a target unit. So far the only use is footnote markers: a relation of type `note` goes from a position in the text to the footnote unit. The position is a region, optionally a line and character offsets, and the printed marker.

Relations are kept separate from the tree, so a book can add relation types (such as "comments on" or "translates") without changing the structure.

## An excerpt with text

This is the start of Dutt page 3, with the polygons shortened and text added by hand. The generated examples have no text yet.

```json
{
 "format": "page", "schema_version": "0.1", "book_id": "dutt-mahabharata",
 "page": {"id": "dutt-mahabharata-17f-chapter-001-page-003", "image": "dutt-mahabharata-17f-chapter-001-page-003.png",
   "width": 2107, "height": 2850, "label": "3",
   "regions": [
     {"id": "r3", "type": "verse", "polygons": [[[207, 232], [206, 372], "…"]], "order": 1,
      "lines": [{"line": 1, "polygons": ["…"], "text": "विपन्नसस्येव मही वाक् चैवासंस्कृता तथा।", "end": "line"},
                {"line": 2, "polygons": ["…"], "text": "आसुरीव यथा सेना निगृहीते नृपे बलौ॥२६॥"}]},
     {"id": "r4", "type": "translation", "polygons": ["…"], "order": 2,
      "lines": [{"line": 3, "text": "On the fall of that foremost of the Bharata"},
                {"line": 4, "text": "race, the army of the Kurus resembled the"}, "…"]}]},
 "units": [
   {"id": "ch", "type": "chapter", "label": "chapter 1", "open": {"start": true, "end": true}, "children": [{"unit": "g25"}, "…"]},
   {"id": "g25", "type": "group", "label": "verses 25–26", "open": {"start": true}, "children": [{"unit": "vs25"}, {"unit": "translation-1"}]},
   {"id": "vs25", "type": "verse_set", "open": {"start": true}, "children": [{"unit": "verse-26"}]},
   {"id": "verse-26", "type": "verse", "number": "26", "children": [{"region": "dutt-mahabharata-17f-chapter-001-page-003#r3"}]},
   {"id": "translation-1", "type": "translation", "children": [{"region": "dutt-mahabharata-17f-chapter-001-page-003#r4"}]}],
 "flows": {"main": ["ch"]}
}
```

In a book document, unit ids become `<page id>#<local id>` of the unit's first fragment, so the group above becomes `dutt-mahabharata-17f-chapter-001-page-002#g25`.

## How the pipeline would produce this

1. **Region call** (method 040 now; with the book's types, method 042): regions with types and the two flags, which become evidence in `source`.
2. **Local step** (method 041): polygons and line pieces.
3. **Transcription call**, a second call (the user's decision): the page and its regions go in; the text of each line piece and the page's unit tree, with open ends, come out. The tree needs the text in places: in Hertel, prose after a verse is set flush left whether or not it continues the paragraph, and only the words show that it does. A single call that returns regions, text and tree at once is to be tested as well, since it is faster.
4. **Assembly** (local): `book.py assemble` joins the pages.

## Worked examples

All three use method 041's regions from the first request. In each, every model region class matches the class of its book type; the builder would report any that differed.

| Example | What it shows | Page breaks |
|---|---|---|
| `hertel-152-153` | A paragraph that quotes verses 345–348 and a lead-in, and resumes on page 153 after verse 348. An inner tale (Tale xv) ends on page 153, and the frame story resumes in a new paragraph. Margin line numbers are furniture. | 152 → 153: the frame story, Tale xv and the paragraph continue; verse 348 does not. |
| `kale-107-109` | Verse + commentary groups, and footnotes in a separate flow. Footnote 3 on page 108 is printed as two regions. Two footnote markers are linked (footnotes 1 and 4 on page 107). | 107 → 108: the group of verse 26. 108 → 109: the group of verse 29. |
| `dutt-17f-002-003` | Verse sets with their translations, including sets split by a column break (18–19, 32–33) and by the page break (25–26). The translation of verse 15 ends with "and,"; it is treated as ending there, by the user's decision. Speaker lines are kept where printed, even where the print puts them one unit too early (verse 13); the user decided not to correct such mistakes in the schema. | 2 → 3: the chapter, the group of verses 25–26 and its verse set. |

Each example directory has the hand-written `tree.txt` and the generated `tree-printed.txt`. The generated `pages/*.json` and `book.json` are about 200 kB per example, mostly polygons.

## Decided on 2026-11-05

- **Other books:** Claude writes a type list for each of Telang, Cole, Ten Princes, Nītiśataka 1896 and 1914, Vavilla and the Gita, one book at a time, for the user's review. Cole's sentences continuing through a displayed formula fit the same pattern as Hertel's verses, with the formula as a child of the paragraph.
- **Speeches inside a Hertel paragraph:** a printed paragraph holds several speakers' turns. The schema does not record who speaks; the paragraph is simply a paragraph.
- **Spreads:** a page is one image. In a two-page spread, a unit simply has regions in both halves, and the two printed page numbers are not recorded separately.
- **Who writes a type list:** in the app, a model proposes one from sample pages and the user reviews it.
- **Editing:** kept simple. The model's page document is never changed; the user's corrected version of the page is saved beside it and used when there is one. No edit history is kept. Details wait for the app.
- **Telang (the user's review of Claude's draft):** the apparatus is its own flow, apart from the stanzas; the stanza number can link an entry to its stanza later. "साहंकारं पुरुषमुद्दिश्याह ।" (page 93) is a lead-in. The books have title and contents pages, which the type lists do not cover yet; Claude is to go over one full book later (Kale and Telang first) to see what a whole book looks like.
- **Cole (the user's review of Claude's draft):** "your recommendations seem fine overall", without going into the journal case further: articles as the top level, numbered sections as containers, and mathematics in LaTeX as proposed. The user then asked Claude to go ahead with the other books; Claude drafted and tested all five the same day, for the user's review.
- **Kale, extended for the full-book walk (Claude, 2026-11-05/06, not yet reviewed):** the accepted list covered only the Sanskrit text. For the whole scan Claude added contents, translation and notes as top-level containers, with paragraph, contents_entry, translated_stanza and stanza_note. It also added commentator_verse, allowed commentary directly in a section (for the commentator's introduction), widened the footnote and page number descriptions to the English parts, and added an English convention. The accepted version is saved as `type-list.json` with every earlier Kale result. Allowing commentary in a section has one side effect: on page 4, a commentary continued from page 3 was put directly in the section instead of in its group.
- **Kale, revised after the first full-book run (2026-11-06):** Claude proposed three fixes for gaps the run exposed, and the user agreed ("I agree with your recommendation. Go ahead."):
  - a type `introduction` for the commentator's introduction, with commentary only in groups;
  - `paragraph` also for editor's notes in the translation and the notes, such as "N. B. Read the slokas on p. 16 in this order—…";
  - the translation and the notes each described as one unit across both śatakas, with their headings inside.

  The list used by the first run (`book-001`) is saved as `type-list.json` with each of its results.
- **Ten Princes, Nītiśataka 1896 and 1914, Vavilla and the Gita (the user's review of Claude's drafts):** accepted as drafted ("Yes all this sounds good. Go ahead"), after Claude's summary of each list and its test. That includes a Ten Princes chapter's number and title as one heading, the Nītiśataka below-rule notes as their own flow with one region per note or parallel, and the Gita's speaker lines as plain units rather than containers.

