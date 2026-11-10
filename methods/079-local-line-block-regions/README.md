# 079-local-line-block-regions — Line blocks from the local line finder

The frozen browser line finder analyzes the source pixels at their original size. Blocks split at large vertical gaps, changes in indentation, changes in core letter height and column boundaries. The existing method 063 ownership and outline step turns those blocks into regions and line pieces.

Both local finders guess coarse classes from layout. A short isolated line near a page edge is a running header. Small text at the foot is a note. Other blocks are paragraphs. A class maps to a book type only when exactly one type has that class. Otherwise the block remains `other`, visible for manual typing. Every local guess is marked uncertain.

## Reproduction

UV_CACHE_DIR=/private/tmp/scan-test-uv-cache UV_NO_SYNC=1 uv run --offline python methods/079-local-line-block-regions/benchmark.py --run reference-002

Output directories are protected against reuse. The source snapshots and SHA-256 files retain the runtime used in this experiment. Method 080 reuses method 079's frozen local outline runner. Its engine and language assets remain pinned under `webapp/vendor/tesseract-6.0.1`, with hashes in `asset-sha256.json`.

## Reference check

Nine public passage references were scored with method 043's evaluator. These are geometric passage scores. Type names and continuation flags require separate review. Local blocks often split a passage or merge neighboring passages, especially verses and commentary. The app offers the blocks as a manual editing starting point and flags their guesses for review. The reference scores and generated overlays are retained under [reference-001](../../outputs/surveys/079-local-line-block-regions/reference-001/summary.json). There were zero API calls and zero API cost.

## Recorded result on 2026-11-10

All nine pages completed. The summed passage scores are 1,068,958 pixels of other-passage ink included, 541,723 pixels of own ink omitted, 138,070 omitted beyond consecutive reading-order splits, and 0 separator pixels. There are 30 split passages, 12 regions matched by multiple kept passages and 0 missing kept passages. Estimated API cost was $0.000000.

[Reference scores](../../outputs/surveys/079-local-line-block-regions/reference-001/summary.json)
