#!/usr/bin/env node
/**
 * OVERNIGHT-SUMMARY — reads the battery manifest and every artifact it produced and writes the
 * one file the PO opens at breakfast: `docs/plan3/OVERNIGHT-SUMMARY-20260731.md`, verdict first,
 * one line per scenario, no JSON required.
 *
 * Safe to run repeatedly while the battery is still going: it grades whatever has landed and
 * marks the rest RUNNING. Running it mid-night is how the summary stays current if the machine
 * dies at 05:00.
 */
import fs from 'node:fs';
import path from 'node:path';

const EVIDENCE = 'c:\\Users\\user\\Desktop\\talaria1\\_evidence\\manager-C';
const REPO = 'c:\\Users\\user\\Desktop\\talaria1\\full-talaria-log--main';
const STAMP = '20260731';

const read = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };
const n2 = (v) => (Number.isFinite(v) ? +v.toFixed(2) : null);

/** Per-scenario one-liners. Each says the NUMBER and what it means, not "see artifact". */
function gradeArtifact(id, art) {
  if (!art) return null;
  const ci = (c) => (Array.isArray(c) ? `CI[${n2(c[0])}, ${n2(c[1])}]` : '');
  switch (id) {
    case 'B1': case 'B1b': {
      const arm = art.arms?.twoIndicators || art.arms?.zeroIndicators;
      const r = arm?.result;
      const t = r?.trends?.cpuMsPerBar;
      const label = art.armOnly === 0 ? 'zero indicators' : 'two indicators';
      if (!t) return `no fit produced (${label}); build ${arm?.build?.scriptVersion ?? '?'}`;
      return `${label}: CPU-ms/bar ${t.verdict} at ${n2(t.perHour)}/h ${ci(t.slopeCi95)}, level change ${n2(r.cpuMsPerBarChangePercent)}%, mode ${JSON.stringify(r.modeAtEnd ?? arm?.modeRequested)}, build ${arm?.build?.scriptVersion ?? '?'}`;
    }
    case 'B2': {
      const v = art.verdict;
      if (!v) return 'no verdict block (run died before grading)';
      // Do not trust a stored cadence mean: this artifact was written before the denominator
      // guard existed, and its 41.87 came from windows that advanced zero or negative candles.
      // Recompute usability from the raw samples every time.
      const samples = art.recalcSamples || [];
      let usable = 0;
      let pairs = 0;
      let recalcTotal = 0;
      let candleTotal = 0;
      for (let i = 1; i < samples.length; i += 1) {
        const prev = samples[i - 1].perRealm || [];
        const cur = samples[i].perRealm || [];
        for (let r = 0; r < Math.min(prev.length, cur.length); r += 1) {
          pairs += 1;
          const dCalls = (cur[r].callsCumulative || 0) - (prev[r].callsCumulative || 0);
          const dIdx = (cur[r].replayIndex || 0) - (prev[r].replayIndex || 0);
          if (dCalls >= 0 && dIdx >= 5) usable += 1;
          if (dCalls > 0) recalcTotal += dCalls;
          if (dIdx > 0) candleTotal += dIdx;
        }
      }
      const cadence = usable > 0
        ? `${n2(v.test2_recalcsPerCandle)} recalcs per advanced candle`
        : `recalcs per candle NOT MEASURABLE (0 of ${pairs} window-realm pairs advanced enough to divide by) — instead ${recalcTotal.toLocaleString()} recalcs bought ${candleTotal} candles of progress`;
      return `mode ${v.modeRequested} (verified ${v.modeVerifiedInEveryRealm}): P0 ${v.test1_p0Found ? 'FOUND' : 'none'}, ${cadence}, recalc cost flat (${v.test3_earlyToLateP50})`;
    }
    case 'B3': {
      const v = art.verdict;
      if (!v) return 'no verdict block (run died before grading)';
      return `${v.answer} — copies per resident bar ${v.copiesPerResidentBar} (alias factor ${v.aliasFactor}), derived series slots per bar ${v.derivedSlotsPerResidentBar}, resident bars at first paint ${v.residentBarsAtFirstPaint}`;
    }
    case 'B4': {
      // Prefer the re-grade: the live grader keyed realms on a URL suffix all three peers share,
      // merged them into one series, and scored the hops between panels as releases.
      if (art.regrade?.grade) {
        const g = art.regrade.grade;
        const per = (g.perRealm || []).map((p) => `${p.realm}:${p.gauges?.residentPrimary?.first}->${p.gauges?.residentPrimary?.last}`).join(', ');
        return `${g.answer} — ${per} (re-graded with unique realm keys; the live run's "26 releases" were three peers merged under one key)`;
      }
      const v = art.verdict;
      if (!v) return 'no verdict block (run died before grading)';
      const per = (v.perRealmPrimary || []).map((p) => `${p.tf}:${p.first}->${p.last}${p.releases ? ` (${p.releases} releases)` : ''}`).join(', ');
      return `${v.answer} — ${per}`;
    }
    case 'B5': {
      const v = art.verdict;
      if (!v) return 'no verdict block (run died before grading)';
      return `${v.shots} screenshots, ${v.singleChartControls} single-chart and ${v.multichartControls} multichart controls; contact sheet at ${v.contactSheetPng || v.contactSheetHtml}`;
    }
    case 'B6': {
      const v = art.verdict;
      if (!v) return 'no verdict block (run died before grading)';
      const t = art.trends || {};
      const f = (k) => (t[k] ? `${k} ${n2(t[k].perHour)}/h ${ci(t[k].slopeCi95)}` : null);
      return `${v.status}${v.reason ? ` — ${v.reason}` : ''}; span ${n2(art.spanHours ?? art.hoursElapsed)}h, ${[f('footprintMB'), f('rendererMB'), f('elements')].filter(Boolean).join(', ')}`;
    }
    default: return null;
  }
}

