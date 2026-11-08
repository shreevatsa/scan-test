# 042-gpt-6.1-terra-none-book-types-continuations: GPT-6.1 Terra without reasoning, region types from the book's type list, with continuation flags

This method is [method 040](../040-gpt-6.1-terra-none-explicit-units-continuations/README.md) with the region types generated from the book's type list ([schema/types/](../../schema/types/), see [schema/README.md](../../schema/README.md)) in place of the book-neutral types. The request is otherwise unchanged:
- the raw PNG is sent to `gpt-6.1-terra` with reasoning effort `none` and image detail `original`;
- output is strict JSON Schema, with a maximum of 16,384 output tokens and `store=false`;
- each invocation makes one synchronous request, with no automatic retries;
- coordinates are [x1,y1,x2,y2] normalized to 0–1000 and scaled mechanically to pixels;
- each region carries method 040's two continuation flags.

`costs.py`, `diagnostics.py`, `pricing.json` and `requirements.txt` are byte-identical copies from method 040.

## What changed from method 040

**The type list.** `run.py` reads the input record beside the image (`inputs/<input>.json`) for its `book_id` and loads `schema/types/<book_id>.json`, or the file given with `--types`. A page of a book without a type list is refused.

**The prompt** (`prompt.py` with `prompt-template.txt`). The template is method 040's prompt with three generated parts:
- **The book:** the type list's title and description.
- **The types:** every type of the book that is printed as regions (one with a region class, or page furniture), in the list's order. Each is described by the book's own description, then the rule for its region class in method 040's wording: for verse, for example, "Include all its lines and its number or end mark. Never one region per line…". Furniture types add "Page furniture, keep=false." A catch-all type `other` is always added.
- **Larger units:** the book's types that have no regions of their own (Kale's section and group, Dutt's chapter, group and verse_set, Hertel's story), listed for context with "never return them as regions".

One rule is added where a region type may contain another, as Hertel's paragraph contains verses and lead-ins: the inner unit is its own region, and the outer unit's text before it and after it are separate regions of that unit. The continuation, reading-order, uncertainty and no-transcription rules are method 040's, word for word. To see the generated prompt for a book:

```sh
uv run --offline python methods/042-gpt-6.1-terra-none-book-types-continuations/prompt.py schema/types/kale-1913.json
uv run --offline python methods/042-gpt-6.1-terra-none-book-types-continuations/prompt.py schema/types/kale-1913.json --schema
```

