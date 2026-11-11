# 089-gemini-4-carbon-low-reading

Gemini 4 Carbon with low thinking transcribes numbered printed line pieces on fixed page regions. The app offers this profile in Text and its transcription comparison. Each saved call records the model profile, request hash, response, usage, elapsed time and estimated cost. Region repairs retain their contributing calls and the original whole-page reading.

The prompt, numbered-line response contract and image preparation share [method 065’s frozen implementation](../065-gemini-4-argon-low-reading/snapshot/), with [source hashes](../065-gemini-4-argon-low-reading/source-sha256.json). [Configuration](config.json) records Carbon’s model settings and dated pricing. It uses the standard Interactions API tier, a 32,768-token output limit, high-resolution images and store false. The app retains its selected schema assignment model when using this transcription profile.

On 2026-11-11, Google’s documentation lists the model ID gemini-4-carbon, image input, structured output and low, medium and high thinking. Standard input, output including thinking, and cached input cost $2, $10 and $0.10 per million tokens through November 30, 2026, then $4, $20 and $0.20 starting December 1. [Model documentation](https://aistudio.google.com/docs/models/gemini-4-carbon), [pricing](https://aistudio.google.com/docs/pricing#gemini-4-carbon)

Fixture checks cover the normal transcription entry point, request settings, saved profile, cache isolation and the December price transition. Accuracy measurement uses the app’s sample comparison against the scans.
