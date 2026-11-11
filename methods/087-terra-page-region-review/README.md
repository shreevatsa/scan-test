# 087-terra-page-region-review

GPT-6.1 Terra with reasoning off reviews one scanned page using its current region assignments, the book's type list and a user instruction. It returns a plain-language explanation, proposed printed type additions and a complete proposed layout. This is the Regions editor's **Review page with AI** action.

The request uses the existing OpenAI region-request builder, original image detail, strict JSON Schema, a 16,384-token output limit and store false. Settings are in [config.json](config.json). The [example prompt](prompt.example.txt) and [example contract](response-schema.example.json) demonstrate a single page and type list. The exact request, validation and transport sources are preserved in [snapshot/](snapshot/), with [source hashes](source-sha256.json). Method 088 shares this runtime with its Gemini profile. The app subsequently added dimension preflight and outline-coverage notices. The snapshot retains the sources used for the recorded requests.

A proposed printed type names an existing parent or flow, or identifies page furniture. Proposed types pass the existing type-list checks. The complete layout is checked against the current and proposed types. Type additions use the ordinary revision preview and journal. The layout receives local outlines and enters the shared whole-page review dialog. Each explicit user choice is saved through the existing protection and review logic.

The raw call records the instruction, input type list, scan hash, dimensions, response, usage, cost and elapsed time. A latest pointer and the call ledger restore saved responses. Derived layout records live separately under work/page-reviews. Matching accepted type additions can be reused, while conflicting definitions require review. Region preview checks the scan hash and keeps its source call provenance.

Run the frozen public check from the repository root with `node methods/087-terra-page-region-review/run.mjs cole-1903-page-003 terra-page-review live-004`. Each run requires a fresh output directory. The runner uses the environment credential or the configured llm provider key. Supply an optional fourth argument naming a UTF-8 instruction file to test explicit feedback.

Six fixture tests cover invalid definitions and boxes, checked type additions, both provider requests, input and cost provenance, latest-pointer recovery, saved geometry, cache reuse and changed scans. Browser checks use real local outlines with simulated replies to exercise the instruction, response, type preview, region comparison and reopening workflow.


## Public checks on 2026-11-10

The [first saved response](../../outputs/cole-1903-page-003/087-terra-page-region-review/live-001/report.json) cost $0.0147705. Its runner omitted image dimensions from a legacy region record, making its geometry verification unusable. The input issue is recorded separately in [validation-failure.json](../../outputs/cole-1903-page-003/087-terra-page-region-review/live-001/validation-failure.json). The app now checks source dimensions before requesting a review.

The [corrected-input run](../../outputs/cole-1903-page-003/087-terra-page-region-review/live-002/report.json) cost $0.0147855 and proposed mathematical_list plus eleven regions. The complete provisional page passed the schema checks. Local outlines found ink in seven regions because several paragraph boxes enclosed separately proposed displayed formulas. The proposal and derived geometry are retained for review.

The [follow-up instruction](../../outputs/cole-1903-page-003/087-terra-page-region-review/live-003/report.json) explicitly asks for prose before and after embedded displays to have separate boxes. Its response proposes displayed_number_list and fourteen regions, for $0.01417675. Validation results are retained alongside the response. Total live spending for these three requests is $0.04373275.
