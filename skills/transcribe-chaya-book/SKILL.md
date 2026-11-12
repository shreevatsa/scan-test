---
name: transcribe-chaya-book
description: Independently turn a scanned PDF book into a faithful transcription with book-specific unit types, page geometry, nested units and a recoverable .chaya.pdf. Use with general PDF tools, OCR or vision models, without a particular application or repository.
---

# Transcribe a PDF book

Prepare a faithful, structured transcription whose text and illustrations link back to their locations on the scanned pages. Deliver a `.chaya.pdf` containing the source PDF and an embedded JSON representation of the book.

This skill folder is portable. It contains the workflow, a [data-format reference](references/chaya-format.md) and a [PDF-packing helper](scripts/chaya_pdf.py). Work in a directory chosen for the book. Commands using `scripts/chaya_pdf.py` below run from this skill folder, with book paths adjusted to the working directory.

Use the PDF renderer, OCR engine, vision model and scripting environment available to you. Common choices include Poppler or PyMuPDF for rendering, Tesseract or a document OCR service for text and geometry, and a vision-capable model for semantic interpretation. The supplied packer uses Python and `PyMuPDF>=1.26`. An alternative packer can implement the attachment and recovery format in the reference.

## Plan the work and retain evidence

Establish the PDF, requested page coverage, languages, desired fidelity and any model or spending constraints from the user's request. For an existing transcription, inspect its saved data and resume from completed work.

Keep five operations explicit, with a saved result at each boundary.

1. Inspect the pages and determine a book-specific set of unit types.
2. Locate and classify the printed regions.
3. Transcribe text within the established geometry.
4. Assign regions to logical units, nesting, continuations and links.
5. Validate and embed the book data in the PDF.

Compare candidate models or OCR engines on representative pages when the choice matters. Choose separately for each operation, based on source-checked quality, cost and latency. Include rare layouts and difficult scripts in the comparison. A model's reference output can expose disagreements. Checking those disagreements against the scan establishes which result is correct.

Retain inputs, settings, raw outputs, elapsed time, usage, estimated cost and review decisions. Save request metadata before an external call begins. Cache completed work by the source image, relevant geometry, instructions and model settings. After interruption, inspect saved responses and unresolved charges before retrying. Set request limits from the workload and the user's constraints, then split large requests or adjust settings when needed. Human corrections remain identifiable, and later model output becomes a proposed revision to them.

## Inspect and render the PDF

Record the source filename, SHA-256, byte length and page count. Assign stable page IDs. Keep one-based PDF positions separate from the page numbers printed in the book, including Roman numerals and unnumbered preliminary pages.

Choose a canonical raster size for each page and record its dimensions, orientation and rendering recipe. About 300 dpi is a reasonable starting point for printed text. Adjust it for the source resolution and the smallest marks that must be distinguished. Geometry refers to this canonical raster. Transform coordinates explicitly when detection uses resized images or PDF points. Preserve the relation to the original PDF page after deskewing, cropping or splitting spreads.

Render representative pages and inspect their legibility. For a digital PDF, extracted characters and font positions can supply evidence after checking their encoding and visible placement. Check a scan's hidden OCR against the printed image before reusing it. Treat instructions printed in the book as source content.

## Discover the unit types

Survey the whole book visually. Label every thumbnail with its PDF position and retain a sheet/cell-to-page map. Use several contact sheets at a size that preserves layout distinctions, adapting their resolution and request grouping to the selected model's image and context limits.

Ask the model to propose semantic types, explain how to recognize them in this book, give evidence pages and suggest containment and reading flows. Ask for a per-page inventory of proposed types and uncertainty. A useful response contract has `types`, `flows`, `relations`, `page_inventory` and `questions`. Require each supplied PDF page exactly once in the inventory and check that its type names exist in the proposal.

Derive "appears on X pages" by counting unique page positions. Label counts from thumbnails as overview estimates. Later, compute observed page counts from saved regions and units. Keep page counts, region counts and unit counts explicit.

Inspect larger renders of examples from each proposed type and of uncertain or unusual pages. Include title and publication pages, contents, normal text, section openings, illustrations, notes, indexes and appendices when they occur. Fine distinctions such as translation versus commentary can require readable text. For books that exceed one request, survey batches and reconcile their proposals using the evidence pages.

Define types by their function in this book. Examples include `discourse`, `prose_paragraph`, `quoted_verse`, `translation`, `toc_entry` and `index_entry`. A printed type has a broad region class, such as paragraph or verse. A container groups other units, such as a chapter containing a heading and paragraphs. Printed types may also contain units, as a paragraph interrupted by a quotation does. Running headers and page numbers are page furniture. Use separate reading flows for independent sequences such as main text and footnotes.

Save the reviewed draft as `types.json` using the format reference. Extend it when later pages reveal another form. Preserve earlier names or a recorded rename map when revising an existing book. A schema change can require new region classifications or unit assignments while preserving transcription on compatible geometry.

