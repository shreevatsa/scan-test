# Input images

## kale-1913-page-017

`kale-1913-page-017.png` is the unannotated RGB rendering of PDF page 17 of 252 in the Kale (1913) scan, at 300 dpi. Its dimensions are 1407 × 2135 pixels.

The source PDF is `Kale-vision-handoff/input/Kale-1913-pp21-272.pdf`, SHA-256 `ccabe9850493a8e5d6ecd61660407933f757481cb892985b007e6ff222d9f3b0`. The render uses PyMuPDF 1.26.6, an RGB colorspace and no alpha channel. `kale-1913-page-017.json` records the source and image checksums and rendering parameters.

To reproduce the image, run these commands from the project root:

```sh
.venv/bin/python -m pip install PyMuPDF==1.26.6
.venv/bin/python -c 'import fitz; doc = fitz.open("Kale-vision-handoff/input/Kale-1913-pp21-272.pdf"); doc[16].get_pixmap(matrix=fitz.Matrix(300/72, 300/72), colorspace=fitz.csRGB, alpha=False).save("inputs/kale-1913-page-017.png")'
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
