# 059-pdf-typography-units: page documents for a digital PDF from its typography

Builds schema 0.2 page documents for a digital PDF from method 058's converted text layer. It uses no model call: lines become units of the book's type list by:
- font, size and indent;
- the PDF's footnote rules;
- footnote numbers, for linking markers.

**Units:**
- **running header:** the page's label comes from its digits;
- **chapters:** a chapter number or a large heading starts one;
- **numbered sayings:** with a hanging indent;
- **paragraphs:** an indented first line;
- **verses:** lines in the verse fonts, up to ॥. A verse quoted inside a paragraph or saying is its child;
- **footnotes:** below the rule;
- **contents entries:** in a chapter headed as a table of contents.

**Across pages:** open ends come from the neighboring pages. Line ends (a word running on without a hyphen) are judged from the book's vocabulary. Formatting comes from fonts used inside running text (bold or italic).

**Book-specific choices** are in `profile-<book_id>.json`. Only `profile-vachana.json` exists, written from the vachana PDF's fonts and positions.

```sh
uv run --offline python methods/059-pdf-typography-units/run.py --book vachana --pages inputs/pages-vachana-book.json --text-run book-002 --run book-002
```
