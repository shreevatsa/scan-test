# 055-gemini-4-argon-low-region-transcription-formatting: method 052 with inline formatting, as schema 0.2

This is [method 052](../052-gemini-4-argon-low-region-transcription-neighbor-context-region-list/README.md) (Gemini 4 Argon transcription on method 043's regions, with neighbor context and a region list). It changes the prompt in two places and produces schema 0.2 page documents (see [schema/README.md](../../schema/README.md), "Inline spans and note markers").

**Prompt** (`prompt-template.txt`):
- **Note markers** are written in square brackets at the position where they are printed, even inside a word (`wo[*]rd`). Method 052 asked for them right after the word, but Gemini already wrote them where the superscript stands, and the user wants that position kept.
- **Formatting:** a new rule asks for `<b>…</b>`, `<i>…</i>`, `<sc>…</sc>`, and for `<sup>…</sup>` and `<sub>…</sub>` on characters that are not note markers. It marks only what the printer sets apart from the text around it in the same script. A script printed throughout in one heavy face, as the Devanagari in Kale's English notes, is not bold. Headings in capitals, letter spacing and type size are not marked. Small capitals are written in lower case, with a full-size capital kept: STANZA with a larger S is `<sc>Stanza</sc>`. A tag that goes on past a line end is closed there and opened again on the next line.

**Page document** (`pagedoc.py`): each region's lines are parsed with `schema/inline.py` (`parse_line`), carrying open tags from line to line within the region and numbering markers through the page. The tags and `[x]` markers leave the text; formatting becomes spans `{start, end, kind}`, and each marker becomes a zero-width `note_marker` span with an id (`m1`, `m2`, …) and its printed sign. A note relation names its marker's span as `from.anchor` (`<page>#m1`), found by the marker sign the model gives in the named line piece. `schema_version` is `"0.2"`.

Changed files: `prompt-template.txt`, `pagedoc.py`, `run.py` (docstring), `config.json` (name and prompt variant). The others are byte copies of method 052's. `evaluate_formatting.py` is new.

## Run

```sh
cd methods/055-gemini-4-argon-low-region-transcription-formatting
uv run --offline python run.py ../../inputs/kale-1913-page-166.png --types ../../schema/types/kale-1913.json --run book-002 --check
uv run --offline python run.py ../../inputs/kale-1913-page-166.png --types ../../schema/types/kale-1913.json --run book-002
```

`--run` names the run of methods 042 and 043 whose regions are transcribed, and the output directory.

## Scoring

```sh
uv run --offline python methods/055-gemini-4-argon-low-region-transcription-formatting/evaluate_formatting.py OUT.json kale-1913-page-166:book-002 …
```

It compares the page document's formatting, as runs joined across line pieces, with `references/<page>/formatting.json`, by kind, exactly or with the text misread (difflib ratio 0.8 or more). Runs that match nothing are false marks. It also compares the plain text, line piece by line piece, with method 052's page document of the same page and run.

## Where it was used

The formatting test on six pages (NOTEBOOK, "Inline formatting: schema 0.2 and method 055 on six pages"): Kale pages 2, 166 and 208 (run `book-002`) and Telang pages 13, 25 and 127 (run `book-001`).
