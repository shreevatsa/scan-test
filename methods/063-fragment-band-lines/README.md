# 063 — Fragment bands joined to their parent text lines

This local method extends [method 043](../043-gpt-6.1-terra-none-book-types-continuations-band-chained-lines/README.md). Some detached glyph parts exceed the main-component height threshold and start small extra bands. Method 063 joins those bands before assigning the remaining detached marks and computing ownership and polygons.

The ink mask, page-angle estimation, columns, model regions, ownership rules and polygon construction come from method 043. `analysis.py` and `ownership.py` are byte copies. `geometry.py` adds the band grouping. `run.py` exports the parent line IDs and the IDs of their former fragments. There are zero API calls.

## Grouping rule

A candidate joins a host in the same column when all four conditions hold.

- Its core height is at most 0.9 times the host's core height.
- It has at most half as many main components as the host.
- Its center lies within the host's vertical core, padded by 0.3 character heights.
- Their horizontal extents meet within the existing one-character assignment padding.

Among eligible hosts, choose the nearest center, breaking ties by the original band index. Choose every parent from the original bands, then combine each parent tree. The height constraint makes the parent graph acyclic. Recompute each combined band's extent and median center from its main components, then run the existing detached-mark assignment and short-glyph chaining.

These tests use image geometry and component counts. They apply across scripts and book types. The separate lines of ordinary text retain similar core heights and remain distinct under this rule.

## Line IDs and existing documents

Analysis and ownership use dense internal band indices. Saved region line pieces use the surviving parent's original method 043 ID. `previous_line_ids` records every original band absorbed into that parent, and the result's `line_aliases` lists the mapping. Sparse page-level IDs are valid in the book schema.

The browser port exports the same parent IDs and aliases. Its existing text placement prefers meaningful text on the parent, then meaningful text on a former fragment. Additional edited text remains as a piece without an outline. Formatting spans and line-end settings travel with the text, and relations addressed by a region and line follow a moved piece. Recomputing the same geometry is repeatable.

Diagnostic fields produced during analysis and ownership can refer to dense internal indices. `line_aliases`, saved region line pieces and exported line decisions use the parent IDs.

## Run

```sh
uv run --offline python methods/063-fragment-band-lines/run.py inputs/kale-1913-page-106.png \
  --base-regions outputs/kale-1913-page-106/042-gpt-6.1-terra-none-book-types-continuations/regions.json \
  --output-dir outputs/kale-1913-page-106/063-fragment-band-lines/regression-001
node --test webapp/test/fragment-lines.test.mjs
```

The runner protects occupied output directories. The browser uses this grouping in both Make pages and the editor's outline recomputation. `LEGACY_LINES` retains the former settings for parity checks against method 043.

[Method 064](../064-gemini-4-argon-low-fragment-line-transcription/README.md) runs method 055's formatted transcription on these regions through the command-line pipeline.

## Recorded checks, 2026-11-08

Nine public passage references were checked using the original method 042 regions and method 043's evaluator. Both methods score zero other-passage ink included, zero own ink omitted and zero separator ink included on every page. The pages cover Kale 106, Hertel 152, Dutt 17F chapter 1 page 2, Telang 108, Cole 3, Ten Princes 30, Nītiśataka 1896 page 123, Nītiśataka 1914 page 258, and Vavilla 34. Results are in each page's `063-fragment-band-lines/regression-001/reference-evaluation/` and the cross-page [summary](../../outputs/surveys/063-fragment-band-lines/regression-001/summary.json).

The five browser regression tests cover detached parts that themselves qualify as main components, a genuine short line, stable parent IDs, existing text and formatting, repeated updates, text edited on a former fragment, line-addressed relations and recovery of additional edited text. The existing six-page method 043 parity checks run with the legacy settings.
