# 058-pdf-text-layer-kannada-converter: a digital PDF's Kannada text from its text layer, with our own converter

Method 056 with its own converter, `nudi.py`, in place of the GPL tool knconverter. It was written for this repository from the PDF's own glyphs and uses no outside code.

**How the converter was made:**
- every code of the Kannada fonts was drawn with the PDF's embedded font in a labelled grid, and each glyph was identified;
- the tables were then corrected against an independent reading of rendered pages (method 057).

**The encoding:** the bytes are glyph pieces in drawing order:
- a consonant's body or its i form;
- vowel-sign pieces;
- subjoined consonants;
- the repha;
- an aspiration stroke;
- ಮ and ಯ drawn with a hook;
- spacer glyphs (`ö`, `÷`) with no letter of their own.

The converter collects each syllable and writes it in Unicode order: repha, consonant, subjoined consonants, vowel sign, anusvara or visarga. Per-font punctuation: `|` → ।, `||` → ॥, quotation marks as printed.

`run.py` also joins spans that the PDF sets apart without a space. `compare.py` is method 056's comparison, reading this method's run (environment variable RUN).

```sh
uv run --offline python methods/058-pdf-text-layer-kannada-converter/run.py inputs/vachana-page-061.json --run book-002
RUN=book-002 uv run --offline python methods/058-pdf-text-layer-kannada-converter/compare.py OUT_DIR vachana-page-061 …
```
