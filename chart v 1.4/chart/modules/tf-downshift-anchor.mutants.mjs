/**
 * TF-DOWNSHIFT-ANCHOR — on-disk mutation runner (both chart.js mirrors).
 *
 *   cd "chart v 1.4/chart/modules"
 *   node tf-downshift-anchor.mutants.mjs
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../..');
const CANON = path.join(ROOT, 'chart v 1.4', 'chart', 'chart.js');
const MIRROR = path.join(ROOT, 'homepage', 'public', 'chart', 'chart.js');
const TEST = path.join(__dirname, 'tf-downshift-anchor.test.mjs');

const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const CANON_BYTES = fs.readFileSync(CANON);
const MIRROR_BYTES = fs.readFileSync(MIRROR);
const CANON_SHA = sha(CANON_BYTES);
const MIRROR_SHA = sha(MIRROR_BYTES);
if (CANON_SHA !== MIRROR_SHA) {
  console.error('FATAL: mirrors not byte-identical before mutation run');
  process.exit(2);
}

function countOccurrences(hay, needle) {
  if (!needle) return 0;
  let n = 0;
  let i = 0;
  while (true) {
    const j = hay.indexOf(needle, i);
    if (j === -1) return n;
    n += 1;
    i = j + needle.length;
  }
}

function applyOnce(source, needle, replacement, label) {
  const n = countOccurrences(source, needle);
  if (n !== 1) {
    return { ok: false, source, reason: `NOT_APPLIED ${label}: needle count=${n} (need 1)` };
  }
  return { ok: true, source: source.replace(needle, replacement), reason: null };
}

function writeRetry(file, buf, attempts = 12) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      fs.writeFileSync(file, buf);
      return;
    } catch (err) {
      lastErr = err;
      if (err && (err.code === 'EBUSY' || err.code === 'EPERM' || err.code === 'EACCES')) {
        const start = Date.now();
        while (Date.now() - start < 50 * (i + 1)) { /* spin */ }
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

function restoreAll() {
  writeRetry(CANON, CANON_BYTES);
  writeRetry(MIRROR, MIRROR_BYTES);
  const a = sha(fs.readFileSync(CANON));
  const b = sha(fs.readFileSync(MIRROR));
  if (a !== CANON_SHA || b !== MIRROR_SHA) {
    console.error('FATAL: restore SHA mismatch');
    process.exit(2);
  }
}

function runSuite() {
  const r = spawnSync(
    process.execPath,
    ['--test', '--test-reporter=tap', '--test-concurrency=1', TEST],
    { encoding: 'utf8', cwd: __dirname },
  );
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  const failed = [];
  for (const line of out.split('\n')) {
    const m = /^not ok \d+ - (.+)$/.exec(line);
    if (m) failed.push(m[1].trim());
  }
  return { code: r.status, failed, out };
}

