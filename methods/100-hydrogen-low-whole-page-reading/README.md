# 100-hydrogen-low-whole-page-reading

The Rāmāyaṇa-mañjarī read again, every page, after method 099 chose the reader: **Gemini 4 Hydrogen, low thinking, one whole page image per call** (400 dpi grey, `mediaResolution` high, Vertex AI on project `sanskritmetres`). Unlike the app's reading request (an overview plus every region crop as its own image, about 18,000–56,000 image tokens a page), the request holds one image (about 1,100 tokens) and lists the page's regions in the prompt: id, type, number of line pieces, and box as [ymin, xmin, ymax, xmax] in thousandths. The answer gives each region's lines; they go onto its line pieces in order, and a region whose count differs keeps its old text and is reported. Footnote markers written `[n]` become zero-width note-marker spans. [read_book.mjs](read_book.mjs) caches each call, stops at a spending limit, and enters each call in the book's ledger (`work/reader-lab/ledger.json`, profile `hydrogen-low-page`) with its record under `work/reader-calls/`.

Before reading, `webapp/tools/chaya_rescale.mjs` redrew the book's pages at 300 dpi (617 × 1048 → about 1389 × 2360), scaling every outline and box, since the book had been made from the scan's 133 ppi background layer (method 099).

## Result, 2026-11-19

- 519 pages, 519 calls, **$9.86** (1.9¢ a page; Hydrogen $1.50/$7.50 per million, about 950 thinking tokens a page). 57 calls failed on the first pass (an expired access token, three rate limits) and were made again; cached calls were not paid twice.
- 8,704 regions; 8,700 took the new text, 4 kept the old (line counts differ: PDF 127, 193, 229, 245).
- 627 footnote markers written, against about 135 in any form in the old reading.

Then, all by rule with no model ([outputs](../../outputs/surveys/100-hydrogen-low-whole-page-reading/)):

1. `chaya_baseline.mjs`: units back to the provisional grouping.
2. `chaya_verse_numbers.mjs`: verse numbers by sequence. 102 corrected (stretches read with ९ or ६ for ५, as PDF 60's ९५४–९६५ for ५५४–५६५, and PDF 137–141's 943–992); 8 restarts (where parts begin); 10 breaks left, 9 of them a number skipped by one and one misread left alone (PDF 242).
3. The same on the closing lines (`--type=section_closing`): 5 episode numbers corrected, 7 restarts, 3 breaks left (a repeated ७ and ४१, and ॥ १४ ॥ followed by ॥ १६ ॥).
4. `chaya_sections.mjs`: the traditional seven kāṇḍas, 202 episodes, each episode named and numbered from its closing line. Bāla ends after "इत्ययोध्याप्रत्यागमनम् ॥ १४ ॥" (PDF 66): inferred from content, since the book prints a Bālakāṇḍa heading at PDF 15 and an Ayodhyākāṇḍa closing at 94 and nothing between. The "किष्किन्धापर्व" closing (PDF 202) and the "संपूर्णं युद्धकाण्डम्" closing (407) stand inside their kāṇḍas; PDF 408–422, ten separately numbered episodes ending with Rāma's coronation, belong to the Yuddhakāṇḍa, and the Uttarakāṇḍa starts at its heading (423). Each part records whether its start and end are printed or inferred.
   `--part-closing='कथासारे' --part-heading='काण्ड' --part-after='योध्याप्रत्यागमनम्' --division-closing='किष्किन्धापर्व|संपूर्णं युद्धकाण्डम्' --part-labels='बालकाण्डम्,अयोध्याकाण्डम्,अरण्यकाण्डम्,किष्किन्धाकाण्डम्,सुन्दरकाण्डम्,युद्धकाण्डम्,उत्तरकाण्डम्'`
5. `chaya_notes.mjs`: 623 of 711 notes linked to their markers (191 before); 88 notes without a marker, 4 markers without a note.

6. `chaya_verse_groups.mjs` (run after step 3, before the sections): the four verse groups — (तिलकम्) after ३६०–३६२ (PDF 44) and ४५०–४५२ (51), (युगलकम्) after ४६३–४६४ (52) and ४७२–४७३ (53) — each checked by its meaning (the first verses of each group have no main verb of their own). Two markers had been read as a verse's last line and were split off; two had been put after the following verse, or after an episode's closing, in reading order.
7. [front_matter.mjs](front_matter.mjs), by hand: each of the four title pages (PDF 3, 7, 8, 9) one `title_page` unit (a new container, set centred by the reader) holding its statements — series, title, author, editors, imprint — each one unit of its printed lines; saved as corrections (`edits/`). The sections tool also no longer wraps the stretch after a part's last episode closing (PDF 94, 304–305) as an unnamed episode.

8. PDF 242–243 are a second scan of PDF 240–241 (printed pages 226–227, verses ४७९–५०३ again): dimmed ([dim_pages.mjs](dim_pages.mjs)), so the book reads them once.
9. `chaya_page_labels.mjs`: the page labels read again from the new page-number text (61 had kept the old reading's), then 25 corrected by sequence (such as PDF 164–173, read 190, 161, …, 169 for 150–159); the printed contents' page numbers confirm them (रामप्रलापः, १५४, on PDF 168).

[pipeline.sh](pipeline.sh) runs steps 2–9 from the reading. Contents lines: all 200 linked, 195 to their episode by name (the printed page only choosing among names nearly as close), 5 "…हननम्" entries to their page (their episodes close as "…वधः").

The app opens the result with no page failing its checks and no page break where units do not join. `webapp/tools/chaya_html.mjs` writes it as one web page in the Book view's layout.
