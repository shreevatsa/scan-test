# Scanned books, source-aware: session handoff

Updated 2026-11-10. The nine-step stage-based workflow is implemented. Start with "Build progress" and "Current state", then use the design below for its decisions and the remaining experiments. The later sections are earlier notes, kept for reference; where they differ from it, "Current state" wins. NOTEBOOK.md has every public test, in order; private tests are recorded only in private/.

## Stage-based workflow (design of 2026-11-09)

Steps 1 through 9 are complete, as recorded under "Build progress". The next work is hands-on testing of the full-book workflow and the experiments listed after the build. "Current state" below describes the app's current screens. The design starts from the user's four phases, a review of the code and the recorded evidence, and the user's answers of 2026-11-09. Build it in the order under "Build order", with each step leaving the app working and the tests passing.

### What the user asked for

| Phase | What the user does |
| --- | --- |
| Browse pages | Open a PDF, look through its pages and notice the different layouts. |
| Schema and regions | Decide which types exist, how they may nest, and which regions of each page have which type. Start from a draft and extend it as new kinds of page turn up. |
| Transcribe | Read the text of the regions with the chosen transcription model. |
| Read and correct | Read the book with its structure and its links to the scans, and correct it. |

- **Structure first:** structure is settled from the scans before transcription, as far as model calls do that reliably.
- **A model choice at every AI step:** each AI-assisted operation has a comparison on sample pages and a saved choice for the book.
- **The app is organized by stage** (2026-11-09): one tab per stage, in order, with the editing of single pages under the stage it belongs to. Few tabs.
- **Later tabs are greyed out** until the stage before them is ready.
- **No approval page by page.** The user moves the book, or a selection of its pages, on to the next stage.
- **The type list belongs with the regions,** since new types are discovered while going through pages.
- **Region finders:** several Gemini and OpenAI models, no-cost ones if they can be made, and a manual flow that is workable by itself.
- **API keys are checked where they are entered,** with a cheap call, so that a bad key fails there and not later in a run.

### Terms used below

- **Region:** an outlined part of one page (a paragraph, a verse, a heading, a page number…), with its line pieces. Regions belong to a page.
- **Unit:** a logical part of the book (a paragraph, a chapter…). A unit owns regions or other units, and may run over several regions and pages. A paragraph that starts at the foot of one page and ends at the head of the next is one unit with two regions.
- **Type list:** the book's own schema (`types.json`): its types, which may contain which, its flows, relations and conventions.
- **Model step:** one automatic operation on a page. There are three:
  - **finding regions:** method 042 (a model finds and types the regions), then method 063 (the local step computes outlines and line pieces);
  - **transcription:** one of the reading profiles 065–069 and 071–072;
  - **completion:** one of the text-only profiles 070 and 073–076, which builds the units and links. The current app calls this "schema assignment".
- **Layer:** a part of a page document that belongs to one stage: `regions`, `text` or `units` (the table under "Layers" says which fields each holds).
- **Accepted:** a layer of a page that the user has moved on to the next stage.
- **Protected:** a layer that a person has edited, or that is accepted.

### Decisions, with the reasons

1. **Transcription depends on the regions' shapes, never on the type list.**
   - Today a saved transcription is reused only when a fingerprint matches, and the fingerprint covers every region's type and the book's conventions (`readPage` in `webapp/js/pipeline/run.js`). Retyping one region or editing one convention makes the page's transcription unusable, and processing pays for it again.
   - New rule: a transcription is reused when the page image, the regions' and line pieces' shapes and the transcription model are the same. A changed type list only marks pages as made under an earlier revision; redoing them is the user's choice.
   - This is what makes it cheap to keep changing the schema.
