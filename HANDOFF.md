# Chaya handoff

## 2026-11-25 · Version 1

The app on `main` opens Chaya v1 PDFs and ordinary scans. Its browser library stores the original scan,
edited book, and processing work separately. Scans shows regions in saved reading order and checks in scan
position order. Unclassified regions retain their printed lines while their type is under review. Text
assembles saved structure and linked notes. Process can fill gaps from matching saved work while keeping
the other edits.
See [the app guide](webapp/README.md) and [the book format](schema/FORMAT.md).

The old app and the migration tool live on `chaya-0.4`. Run migration there using the command in the format
reference. The GitHub Pages workflow builds the current app at `webapp/` and that branch’s app at
`versions/0.4/`. The old app’s examples keep their original URLs.

The v1 example links point at the `v1/` prefix with the same remote filenames. The owner will push both
branches, upload the migrated examples, and swap the local book files. The phase work stops at the local
commits.

[NOTEBOOK.md](NOTEBOOK.md) records the experiments and public samples. Earlier workflows are in Git history.
