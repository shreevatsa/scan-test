"""Tesseract as a second reader of the model's lines: does word-level disagreement flag the model's real errors?"""
import json, re, subprocess, sys, tempfile, difflib
from collections import Counter
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw
sys.path.insert(0, '.')
from evaluate import assign, no_markers
P = Path('../..')
LANG = sys.argv[1] if len(sys.argv) > 1 else 'san'
STRIP_JOINERS = '--strip-joiners' in sys.argv  # remove Tesseract's zero-width (non-)joiners before comparing
RUN = '044-gpt-6.1-terra-none-region-transcription'
DEV = re.compile('[ऀ-ॿ]')
tmp = Path(tempfile.mkdtemp())

def crop(im, polys):
    xs = [p[0] for r in polys for p in r]; ys = [p[1] for r in polys for p in r]
    x1, y1, x2, y2 = max(0, min(xs) - 6), max(0, min(ys) - 6), min(im.width, max(xs) + 7), min(im.height, max(ys) + 7)
    m = Image.new('L', (x2 - x1, y2 - y1), 0); d = ImageDraw.Draw(m)
    for r in polys: d.polygon([(x - x1, y - y1) for x, y in r], fill=255, outline=255)
    c = im.crop((x1, y1, x2, y2)).convert('L'); white = Image.new('L', c.size, 255)
    return Image.composite(c, white, m)

def ocr(img, lang):
    f = tmp / 'l.png'; img.save(f)
    out = subprocess.run(['tesseract', str(f), '-', '-l', lang, '--psm', '7'], capture_output=True, text=True).stdout
    out = out.strip()
    return out.replace('\u200c', '').replace('\u200d', '') if STRIP_JOINERS else out

def words(s):
    return no_markers(s).replace('।', ' । ').replace('॥', ' ॥ ').split()

def flagged_words(llm, other):
    """Indices of llm words not matched exactly by the other reading (difflib on word lists)."""
    a, b = words(llm), words(other)
    ok = set()
    for blk in difflib.SequenceMatcher(None, a, b, autojunk=False).get_matching_blocks():
        ok |= set(range(blk.a, blk.a + blk.size))
    return [i for i in range(len(a)) if i not in ok], a

tot = Counter(); missed = []
for pid in ['hertel-panchatantra-page-152', 'kale-1913-page-106', 'dutt-mahabharata-17f-chapter-001-page-002']:
    ref = json.loads((P / 'references' / pid / 'transcription.json').read_text())
    labels = np.asarray(Image.open(P / 'references' / pid / 'passage-labels.png'))
    passages = json.loads((P / 'references' / pid / 'passages.json').read_text())['passages']
    legend = {p['value']: p['passage'] for p in passages}; kept = {p['passage'] for p in passages if p['keep']}
    doc = json.loads((P / 'outputs' / pid / RUN / 'page.json').read_text())
    im = Image.open(P / 'inputs' / f'{pid}.png')
    polys = {(r['id'], L['line']): L['polygons'] for r in doc['page']['regions'] for L in r['lines']}
    by = {}
    for p in sorted(assign(doc, labels, legend), key=lambda p: p['key']):
        if p['text']:
            by.setdefault(p['passage'], []).append(p)
    c = Counter()
    for name, spec in ref['passages'].items():
        got = by.get(name, [])
        if name not in kept or len(got) != len(spec['lines']):
            continue
        for want, p in zip(spec['lines'], got):
            if not DEV.search(want):
                continue
            t = ocr(crop(im, polys[(p['region'], p['line'])]), LANG)
            fl, lw = flagged_words(p['text'], t)
            err, _ = flagged_words(p['text'], want)      # model words that differ from the reference
            c['lines'] += 1; c['words'] += len(lw); c['flagged words'] += len(fl)
            c['error words'] += len(err); c['error words flagged'] += len(set(err) & set(fl))
            for i in set(err) - set(fl):
                missed.append((pid[-8:], lw[i], t))
    print(pid, dict(c)); tot += c
print('TOTAL', LANG, dict(tot))
for m in missed[:12]: print('  missed', m)
