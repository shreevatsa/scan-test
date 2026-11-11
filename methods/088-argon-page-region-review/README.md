# 088-argon-page-region-review

Gemini 4 Argon with high thinking performs the one-page region and type review described in [method 087](../087-terra-page-region-review/README.md). It receives the page image, current region assignments, book type list and user instruction, then returns an explanation, optional printed type additions and the proposed complete layout.

[Configuration](config.json) records the profile. The request uses high image resolution, the standard service tier, a 16,384-token output limit and store false. Its prompt, response contract, validation and transport are preserved in [the shared method 087 snapshot](../087-terra-page-region-review/snapshot/), with [source hashes](../087-terra-page-region-review/source-sha256.json).

This profile has fixture verification for its request, response validation, cost accounting and saved provenance. A live Gemini call is available through the shared runner using the argon-page-review profile and a fresh run name.
