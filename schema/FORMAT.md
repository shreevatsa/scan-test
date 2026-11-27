# Chaya book format

A `.chaya.pdf` is the unchanged scan PDF with one attachment, `chaya.json`. It holds the decisions about boxes,
text, and structure. The app computes ink outlines and checks when needed. Processing records live separately in
`work/` and can be archived in a `.work.zip`. A migrated sidecar contains the original legacy attachments.

## Book

Required fields are `chaya: 1`, `title`, `types` and `pages`. Optional fields are:

- `description`, `languages` and `conventions` for describing the book and guiding transcription.
- `source` with the original PDF's `name` and `sha256`.
- `flows` and `relations` with names and descriptions. The default flow is `main`.
- `reading` for processing options, including `finder_classes`, a map from type names to the finder’s drawing
  classes. Finder classes affect the drawing prompt.
- `rules` for finding headings, closing lines, verse groups, numbers, notes, and page labels. It can also name
  types used by the reader in `verses.lead_in`, `contents_types`, `captions`, `page_numbers` and `tables`.
- `stylesheet` for how the book is printed, and `containers` for named structural units.
- `structure_edited: true` when the structure is edited. Afterwards the processing pipeline runs the rules
  only on request. Reading uses the structure already stored.

## Types

Each key in `types` names a type. A type may have a `description`, a language `lang`, a `flow` (such as
`notes` or `apparatus`), `contains` (the types it can hold), and `numbered: true`.

- `lines: true` keeps printed line breaks. `unclassified` uses this flag for areas that still need a type.
- `figure: true` shows the region's crop.
- `heading: true` shows the unit as a heading and identifies it to the heading rules.
- `ignored: true` keeps that type on the scan and excludes it from reading.

A type with no flags can hold ordinary prose. A type can be used for both printed regions and containers.

## Pages and addresses

```json
"pages": [
  { "pdf_page": 1, "skip": true },
  { "pdf_page": 2, "crop": [0, 0, 0.5, 1], "id": "scan-2", "size": [1200, 1800] },
  { "pdf_page": 2, "crop": [0.5, 0, 1, 1], "label": "1", "regions": [] }
]
```

`pdf_page` is the 1-based PDF page. `crop` is a rectangle in PDF-page fractions, used for split spreads.
`id` is an optional stable page name. `size` is the page image width and height in pixels. `label` is the
printed page number. A skipped page is left out of the reading. An absent `regions` means unprocessed, while
`regions: []` means processed and empty.

Regions are addressed by their 1-based position in the book and their region ID. `"12/r4"` means region
`r4` on the twelfth entry in `pages`, including skipped entries.

## Regions

```json
{
  "id": "r4", "type": "verse", "box": [0.12, 0.27, 0.87, 0.39],
  "lines": [
    { "text": "First line", "box": [0.12, 0.27, 0.87, 0.30] },
    { "text": "Second line", "spans": [{ "kind": "note_marker", "start": 11, "end": 11, "marker": "1", "to": "12/r9" }] }
  ],
  "in": ["c1", "c2"], "number": "2", "continues": true
}
```

Regions are stored in reading order. IDs are unique per page. Boxes are `[left, top, right, bottom]` in
fractions of the scan. A region can carry an optional `proposed` type while it uses its current type.
`ignored: true` excludes a region from reading while keeping it on the scan. `uncertain: true` and `note`
preserve uncertainty about the transcription.

`lines` contains the printed lines. Each can have a `box`, its own `style`, and `text`. Missing `text` is
unread. Regions without lines add no reading units, except figures. An empty string records an empty
transcription. For a type with `lines: true`, an end-of-line hyphen (`-` or `‐`) is printed text, and the
break is kept. Set `end` on these types only to `space` to join printed lines with a space, as for a two-line
heading, or to `join` to connect two pieces of the same printed line. For other types a trailing hyphen
joins the word across lines, and other lines join with a space. Their exceptions can use `line`, `space`,
`hyphen`, or `join`.

Spans mark formatting such as italic, bold, small caps, superscript or subscript. `start` and `end` are
Unicode code-point offsets. A `note_marker` is zero-width, with the printed `marker` and an optional
`to` address. Other links, including readings and notes linked directly from a line, go in region `links`:

```json
"links": [{ "type": "readings", "line": 0, "to": "12/r4" }]
```

`line` is optional and zero-based. A link can target a unit by region address or target a container by ID.

## Structure

- A unit's first region carries its `number`, `label`, `lang` and `style` as needed.
- `continues: true` joins the next region of the same type, flow and container path. Other types and skipped
  scans can stand between the pieces. An unprocessed page interrupts the join. `continues: "open"` records an
  unmatched end, and `from_previous: true` records an unmatched start. Joined regions need only the earlier flag.
- `in` is the list of container IDs, outermost first. `containers` defines their `type` and optional
  `number`, `label`, `lang`, `style` and unmatched `open` edges, such as `{"end": true}`.
- `direct: true` puts a region directly inside the innermost container. Such a container can hold both
  regions and child units.
- A top-level unit or container can give an explicit `flow` where it differs from its type’s flow.

Migration runs from the `chaya-0.4` branch, which reads the original book format. In a checkout of that branch, run
`node --max-old-space-size=8192 webapp/tools/migrate.mjs IN.chaya.pdf OUT_DIR`.
Add `--check` to verify the migration and write only its report. The tool compares the assembled structure,
relation targets, text, labels, formatting, and applicable verse exports.
