# 023-gpt-6-luna-high-footnotes: GPT-6 Luna high reasoning, individual footnotes

This method sends the unchanged raw PNG to `gpt-6-luna` through the OpenAI Responses API. It uses `reasoning.effort=high`, image detail `original`, strict JSON Schema output, a maximum of 16,384 output tokens including reasoning and `store=false`. It makes one synchronous non-streaming request without automatic retries.

The prompt is copied byte-for-byte from method 013: it explicitly requests one region per numbered footnote, including its marker and text, even when notes share a printed line. The original x/y 0–1000 schema is preserved from method 005. Returned coordinates are converted to original-image pixels by x × width / 1000 and y × height / 1000. Original values remain in the result; any edge clamping is recorded explicitly. The image is sent as the exact original PNG bytes, without local resizing.

## Run

```sh
uv run --offline python methods/023-gpt-6-luna-high-footnotes/run.py inputs/kale-1913-page-017.png --check
uv run --offline python methods/023-gpt-6-luna-high-footnotes/run.py inputs/kale-1913-page-017.png
```

For a repeat request, use a fresh `--output-dir`, for example `outputs/kale-1913-page-017/023-gpt-6-luna-high-footnotes/run-002`. Existing output is protected against overwriting. Authentication checks `OPENAI_API_KEY`, then the locally stored `llm` key named `openai`.

## Artifacts and cost

The output directory preserves the exact request, prompt, raw response, model output text, parsed JSON, original and derived coordinates, source hashes, selected response headers, token usage, timing, estimated cost, overlay and measurement mask. No authentication secret is saved. Display and foreground measurement helpers are copied from the existing comparison methods.

OpenAI output tokens already include reasoning. Input usage is split into ordinary tokens, cache reads and cache writes; each category is priced once. The request retains the documented default 30-minute cache lifetime. The per-million-token USD rates checked on 2026-11-03 are ordinary input 0.1, output including reasoning 0.5, cache read 0.01, and cache write 0.125. The actual usage categories and arithmetic are saved in `regions.json`.

API wall time ends after reading the response body and excludes credential lookup, artifact writes and rendering. Blue marks kept boxes, purple excluded page furniture and red uncovered measured ink; numbers show returned reading order.

Sources: [official OpenAI model documentation](https://developers.openai.com/api/docs/models/gpt-6-luna), [image-detail guidance](https://developers.openai.com/api/docs/guides/images-vision), and [cache accounting](https://developers.openai.com/api/docs/guides/prompt-caching).

## Recorded run

Input: `kale-1913-page-017`, 1407 × 2135 pixels, unchanged raw PNG. Started 2026-11-03 15:23:37 UTC. Requested and returned model `gpt-6-luna`.

| Measurement | Result |
| --- | --- |
| Output boxes | 14 |
| Boxes marked keep=true | 12 |
| Regions marked uncertain | 0 |
| Footnote regions | 6 |
| API wall time | 23.31 s |
| Input tokens | 3,932 |
| Ordinary input tokens | 3 |
| Cache-write input tokens, default 30-minute lifetime | 3,929 |
| Cache-read input tokens | 0 |
| Output tokens, including reasoning | 2,646 |
| Reasoning tokens | 2,185 |
| Output tokens excluding reasoning | 461 |
| Coordinate clamping adjustments | 0 |
| Estimated paid-tier cost | $0.001814425 |

The six footnote boxes lie below the printed footnote line, over blank space. The final commentary box includes the footnote line and separator rule. The second verse box omits its first line and includes the first line of its commentary; the omitted verse line is included in the preceding lead-in box.

The estimated cost uses $0.1 per million ordinary input tokens, $0.125 per million default 30-minute cache-write tokens and $0.5 per million output tokens including reasoning: (3 × $0.1 + 3,929 × $0.125 + 2,646 × $0.5) / 1,000,000 = $0.001814425. Rates checked on 2026-11-03.

![Recorded output](../../outputs/kale-1913-page-017/023-gpt-6-luna-high-footnotes/overlay.png)
