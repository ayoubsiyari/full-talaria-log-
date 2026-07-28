/**
 * B-W18 mutation + VER-04 runner — kill-switches for the B-W16 hydration guard
 * and the B-W17 sweep parse guard.
 *
 *   node "chart v 1.4/chart/modules/b-w18-killswitch.mutants.mjs"
 *
 * Client mutants are written to a scratch dir and run via BW16_TARGET, so
 * order-manager.js is never rewritten.
 *
 * Backend mutants CANNOT use that trick: the pytest suite imports `api_server`
 * from the chart directory, so api_server.py is patched IN PLACE and restored.
 * Every write goes through Buffer read/write — never a text API — because
 * Python's write_text and PowerShell's Set-Content translate \n to \r\n on
 * Windows and a read_text() == original check reads straight back through the
 * corruption. Restoration is verified by SHA-256 over the raw bytes after every
 * single mutant, and the run aborts loudly if a hash ever fails to match.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CHART_DIR = path.resolve(__dirname, '..');
const CLIENT_SRC = path.join(__dirname, 'order-manager.js');
const CLIENT_TEST = path.join(__dirname, 'b-w16-hydration-guard.test.mjs');
const API_SRC = path.join(CHART_DIR, 'api_server.py');
const PY_TEST = 'tests/test_b_w17_journal_sweep_guard.py';
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'bw18-variants-'));

const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

const CLIENT_BYTES = fs.readFileSync(CLIENT_SRC);
const API_BYTES = fs.readFileSync(API_SRC);
const CLIENT_SHA = sha(CLIENT_BYTES);
const API_SHA = sha(API_BYTES);
const clientSrc = CLIENT_BYTES.toString('utf8');
const apiSrc = API_BYTES.toString('utf8');

// ── anchors ───────────────────────────────────────────────────────────────────
const CLIENT_HELPER = `function _bW16HydrationGuardEnabled() {
    if (typeof window === 'undefined') return true;
    const kill = window.__TALARIA_DISABLE_B_W16_HYDRATION_GUARD_V1;
    if (kill === undefined || kill === null) return true;
    return !['1', 'true', 'yes', 'on'].includes(String(kill).trim().toLowerCase());
}`;
const CLIENT_GUARD_IF = `            if (_bW16HydrationGuardEnabled() && !journalVouchedFor) {`;
const CLIENT_HOT_OPEN = `        if (this.chart && typeof this.chart.scheduleSessionStateSave === 'function') {`;

const PY_FLAG = `    parse_guard_enabled = os.getenv(
        "JOURNAL_SWEEP_PARSE_GUARD_ENABLED", "true"
    ).strip().lower() not in {"0", "false", "no", "off"}`;
const PY_GUARD_IF = `    if unresolved_incoming and parse_guard_enabled:`;
const PY_DELETE_LOG_IF = `    if orphans:
        # Reporting must never be able to abort or roll back the delete above.`;

function must(hay, needle, label) {
  if (!hay.includes(needle)) throw new Error(`anchor missing: ${label}`);
}
must(clientSrc, CLIENT_HELPER, 'client-helper');
must(clientSrc, CLIENT_GUARD_IF, 'client-guard-if');
must(clientSrc, CLIENT_HOT_OPEN, 'client-hot-open');
must(apiSrc, PY_FLAG, 'py-flag');
must(apiSrc, PY_GUARD_IF, 'py-guard-if');
must(apiSrc, PY_DELETE_LOG_IF, 'py-delete-log-if');

// ── runners ───────────────────────────────────────────────────────────────────
function runClient(file) {
  const r = spawnSync(process.execPath, [CLIENT_TEST], {
    env: { ...process.env, BW16_TARGET: file },
    encoding: 'utf8',
  });
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  const failed = out.split('\n').filter((l) => l.startsWith('FAIL ')).map((l) => l.slice(5).split(' —')[0]);
  return { code: r.status, failed, out };
}

/** Patch api_server.py in place (bytes only), run pytest, always restore + verify. */
function runBackendWith(source) {
  fs.writeFileSync(API_SRC, Buffer.from(source, 'utf8'));
  let r;
  try {
    r = spawnSync('py', ['-m', 'pytest', PY_TEST, '-q', '-p', 'no:warnings'], {
      cwd: CHART_DIR,
      encoding: 'utf8',
      shell: true,
    });
  } finally {
    fs.writeFileSync(API_SRC, API_BYTES);
    const back = sha(fs.readFileSync(API_SRC));
    if (back !== API_SHA) {
      console.error(`FATAL: api_server.py NOT restored (sha ${back} != ${API_SHA})`);
      process.exit(2);
    }
  }
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  const failed = (out.match(/^FAILED (\S+)/gm) || []).map((l) => l.replace('FAILED ', ''));
  return { code: r.status, failed, out };
}

function writeVariant(tag, source) {
  const f = path.join(OUT, `${tag}.js`);
  fs.writeFileSync(f, Buffer.from(source, 'utf8'));
  return f;
}

function tail(out, n = 3) {
  return out.trim().split('\n').filter(Boolean).slice(-n).join(' | ');
}

