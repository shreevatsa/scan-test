# 049-gpt-6-astra-low-region-transcription-neighbor-context: GPT-6 Astra with low reasoning, method 047's transcription request

This is method 048 with the model `gpt-6-astra` and reasoning effort `low` (`config.json`), and method 020's Astra pricing. Every other file is a byte copy of method 048's.

## Run

```sh
cd methods/049-gpt-6-astra-low-region-transcription-neighbor-context
uv run --offline python run.py ../../inputs/hertel-panchatantra-page-152.png --check
uv run --offline python run.py ../../inputs/hertel-panchatantra-page-152.png
```

Scoring uses method 044's `evaluate.py` and `tree.py`. Authentication: `OPENAI_API_KEY`, then the stored `llm` key named `openai`.

## Recorded results

Two requests each on the three referenced pages (NOTEBOOK, "Stronger readers"): character error rate 0.00% / 0.35% (Hertel 152), 1.44% / 1.25% (Kale 106), 0.24% / 0.21% (Dutt page 2). The same word substitutions as Terra on Kale and Dutt. $1.455 in all.