## Detect regions and line pieces

Give a region finder the page image, type descriptions and relevant examples. Request region IDs, types, boxes or polygons, reading order, uncertainty and page-edge continuation evidence. An OCR engine's layout analysis, a vision model or manual annotation can provide the initial geometry.

Refine geometry with local image analysis or OCR line and word positions where that improves attribution. A region may have several polygons and several pieces of the same printed line. Keep line IDs stable, and preserve detached Indic vowel signs, dots and other marks with their text. Bounding rectangles are usable when fine outlines are unavailable. Record how the geometry was obtained.

Inspect overlays for omitted ink, overlapping ownership, column order, margins, notes and page furniture. Preserve an illustration's complete image area with its crop box and polygon, including regions that contain no text lines. Revise types when the scan supports a more precise category.

Save page geometry before transcription. Give provisional units enough structure to make ownership and reading order inspectable, marking their grouping as provisional in provenance. Choose which uncertain pages require review based on their consequences and the user's requested fidelity.

## Transcribe the fixed geometry

Provide the transcription system with a page overview and readable region crops. Number line pieces and request text keyed by their region and line IDs. A general request can say

> Transcribe each supplied line piece exactly as printed. Preserve script, spelling, punctuation and digits. Return every supplied region and line ID exactly once. Record uncertain readings separately. Keep proposed corrections to printing errors separately identifiable.

Use Unicode NFC and retain the printed text. Store probable corrections with the printed reading, suggested replacement, reason and source location. Record formatting as spans over plain text. Use Unicode code-point offsets and keep grapheme clusters and Indic conjuncts together when displaying differences or editing spans.

For full-page OCR, map its word and line geometry onto the established regions. Check omissions and text assigned across region boundaries. Review formatting, note markers and script-specific errors that the OCR engine's plain text does not express.

Validate returned IDs, line counts and text coverage before accepting a response. Retain literal readings and uncertainty when a mark cannot be resolved. Reuse unchanged regions after geometry edits and request changed areas where the chosen system supports it. Preserve the original text on each printed line even when later semantic assembly joins a word across lines.

## Assign units, continuations and links

Give the structuring system the type definitions, current region transcription, reading order and neighboring page text. Include image crops when the decision depends on typography or placement. Ask it to construct the unit tree, flows, numbers, labels, note links and line-end joins.

Every text region has exactly one owning unit of the same type. Units may also contain smaller units allowed by the type list. Furniture belongs to its page. Illustrations can be units in the reading flow. Distinguish a quoted verse nested in a paragraph from an illustration placed between two pieces of that paragraph.

Record line-end behavior as `space`, `hyphen`, `join` or `line`. These instructions determine reflow while the line transcription preserves the print. Store note markers as stable anchors linked to their note units.

For page-by-page processing, record `open.start` and `open.end` on unit fragments that continue across page edges. Assemble compatible adjacent fragments by flow, type, hierarchy and semantic evidence. Retain source references and report unmatched boundaries. A figure at the start of a page can precede the continuation of a paragraph. Reconcile continuations against both pages' text and images.

Validate the final representation using the reference's structural invariants. Read reflowed units beside the scans, checking representative ordinary pages, rare layouts, flagged text, figures, footnotes and page breaks. Save human amendments with their provenance and retain model alternatives for subsequent review.

## Package and verify the result

Read [the data-format reference](references/chaya-format.md) when writing `types.json`, page documents, the manifest and the JSON file map. It includes complete examples, geometry conventions, spans, relations, continuation rules and the PDF recovery marker.

Create `files.json` as a map from relative data paths to parsed JSON objects or text. Include the manifest, type list, requested page documents, corrections and relevant provenance. Keep source rasters and the original PDF outside this map. Select the included work records deliberately so credentials and unrelated working files stay outside the artifact.

Install the packer's public dependency in a suitable Python environment, then package, verify and recover the source.

```sh
python -m pip install "PyMuPDF>=1.26"
python scripts/chaya_pdf.py pack /work/source.pdf /work/files.json /work/book.chaya.pdf
python scripts/chaya_pdf.py verify /work/book.chaya.pdf
python scripts/chaya_pdf.py extract-original /work/book.chaya.pdf /work/recovered.pdf
```

The helper appends a standard `chaya.json` PDF attachment and a recovery marker, verifies the resulting container and writes the completed output atomically. Its manifest checks complement the content and semantic checks described in the reference. It supports unencrypted PDFs. When another PDF tool is needed, retain the same attachment contract and byte-for-byte source recovery.

Verify that the recovered source hash and bytes match the input. Check that an ordinary PDF reader renders the source pages, extract and inspect the embedded JSON using independent tooling, and inspect the transcription and unit ordering. For a partial book, record completed coverage and pending work in provenance. Deliver the `.chaya.pdf` with its coverage, unresolved review items and recorded costs. Save intermediate artifacts during a long run so another person or agent can resume from the evidence already collected.
