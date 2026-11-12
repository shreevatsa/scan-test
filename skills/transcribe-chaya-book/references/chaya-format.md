# Chaya data format

A `.chaya.pdf` is a PDF with a UTF-8 JSON attachment named `chaya.json`. The attachment contains the book's type definitions, page geometry, transcription, units and provenance. An ordinary PDF reader renders the scanned pages. A program can extract the attachment through standard PDF embedded-file APIs.

The following format is sufficient to create a book independently. Use schema version `0.2` for the documents described here. Extensions can live in the free-form `source` objects. Each JSON object below illustrates a complete file with its required fields.

## Identifiers and geometry

Type, flow, relation and inline-kind names use lowercase ASCII snake_case, beginning with a letter. Local IDs for pages, regions, units and anchors use letters, digits, dots, underscores or hyphens. IDs are stable across edits. A region reference is `page_id#region_id`, and an anchor reference is `page_id#anchor_id`. Units within a page use local IDs. References in an assembled book qualify unit IDs with the page ID of their first fragment.

Geometry refers to the page's canonical rendered image, with origin at its upper-left corner, x increasing rightward and y downward. Polygon vertices are pixel-center coordinates. A `polygons` value is an array of outer rings, each containing at least three `[x, y]` points. Store disconnected pieces as separate rings. A box is `[left, top, right, bottom]`, with right and bottom exclusive. For an integer rectangle, the polygon's last column and row are `right - 1` and `bottom - 1`. Retain the transform to the source PDF when preprocessing changes coordinates.

## The type list

`types.json` defines this particular book's types. `region` identifies a printed type's broad visual class. The supported classes are `verse`, `paragraph`, `heading`, `lead_in`, `list_item`, `formula`, `note`, `table`, `figure`, `caption`, `running_header`, `page_number` and `other`. A container omits `region` and has children in `contains`. A printed type may also have children. `flow` permits a type at the top level of a named reading flow. Defaults are `role: "text"` and an empty child-type list. Furniture has a region class and omits both `flow` and `contains`.

```json
{
  "format": "types",
  "schema_version": "0.2",
  "book_id": "example",
  "title": "Example book",
  "languages": ["en"],
  "flows": {"main": "The book in reading order", "notes": "Footnotes"},
  "types": {
    "chapter": {"description": "A chapter", "contains": ["heading", "paragraph", "illustration"], "flow": "main"},
    "heading": {"description": "A chapter heading", "region": "heading"},
    "paragraph": {"description": "Body prose, which may contain a quotation", "region": "paragraph", "contains": ["verse"]},
    "verse": {"description": "A quoted verse", "region": "verse"},
    "illustration": {"description": "An explanatory image", "region": "figure"},
    "footnote": {"description": "A note below the main text", "region": "note", "flow": "notes"},
    "page_number": {"description": "The printed page label", "region": "page_number", "role": "furniture"}
  },
  "relations": {"note": "Connects a printed note marker to its note"},
  "conventions": ["Unicode NFC, preserving printed spelling, punctuation and digits"]
}
```

Optional type fields are `lang`, a BCP 47 language tag, and `numbered`, a boolean. Optional top-level fields are `description`, `inline` and `source`. An inline-kind definition has a `description` and optional `formatting` from the span kinds below. Ordinary formatting and note markers have built-in span kinds.

## Page documents

Each page document holds a page's regions and a local tree of units. The `page.image` field is a logical raster filename. Readers can render the corresponding PDF page using the manifest, so that raster need not be embedded. Store its SHA-256 as `page.image_sha256` when retaining a canonical rendering hash. `page.label` is the printed page label as a string when known.

