"""Compare the text of book-001 (Terra, method 047) and book-002 (Gemini, method 052), page by page, by part."""
import json, random, re, sys, difflib
from pathlib import Path
from collections import Counter
sys.path.insert(0, 'methods/053-gpt-6.1-terra-none-word-check'); sys.path.append('methods/044-gpt-6.1-terra-none-region-transcription')
from run import words
from evaluate import edits
M1 = '047-gpt-6.1-terra-none-region-transcription-neighbor-context-runs/book-001'
M2 = '052-gemini-4-argon-low-region-transcription-neighbor-context-region-list/book-002'
DEV = re.compile('[ऀ-ॿ]')
def page_words(n, m):
    d = json.loads(Path(f'outputs/kale-1913-page-{n:03d}/{m}/page.json').read_text())
    rs = sorted([r for r in d['page']['regions'] if r.get('order')], key=lambda r: r['order'])
    out = []
    for r in rs:
        for L in r['lines']:
            for w in words(L.get('text', '')):
                out.append((w, r['id'], L['line']))
    return out
part = lambda n: 'contents' if n == 1 else 'sanskrit' if n <= 113 else 'translation' if n <= 165 else 'notes'
tot = {k: Counter() for k in ['contents', 'sanskrit', 'translation', 'notes']}
pairs = []
for n in range(1, 253):
    a, b = page_words(n, M1), page_words(n, M2)
    aw, bw = [x[0] for x in a], [x[0] for x in b]
    sm = difflib.SequenceMatcher(None, aw, bw, autojunk=False)
    t = tot[part(n)]
    t['words'] += len(bw)
    for op, i1, i2, j1, j2 in sm.get_opcodes():
        if op != 'equal':
            t['differing words (book-002)'] += j2 - j1
            if op == 'replace' and i2 - i1 == 1 and j2 - j1 == 1:
                pairs.append((n, aw[i1], bw[j1], b[j1][1], b[j1][2]))
    t['chars'] += sum(len(w) for w in bw)
for k, v in tot.items():
    print(k, dict(v), f"{100 * v['differing words (book-002)'] / max(1, v['words']):.1f}% of words")
random.seed(7)
dev = [p for p in pairs if DEV.search(p[2])]; eng = [p for p in pairs if not DEV.search(p[2]) and re.search('[a-z]', p[2])]
sample = random.sample(dev, 12) + random.sample(eng, 6)
json.dump(sample, open(sys.argv[1], 'w'), ensure_ascii=False)
for s in sample: print(s)