// ── mutation set (BRIEF §5) ───────────────────────────────────────────────────
const mutants = [
  {
    n: 1,
    name: 'client kill defaults to DISABLED when `window` is absent',
    client: (s) => s.replace(
      `function _bW16HydrationGuardEnabled() {\n    if (typeof window === 'undefined') return true;`,
      `function _bW16HydrationGuardEnabled() {\n    if (typeof window === 'undefined') return false;`,
    ),
  },
  {
    n: 2,
    name: 'client kill INVERTED (guard active only when the flag is set)',
    client: (s) => s.replace(CLIENT_HELPER, `function _bW16HydrationGuardEnabled() {
    if (typeof window === 'undefined') return false;
    const kill = window.__TALARIA_DISABLE_B_W16_HYDRATION_GUARD_V1;
    if (kill === undefined || kill === null) return false;
    return ['1', 'true', 'yes', 'on'].includes(String(kill).trim().toLowerCase());
}`),
  },
  {
    n: 3,
    name: 'backend default flipped to "false" (fails OFF when unset)',
    backend: (s) => s.replace(
      `"JOURNAL_SWEEP_PARSE_GUARD_ENABLED", "true"`,
      `"JOURNAL_SWEEP_PARSE_GUARD_ENABLED", "false"`,
    ),
  },
  {
    n: 4,
    name: 'backend flag ALSO gates the [JOURNAL-DELETE] record',
    backend: (s) => s.replace(
      PY_DELETE_LOG_IF,
      `    if orphans and parse_guard_enabled:
        # Reporting must never be able to abort or roll back the delete above.`,
    ),
  },
  {
    n: 5,
    name: 'client kill ALSO disables the hot autosave path',
    client: (s) => s.replace(
      CLIENT_HOT_OPEN,
      `        if (_bW16HydrationGuardEnabled() && this.chart && typeof this.chart.scheduleSessionStateSave === 'function') {`,
    ),
  },
  {
    n: 6,
    name: 'kill WIRED UP BUT DOES NOTHING — guard still suppresses / still refuses',
    client: (s) => s.replace(CLIENT_GUARD_IF, `            if (!journalVouchedFor) {`),
    backend: (s) => s.replace(PY_GUARD_IF, `    if unresolved_incoming:`),
  },
];

let survived = 0;
console.log('=== B-W18 mutation set ===');
for (const m of mutants) {
  const killedBy = [];
  let applied = true;

  if (m.client) {
    const mutated = m.client(clientSrc);
    if (mutated === clientSrc) applied = false;
    else {
      const r = runClient(writeVariant(`mutant-${m.n}`, mutated));
      if (r.code !== 0) killedBy.push(`client: ${r.failed.join(', ')}`);
    }
  }
  if (applied && m.backend) {
    const mutated = m.backend(apiSrc);
    if (mutated === apiSrc) applied = false;
    else {
      const r = runBackendWith(mutated);
      if (r.code !== 0) killedBy.push(`backend: ${r.failed.join(', ') || tail(r.out, 1)}`);
    }
  }

  if (!applied) {
    console.log(`MUTANT ${m.n} — NOT APPLIED (anchor did not change): ${m.name}`);
    survived += 1;
    continue;
  }
  const died = killedBy.length > 0;
  if (!died) survived += 1;
  console.log(`MUTANT ${m.n} — ${died ? 'DIED' : 'SURVIVED'} — ${m.name}`);
  for (const k of killedBy) console.log(`    killed by ${k}`);
}
console.log(`\n${mutants.length} designed / ${survived} survived`);

// ── VER-04 ────────────────────────────────────────────────────────────────────
// Half (a): the no-op stub — the pre-B-W18 sources, i.e. the B-W18 change does
// nothing at all. Must FAIL, or the new cells are vacuous.
// Half (b): an independent reimplementation of both switches, written from the
// brief's prose in a deliberately different shape. Must PASS.
console.log('\n=== VER-04 ===');

// Everything B-W18 added to the client, verbatim.
const CLIENT_ADDED_HELPER = `
/**
 * B-W18 rollback lever for the B-W16 durable-journal hydration guard — default ON.
 *
 * Fail-safe, not a feature flag: ONLY an explicitly recognised affirmative value
 * disables the guard. Unset, null, '', 0, 'false', 'off' or any typo leaves the
 * guard ACTIVE, as does an absent \`window\`. The failure directions are not
 * symmetric — a guard that silently fails off deletes a user's trade journal.
 * Recognised disable values (after String/trim/lowercase): '1', 'true', 'yes',
 * 'on' — the same vocabulary as the backend JOURNAL_SWEEP_PARSE_GUARD_ENABLED
 * lever, so one incident runbook covers both surfaces.
 */
${CLIENT_HELPER}
`;
const CLIENT_ADDED_COMMENT = `            // B-W18 rollback lever: when the kill is engaged this branch is skipped
            // entirely and the durable write proceeds exactly as it did pre-B-W16 —
            // same return shape, no suppression, no warning. The guard condition
            // itself is unchanged.
`;
must(clientSrc, CLIENT_ADDED_HELPER, 'client-added-helper');
must(clientSrc, CLIENT_ADDED_COMMENT, 'client-added-comment');

