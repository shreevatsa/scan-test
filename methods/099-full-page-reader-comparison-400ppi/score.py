import json, re, sys, os, difflib, collections, unicodedata
D = os.path.dirname(os.path.abspath(__file__))
READERS = ["app-flash-lite-133", "cloud-vision", "gemini-3.5-flash-lite", "gemini-3.8-flash", "gemini-4-neon", "gemini-4-argon", "gemini-4-carbon"]
PIVOT = "gemini-4-carbon"
PAGES = [25, 30, 60, 100, 150, 200, 260, 320, 380, 440, 500]
MARK = re.compile(r"\[([^\]]{1,4})\]|「([^」]{1,4})」|［([^］]{1,4})］|<sup>([^<]{1,4})</sup>")
DEV = "०१२३४५६७८९"
norm_num = lambda s: "".join(str(DEV.index(c)) if c in DEV else c for c in s.strip())
def bare(w): return re.sub(r"[^ऀ-ॣ॰-ॿ]", "", unicodedata.normalize("NFC", w).replace("‌", "").replace("‍", ""))
def words_and_markers(lines):
    words, markers = [], []
    for line in lines:
        for tok in line.split():
            ms = [norm_num(next(g for g in m.groups() if g)) for m in MARK.finditer(tok)]
            w = bare(MARK.sub("", tok))
            if w and len(w) > 1:
                words.append(w)
                for m in ms: markers.append((m, len(words) - 1))
            elif ms:
                for m in ms: markers.append((m, max(0, len(words) - 1)))
    return words, markers
def load(r, n):
    p = f"{D}/{r}/{n}.json"
    if not os.path.exists(p): return None
    j = json.load(open(p)); return j.get("parsed")
def align(pivot, other):
    """map pivot index -> other word (or None)"""
    out = [None] * len(pivot)
    sm = difflib.SequenceMatcher(None, pivot, other, autojunk=False)
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == "equal" or tag == "replace":
            for k in range(min(i2 - i1, j2 - j1)): out[i1 + k] = (other[j1 + k], j1 + k)
    return out
stats = {r: collections.Counter() for r in READERS}
contested, details = [], collections.defaultdict(list)
marker_rows = []
for n in PAGES:
    data = {r: load(r, n) for r in READERS}
    wm = {r: words_and_markers(d["lines"]) for r, d in data.items() if d}
    pw = wm[PIVOT][0]
    al = {r: align(pw, wm[r][0]) for r in wm}
    for i in range(len(pw)):
        votes = {r: (al[r][i][0] if al[r][i] else None) for r in wm}
        c = collections.Counter(v for v in votes.values() if v)
        top, k = c.most_common(1)[0]
        if k >= 4:
            for r, v in votes.items():
                stats[r]["compared"] += 1
                if v != top: stats[r]["wrong"] += 1; details[r].append((n, top, v))
        else:
            contested.append((n, i, votes))
    # markers: expected = footnotes on the page (most common count among the Gemini readers)
    counts = collections.Counter(len(data[r]["footnotes"]) for r in READERS[2:] if data.get(r))
    expected = counts.most_common(1)[0][0]
    row = {"page": n, "notes": expected}
    for r in wm:
        ms = wm[r][1]
        # map the marker's word to the pivot index through the alignment
        inv = {}
        for i, v in enumerate(al[r]):
            if v: inv[v[1]] = i
        row[r] = sorted((m, inv.get(j, -1)) for m, j in ms)
    marker_rows.append(row)
print("WORDS (compared where at least 4 of 7 readers agree)")
for r in READERS:
    s = stats[r]; print(f"  {r:24s} {s['wrong']:4d} of {s['compared']:5d} differ from the majority  ({100*s['wrong']/max(1,s['compared']):.1f}%)")
print("contested positions (no word read by 4 of 7):", len(contested))
json.dump({"contested": contested, "details": {r: v for r, v in details.items()}, "markers": marker_rows}, open(f"{D}/score.json", "w"), ensure_ascii=False)
print("\nMARKERS: found / notes on the page; agreement on where (pivot word index)")
tot = collections.Counter()
for row in marker_rows:
    tot["notes"] += row["notes"]
    for r in READERS:
        if r in row: tot[r] += len(row[r])
print("  notes on the 11 pages:", tot["notes"])
for r in READERS: print(f"  {r:24s} markers written: {tot[r]}")
