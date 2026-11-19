# 099-full-page-reader-comparison-400ppi

Which reader to use for the Rāmāyaṇa-mañjarī (archive.org `ramayanamamjari00ksemuoft`) once its pages are read at the scan's resolution. The book was made with method 097's regions and Flash-Lite readings on 617 × 1048 px page images: `pageInfo` (`webapp/js/pipeline/pdf.js`) took the first of two images covering the page, the 133 ppi colour background, not the 400 ppi black-and-white text layer. `scanImage` now takes the sharpest.

**Request.** One whole page image per call, rendered with `pdftoppm -r 400 -gray` (1852 × 3146), and one prompt for every Gemini reader ([run.mjs](run.mjs)): the running header, every line of the text above the footnotes, then the footnotes, as JSON; footnote markers in square brackets where printed. Vertex AI `generateContent` (project `sanskritmetres`, location global), `mediaResolution` high. Cloud Vision Document Text Detection on the same image ([vision_call.mjs](vision_call.mjs)), language hints `sa`, `hi`. The app's current reading (Flash-Lite on the 617-px pages, per region crop, with the app's own prompt) is included as it is ([export_app.mjs](export_app.mjs)). Not the app's request: whole pages, not overview plus region crops, so line pieces are not read one by one.

**Pages.** PDF pages 25, 30, 60, 100, 150, 200, 260, 320, 380, 440, 500 (16 footnotes).

**Scoring** ([score.py](score.py)): words (Devanagari letters only, so digits and dandas are left out) of each reading aligned to Carbon's with difflib; at each word, a word read by at least 4 of the 7 readings is the majority; a reader's count is its words that differ from it. Markers: those written, where they attach (mapped to Carbon's words), against the footnotes on the page.

## Result, 2026-11-19

| Reader | Words differing from the majority (of 1,072) | Markers written (16 notes) | Per page | Book (519 pages) | Median time |
|---|---|---|---|---|---|
| App: Flash-Lite, 133 ppi, region crops | 106 (9.9%) | 0 | about 1¢ (ledger) | $5.30 (paid) | |
| Cloud Vision document text | 47 (4.4%) | 0 | 0.15¢ | $0.78 | 2 s |
| Gemini 3.5 Flash-Lite, minimal | 137 (12.8%) | 6 | 0.20¢ | $1.04 | 4 s |
| Gemini 3.8 Flash, low | 47 (4.4%) | 12 | 0.34¢ | $1.76 | 8 s |
| Gemini 4 Argon, low | 6 (0.6%) | 17 (one stray on page 60) | 0.93¢ | $4.81 | 13 s |
| Gemini 4 Carbon, low | 4 (0.4%) | 16, all in place | 0.97¢ | $5.05 | 81 s (one call timed out twice at 300 s) |
| Gemini 4 Neon, low | 4 (0.4%) | 16, all in place | 3.37¢ | $17.50 | 18 s |
| Gemini 4 Hydrogen, low (added after; scored against the same majority, without a vote: [hscore.py](hscore.py)) | 5 (0.5%) | 16, the same as Carbon's | 1.45¢ | $7.52 | 15 s |

Costs are from the calls' token counts at the app's rates (Argon and Carbon $2/$10 per million until 2026-12-01, then $4/$20; Neon $3/$15; Hydrogen $1.50/$7.50, as published reports give them on 2026-11-19). Every reader ran at `thinkingLevel` low except Flash-Lite (minimal). Neon reports about 1,300 thinking tokens a page and Hydrogen about 950; Argon and Carbon report none. **Is Carbon's figure real?** A probe ([probe.mjs](probe.mjs), `includeThoughts`) shows Carbon's low response carries a thought signature but no thought text and no thinking tokens, and its total is prompt plus output; the same page at `thinkingLevel` high reports 24,137 thinking tokens (about 24¢). So the usage does report thinking when there is some, and Carbon at low barely thinks; its slowness varies (9 s and 98 s for the same tokens), which looks like queueing. The project's billing report by SKU is the final check.

**Reading the differences.** Argon, Carbon and Neon form most majorities, so the majority flatters them. Read for sense, several of their "errors" are right where the majority is wrong (Carbon's जज्वाले and पुष्पच्छत्र); each still has a few real errors (Neon कौशिकेनासः, Carbon दुर्दृत्ते, दुर्महः). Cloud Vision's errors are regular: स्व read as ख (खामि), doubled vowel signs (इवाबभैौ), words split; it never writes a marker, even on a 3× enlargement, and its character boxes are spread evenly over each word, so they do not show a raised numeral either. Flash-Lite's text is worse on whole pages than the app's region crops.

**Markers.** Checked on the scan: page 25's ¹ ² ³ and page 60's ¹ ² (over पाणौ and पाणिं) are where Carbon and Neon put them; Argon's page 60 has a stray [१] and its [२] on the wrong word. A note's quoted reading is not a safe guide to its marker's word: page 60's note २ (‘बाल’) is marked on पाणिं.

**Verse numbers.** All readers misread this font's digits: page 60's verses (554–565 by the book's sequence, about 12 verses a page from page 25's 121–132) are ९५x in Carbon and Neon, ६५x in Argon, and ५५x only in Flash 3.8. A sequence check on verse numbers is needed whichever reader is used.

Spent: about $0.65 of Gemini calls on Vertex AI and 12 Cloud Vision units (within the monthly free 1,000), billed to the `sanskritmetres` project, not the book's ledger. The readings and the scores are in [outputs/surveys/099-full-page-reader-comparison-400ppi](../../outputs/surveys/099-full-page-reader-comparison-400ppi/).
