# 060-pdf-typography-units-figures-columns: method 059 with the fixes from the user's review

Builds schema 0.2 page documents for a digital PDF from method 058's converted text layer, as method 059 does, with no model call. The changes come from the user's review of the vachana book's front matter (2026-11-06) and from the pages found the same way across the book.

**Text that is not printed** is left out:
- **no ink:** a span with no ink under it in the rendered page, as with white text ("02" after "Pages : 252") or text under a white box (the front matter's roman page numbers);
- **covered:** a span that a fill or image drawn later covers, from the PDF's drawing order (`get_bboxlog` and `get_texttrace`). An example is the running header under the grey ornament box of a chapter's first page. Such a page takes its label from the hidden header;
- **printed twice:** a line printed twice in the same place is read once.

**Figures:**
- Each image the PDF draws (and that shows ink) is a `figure` unit with one region and no line pieces. It stands in its place among the lines.
- A known image gets a label from the profile (`figure_labels`, by the sha256 of its stream). The labelled ones are the ॐ of the title page, the publisher's emblem and the peacock of the volume title pages. Ornaments have no label.

**Columns:** a run of at least two lines is split if each line has one gap of at least `column_gap_min` (4) times the font size, and the right parts:
- align at the left, the right or the center, within `column_align` (4 pt);
- are not just page numbers, so contents entries are not split.

The left column comes first, then the right, each its own unit. A line just above or below the run that lies within one column joins that column.

**Blocks:**
- **gaps:** a vertical gap of more than `block_gap` (0.9) times the font size ends a heading or a paragraph;
- **line breaks:** a heading's lines, column pieces, and lines that stop more than `short_line` (20 pt) short of the page's right edge end with a line break. This applies to imprints, addresses and signatures;
- **margins:** on a page with no numbered sayings, the left margin is the page's own: the leftmost x at which two body lines start. The right edge is the page's own too, if it is in the right quarter of the text block. This covers pages set narrower than the rest (front matter page iv, page 50).

**Headings, verses and invocations:**
- **headings:** a line in a heading font below the heading size is a heading only if centered;
- **verses:** a line in such a font is a verse if it ends with a danda. A run of lines in one heading or verse font and size, starting at one x, is all verse if any of its lines ends with a danda, since a verse's odd lines may end without one (as in a preface's opening verses);
- **invocations:** lines and figures before a chapter's start on its page belong to that chapter, if they are only centered headings, verse lines and figures. Examples are an invocation above a preface's title and the ornament above a chapter's number. A chapter's number and title stay one heading.

**Text-layer repairs:**
- **lines on one baseline:** method 058's lines that stand on one baseline are one line, their spans in order of x. Method 058 keeps a word apart when it falls in a wide gap of a justified line, and puts it before the line;
- **superscripts:** a superscript that is not a note number, as the "nd" of 2nd, is text with a `superscript` span;
- **small digits:** digits in a span at most 0.7 times the line's size are a note marker even when the PDF does not flag them;
- **spaces at markers:** a marker inside a word does not put a space into it (ಶತಾಯು³ಗಳಾದರೂ);
- **footnote signs:** a footnote may start with * (or † ‡);
- **symbols:** per-font text replacements come from the profile (`font_text`: the rupee sign in TT153AO00).

**Book-specific choices** are in `profile-vachana.json`: method 059's profile, with the settings named above added.

```sh
uv run --offline python methods/060-pdf-typography-units-figures-columns/run.py --book vachana --pages inputs/pages-vachana-book.json --text-run book-002 --run book-008
```

**Runs:**
- **`book-001` to `book-007`:** the development runs, each kept;
- **`book-008`:** the final run, packaged as `outputs/books/vachana`.

Each page document's `source` lists what was left out (`text_not_printed`), the lines merged (`lines_merged_on_one_baseline`), small digits read as markers, a page's own margin and a label from a hidden header. The survey is `outputs/surveys/060-…/<run>/summary.json`.
