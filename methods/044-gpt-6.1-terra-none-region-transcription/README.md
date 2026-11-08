# 044-gpt-6.1-terra-none-region-transcription: GPT-6.1 Terra without reasoning, transcription and unit tree on method 043's regions

This is the second call of the pipeline, after the region step (method 042's request and method 043's local step). It returns the text of every line piece and the page's tree of units, and builds a page document of the draft book schema ([schema/README.md](../../schema/README.md)).

## The request

The request is one synchronous call to `gpt-6.1-terra` with reasoning effort `none`, image detail `original`, strict JSON Schema output, at most 32,768 output tokens, and `store=false`. It holds:
- **the prompt** (`prompt.py` with `prompt-template.txt`). It gives the book's title and description, its transcription conventions, every unit type (printed types and containers, with what each contains and the flows it may head), its furniture, flows and relations. It then gives the rules for line text, note markers (`word[1]`), line ends, region types and units with open ends;
- **the page overview** (`cutouts.overview`): the page with each method 043 region outlined in color and tagged with its id (`r3` is method 042's region 3). A tag goes left of the region, right of it, above it or inside it, whichever first overlaps no other region;
- **one cut-out per region**, in reading order and then the furniture: a caption `r3: paragraph, 9 lines`, then the region cut out of the page with everything outside its polygons set to white, and a gray strip at the left with the numbers 1, 2, … at the height of each of its line pieces (`cutouts.cutout`).

Regions without ink or line pieces are not sent; they are listed as skipped.

The response schema (`prompt.build_schema`) has one required entry per region sent, keyed by its id, with a type, exactly as many lines as the region has line pieces (`minItems` = `maxItems`), each with its number, text and `end` (`space`, `hyphen`, `join`, `line`), and an uncertainty flag and note. Units come in a flat list with ids, type, number, label, open start and end, and children (region and unit ids); then flows; then relations, for books with relation types.

## The page document

`pagedoc.py` puts each line's text and end on method 043's line pieces by position. It keeps the region step's evidence in each region's `source` (method 042's type and flags, the model box), and records any change of region type. Units, flows and relations are taken as returned, with region ids made page-qualified; a relation's marker is located in its line's text. Regions the call types `other` are left out of the document and listed with their text. Nothing is repaired. `schema/book.py` checks the document, and its errors and warnings are saved in `result.json`.

Saved with each result: `request.json`, `response.json`, `prompt.txt`, `response-schema.json`, `type-list.json`, `overview.png`, `cutouts/r*.png`, `parsed-response.json`, `page.json` (the page document), `transcript.txt` (the units depth-first with their text) and `result.json` (settings, hashes, usage and cost, the regions sent with their cut-out boxes and line ids, problems and the check).

## Tools (local, no API calls)

- `evaluate.py`: scores page documents against a transcription reference (`references/<input>/transcription.json`). Each line piece is assigned to the reviewed passage reference's passage that owns most of the labeled ink inside its polygons, so the score does not depend on the region step's grouping. It gives the character error rate at three levels:
  - **exact:** NFC, runs of whitespace as one space;
  - **normalized:** also variants of the apostrophe, double danda, abbreviation sign and caret unified, and no space around dandas, apostrophes, commas and periods;
  - **no markers:** also note markers removed.

  Totals are over all passages and over the kept passages (no furniture). It also counts lines equal after normalization.
- `tree.py`: compares unit trees with the hand-written example trees of `schema/examples/` (over method 041 regions). Each example region is matched to the method 044 region sharing most pixels. A unit matches when a method 044 unit has the same type over the same regions; open ends and numbers are then compared.
- `stability.py`: compares two requests on the same page: text edit distance per region, and units as (type, regions, open ends).
- `assemble.py`: joins a run's page documents with `book.py assemble`, leaving out pages whose own document is invalid, and writes `book.json`, the printed tree and a transcript with page references.

## Run

```sh
cd methods/044-gpt-6.1-terra-none-region-transcription
uv run --offline python run.py ../../inputs/hertel-panchatantra-page-152.png --check --preview-dir /tmp/preview
uv run --offline python run.py ../../inputs/hertel-panchatantra-page-152.png
uv run --offline python run.py ../../inputs/hertel-panchatantra-page-152.png --output-dir ../../outputs/hertel-panchatantra-page-152/044-gpt-6.1-terra-none-region-transcription/run-002
O=../../outputs/hertel-panchatantra-page-152/044-gpt-6.1-terra-none-region-transcription
uv run --offline python evaluate.py $O/transcription-evaluation.json --page first=$O/page.json
uv run --offline python tree.py $O/tree-comparison.json --page first=$O/page.json
```

The source regions default to `outputs/<input>/043-…/regions.json` (method 043 on method 042's first request); `--base-regions` gives another. Existing output is protected against overwriting. Authentication checks `OPENAI_API_KEY`, then the stored `llm` key named `openai`.

## Recorded results

Two requests on each of the 12 run pages of Kale (106–109), Hertel (152–155) and Dutt 17F chapter 1 (pages 1–4), on method 043's first-request regions. See "Transcription and unit tree on method 043's regions" in [NOTEBOOK.md](../../NOTEBOOK.md). In brief:
- **Requests:** all 24 completed. About 16,800 input tokens and 2,270 output tokens per page (medians); median API time 28 s and 31 s. Estimated cost $0.387 for the first requests and $0.176 for the repeats, which read the prompt and images from the cache.
- **Text** against Claude's transcription references (character error rate on kept passages, note markers ignored; first request / repeat):
  - Hertel 152: 0.44% / 1.31%;
  - Kale 106 (a worn bitonal scan): 1.87% / 2.25%;
  - Dutt page 2: 0.34% / 0.43%.

  The errors are misread or "corrected" words (विरूपम् → विहसितम्, दौर्योधने → दुर्योधने, अण्डकान्य् → अण्डान्य्), not missing or misplaced text. The four tiny footnote markers on Kale 106 were missed in both requests.
- **Unit trees** against the hand-written examples (seven pages): every example unit has a method 044 unit of the same type over the same regions, except one on Hertel 153 in the repeat. Every region type agrees. Open ends disagree at four of the nine page breaks, always at the page edge:
  - Kale's commentary at the top of pages 108–109 is marked as begun earlier (its verse is on the previous page);
  - group and verse 30 on Kale 109 are marked as begun earlier;
  - Dutt page 2's first group is marked as begun earlier;
  - Hertel 153's last paragraph is marked as going on (page 154 opens with a tale heading).
- **Validity:** 10 of 12 page documents valid in each request. The same two are invalid in both requests: Kale 109, from the open start above, and Dutt page 1, with a child id u46 that names no unit. In the repeat, Hertel 153 is also invalid (a unit in no flow).
- **Stability:** units identical between the two requests on 11 of 12 pages. The text differs on 1.2–3.3% of characters on the Kale pages, 0.1–1.6% on Hertel and 0.1–0.3% on Dutt.

## Limitations

- Each page is read alone, so whether a unit goes on across a page break is a guess from one side; the guesses are the main source of tree errors and of assembly mismatches.
- Units are a flat list with ids, and on a page with about 50 units an id was misnumbered.
- Tiny superscript note markers on a worn scan are missed.
- Margin numbers that method 043 left without a region (Hertel's line numbers 21 and 24 on page 152) are never transcribed.
