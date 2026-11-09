# Browser OCR assets

Tesseract.js 6.0.1 and tesseract.js-core 6.1.2, pinned from the official npm registry. The ESM browser entry exports a default object. The worker selects the LSTM core, with SIMD when supported. Language packs are loaded from this directory and cached by Tesseract in IndexedDB. No CDN is used.

The English, Kannada and Sanskrit trained data came from the installed Homebrew Tesseract packages. `sources.json` records original paths, hashes and package tarball hashes. These are Apache-2.0 Tesseract language data. Engine licenses and bundled dependency notices are included alongside the assets.

The app uses LSTM-only recognition and page segmentation mode 6, then assigns recognized word boxes to the existing source-line polygons. It supplies plain text. Inline formatting and note markers need review.

Upstream sources are [Tesseract.js](https://github.com/naptha/tesseract.js), [Tesseract.js core](https://github.com/naptha/tesseract.js-core) and [language data](https://github.com/tesseract-ocr/tessdata).
