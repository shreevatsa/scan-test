pdf.js 6.5.438 (`pdfjs-dist` from npm, Apache-2.0, see LICENSE), vendored unchanged so that the app works offline
and from any static host: `pdf.min.mjs`, `pdf.worker.min.mjs`, and the decoder, colour-profile, character-map and
standard-font files it loads on demand (`wasm/`, `iccs/`, `cmaps/`, `standard_fonts/`). Used by
`webapp/js/pipeline/pdf.js` to render a PDF's pages to images when making a book.
