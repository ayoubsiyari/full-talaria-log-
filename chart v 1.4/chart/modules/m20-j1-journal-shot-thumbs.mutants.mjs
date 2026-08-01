/**
 * M20-J1 mutant runner.
 *
 * Each mutant deliberately breaks ONE J1 behaviour on disk, in EVERY copy of
 * order-manager.js, then runs the J1 suite and records which NAMED cell died.
 * The files are restored afterwards and their SHA-256 verified against the
 * pre-run hash.
 *
 *   node "chart v 1.4/chart/modules/m20-j1-journal-shot-thumbs.mutants.mjs"
 *
 * A mutant whose needle does not match EXACTLY the expected number of times in
 * EVERY target file is reported as NOT_APPLIED and the run fails: a silently
 * unapplied mutant is a fabricated pass. MUT-NC is a deliberate negative
 * control whose needle does not exist — it MUST report NOT_APPLIED.
 */
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const SUITE = path.join(__dirname, 'm20-j1-journal-shot-thumbs.test.mjs');

const TARGETS = [
  path.join(REPO_ROOT, 'chart v 1.4', 'chart', 'modules', 'order-manager.js'),
  path.join(REPO_ROOT, 'homepage', 'public', 'chart', 'modules', 'order-manager.js'),
].filter((p) => fs.existsSync(p));

if (TARGETS.length < 2) {
  console.error(`FAIL: expected 2 order-manager.js copies, found ${TARGETS.length}`);
  process.exit(1);
}

const MUTANTS = [
  {
    id: 'MUT-01',
    what: 'kill-switch uses `!== true` instead of truthy semantics (FLAG-02 defect)',
    find: '            return !window.__TALARIA_DISABLE_JOURNAL_SHOT_THUMBS_V1;',
    replace: '            return window.__TALARIA_DISABLE_JOURNAL_SHOT_THUMBS_V1 !== true;',
    expectCells: ['J1-C9'],
  },
  {
    id: 'MUT-02',
    what: 'kill-switch memoised on first call (FLAG-01 defect)',
    find: '            if (typeof window === \'undefined\') return true;\n            return !window.__TALARIA_DISABLE_JOURNAL_SHOT_THUMBS_V1;',
    replace: '            if (typeof window === \'undefined\') return true;\n            if (this.__j1FlagMemo === undefined) {\n                this.__j1FlagMemo = !window.__TALARIA_DISABLE_JOURNAL_SHOT_THUMBS_V1;\n            }\n            return this.__j1FlagMemo;',
    expectCells: ['J1-C11'],
  },
  {
    id: 'MUT-03',
    what: 'list <img> falls back to the full-resolution data URL',
    find: '        if (typeof shot === \'string\' && shot) this._m20J1ScheduleThumb(key, shot, rerender);\n        return this._m20J1PlaceholderSrc();',
    replace: '        if (typeof shot === \'string\' && shot) this._m20J1ScheduleThumb(key, shot, rerender);\n        return shot || this._m20J1PlaceholderSrc();',
    expectCells: ['J1-C1', 'J1-C3'],
  },
  {
    id: 'MUT-04',
    what: 'data-trade attribute keeps the entry screenshot payload',
    find: '            delete tradeForAttr.entryScreenshot;\n',
    replace: '',
    expectCells: ['J1-C1', 'J1-C5'],
  },
  {
    id: 'MUT-05',
    what: 'entry click handler inlines the base64 payload again',
    find: '                                     ? `window.chart.orderManager.showScreenshotPreviewForTrade(\'${m20J1IdArg}\', \'entry\', \'Entry Screenshot\')`',
    replace: '                                     ? `window.chart.orderManager.showScreenshotPreview(\'${trade.entryScreenshot}\', \'Entry Screenshot\')`',
    expectCells: ['J1-C1', 'J1-C4'],
  },
  {
    id: 'MUT-06',
    what: 'render window effectively unbounded (virtualisation removed)',
    find: '            windowSize: 60,         // rows rendered before "show more"',
    replace: '            windowSize: 100000,     // rows rendered before "show more"',
    expectCells: ['J1-C14'],
  },
  {
    id: 'MUT-07',
    what: 'entry thumbnail drops loading="lazy" / decoding="async"',
    find: '<img src="${m20J1On ? this._m20J1ThumbSrc(trade, \'entry\', m20J1Rerender) : trade.entryScreenshot}"${m20J1On ? \' loading="lazy" decoding="async"\' : \'\'} style="',
    replace: '<img src="${m20J1On ? this._m20J1ThumbSrc(trade, \'entry\', m20J1Rerender) : trade.entryScreenshot}" style="',
    expectCells: ['J1-C16'],
  },
  {
    id: 'MUT-08',
    what: 'thumbnail cache eviction disabled (unbounded cache)',
    find: '        while (c.size > cfg.maxCacheEntries || this.__m20J1ThumbBytes > cfg.maxCacheBytes) {',
    replace: '        while (false) { // eslint-disable-line no-constant-condition',
    expectCells: ['J1-C20'],
  },
  {
    id: 'MUT-09',
    what: 'raster failure caches the FULL-resolution payload as the "thumbnail"',
    find: '                    if (!thumb) {\n                        st.failed.add(item.key);\n                    } else {',
    replace: '                    if (!thumb) {\n                        this._m20J1ThumbPut(item.key, item.dataUrl);\n                    } else {',
    expectCells: ['J1-C19'],
  },
  {
    id: 'MUT-12',
    what: 'thumbnail queue never pumps past the first concurrency batch',
    find: '                    this._m20J1PumpThumbs();\n                })\n                .catch(() => {',
    replace: '                })\n                .catch(() => {',
    expectCells: ['J1-C23'],
  },
  {
    id: 'MUT-10',
    what: 'row click ignores the live row and trusts the slim data-trade attribute',
    find: '                                if (liveRow) {\n                                    this.showTradeDetails(liveRow);\n                                    return;\n                                }',
    replace: '                                if (false && liveRow) {\n                                    this.showTradeDetails(liveRow);\n                                    return;\n                                }',
    expectCells: ['J1-C8'],
  },
  {
    id: 'MUT-11',
    what: 'externalized preview never reaches the M20-A1 resolver',
    find: '        this._m20A1ResolveRefBlob(ref.refId, { cache: true }).then((blob) => {',
    replace: '        Promise.resolve(null).then((blob) => {',
    expectCells: ['J1-C7'],
  },
  {
    id: 'MUT-NC',
    what: 'NEGATIVE CONTROL — needle intentionally absent; MUST report NOT_APPLIED',
    find: '        return this._m20J1ThisFunctionDoesNotExist(trade);',
    replace: '        return null;',
    expectCells: [],
    negativeControl: true,
  },
];

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function countOf(hay, needle) {
  let n = 0;
  let i = hay.indexOf(needle);
  while (i >= 0) { n += 1; i = hay.indexOf(needle, i + 1); }
  return n;
}

