"""Re-apply method 053's saved answers with punctuation outside the stretch removed. No new requests."""
import json, re, sys
from pathlib import Path
from collections import Counter
sys.path.insert(0, str(Path(__file__).resolve().parent)); sys.path.append(str(Path(__file__).resolve().parents[1] / '044-gpt-6.1-terra-none-region-transcription'))
from run import words
from evaluate import edits
P = Path(__file__).resolve().parents[2]
ev = json.loads((P/'outputs/surveys/053-gpt-6.1-terra-none-word-check/check-evaluation.json').read_text())
PUN = {'।', '॥', "'"}
tot = Counter(); agreed = ['दौर्योधने','समवेत्य','व्यावृत्तेऽर्यम्णि','काठिण्यं','कृतोसि','चटुं']
examples = []
for pid in ['hertel-panchatantra-page-152','kale-1913-page-106','dutt-mahabharata-17f-chapter-001-page-002']:
    d = P/'outputs'/pid/'053-gpt-6.1-terra-none-word-check'
    I = json.loads((d/'items.json').read_text()); items = {i['id']: i for i in I['items']}
    ans = {a['id']: a for a in json.loads((d/'parsed-response.json').read_text())['items']}
    refmap = {(x['region'], x['line']): x['reference'] for x in ev['pages'][pid]['lines']}
    c = Counter()
    for rec in I['lines']:
        new = list(rec['words'])
        for iid in sorted(rec['items'], key=lambda i: -items[i]['i1']):
            it, a = items[iid], ans[iid]
            if a['verdict'] == 'unclear': continue
            aw, got = it['a'].split(), words(a['text'])
            while got and got[0] in PUN and aw[0] not in PUN: got = got[1:]
            while got and got[-1] in PUN and aw[-1] not in PUN: got = got[:-1]
            new[it['i1']:it['i2']] = got
        before, after = ' '.join(rec['words']), ' '.join(new)
        ref = refmap.get((rec['region'], rec['line']))
        if ref is None:
            if after != before:
                c['lines right before, changed'] += 1; examples.append((pid[-8:], before, after))
            continue
        eb, ea = edits(ref, before), edits(ref, after)
        c['edits before'] += eb; c['edits after'] += ea
        c['fixed'] += eb > 0 and ea == 0; c['broken'] += eb == 0 and ea > 0
        if ea > eb: examples.append((pid[-8:], ref, after))
        for w in agreed:
            if w in ref and w not in before:
                c['agreed-wrong lines'] += 1; c['agreed-wrong fixed'] += w in after
    print(pid, dict(c)); tot += c
print('TOTAL', dict(tot))
for e in examples: print('  worse', e[0]); print('    R', e[1]); print('    A', e[2])