const PY_ADDED_BLOCK = `    # B-W18 rollback lever. Read at CALL time, not import time: an incident must be
    # able to flip this without a reimport or a redeploy, and the acceptance cells
    # toggle it per-case. Fail-safe, not a feature flag: only an explicitly recognised
    # negative value disables the guard. Unset, "", or any unrecognised/typo'd value
    # leaves the guard ACTIVE, because a guard that silently fails off deletes trades.
    # Recognised disable values (after strip/lower): "0", "false", "no", "off".
    # NOTE: this deliberately does NOT gate the [JOURNAL-DELETE] record below — when
    # the guard is off the sweep deletes again, which is exactly when the record matters.
${PY_FLAG}

`;
must(apiSrc, PY_ADDED_BLOCK, 'py-added-block');

const clientBaselineStripped = clientSrc
  .replace(CLIENT_ADDED_HELPER, '')
  .replace(CLIENT_ADDED_COMMENT, '')
  .replace(CLIENT_GUARD_IF, `            if (!journalVouchedFor) {`);
if (clientBaselineStripped.includes('_bW16HydrationGuardEnabled')) {
  throw new Error('VER-04: client baseline still references the kill helper');
}

const apiBaseline = apiSrc
  .replace(PY_ADDED_BLOCK, '')
  .replace(PY_GUARD_IF, `    if unresolved_incoming:`);
if (apiBaseline.includes('parse_guard_enabled')) {
  throw new Error('VER-04: backend baseline still references parse_guard_enabled');
}

function reportHalf(label, clientSource, apiSource, expectPass) {
  const c = runClient(writeVariant(`${label}-client`, clientSource));
  const b = runBackendWith(apiSource);
  const pass = c.code === 0 && b.code === 0;
  const verdict = expectPass
    ? (pass ? 'PASSES (as required)' : 'FAILS (VER-04 half b BROKEN)')
    : (pass ? 'PASSES (VACUOUS ACCEPTANCE)' : 'DIES (as required)');
  console.log(`${label}: ${verdict}`);
  console.log(`    client: exit=${c.code} failing=${c.failed.join(', ') || '(none)'}`);
  console.log(`    backend: exit=${b.code} failing=${b.failed.join(', ') || '(none)'} :: ${tail(b.out, 1)}`);
  return pass;
}

reportHalf('no-op stub (pre-B-W18 sources)', clientBaselineStripped, apiBaseline, false);

// Independent reimplementation: different names, different normalisation, a
// nested branch instead of a conjunct on the client; a closure over os.environ
// with casefold and a tuple on the backend.
const CLIENT_REIMPL_HELPER = `const _BW18_KILL_WORDS = new Set(['1', 'true', 'yes', 'on']);

function _bW16GuardKilled() {
    if (typeof window !== 'object' || window === null) return false;
    const raw = window.__TALARIA_DISABLE_B_W16_HYDRATION_GUARD_V1;
    if (raw === null || raw === undefined) return false;
    let text;
    try { text = \`\${raw}\`; } catch (err) { return false; }
    return _BW18_KILL_WORDS.has(text.trim().toLowerCase());
}

`;
const CLIENT_REIMPL_ANCHOR = `/** I16 — build_id + schema_version on persisted order/trade rows — default ON. */`;
if (!clientBaselineStripped.includes(CLIENT_REIMPL_ANCHOR)) throw new Error('VER-04: reimpl anchor missing');
const clientReimpl = clientBaselineStripped
  .replace(CLIENT_REIMPL_ANCHOR, CLIENT_REIMPL_HELPER + CLIENT_REIMPL_ANCHOR)
  .replace(`            if (!journalVouchedFor) {
                console.warn("📔 durable journal write suppressed:`,
    `            if (!journalVouchedFor && !_bW16GuardKilled()) {
                console.warn("📔 durable journal write suppressed:`);

const apiReimpl = apiBaseline.replace(`    if unresolved_incoming:`, `    def _b_w18_parse_guard_disabled() -> bool:
        raw = os.environ.get("JOURNAL_SWEEP_PARSE_GUARD_ENABLED")
        if raw is None:
            return False
        return raw.strip().casefold() in ("0", "false", "no", "off")

    if unresolved_incoming and not _b_w18_parse_guard_disabled():`);

reportHalf('independent reimplementation', clientReimpl, apiReimpl, true);

// ── final byte-level restoration check ────────────────────────────────────────
const clientBack = sha(fs.readFileSync(CLIENT_SRC));
const apiBack = sha(fs.readFileSync(API_SRC));
console.log('\n=== byte-level restoration ===');
console.log(`order-manager.js: ${clientBack === CLIENT_SHA ? 'INTACT' : 'CHANGED'} ${clientBack}`);
console.log(`api_server.py:    ${apiBack === API_SHA ? 'INTACT' : 'CHANGED'} ${apiBack}`);
console.log(`\nvariants: ${OUT}`);
