# Input images

## kale-1913-page-017

`kale-1913-page-017.png` is the unannotated RGB rendering of PDF page 17 of 252 in the Kale (1913) scan, at 300 dpi. Its dimensions are 1407 × 2135 pixels.

The source PDF is `Kale-vision-handoff/input/Kale-1913-pp21-272.pdf`, SHA-256 `ccabe9850493a8e5d6ecd61660407933f757481cb892985b007e6ff222d9f3b0`. The render uses PyMuPDF 1.26.6, an RGB colorspace and no alpha channel. `kale-1913-page-017.json` records the source and image checksums and rendering parameters.

To reproduce the image, run these commands from the project root:

```sh
.venv/bin/python -m pip install PyMuPDF==1.26.6
.venv/bin/python -c 'import fitz; doc = fitz.open("Kale-vision-handoff/input/Kale-1913-pp21-272.pdf"); doc[16].get_pixmap(matrix=fitz.Matrix(300/72, 300/72), colorspace=fitz.csRGB, alpha=False).save("inputs/kale-1913-page-017.png")'
```
