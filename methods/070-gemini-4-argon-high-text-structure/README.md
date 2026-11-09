# 070-gemini-4-argon-high-text-structure

Gemini 4 Argon · high thinking. A fixed text-only call builds the unit tree, line-end joins, continuation flags and note links from a supplied reading. The app combines its output with the reader’s original text.

The frozen implementation is archived under [method 065](../065-gemini-4-argon-low-reading/snapshot/). Its source hashes are in [source-sha256.json](../065-gemini-4-argon-low-reading/source-sha256.json). Per-book prompts and response schemas come from the supplied type list. The profile and request settings are in [config.json](config.json). New model calls receive immutable UUID records with the request hash, image-free request, complete response, usage, elapsed time and estimated paid-tier cost. Reading and structuring results are cached separately using source, prompt, profile and geometry fingerprints.

The static app’s entry points are Edit book → Transcription models and Make pages. Existing combined transcription methods remain available as their original experiments. Local OCR supplies plain text and needs formatting and marker review. Comparison scores use Unicode code points after NFC, whitespace normalization and removal of ZWJ/ZWNJ. Scan-checked lines supply the checked-reference error score.