2. **Regions, their types and the reading order are settled before transcription. The step after it adds only what needs the text.**
   - Finding regions is the best-tested part: 0 / 0 / 0 on the nine reference pages (method 063's regression), and its continuation flags found 11 of 13 true links with none wrong (methods 040 and 041).
   - It is also the cheapest: about $0.010 a page on the private series, against $0.038 for transcription (Argon low) and $0.032 for completion (Argon high). A mistake in a region costs most when found after transcription.
   - Completion is the least tested: two private pages, where the other models differ from the Argon-high result on 9 to 18 regions and nobody has checked which is right. Today it may also change region types (`structureSchema` in `webapp/js/pipeline/split.js`).
   - What needs the text: line-end joins, unit numbers and labels, and note links. Completion's grouping is used unless a person has edited the page's units, and it never changes a region type on a page whose regions are protected.
3. **A model never overwrites a person's work.** A model step writes only into layers that are not protected. What it would have changed in a protected layer is kept as a suggestion to accept or dismiss.
4. **Pages are reviewed by exception.** Nobody inspects 267 pages one by one. Each stage flags the pages that need a look (the lists are under "Flags"), and the rest are moved on together.
5. **One way of settling differences.** Comparing models, and reviewing a suggestion against a person's work, are the same activity: two versions of a page side by side, and a person choosing. What the person chooses becomes the page's data and also scores the models. Disagreement with a reference model is not accuracy and is never shown as accuracy.
6. **A change to the type list is one of a few named operations, each with a known reach** (the table under "Type list revisions"). There is no general invalidation scheme.
7. **Where the text comes from is open.** A scanned page gets its text from a transcription model; a digital PDF's page will get it from the PDF (methods 058 and 062, not yet ported: item 2 under "Open"). New code reads a page's state from its document, never from the presence of a model's work record.
8. **Steps 1 to 7 change no request that processes a page:** no prompt, response schema, image or setting. So they need no new method ID, and saved results stay reusable. (The key check of step 3 is a new request, but it reads no page and is not a method.) Step 8 adds region finders, and the experiments at the end change requests; each of those gets a new ID (the next unused is 087).

### Data model

No change to `schema/schema.json` is needed: everything new lives under the free-form `source` objects. Document it in `schema/README.md` when it is built.

#### A page document exists from the Regions stage on

Today a page has no document until completion has run, so the page editor has nothing to show before transcription (`showPage` in `webapp/js/main.js` says "has no page document yet"). Change: finding regions itself writes a page document, without text.

Build it with a new pure function in a new module `webapp/js/pipeline/provisional.js`:

`provisionalDocument(pid, page, types, record, { firstPage, lastPage })`
- `page` is `{image, image_sha256, width, height}`, as `structure` (`run.js`) builds it for `buildPageDocument`;
- `record` is the region record that `findRegions` (`run.js`) saves in `work/<pid>.regions.json`;
- with `record.regions` empty it gives the empty document that work by hand starts from.

What the document holds:
- **The top level:** `format: "page"`, `schema_version: "0.2"`, `book_id`, `page`, `units`, `flows`, `relations: []` and `source`, as `buildPageDocument` (`webapp/js/pipeline/steps.js`) writes them.
- **Regions:** one for each region that `selectPageRegions` (`webapp/js/pipeline/split.js`) would send, with the same fields `buildPageDocument` gives a region: `id` (`r` and the record's `region_id`), `type`, `polygons`, `box`, `order`, `source`, and `lines`. Each line piece has `line` and `polygons` and no `text` (the schema allows this).
- **Left out:** regions with no ink are listed in `source.regions_skipped`. Regions whose type is not in the type list (the model's escape type `other`) are listed in `source.omitted_regions` with their boxes, so that the review can draw them.
- **Units and flows:** from `provisionalUnits`, below, so that the document passes `checkPage` and the editor's operations work.
- **Provenance:** `source` records `method: "provisional-regions-v1"`, `char_h` and `page_angle_deg` from the record (the cut-outs need `char_h`; today `sourceRegions` guesses it when it reads a document), `calls.regions` (the region call and its cost), the record's `warnings`, `problems`, and `layers` (below).

#### Provisional units: the local rule

`provisionalUnits(pid, regions, types, { firstPage, lastPage })`, a pure function in the same module, returns `{units, flows, problems}`. `regions` are a page document's regions. `flows` has an entry for every flow of the type list, an empty list where the page has nothing in that flow. It must give a tree that passes `checkPage` for any list of regions. Its accuracy matters little: completion replaces it unless a person has edited the units.

Three things it needs first:
- **The class of a type** is its `region` in the type list (`heading`, `paragraph`, `verse`, `note`…).
- **The home path of a region type T** is the shortest chain `[C1, …, Ck, T]` in which C1 has a `flow`, and each next type is in the previous one's `contains`. A type with a `flow` of its own has the chain `[T]`. Search breadth-first, trying types in type-list order. The region's flow is C1's `flow`. If T has no chain, add a problem ("type T has no place in any flow") and leave the region without a unit: the document then fails `checkPage`, and the fix is in the type list.
- **The order:** the regions that are not furniture, by `order` (those without one last), then by their place in the list.

Then, with one stack of open containers for each flow (outermost first), and unit ids `u1`, `u2`, … in the order made:

```
for each region r, in order:
    path = home path of r.type;  containers = path without its last entry;  stack = the stack of r's flow
    # 1. the second part of an interrupted unit joins the first part
    if r.source.continues_from_earlier:
        e = the nearest earlier region on the page with the same type, with source.continues_later,
            that no later region has joined yet
        if there is such an e: add {region: pid#r.id} to the children of e's unit; go on to the next region
    # 2. how many open containers can be kept
    n = 0
    while n < len(containers) and n < len(stack) and stack[n].type == containers[n]: n += 1
    # 3. a heading directly inside the innermost container starts a new one, once that container has other content
    if n == len(containers) and n > 0 and class(r.type) == "heading"
       and stack[n-1] has a child that is a container or a leaf unit whose class is not "heading": n -= 1
    # 4. close the others, open what is missing
    drop stack[n:]
    for each type C in containers[n:]:
        make a unit of type C with no children; append it to stack[-1]'s children, or to the flow's top level
        when the stack is empty; push it on the stack
    # 5. the leaf
    make a unit of type r.type with children [{region: pid#r.id}]; append it to stack[-1]'s children, or to the
    flow's top level when the stack is empty
```

Open ends, for each flow that has units, kept consistent with the rules in `checkDocument` (`webapp/js/schema.js`):
- **At the start:** walk from the flow's first top-level unit down through first children to a leaf. A container on this walk gets `open.start` unless this is the book's first page, or its first child is a leaf of class `heading`, or the unit above it on the walk did not get it. The leaf gets `open.start` if its first region has `continues_from_earlier`, and the unit above it got it (or it is at the top level).
- **At the end:** walk from the flow's last top-level unit down through last children to a leaf. A container on this walk gets `open.end` unless this is the book's last page, or the unit above it did not get it. The leaf gets `open.end` if its last region has `continues_later`, and the unit above it got it (or it is at the top level).
- A `continues_…` flag that these rules cannot honor is ignored and noted in `problems`.

Assembly warnings between two pages are expected while either page's units are provisional. Label them so; do not treat them as errors.

#### Layers and their states

Each page document records `source.layers`, for example:

```json
"layers": {
  "regions": {"state": "edited", "accepted_at_utc": "…", "types_revision": 3},
  "text": {"state": "model", "made_by": "argon-low", "types_revision": 3},
  "units": {"state": "provisional"}
}
```

| Layer | Stage | Fields | States |
| --- | --- | --- | --- |
| `regions` | Regions | each region's `id`, `type`, `polygons`, `box`, `order`, and its line pieces' `line` and `polygons` | `model`, `edited` |
| `text` | Text | each line piece's `text` and `spans`; the page's `label` | absent, `model`, `edited` |
| `units` | Read | `units` (children, type, open ends, number, label and style), `flows`, `relations`, and each line piece's `end` and style | `provisional`, `model`, `edited` |

- **Who writes the state:** finding regions writes `regions: {state: "model", made_by: "042+063"}` and `units: {state: "provisional"}`; transcription writes `text: {state: "model", made_by: <the reading profile's id>}`; completion writes `units: {state: "model", made_by: <the completion profile's id>}` when its grouping is taken. Each also writes `types_revision`.
- **Accepted** is separate from the state: `accepted_at_utc` is set when the user moves the page on from that layer's stage, and removed when the user sends the page back. Nothing else sets it. It is written into the page's current document (`book.current(pid)`): the person's version if there is one (`saveEdit`), else the model document (`saveModel`). A book opened read only cannot move pages on.
- **Protected** means the state is `edited`, or the layer is accepted.
- **A document without `source.layers`** (every document made before this build): its layers are `edited` if it has `source.edited` (a person's saved version), else `model`. Text is absent when the page has line pieces and none has a `text` field. A legacy blank or figure-only page counts as having completed text. Every inferred layer is accepted, because those books went through the old flow in one go. `layerState` exposes the derived `accepted` boolean, and `accepted_legacy: true` preserves inferred acceptance when the layer records are materialized. Human acceptance writes a real `accepted_at_utc` timestamp. Sending back clears either acceptance marker. This keeps existing corrections and illustrated pages available.
- **Edited:** when the editor saves a person's version (`flush` in `main.js`), compare each layer's fields with the model document's. A layer that differs becomes `edited`; a layer that is the same keeps the model document's state. Each tab's editor only lets its own layer change (see "Screens"), with one exception: changing a unit's type in Read also changes its regions' type.
- **Provisional units follow the regions.** While `units` is `provisional`, an edit that changes the regions layer rebuilds the units with `provisionalUnits`, and the state stays `provisional`. Without this rule, retyping one region before transcription would protect a crude tree against completion's better one. Do this in `App.edit` (`main.js`), so the editor shows the rebuilt units at once.

The pure module `webapp/js/layers.js` provides `layerView(doc, layer)` (a canonical string of the layer's fields), `layerState(doc, layer)`, `isProtected(doc, layer)`, `noteEdit(modelDoc, doc)`, `accept(doc, layer)` and `sendBack(doc, layer)`. `layerRecords(doc)` provides materialized records for persistence. These functions return new values and preserve their input documents. `accept` accepts an optional explicit timestamp for deterministic callers and tests.

#### How each model step writes

Each model step builds a candidate document exactly as today, and a new merge step decides what of it goes into the page's current document (`book.current(pid)`: the person's version if there is one, else the model document). Put the merge in a new pure module `webapp/js/pipeline/apply.js`, as three functions, one for each model step: `mergeRegions(current, candidate)`, `mergeText(current, reading, types)` and `mergeCompletion(current, candidate, types, check)`. Each returns `{doc, taken, suggestion}`: the document to save (the current one, unchanged, when nothing was taken), the names of the layers it took, and whether anything was held back.

| Model step | Candidate | What goes into the current document |
| --- | --- | --- |
| finding regions | the text-less document above | The whole candidate, when no layer of the page is protected. Otherwise nothing, and the candidate is a suggestion. |
| transcription | the current document with the reading's text and spans on its line pieces | The text and spans, when `text` is not protected. Matching is by region id and line id, which are the same on both sides because the step read the current document's regions. |
| completion | the document `buildPageDocument` makes | Types and grouping as in the next table. Line ends (`end`) whenever `units` is not protected. |

- **Regions found again on a transcribed page:** when the candidate replaces a document that had text, put the text back at once from the saved reading if its shapes still match (`geometry_key`, below). Otherwise the page needs transcription again; say so in the cost estimate before the step runs.
- **Text into line pieces:** parse each line with `parseLine` (`webapp/js/inline.js`) and number the note markers across the page, as `buildPageDocument` does. Move that loop into one function used by both, and check that `buildPageDocument` still gives the same documents (`webapp/test/pagedoc.test.mjs`).

Completion's types and grouping (the regions' `type`, and `units`, `flows`, `relations`):

| `regions` | `units` | What is taken from completion |
| --- | --- | --- |
| not protected | not protected | Its region types and its grouping. `units` becomes `model`. |
| protected | not protected | Its grouping, with each leaf unit given the type of the regions it owns in the current document. The regions keep their types. If the result does not pass `checkPage` (a unit owning regions of two types, or a type its parent may not contain), nothing is taken and the provisional units stay. The types completion would have changed are a suggestion. |
| either | protected | Nothing of the grouping. Completion only fills what is empty: a unit's `number` and `label`, and relations whose ends can be matched. Match a completion unit to a current unit by type and first region. The rest is a suggestion. |

The middle row is the usual path: the user moves a page on from Regions, and the page is then transcribed and completed.

Other rules:
- **Inputs come from the current document.** `sourceRegions` (`run.js`) prefers the saved region record today; change it to read the page's current document when there is one, so that a person's region edits are what gets transcribed. Completion takes its text from the current document (`readingFromDocument` in `split.js`), so that text corrections made before completion are respected.
- **Unchanged requests.** For a page nobody has edited, the transcription and completion requests must be byte-for-byte what they are today, and saved results must still be found. Test this.
- **The result must pass the checks.** If a merge would turn a passing document into a failing one, keep the document and make the candidate a suggestion.
- **Saving.** The merged document is saved as the model document (`pages/<id>.json`) and the person's version (`edits/<id>.json`) is removed, because the merged document was made from it and holds everything in it; the layer states carry the protection on. "Revert page" then means "undo my changes since the last model step". Add `Book.saveStage(pid, doc, valid)` to `webapp/js/store.js` for this. Before it replaces a document with a protected layer, it writes the previous document to `work/history/<id>.json` (one level of undo), then the model document, then removes the person's version, in that order. Step 2 must add recovery for interruption between those writes, since `Book.current` prefers an existing edit. A recoverable journal or transaction also needs to cover the multi-page type operations in step 5. Test interrupted writes, retries and reopening the book.
- **Drafts.** A model step skips a page that has a draft which does not pass the checks, and says so.
- **Read-only books** (opened from a URL) do not save model results into documents, as now.
- **The editor's copy.** After a model step saves a page, drop the page editor's copy of it (`app.doc`, when `app.pid` is that page): `showPage` does not reload a page it already holds, and would save the old document over the new one.

#### Reuse of transcriptions

- Add `geometry_key` to a saved reading, computed in `readPage` (`run.js`) beside the present fingerprint. Leave types and prompt text out of it:

  ```js
  geometry_key = await jsonHash({ version: Split.SPLIT_VERSION, profile, chosen, imageHash,
    regions: sent.map(s => ({ id: s.rid, polygons: s.region.polygons,
      lines: s.region.lines.filter(L => L.polygons?.length).map(L => ({ id: L.line_id, polygons: L.polygons })) })) });
  ```
- Reuse a saved reading when its `geometry_key` matches. For readings saved before this build, compute the key from their saved `regions_record`.
- Keep the full fingerprint too. When it differs, show the page as "transcribed under an earlier type list" and offer re-reading; never re-read by itself.
- **Completion keeps its present fingerprint,** because types and reading order are real inputs to it. When the document's transcription is equivalent to the saved reading, pass the original saved reading to `structure` so the existing result is found. Equivalence must compare canonical text, formatting and note markers, using the document's spans as well as its plain strings. When that content differs, build the input from the document with `readingFromDocument`, and use a hash of that content where the reading's fingerprint went. The pure completion merge already holds results whose model-facing text or geometry differs from the current document.
- **A region changed after transcription** (the user goes back to Regions and fixes a box): `applyGeometry` (`webapp/js/ops.js`) already keeps each line piece's text with its line. Line pieces left without text make the page show "text missing on N lines" in Text. Running transcription again sends the changed text regions and combines their results with the compatible saved reading. Cloud Vision can remap its saved full-page word boxes, while Tesseract reruns locally to preserve full-page word ownership.

#### Suggestions

A model result that was not written is already saved as a work record. Record where it is in the document, one entry for each layer held back, and clear the entry when the person takes or dismisses it:

```json
"suggestions": {"units": "work/…/<the structure record>.json"}
```

| Layer | The work record | The candidate to show |
| --- | --- | --- |
| `regions` | the region record, `work/<pid>.regions.json` | `provisionalDocument` made from it |
| `text` | the reading, `work/readings/<pid>/<profile>.json` | the current document with that reading's text |
| `units` | the structure record (its path comes from `structurePath` in `webapp/js/pipeline/readers.js`) | its `doc` |

The review shows the current page and the candidate side by side with the existing comparison views (named under "Read"). Taking a suggestion, for the page or for one region, writes it as a person's edit, so the layer becomes `edited`.

#### Type list revisions

- `types.source.revision` is a number (1 for every existing list). `types.source.revisions` is the log: `{n, at_utc, by, operations}`. `types.source.aliases` maps each old type name to its present name (`{"old": "new"}`).
- Add `Book.saveTypes(types, operations)` for writable books (`book.writable`). The app holds the type list in `app.tl`, `app.colors` and `app.furniture` (`openBook` in `main.js`); refresh them after a save.
- Each model step records the revision it ran under, in `source.layers.<layer>.types_revision`.
- The types panel offers these operations and no free-form editing of the JSON. Each shows its reach before it is confirmed ("renames 412 regions on 96 pages").

| Operation | What the app does | What has to be redone |
| --- | --- | --- |
| Edit a description, a convention, the title or the languages | saves the list | nothing. Pages keep their revision number. |
| Add a type | saves the list | nothing. It applies where the user retypes regions or finds regions again. |
| Rename a type | rewrites the type in every model document and person's version (each region's `type` and each unit's `type`), in the type list (its key, and other types' `contains`) and in the style sheet's `types`; records the old name as an alias | nothing |
| Merge type A into B (same region class, or both containers) | as a rename of A's uses, then removes A | nothing |
| Split a type (add a second type for some of its regions) | adds the type; lists the pages that have regions of the old type | the user retypes on those pages, or finds regions again on them |
| Change what a type may contain, or its flow | saves the list; runs `checkPage` on every page; lists the pages that now fail | on those pages: provisional units are rebuilt; other unprotected units need completion again (its transcription is reused); protected ones are the user's to fix |
| Change a type's region class | saves the list | if `figure` is involved, finding regions on pages with that type; otherwise nothing |
| Remove a type | only when no document uses it; otherwise merge it first | nothing |
| Replace the whole list (a new proposal) | only while no page has a protected layer; clears the page documents | finding regions on those pages (cheap); show the count and the estimated cost first |

Work records are never rewritten. Where the app reads a type name from an old work record, it maps the name through the recorded aliases.

#### A book before it has types

- The new-book form (`newBookForm` in `main.js`) asks for the PDF, the pages to include, a title and an id. Types are optional there: the default is the starter list `webapp/types/generic.json`, with its `book_id` and `title` set to the book's and `source.draft = true`. An existing list can still be chosen. After making the book the form opens the Pages tab (today it opens Make pages).
- The proposal from sample pages (`webapp/js/type-setup.js`, methods 077 and 078) moves into the book, into the types panel of Regions. It can use the book's work files as its store (`readWork` and `writeWork` have the names it calls). Taking a proposal is "Replace the whole list".
- A proposal's "Questions to review" link to the sample pages they cite. Answering one is an operation on the type list; then mark the question resolved in `types.source.discovery`.

### Screens

Five tabs, in the order of the work: **Pages · Regions · Text · Read · Export**.

| Tab | Model step run there | What a person corrects there | Moving on |
| --- | --- | --- | --- |
| Pages | none | nothing: browsing, and every page's state at a glance | — |
| Regions | proposing types; finding regions | the type list; each page's boxes, types and reading order | "Move on to Text" accepts the pages' regions |
| Text | transcription | each page's text, line by line beside the scan | "Move on to Read" accepts the pages' text |
| Read | completion (units and links) | units, line joins, note links, types; the style sheet | — |
| Export | none | nothing | — |

#### Which tabs are available

- **Pages, Regions and Export:** always, for an open book. Saving the book as a `.chaya.pdf` must work at every stage, since that is how a book moves between browsers; the exports of text are greyed out until some page has text.
- **Text:** when at least one page's regions are accepted. Only those pages are listed there.
- **Read:** when at least one page's text is accepted. Only those pages are in the reading view; a gap is marked ("pages 31–40 are not here yet").
- A tab that is not available is greyed out, and its tooltip says what is missing ("Move pages on from Regions first").
- **Moving on** acts on the selected pages, or on every page that has the stage's layer when none is selected. It only sets `accepted_at_utc`; if some of the pages have flags, say how many before doing it. Moving on to Read also offers to run completion on those pages, with its estimated cost.
- **Sending back** ("Send back to Regions", "Send back to Text") removes the acceptance for the selected pages. Going back to an earlier tab to fix one page needs no sending back: the page stays accepted and the fix is an edit.

#### The shape every stage tab shares

Regions, Text and Read each have two levels:
- **The overview:** the page grid (a new module `webapp/js/pagesview.js`, with the lazy thumbnails of `page-browser.js`), showing this stage's state and flags for each page. Above it: the model step ("Find regions", "Transcribe", "Complete units and links") with the model chosen for the book, the estimated cost for the selection (pages times the book's mean cost for that step so far, from `work/reader-lab/ledger.json`), the spend threshold that Make pages has, "Compare models", and the move-on button.
- **One page:** the page editor, opened from the grid, with only this stage's layer editable. It has previous and next page, "next flagged page", and a jump to the same page in another stage's tab ("fix this region", "fix this text").

Selection in the grid: click, shift-click for a range, or the range field ("all", "1-50, 62"). Filters: by state, flagged, made under an earlier type-list revision, has a suggestion.

The run loop exists: `renderMake` in `main.js` processes a list of pages with a spend threshold, a stop button and saved stages, and `webapp/js/run-progress.js` shows progress. Move that loop into one function that every tab's model step uses.

Addresses (the router, `route` in `main.js`, reads the hash as parameters, so these fit it):

| Address | Shows |
| --- | --- |
| `#pages` | the Pages tab |
| `#regions` | Regions: the overview |
| `#regions&p=<page>` | Regions: one page in the editor (`&r=<region>` selects a region, as now) |
| `#regions&view=types` | Regions: the types panel opened wide |
| `#regions&view=compare` | Regions: comparing region finders (step 8) |
| `#text`, `#text&p=<page>`, `#text&view=compare` | Text: the overview, one page, comparing transcription models |
| `#read` | Read: the reading view |
| `#read&view=pages`, `#read&view=compare`, `#read&view=problems`, `#read&view=style` | Read: the grid, comparing completion models, Problems, the style sheet |
| `#read&p=<page>` | Read: one page in the editor (the fallback for units) |
| `#export` | Export |

The page editor (`buildPageMode` in `main.js`) gets a focus, set by the tab it is opened under:

| Focus | Can be changed | Cannot be changed |
| --- | --- | --- |
| regions (under Regions) | boxes, region types, reading order; adding, deleting, splitting and merging regions | text (shown, if there is any); the formatting and marker buttons are hidden |
| text (under Text) | each line piece's text, its formatting and note markers | boxes ("＋ Region" and dragging are off), units, line ends |
| units (under Read) | units, line ends, note links, types | boxes, text |

Where today's views go:

| Today | In the new layout |
| --- | --- |
| Edit book › Types | the types panel of Regions |
| Edit book › Make pages | the model step at the top of Regions, Text and Read |
| Edit book › Transcription models | Text › Compare models |
| Edit book › Schema assignment | Read › Compare models |
| Edit book › Problems, Style sheet | Read › Problems, Read › Style sheet |
| Edit pages | the page editor under Regions, Text or Read, with that tab's focus |
| Read, Export | Read, Export |

The Pages tab is the same grid with all three layers' states on each page and no actions that cost money. A book opens there, unless every page's text is accepted, when it opens at Read. The grid needs every page's current document; `Book.all()` (`store.js`) loads them, eight at a time. If that is slow on a large book, keep each page's layer states and flag count in its entry in `book.json`, written whenever its document is saved.

#### Regions

- **The types panel** stays beside the grid and beside the page editor: each type with its color (`typeColors` in `webapp/js/render.js`, which the region boxes also use) and its count of regions. It holds "＋ Type" and the operations of "Type list revisions", and opens wide into the tree and table of `typesview.js` for the nesting rules. "Propose types from sample pages" works on the pages selected in the grid. The same panel can be opened from Read, where nesting rules are also changed.
- **A new type while working:** the type menu of a region ends with "New type…", so that a new kind of thing met on a page is named, added and assigned without leaving the page.
- **Finding regions:** the model step runs the chosen region finder on the selected pages. "Start by hand" gives a page an empty document to draw regions on.
- **The page editor with the regions' focus:** the scan with its boxes, and the list of regions with type, reading order and flags. Text, where a page already has it, is shown and cannot be changed. The operations exist in `webapp/js/ops.js`: drag a box (`setBox`, then the outlines are recomputed), "＋ Region" (`addRegion`), retype (`setRegionType`), delete (`deleteRegion`), split (`splitRegionAt`). Add two: move a region earlier or later in the reading order (renumbering `order`), and merge two regions into one.
- **Omitted `other` regions** are drawn hatched, with "Give it a type", which adds a region at that box.
- **Region boxes on the thumbnails,** in the types' colors, so that a wrong page can be seen in the grid.
- **Group by layout:** the grid can group pages by layout signature (see the flags), rarest first, so that the user looks at one or two pages of each kind.

#### Text

- **The page editor with the text's focus** is today's editor (`TextPanel` in `webapp/js/editor.js`): the line pieces beside the scan, the formatting buttons and the note markers. Boxes cannot be dragged or drawn here, and units are not shown as editable.
- **Line ends are not changed here.** Today the text pane lets a line's end be cycled (`setLineEnd`). Line ends belong to the units layer, which completion fills; changing one here would mark the page's units as edited and keep completion's grouping out. Hide that control under Text.
- **After transcription alone** a page is already readable: its text is in the document, and every line end counts as a space until completion has run.
- **Compare models** is today's "Transcription models" page (`webapp/js/readersview.js`).

#### Read

- **The reading view** is today's reader (`renderReader` in `webapp/js/reader.js`). It already marks each region of the text with its page and region (`data-ref`), opens a page from its page mark, and shows the scan on hovering.
- **Click a unit to select it.** The clicked text's `data-ref` gives its page and region; the unit is the region's owner in that page's document (`ownerOf` in `ops.js`). A side panel shows its scan, its place (chapter › paragraph, each of them clickable to select the container), and what can be changed, all through operations that exist in `ops.js` and that the page editor already offers in `unitInspector` (`editor.js`):
  - its type, number and label (`retypeUnit`, `setUnitField`);
  - split here, join with the next unit, put inside a new container, unwrap, make it page furniture (`splitUnit`, `joinWithNext`, `wrapUnit`, `unwrapUnit`, `unitToFurniture`);
  - its lines with the join after each (a space, a dropped hyphen, nothing, a line break), changed by a click (`setLineEnd`);
  - a note marker's note (`linkMarker`).
- **Across a page break,** "join with the next unit" sets the open ends on both pages (`setOpen` on each page's document); this is new, and is the case the page editor handles badly today.
- **After a change,** save the page documents that changed, assemble again and draw the view again, keeping the place. Drawing the whole view again is good enough to begin with.
- **Problems in place:** check errors and assembly warnings (open ends that do not match across a page break) are marked where they are in the text, as well as listed.
- **Views within Read:** Book (the reading view) · Pages (the grid, for running completion and "Compare models", today's `webapp/js/structuresview.js`) · Problems · Style sheet.
- **A book opened read only** has the same panel with the scan and no buttons.
- **The fallback** is "open this page": the page editor with the units' focus, which is today's editor with boxes and text locked, and works from the first day. Build it first and the side panel after it; if the panel proves hard, units can still be corrected.
- **Comparison views to reuse** for suggestions: `transcriptionHtml` (`webapp/js/transcription-diff.js`) for text, and `renderStructureComparison` (`webapp/js/structure-visual.js`) for units.

#### Old addresses

Keep them working, by sending each to its new address: `#types` to `#regions&view=types`; `#make` to `#regions`; `#readers` to `#text&view=compare`; `#structures` to `#read&view=compare`; `#check` to `#read&view=problems`; `#style` to `#read&view=style`; `#read` and `#export` as they are; `#p=<page>` to that page under the tab of the latest stage it has reached (Read if its text is accepted, else Text if its regions are accepted, else Regions).

#### API keys are checked where they are entered

The user asked for this on 2026-11-09: a key that does not work should fail when it is typed in, not later in the middle of a run.

- **Where keys are entered today:** `keyControls` in `webapp/js/reader-controls.js` (OpenAI, Gemini, and Cloud Vision with an API key or an OAuth token and a quota project), and a second set of fields in `webapp/js/type-setup.js`. Make them one component, shown wherever a tab has a model step. Keys are kept in this browser's settings as `key:<provider>` (`settings` in `store.js`).
- **The check:** when a key is entered or changed, and from a "Check" button, send one tiny request through the same `post` function (`run.js`) and endpoints the app's real calls use:

  | Provider | The request |
  | --- | --- |
  | OpenAI | the model `gpt-6-luna` with low reasoning (the settings of method 022's `config.json`), the text "Reply with OK.", a small output limit, `store: false` |
  | Gemini | the model `gemini-3.5-flash-lite` with minimal thinking (the `flash-lite` profile in `webapp/js/pipeline/readers.js`), the same text, a small output limit |
  | Cloud Vision | one Text Detection request on a small image the app draws itself (a canvas with a printed word), with the API key or the OAuth token and quota project as chosen |

- **The result is shown beside the field:** "works", or the provider's own message (an invalid key, no access or no billing, a quota, a network failure), with the key removed from the message as `callJSON` (`run.js`) already does.
- **The chosen models too:** a key can work while the account has no access to the model the book uses. Before a run on more than one page, if the chosen model has not answered in this session, send it the same tiny text request first and stop with its message if it fails.
- **A model step's button is disabled,** with the reason, until the key it needs has passed.
- **Keep it out of the books' records:** the check is not a method, reads no book content and costs a small fraction of a cent. Do not write it to a book's call ledger, do not keep its response, and never print or log a key. Remember the result with the key (works or not, and when), and forget it when the key changes.
- **Tests** use a mocked request, as `webapp/test/readers.test.mjs` does: a key that works, a refused key, a network failure, and the key removed from the message.

#### Flags

Computed locally from the page documents, with no model call, in a new pure module `webapp/js/flags.js`.

For Regions:
1. a region the model marked `uncertain`;
2. a region of type `other`, or any entry in `source.omitted_regions`;
3. a warning from `scaleRegions` (a kept region with no reading order; furniture marked as kept);
4. a region with no ink (`source.regions_skipped`);
5. a printed line that no region took: the local step already decides this for each line (`mode: "uncovered"` in `assign`, `webapp/js/local/regions.js`). Have the worker return those lines with their boxes; read `assign` first to confirm what the mode covers;
6. two regions whose boxes overlap by more than a fifth of the smaller one;
7. an error from `checkPage`;
8. continuation that does not match the neighbor: in some flow, this page's last region has `continues_later` and the next page's first region of that flow has no `continues_from_earlier`, or the reverse (only when both pages have regions);
9. a rare layout: the page's layout signature (its region types in reading order, with repeats collapsed) is shared by fewer than three pages of the book.

For Text: line pieces without text on a transcribed page; a region the transcription marked uncertain; a line-count mismatch recorded in `source.problems`; transcribed under an earlier type list.

For Read: errors and warnings from `checkPage`; assembly warnings; a region completion marked uncertain; a waiting suggestion.

Flags order the review; they never block moving on. Flag 9 and grouping by layout are how a new kind of page announces itself, which the sample for the type proposal cannot be relied on to do: the private series' twelve sample pages held no footnote. A shared layout says nothing about whether the boxes are right; the other flags are for that.

#### Comparing models

There is one comparison for each model step, reached from the tab the step belongs to. Each runs the candidates on the same sample pages with the same inputs, shows elapsed time and the projected cost for the whole book, and ends with saving the choice for the book. A comparison run never writes into a page document, as now; only settling does.

| Model step | State now | To build |
| --- | --- | --- |
| Proposing the type list | two models (077, 078), one at a time | run both and show one merged draft: the types both found, and the types only one found, for the user to keep or drop. There is no model to "choose" for a one-time call. |
| Finding regions | Terra only | the region finders below, and a comparison with overlays on the same pages. Match line ids together with their ink ownership or polygons. A printed line can have pieces in several regions with the same line id, so ids alone can hide differences in boundaries. |
| Transcription | built (`readersview.js`) | settling, below |
| Completion | built (`structuresview.js`) | settling, below |

**Settling:** on each differing item (a line's text, a region's type or grouping, a page's regions) the user picks the right version or corrects it. The choice is written into the page's document as an edit. Scores come only from settled items; the transcription comparison's "checked reference lines" already work this way. Until something is settled, show counts of differences from the reference model, labelled as differences.

#### Region finders, and work by hand

The user wants several models, no-cost finders if they can be made, and a manual flow that works by itself. Each finder below is a new method (from 079) with its README, scored on the nine reference pages with method 043's evaluator (`methods/043-gpt-6.1-terra-none-book-types-continuations-band-chained-lines/evaluate.py`), as method 063 was (its README says how), before it is offered in the app.

- **Models:** the present prompt (method 042's) with other models: the Gemini models already used for transcription (Argon low and high, Flash, Flash-Lite) and one or two further OpenAI models. One method ID each.
- **No cost, from our own line finder:** run the local step on the whole page and group its lines into blocks by the gaps between lines, changes of indent and changes of letter size. Guess only coarse classes (a short line alone at the head or foot of the page as running header or page number; a block in smaller type at the foot as notes; the rest as paragraphs), and give a region a type of the book only where the book has exactly one type of that class; otherwise `other`. Untested.
- **No cost, from Tesseract's layout analysis:** the bundled Tesseract (`webapp/vendor/tesseract-6.0.1`) reports blocks and paragraphs as well as words. Check what it returns on the reference pages before building on it. Untested.
- **By hand:** the flow must work with no finder at all, from "Start by hand": draw each box, pick its type, set the order. With a no-cost finder it becomes retyping, merging and splitting blocks. Make it quick: a key for each type on the selected region, and Tab to the next region.

Expect the no-cost finders to give usable boxes and poor types. Types that only this book has (a verse against its commentary) need a model or a person.

### Build progress

Step 1 is complete on 2026-11-09. The new pure modules are `webapp/js/layers.js`, `webapp/js/pipeline/provisional.js` and `webapp/js/pipeline/apply.js`. Provisional documents validate on all nine committed public region references. Eighteen new tests cover layer inference and edits, blank and illustrated pages, containment and open ends, omitted regions, text reuse, protected region types, invalid merges, stale inputs, model-local unit IDs and note-link preservation. The shared marked-line parser is used by both the existing document builder and the text merge; the six historical document-builder comparisons pass.

The merge functions preserve inputs and return `{doc, taken, suggestion}`. Region replacement accepts a third `check` callback; text and completion merges also accept a checker, with semantic checks as their default. Pipeline callers should pass the full page checker so a passing document is retained whenever its proposed replacement fails. Completion preserves current geometry and text, maps note anchors onto the current markers and applies protected-unit metadata only where a unique type/first-region match exists. OCR that would redirect an existing protected note anchor is held as a suggestion.

Step 1 passed all 124 app tests and 11 schema tests. A browser smoke check used the public Cole reference with simulated text to verify module loading, a valid provisional document, text merging and protection of a reviewed unit label. Development made zero model calls.

Step 2 is complete on 2026-11-09. `Maker.findRegions` now saves a provisional document. Normal transcription and completion apply the pure merges to the latest saved page, with valid drafts treated as edited content. Invalid drafts stop processing before a model call. Conflicting alternatives are retained through `source.suggestions` pointers to their work records. Comparison calls explicitly disable region-document saving, and their reading and structure calls keep work records only. Read-only books also keep trials outside page documents.

`Book.updateStage` performs the merge under a book write lock. `saveStage` writes a recovery journal in `work/pending-stage/`, retains protected previous documents in `work/history/`, saves the merged model document and manifest, removes the old edit and clears the journal. Opening, exporting, reading a pending page or retrying a write recovers an interrupted save. Recovery retains a newer draft. Page edits, stage writes and model-choice writes are serialized, with Web Locks coordinating browser tabs when available. Saving an edit classifies its changed layers, including region continuation flags. The page editor's cached copy is invalidated after a stage save.

Transcriptions have a geometry key, with region IDs sorted so reading-order changes also reuse the same ink. Older records derive it from their saved geometry. Type and convention changes reuse compatible transcriptions and expose `prior_revision` and `requested_fingerprint` on the returned result. Showing that status and offering re-reading belong to the Text view in step 6. Completion uses current corrected marked text and neighbor text. Equivalent text retains the original reading fingerprint and finds older completion results. The existing Make pages status distinguishes provisional regions, saved text and a completed page so provisional documents do not prevent subsequent processing.

Step 2 passed all 135 app tests and 11 schema tests. Eleven new integration tests cover byte-identical requests and cache fingerprints on unedited pages, legacy cache migration, corrected geometry and text, edits saved while a model call is in progress, drafts, comparison isolation, recovery at each file boundary and concurrent manifest updates. A Chrome check uses actual origin-private file storage, public Cole geometry and simulated provider responses to exercise transcription, completion, a protected correction and interrupted-save recovery. Kale, Telang and the private digital book open in the browser. All 699 embedded page documents are preserved on opening, and all three original PDFs pass their embedded length and SHA-256 checks. These checks made zero provider requests.

Step 3 is complete on 2026-11-09. The app has Pages, Regions, Text, Read and Export tabs. `workflow.js` owns stage eligibility, old and new hash addresses, page states and acceptance transitions. `pagesview.js` supplies the page grid, lazy thumbnails shared with `page-browser.js`, scan previews, selection by checkbox, shift range or typed ranges, and state, flag, revision and suggestion filters. With no selection, actions target the displayed pages. Explicit selections retained by a filter are counted as hidden selections. Pages leaving a stage are removed from its selection. Text lists accepted regions. Read includes accepted text and names omitted page ranges, with temporary open-end boundaries preventing joins across those gaps. A complete legacy book opens at Read, and a book with pending pages opens at Pages. Text exports require some transcription. PDF book saving stays available at every stage.

The three stage grids use `pipeline/batch.js` for progress, stopping, spend limits, unknown charges and persistence failures. Regions can materialize a cached region trial. Text calls transcription only. `Maker.complete` operates on current text and can also complete an existing document with no saved OCR trial. Model choices are saved per book. Mean completed-call costs provide selection estimates, and moving text on offers completion of those same pages. The existing comparisons, type list, Problems, style sheet and page editor are reachable under their new tabs and old bookmarks. The current page editor is placed under each stage as specified for this step. Its focused controls are still scheduled for steps 4 and 6. The type proposal still belongs to the new-book form until step 4.

`key-check.js` sends a short test request to the selected provider and model, with a generated blank PNG for Cloud Vision. Errors appear beside the credential, and processing requires a successful check. Checks are session-local and tied to the credential, model and Vision authentication/project. A late result for a replaced credential does not enable processing. Local OCR needs no key. Key checks have a small billable cost and include no book material. Navigation is held during stage writes and runs. Concurrent initialization shares one Maker, and work-ledger updates reload and append under the book write lock.

All 146 app tests and 11 schema tests pass. Eleven additional cases cover routing and legacy addresses, availability, missing-page joins, acceptance through folder and read-only edits and a real PDF round trip, each batch stage and stop condition, key-test payloads and stale responses, independent completion, cached region trials and concurrent ledger appends. Chrome exercised browsing, failed and successful credential checks, cached regions, bulk movement, transcription alone, completion alone, sending back and reload persistence on a disposable three-page browser book. Provider responses were simulated. The existing Kale book exposes all five tabs and renders its reading view. Development made zero provider requests. Continue with step 4.

Step 4 is complete on 2026-11-09. `regionsview.js` supplies the Regions-focused editor and the type panel beside it and the grid. A page can start by hand, with local line analysis and empty provisional units, then be drawn, typed, ordered and moved on to Text. The editor exposes box coordinates, drag handles, continuation flags, splitting and same-type merging. Existing transcription is read only. Printed-type shortcuts use 1–9, with Tab and Shift+Tab moving the region selection while working on the scan. Phone layouts stack the scan and controls.

`flags.js` computes separate Regions, Text and Read flags. Regions flags cover uncertainty, unknown types, missing order, no ink, omitted regions, uncovered lines, geometry and provisional errors, overlaps, continuation disagreement and rare layouts. The local worker returns genuinely uncovered ink lines with their boxes. The grid draws colored region boxes and groups layouts rarest first. Omitted regions are hatched and can be assigned a type. Editing geometry preserves pending transcription and provisional units. Splits preserve reading order and outer continuation flags. Merges retain compatible text, spans, markers, links and open ends and reject conflicting line data before mutation.

`book-types.js` supplies additive type creation and initial type-list replacement. `Book.addType` writes one checked type list under the book lock and records the revision. New types can be assigned from a region's menu immediately. New books default to common draft types and can be created without a proposal or key. Type discovery is also available inside Regions, with selected grid pages as samples, checked credentials and attempts saved in the book's work files. Initial proposals can be applied only before page documents exist. This is the deliberate step-4 boundary. Full replacement on existing documents, rename, merge, split, deletion and the remaining operations and migration journal belong to step 5. Historical prose revision notes are retained as `source.legacy_revision` on the first operation and interpreted as revision 1 for stage bookkeeping.

All 169 app tests and 11 schema tests pass. The 23 added tests cover every flag category, manual provisional editing, order, splitting, merging with Indic text and note anchors, invalid operations, figure retyping, focused save persistence, atomic type writes and legacy revisions. Chrome exercised manual drawing, adding and assigning a type, local outlines, split, order, merge, omitted-region recovery, layout grouping, moving on, transcription of manual geometry, reload persistence, the no-proposal new-book route and an in-book saved proposal. Keyboard navigation and a 390-pixel stacked editor were checked. The existing full Kale book opens in Regions with readable text and numeric revision bookkeeping. All provider responses were simulated, with zero provider requests or charges. Continue with step 5.

Step 5 is complete on 2026-11-09. `type-revisions.js` provides pure operations, document migrations, alias mapping and reach calculations. `type-operations.js` provides editing forms and the review dialog in Regions › Unit types. Descriptions, book details and conventions, addition, rename, merge, split, containment and flow, printed class, removal and replacement are available. Containers can be added with at least one child. Every operation shows its reach before application. Renames preserve transcription while updating regions, units, containment, styles and aliases across model pages, corrections and drafts. Old names remain reserved. Merges require the same printed class and furniture role, or two containers. An existing target style wins. A merge that would invalidate a previously valid document is rejected before writing.

Containment changes check every version. Invalid provisional or unprotected unit trees are rebuilt and flagged for completion, with text reused. Protected trees are preserved and flagged for manual repair. Preview follow-up counts describe the effective page versions, while file counts include all migrated versions. Figure-class changes retain text in provenance, clear stage acceptance and flag region discovery. Removal requires zero uses across model documents, corrections and drafts. Replacement requires every page to be unprotected, clears the page documents and sets a region-cache reset revision. The old definitions and changed versions are archived under `work/type-revisions/<n>.json`. Layer model-run revisions are preserved, with `source.types_migration_revision` identifying a migrated document.

`Book.previewTypes` reads a fresh snapshot and fingerprints it. `Book.saveTypes` checks the preview against the latest saved inputs under the book lock and journals the multi-file operation at `work/pending-types.json`. Reopening, reading or another write recovers interrupted operations. A newer draft is migrated with its new text. Older editor saves apply current aliases. Style writes and book exports share the lock. Export refreshes its types and page versions together. Raw model work records are preserved, and their region and unit names are mapped on read copies. The in-book proposal uses the same replacement preview and guard, with a page count and follow-up cost estimate before application. Questions link to cited sample pages and retain decisions in `source.discovery.resolved_questions`. Existing questions can be resolved through a logged operation. The in-book type editor has forms, with saved proposal JSON available as diagnostics.

All 186 app tests and 11 schema tests pass. Seventeen added tests cover every operation, validated migrated documents, text preservation, style precedence, aliases, protected units, draft uses, figure changes, replacement, stale previews, recovery after each file boundary, newer drafts, older editor saves and concurrent export. Chrome exercised a transcribed page through rename, reload, merge, container creation, containment rebuilding and metadata changes. The simulated page-call count stayed constant during these operations. A protected-page replacement was blocked. Another three-page fixture was replaced after a count/cost preview, with prior work archived and the grid returning to pending Regions. Question links opened the PDF preview and decisions survived reload and subsequent logged changes. Browser fixes also refresh layout flags and remove obsolete manual-start buttons after batch processing. Provider responses were simulated, with zero live provider calls or charges. Continue with step 6.

Step 6 is complete on 2026-11-10. Text has a flat region transcription editor with inline formatting, printed note markers and page labels. Its geometry, grouping and line ends are locked. Read has a units-focused page fallback and an editing panel on the assembled reading. The panel shows the scan, clickable ancestry, source-region and page-fragment navigation, unit type, number and label, splitting, joining, wrapping, unwrapping, furniture, line joins and note links. Line-join controls collapse in the reading panel and retain their open state through saves. Read-only books expose inspection. Provisional text is readable before completion with spaces at every line end.

`editing.js` provides focus guards, fragment paths, stage-owned save merges and cross-page join validation. Assembling can report merged IDs to build canonical-unit and fragment maps without changing its output format. Semantic fields and wrapping apply to every fragment of a logical unit. Splits and open ends act on the selected fragment. Cross-page joins open the matching ancestor paths on both pages, reject gaps and incompatible metadata, then reassemble without losing the reader’s place. Problems are marked in place and linked from a list. Language changes participate in unit snapshots and protection.

`Book.editPages` checks fresh unit snapshots under the book write lock, preserves newer transcription, journals coordinated page saves at `work/pending-pages.json` and recovers interrupted writes before reads, writes or export. Text autosaves use three-way field merges to retain newer unit edits and independent text corrections. Page autosaves are serialized. Invalid drafts remain available for repair. Focused saves validate the merged result. Browser checks also fixed stage shortcuts that stayed disabled on opening an editor added a preparing state to manual-page startup, and made clicks between printed lines select their enclosing unit.

All 200 app tests and 11 schema tests pass. Fourteen added cases cover focus locks, provisional rendering, fragment mapping, semantic fields, language protection, conflicting joins, stale saves, interrupted writes at every file boundary, coherent export and preservation of newer work. Chrome exercised transcription corrections and marker insertion, focused fallbacks, cross-page joining, whole-unit labeling, reload persistence, inline problems and read-only inspection. A three-page public Kale sample exercised plain-PDF creation, scan browsing, an in-book type proposal, replacement, model region discovery, a box correction, manual region drawing and verse-type creation, acceptance, transcription, completion and joining. The book PDF download was produced and its exporter’s bytes were reimported as a separate browser copy, retaining the joined unit and note marker. The passage panel was checked at desktop and 390-pixel widths, including a saved line-join change. Provider responses were simulated throughout, with zero live API requests or charges. The next build step is suggestions and settling.

Step 7 is complete on 2026-11-10. `review.js` applies explicit human choices to page documents and records the evidence under `source.review`. `review-view.js` supplies the shared comparison dialog. Suggestions can be opened from stage grids, focused editors and the reading panel. A person can keep the current version, take the candidate or dismiss its suggestion. Partial choices keep the remaining suggestion available. Whole-page choices clear it. Reviewed layers become protected edits even when the chosen content already matches the current page.

Transcription comparisons can settle a page, region or line. A line can be corrected in the dialog, with formatting and note markers retained. Matching note anchors keep their IDs and links, including a uniquely matching marker that moved within its line. Changed or ambiguous markers get fresh IDs and obsolete links are removed. The preview reports transcribed lines becoming pending and links being removed. Structural comparisons include the current page beside model results, with actions for grouping, line joins and region types. A region grouping choice uses the smallest shared complete subtree. Changes to ancestry, flow or links can widen the choice to the page, with the affected-region count shown before saving. Full region replacements leave text pending and units provisional.

Reviewed transcription lines supply the checked-error score. Structural scores count only reviewed region decisions and fields. They require matching ink, printed input and current choices. Local marker IDs do not count as a transcription difference. Geometry is retained once per structural review context. Comparison differences from a model remain separately labelled. Schema comparison now shares `Maker.completionInput` with normal completion, so saved text corrections reach every candidate without a new transcription request. The existing prompts, response schemas and model settings are retained.

Review saves recheck the page, type list and model record under the book lock. The page edit, evidence, suggestion removal and previous page are covered by the existing page-save journal. Previous pages go to `work/history/<pid>.json`, and raw work records are preserved. Tests interrupt every write boundary and recover the complete choice. Writable copies are required for saving reviewed choices.

Type discovery offers both existing models in one run. The merged draft groups matching names, shows agreement or differing definitions, identifies types found by one model, and offers keep/drop and source-definition controls. Each model keeps its call record. The primary call metadata stays intact and comparison metadata records the combined cost. Review and approval use the existing replacement preview and protection checks. Keep/drop choices survive saving and reopening.

All 216 app tests and 11 schema tests pass. Sixteen new review tests cover protected text, Indic lines, stale scores, blank pages, marker identity and links, partial subtrees, widened scopes, structural scores, invalid inputs, replacement-stage states, immutable work, stale choices, journal recovery and merged drafts. An existing pipeline test now checks that preparing corrected completion input makes no call and changes no page. Chrome exercised kept and dismissed suggestions, a corrected line chosen from a model comparison, structural settlement and scores, and a two-model type draft whose dropped type remained dropped after application and reload. Provider replies were simulated throughout, with zero live API requests or charges. Continue with step 8. Ask the user which additional OpenAI region models to try, as required by the design, before starting paid finder experiments.

Step 8 is complete on 2026-11-10. Regions has a saved finder choice and its own comparison view. The choices are the existing Terra baseline, local line blocks (079), Tesseract paragraphs (080), Astra low (081), GPT-6.1 Sol low (082), Argon low/high (083–084), Flash low (085) and Flash-Lite minimal (086). The user chose Astra and Sol. The implementation selected the current GPT-6.1 Sol and low reasoning for both additional OpenAI models. Their supported settings and standard rates were checked in official model documentation. The six model finders made 54 successful calls on the nine public references for an estimated $1.700885. Astra, Sol and Argon high had zero ink, grouping or missing-passage errors in this run. Lower Gemini settings had substantial errors on several pages. Semantic types and continuation flags were not separately scored. The two free methods have zero API cost and require manual grouping and type corrections. NOTEBOOK.md and each new method retain the scores, configurations, responses, derived geometry and evaluation records. The next unused method ID is 087.

The comparison accepts all, ranges and lists of sample PDF positions, shows every saved candidate as a scan overlay with types and order, and offers the shared whole-page review dialog. Finder-local region IDs do not imply corresponding passages, so region-layout replacement is a whole-page choice. Decisions supply exact reviewed-layout matches separately from reference differences. The chosen finder is used by the normal stage grid. Native Tesseract layout uses mode 3 and the existing transcription path keeps mode 6. Both share a serialized worker. The local line finder groups by spacing, indentation, size and columns. Only a unique book type for a guessed coarse class is assigned. All local guesses are flagged uncertain.

Finder work is saved separately under work/region-finders/<page>/<profile>.json. Compatible legacy Terra results remain usable. Comparison trials preserve the current page and active geometry. Normal stage processing makes the chosen result active, retains the preceding finder's cache and protects human work through suggestions. Cache compatibility covers the scan, finder method, type list and Tesseract language. The region choice is stored as reader_options.finder. The comparison groups credential checks by provider while checking each selected model, has progress and stop controls, and uses the existing spend and failure ledger. Its single whole-book cost estimate includes the selected transcription and completion sample costs, assuming those downstream costs stay at their sampled level. Missing stage samples leave the total unavailable.

All 225 app tests and 11 schema tests pass. Added checks cover coarse typing, ambiguous types, block splitting, native paragraph extraction, legacy defaults, independent caches, language and type changes, protected suggestions, reviewed-layout evidence, frozen request parity and the new OpenAI credential settings. Chrome exercised all nine finder choices with simulated model responses and real local finders, cache reuse, a comparison using only the two free finders, grouped key checks, saved choice persistence, a held-back region suggestion, explicit layout replacement and pending downstream stages. The view was checked at 390-pixel width. A separate public Cole fixture loaded the actual recorded benchmark outputs for visual inspection. Browser validation added zero live API calls. Continue with step 9.

Step 9 is complete on 2026-11-10. Transcription compares each region ID, polygon and numbered line geometry with the same model's saved reading on the same scan. Compatible regions are reused. Changed or added text regions go through the existing request builder with their own cut-outs and response contract. The saved result remains a complete page reading. Deleted regions require no request when the remaining text is reusable. An explicit fresh request or a page with no compatible saved text for its scan, model and OCR language uses a whole-page pass. Existing full-page requests and method IDs are retained.

The previous reading is archived under work/reading-history. Composite readings list their contributing parts, target IDs and reused IDs. Raw partial calls retain the method profile and are marked partial. A deterministic request pointer recovers a completed paid response after an interrupted save. The raw call and ledger are saved before sending a partial request. An unresolved attempt blocks an automatic repeat, with an explicit fresh whole-page request available after reviewing the saved attempt. Cache saves recheck the previous reading under the book lock, preserving a newer result if calls finish out of order.

Protected transcription receives a suggestion. For a repair using the page's existing model, accepting the suggestion retains current text in the other regions, including human corrections and marker identities. The review labels those regions "Current text retained". Model comparisons still show the saved model text, so those corrections do not become model output. Completion receives the full current transcription. Cloud Vision reuses its saved full-page word geometry without a new API request. A recovered Vision response is remapped against the latest region geometry. Local Tesseract reruns on the full image to keep competing word ownership consistent, then combines only the targeted regions.

Book projections use whole-page samples. Composite repaired samples are excluded, with an unavailable estimate when no whole-page sample remains. The API ledger retains repair and retry charges, and contributing call paths prevent a reused Vision response being counted twice in a composite. Text progress reports changed and reused regions. The comparison identifies repaired readings and exposes their partial API attempts.

All 236 app tests and 11 schema tests pass. Eleven added cases cover cut-out scope, combined completion input, protected corrections, marker identity, invalid responses, interrupted saves and ledgers, unresolved calls, concurrent cache writes, additions and deletions, figure transitions, changed scans, explicit fresh results, cost projections and both OCR providers. A regression within the Vision case checks recovery after another box edit. Chrome used real outlines and image cut-outs with simulated provider responses. It enlarged one of two regions to include a new line, requested only that region, reviewed and saved the repair, retained the other region's human correction across reload, and checked raw model text, repair ledger details and the 390-pixel view. This step made zero live API requests and incurred no provider charges. All nine build steps are complete. The next unused method ID remains 087.

### Build order

Each step ends with the tests passing (236 app tests and 11 schema tests now, with the two commands under "Current state"), a browser check, a NOTEBOOK entry, and `webapp/README.md` and this file brought up to date.

1. **Complete. The pure modules and their tests:** `layers.js`, `pipeline/provisional.js`, `pipeline/apply.js`.
   - Provisional documents made from the `regions` lists of the nine committed region records (`outputs/<page>/063-fragment-band-lines/regression-001/regions.json`, written by the Python method; the page sizes are in the same files) with their books' type lists (`schema/types/`) pass `checkPage`. So does the empty document.
   - Layer states: an old document with and without `source.edited`; each kind of edit; accepting and sending back.
   - The merge: every row and case of "How each model step writes", including a merge that would fail the checks.
2. **Complete. The pipeline** (`run.js`, `store.js`): finding regions writes the provisional document; `sourceRegions` reads the current document; transcription and completion merge; `saveStage`; `geometry_key`.
   - A page nobody edited sends byte-identical transcription and completion requests, and finds its saved results (use the mocked `Maker` of `webapp/test/readers.test.mjs`).
   - A page whose regions a person edited is transcribed with those regions, and keeps them.
   - A protected layer is never changed by a model step; a suggestion is recorded instead.
   - Changing the conventions or one region's type does not cause a new transcription call.
   - Old books open unchanged (Kale, Telang and the private digital book as `.chaya.pdf`), and a `.chaya.pdf` still gives back the exact original PDF.
3. **Complete. The tabs and the grid:** the five tabs with their availability and addresses; `pagesview.js`; the Pages tab; moving on and sending back; the one run loop; the keys panel with its check. The old views are placed under their new tabs as they are.
   - Every view that works today is reachable, and every old address opens the right view.
   - A new book has Text and Read greyed out; an existing book (Kale's `.chaya.pdf`) has every tab.
   - Moving pages on and sending them back survives a reload and a save to `.chaya.pdf` and back.
   - A wrong key shows the provider's message beside the field; a working key enables the model step.
4. **Complete. Regions** includes the overview and model step, `flags.js`, the focused editor with and without text, reading-order and merge operations, "Start by hand", the types panel with "New type…", creating a book without a proposal and grouping by layout. The new operation tests share the manual-region fixtures in `webapp/test/regions.test.mjs`.
   - A page can be taken from nothing to moved-on by hand, with no model call.
   - Retyping a region before transcription leaves the units `provisional`.
   - Each flag has a test with a small made-up document.
5. **Complete. The type list’s operations** include `saveTypes`, the revision log, operation forms and reach previews, migrations and recovery, and the proposal and review questions inside the book.
   - Each operation has a test: the documents after it pass `checkPage`, and the reach it announced is what it changed.
   - A rename changes no transcription and causes no model call.
6. **Complete. Text and Read:** the Text overview and the editor's text focus; in Read, running completion, the editor's units focus (the fallback), then the side panel on the reading view, joining across a page break, and problems in place.
   - A page moved on from Regions, transcribed and completed keeps the region types it was moved on with.
   - A join across a page break gives one unit in the reading view and no assembly warning.
7. **Complete. Suggestions and settling:** the suggestion panel; settling in the two existing comparisons; the merged type-list draft.
   - A model step on a page with an edited layer leaves the layer alone, and the page shows a suggestion that can be taken or dismissed.
8. **Complete. Region finders:** the further models, the two no-cost finders and the comparison (new method IDs; the first step that needs paid calls beyond checks). The keys that make work by hand quick.
   - Each finder's scores on the nine reference pages are in NOTEBOOK.md before it appears in the app.
9. **Complete. Re-reading single regions:** send only the regions whose shapes changed, with the same request builder, and merge the result into the saved reading. Treat it as the same method, with the call record marked as partial; the user was told this on 2026-11-09 and raised no objection.
   - Moving one box on a transcribed page causes a request with that region only.

Walk through the whole flow by hand after steps 4 and 6, on a public PDF (`Kale-1913-pp21-272.pdf` in the repository root; include a few of its pages only): open the plain PDF, browse, propose and edit types, find regions on a few pages, correct one, add a type from a page, move on, transcribe, move on, complete, read, fix a join across a page break, export, and open the exported `.chaya.pdf` again. Also do one page entirely by hand. Keep paid checks to a few pages and record their cost. Work on the private series follows the budget in PRIVATE.md.

Things that will trip a new session:
- **Stale modules:** `main.js` imports some modules with a `?v=…` tag. Change the tag when you change the module, or the user's browser keeps the old one (this happened on 2026-11-09).
- **Storage is per origin:** `localhost`, `127.0.0.1` and the Tailscale HTTPS name each have their own books and API keys.
- **Frozen methods:** nothing under `methods/` or `outputs/` is edited. Steps 1 to 7 must not change what is sent to a model for a page. A new method's README and frozen copy follow the pattern of methods 065 to 078.
- **Privacy:** nothing from the private books goes into git, test fixtures included (PRIVATE.md, local).
- **Keys:** never print, log or commit an API key. Tests use mocked requests.
- **When the design is unclear or seems wrong,** ask the user; do not guess on anything that changes saved data or costs money.

### Experiments after the build

Each is a new method, with a NOTEBOOK entry and immutable outputs. They decide how far decision 2 can go.

1. **Container starts from finding regions:** add one field per region naming the container that begins there, and build the tree locally. Compare with trees a person has corrected. If it holds, units are settled before transcription on most pages.
2. **A narrow completion call:** for fixed units, return only line ends, numbers and labels, and note links. It should cost less and fail the checks less often than 070 to 076.
3. **Completion over a run of pages:** one text-only call for a chapter, for the joins and continuations at page breaks and for notes that cross pages.
4. **Combined against split calls** on the current geometry (the earlier private comparison used different prompts and geometry).
5. **Line joins by rule:** the digital book's rule got about 87% right; measure a rule on transcribed scans.
6. **Layouts before any model call:** use the no-cost line-finder blocks of step 8 to group pages by layout as soon as a PDF is opened, to help choose sample pages.

### Still open

- **Units under Read:** the user accepted this if it can be made to work, to keep the tabs few. The fallback above keeps units correctable while the side panel is built. If the panel does not work out, units get a tab of their own between Text and Read.

### Starting work next session

1. Read this section, "Current state" below, PRIVATE.md on this machine (local; it has the source PDF locations, the browser origin and book in use, the unfinished comparisons and the cost accounting), `webapp/README.md` and `schema/README.md`.
2. Run both test suites, and open a book in the app to see the current modes.
3. The nine build steps are complete. Continue with the user's full-book workflow, correcting concrete issues found there. The separately listed experiments remain open and require new method IDs and recorded costs. The user has authorized committing and pushing finished work straight to `main`.

## Current state (2026-11-10)

**Goal (unchanged):**
- turn a book's PDF into a digital book whose every unit (paragraph, verse, saying, footnote…) links to its page regions;
- do it in a statically hosted web app that uses the user's own API keys.

**Two pipelines into page documents:**
- **scans** (model calls), as the app's Make pages runs them:
  1. page regions with the chosen finder, using Terra (042), local blocks (079), Tesseract (080), Astra (081), Sol (082), or Gemini variants (083–086);
  2. method 063: the local step (ink lines and outlines, with fragment bands joined to their parent lines);
  3. selectable reading profiles 065–069 and 071–072, with Argon low/high, Flash low, Flash-Lite minimal, local Tesseract or Cloud Vision Text Detection and Document Text Detection;
  4. selectable text-only schema assignment with Argon high (070, the default), Argon low, Flash low, Flash-Lite minimal or Terra without reasoning (073–076), preserving the transcription’s printed text. Each model and stage is cached separately. Method 064 preserves the earlier combined transcription recipe on method 063 geometry;

  Earlier book runs: Kale (method 052) and Telang (methods 052 and 054);
- **digital PDFs** (no model calls):
  1. method 058: our Nudi/Baraha converter, `nudi.py`, which reads the PDF's legacy-encoded text;
  2. method 062: units from the typography, with figures and ornaments, columns, hidden text left out, and styles. Method 062 supersedes 059, 060 and 061.

  The vachana book (252 pages, 1,286 units, all valid) is made this way. Its type list (`schema/types/vachana.json`) was written by Claude and is not yet reviewed by the user.

**Schema (draft 0.3):**
- 0.2's line pieces, spans, note markers and relations;
- optional styles (a per-book style sheet, and `style` on units and line pieces, presentation only), with rows for side-by-side units;
- figures: a region class with no line pieces;
- type lists are per book. New books can start with draft types, a reviewed sample-page proposal through methods 077–078 or an existing list. Regions offers operation forms and reach previews for type-list revisions, with migrations across pages, corrections, drafts and styles. Replacement requires unprotected page layers. Proposals and review decisions are saved inside the book. 0.1 and 0.2 documents stay valid.

**The web app (`webapp/`, README there):**
- **tabs** are Pages, Regions, Text, Read and Export. Regions includes the type list and region finding. Text compares and runs transcription models on pages whose regions are accepted. Read includes the reading view, units and links, completion comparisons, Problems and the style sheet. Stage-focused page editors open from the grids, and Read has a passage editing panel. Text and Read availability follow acceptance, including inferred acceptance in legacy books.
- **input:** PDFs only;
- **storage:** books are kept in the browser's private file system, with autosave, and saved as one file, a `.chaya.pdf`. That is the original PDF's bytes, unchanged, plus one update attaching `chaya.json` with the book's data; the original is recoverable exactly. Pages are drawn from the PDF;
- **published books** open by URL, read only;
- **transcription repairs** reuse unchanged model readings after region edits and request only changed text regions. Protected text receives a scoped suggestion. Saved Vision word boxes can be remapped for free, and Tesseract reruns locally. Whole-book cost projections exclude composite repairs and the ledger records their API charges.
- **editing** Regions edits page geometry. Text edits transcription and markers. Read edits units, line joins and note links through its page fallback or passage panel. Cross-page joins have coordinated saves and recovery. The style sheet editor remains under Read.
- **tests** run `UV_CACHE_DIR=/private/tmp/scan-test-uv-cache UV_NO_SYNC=1 node --test webapp/test/*.test.mjs` (236) and `UV_CACHE_DIR=/private/tmp/scan-test-uv-cache UV_NO_SYNC=1 uv run --offline python schema/test_book.py` (11).

**Running:**
- `uv run --offline python -m http.server 8765 --bind 127.0.0.1` from the repository root, then http://127.0.0.1:8765/webapp/;
- in this session the same server was also bound to the Tailscale address (100.115.7.63:8765) for the user's other machine. Over plain http to a non-local name the browser gives no secure context, so the app only opens `.chaya.pdf` files read only there;
- The user authorized Tailscale access on 2026-11-08. Tailscale Serve now proxies HTTPS on this machine's full MagicDNS name to `http://127.0.0.1:8765`, in background mode and within the tailnet. On this Mac the CLI is `/Applications/Tailscale.app/Contents/MacOS/Tailscale`. The app is at `/webapp/`; the exact personal URL is in PRIVATE.md. Verified the TLS certificate and HTTP 200 responses for the app, main script, stylesheet and existing comparison PDF. The Mac and local server must remain running. Browser books and API keys belong to each origin and device, so use a `.chaya.pdf` export/import to transfer a desktop book to the HTTPS origin or phone.

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
- **2026-11-09** (for the design above; none of it is built):
  - the app is organized by stage, with tabs Pages · Regions · Text · Read · Export, and the editing of single pages under its stage;
  - later tabs are greyed out until the stage before them is ready;
  - no approval page by page: the book, or a selection of pages, is moved on to the next stage;
  - the type list is part of Regions;
  - region finders: several Gemini and OpenAI models, no-cost ones if possible, and a manual flow that works by itself;
  - units, joins and links are corrected in Read, if that can be made to work;
  - API keys are checked with a cheap call where they are entered.

**Open, roughly in order:**
0. **Private scan series and model comparisons**. The corrected twelve-page sample uses method 063 geometry. Both transcription and schema assignment models can be selected and compared per book. The schema comparison fixes the input transcription and shows canonical structural choices by region. Its two-page private trial adds eight saved results, six schema-valid and two invalid, to the existing Argon-high reference. Cloud Vision’s two OCR modes are implemented and tested with fixtures, but the configured Gemini key was rejected by Vision and the local Google Cloud CLI could not supply an OAuth token. The UI supports separate Cloud Vision API-key or session-only OAuth credentials and a quota project. “Continue” creates an editable browser copy for a URL book and opens Make pages. Excerpts can start from the full PDF with their types and model settings. Make pages processes a chosen range with missing-region discovery, cached stages, a spend threshold, and explicit reprocessing of existing model documents. Known cumulative token-based estimates are $1.6463775, with two unresolved timeout charges and a $1.50 reserve. The user has requested the full-volume browser workflow, and its 267-page browser book is prepared as described below. All collection contents remain outside git. Stop before $40 cumulative spending under the user’s $50 authorization.
   - **The collection's digital PDFs in legacy fonts** (two books, in Nudi and Baraha encodings and in renamed CID fonts) are free tests for the text-layer path (item 2).
   - **A PDF's text layer is not to be trusted as it comes** (the user, 2026-11-07): the scanned PDFs in that collection carry OCR text layers that are nonsense, which the user had tried removing. The app's text-layer path must tell a real digital text layer (fonts that draw the visible text) from invisible OCR text (render mode 3), and leave the latter aside.
   - **An idea for later:** a `.chaya.pdf` could replace such a layer with the book's corrected text, drawn invisibly, so that the PDF becomes searchable in any viewer. The pages' content would be replaced in the update, so the original would stay recoverable.
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
3. **Type lists:** the initial sample-page proposal and review are implemented in the new-book form, with Terra reasoning off as the default and Argon high as an option. The proposal is schema-checked, cites sample pages and includes review questions. Each attempt is retained in IndexedDB before book creation and copied into the book's work records, including when the user ultimately chooses an existing type list. At the user's suggestion, OpenAI and Gemini keys were retrieved through llm and saved in the localhost app's browser. Live checks on the same four Cole pages produced thirteen Terra types and eleven Argon-high types, both valid, with displayed estimated costs of $0.0200 and $0.0990. The normalized results and screenshots are under outputs/surveys/077-*/cole-live-001 and 078-*/cole-live-001. The complete response and usage records are in the browser, with call paths in the saved types' provenance. The latest proposal is pending human approval. The key fields now load saved values and save edited values on blur. The local browser contains a four-page Cole setup-test book created through the earlier existing-list check. Revising types of already processed books and the user's review of the vachana list remain open.
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

The user’s terminology correction on 2026-11-08 calls the options “transcription models”. Region comparison shows every model whenever any transcription differs from the selected reference, with the scan and full region text. Argon high is the default reference. Checked reference lines supply accuracy scores. The stages are now explicitly called page-region detection (Terra), transcription (selected model) and text-only schema assignment (selected model, default Argon high). The single total-cost column includes all three stages and scales completed sample pages to an editable target book page count. Enter 1,000 for normalization. The earlier projection omitted region detection and has been corrected. Terra cost accounting includes default 30-minute cache writes. Older records missing any stage cost show an unavailable estimate. Difference colors cover complete grapheme clusters and virama-linked Indic conjuncts, with formatting rendered and omissions shown as generated strike-through text.

The conventions at the end of this file still hold: method ids, immutable runs, NOTEBOOK entries, `uv run --offline`, and keys never printed.

The schema comparison now uses side-by-side unit trees and a selected-region inspector. Color-matched region labels and text snippets connect models’ groupings. Labels explain changed grouping, unit labels and continuation flags. The inspector shows ancestry, unit members, reading order and links, with a collapsible scan and fixed transcription. Line-join previews highlight complete grapheme clusters at the boundary. Raw responses and validation errors are under diagnostics. Comparison metrics now use each region’s own ancestry and membership, so sibling flags and target-unit metadata do not create unrelated region, order or link differences. The visual views read the saved model responses. API spending for this UI revision is $0.

The user has now requested the full-volume browser workflow. Its 267-page book is prepared in browser storage at ?local=series1-v01#make, inheriting the sample’s types and the user’s selected Argon-low transcription and Terra schema assignment. The first visible processing range is 1-10, with a $5 per-run threshold. Details are in PRIVATE.md. Importing the book costs $0 in model API charges. During setup, the shared page-range parser was fixed to accept the documented “all” value. An added regression covers that value and the older blank and numeric range forms.

On 2026-11-09 UTC the user still saw the old unit-type dropdown. Their Chrome tab at http://localhost:8765 had an older app loaded, with only the original book tabs. Earlier browser checks had used the separate in-app browser at http://127.0.0.1:8765. Refreshing Chrome loaded the current app. The full-volume PDF is now open in Chrome's new-book AI setup, with “Propose types from sample pages” selected and both llm-sourced keys saved in that browser. This is a setup form awaiting the user's proposal and review. Chrome's localhost storage, the in-app browser's 127.0.0.1 storage and the Tailscale HTTPS origin are separate. Details and a screenshot are in PRIVATE.md.

On 2026-11-09 UTC the user's private full-volume PDF received a saved, schema-valid Terra unit-type proposal from twelve selected pages. Its API record and cost are retained privately, with adjustments for the user's established paragraph/verse and ornament rules. The plain-PDF entry now accepts an optional `proposal` URL, validates it against the source PDF hash and opens it for review without API keys. Local review edits take priority. User approval is still required before book creation. The exact links, call cost and adjustments are in PRIVATE.md.

The initial sample controls now offer a lazy thumbnail browser for every PDF page before the sample field. A thumbnail opens a larger preview with previous/next controls and an inclusion checkbox. Samples accept `all`, ranges such as `1-50` and mixed lists, with no twelve-page UI cap. Selection, thumbnail checkboxes and the selected-only view stay synchronized. Browser checks cover the full 267-page PDF, range/all selection, page 267 and larger previews. App tests pass 106/106 and schema tests 11/11. This interface verification adds no model charges.

On 2026-11-09 the comparison pages were separated into sample run, review and a final model choice. Transcription models has a single explicit transcription choice at the end, followed by navigation to schema comparison. Schema assignment has a fixed input from the book's saved transcription model and ends with a separate schema-model choice and Continue to Make pages. The combined two-model settings remain in Make pages. Whole-book estimates on the transcription page retain an optional fixed-model schema pass under collapsed estimate settings. Browser checks verified independent saving, the fixed input, persistence and restoration of the user's existing choices. The original combined methods were reviewed for the user's cost question, with historical private measurements recorded in PRIVATE.md. No paid model calls were made for this UI revision.

Both comparison pages now show a determinate progress bar, processed-step count, percentage and elapsed time beside the current operation. Counts cover region checks, transcription and optional schema work, with reused, failed and skipped work distinguished. Stopped runs and spending limits retain partial progress. The user's existing run was already executing the older app when this change was made. It saved eleven transcriptions and stopped on an Argon-high timeout on its final sample page. Once it finished, the actual Chrome tab was refreshed to load the update. The new progress display appears on subsequent runs. Validation uses the production comparison views with simulated operations and zero model calls, plus all 106 app tests.

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
- A frozen method keeps its ID on new data. Changing the prompt, model, settings or processing recipe gets a new ID; the next unused ID is 087. Repeated requests use a fresh output subdirectory such as `run-002`, not a new method ID.
- Keep prior runtime code and saved requests/responses immutable: hashes tie them to results. Save new derived coordinates separately with their source result and every adjustment.
- Keep NOTEBOOK.md limited to actual tests, settings, observations and images. Use self-contained entries, full method names, stable method IDs, and one physical line per prose paragraph. Method README links and image references are expected. Keep planning and cross-experiment conclusions in this handoff or another separate document.
- Add results within the appropriate test-page section while preserving previous entries. Do not label tests on a new page as newly numbered methods.
- Preserve original pixels and distinguish model grouping from local boundary processing.
- Use `uv run --offline python` with the existing environment; all method READMEs now say so. For a local request check, use the runner's `--check` flag. Existing output directories are protected against overwriting.
- OpenAI authentication checks `OPENAI_API_KEY`, then the stored `llm` key named `openai`; Google runners similarly use configured Google variables or the stored `gemini` key. Do not print or copy key values into logs or documents.
- The older material under `old/Kale-vision-handoff/` is historical.

This handoff is kept up to date during the session rather than written only at the end.

A useful next-session opening instruction is “Read HANDOFF.md's section on the stage-based workflow and its Current state, PRIVATE.md on this machine, webapp/README.md and schema/README.md. Then continue at step 9 of the Build order.”