**The schema and validation.** The response schema is `response-schema-template.json` (method 040's) with the type enum generated from the type list. `regions.py` takes the allowed types, their region classes and the furniture types as arguments. Each region record also has `region_class`, the region class of its type (`other` for furniture without one), and the overlay uses the class.

**Saved with each result:** the generated `prompt.txt` and `response-schema.json`, and `type-list.json`, a byte copy of the type list. `regions.json` records the type list's path and sha256 and the prompt's sha256. `config.json` names the prompt variant `book-types-continuations-v1`.

## The linker (`link.py`, local, no API calls)

Method 040's linker with two changes:
- streams come from each region's `region_class`, so that, for example, Kale's `footnote` regions form the notes stream;
- `--runs` scores only some runs of the continuation truth, here the three books that have type lists.

## Run

```sh
uv run --offline python methods/042-gpt-6.1-terra-none-book-types-continuations/run.py inputs/kale-1913-page-107.png --check
uv run --offline python methods/042-gpt-6.1-terra-none-book-types-continuations/run.py inputs/kale-1913-page-107.png
uv run --offline python methods/042-gpt-6.1-terra-none-book-types-continuations/run.py inputs/kale-1913-page-107.png --output-dir outputs/kale-1913-page-107/042-gpt-6.1-terra-none-book-types-continuations/run-002
uv run --offline python methods/042-gpt-6.1-terra-none-book-types-continuations/link.py outputs/surveys/042-gpt-6.1-terra-none-book-types-continuations/continuations --runs kale-1913-106 hertel-panchatantra-152 dutt-17f-chapter-001
```

Existing output is protected against overwriting. Authentication checks `OPENAI_API_KEY`, then the stored `llm` key named `openai`. Artifacts and cost accounting are as in method 025. [Method 043](../043-gpt-6.1-terra-none-book-types-continuations-band-chained-lines/README.md) applies method 041's local ownership and outlines to this method's boxes.

## Recorded results

Two requests on each of the 12 run pages of the three books with type lists: Kale 106–109, Hertel 152–155 and Dutt 17F chapter 1 pages 1–4. See "Book types from the type list" in [NOTEBOOK.md](../../NOTEBOOK.md). In brief:
- **Requests:** all 24 completed with no validation warnings, at an estimated $0.165 for the first pass and $0.073 for the repeat, about 2.5% more than method 040 on the same pages. Output is 48 tokens per region, as under method 040. API wall time per page: median 12.7 s and 13.6 s, against 12.4 s and 11.8 s.
- **Book types** (method 043): on the seven pages with hand-written unit trees, all 139 example regions get the example's book type in both requests.
- **Grouping** (method 043): 0 / 0 / 0 on the three referenced pages in both requests. The differences from method 041 follow the type lists: Kale page 108's footnote 3 is one region, Hertel's running title and tale title are one region, Dutt page 1's three-line chapter heading is one region, and Hertel pages 154–155 now have their margin line numbers.
- **Flags:** 36 of 40 truth edges correct in each request, as under method 040; the 3 truth links found with none wrong, as under method 040. Dutt page 3's verse 26 is no longer flagged; Kale pages 108–109 still are; on Hertel page 153 the last paragraph is newly flagged as continuing. Hertel 153's first region is flagged as continuing, which the truth counts wrong but the Hertel type list makes right (the paragraph continues after verse 348).

**Telang run, with Claude's draft type list** (two requests on Telang 108–111; the user accepted the list afterwards):
- **Apparatus:** one region per entry, 4, 5, 4 and 3 on pages 108–111 in both requests, where method 040 returned between 3 and 23 note regions per page and split entries into lines.
- **Flags:** 14 of 15 truth edges in each request (method 040: 12 and 11); 3 of the 4 truth links under rule "both", including the apparatus link from page 109 to 110, which method 040 never found (method 040: 2). There are no wrong links. The entry at the foot of page 108 is still not flagged as continuing.
- **Cost:** $0.0384 for the first pass and $0.0174 for the repeat (method 040: $0.0423 and $0.0159).

**Cole run, with Claude's draft type list** (two requests on Cole 1–4; the user accepted the list afterwards):
- **Regions:** the same regions, types and flags in both requests on every page. The running header is one region (method 040: two on every page); article heads are typed heading, byline and read_before, and signoffs signoff, where method 040's types for those lines varied between requests. The "and" between two formulas on page 4 is a paragraph region.
- **Flags:** 16 of 16 truth edges and both truth links in each request, with none wrong, as under method 040.
- **Cost:** $0.0515 for the first pass and $0.0153 for the repeat (method 040: $0.0502 and $0.0161).

**The other five books, with Claude's draft type lists** (two requests each, 2026-11-05; the user accepted all five lists afterwards; see the NOTEBOOK entries for each):
- **Ten Princes** (9 spreads), **Nītiśataka 1896** (12 pages), **Nītiśataka 1914** (15 pages), **Vavilla** (12 pages) and **the Gita** (6 spreads): all 110 requests (two on each of 54 pages, and two more on 1896 page 195 with the revised 1896 list) completed with no validation warnings, at an estimated $0.64 in total.
- **Same regions, types and flags in both requests** on 9 of 9, 11 of 12, 12 of 15, 12 of 12 and 6 of 6 pages; the differences are flags only.
- **Flags:** Ten Princes 16 of 16 truth edges and all 4 truth links, as under method 040; Nītiśataka 1914, a control run, 16 and 15 of 16 (method 040: 15 and 15).

## Limitations

- **Books without a type list** cannot be run.
- **Interruptions within a unit** (Hertel's paragraph around its verses) are now flagged on both sides of each verse, as the type list asks. Method 040's linker pairs only consecutive regions of a stream, so it cannot join them. Joining is left to the unit tree of the transcription call.
- **Flags about larger units:** the model still flags a Kale commentary at the top of a page as continuing when its verse was on the previous page. The verse and commentary are one group, but the commentary itself begins there.
