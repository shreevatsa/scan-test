const DEV = "०१२३४५६७८९";
const toInt = s => Number([...s].map(c => DEV.includes(c) ? DEV.indexOf(c) : c).join(""));
export const toDev = (n, like) => /[०-९]/.test(like) ? String(n).replace(/\d/g, d => DEV[d]) : String(n);
const NUMBER = /(?:॥|\|\||II|।।)\s*([०-९0-9]{1,4})\s*(?:॥|\|\||II|।।)?\s*$/;

// The verses in book order: [{ line, at, printed, value, page }] (null value where no number is printed).
export function verseNumbers(docs, type = "verse") {
  const out = [];
  for (const doc of docs) {
    const regions = new Map(doc.page.regions.map(region => [region.id, region]));
    const units = new Map(doc.units.map(unit => [unit.id, unit]));
    const walk = id => {
      const unit = units.get(id); if (!unit) return;
      if (unit.type !== type) { for (const child of unit.children) if (child.unit) walk(child.unit); return; }
      if (unit.open?.end) return;   // its number is printed where it ends, on a later page
      const last = [...unit.children].reverse().find(child => child.region);
      const region = last && regions.get(last.region.split("#").pop()), line = region?.lines?.at(-1);
      const match = line && NUMBER.exec(line.text || "");
      out.push(match ? { line, at: match.index + match[0].indexOf(match[1]), printed: match[1], value: toInt(match[1]), unit, page: doc.page.id } : { line: null, value: null, page: doc.page.id });
    };
    for (const id of doc.flows.main || []) walk(id);
  }
  return out;
}

const digitsDiffer = (a, b) => { const x = String(a), y = String(b); if (x.length !== y.length) return Infinity; let n = 0; for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) n++; return n; };

// Corrections for misread stretches: [{ item, value }], and the breaks left. Only numbered items count: a verse with no
// number of its own is most often a verse split across two units, and a closing with none is unnumbered in print.
export function sequenceFixes(verses, { longest = 100 } = {}) {
  const fixes = [], breaks = [];
  const numbered = verses.filter(item => item.value !== null);
  for (let k = 1; k < numbered.length; k++) {
    const prev = numbered[k - 1], cur = numbered[k], expected = prev.value + 1;
    if (cur.value === expected) continue;
    const delta = cur.value - expected;
    let j = k;   // the stretch off by delta
    while (j + 1 < numbered.length && j + 1 - k < longest && numbered[j + 1].value - (expected + (j + 1 - k)) === delta) j++;
    // The numbering goes on as before after the stretch, or the stretch runs up to a restart (१ again).
    const after = numbered[j + 1], resumes = after && (after.value === expected + (j + 1 - k) || (after.value === 1 && j > k));
    const stretch = numbered.slice(k, j + 1).map((item, i) => ({ item, value: expected + i }));
    // A misread digit moves a number by 2 or more (५ read as ९: 4, 40, 400); an item missing or added moves it by 1.
    if (resumes && Math.abs(delta) >= 2 && stretch.every(fix => digitsDiffer(fix.item.value, fix.value) === 1)) {
      for (const fix of stretch) { fixes.push(fix); fix.item.value = fix.value; }
      k = j;
      continue;
    }
    // The first number after a restart, read ९ for १: the two after it say १.
    const [n1, n2] = [numbered[k + 1], numbered[k + 2]];
    if (n1 && n2 && n1.value === 2 && n2.value === 3 && cur.value !== 1 && digitsDiffer(cur.value, 1) === 1) {
      fixes.push({ item: cur, value: 1 }); cur.value = 1;
      breaks.push({ page: cur.page, previous: prev.value, read: 1, expected, restart: true });
    } else breaks.push({ page: cur.page, previous: prev.value, read: cur.value, expected, restart: cur.value === 1 });
  }
  return { fixes, breaks };
}

// [{ index, value }] in page order → corrections [{ entry, value }] and breaks. Each page's offset is its number less
// its place in the book. A run of at least three numbered pages with one offset is trusted; between two trusted runs
// with the same offset, at most `gap` pages apart, every numbered page takes the number they imply. Runs with
// different offsets (a new numbering) are listed as breaks, as is any page left out of agreement.
export function pageNumberFixes(entries, { least = 3, gap = 12 } = {}) {
  const numbered = entries.filter(entry => entry.value !== null);
  const offset = entry => entry.value - entry.index;
  const runs = [];
  for (let k = 0; k < numbered.length;) {
    let j = k; while (j + 1 < numbered.length && offset(numbered[j + 1]) === offset(numbered[k])) j++;
    if (j - k + 1 >= least) runs.push({ from: k, to: j, offset: offset(numbered[k]) });
    k = j + 1;
  }
  const fixes = [], breaks = [];
  for (let r = 1; r < runs.length; r++) {
    const before = runs[r - 1], after = runs[r], between = numbered.slice(before.to + 1, after.from);
    if (before.offset === after.offset && numbered[after.from].index - numbered[before.to].index <= gap + 1) {
      for (const entry of between) { const value = entry.index + before.offset; if (value !== entry.value) { fixes.push({ entry, value }); entry.value = value; } }
    } else breaks.push({ entry: numbered[after.from], previous: numbered[before.to].value, read: numbered[after.from].value, expected: numbered[before.to].value + (numbered[after.from].index - numbered[before.to].index), pages: between.length });
  }
  return { fixes, breaks };
}
