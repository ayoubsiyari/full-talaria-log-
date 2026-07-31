#!/usr/bin/env bash
# Does the second witness agree on the MAGNITUDE, not just the direction?
#
# Blocked ms/s uses the Total Blocking Time convention: only the part of a task beyond 50ms counts.
# That amplifies. Per-task blocking is ~36ms in every condition I ran, and what actually changes is
# how many bar events cross 50ms at all (0.14 per bar at low counts, ~1.1 at high). So a modest rise
# in per-event duration can show up as a 6x rise in the aggregate.
#
# The timer-gap witness does not have that threshold. If the gap rises ~6x too, the 6.2x is real. If
# it rises far less, then 6.2x is partly a property of my metric and the honest figure is smaller.
set -uo pipefail
cd /root/b-k4
python3 << 'PY'
import json
rows = []
for line in open('freeze-results.jsonl'):
    try: d = json.loads(line)
    except: continue
    for r in d['rows']:
        rows.append((d.get('label','')[:26], r.get('barsAtArm'), r.get('p95GapMs'),
                     r.get('worstTimerGapMs'), r.get('p95TaskMs'), r.get('blockedMsPerSec'),
                     r.get('longtasks')))
hdr = ('label','bars','p95gap','worstgap','p95task','blocked','tasks')
print('%-26s %6s %8s %9s %9s %9s %7s' % hdr)
for r in rows:
    print('%-26s %6s %8s %9s %9s %9s %7s' % tuple('-' if v is None else v for v in r))

low  = [r for r in rows if r[5] is not None and r[5] < 100]
high = [r for r in rows if r[5] is not None and r[5] > 250]
def mean(xs): return sum(xs)/len(xs) if xs else 0
print()
print('  regime      n   mean p95gap   mean blocked ms/s')
print('  low  bars  %2d      %6.1f            %6.1f' % (len(low),  mean([r[2] for r in low if r[2] is not None]),  mean([r[5] for r in low])))
print('  high bars  %2d      %6.1f            %6.1f' % (len(high), mean([r[2] for r in high if r[2] is not None]), mean([r[5] for r in high])))
lg = mean([r[2] for r in low if r[2] is not None]); hg = mean([r[2] for r in high if r[2] is not None])
lb = mean([r[5] for r in low]); hb = mean([r[5] for r in high])
print()
print('  ratio high/low  by timer gap p95 : %.1fx' % (hg/lg if lg else 0))
print('  ratio high/low  by blocked ms/s  : %.1fx' % (hb/lb if lb else 0))
print()
print('  If these disagree, the larger one is a property of the metric and the smaller is the')
print('  defensible statement of how much worse the product got.')
PY
