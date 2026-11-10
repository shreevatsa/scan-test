# 082-gpt-6.1-sol-low-book-regions

GPT-6.1 Sol · low reasoning finds and types the regions using method 042's book-specific prompt and response schema. It receives the original page PNG, returns xyxy coordinates on a 0–1000 scale, and keeps the 16,384-token output limit and store false. Method 063 supplies the local ownership, outlines and line pieces. Configuration is in [config.json](config.json).

The shared runtime and prompt templates are preserved under [method 081's snapshot](../081-gpt-6-astra-low-book-regions/snapshot/), with [source hashes](../081-gpt-6-astra-low-book-regions/source-sha256.json). OpenAI requests use original image detail. Gemini requests use high image resolution and the standard service tier. Raw responses, usage, image-free requests, request hashes and call records are retained alongside each page's result.

To check a planned run without sending a request, use `UV_CACHE_DIR=/private/tmp/scan-test-uv-cache UV_NO_SYNC=1 uv run --offline python methods/081-gpt-6-astra-low-book-regions/benchmark.py --models sol-regions --run reference-002 --check`. Remove `--check` to run it. Credentials come from the usual environment variable or the llm key named openai or gemini. Output directories are protected.

The public benchmark scores nine passage references with method 043's evaluator. It measures ink included from other passages, omitted passage ink, separators and grouping splits. Semantic type names and continuation flags require separate review. The app retains Terra as the existing default and offers this model as a choice after comparison.

Standard token pricing and supported reasoning settings were checked in the [official model documentation](https://developers.openai.com/api/docs/models/gpt-6.1-sol) on 2026-11-10.

## Recorded result on 2026-11-10

All nine pages completed. The summed passage scores are 0 pixels of other-passage ink included, 0 pixels of own ink omitted, 0 omitted beyond consecutive reading-order splits, and 0 separator pixels. There are 0 split passages, 0 regions matched by multiple kept passages and 0 missing kept passages. Estimated API cost was $0.200886.

[Reference scores](../../outputs/surveys/082-gpt-6.1-sol-low-book-regions/reference-001/summary.json)