```json
{
  "format": "page",
  "schema_version": "0.2",
  "book_id": "example",
  "page": {
    "id": "p001", "image": "p001.png", "width": 1000, "height": 1400,
    "label": "1",
    "regions": [
      {
        "id": "r1", "type": "paragraph", "box": [100, 200, 900, 280],
        "polygons": [[[100, 200], [899, 200], [899, 279], [100, 279]]],
        "order": 1,
        "lines": [{
          "line": 1,
          "polygons": [[[110, 215], [850, 215], [850, 250], [110, 250]]],
          "text": "A printed sentence.", "end": "space",
          "spans": [
            {"start": 2, "end": 9, "kind": "italic"},
            {"start": 19, "end": 19, "kind": "note_marker", "id": "m1", "marker": "*"}
          ]
        }]
      },
      {
        "id": "r2", "type": "footnote", "box": [100, 1200, 900, 1260],
        "polygons": [[[100, 1200], [899, 1200], [899, 1259], [100, 1259]]],
        "order": 2,
        "lines": [{"line": 2, "text": "An explanatory note.", "end": "space",
          "polygons": [[[110, 1210], [850, 1210], [850, 1240], [110, 1240]]]}]
      },
      {
        "id": "r3", "type": "page_number", "box": [480, 1340, 520, 1380],
        "polygons": [[[480, 1340], [519, 1340], [519, 1379], [480, 1379]]],
        "lines": [{"line": 3, "text": "1",
          "polygons": [[[485, 1345], [515, 1345], [515, 1370], [485, 1370]]]}]
      }
    ]
  },
  "units": [
    {"id": "c1", "type": "chapter", "label": "Chapter 1", "children": [{"unit": "u1"}]},
    {"id": "u1", "type": "paragraph", "children": [{"region": "p001#r1"}]},
    {"id": "n1", "type": "footnote", "number": "*", "children": [{"region": "p001#r2"}]}
  ],
  "flows": {"main": ["c1"], "notes": ["n1"]},
  "relations": [{"type": "note", "from": {"anchor": "p001#m1", "marker": "*"}, "to": {"unit": "n1"}}],
  "source": {"status": "draft", "review_notes": []}
}
```

A region requires `id`, `type` and `polygons`. Optional fields are `box`, `lines`, `order` and `source`. A line piece records its page-level `line` ID, geometry, `text`, `end` and `spans` as those become available. Regions sharing a printed line can have pieces with the same line ID. Omit text while transcription is pending. A figure can have an empty `lines` array and keeps its whole image crop in the region's box.

A unit requires `id`, `type` and a nonempty `children` list in reading order. Each child is exactly `{"region": "page#region"}` or `{"unit": "unit_id"}`. Optional unit fields are `number`, `label`, `lang`, `open` and `source`. A unit's own region children share its type. Nested units use types permitted by its `contains` list.

### Spans and line joins

Spans have `start`, `end` and `kind`, with offsets counted in Unicode code points in the stored line text. Intervals are half-open. Built-in kinds are `bold`, `italic`, `small_caps`, `superscript`, `subscript`, `underline`, `spaced` and `note_marker`. Other kinds are declared in the type list's `inline` object. Formatting spanning a printed line break has a span on each piece.

A note marker is a zero-width span with `start == end`, a page-unique `id` and its printed `marker`. The marker glyphs are carried in that field. The running line text omits them. A relation can then point to the stable anchor ID through `from.anchor`.

For `end: "space"`, insert a space before the next piece of the same unit. For `join`, concatenate directly. For `hyphen`, drop the trailing printed word-break hyphen during reflow and concatenate. For `line`, preserve a line break, as between verse lines. The stored line text retains its printed characters.

### Relations and continuation

Declare relation names in `types.json`. A relation has `type`, `from` and `to`. The target is `{"unit": "id"}`. A source can identify a `unit`, an `anchor`, or a `region` with optional `line`, code-point `start` and `end`, and printed `marker`. An optional `source` object records provenance.

A page unit fragment can carry `"open": {"start": true, "end": true}`. Set only the flags its continuation needs. Open nested ends follow the parent's last child, and open starts follow its first child. Their parents carry the corresponding open flag. At flow level an open end belongs to the last unit. A continuation at the next page's start can follow an interrupting illustration in that flow.

To assemble pages, qualify local unit IDs by page and walk adjacent pages in source order. Match each flow's earlier open end to its later open start, checking type, semantic identity and parent path. Join compatible fragments and recursively join their open children. Retain all original region references and provenance. Keep mismatches as unresolved boundaries. A gap in processed PDF positions requires an explicit continuity decision.

An optional assembled document has `format: "book"`, `schema_version: "0.2"`, the complete type-list object in `types`, a `pages` array of page objects, qualified `units`, `flows`, optional `relations` and `source`. Page documents remain the source records for packaging and editing.

## Manifest and file map

