# Continuation truth for seven four-page runs

`truth.json` records which units continue across page and column breaks in the 28 pages of [inputs/pages-runs.json](../../inputs/pages-runs.json). It was written by Claude on 2026-11-04 from the page images, before any method 040 output was opened. The user reviewed it on 2026-11-05 through the review images below and found every answer right for regions. `truth.json`'s own note predates the review and is unchanged, because the scoring records its hash.

## Contents

**Runs:** seven runs of four consecutive pages, each starting at a page with a passage reference:
- Kale 106–109;
- Hertel 152–155;
- Ten Princes 30–33, as photographed two-page spreads;
- Cole 1–4;
- Telang 108–111;
- Dutt 17F chapter 1, pages 1–4;
- Nītiśataka 1914 258–261, a control with no continuations.

**Edges (103, of which 35 continue):** one record for the first and last unit of each stream (body, or notes) in each page or column. Each record says whether that unit continues from an earlier region (start edge) or into a later one (end edge). Each Ten Princes spread has an edge pair per page.

**Anchors:** a line id from the method 032 line finder (as used by method 035's reference builder), optionally restricted to an x range, plus `point`, the ink centroid of that line piece. Scoring maps the point to a model region.

**Links (13):** pairs of an end edge and the start edge it continues into, within a run. Edges that continue past the run's first or last page have no link. The links are:
- 11 body links:
  - one each on Kale, Hertel and Dutt;
  - two each on Cole and on Telang's text;
  - four on Ten Princes, two of them from a spread's left page to its right page;
- 2 notes links, through Telang's critical apparatus.

## Review images

`review-<run>.png`, one per run, made by `review.py` with no model output.
- **Tiles:** one per truth edge. Each shows the first lines (top) or last lines (bottom) of the main text or notes on one page or column, with the anchor line outlined.
- **Header:** the header above each tile states the truth in words. Orange headers continue, from an earlier page or column or onto a later one; gray headers start or end there.
- **Order:** main text first, then notes. Within each, each page's top comes before its bottom, so the bottom of one page sits directly above the top of the next.
- **Ten Princes:** a "page" is one scan image, a two-page spread. Its left and right columns are the two printed pages.

```sh
uv run --offline python references/continuations/review.py
```

## Deliberate choices

- **Displayed formulas:** sentences that continue through a displayed formula within a page (Cole) are not scored.
- **Commentary after a verse:** a commentary that begins at the top of a page, after its verse ended on the previous page, is a new unit, not a continuation (Kale pages 108 and 109).
- **Prose after a quoted verse:** prose that resumes after a quoted verse at a page break is a new region (Hertel page 153).
- **Larger units (from the user's review):** the edges describe regions. Three breaks fall inside a larger unit that continues, which the edges do not record:
  - Hertel 152–153: the speech that quotes verse 348;
  - Kale 107–108 and 108–109: the lead-in + verse + commentary group;
  - Dutt 2–3: the set of verses 25 and 26 with its translation.
- **Corrected anchors:** three Nītiśataka 1914 anchors were corrected after a visual check showed border ornaments pulling the centroid:
  - page 259 line 32 is restricted to x 200–1350;
  - page 260 line 22 (the word "love.") is restricted to x 95–1350;
  - the notes start on page 260 is line 26, not line 25, which is a border piece.

  These corrections were made before any output was scored.
