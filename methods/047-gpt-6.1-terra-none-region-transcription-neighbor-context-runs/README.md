# 047-gpt-6.1-terra-none-region-transcription-neighbor-context-runs: method 046 for whole books

This is [method 046](../046-gpt-6.1-terra-none-region-transcription-neighbor-context/README.md) with one addition, `--run NAME`, for running a whole book whose region step was saved in a named run (`outputs/<input>/043-…/NAME/`). The page's regions and its neighbors' are then read from that run, and the default output directory is `outputs/<input>/047-…/NAME/`. The request is built exactly as by method 046, from the same prompt, cut-outs and context. All other files are byte-identical copies of method 046's: `costs.py`, `pricing.json`, `requirements.txt`, `prompt.py`, `prompt-template.txt`, `pagedoc.py` and `cutouts.py`. `config.json` differs only in its name.

A new ID was needed because method 046's `run.py` is recorded in its results and cannot change. Its docstring also lacks method 046's own description, which an edit meant to add, and this method's `run.py` has it.

## Run (the Kale full-book walk)

```sh
# region step for every page, then the local step, then this method
cd methods/042-gpt-6.1-terra-none-book-types-continuations
uv run --offline python run.py ../../inputs/kale-1913-page-050.png --types ../../schema/types/kale-1913.json \
  --output-dir ../../outputs/kale-1913-page-050/042-gpt-6.1-terra-none-book-types-continuations/book-001
cd ../043-gpt-6.1-terra-none-book-types-continuations-band-chained-lines
uv run --offline python run.py ../../inputs/kale-1913-page-050.png \
  --base-regions ../../outputs/kale-1913-page-050/042-gpt-6.1-terra-none-book-types-continuations/book-001/regions.json \
  --output-dir ../../outputs/kale-1913-page-050/043-gpt-6.1-terra-none-book-types-continuations-band-chained-lines/book-001
cd ../047-gpt-6.1-terra-none-region-transcription-neighbor-context-runs
uv run --offline python run.py ../../inputs/kale-1913-page-050.png --types ../../schema/types/kale-1913.json --run book-001
```

`--types` is given because the three oldest Kale input records (pages 17, 97 and 113) have no `book_id`. Method 044's `assemble.py` joins the page documents into the book.

`book_report.py` (local) summarizes a whole-book run: per page validity, problems, open units and costs (`pages.json`), and for each top-level unit of the assembled book the numbers of its numbered units, with gaps, repeats and restarts (`numbers.json`).

## Recorded results

The Kale full-book walk, run `book-001` (2026-11-06). See "The Kale full-book walk" in [NOTEBOOK.md](../../NOTEBOOK.md).
- **Run:** 125 pages completed before the API refused every request for lack of credits (HTTP 429, `insufficient_quota`). The refused attempts are kept as `book-001-refused-429`. The other 127 pages ran after the user added credits. $5.21 for the transcription of all 252 pages.
- **Validity:** 251 of 252 page documents valid. Page 130 is invalid: an editor's note was typed paragraph, which the type list allows only in the contents.
- **The assembled book:** 2,136 units, with open-end mismatches at 5 of 250 page breaks. Three of them come from gaps in the extended type list: commentary allowed directly in a section, and the translation and notes not described as one unit across both śatakas.
- **Structure:** 133 and 145 verses in the two śatakas, as the contents say. The sequence check found misread verse numbers (९ read as १ in the nineties, five verses) and a few gaps and repeats in the English parts.
