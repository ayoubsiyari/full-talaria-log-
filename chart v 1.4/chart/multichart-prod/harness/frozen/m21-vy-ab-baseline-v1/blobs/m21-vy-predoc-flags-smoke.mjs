/**
 * b61 harness smoke for M21_VY_PREDOC_FLAGS — no GREEN, no long matrix.
 * STATUS: PRELIMINARY-HARNESS-READY
 *
 *   M19_EXPECTED_BUILD_ID=20260724b61 M19_DEPLOYED_ORIGIN=http://31.97.192.82:3000 \
 *     node m21-vy-predoc-flags-smoke.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer, normalizeDeployedOrigin } from './serve.mjs';
import { bootLayout, launchBrowser } from './harness-lib.mjs';
import {
  parsePredocFlagsEnv,
  buildPredocFlagsHook,
  composePredocWithProbe,
  predocEvidenceStub,
} from './m21-vy-predoc-flags.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATUS = 'PRELIMINARY-HARNESS-READY';
const EXPECTED = String(process.env.M19_EXPECTED_BUILD_ID || '20260724b61').trim();
const KILL = '__TALARIA_DISABLE_M19I_EXACT_TAIL_PAINT_V1';

async function cell(browser, server, flagJson, label) {
  const parsed = parsePredocFlagsEnv(flagJson);
  if (!parsed.ok) return { label, ok: false, error: parsed.error };
  const boot = await bootLayout(browser, server, {
    pair: 'same',
    panels: 1,
    tf: '1m',
    bug: false,
    preDocument: composePredocWithProbe(
      parsed.noop ? null : buildPredocFlagsHook(parsed.applied),
      {
        fn: () => {
          window.__m21vySmokeProbe = {
            at: performance.now(),
            chartDefined: typeof window.chart !== 'undefined',
          };
        },
        args: [],
      },
    ),
  });
  const { page } = boot;
  const live = await page.evaluate((kill) => ({
    flag: window[kill],
    predoc: window.__m21vyPredoc || null,
    smoke: window.__m21vySmokeProbe || null,
    build: (typeof CHART_ENGINE_BUILD === 'string') ? CHART_ENGINE_BUILD : null,
  }), KILL);
  await page.close().catch(() => {});
  return {
    label,
    ok: true,
    parsed: predocEvidenceStub(parsed),
    live: {
      flag: live.flag === undefined ? null : live.flag,
      beforeApp: live.predoc?.beforeApp ?? null,
      applied: live.predoc?.applied || {},
      smokeChartDefinedAtProbe: live.smoke?.chartDefined ?? null,
      build: live.build,
    },
  };
}

async function main() {
  const origin = normalizeDeployedOrigin(process.env.M19_DEPLOYED_ORIGIN);
  if (!origin) throw new Error('M19_DEPLOYED_ORIGIN required');
  const up = await fetch(`${origin}/chart/chart.js`, { cache: 'no-store' }).then((r) => r.text());
  const m = up.match(/const\s+CHART_ENGINE_BUILD\s*=\s*['"](\d{8}b\d+)['"]/);
  if (!m || m[1] !== EXPECTED) throw new Error(`build pin fail ${m?.[1]} != ${EXPECTED}`);

  const server = await startServer();
  const browser = await launchBrowser({ headful: false });
  const cells = [];
  try {
    cells.push(await cell(browser, server, '', 'absent-noop'));
    cells.push(await cell(browser, server, JSON.stringify({ [KILL]: true }), 'ab-off-kill-true'));
    cells.push(await cell(browser, server, JSON.stringify({ [KILL]: false }), 'ab-on-explicit-false'));
    cells.push(await cell(browser, server, JSON.stringify({}), 'ab-on-empty-object'));
    // invalid must fail closed without boot
    const bad = parsePredocFlagsEnv(JSON.stringify({ __NOT_ALLOWLISTED__: true }));
    cells.push({
      label: 'invalid-unknown-reject',
      ok: !bad.ok,
      error: bad.error,
      rejectedKeys: bad.rejectedKeys,
    });
  } finally {
    await browser.close().catch(() => {});
    try { server.close?.(); } catch (_e) { /* */ }
  }

  const absent = cells.find((c) => c.label === 'absent-noop');
  const killOn = cells.find((c) => c.label === 'ab-off-kill-true');
  const explicitFalse = cells.find((c) => c.label === 'ab-on-explicit-false');
  const emptyObj = cells.find((c) => c.label === 'ab-on-empty-object');
  const invalid = cells.find((c) => c.label === 'invalid-unknown-reject');

  const asserts = {
    absentNoop: absent?.live?.flag == null,
    killTrue: killOn?.live?.flag === true && killOn?.live?.beforeApp === true,
    explicitFalse: explicitFalse?.live?.flag === false,
    emptyObjectNoFlag: emptyObj?.live?.flag == null,
    invalidRejected: invalid?.ok === true,
    buildPin: EXPECTED,
    noGreenClaim: true,
  };
  const allPass = Object.entries(asserts)
    .filter(([k]) => k !== 'buildPin' && k !== 'noGreenClaim')
    .every(([, v]) => v === true);

  const result = {
    ticket: 'M21-VY-PREDOC-FLAGS-B61-SMOKE',
    status: STATUS,
    phase: 'HARNESS-SMOKE',
    noGreenClaim: true,
    noAcceptedGreen: true,
    noProductEdits: true,
    buildPin: { expected: EXPECTED, upstream: m[1], match: true },
    cells,
    asserts,
    allPass,
    verdict: allPass ? 'M21-VY-PREDOC-FLAGS-SMOKE-PASS-PRELIMINARY' : 'M21-VY-PREDOC-FLAGS-SMOKE-FAIL',
    pass: false,
    note: 'b61 hook smoke only — b62 painted GREEN waits product land + exact digest',
    nextQueue: 'exact-digest b62 15/60/100 A/B and auth measurement 1a',
    signature: STATUS,
  };

  const out = path.resolve(__dirname, '../../../../docs/plan3/evidence/W5-M21-VY-PREDOC-FLAGS-b61-SMOKE.PRELIMINARY.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = allPass ? 0 : 1;
}

main().catch((err) => {
  process.stderr.write(`${err?.stack || err}\n`);
  process.exitCode = 2;
});
