# 062-pdf-typography-units-styles-font-roles: method 061, with bold and italic from the font roles

Method 061, with one change from the user's review of page 7 (2026-11-07). The bold and italic spans in running text (body lines and footnotes) now come from the profile's `font_roles`, the table the styles already use. `span_styles` still takes precedence where it names a font.

Method 061 read them from `span_styles` alone, which lacks two bold fonts:
- TT1546O00: a title in quotation marks on page 7, a sign-off on page 5 and a name on page 8;
- TT14A9O00: the names in the signatures on pages 28, 110, 171 and 220.

Those 9 spans are the only difference from method 061's `book-006`; the style sheet is the same.

```sh
uv run --offline python methods/062-pdf-typography-units-styles-font-roles/run.py --book vachana --pages inputs/pages-vachana-book.json --text-run book-002 --run book-001
```

Run `book-001` is packaged as `outputs/books/vachana`, with its `style.json`; method 061's folder is `outputs/books/vachana-061`.
