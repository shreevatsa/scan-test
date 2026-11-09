# 072-cloud-vision-document-reading

Cloud Vision · Document Text Detection. Send one full-resolution page image to Cloud Vision with one OCR feature. Map its word boxes to the shared numbered line polygons. Keep plain text and flag formatting and marker review.

The profile and request settings are in [config.json](config.json). The frozen implementation is in [method 071’s snapshot](../071-cloud-vision-text-reading/snapshot/), with [source hashes](../071-cloud-vision-text-reading/source-sha256.json). Existing method outputs remain immutable. API attempts receive fresh UUIDs and save the image-free request, complete response, cost estimate and elapsed time. Transcription and each schema assignment model have independent caches. Earlier Argon-high structures keep their original cache paths.

Use Edit book → Transcription models for sample comparisons and Make pages to process a page range with the chosen models. Cloud Vision needs an API key for a project with Vision enabled and billing configured. Pricing uses one paid OCR unit per page, before free monthly units or volume discounts.
