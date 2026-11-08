# 056-pdf-text-layer-nudi-to-unicode: a digital PDF's Kannada text from its text layer

For digital PDFs whose Kannada text is set in legacy (pre-Unicode) fonts, such as the vachana PDF (made with PageMaker). No page image is read. Instead:
- **the text layer:** PyMuPDF gives each line with its spans (font, size, flags, text) and its box. Lines on one printed line are joined, and lines are put top to bottom;
- **conversion:** the text of spans in the Kannada fonts (names starting with `TT`) is in a Nudi/Baraha-style ASCII encoding. It is converted to Unicode by Aravinda VK's `knconverter` ([ascii2unicode](https://github.com/aravindavk/ascii2unicode), GPL-3.0), run as a separate program and not copied into this repository;
- **other fonts:** spans in Palatino and Times are English and kept as they are;
- **superscripts** are note markers.

`run.py` writes `text-layer.json`, `text.txt` and `result.json` per page. `compare.py` compares the text with method 057's reading of the rendered page.

The converter is the file `knconverter` of ascii2unicode at commit 6d53b9b (sha256 `94bb8421…`; `run.py` checks it). Pass its path with `--converter`.

```sh
uv run --offline python methods/056-pdf-text-layer-nudi-to-unicode/run.py inputs/vachana-page-061.json --converter PATH/knconverter
uv run --offline python methods/056-pdf-text-layer-nudi-to-unicode/compare.py outputs/surveys/056-pdf-text-layer-nudi-to-unicode/vachana vachana-page-061 …
```
