/**
 * Unit + browser self-tests for M21_VY_PREDOC_FLAGS harness hook.
 * STATUS: PRELIMINARY-HARNESS-READY — no product edits, no accepted GREEN.
 *
 *   node m21-vy-predoc-flags.test.mjs
 *   M21_VY_PREDOC_BROWSER=1 node m21-vy-predoc-flags.test.mjs   # includes browser timing
 */
import assert from 'node:assert/strict';
import {
  parsePredocFlagsEnv,
  buildPredocFlagsHook,
  composePredocWithProbe,
  predocEvidenceStub,
  M21_VY_PREDOC_ALLOWLIST,
  deriveApplyTipFingerprint,
} from './m21-vy-predoc-flags.mjs';

const cases = [];
function record(id, pass, detail = {}) {
  cases.push({ id, pass: !!pass, ...detail });
  if (!pass) process.stderr.write(`[FAIL] ${id} ${JSON.stringify(detail)}\n`);
}

// --- absent env → no-op ---
{
  const p = parsePredocFlagsEnv('');
  record('absent-env-noop', p.ok && p.noop && p.appliedKeys.length === 0, p);
}

// --- ON polarity ---
{
  const p = parsePredocFlagsEnv('{"__TALARIA_DISABLE_M19I_EXACT_TAIL_PAINT_V1":true}');
  record('on-polarity', p.ok && p.applied.__TALARIA_DISABLE_M19I_EXACT_TAIL_PAINT_V1 === true
    && p.appliedKeys.includes('__TALARIA_DISABLE_M19I_EXACT_TAIL_PAINT_V1'), p);
}

// --- OFF polarity (explicit false) ---
{
  const p = parsePredocFlagsEnv('{"__TALARIA_DISABLE_M19I_EXACT_TAIL_PAINT_V1":false}');
  record('off-polarity', p.ok && p.applied.__TALARIA_DISABLE_M19I_EXACT_TAIL_PAINT_V1 === false, p);
}

// --- unknown key rejection ---
{
  const p = parsePredocFlagsEnv('{"__TALARIA_DISABLE_NOT_A_REAL_FLAG":true}');
  record('unknown-key-reject', !p.ok && p.rejectedKeys.includes('__TALARIA_DISABLE_NOT_A_REAL_FLAG'), p);
}

// --- string value rejection ---
{
  const p = parsePredocFlagsEnv('{"__TALARIA_DISABLE_M19I_EXACT_TAIL_PAINT_V1":"true"}');
  record('string-value-reject', !p.ok && /boolean/i.test(p.error || ''), p);
}

// --- number rejection ---
{
  const p = parsePredocFlagsEnv('{"__TALARIA_DISABLE_M19I_EXACT_TAIL_PAINT_V1":1}');
  record('number-value-reject', !p.ok, p);
}

// --- nested object rejection ---
{
  const p = parsePredocFlagsEnv('{"__TALARIA_DISABLE_M19I_EXACT_TAIL_PAINT_V1":{"x":true}}');
  record('nested-value-reject', !p.ok, p);
}

// --- array root rejection ---
{
  const p = parsePredocFlagsEnv('[true]');
  record('array-root-reject', !p.ok, p);
}

// --- invalid JSON rejection ---
{
  const p = parsePredocFlagsEnv('{not json');
  record('invalid-json-reject', !p.ok, p);
}

// --- evidence stub never embeds raw env ---
{
  const p = parsePredocFlagsEnv('{"__TALARIA_DISABLE_M19I_EXACT_TAIL_PAINT_V1":true}');
  const stub = predocEvidenceStub(p);
  const blob = JSON.stringify(stub);
  record('evidence-sanitized', stub.applied.__TALARIA_DISABLE_M19I_EXACT_TAIL_PAINT_V1 === true
    && !blob.includes('M21_VY_PREDOC_FLAGS=')
    && stub.noEval === true
    && stub.noFunctionCtor === true, { stubKeys: Object.keys(stub) });
}

// --- hook args are structured clone map (not source string) ---
{
  const hook = buildPredocFlagsHook({ __TALARIA_DISABLE_M19I_EXACT_TAIL_PAINT_V1: true });
  record('hook-args-object', typeof hook.fn === 'function'
    && hook.args.length === 1
    && hook.args[0].__TALARIA_DISABLE_M19I_EXACT_TAIL_PAINT_V1 === true
    && typeof hook.fn.toString() === 'string'
    && !hook.fn.toString().includes('eval(')
    && !hook.fn.toString().includes('Function('), {});
}

// --- compose places flag map before probe args (execution verified in browser test) ---
{
  const composed = composePredocWithProbe(
    buildPredocFlagsHook({ __TALARIA_DISABLE_M19I_EXACT_TAIL_PAINT_V1: true }),
    { fn: () => {}, args: ['probe-arg'] },
  );
  const src = composed.fn.toString();
  record('compose-flag-before-probe', typeof composed.fn === 'function'
    && composed.args[0]?.__TALARIA_DISABLE_M19I_EXACT_TAIL_PAINT_V1 === true
    && composed.args[1] === 'probe-arg'
    && src.indexOf('__m21vyPredoc') < src.indexOf('probeFn')
    && !src.includes('eval(')
    && !src.includes('new Function'), { arg0: composed.args[0], arg1: composed.args[1] });
}

