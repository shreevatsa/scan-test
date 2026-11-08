# 046-gpt-6.1-terra-none-region-transcription-neighbor-context: method 044 with the neighboring pages' edge lines as context for open ends

This is [method 044](../044-gpt-6.1-terra-none-region-transcription/README.md) with context from the neighboring pages, so that whether a unit goes on across a page break is judged from both sides of the break. Model, settings, cut-outs, schema and page document are method 044's. `costs.py`, `pricing.json`, `requirements.txt`, `prompt.py` and `pagedoc.py` are byte-identical copies.

## What changed from method 044

**Context images.** After the region cut-outs, the request holds up to four images that are not part of the page (`cutouts.context`):
- the last two line pieces of the previous page's last region of the main text, and of its notes;
- the first two line pieces of the next page's first region of the main text, and of its notes.

Each is cut out with its region's polygons, framed in gray and captioned, for example "The start of the next page's main text (from a commentary region):". The regions are the neighbors' method 043 regions. The main text is every kept region that is not a note; the notes are the regions of class `note`. Furniture and `other` are excluded.

The neighbors are the inputs whose ids end in the page number one less and one more, if they have method 043 regions; `--previous` and `--next` name them instead, and `none` leaves a side out. Where a side has no page, the request says so. Because only the neighbors' regions are needed, not their transcriptions, pages can still be transcribed in parallel.

**The prompt.** "The page is processed on its own" is gone. A rule on context says:
- the context images are not to be transcribed;
- a unit is open at its start only if the previous page breaks off inside it, and open at its end only if the next page goes on with it rather than beginning a new unit;
- a larger unit can be open while all its children are complete: a verse that ends one page and its commentary that begins the next are one group, open at its start, while the commentary is not.

**Saved with each result:** `context/*.png`, and a `context` list in `result.json` with each image's side, page, stream, source region, line pieces, crop box and hash.

## Run

```sh
cd methods/046-gpt-6.1-terra-none-region-transcription-neighbor-context
uv run --offline python run.py ../../inputs/kale-1913-page-108.png --check --preview-dir /tmp/preview
uv run --offline python run.py ../../inputs/kale-1913-page-108.png
```

Scoring uses method 044's `evaluate.py`, `tree.py`, `stability.py` and `assemble.py`.

## Recorded results

Two requests on each of the 12 Kale, Hertel and Dutt run pages. A run's first and last pages have context on one side only. See "Method 046" in [NOTEBOOK.md](../../NOTEBOOK.md). In brief:
- **Cost and time:** $0.369 for the first requests and $0.198 for the repeats; median API time 29 s and 32 s, about as method 044.
- **Open ends:** right at every page break of the three runs in the first request, where method 044 was wrong at four of the nine. In the repeat, all but one: Hertel 153 ends with an empty story unit, open at its end, for the tale that begins on page 154. The Kale run 106–109 assembles with no warnings or errors in both requests, the Dutt run 1–4 in the first request, and Hertel 154–155 in both.
- **Trees:** every example unit matched by type and regions, except Hertel 153's first paragraph in the repeat. Hertel 153 is invalid in both requests, from how the frame story resumes after Tale xv on the same page (a paragraph marked as continuing; an empty story), not from a page edge.
- **Validity:** 11 of 12 page documents in the first request, 10 in the repeat. In the repeat, Dutt page 1 has the same misnumbered id as under method 044: the last group is given the id of the group before it, so that group is lost.
- **Text** (kept passages, markers ignored, first request / repeat): Hertel 152 0.44% / 0.52%; Kale 106 2.25% / 1.50%; Dutt page 2 0.27% / 0.27%.

## Limitations

Those of method 044, except the open ends at page breaks where both neighbors are available.