const mutants = [
  {
    id: 'M1',
    name: 'kill-switch gate always returns false (fix forced OFF)',
    needle: `    _tfDownshiftAnchorFixEnabled() {
        try {
            if (typeof window !== 'undefined'
                && window.__TALARIA_DISABLE_TF_DOWNSHIFT_ANCHOR_FIX_V1) {
                return false;
            }
        } catch (_tfDsKill) { /* ignore */ }
        return true;
    }`,
    replacement: `    _tfDownshiftAnchorFixEnabled() {
        try {
            if (typeof window !== 'undefined'
                && window.__TALARIA_DISABLE_TF_DOWNSHIFT_ANCHOR_FIX_V1) {
                return false;
            }
        } catch (_tfDsKill) { /* ignore */ }
        return false;
    }`,
  },
  {
    id: 'M2',
    name: 'invert kill-switch polarity (flag enables fix)',
    needle: `    _tfDownshiftAnchorFixEnabled() {
        try {
            if (typeof window !== 'undefined'
                && window.__TALARIA_DISABLE_TF_DOWNSHIFT_ANCHOR_FIX_V1) {
                return false;
            }
        } catch (_tfDsKill) { /* ignore */ }
        return true;
    }`,
    replacement: `    _tfDownshiftAnchorFixEnabled() {
        try {
            if (typeof window !== 'undefined'
                && window.__TALARIA_DISABLE_TF_DOWNSHIFT_ANCHOR_FIX_V1) {
                return true;
            }
        } catch (_tfDsKill) { /* ignore */ }
        return false;
    }`,
  },
  {
    id: 'M3',
    name: 'period-end branch returns bar.t (legacy start)',
    needle: '        if (Number.isFinite(endMs) && endMs > bar.t) return endMs - 1;',
    replacement: '        if (Number.isFinite(endMs) && endMs > bar.t) return bar.t;',
  },
  {
    id: 'M4',
    name: 'live follow-latest site uses rightBar.t (skips helper)',
    needle: '                anchorTs = this._resolveTfSwitchRightEdgeAnchorTs(rightBar, rightBarIdx);',
    replacement: '                anchorTs = rightBar.t;',
  },
  {
    id: 'M5',
    name: 'replay follow-latest site uses lastBar.t (skips helper)',
    needle: '                anchorTs = this._resolveTfSwitchRightEdgeAnchorTs(lastBar, lastIdx);',
    replacement: '                anchorTs = lastBar.t;',
  },
  {
    id: 'M6',
    name: 'drop userOwnsViewport gate (panned forced onto playhead path)',
    needle: '        if (userOwnsViewport) {\n            // Panned / manual zoom: keep the left edge pinned at the same screen X.\n            anchorMode = \'viewportLeft\';',
    replacement: '        if (false && userOwnsViewport) {\n            // Panned / manual zoom: keep the left edge pinned at the same screen X.\n            anchorMode = \'viewportLeft\';',
  },
  {
    id: 'M7',
    name: 'empty recovery reverts to unforced sync + always-return (lock blocks forever)',
    needle: `                    const _tfDsFix = typeof this._tfDownshiftAnchorFixEnabled === 'function'
                        && this._tfDownshiftAnchorFixEnabled();
                    const _userOwnsVp = !!(rs.userHasPanned || rs.autoScrollEnabled === false);
                    if (_tfDsFix && !_userOwnsVp && this._tfSwitchAnchorLock) {
                        this._clearTfSwitchAnchorLock();
                    }
                    const _syncedEmpty = rs.syncReplayViewportToPlayhead(this, {
                        centerPlayhead: true,
                        resetPriceScale: true,
                        forceRecenter: (_tfDsFix && !_userOwnsVp) ? true : undefined,
                        render: true,
                    });
                    if (_syncedEmpty) {
                        window.__talariaBl2bLog && window.__talariaBl2bLog('chart.js:_scheduleViewportEmptyRecovery', this, __bl2bBefore, { path: 'syncReplayViewportToPlayhead' });
                        return;
                    }
                    if (!_tfDsFix || _userOwnsVp) {
                        window.__talariaBl2bLog && window.__talariaBl2bLog('chart.js:_scheduleViewportEmptyRecovery', this, __bl2bBefore, { path: 'syncReplayViewportToPlayhead' });
                        return;
                    }
                    // Fix ON + follow-latest: fall through to jumpToLatest.`,
    replacement: `                    rs.syncReplayViewportToPlayhead(this, {
                        centerPlayhead: true,
                        resetPriceScale: true,
                        render: true,
                    });
                    window.__talariaBl2bLog && window.__talariaBl2bLog('chart.js:_scheduleViewportEmptyRecovery', this, __bl2bBefore, { path: 'syncReplayViewportToPlayhead' });
                    return;`,
  },
];

console.log('=== TF-DOWNSHIFT-ANCHOR mutation set ===');
console.log(`baseline sha256=${CANON_SHA.slice(0, 16)}…`);

{
  const base = runSuite();
  if (base.code !== 0) {
    console.error('FATAL: baseline suite not green');
    console.error(base.failed.join('\n') || base.out.slice(-2000));
    process.exit(2);
  }
  console.log('baseline: PASS');
}

let survived = 0;
for (const m of mutants) {
  let src = CANON_BYTES.toString('utf8');
  const a1 = applyOnce(src, m.needle, m.replacement, m.id);
  if (!a1.ok) {
    console.log(`MUTANT ${m.id} — ${a1.reason} — ${m.name}`);
    survived += 1;
    continue;
  }
  src = a1.source;

  const mutBuf = Buffer.from(src, 'utf8');
  writeRetry(CANON, mutBuf);
  writeRetry(MIRROR, mutBuf);
  let result;
  try {
    result = runSuite();
  } finally {
    restoreAll();
  }

  const diedHard = result.code !== 0;
  if (!diedHard) survived += 1;
  console.log(`MUTANT ${m.id} — ${diedHard ? 'DIED' : 'SURVIVED'} — ${m.name}`);
  if (result.failed.length) {
    for (const f of result.failed) console.log(`    killed by cell: ${f}`);
  } else if (diedHard) {
    console.log('    killed by suite non-zero exit (parse/syntax)');
  }
}

console.log(`\n${mutants.length} designed / ${survived} survived`);
if (survived !== 0) {
  console.error('REJECT: one or more mutants survived or were not applied');
  process.exit(1);
}
console.log('ALL MUTANTS KILLED');
