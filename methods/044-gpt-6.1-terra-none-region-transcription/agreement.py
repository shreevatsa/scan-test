"""Do disagreements between independent readings flag the errors? Per reference line, on the three referenced pages."""
import json, sys
from collections import Counter
from pathlib import Path
import numpy as np
from PIL import Image
sys.path.insert(0, '.')
from evaluate import assign, no_markers, edits
P = Path('../..')
runs = {'044a': '044-gpt-6.1-terra-none-region-transcription', '044b': '044-gpt-6.1-terra-none-region-transcription/run-002',
        '046a': '046-gpt-6.1-terra-none-region-transcription-neighbor-context', '046b': '046-gpt-6.1-terra-none-region-transcription-neighbor-context/run-002'}
tot = Counter()
examples = []
for pid in ['hertel-panchatantra-page-152', 'kale-1913-page-106', 'dutt-mahabharata-17f-chapter-001-page-002']:
    ref = json.loads((P / 'references' / pid / 'transcription.json').read_text())
    labels = np.asarray(Image.open(P / 'references' / pid / 'passage-labels.png'))
    passages = json.loads((P / 'references' / pid / 'passages.json').read_text())['passages']
    legend = {p['value']: p['passage'] for p in passages}; kept = {p['passage'] for p in passages if p['keep']}
    reads = {}
    for k, d in runs.items():
        doc = json.loads((P / 'outputs' / pid / d / 'page.json').read_text())
        by = {}
        for p in sorted(assign(doc, labels, legend), key=lambda p: p['key']):
            if p['text']:
                by.setdefault(p['passage'], []).append(p['text'])
        reads[k] = by
    c = Counter()
    for name, spec in ref['passages'].items():
        if name not in kept:
            continue
        ls = {k: reads[k].get(name, []) for k in runs}
        if any(len(v) != len(spec['lines']) for v in ls.values()):
            c['passages_skipped'] += 1
            continue
        for i, want in enumerate(spec['lines']):
            w = no_markers(want)
            got = {k: no_markers(v[i]) for k, v in ls.items()}
            c['lines'] += 1
            wrong = {k: got[k] != w for k in runs}
            # pair of two requests of one method (a, b), as a self-consistency check
            for m in ('044', '046'):
                a, b = got[m + 'a'], got[m + 'b']
                c[m + ' lines wrong in first'] += wrong[m + 'a']
                c[m + ' wrong and flagged by repeat'] += wrong[m + 'a'] and a != b
                c[m + ' flagged lines'] += a != b
                c[m + ' edits in first'] += edits(w, a)
                c[m + ' edits in unflagged wrong lines'] += edits(w, a) if (wrong[m + 'a'] and a == b) else 0
            vals = list(got.values())
            c['all four wrong'] += all(wrong.values())
            c['all four agree but wrong'] += len(set(vals)) == 1 and wrong['044a']
            maj = Counter(vals).most_common(1)[0][0]
            c['majority-of-4 edits'] += edits(w, maj)
            c['ref chars'] += len(w)
            if len(set(vals)) == 1 and wrong['044a']:
                examples.append((pid[-8:], want, vals[0]))
    print(pid, dict(c))
    tot += c
print('TOTAL', dict(tot))
for e in examples: print('  agreed but wrong', e[0]); print('    R', e[1]); print('    H', e[2])
