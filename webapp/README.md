# Chaya

Chaya opens scanned PDFs and [Chaya v1 books](../schema/FORMAT.md). Run a local server from the repository root.

```sh
python3 -m http.server --bind 127.0.0.1 8000
```

Open `http://127.0.0.1:8000/webapp/`. The library can open a local PDF or a URL, including a link of the form
`?book=<encoded PDF URL>`. It stores the original scan, `chaya.json`, and processing work in this browser.
Use **Export → Save .chaya.pdf** to keep a portable copy of the scan and edits.

- **Scans** is the editor. Select a box or its text to edit it. **Next check** visits unread or uncertain text,
  areas that need a type, unlinked notes, and likely lines outside the boxes. If a suggested type already
  exists, **Use** assigns it to the area you are reviewing. **Text** follows the saved
  reading order and links. Double-click a passage or footnote to preview its scan. **Open in Scans** jumps
  to that region in the editor.
- **Process** finds regions and reads text on unprocessed pages, a scan range, or the current page.
  The dialog shows the engines, estimated cost, spending threshold, and progress. **Use saved records only**
  replays suitable records from the attached work archive. **Stop** interrupts a run and **Undo** restores the
  book before a run that changed it.
- **Settings** holds book details, types, finder and reader choices, credentials, and structure rules.
  Processing saves inferred structure until you edit it. **Find structure now** replaces saved structure
  after confirmation.
- **Export** offers the Chaya PDF, original PDF, plain text, standalone HTML, `chaya.json`, and verses JSON
  when the book has numbered verses.

The library links to the previous app for older books. The published site serves it at `versions/0.4/`.
The conversion tool is in the `chaya-0.4` branch. See the migration command in [the format reference](../schema/FORMAT.md).

Run the tests from the repository root.

```sh
node --test $(find webapp/test -maxdepth 1 -name '*.test.mjs' ! -name 'page-joins.test.mjs' | sort)
node --test webapp/test/page-joins.test.mjs
```

The raster parity checks use the repository’s local Python environment through `uv run --offline`.
