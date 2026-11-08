# 048-gpt-6.1-terra-low-region-transcription-neighbor-context: GPT-6.1 Terra with low reasoning, method 047's transcription request

This is [method 047](../047-gpt-6.1-terra-none-region-transcription-neighbor-context-runs/README.md)'s transcription request (method 043's regions, cut-outs, neighbor context, the same prompt and schema) sent with reasoning effort `low` instead of `none`.

`run.py` is method 047's, made provider-neutral: `config.json` names the provider (`openai` here), the model and its settings. The same `run.py` is used by methods 049–052. `prompt.py`, `prompt-template.txt`, `pagedoc.py`, `cutouts.py`, `costs.py` and `requirements.txt` are byte copies of method 047's; `pricing.json` is method 042's.

## Run

```sh
cd methods/048-gpt-6.1-terra-low-region-transcription-neighbor-context
uv run --offline python run.py ../../inputs/hertel-panchatantra-page-152.png --check
uv run --offline python run.py ../../inputs/hertel-panchatantra-page-152.png
```

Scoring uses method 044's `evaluate.py` and `tree.py`. Authentication: `OPENAI_API_KEY`, then the stored `llm` key named `openai`.

## Recorded results

Two requests each on Hertel 152, Kale 106 and Dutt page 2 (NOTEBOOK, "Stronger readers"): character error rate 0.61% / 0.87%, 1.37% / 1.56% and 0.49% / 0.52%, against 0.44% / 0.52%, 2.25% / 1.50% and 0.27% / 0.27% without reasoning. $0.147 in all.
