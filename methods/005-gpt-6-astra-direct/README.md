# 005-gpt-6-astra-direct: GPT-6 Astra direct regions

This method sends one raw page image and a region-grouping prompt to the OpenAI Responses API. GPT-6 Astra returns normalized boxes, region types, keep flags, content reading order and uncertainty flags.

## Method

1. Read the input PNG without resizing it locally.
2. Send its exact bytes as an inline image with `detail: original`, together with the text in `prompt.txt`, in one fresh user request.
3. Use `gpt-6-astra`, high reasoning effort and strict structured JSON output defined by `response-schema.json`.
4. Preserve the exact request body, HTTP response body and model output text before parsing the regions.
5. Validate the returned fields and rectangles. Convert x-coordinates by multiplying by image width / 1000, and y-coordinates by image height / 1000.
6. Draw the resulting rectangles and compute foreground diagnostics using the same mask as methods 1–4.

The prompt asks for complete multi-line verses, separate commentary, lead-ins and footnotes, plus running headers and page numbers marked `keep=false`. It is copied verbatim from the original proposed region prompt. The complete prompt and schema are included in this directory.

| Setting | Value |
| --- | --- |
| Requested model | gpt-6-astra |
| API endpoint | https://api.openai.com/v1/responses |
| Reasoning effort | high |
| Image detail | original |
| Maximum output tokens, including reasoning | 16,384 |
| Structured output | Strict JSON schema |
| Response storage parameter | store=false |
| Input messages | One user message containing the prompt and raw image |
| Automatic retries | 0 |

The request contains the raw page and prompt. Returned normalized coordinates are converted arithmetically into image pixels. Raw coordinates, flags and reading order are preserved in the output artifacts.

## Run

From the project root, use the existing Python 3.12 environment:

```sh
.venv/bin/python -m pip install -r methods/005-gpt-6-astra-direct/requirements.txt
.venv/bin/python methods/005-gpt-6-astra-direct/run.py inputs/kale-1913-page-017.png --check
.venv/bin/python methods/005-gpt-6-astra-direct/run.py inputs/kale-1913-page-017.png
```

Authentication uses `OPENAI_API_KEY` when set, otherwise the locally stored `llm` key named `openai`. An alternative stored key name can be selected with `--llm-key-name`. Credentials are used only in the Authorization header and are excluded from saved request artifacts.

For a repeat request, choose a fresh output directory:

```sh
.venv/bin/python methods/005-gpt-6-astra-direct/run.py inputs/kale-1913-page-017.png --output-dir outputs/kale-1913-page-017/005-gpt-6-astra-direct/run-002
```

Existing nonempty output directories are preserved. Each invocation makes one request; API errors, incomplete responses and validation failures are recorded in that attempt's directory.

## Output

The output directory is `outputs/<input_id>/005-gpt-6-astra-direct/`.

- `request.json`: exact API request body, including the encoded source image, prompt, schema and generation settings.
- `prompt.txt`: the exact prompt for that request.
- `response.json`: raw API response body.
- `model-output.txt` and `parsed-regions.json`: the model's output text and its parsed JSON.
- `regions.json`: original normalized boxes, derived pixel boxes, returned model ID, response/request IDs, token usage, API wall time, settings, checksums, validation warnings and measurements.
- `run.json`: attempt status and request metadata, including any error.
- `overlay.png`: returned boxes over the original page. Blue marks kept regions; purple marks excluded regions; red marks uncovered measured ink. Content numbers show returned reading order; H and PN mark running headers and page numbers.
- `ink-mask.png`: foreground pixels used for measurement, shown in white.

Primary coverage diagnostics include every returned box, matching the earlier methods' counting convention. Separate `kept_regions_metrics` use only boxes marked `keep=true`. The mask uses grayscale intensity below 175, the same margin exclusions and component/rule filtering as the preceding methods. Pixel rectangles are rasterized with top-left coordinates rounded down and bottom-right coordinates rounded up.

## Interface references

The [model documentation](https://developers.openai.com/api/docs/models/gpt-6-astra), [image-input documentation](https://developers.openai.com/api/docs/guides/images-vision?api-mode=responses), and [structured-output documentation](https://developers.openai.com/api/docs/guides/structured-outputs) were checked on 2026-11-02. The exact returned model name and available usage data are saved per request.

## Inspect uncovered pixels

For the recorded page-17 result, generate a diagnostic showing the exact uncovered measurement-mask pixels and enlarged context:

```sh
.venv/bin/python methods/005-gpt-6-astra-direct/inspect_uncovered.py outputs/kale-1913-page-017/005-gpt-6-astra-direct/regions.json
```

This saves `uncovered-highlight.png`, `uncovered-mask.png` and `uncovered-details.json` beside the result. The details file records component coordinates, pixel counts, view rectangles and source/script checksums. The figure uses faded scan context, exact red uncovered pixels, teal area markers and enlarged views of the small components.
