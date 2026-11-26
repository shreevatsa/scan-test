# The Chaya book format, version 1

A book is its scanned PDF, unchanged, with one file attached: `chaya.json`. It is saved as `<name>.chaya.pdf`.

`chaya.json` holds what a person or a model decided about the book:
- where its regions are on the pages, and what type each is;
- the text of each region;
- the book's structure (sections, groups, numbers, labels, links).

It holds nothing that can be recomputed from these and the page images. The outlines of the ink are computed in the
browser when the editor needs them. Checks are computed when a page is shown. It holds no record of how the book was
made.

**Version 1 replaces schema 0.2–0.4.** It replaces `book.json`, `types.json`, `pages/`, `edits/`, layers and
overrides. `webapp/tools/migrate.mjs` writes verified version 1 copies of older books. The app switch to this
format is a separate step.

**The processing records** are the region finder's and readers' calls, responses and parsed readings. They are kept
apart from the book: in the browser while a book is being made, and in an optional sidecar `<name>.work.zip`. A
migrated book's sidecar holds all of its old attachments as they were, so nothing from before the migration is lost.
The book never needs its sidecar.

## The book

```json
{
  "chaya": 1,
  "title": "Bhartṛhari's śatakas (Kale, 1913)",
  "description": "…",
  "languages": ["sa", "en"],
  "conventions": { "…": "…" },
  "source": { "name": "kale-1913.pdf", "sha256": "…" },
  "types": { "…": "below" },
  "flows": { "main": "…", "notes": "…" },
  "relations": { "note": "…", "readings": "…" },
  "rules": { "…": "settings of the structure rules" },
  "reading": { "…": "the reader and its options, for processing" },
  "stylesheet": { "…": "type styles, as style.json was" },
  "containers": { "c1": { "type": "section", "label": "नीतिशतकम्" }, "c2": { "type": "group", "number": "1" } },
  "structure_edited": true,
  "pages": [ { "…": "below" } ]
}
```

Only `chaya`, `title`, `types` and `pages` are required.
- `description`, `languages` and `conventions` are what the models are told about the book.
- `source` identifies the PDF the book was made from.
- `flows` and `relations` describe the book's flows and link types (for people and models). Their names are used by
  types and links.
- `rules` are the settings of the structure rules.
- `reading` is the processing settings.
- `stylesheet` is how types are shown.

## Types

```json
"types": {
  "heading":   { "kind": "heading" },
  "verse":     { "kind": "verse", "numbered": true, "lang": "sa" },
  "footnote":  { "kind": "note", "flow": "notes", "numbered": true },
  "running_header": { "kind": "running_header", "furniture": true },
  "group":     { "contains": ["lead_in", "verse", "commentary"], "numbered": true },
  "section":   { "contains": ["heading", "group"] }
}
```

- **A printed type** has a `kind`, the class of region it is drawn as: heading, paragraph, verse, list_item, table,
  figure, caption, note, lead_in, formula, running_header, page_number, other. The kind decides how its text reads:
  - the lines of a verse or a table stay lines;
  - other lines join with a space, a final hyphen dropped.
