# 083-gemini-4-argon-low-book-regions

Gemini 4 Argon · low thinking finds and types the regions using method 042's book-specific prompt and response schema. It receives the original page PNG, returns xyxy coordinates on a 0–1000 scale, and keeps the 16,384-token output limit and store false. Method 063 supplies the local ownership, outlines and line pieces. Configuration is in [config.json](config.json).

The shared runtime and prompt templates are preserved under [method 081's snapshot](../081-gpt-6-astra-low-book-regions/snapshot/), with [source hashes](../081-gpt-6-astra-low-book-regions/source-sha256.json). OpenAI requests use original image detail. Gemini requests use high image resolution and the standard service tier. Raw responses, usage, image-free requests, request hashes and call records are retained alongside each page's result.

To check a planned run without sending a request, use `UV_CACHE_DIR=/private/tmp/scan-test-uv-cache UV_NO_SYNC=1 uv run --offline python methods/081-gpt-6-astra-low-book-regions/benchmark.py --models argon-low-regions --run reference-002 --check`. Remove `--check` to run it. Credentials come from the usual environment variable or the llm key named openai or gemini. Output directories are protected.

The public benchmark scores nine passage references with method 043's evaluator. It measures ink included from other passages, omitted passage ink, separators and grouping splits. Semantic type names and continuation flags require separate review. The app retains Terra as the existing default and offers this model as a choice after comparison.

Token cost estimates use the recorded standard paid-tier prices, including thinking tokens and cached input. [Google pricing](https://ai.google.dev/gemini-api/docs/pricing)

## Recorded result on 2026-11-10

All nine pages completed. The summed passage scores are 4,193,060 pixels of other-passage ink included, 1,318,279 pixels of own ink omitted, 1,315,059 omitted beyond consecutive reading-order splits, and 0 separator pixels. There are 1 split passages, 6 regions matched by multiple kept passages and 2 missing kept passages. Estimated API cost was $0.121710.

[Reference scores](../../outputs/surveys/083-gemini-4-argon-low-book-regions/reference-001/summary.json)
