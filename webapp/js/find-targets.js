// Which pages "Find regions" (and the other stage runs) use. Pages named in the selection (a typed range or ticked pages)
// are always used. With nothing selected, By page uses the pages its grid shows, and By type, which shows no grid, uses
// every page of the book; both leave out dimmed pages. A page not yet eligible for the stage is never used.
export function findTargets({ selected = [], view = "pages", shown = [], all = [], isSkipped = () => false, eligible = () => true }) {
  const chosen = selected.length ? selected : (view === "types" ? all : shown).filter(pid => !isSkipped(pid));
  return chosen.filter(eligible);
}