- `furniture: true` marks a type that belongs to its page and not the text (running headers, page numbers).
- **A container type** has no `kind`. It has `contains`, the types it may hold.
- `flow` puts a type in a flow other than `main` (footnotes in `notes`, Telang's variant readings in `apparatus`).
- `numbered: true` says its units carry numbers.
- `lang` is its language.
- `description` says what it is, for people and models.

## Pages

```json
"pages": [
  { "pdf_page": 1, "skip": true },
  { "pdf_page": 2 },
  { "pdf_page": 3, "label": "1", "regions": [ { "…": "below" } ] },
  { "pdf_page": 60, "crop": [0, 0, 0.5, 1], "label": "58", "regions": [] }
]
```

The book's pages in order.
- `pdf_page` is the PDF page it shows (1-based).
- `crop` is the part of that PDF page it shows: one half of a photographed two-page spread, in fractions of the PDF
  page.
- `label` is its printed page number.
- `id` (added in migration) is an optional stable name for the page, kept from older books.
- `size: [width, height]` (added in migration) is the optional page image's size in pixels, for tools that work in pixels.
- `skip: true` leaves the page out of the book (a cover, a blank leaf).
- A page with no `regions` has not been processed yet. `regions: []` means it was processed and has nothing on it.

A page is named by its position in `pages`, counting from 1. `"12/r4"` is region `r4` of the twelfth page. Links use
this.

## Regions

```json
{ "id": "r4", "type": "verse",
  "box": [0.1213, 0.2702, 0.8714, 0.3911],
  "lines": [
    { "text": "यां चिन्तयामि सततं मयि सा विरक्ता", "box": [0.1213, 0.2702, 0.8702, 0.3010] },
    { "text": "साप्यन्यमिच्छति जनं स जनोऽन्यसक्तः ।", "spans": [ { "kind": "note_marker", "start": 34, "end": 34, "marker": "१", "to": "12/r9" } ] }
  ],
  "in": ["c1", "c2"],
  "number": "2",
  "continues": true }
```

A page's `regions` are in reading order. Furniture may stand anywhere among them.
- `id` is unique on its page.
- `type` is a type of the book, or `"?"` for an area that needs a decision.
- `box` is `[x0, y0, x1, y1]` in fractions of the page's width and height.
- `lines` are the region's printed lines in order. A figure has none.
  - A line with no `text` has not been read yet. `""` was read as empty.
  - `box` (optional) is where the line is printed.
  - `end` is given only where a line ends otherwise than its kind says:
    - `"line"`: a break kept in prose;
    - `"space"` or `"join"`: a verse line run on, or two pieces of one word;
    - `"hyphen"`: a hyphen dropped where the rule would keep it.
  - `spans` mark parts of the line's text, by code-point offsets:
    - formatting: `{ "kind": "italic" | "bold" | "superscript" | "subscript" | "smallcaps" | …, "start", "end" }`;
    - a note marker: `{ "kind": "note_marker", "start", "end": start, "marker": "1", "to": "12/r9" }`. Its position
      in the line, the sign printed there, and the note it points to (the note's first region).
    - `id` (added in migration) optionally keeps the old marker's stable name.
    - A marker span's optional `link` (added in migration) preserves details of its old relation. `order` is its
      zero-based order among the book's saved relations. `source: { "region": "12/r4", "line": 0 }` retains an
      explicitly saved source address. `marker` holds the relation's sign when it differs from the printed sign,
      or `null` when the old relation gave no sign.
  - `style` is a line's own style, where it has one.
- `in` lists the containers the region's unit belongs to, outermost first (ids in `containers`).
- `continues: true` means its unit goes on in the next region of the same type in its flow. That region may be later
  on the page, past a figure, caption or furniture, or on a later page.
- `number`, `label`, `lang` and `style` are its unit's, given on the unit's first region.
- `links` are its links other than note markers: `[{ "type": "readings", "line": 0, "to": "12/r4" }]`. `line`, when
  present, is the zero-based index of the line that makes the link. A link may also name a container ID when
  it targets the container itself (added in migration).
- On a region link, optional `order` and `marker` (added in migration) preserve the relation's saved sequence and
  sign, including old note links from a line without a marker span.
- `out: true` means it is left out of the book. It stays on the page, with its type and text, so that it can be
  brought back. A dismissed mark (a stain, a stamp) is a `"?"` region that is `out`.
- `proposed` is a type a model proposed for it that the book does not have yet. It is a `"?"` region, or one kept
  meanwhile as a type of its kind.
- `uncertain: true` and `note` mark a reading the reader was unsure of.

### Saved structure exceptions (added in migration)

- `open: { "start": true, "end": true }` records an unmatched open edge of a unit. It goes on the unit's first
  region or its container entry. `continues` stores the joins that actually occurred.
- `unit_type` keeps an old unit's type when it differs from the region's printed type. It goes on each affected
  region of the unit.
- `direct: true` attaches a region to the innermost container in `in`. It is used when an old unit contained
  printed regions alongside child units.
- Optional `flow` on a top-level container or on the regions of a top-level unit preserves a placement in a
  different flow than its type declares.

## Units and the book's structure

What the reader assembles from this is simple. No rule is applied when a book is read:
- **A unit** is a region, or a run of regions joined by `continues`. It has the region's type and the first region's
  number, label, language and style.
- **A container** is the run of consecutive units, in reading order and across pages, whose regions name it in `in`.
  It has the attributes given in `containers`.
- Units and containers stand in their type's flow, in reading order.
- Furniture, skipped pages, `out` and `"?"` regions are not in the book's text.

**Containers** are written by the structure rules (`rules`), or by a person in the editor:
- a heading begins a section;
- a closing line ends an episode;
- verse-group markers group verses;
- a printed number becomes the unit's number;
- a note marker is linked to the note with the same sign;
- a page takes its printed number.

The pipeline runs the rules after it reads pages, until a person has edited the book's structure
(`structure_edited: true`, set by the editor's structure actions and, in a migrated book, wherever the old book had
structure overrides). After that the rules run only when asked, so a person's structure is never replaced behind their
back.

## What a migrated book keeps from the old form

Everything a reader saw:
- the units, with their types, numbers, labels, languages and styles;
- the containers;
- the note and readings links;
- the page labels;
- the text, with its formatting;
- the verse exports.

The migration checks each of these against what the old code assembles, book by book. It writes a new PDF and
sidecar only after the checks pass. The original files stay in place.

```sh
node --max-old-space-size=8192 webapp/tools/migrate.mjs IN.chaya.pdf OUT_DIR
node --max-old-space-size=8192 webapp/tools/migrate.mjs IN.chaya.pdf OUT_DIR --check
```

`--check` writes only the migration report.

What it drops, kept only in the book's sidecar:
- the ink outlines;
- the model's page documents beside the person's edits;
- layer and review states;
- provenance;
- page render details;
- the records of lines found outside every region, which are recomputed now.