function runSuite() {
  const r = spawnSync(process.execPath, ['--test', '--test-concurrency=1', SUITE], {
    encoding: 'utf8',
    cwd: REPO_ROOT,
    timeout: 300_000,
  });
  const out = `${r.stdout || ''}\n${r.stderr || ''}`;
  const failed = [...out.matchAll(/^✖ (J1-C\d+)/gm)].map((m) => m[1]);
  const passCount = (out.match(/^✔ /gm) || []).length;
  return { status: r.status, failed: [...new Set(failed)], passCount, out };
}

const baseline = new Map(TARGETS.map((f) => [f, sha256(f)]));
const originals = new Map(TARGETS.map((f) => [f, fs.readFileSync(f, 'utf8')]));

console.log('J1 mutant run');
console.log(`targets:\n${TARGETS.map((f) => `  ${path.relative(REPO_ROOT, f)}  ${baseline.get(f).slice(0, 16)}`).join('\n')}`);

const clean = runSuite();
console.log(`\nbaseline (unmutated): status=${clean.status} pass=${clean.passCount} failed=[${clean.failed.join(', ')}]`);
if (clean.status !== 0) {
  console.error('FAIL: the suite is not green before mutation — aborting.');
  process.exit(1);
}

const rows = [];
let hardFail = 0;

for (const m of MUTANTS) {
  // Pre-flight: the needle must match exactly once in EVERY target.
  const counts = TARGETS.map((f) => countOf(originals.get(f), m.find));
  const applicable = counts.every((c) => c === 1);
  if (!applicable) {
    const detail = TARGETS.map((f, i) => `${path.basename(path.dirname(path.dirname(f)))}=${counts[i]}`).join(' ');
    console.log(`\n${m.id} NOT_APPLIED — needle match counts: ${detail} (expected 1 in each)`);
    rows.push({ id: m.id, what: m.what, result: 'NOT_APPLIED', killedBy: '—' });
    if (!m.negativeControl) {
      console.error(`FAIL: ${m.id} was NOT applied; its "pass" would be fabricated.`);
      hardFail += 1;
    } else {
      console.log(`${m.id} negative control behaved correctly (NOT_APPLIED).`);
    }
    continue;
  }
  if (m.negativeControl) {
    console.error(`FAIL: ${m.id} is the negative control but its needle MATCHED — the control is broken.`);
    hardFail += 1;
    rows.push({ id: m.id, what: m.what, result: 'CONTROL_BROKEN', killedBy: '—' });
    continue;
  }

  for (const f of TARGETS) fs.writeFileSync(f, originals.get(f).replace(m.find, m.replace));
  const res = runSuite();
  for (const f of TARGETS) fs.writeFileSync(f, originals.get(f));

  // Restore verification before believing anything about this mutant.
  const bad = TARGETS.filter((f) => sha256(f) !== baseline.get(f));
  if (bad.length) {
    console.error(`FAIL: restore mismatch after ${m.id}: ${bad.join(', ')}`);
    process.exit(1);
  }

  const killed = res.failed.length > 0;
  const named = res.failed.join(', ');
  const expectedHit = m.expectCells.some((c) => res.failed.includes(c));
  console.log(`\n${m.id} ${killed ? 'KILLED' : 'SURVIVED'} — ${m.what}`);
  console.log(`  failing cells: ${named || '(none)'}`);
  if (!killed) {
    console.error(`FAIL: ${m.id} survived — no behavioural cell covers it.`);
    hardFail += 1;
  } else if (!expectedHit) {
    console.error(`FAIL: ${m.id} was killed by ${named}, none of the expected ${m.expectCells.join('/')}.`);
    hardFail += 1;
  }
  rows.push({
    id: m.id,
    what: m.what,
    result: killed ? 'KILLED' : 'SURVIVED',
    killedBy: named || '—',
  });
}

for (const f of TARGETS) {
  if (sha256(f) !== baseline.get(f)) {
    console.error(`FAIL: final hash mismatch for ${f}`);
    process.exit(1);
  }
}

console.log('\n─── mutant table ───');
console.log('| mutant | result | killed by (named behavioural cell) | what it breaks |');
console.log('| --- | --- | --- | --- |');
for (const r of rows) console.log(`| ${r.id} | ${r.result} | ${r.killedBy} | ${r.what} |`);
console.log('\nall targets restored and SHA-256 verified against the pre-run hash.');

if (hardFail) {
  console.error(`\nMUTANT RUN FAIL count=${hardFail}`);
  process.exit(1);
}
console.log('MUTANT RUN GREEN');
