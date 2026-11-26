# Simple Chaya JSON, version 0

This is the format tested by `webapp/tools/chaya_simple.mjs`. It describes the reading of a scanned book and points to its source PDF. The app's `.chaya.pdf` remains the editing and archival format.

## Book and pages

- `format` is `"chaya-simple"` and `version` is `0`.
- `book_id` and `title` identify the book. `pdf` carries the source PDF's `name` and `sha256` when available. The PDF itself is separate.
- `types` is the complete type list. `rules` carries the book's rule settings verbatim when present.
- `pages` follows the manifest order. Each page has an `id`, `pdf_page` and optional printed `label`. **Addition:** `size: [width, height]` gives its pixel dimensions.
- `skip: true` marks a dimmed page. `pending: true` marks an undimmed page with no saved document. Those entries carry the page identity and size. A saved blank page has `regions: []`.
- Other pages have `regions` and, when needed, `structure`, the unchanged schema 0.4 page overrides. The export uses the effective page document, with a saved edit taking precedence.

## Regions

Regions follow saved reading order. Unnumbered regions follow in stored order. In a reconstructed page, content regions receive consecutive order numbers beginning at 1 and furniture receives `null`.

Each region has an `id`, `type` and `box`, an array of `[x0, y0, x1, y1]` coordinates. Horizontal coordinates are fractions of page width and vertical coordinates are fractions of page height, rounded to four decimals. The box is the editable rectangle when available, or the ink outline's bounds. The optional `lines` array gives bounds for individual line pieces in the same coordinates. A `null` slot means that piece had no outline. The importer rounds back to pixels and builds rectangle polygons.

`text` joins the line pieces with newlines. An empty string represents one empty piece. Omit `text` when the region has no line pieces. `from_previous` and `continues` are present when the respective continuation flag is true.

Formatting in `marks` has `kind`, `start` and `end`. Note markers have `kind: "note_marker"`, `at`, their printed `marker` and an `id`. Offsets are zero-based Unicode code-point positions in region text. Each newline counts as one. The importer splits a formatting range at a line-piece boundary when needed.

`ends` is an optional object keyed by zero-based line-piece index. Its values are `space`, `hyphen`, `join` or `line`, and it stores explicit ends that differ from the type-and-text rule in `blockLineEnd`.

A saved area left out of the reading is a `"?"` entry with a `box`. `proposed` names a suggested type and `left_out: true` records a dismissed area. The importer puts these boxes in the page's area metadata. They produce no reading blocks. An area with no saved rectangle or outline has no `"?"` representation.

## Additions for faithful reconstruction

Along with `size`, the audit uses four optional fields on regions.

| Field | Reason |
|---|---|
| `unread` | Zero-based piece indices whose text is absent. A separator still represents each such piece. This keeps an untranscribed piece distinct from a transcribed empty string. |
| `line_breaks` | Code-point positions of the newlines that separate pieces, used when a piece itself contains a newline. Every other newline is part of that piece's text. |
| `default_ends` | Indices whose saved end is explicit and equals `blockLineEnd`. The importer uses the rule for those indices. Indices absent from both end fields keep the reader's ordinary implicit behavior. |
| `line_ids` | Original numeric piece IDs, with `null` for an absent ID. It is used only where an override points into that region by line ID and the original IDs differ from 1, 2, 3, and so on. This keeps those references valid without rewriting the override. |

## Outside the format

The export drops the detailed ink polygons and keeps only rectangles. It also drops stable numeric line IDs except where an override needs them, pending type proposals attached to active blocks, excluded areas' saved text and prior types, detected but uncovered lines, processing and review state, provenance, render details, source and edit history, and the entire `work/` directory. Per-line styles and the separate style sheet are outside version 0. Unit styles carried by structure overrides survive. A dimmed page's blocks are excluded from the export.

## Audit commands

```sh
node webapp/tools/chaya_simple.mjs export IN.chaya.pdf OUT.json
node webapp/tools/chaya_simple.mjs check IN.chaya.pdf --report REPORT.json
```

Use `node --max-old-space-size=8192` for large books. The commands read the PDF and write only new JSON files. The check compares plain text, containing units in reading order, printed labels and anchored note links. For the śataka editions it compares verse keys, part roles and part text, with a separate comparison of crop boxes. It also repeats the comparison with line boxes discarded to test where they matter.