`book.json` lists source pages in the intended reading order. `pdf_page` is the one-based position in the original PDF. `pdf.page_count` counts the source PDF's pages, including when the manifest describes an excerpt. Width and height record each page's canonical raster dimensions. A page awaiting processing can have a document path whose file is still absent. Track that status in provenance. An optional `left_out` array names, in page order, pages left out of the book (the web app's Pages tab): keep their entries and files, but do not process, count or assemble them, and join no unit across one.

```json
{
  "format": "book-folder", "version": 1, "schema_version": "0.2",
  "book_id": "example", "title": "Example book", "types": "types.json",
  "pdf": {"path": "source.pdf", "name": "source.pdf", "sha256": "SOURCE_SHA256", "page_count": 1},
  "pages": [{"id": "p001", "pdf_page": 1, "width": 1000, "height": 1400,
    "document": "pages/p001.json", "label": "1", "valid": true}]
}
```

Replace the example hash and dimensions with source measurements. Build `files.json` by loading the manifest, type list and page documents into a single JSON object. The following independent Python pattern also works for excerpts and partial books.

```python
import json
from pathlib import Path

folder = Path("/work/book")
manifest = json.loads((folder / "book.json").read_text(encoding="utf-8"))
paths = ["book.json", manifest["types"]]
paths += [page["document"] for page in manifest["pages"]]
files = {}
for path in paths:
    if (folder / path).exists():
        files[path] = json.loads((folder / path).read_text(encoding="utf-8"))
Path("/work/files.json").write_text(
    json.dumps(files, ensure_ascii=False, allow_nan=False), encoding="utf-8"
)
```

Optional `edits/<page_id>.json` holds a corrected page document alongside its original model document. Treat the correction as the current version. Optional `work/` records contain prompts, responses, review decisions and progress. JSON files are stored as parsed objects, other text files as strings. Include such records deliberately in the file map. Paths are relative POSIX paths and remain within the virtual book folder. Page rasters and `source.pdf` are supplied by the PDF itself.

## Validation rules

Check these properties before declaring a transcription complete.

- Manifest page IDs are valid and unique, and PDF positions refer to existing source pages. Its data paths resolve for every page claimed complete. Every page document has the same book ID and the matching page ID and raster dimensions. When processing cropped views of a source page, map their geometry back to that page's canonical raster.
- Every region type and unit type exists. Every `contains` name exists and refers to a text type. Every flow has a permitted top-level type. Containers have child types. Furniture has a region class and omits both `contains` and `flow`.
- Region IDs, unit IDs and anchor IDs are unique in their respective scopes. Region references, unit references and relation endpoints resolve. Anchors are unique across the page and do not collide with region IDs.
- Every region whose type has role `text` has one owning unit of its own type, including figures. Furniture has no owner. Every unit has one parent unit or one top-level flow membership. The unit graph is acyclic, all units are reachable and child types obey containment.
- Polygons and boxes use the recorded raster coordinate system and valid dimensions. Text coverage accounts for every required line piece. Figures retain their complete crops.
- Spans satisfy `0 <= start <= end <= len(text)` in code points. Their kinds exist. Note markers are zero-width and have an ID and printed marker. Line-join instructions and page-edge flags agree with their source evidence.
- Each continuation follows the nesting and flow rules above. Reading order accounts for columns, interruptions and independent notes. Unresolved boundaries and uncertain readings remain recorded for review.

The packing helper checks the file-map structure, essential manifest links, source positions, page dimensions and recovery metadata. The agent performs these semantic and transcription checks with its own scripts or tools.

## PDF attachment and original recovery

The `chaya.json` attachment is a JSON envelope with `format: "chaya-book"`, `version: 1`, `original: {name, sha256, length}`, `saved_at_utc`, `saved_by` and the `files` map. The original hash is lowercase hexadecimal SHA-256 and its length is the number of original bytes.

Keep the original PDF as the output's exact byte prefix. Place this ASCII comment after that prefix and before the incremental PDF objects, with the measured values substituted.

```text
%chaya-book 1 length=ORIGINAL_BYTE_LENGTH sha256=ORIGINAL_SHA256
```

Attach `chaya.json` through the PDF catalog's embedded-files name tree, under that filename, and write the required incremental cross-reference and trailer update. Standard PDF stream compression is optional. Preserve other attachments. The supplied helper uses PyMuPDF's incremental save and attachment APIs for these PDF operations. [Incremental writing and attachments](https://pymupdf.readthedocs.io/en/latest/document.html)

To recover the original, parse the marker and take the first `length` bytes, verifying the hash. Cross-check the envelope's original metadata. On a later save, recover that original first and build one new update carrying the current file map. Validate the final PDF by reopening its attachment, comparing the parsed envelope and recovered source, and rendering representative pages with an independent PDF reader.
