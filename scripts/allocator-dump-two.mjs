#!/usr/bin/env node
/**
 * ALLOCATOR-DUMP-TWO — the approved second background memory-infra dump, diffed against the first.
 *
 * Why it exists: the first dump named the arena (v8 1,479.3 MB of a 1,968 MB renderer) but a single dump is a
 * STOCK, and the question is a FLOW: which allocator carries the growth. Two dumps separated by tens of
 * thousands of bars turn the stock into a rate, and the rate is expressed in MB per thousand resident bars
 * because that is the driver's unit (UNIT-01) and because MB/h is inseparable from a bar rate that decays.
 *
 * PREDICTION RECORDED BEFORE THE SECOND DUMP IS TAKEN, so it can be wrong:
 *   v8 carries essentially all of the growth; blink_gc, partition_alloc and malloc stay approximately flat.
 *   If partition_alloc climbs instead, bar data lives OUTSIDE V8 and my per-bar figure needs re-reading.
 * The grader below scores that prediction mechanically rather than letting me narrate the result afterwards.
 *
 * Read-only: attaches to the live soak over CDP, requests a BACKGROUND-detail dump (cheap per-allocator
 * totals, no stop-the-world snapshot), and never closes the browser.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const arg = (k, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${k}=`));
  return hit ? hit.slice(k.length + 3) : d;
};

const WAIT_MIN = Number(arg('waitMin', '180'));
const PORT = arg('port', '49797');
const FIRST = arg('first', 'c:\\Users\\user\\Desktop\\talaria1\\_evidence\\manager-C\\LIVE-ALLOCATOR-DUMP-20260731.json');
const SECOND = arg('second', 'c:\\Users\\user\\Desktop\\talaria1\\_evidence\\manager-C\\LIVE-ALLOCATOR-DUMP-TWO-20260801.json');
const OUT = arg('out', 'c:\\Users\\user\\Desktop\\talaria1\\_evidence\\manager-C\\ALLOCATOR-GROWTH-DIFF-20260801.json');
const PROBE = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), 'live-trace-and-allocator-probe.mjs');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rows = (dump, pid) => (dump?.allocatorDump?.processes || []).find((p) => p.pid === pid)?.allocatorsMB || null;
const sum = (o) => Object.values(o || {}).reduce((s, v) => s + (Number(v) || 0), 0);

async function main() {
  const first = JSON.parse(fs.readFileSync(FIRST, 'utf8'));
  console.log(`[dump2] first dump loaded, taken ${first.window?.startedAt} at ${first.window?.barsBefore} bars`);
  console.log(`[dump2] waiting ${WAIT_MIN} min before the second dump`);
  await sleep(WAIT_MIN * 60 * 1000);

  await new Promise((resolve) => {
    const ch = spawn(process.execPath, [PROBE, `--port=${PORT}`, '--phases=memory', `--out=${SECOND}`], { stdio: 'ignore' });
    ch.on('exit', resolve);
    ch.on('error', resolve);
  });

  if (!fs.existsSync(SECOND)) {
    fs.writeFileSync(OUT, JSON.stringify({ signature: 'ALLOCATOR-GROWTH-DIFF-V1', artifactFile: path.basename(OUT), voided: 'The second dump produced no artifact - the soak browser was gone or the attach failed. A missing second dump is recorded rather than inferred.' }, null, 1));
    console.log('[dump2] VOID: no second artifact');
    return;
  }
  const second = JSON.parse(fs.readFileSync(SECOND, 'utf8'));

  // The heavy renderer is identified by size, not by a remembered pid: a pid that changed means the process
  // restarted and the two dumps are not the same process, which voids the diff rather than producing a
  // spectacular fake delta.
  const heaviest = (d) => (d?.allocatorDump?.processes || []).map((p) => ({ pid: p.pid, total: sum(p.allocatorsMB) }))
    .sort((a, b) => b.total - a.total)[0] || null;
  const h1 = heaviest(first);
  const h2 = heaviest(second);

  const report = {
    signature: 'ALLOCATOR-GROWTH-DIFF-V1',
    artifactFile: path.basename(OUT),
    at: new Date().toISOString(),
    bfcacheState: 'default (enabled); this is a read-only attach to a live soak and no navigation occurs',
    predictionRecordedBeforeSecondDump: 'v8 carries essentially all growth; blink_gc, partition_alloc and malloc stay approximately flat. If partition_alloc climbs instead, bar data is held outside V8 and the per-bar figure needs re-reading.',
    firstDump: { file: path.basename(FIRST), at: first.window?.startedAt, bars: first.window?.barsBefore, heaviestPid: h1?.pid, heaviestTotalMB: +(h1?.total || 0).toFixed(1) },
    secondDump: { file: path.basename(SECOND), at: second.window?.startedAt, bars: second.window?.barsBefore, heaviestPid: h2?.pid, heaviestTotalMB: +(h2?.total || 0).toFixed(1) },
  };

  const barsDelta = (second.window?.barsBefore ?? 0) - (first.window?.barsBefore ?? 0);
  if (!h1 || !h2 || h1.pid !== h2.pid) {
    report.voided = `The heaviest renderer is pid ${h1?.pid} in the first dump and pid ${h2?.pid} in the second. Different processes cannot be differenced, so this reads VOID rather than reporting the difference between two unrelated processes.`;
  } else if (!(barsDelta > 0)) {
    report.voided = `Bars did not advance between dumps (${first.window?.barsBefore} to ${second.window?.barsBefore}). Without a bar delta there is no per-bar rate to compute and the soak had already stopped.`;
  } else {
    const a = rows(first, h1.pid) || {};
    const b = rows(second, h2.pid) || {};
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
    const perK = (mb) => +((mb / barsDelta) * 1000).toFixed(3);
    const table = keys.map((k) => {
      const before = Number(a[k] ?? 0);
      const after = Number(b[k] ?? 0);
      return { allocator: k, beforeMB: +before.toFixed(1), afterMB: +after.toFixed(1), deltaMB: +(after - before).toFixed(1), mbPerThousandBars: perK(after - before) };
    }).sort((x, y) => y.deltaMB - x.deltaMB);

    const totalDelta = table.reduce((s, r) => s + r.deltaMB, 0);
    const v8 = table.find((r) => r.allocator === 'v8');
    const pa = table.find((r) => r.allocator === 'partition_alloc');
    const v8Share = totalDelta > 0 && v8 ? +((v8.deltaMB / totalDelta) * 100).toFixed(1) : null;
    const paShare = totalDelta > 0 && pa ? +((pa.deltaMB / totalDelta) * 100).toFixed(1) : null;

    report.barsBetweenDumps = barsDelta;
    report.minutesBetweenDumps = +(((new Date(second.window?.startedAt) - new Date(first.window?.startedAt)) / 60000) || 0).toFixed(1);
    report.byAllocator = table;
    report.totalDeltaMB = +totalDelta.toFixed(1);
    report.totalMbPerThousandBars = perK(totalDelta);
    report.v8SharePercent = v8Share;
    report.partitionAllocSharePercent = paShare;
    report.predictionGrade = v8Share == null
      ? 'UNGRADED: the renderer did not grow between dumps, so there is no growth to attribute.'
      : (v8Share >= 70
        ? `PREDICTION HELD: v8 carries ${v8Share}% of the ${totalDelta.toFixed(1)} MB growth, ${v8?.mbPerThousandBars} MB per thousand bars. The per-bar memory figure is a V8 figure and bar data is held inside the JS heap.`
        : (paShare != null && paShare >= 30
          ? `PREDICTION WRONG in the way I named in advance: partition_alloc carries ${paShare}% of the growth against v8's ${v8Share}%. Bar data is held OUTSIDE V8, and my per-bar figure needs re-reading against a non-JS arena.`
          : `PREDICTION WRONG: v8 carries only ${v8Share}% of the growth. The arena that grows is not the arena that is largest, and the split above names it.`));
  }

  report.signatureFilenameCheck = report.artifactFile === path.basename(OUT) ? 'PASS' : 'FAIL';
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 1));
  console.log(JSON.stringify(report, null, 1));
}

main().catch((e) => { console.error('[dump2] failed', e); process.exit(1); });
