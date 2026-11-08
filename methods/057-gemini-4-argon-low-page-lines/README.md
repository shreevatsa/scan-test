# 057-gemini-4-argon-low-page-lines: a page image read line by line, as a second reader

One Gemini 4 Argon request (low thinking, high image resolution) per page, with the whole page image and a short prompt: every printed line, top to bottom, exactly as printed in Unicode, with superscript note markers in square brackets. The answer is a list of lines, with no regions, units or formatting. It serves as a second reader, against which method 056's converted text layer is checked. It uses method 055's credential and usage code (imported, unchanged) and its prices.

```sh
uv run --offline python methods/057-gemini-4-argon-low-page-lines/run.py inputs/vachana-page-061.json --book "a Kannada book"
```
