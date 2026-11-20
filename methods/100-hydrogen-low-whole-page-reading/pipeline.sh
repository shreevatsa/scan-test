#!/bin/sh
# The Rāmāyaṇa-mañjarī from its Hydrogen reading (READ, the output of read_book.mjs) to the finished book (OUT), by
# rule and by the hand edits recorded here. Run from the repository root:  sh methods/100-…/pipeline.sh READ OUT TMPDIR
set -e
READ=$1; OUT=$2; T=$3; M=methods/100-hydrogen-low-whole-page-reading
node webapp/tools/chaya_baseline.mjs "$READ" "$T/1.chaya.pdf"
node $M/dim_pages.mjs "$T/1.chaya.pdf" "$T/2.chaya.pdf" 242,243
node webapp/tools/chaya_verse_numbers.mjs "$T/2.chaya.pdf" "$T/3.chaya.pdf" --report="$T/verse-numbers.json"
node webapp/tools/chaya_verse_numbers.mjs "$T/3.chaya.pdf" "$T/4.chaya.pdf" --type=section_closing --report="$T/episode-numbers.json"
node webapp/tools/chaya_verse_groups.mjs "$T/4.chaya.pdf" "$T/5.chaya.pdf"
node webapp/tools/chaya_sections.mjs "$T/5.chaya.pdf" "$T/6.chaya.pdf" --part-closing='कथासारे' --part-heading='काण्ड' \
  --division-closing='किष्किन्धापर्व' \
  --part-labels='बालकाण्डम् – अयोध्याकाण्डम्,अरण्यकाण्डम्,किष्किन्धाकाण्डम्,सुन्दरकाण्डम्,युद्धकाण्डम्,,उत्तरकाण्डम्'
node webapp/tools/chaya_notes.mjs "$T/6.chaya.pdf" "$T/7.chaya.pdf" --report="$T/notes.json"
node $M/front_matter.mjs "$T/7.chaya.pdf" "$T/8.chaya.pdf"
node webapp/tools/chaya_page_labels.mjs "$T/8.chaya.pdf" "$OUT" --report="$T/page-labels.json"
