# Chaya

Chaya opens scanned PDFs and [Chaya v1 books](../schema/FORMAT.md). Run a local server from the repository root.

```sh
python3 -m http.server --bind 127.0.0.1 8000
```

Open `http://127.0.0.1:8000/webapp/`. The library can open a local PDF or a URL, including a link of the form
`?book=<encoded PDF URL>`. It stores the original scan, `chaya.json`, and processing work in this browser.
Use **Export → Save .chaya.pdf** to keep a portable copy of the scan and edits.

- **Scans** is the editor. Select a box or its text to edit it. Cards follow the book’s saved order, with
  running headers and page numbers where they are printed. A drawn box goes in at its place on the page,
  inside the sections around it. **Next check** follows the positions on the scan. Checks flag unread or
  uncertain text, type suggestions, unlinked notes, and likely lines outside the boxes; a check opens in its
  region's card. **Use** applies an existing suggested type. **Keep** accepts the selected type and
  **Leave out** excludes an area from reading.
- The **Text** view follows the saved reading order and links. Double-click a passage or footnote to
  preview its scan. **Open in Scans** jumps to that region in the editor. The Text view and standalone
  HTML export wrap without adding hyphens. On smaller screens, dismiss the Contents sidebar with
  **Close contents**, Escape, or a tap outside the sidebar.
- **Process** finds regions and reads text on unprocessed pages, a scan range, or the current page.
  Areas that need a type use **Unclassified**, which keeps printed lines and any suggested type for review.
  The dialog shows the engines, estimated cost, spending threshold, and progress. **Use saved records only**
  replays matching records from browser storage or the attached work archive. **Fill in missing text only**
  copies readings into matching blank line slots or untranscribed regions while preserving existing text,
  exclusions, and structure. An unread check opens this mode through **Restore from saved work…**.
  **Stop** interrupts a run and **Undo** restores the book before a run that changed it.
- **Settings** holds book details, types, finder and reader choices, credentials, and structure rules.
  Use the links beside the credential fields to open the provider’s setup page.
  Processing saves inferred structure until you edit it. **Find structure now** replaces saved structure
  after confirmation.
- **Export** offers the Chaya PDF, the book's processing records (`.work.zip`: the finder's and readers' saved results,
  which stay in the browser that made them; open it in another browser with Process → **Open work archive…** to
  replay pages there for $0), original PDF, plain text, standalone HTML, `chaya.json`, and verses JSON
  when the book has numbered verses.

The library links to the previous app for older books. The published site serves it at `versions/0.4/`.
The conversion tool is in the `chaya-0.4` branch. See the migration command in [the format reference](../schema/FORMAT.md).

Run the tests from the repository root.

```sh
node --test $(find webapp/test -maxdepth 1 -name '*.test.mjs' ! -name 'page-joins.test.mjs' | sort)
node --test webapp/test/page-joins.test.mjs
```

The raster parity checks use the repository’s local Python environment through `uv run --offline`.
