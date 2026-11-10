# 080-tesseract-paragraph-regions — Tesseract paragraphs with local outlines

Bundled Tesseract.js 6.0.1 uses LSTM recognition with automatic page segmentation mode 3 and returns its block, paragraph and line boxes. Each paragraph becomes a proposed block. Method 063 supplies the final ink ownership, outlines and line pieces. English uses the bundled eng pack. Sanskrit pages use san+eng. The browser benchmark used the bundled runtime and assets.

Both local finders guess coarse classes from layout. A short isolated line near a page edge is a running header. Small text at the foot is a note. Other blocks are paragraphs. A class maps to a book type only when exactly one type has that class. Otherwise the block remains `other`, visible for manual typing. Every local guess is marked uncertain.

## Reproduction

Open benchmark.html through the local server and run the local benchmark. Save its layout JSON, then run `UV_CACHE_DIR=/private/tmp/scan-test-uv-cache UV_NO_SYNC=1 uv run --offline python methods/079-local-line-block-regions/benchmark.py --run reference-002 --tesseract-results /path/to/layout.json`.

Output directories are protected against reuse. The source snapshots and SHA-256 files retain the runtime used in this experiment. Method 080 reuses method 079's frozen local outline runner. Its engine and language assets remain pinned under `webapp/vendor/tesseract-6.0.1`, with hashes in `asset-sha256.json`.

## Reference check

Nine public passage references were scored with method 043's evaluator. These are geometric passage scores. Type names and continuation flags require separate review. Local blocks often split a passage or merge neighboring passages, especially verses and commentary. The app offers the blocks as a manual editing starting point and flags their guesses for review. The reference scores and generated overlays are retained under [reference-001](../../outputs/surveys/080-tesseract-paragraph-regions/reference-001/summary.json). There were zero API calls and zero API cost.

## Recorded result on 2026-11-10

All nine pages completed. The summed passage scores are 2,592,012 pixels of other-passage ink included, 383,964 pixels of own ink omitted, 93,967 omitted beyond consecutive reading-order splits, and 0 separator pixels. There are 13 split passages, 13 regions matched by multiple kept passages and 0 missing kept passages. Estimated API cost was $0.000000.

[Reference scores](../../outputs/surveys/080-tesseract-paragraph-regions/reference-001/summary.json)
