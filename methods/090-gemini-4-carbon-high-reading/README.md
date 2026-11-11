# 090-gemini-4-carbon-high-reading

Gemini 4 Carbon with high thinking transcribes numbered printed line pieces on fixed page regions. It is available in Text and as an opt-in transcription comparison model. Argon high supplies the default comparison reference. Each saved call records its profile, request hash, response, usage, elapsed time and estimated cost.

The prompt, numbered-line contract and image preparation use [method 065’s frozen implementation](../065-gemini-4-argon-low-reading/snapshot/), with [source hashes](../065-gemini-4-argon-low-reading/source-sha256.json). [Configuration](config.json) records high thinking, high-resolution images, a 32,768-token output limit, the standard service tier, store false and dated prices. The app caps provider requests at 75 seconds, following the user’s latency preference. The paired low-thinking profile is [method 089](../089-gemini-4-carbon-low-reading/README.md).

Model capabilities and prices were checked in Google’s documentation on 2026-11-11. Standard input, output including thinking, and cached input cost $2, $10 and $0.10 per million tokens through November 30, 2026, then $4, $20 and $0.20 starting December 1. [Model documentation](https://aistudio.google.com/docs/models/gemini-4-carbon), [pricing](https://aistudio.google.com/docs/pricing#gemini-4-carbon)

Fixture checks exercise both Carbon profiles through the normal transcription entry point, including high-thinking request settings, saved profiles, cache isolation and dated prices. Private-book trials and their charges are recorded locally in the book’s attempt ledger.
