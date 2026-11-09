# 078-gemini-4-argon-high-unit-types

Gemini 4 Argon with high thinking proposes the initial book-specific type list from sample page images. It uses the same sampling, prompt, response contract, validation, review and saved-attempt behavior as [method 077](../077-gpt-6-1-terra-unit-types/README.md).

The request uses the app's existing Gemini Interactions transport, high image resolution, high thinking, a 16,384-token output limit, standard service tier and store false. Its profile is in [config.json](config.json). The shared implementation and response schema are preserved in [method 077's snapshot](../077-gpt-6-1-terra-unit-types/snapshot/) and [response-schema.json](../077-gpt-6-1-terra-unit-types/response-schema.json), with [source hashes](../077-gpt-6-1-terra-unit-types/source-sha256.json).

The user chooses this model in the new-book form and explicitly requests a proposal. The estimated charge is shown with the result. Fixture tests check the labeled image request, response validation, retained costs and failure records. No live model request was made for this method during implementation because the browser has no configured API keys.

Live verification on 2026-11-09 UTC used the Gemini key configured in llm and the same four Cole PDF pages, title and empty input description as method 077. The browser returned eleven types in main and notes flows, with no schema or semantic type-list errors. The displayed estimated charge was $0.0990. The proposed types, review text, screenshot and report are in [cole-live-001](../../outputs/surveys/078-gemini-4-argon-high-unit-types/cole-live-001/). The proposal is pending human approval. The full response and usage are retained in the browser's source-PDF call record, identified by the saved type list's provenance.
