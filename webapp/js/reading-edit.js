import * as ops from "./ops.js?v=20261112-join-2";
import { assertJoinMetadata, joinPageUnits } from "./editing.js?v=20261112-join-2";
import { layerState } from "./layers.js?v=20261112-join-2";
import { checkPage } from "./schema.js?v=20261112-join-2";

export { unitSnapshot } from "./editing.js?v=20261112-join-2";

export async function joinFollowingUnit(app, pid, uid, expected = new Map()) {
  const book = app.book, current = await book.current(pid, { refresh: true }), place = ops.placeOf(current, uid);
  if (!place) throw new ops.EditError("Select a unit that belongs to a flow.");
  const across = place.index + 1 === place.list.length;
  const next = across && book.pages[book.index[pid] + 1], page = book.page(pid);
  if (across && (!next || page.pdf_page && next.pdf_page && next.pdf_page !== page.pdf_page + 1)) throw new ops.EditError("There is no consecutive next page to join.");
  const check = (doc, types) => checkPage(app.validate, doc, types)[0];
  const ids = [...new Set([...expected.keys(), pid, ...(across ? [next.id] : [])])];
  return book.editPages(ids, (docs, types) => {
    if (!across) {
      const doc = docs.get(pid), current = ops.placeOf(doc, uid), sibling = current.list[current.index + 1];
      const nextId = typeof sibling === "string" ? sibling : sibling.unit;
      if (!nextId) throw new ops.EditError("The next item is a region. Join its unit from the page editor.");
      assertJoinMetadata(ops.unitById(doc, uid), ops.unitById(doc, nextId));
      ops.joinWithNext(doc, uid); return docs;
    }
    const left = docs.get(pid), right = docs.get(next.id);
    if (left.source?.sample?.consecutive_next === false || right.source?.sample?.consecutive_previous === false)
      throw new ops.EditError("These sample pages are separated in the source book.");
    if (!layerState(left, "text")?.accepted || !layerState(right, "text")?.accepted) throw new ops.EditError("Move both pages on from Text before joining them.");
    const [a, b] = joinPageUnits(left, right, types, uid, check);
    docs.set(pid, a); docs.set(next.id, b); return docs;
  }, { check, expected });
}
