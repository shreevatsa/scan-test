import json, subprocess, sys
from pathlib import Path
P = Path('../..')
methods = {'046 Terra none': '046-gpt-6.1-terra-none-region-transcription-neighbor-context',
           '048 Terra low': '048-gpt-6.1-terra-low-region-transcription-neighbor-context',
           '049 Astra low': '049-gpt-6-astra-low-region-transcription-neighbor-context',
           '052 Argon low': '052-gemini-4-argon-low-region-transcription-neighbor-context-region-list'}
pages = ['hertel-panchatantra-page-152', 'kale-1913-page-106', 'dutt-mahabharata-17f-chapter-001-page-002']
rows = []
for label, m in methods.items():
    for run in ['', 'run-002/']:
        cells = [label + (' repeat' if run else ' first')]
        cost = secs = 0; valid = 0; rel = 0; mism = 0
        for p in pages:
            d = P / 'outputs' / p / m / run
            out = d / 'transcription-evaluation.json'
            subprocess.run([sys.executable, 'evaluate.py', str(out), '--page', f'x={d / "page.json"}'], capture_output=True)
            e = json.loads(out.read_text())['x']['text_totals']
            cells.append(f"{100 * e['no_markers']['cer']:.2f}% ({e['no_markers']['edits']})")
            r = json.loads((d / 'result.json').read_text())
            cost += r['api']['tokens_and_cost'].get('estimated_paid_tier_total_cost_usd', 0); secs += r['api']['api_wall_seconds']
            valid += r['check']['valid']; rel += r['counts']['relations'] if 'kale' in p else 0
            mism += sum('lines returned' in x for x in r['problems'])
        cells += [f'{valid}/3', str(rel), str(mism), f'${cost:.3f}', f'{secs / 3:.0f} s']
        rows.append(cells)
print('| Reader | Hertel 152 | Kale 106 | Dutt page 2 | Valid | Kale note relations | Line-count mismatches | Cost, 3 pages | Mean time |')
print('|---|---|---|---|---|---|---|---|---|')
for r in rows: print('| ' + ' | '.join(r) + ' |')
