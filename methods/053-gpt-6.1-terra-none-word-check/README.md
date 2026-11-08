# 053-gpt-6.1-terra-none-word-check: GPT-6.1 Terra without reasoning, a check of the words Tesseract reads differently

This method checks a transcription (by default method 046's first-request page document) against a second, differently biased reader. It was built to test whether a check call can catch the model's "familiar form" errors, such as दौर्योधने → दुर्योधने, which repeated requests cannot.

## Steps

1. Each line piece whose text has Devanagari is cut out with its polygons and read by Tesseract 5.5.1 (`script/Devanagari`, `--psm 7`, TSV with word boxes).
2. The model's words and Tesseract's are aligned with difflib, with dandas as words and note markers removed. Each stretch where they differ and the model has words becomes an item:
   - the model's reading (A) and Tesseract's (B);
   - a box from Tesseract's word boxes, or from the gap between its neighbors when Tesseract has nothing there.
3. One request per page (`prompt.txt`, GPT-6.1 Terra, reasoning none, strict JSON Schema) shows each item as an enlarged crop of the stretch and the whole line with the stretch boxed in red, with A and B. It asks for the printed letters one by one (`spelling`), the exact printed text (`text`) and a verdict (A, B, neither or unclear).
4. Each item's stretch in the line is replaced by the returned text, except where the verdict is unclear. `corrected-lines.json` holds every checked line before and after; `items/` holds the images.

`evaluate_check.py` scores the corrected lines against the transcription references. `rescore_strip_punctuation.py` re-applies the saved answers with any punctuation outside the stretch removed, without new requests.

## Run

```sh
cd methods/053-gpt-6.1-terra-none-word-check
uv run --offline python run.py ../../inputs/hertel-panchatantra-page-152.png --check
uv run --offline python run.py ../../inputs/hertel-panchatantra-page-152.png
uv run --offline python evaluate_check.py ../../outputs/surveys/053-gpt-6.1-terra-none-word-check/check-evaluation.json ../../outputs/hertel-panchatantra-page-152/053-gpt-6.1-terra-none-word-check
```

## Recorded results

On method 046's transcriptions of Hertel 152, Kale 106 and Dutt page 2 (NOTEBOOK, "A check call on the words Tesseract disputes"):
- **items:** 144, $0.063 for the three requests;
- **as run:** 51 → 68 character edits. The answers bring along the danda next to the stretch, and Tesseract's zero-width non-joiners make false items;
- **with the outside punctuation removed:** 51 → 26 edits, 12 lines fixed and 3 broken, and five of the six "familiar form" errors fixed.

## Limitations

- The two mechanical faults above are not fixed in this method: answers keep outside punctuation, and Tesseract's zero-width non-joiners are not removed before alignment.
- The check is by the same model that made the errors, and it still writes a familiar form in places (छ्रियम् → श्रियम्).
