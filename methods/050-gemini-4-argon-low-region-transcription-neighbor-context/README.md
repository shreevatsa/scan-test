# 050-gemini-4-argon-low-region-transcription-neighbor-context: Gemini 4 Argon with low thinking, method 047's transcription request

This is method 048's `run.py` with the provider `gemini` (`config.json`): the same content is sent to `gemini-4-argon` through the Interactions API, with thinking level `low`, image resolution `high`, the same JSON schema as the response format, and method 017's usage accounting and pricing. `config.json` keeps `image_detail`, which only the content builder reads.

## Run

```sh
cd methods/050-gemini-4-argon-low-region-transcription-neighbor-context
uv run --offline python run.py ../../inputs/hertel-panchatantra-page-152.png --check
uv run --offline python run.py ../../inputs/hertel-panchatantra-page-152.png
```

Scoring uses method 044's `evaluate.py` and `tree.py`. Authentication: `GEMINI_API_KEY` or `GOOGLE_API_KEY`, then the stored `llm` key named `gemini`.

## Recorded results

Hertel 152 and Kale 106 completed. Dutt page 2 (29 regions) was refused with HTTP 400: "The specified schema produces a constraint that has too many states for serving". Methods 051 and 052 change the schema.
