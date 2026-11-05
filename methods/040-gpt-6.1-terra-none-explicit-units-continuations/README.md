# 040-gpt-6.1-terra-none-explicit-units-continuations: GPT-6.1 Terra without reasoning, explicit units with continuation flags

This method is [method 037](../037-gpt-6.1-terra-none-explicit-units/README.md) with two flags added to each region, plus a local book-level linker (`link.py`) that uses them. The request is unchanged:
- the raw PNG is sent to `gpt-6.1-terra` with reasoning effort `none` and image detail `original`;
- output is strict JSON Schema, with a maximum of 16,384 output tokens and `store=false`;
- each invocation makes one synchronous request, with no automatic retries;
- coordinates are [x1,y1,x2,y2] normalized to 0–1000 and scaled mechanically to pixels.

`costs.py`, `diagnostics.py`, `pricing.json` and `requirements.txt` are byte-identical copies from method 037.

## What changed from method 037

**The flags.** A region is page-local, but a unit (a paragraph, verse or note) can run across a page break, a column break or an interruption. Each region now carries two booleans:
- `continues_from_earlier`: the region does not begin its unit;
- `continues_later`: the unit does not end in this region.

**The prompt.** One rule is added, with examples of each flag (a paragraph starting mid-sentence at the top of a page; a hyphenated last line; the second half of an interrupted verse; a note continued from the previous page). Both flags are false for complete units and for page furniture. The schema line in the prompt shows the two fields. See `prompt.txt`.

**The schema and validation.** `response-schema.json` requires both fields as booleans. In `regions.py`, they are added to the required set and to the boolean check. `config.json` names the prompt variant `explicit-units-book-neutral-types-continuations-v1`; `run.py` changes only its name and docstring.

## The linker (`link.py`, local, no API calls)

**Streams:** kept regions of type note form the notes stream, figures and captions their own stream, and every other kept region the body stream. Regions not kept (headers, page numbers, margin furniture) are in no stream.

**Rule:** pages are taken in order, and kept regions in reading order within each page. Each region is paired with the next region of its stream, if that region is on the same page or the next page. The pair is linked if the first region has `continues_later` and the second has `continues_from_earlier`. This rule ("both") was fixed before any output was scored. Three looser rules are reported for comparison: "later" (the first region's flag alone), "earlier" (the second's alone) and "either".

**Scoring** uses [references/continuations/truth.json](../../references/continuations/README.md), whose anchors are line ids of the method 032 line finder with an ink-centroid point. Each anchor point is mapped to the smallest kept model box containing it, with a 15-pixel margin:
- a start edge is scored on that region's `continues_from_earlier`, and an end edge on its `continues_later`;
- a truth link is found if the linker links the region of its end edge to the region of its start edge;
- a predicted link is wrong if it is not a truth link but leaves a region holding a truth end edge or enters one holding a truth start edge; other predicted links are reported as unscored.

## Run

```sh
uv run --offline python methods/040-gpt-6.1-terra-none-explicit-units-continuations/run.py inputs/kale-1913-page-106.png --check
uv run --offline python methods/040-gpt-6.1-terra-none-explicit-units-continuations/run.py inputs/kale-1913-page-106.png
uv run --offline python methods/040-gpt-6.1-terra-none-explicit-units-continuations/run.py inputs/kale-1913-page-106.png --output-dir outputs/kale-1913-page-106/040-gpt-6.1-terra-none-explicit-units-continuations/run-002
uv run --offline python methods/040-gpt-6.1-terra-none-explicit-units-continuations/link.py outputs/surveys/040-gpt-6.1-terra-none-explicit-units-continuations/continuations
```

Existing output is protected against overwriting. Authentication checks `OPENAI_API_KEY`, then the stored `llm` key named `openai`. Artifacts and cost accounting are as in method 025. [Method 041](../041-gpt-6.1-terra-none-explicit-units-continuations-band-chained-lines/README.md) applies method 039's local ownership and outlines to this method's boxes and carries the flags into its polygon regions.

## Recorded results

Two requests on each of the 28 pages of `inputs/pages-runs.json`: seven runs of four consecutive pages, from Kale, Hertel, Ten Princes, Cole, Telang, Dutt 17F and Nītiśataka 1914. See "Continuation flags" in [NOTEBOOK.md](../../NOTEBOOK.md). In brief:
- **Requests.** All 56 completed with no validation warnings, at an estimated $0.31 for the first pass and $0.12 for the repeat. The flags take 48 output tokens per region against method 037's 32, so a first request costs about $0.0112 per page against $0.0096.
- **Flags at the 103 truth edges:** 95 and 94 correct (35 edges continue). Flags that are always false would score 68.
- **Links (rule "both"):** 11 of the 13 truth links in each request, with no wrong links. All 11 body links are found, including the left-to-right page continuations inside the Ten Princes spreads.
- **Misses:** the two links through Telang's critical apparatus. The model never flags that the last apparatus entry on a page continues. That entry's last line ends with a period, as a complete entry's does.
- **False flags:** five first regions on a page, the same five in both requests, are flagged as continuing. None produced a wrong link, because the previous page's last region was not flagged. They are new commentaries after a verse on the previous page (Kale pages 108 and 109), a new verse (Nītiśataka 1914 page 261), a verse that continues the previous verse's sentence (Dutt page 3), and prose resuming after a quoted verse (Hertel page 153). The last two are judgment calls.
- **Grouping:** unchanged in quality (method 041).

## Limitations

- **Interruptions:** the linker pairs only consecutive regions of a stream. A paragraph interrupted by a verse in the same stream, as on Hertel page 153, cannot be linked across the verse.
- **Streams by type:** where the model types notes as paragraphs, as with the English notes under the rule in Nītiśataka 1914, they join the body stream.
- **Relations other than continuation:** the model sometimes marks a commentary as continuing its verse. A verse–commentary relation is not a continuation and belongs in the transcription schema.