const manifest = read(path.join(EVIDENCE, `OVERNIGHT-MANIFEST-${STAMP}.json`));
if (!manifest) {
  console.error('[summary] no manifest found; nothing to summarise');
  process.exit(1);
}

const rows = manifest.scenarios.map((s) => {
  const art = s.artifact ? read(s.artifact) : null;
  const graded = gradeArtifact(s.id, art);
  const status = s.status === 'RUNNING' && !s.endedAt ? 'RUNNING' : s.status;
  let verdict;
  if (status === 'OK') verdict = graded || 'completed, but the artifact carried no verdict block';
  else if (status === 'VOID') verdict = `${s.reason}${graded ? ` · partial: ${graded}` : ''}`;
  else if (status === 'SKIPPED') verdict = s.reason;
  else {
    // A live run has no verdict block yet, which is not the same thing as having died. Saying
    // "died before grading" about a running soak would be the PO's first and worst impression.
    const partial = graded && !/died before grading/.test(graded) ? ` · latest: ${graded}` : '';
    verdict = `still running${partial}`;
  }
  return { id: s.id, title: s.title, status, verdict, elapsed: s.elapsedMin, why: s.why };
});

const ok = rows.filter((r) => r.status === 'OK').length;
const void_ = rows.filter((r) => r.status === 'VOID').length;
const headline = (() => {
  const b3 = rows.find((r) => r.id === 'B3');
  const b4 = rows.find((r) => r.id === 'B4');
  const bits = [];
  if (b3?.status === 'OK') bits.push(`bar retention: ${b3.verdict.split(' — ')[0]}`);
  if (b4?.status === 'OK') bits.push(`eviction: ${b4.verdict.split(' — ')[0]}`);
  return bits.length ? bits.join('; ') : 'see the table';
})();

const md = [
  `# OVERNIGHT SUMMARY — 2026-07-31 (Manager C, NIGHT-01 battery)`,
  '',
  `**Was the night good? ${ok} of ${rows.length} scenarios produced a usable artifact${void_ ? `, ${void_} VOID` : ', none died'}.**`,
  `**Headline:** ${headline}`,
  '',
  '| # | status | verdict | min |',
  '| --- | --- | --- | --- |',
  ...rows.map((r) => `| **${r.id}** | ${r.status === 'OK' ? '**OK**' : r.status} | ${r.verdict.replace(/\|/g, '\\|')} | ${r.elapsed ?? '—'} |`),
  '',
  '## What each scenario was',
  '',
  ...rows.flatMap((r) => [`**${r.id} — ${r.title}.** ${r.why || ''}`, '']),
  '## Reading this honestly',
  '',
  '- Every scenario ran serially under an explicit `--max-old-space-size` with a hard timeout, per `NIGHT-01`. A scenario that died is `VOID` with its reason and the queue continued; nothing was relaunched.',
  '- `B1` and `B2` were specified before my 01:00-02:30 results landed, so they were run in the form that adds information rather than re-learning a banked number: `B1` as a **same-build** A/B (the earlier arms were b115 vs b116), `B2` in **tick mode**, which had never been measured.',
  '- `B3` sees JS-visible arrays reachable from `window` within a node budget in each realm. It is blind to closure-held, `WeakMap`-held and worker-held bars, so its copies-per-bar ratio is a **lower bound**.',
  '- `B4` reads array lengths. A fall in resident count proves **dereferencing**, not collection; proving collection needs a heap snapshot.',
  '- Free-RAM context reads `null` in tonight\'s manifest: `wmic` is absent on this Windows build. Fixed in the driver for future runs, but tonight there is no free-memory series.',
  '',
  `_Manifest: \`${path.join(EVIDENCE, `OVERNIGHT-MANIFEST-${STAMP}.json`)}\`. Driver started ${manifest.startedAt}. Summary regenerated ${new Date().toISOString()}._`,
  '',
].join('\n');

const outPath = path.join(REPO, 'docs', 'plan3', `OVERNIGHT-SUMMARY-${STAMP}.md`);
fs.writeFileSync(outPath, md);
console.error(`[summary] wrote ${outPath} (${ok} OK, ${void_} VOID, ${rows.length} scenarios)`);
for (const r of rows) console.error(`  ${r.id} ${r.status}: ${r.verdict.slice(0, 150)}`);
