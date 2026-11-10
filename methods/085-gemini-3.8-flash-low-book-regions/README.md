# 085-gemini-3.8-flash-low-book-regions

Gemini 3.8 Flash · low thinking finds and types the regions using method 042's book-specific prompt and response schema. It receives the original page PNG, returns xyxy coordinates on a 0–1000 scale, and keeps the 16,384-token output limit and store false. Method 063 supplies the local ownership, outlines and line pieces. Configuration is in [config.json](config.json).

The shared runtime and prompt templates are preserved under [method 081's snapshot](../081-gpt-6-astra-low-book-regions/snapshot/), with [source hashes](../081-gpt-6-astra-low-book-regions/source-sha256.json). OpenAI requests use original image detail. Gemini requests use high image resolution and the standard service tier. Raw responses, usage, image-free requests, request hashes and call records are retained alongside each page's result.

To check a planned run without sending a request, use `UV_CACHE_DIR=/private/tmp/scan-test-uv-cache UV_NO_SYNC=1 uv run --offline python methods/081-gpt-6-astra-low-book-regions/benchmark.py --models flash-regions --run reference-002 --check`. Remove `--check` to run it. Credentials come from the usual environment variable or the llm key named openai or gemini. Output directories are protected.

The public benchmark scores nine passage references with method 043's evaluator. It measures ink included from other passages, omitted passage ink, separators and grouping splits. Semantic type names and continuation flags require separate review. The app retains Terra as the existing default and offers this model as a choice after comparison.

Token cost estimates use the recorded standard paid-tier prices, including thinking tokens and cached input. [Google pricing](https://ai.google.dev/gemini-api/docs/pricing)

## Recorded result on 2026-11-10

All nine pages completed. The summed passage scores are 3,606,725 pixels of other-passage ink included, 833,381 pixels of own ink omitted, 827,535 omitted beyond consecutive reading-order splits, and 0 separator pixels. There are 4 split passages, 8 regions matched by multiple kept passages and 6 missing kept passages. Estimated API cost was $0.042943.

[Reference scores](../../outputs/surveys/085-gemini-3.8-flash-low-book-regions/reference-001/summary.json)