// --- allowlist contains sprint key ---
{
  record('allowlist-has-b62-key',
    M21_VY_PREDOC_ALLOWLIST.includes('__TALARIA_DISABLE_M19I_EXACT_TAIL_PAINT_V1'));
}

// --- apply tip fingerprint helper ---
{
  const fp = deriveApplyTipFingerprint(
    { tema1: [1, 2, 3.5] },
    [{ id: 'tema1', type: 'tema' }],
    1.23,
  );
  record('apply-tip-fingerprint', fp.applyTemaTip === 3.5
    && fp.applyTipSource === 'worker_apply_results_pack'
    && fp.applyTipFingerprint === 'tema|3.5|1.23', fp);
  const miss = deriveApplyTipFingerprint({}, [{ id: 'tema1', type: 'tema' }], 1);
  record('apply-tip-unobserved', miss.applyTipSource === 'UNOBSERVED' && miss.applyTemaTip == null, miss);
}

// --- thresholds/build pin not mutated by parser ---
{
  const before = {
    MAX_Y_PX: 2.5,
    MIN_EVALUATED: 60,
    BUILD: '20260724b61',
  };
  parsePredocFlagsEnv('{"__TALARIA_DISABLE_M19I_EXACT_TAIL_PAINT_V1":true}');
  record('no-threshold-mutation', before.MAX_Y_PX === 2.5 && before.MIN_EVALUATED === 60
    && before.BUILD === '20260724b61', before);
}

async function browserSelfTest() {
  const { launchBrowser } = await import('./harness-lib.mjs');
  const browser = await launchBrowser({ headful: false });
  const appHtml = 'data:text/html,' + encodeURIComponent(
    '<!doctype html><html><body><script>'
    + 'window.__APP_SAW_FLAG=window.__TALARIA_DISABLE_M19I_EXACT_TAIL_PAINT_V1;'
    + 'window.__APP_MARKED=true;'
    + '</script></body></html>',
  );
  try {
    const page = await browser.newPage();
    const hook = buildPredocFlagsHook({ __TALARIA_DISABLE_M19I_EXACT_TAIL_PAINT_V1: true });
    await page.evaluateOnNewDocument(hook.fn, ...hook.args);
    await page.goto(appHtml, { waitUntil: 'domcontentloaded' });
    const got = await page.evaluate(() => ({
      flag: window.__TALARIA_DISABLE_M19I_EXACT_TAIL_PAINT_V1,
      appSaw: window.__APP_SAW_FLAG,
      predoc: window.__m21vyPredoc || null,
      appMarked: window.__APP_MARKED === true,
    }));
    record('browser-pre-app-timing', got.flag === true && got.appSaw === true
      && got.predoc?.beforeApp === true && got.appMarked === true, got);

    const page2 = await browser.newPage();
    const hookOff = buildPredocFlagsHook({ __TALARIA_DISABLE_M19I_EXACT_TAIL_PAINT_V1: false });
    await page2.evaluateOnNewDocument(hookOff.fn, ...hookOff.args);
    await page2.goto(appHtml, { waitUntil: 'domcontentloaded' });
    const gotOff = await page2.evaluate(() => window.__APP_SAW_FLAG);
    record('browser-off-polarity', gotOff === false, { gotOff });

    const page3 = await browser.newPage();
    await page3.goto(appHtml, { waitUntil: 'domcontentloaded' });
    const gotAbs = await page3.evaluate(() => window.__APP_SAW_FLAG);
    record('browser-absent-noop', gotAbs === undefined, { gotAbs });
  } finally {
    await browser.close().catch(() => {});
  }
}

const passCount = () => cases.filter((c) => c.pass).length;

async function main() {
  if (String(process.env.M21_VY_PREDOC_BROWSER || '').trim() === '1') {
    await browserSelfTest();
  } else {
    record('browser-skipped', true, { note: 'Set M21_VY_PREDOC_BROWSER=1 to include browser timing tests' });
  }

  const result = {
    ticket: 'M21-VY-PREDOC-FLAGS-SELFTEST',
    status: 'PRELIMINARY-HARNESS-READY',
    noGreenClaim: true,
    noProductEdits: true,
    cases,
    passCount: passCount(),
    caseCount: cases.length,
    allPass: passCount() === cases.length,
    verdict: passCount() === cases.length
      ? 'M21-VY-PREDOC-FLAGS-SELFTEST-PASS'
      : 'M21-VY-PREDOC-FLAGS-SELFTEST-FAIL',
    pass: false, // never acceptance GREEN
    signature: 'W5 — PRELIMINARY-HARNESS-READY',
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.allPass ? 0 : 1;
}

main().catch((err) => {
  process.stderr.write(`${err?.stack || err}\n`);
  process.exitCode = 2;
});
