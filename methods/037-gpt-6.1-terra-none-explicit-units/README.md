# 037-gpt-6.1-terra-none-explicit-units: GPT-6.1 Terra without reasoning, explicit units and book-neutral types

This method is [method 025](../025-gpt-6.1-terra-none-footnotes/README.md) with a new prompt. The request is unchanged:
- the raw PNG is sent to `gpt-6.1-terra` with reasoning effort `none` and image detail `original`;
- output is strict JSON Schema, with a maximum of 16,384 output tokens and `store=false`;
- each invocation makes one synchronous request, with no automatic retries;
- coordinates are [x1,y1,x2,y2] normalized to 0–1000 and scaled mechanically to pixels.

`costs.py`, `diagnostics.py`, `pricing.json` and `requirements.txt` are byte-identical copies from method 025. In `regions.py`, only the allowed types and the overlay's note-label rule changed; in `run.py`, only the method name and docstring.

## What changed from method 025

Method 025's prompt was written for Kale (1913). Its types were verse, commentary, lead_in, footnote, running_header, page_number and other, and it gave a unit rule only for verses and footnotes. In the cross-book test, two requests per page agreed in ownership and keep flags on 35 of 43 pages. Every disagreement was one of granularity:
- Kale's contents page came back as 28 regions in one request and 6 in the other;
- consecutive Dutt verses were grouped in one request;
- note items on a Nītiśataka page were joined.

This prompt defines the unit explicitly as "the finest unit that the page sets apart visually", with a book-neutral type for each kind of unit:
- **verse:** with all its lines and its number or end mark; never two verses in one region, and each part of an interrupted verse separately;
- **paragraph:** prose, including translations and commentary;
- **heading:** including speaker lines;
- **lead_in;**
- **list_item:** for lists, tables of contents and indexes;
- **formula:** lines that continue one another (a chain of = or ≡) form one formula;
- **note:** footnotes, endnotes, marginal notes and apparatus entries, separated even when they share a printed line;
- **table, figure and caption;**
- **running_header and page_number:** keep=false;
- **other:** printer's signature marks and catchwords are other, with keep=false.

The prompt also says to finish each column before the next in reading order. See `prompt.txt`.

## Run

```sh
uv run --offline python methods/037-gpt-6.1-terra-none-explicit-units/run.py inputs/cole-1903-page-003.png --check
uv run --offline python methods/037-gpt-6.1-terra-none-explicit-units/run.py inputs/cole-1903-page-003.png
uv run --offline python methods/037-gpt-6.1-terra-none-explicit-units/run.py inputs/cole-1903-page-003.png --output-dir outputs/cole-1903-page-003/037-gpt-6.1-terra-none-explicit-units/run-002
```

Existing output is protected against overwriting. Authentication checks `OPENAI_API_KEY`, then the stored `llm` key named `openai`. Artifacts and cost accounting are as in method 025. [Method 038](../038-gpt-6.1-terra-none-explicit-units-line-polygons/README.md) applies method 036's local ownership and outlines to this method's boxes.

## Recorded results

Two requests on each of 46 pages: Kale pages 17, 97 and 113, and the 43 cross-book pages in `inputs/pages.json`. See the method 037 and 038 entries in [NOTEBOOK.md](../../NOTEBOOK.md), under "Cross-book test". In brief:
- **Requests.** All 92 completed, with no validation warnings, at an estimated $0.40 for the first pass and $0.11 for the repeat, whose image was served from the prompt cache.
- **Stability.** On the 43 pages that both prompts were tested on, the two requests agree in ownership and keep flags on 36, against 34 for method 025. Mean ink agreement is 0.998 against 0.972, and the worst page is at 0.962 against 0.204. The large granularity differences are gone: Kale's contents page and Dutt 13F come out the same in both requests.
- **References.** Through method 038, results match eight of the nine references at the finest unit. The ninth is Telang page 108, where both requests split the apparatus entry for verse 79 into three regions: its readings (c) and (d), and the wrapped end of (d).
- **Finer splits.** Apparatus entries are split into individual readings and line pieces on Telang pages 79 and 108. Source citations after quoted verses are split off in one request on Nītiśataka 1896 page 339. The user judged either granularity acceptable for the apparatus. On Telang 108, the pieces hold only their own entry's ink and are consecutive in reading order.

### Held-out test

Two requests on each of 54 fresh pages from ten books (`inputs/pages-fresh.json`), chosen by rule after this prompt was frozen. Method 025 was run on the same pages for comparison. See "Held-out test" in NOTEBOOK.md. In brief:
- **Requests.** All 108 completed, at an estimated $0.4551 for the first pass and $0.1251 for the repeat.
- **Stability.** It is the same as method 025's: 48 of 54 pages have identical ownership and keep flags between requests under each prompt, with mean ink agreement 0.996 against 0.997. The improvement on the 46 test pages did not carry over. It came from a few pages whose failures this prompt's rules were written against, and the fresh sample has no contents page.
- **Grouping.** It is identical to method 025's on 43 of 54 pages. Where it differs, method 037 is usually finer: apparatus readings on Telang, source citations and lead-ins in Nītiśataka notes.
- **References.** No merges or misses on the four fresh references. Hertel page 152's margin line numbers were omitted in one request, so the local methods gave them to text regions.
