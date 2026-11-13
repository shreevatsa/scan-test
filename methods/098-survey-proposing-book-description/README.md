# 098-survey-proposing-book-description

The unit-type survey of [095](../095-additive-page-image-type-survey/README.md) (up to twelve page images) and [096](../096-additive-contact-sheet-type-survey/README.md) (contact sheets), with one change: **when the book's description is empty, the request also asks for a proposed description.** One method ID covers both image forms and both model profiles (Terra, Argon low); the form and profile are recorded in each call and run record.

Why: a new book starts with an empty description, so the survey sent none, although every later model call uses it. Methods [091](../091-terra-contact-sheet-unit-types/README.md)/[092](../092-argon-low-contact-sheet-unit-types/README.md) and [077](../077-gpt-6-1-terra-unit-types/README.md)/[078](../078-gemini-4-argon-high-unit-types/README.md) asked for such a description; the wording follows the new-book form's placeholder: what the book is, its parts, languages and scripts, and how its pages are laid out.

What changes, only while `description` is blank:

- The response schema gains `proposed_description` (a string, required in that request's strict schema). The prompt gains one paragraph after `questions:` asking for a few plain sentences from what the pages show, saying where the sample leaves something uncertain.
- The response check rejects a missing or blank description in such a request.
- Nothing else differs, and a book with a description gets exactly the 095 or 096 request, recorded under 095 or 096 (the profile's `method` says which).

Review: the description becomes a pending item of kind `book_description` (source: method, run, model, pages) shown as its own card, "Proposed book description", in Regions → Proposed types. Use (editable first) writes it through the book-details `metadata` operation, the same path as Edit book details, with its usual preview; Dismiss drops it. For contact-sheet batches the first non-empty description is kept.

[config.json](config.json); the source of the recipe is in [snapshot/](snapshot/). 095 and 096 are unchanged.
