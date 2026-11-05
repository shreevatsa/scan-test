# Input images

## kale-1913-page-017

`kale-1913-page-017.png` is the unannotated RGB rendering of PDF page 17 of 252 in the Kale (1913) scan, at 300 dpi. Its dimensions are 1407 × 2135 pixels.

The source is `Kale-1913-pp21-272.pdf` in the project root, SHA-256 `ccabe9850493a8e5d6ecd61660407933f757481cb892985b007e6ff222d9f3b0`. The image was originally rendered from `Kale-vision-handoff/input/`, before the PDF moved to the project root; the checksum is unchanged. The render uses PyMuPDF 1.26.6, an RGB colorspace and no alpha channel. `kale-1913-page-017.json` records the source and image checksums and rendering parameters.

To reproduce the image with the existing environment, run from the project root. On 2026-11-03 this command reproduced the saved PNG byte for byte, SHA-256 `cfacda5b09ed6cd333dc50907c097c9cded8fb976f9549c925b419980c9be10d`.

```sh
uv run --offline python -c 'import fitz; doc = fitz.open("Kale-1913-pp21-272.pdf"); doc[16].get_pixmap(matrix=fitz.Matrix(300/72, 300/72), colorspace=fitz.csRGB, alpha=False).save("inputs/kale-1913-page-017.png")'
```

## kale-1913-page-097

`kale-1913-page-097.png` is the unannotated RGB rendering of PDF page 97 of 252 in the Kale (1913) scan, at 300 dpi. Its dimensions are 1374 × 2114 pixels. The page has two four-line verses, commentary, one short verse lead-in, and six numbered footnotes, with the sixth printed on a second line.

The source is `Kale-1913-pp21-272.pdf` in the project root, SHA-256 `ccabe9850493a8e5d6ecd61660407933f757481cb892985b007e6ff222d9f3b0`. The render uses PyMuPDF 1.26.6, RGB colorspace and no alpha channel. `kale-1913-page-097.json` records source and image checksums, page numbering and render settings. The handoff's corresponding 660 × 1015 image identifies the sample page; this test uses a fresh 300 dpi render of the original PDF.

To reproduce the image with the existing environment, run from the project root:

```sh
uv run --offline python -c 'import fitz; doc = fitz.open("Kale-1913-pp21-272.pdf"); doc[96].get_pixmap(matrix=fitz.Matrix(300/72, 300/72), colorspace=fitz.csRGB, alpha=False).save("inputs/kale-1913-page-097.png")'
```

## kale-1913-page-113

`kale-1913-page-113.png` is the unannotated RGB rendering of PDF page 113 of 252 in the Kale (1913) scan, at 300 dpi, 1370 × 2118 pixels. It contains three four-line verses, commentary passages and six numbered footnotes.

The source is `Kale-1913-pp21-272.pdf` in the project root, SHA-256 `ccabe9850493a8e5d6ecd61660407933f757481cb892985b007e6ff222d9f3b0`. Rendering uses PyMuPDF 1.26.6, RGB colorspace and no alpha channel. `kale-1913-page-113.json` records the source, image checksum, page numbering and render settings. The handoff's corresponding 658 × 1017 image identifies this sample.

To reproduce it from the project root with the existing environment:

```sh
uv run --offline python -c 'import fitz; doc = fitz.open("Kale-1913-pp21-272.pdf"); doc[112].get_pixmap(matrix=fitz.Matrix(300/72, 300/72), colorspace=fitz.csRGB, alpha=False).save("inputs/kale-1913-page-113.png")'
```

## Page lists

Besides the three Kale pages above, inputs are rendered from page lists by `render_pages.py`, which writes each PNG with a JSON provenance record and skips pages already rendered:
- `pages.json`: the 43 cross-book test pages (default list): `uv run --offline python inputs/render_pages.py`.
- `pages-fresh.json`: 54 held-out pages from ten books, chosen by rule per book: `uv run --offline python inputs/render_pages.py inputs/pages-fresh.json`.
- `pages-runs.json`: 28 pages in seven runs of four consecutive pages, for the continuation test (methods 040 and 041); each page records its `run`: `uv run --offline python inputs/render_pages.py inputs/pages-runs.json`.
