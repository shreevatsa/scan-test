# 073-gemini-4-argon-low-text-structure

Gemini 4 Argon · low thinking. Assign region types, unit trees, line-end joins, continuation flags, flows and note links from one fixed transcription and neighboring text. Preserve the supplied printed text in the resulting page document.

The profile and request settings are in [config.json](config.json). The frozen implementation is in [method 071’s snapshot](../071-cloud-vision-text-reading/snapshot/), with [source hashes](../071-cloud-vision-text-reading/source-sha256.json). Existing method outputs remain immutable. API attempts receive fresh UUIDs and save the image-free request, complete response, cost estimate and elapsed time. Transcription and each schema assignment model have independent caches. Earlier Argon-high structures keep their original cache paths.

Use Edit book → Schema assignment for sample comparisons and Make pages to process a page range with the chosen models. Comparisons hold the input transcription fixed and compare semantic decisions after removing arbitrary unit IDs. Schema consistency and differences from a model reference require source review to judge accuracy.
