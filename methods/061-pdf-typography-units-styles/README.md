# 061-pdf-typography-units-styles: method 060, with ornaments as furniture and the book's styles

Builds schema 0.3 page documents and a style sheet for a digital PDF from method 058's converted text layer, with no model call. The units are found as in method 060, with three changes requested by the user or found on review (2026-11-06).

**Ornaments:**
- an image with no label in the profile is page furniture: an `ornament` region with no unit, kept on the page but outside the reading order;
- labelled images (the ॐ, the emblem and the peacocks) stay figures;
- profile setting: `unlabelled_images_are_ornaments`.

**Sayings at the paragraph indent:**
- a saying's number may stand up to 18 pt from the margin (`item_number_max_offset`, which was 15);
- chapter 2 (pages 31–35) sets its 31 sayings paragraph-style, with the number at the 17 pt indent and the following lines at the margin. Page 29's first saying has its number at 72.5 pt. Methods 059 and 060 read all 32 as paragraphs.

**Styles (schema 0.3),** measured from the PDF and kept apart from the structure:
- **fonts:** each line's font role (`body`, `display`, `latin`), weight and italic come from its main font (profile: `font_roles`), and its size from the PDF;
- **per unit:**
  - alignment: justified, left, centered or right. A column is judged within its own edges; a heading is judged line by line, since a chapter's number and title stand apart;
  - leading: the median from baseline to baseline;
  - left margin and first-line indent, from the first region's lines. These are skipped for a unit continued from the page before;
  - space above: the gap to the nearest line or figure above in its flow that overlaps it, less the normal line gap (the book's median, 6 pt);
- **the style sheet** (`outputs/surveys/061-…/<run>/style.json`, format `style`):
  - the base: the most common font, size and weight over all text, the median leading, and justified text;
  - for each type, where it differs from the base: the most common font, size and alignment, and the median leading, margin, indent and space above over its units;
  - the page's size and text box;
  - the font roles' CSS families (profile: `style_fonts`);
- **units and line pieces** record only where they differ from their type. Margin and indent differences under 5 pt are ignored; this absorbs the 4 pt difference between volume 1's sayings and the others'. A column's units share a `row`, with their `width` as a share of the text width, and the space above of the leftmost.

```sh
uv run --offline python methods/061-pdf-typography-units-styles/run.py --book vachana --pages inputs/pages-vachana-book.json --text-run book-002 --run book-006
uv run --offline python webapp/tools/make_book_folder.py outputs/books/vachana --types schema/types/vachana.json \
  --style outputs/surveys/061-pdf-typography-units-styles/book-006/style.json outputs/vachana-page-*/061-pdf-typography-units-styles/book-006
```

**Runs:**
- **`book-001` to `book-005`:** the development runs, each kept;
- **`book-006`:** the final run, packaged as `outputs/books/vachana`.
