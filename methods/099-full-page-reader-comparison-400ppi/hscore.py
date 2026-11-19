import json, collections, statistics, glob, re, os
src = open("score.py").read().split("stats = {r:")[0]
ns = {"__file__": os.path.abspath("score.py")}; exec(src, ns)
st = collections.Counter(); diffs = []; markers = []
for n in ns["PAGES"]:
    data = {r: ns["load"](r, n) for r in ns["READERS"] + ["gemini-4-hydrogen"]}
    wm = {r: ns["words_and_markers"](d["lines"]) for r, d in data.items() if d}
    pw = wm[ns["PIVOT"]][0]
    al = {r: ns["align"](pw, wm[r][0]) for r in wm}
    for i in range(len(pw)):
        votes = {r: (al[r][i][0] if al[r][i] else None) for r in ns["READERS"]}
        c = collections.Counter(v for v in votes.values() if v); top, k = c.most_common(1)[0]
        if k >= 4:
            v = al["gemini-4-hydrogen"][i][0] if al["gemini-4-hydrogen"][i] else None
            st["compared"] += 1
            if v != top: st["wrong"] += 1; diffs.append((n, top, v))
    inv = {v[1]: i for i, v in enumerate(al["gemini-4-hydrogen"]) if v}
    markers.append((n, sorted((m, inv.get(j, -1)) for m, j in wm["gemini-4-hydrogen"][1])))
print("hydrogen words differing from the 7-reader majority:", st["wrong"], "of", st["compared"], f"({100*st['wrong']/st['compared']:.1f}%)")
print(diffs)
carbon = {row["page"]: [tuple(x) for x in row["gemini-4-carbon"]] for row in json.load(open("score.json"))["markers"]}
print("markers:", sum(len(m) for _, m in markers), "| differ from carbon:", [(n, m, carbon[n]) for n, m in markers if carbon[n] != m])
cost = []; secs = []; th = []
for f in glob.glob("gemini-4-hydrogen/*.json"):
    j = json.load(open(f)); u = j["usage"]; t = u.get("thoughtsTokenCount", 0); th.append(t)
    cost.append((u["promptTokenCount"] * 1.5 + (u["candidatesTokenCount"] + t) * 7.5) / 1e6); secs.append(j["seconds"])
print(f"per page ${statistics.mean(cost):.4f}, thinking {statistics.mean(th):.0f} tokens, median {statistics.median(secs):.0f}s max {max(secs):.0f}s, book ${statistics.mean(cost)*519:.2f}")
j = json.load(open("gemini-4-hydrogen/60.json"))
print("page 60 verse numbers:", " ".join(re.sub(r"[॥\s]", "", s) for s in re.findall(r"॥\s*[०-९]+\s*॥", " ".join(j["parsed"]["lines"]))))
