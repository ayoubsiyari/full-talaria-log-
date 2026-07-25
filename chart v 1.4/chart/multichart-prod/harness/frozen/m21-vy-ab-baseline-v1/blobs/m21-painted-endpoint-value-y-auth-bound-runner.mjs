/**
 * Auth-bound runner for M21 value/Y painted-endpoint oracle — real-product PO cell.
 *
 * STATUS: PRELIMINARY-PENDING-GPT56-INDEPENDENT-VERIFY
 * NO product edits. NO GREEN claim. NO admin credentials. NO acceptance RED.
 *
 * PO exact real-product cell requires ONLY (non-admin QA):
 *   TEST_EMAIL
 *   TEST_PASSWORD
 *   TEST_VPS_URL          e.g. http://31.97.192.82:3000
 *
 * Defaults (no extra env required):
 *   M19_EXPECTED_BUILD_ID → 20260724b61
 *   M19_DEPLOYED_ORIGIN   → TEST_VPS_URL
 *
 * Default path: UI login → pin /chart/chart.js → open /chart/dist-v9 → confirm
 * engine build → install VALUE/Y hooks → short sample if bars available.
 *
 * Optional:
 *   M21_VY_AUTH_HARNESS=1  also/instead spawn synthetic 4-panel harness oracle
 *   M21_VY_OUT             evidence JSON path
 *
 * Usage:
 *   set TEST_EMAIL=qa@...
 *   set TEST_PASSWORD=...
 *   set TEST_VPS_URL=http://31.97.192.82:3000
 *   node m21-painted-endpoint-value-y-auth-bound-runner.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launchBrowser, sleep } from './harness-lib.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATUS = 'PRELIMINARY-PENDING-GPT56-INDEPENDENT-VERIFY';
const DEFAULT_BUILD = '20260724b61';
const DEFAULT_VPS = 'http://31.97.192.82:3000';

const email = String(process.env.TEST_EMAIL || process.env.L2_M1_TEST_EMAIL || '').trim();
const password = String(process.env.TEST_PASSWORD || process.env.L2_M1_TEST_PASSWORD || '').trim();
const vps = String(process.env.TEST_VPS_URL || '').replace(/\/$/, '');
const expected = String(process.env.M19_EXPECTED_BUILD_ID || DEFAULT_BUILD).trim();
const deployed = String(process.env.M19_DEPLOYED_ORIGIN || vps || DEFAULT_VPS).replace(/\/$/, '');
const wantHarness = String(process.env.M21_VY_AUTH_HARNESS || '').trim() === '1';
const outDefault = path.resolve(
  __dirname,
  '../../../../docs/plan3/evidence/W5-M21-PAINTED-ENDPOINT-VALUE-Y-AUTH-PRODUCT-b61.PRELIMINARY.json',
);
const outPath = process.env.M21_VY_OUT ? path.resolve(process.env.M21_VY_OUT) : outDefault;

function isAdminEmail(addr) {
  const e = String(addr || '').trim().toLowerCase();
  if (!e) return false;
  if (e === 'admin@talaria.io') return true;
  if (/^admin@/i.test(e)) return true;
  if (/admin/.test(e.split('@')[0] || '')) return true;
  return false;
}

function emit(code, payload) {
  const body = {
    status: STATUS,
    noGreenClaim: true,
    noAcceptedRedClaim: true,
    noProductEdits: true,
    pass: false,
    ...payload,
  };
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(body, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify(body, null, 2)}\n`);
  process.exitCode = code;
}

async function verifyUpstreamBuild(origin, expectedBuildId) {
  const engineUrl = `${origin}/chart/chart.js`;
  const res = await fetch(engineUrl, {
    method: 'GET',
    headers: { 'Cache-Control': 'no-store', Pragma: 'no-cache' },
    cache: 'no-store',
  });
  if (!res.ok) {
    return {
      ok: false,
      reason: `GET ${engineUrl} → ${res.status}`,
      upstreamObservedBuild: null,
    };
  }
  const text = await res.text();
  const m = text.match(/const\s+CHART_ENGINE_BUILD\s*=\s*['"](\d{8}b\d+)['"]/);
  const observed = m ? m[1] : null;
  return {
    ok: observed === expectedBuildId,
    upstreamObservedBuild: observed,
    expectedBuildId,
    engineUrl,
    bytes: text.length,
  };
}

async function typeInto(page, css, value) {
  await page.waitForSelector(css, { visible: true, timeout: 30_000 });
  const el = await page.$(css);
  if (!el) throw new Error(`missing ${css}`);
  await el.click({ clickCount: 3 });
  await page.keyboard.press('Backspace');
  await el.type(value, { delay: 15 });
}

async function clickSignIn(page) {
  const found = await page.evaluate(() => {
    const nodes = [...document.querySelectorAll('button, [role="button"]')];
    for (const el of nodes) {
      const t = (el.textContent || '').trim().replace(/\s+/g, ' ');
      if (!/^Sign In$/i.test(t)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }
    return null;
  });
  if (!found) throw new Error('Sign In button not found');
  await page.mouse.click(found.x, found.y, { delay: 40 });
}

async function uiLogin(browser, origin) {
  const page = await browser.newPage();
  await page.setCacheEnabled(false);
  await page.goto(`${origin}/login/`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
  await sleep(600);
  await page.waitForSelector('#email', { visible: true, timeout: 30_000 });
  await typeInto(page, '#email', email);
  await typeInto(page, 'input[name="password"]', password);
  await clickSignIn(page);
  const started = Date.now();
  let leftLogin = false;
  while (Date.now() - started < 45_000) {
    const url = page.url();
    if (url && !/\/login\/?/i.test(new URL(url).pathname)) {
      leftLogin = true;
      break;
    }
    await sleep(300);
  }
  return { page, leftLogin, url: page.url() };
}

function installProductHooks() {
  return () => {
    if (window.__m21vyInstalled) return;
    window.__m21vyInstalled = true;
    window.__m21vySink = {
      role: 'HOST',
      frames: [],
      sampling: false,
      captureDraws: false,
      strokeTips: [],
      lastStrokeTips: [],
    };
    const proto = CanvasRenderingContext2D.prototype;
    if (!proto.__m21vyWrapped) {
      const origMoveTo = proto.moveTo;
      const origLineTo = proto.lineTo;
      const origStroke = proto.stroke;
      let pathMaxX = -Infinity;
      let pathMaxY = null;
      let pathPoints = 0;
      proto.moveTo = function m21vyMoveTo(x, y, ...rest) {
        const sink = window.__m21vySink;
        if (sink && sink.captureDraws) {
          const nx = Number(x);
          const ny = Number(y);
          if (Number.isFinite(nx) && Number.isFinite(ny) && nx >= pathMaxX) {
            pathMaxX = nx;
            pathMaxY = ny;
          }
          pathPoints += 1;
        }
        return origMoveTo.call(this, x, y, ...rest);
      };
      proto.lineTo = function m21vyLineTo(x, y, ...rest) {
        const sink = window.__m21vySink;
        if (sink && sink.captureDraws) {
          const nx = Number(x);
          const ny = Number(y);
          if (Number.isFinite(nx) && Number.isFinite(ny) && nx >= pathMaxX) {
            pathMaxX = nx;
            pathMaxY = ny;
          }
          pathPoints += 1;
        }
        return origLineTo.call(this, x, y, ...rest);
      };
      proto.stroke = function m21vyStroke(...args) {
        const sink = window.__m21vySink;
        if (sink && sink.captureDraws && pathPoints > 0 && Number.isFinite(pathMaxX)) {
          sink.strokeTips.push({ x: pathMaxX, y: pathMaxY, points: pathPoints });
        }
        pathMaxX = -Infinity;
        pathMaxY = null;
        pathPoints = 0;
        return origStroke.apply(this, args);
      };
      proto.__m21vyWrapped = true;
    }
  };
}

async function sampleProductHost(page, { playMs = 8_000, speed = 60 } = {}) {
  return page.evaluate(async ({ playMs, speed }) => {
    const chart = window.chart;
    const replay = chart?.replaySystem;
    const sink = window.__m21vySink;
    if (!chart || !replay || !sink) {
      return { ok: false, reason: 'chart/replay/sink missing' };
    }
    const buildId = (typeof CHART_ENGINE_BUILD === 'string')
      ? CHART_ENGINE_BUILD
      : (chart.engineBuildId || null);
    const bars = Array.isArray(chart.data) ? chart.data.length : 0;
    if (bars < 40) {
      return {
        ok: false,
        reason: 'insufficient bars for VALUE/Y sample',
        buildId,
        bars,
        needSessionData: true,
      };
    }

    const wrap = (fnName) => {
      const orig = chart[fnName];
      if (typeof orig !== 'function' || orig.__m21vyWrapped) return;
      chart[fnName] = function wrapped(...args) {
        sink.captureDraws = true;
        sink.strokeTips = [];
        try { return orig.apply(this, args); }
        finally {
          sink.captureDraws = false;
          sink.lastStrokeTips = sink.strokeTips.slice();
        }
      };
      chart[fnName].__m21vyWrapped = true;
    };
    wrap('drawIndicators');
    wrap('drawIndicatorsOptimized');

    try { if (replay.isPlaying) replay.pause(); } catch (_e) { /* */ }
    replay.playbackMode = 'tick';
    replay.tickAnimationEnabled = true;
    replay.speed = speed;
    sink.frames = [];
    sink.sampling = true;
    const idx0 = replay.currentIndex;
    try { replay.play?.(); } catch (_e) { /* */ }
    await new Promise((r) => setTimeout(r, playMs));
    try { replay.pause?.(); } catch (_e) { /* */ }
    sink.sampling = false;

    // Lightweight tip occupancy sample (full five-MA oracle lives in harness probe).
    const tipCount = Array.isArray(sink.lastStrokeTips) ? sink.lastStrokeTips.length : 0;
    return {
      ok: true,
      buildId,
      bars,
      indexDelta: (replay.currentIndex ?? 0) - idx0,
      tipStrokeCount: tipCount,
      speed,
      playMs,
      note: 'Product-chrome sample scaffold — full VALUE/Y matrix remains harness PRELIMINARY cell',
    };
  }, { playMs, speed });
}

async function runProductCell() {
  const pin = await verifyUpstreamBuild(deployed, expected);
  if (!pin.ok) {
    emit(2, {
      ticket: 'M21-PAINTED-ENDPOINT-VALUE-Y-AUTH-PRODUCT',
      verdict: 'M21-VY-AUTH-SETUP-FAIL-BUILD',
      buildPin: pin,
      need: { TEST_EMAIL: 'ok', TEST_PASSWORD: 'ok', TEST_VPS_URL: vps },
    });
    return;
  }

  const browser = await launchBrowser({ headful: false });
  let login = null;
  try {
    login = await uiLogin(browser, deployed);
    if (!login.leftLogin) {
      emit(4, {
        ticket: 'M21-PAINTED-ENDPOINT-VALUE-Y-AUTH-PRODUCT',
        verdict: 'BLOCKED-AUTH-LOGIN-FAILED',
        buildPin: pin,
        loginUrl: login.url,
        note: 'Sign In stayed on /login — check non-admin QA credentials',
      });
      return;
    }

    const chartPage = await browser.newPage();
    await chartPage.setCacheEnabled(false);
    await chartPage.evaluateOnNewDocument(installProductHooks());
    const chartUrl = `${deployed}/chart/dist-v9/index.html?mode=backtest&mcLayout=2v`;
    await chartPage.goto(chartUrl, { waitUntil: 'domcontentloaded', timeout: 180_000 });
    await chartPage.waitForFunction(
      () => !!(window.chart && window.chart.replaySystem),
      { timeout: 120_000 },
    ).catch(() => null);

    const ready = await chartPage.evaluate(() => {
      const chart = window.chart;
      const buildId = (typeof CHART_ENGINE_BUILD === 'string')
        ? CHART_ENGINE_BUILD
        : (chart?.engineBuildId || null);
      return {
        hasChart: !!chart,
        hasReplay: !!chart?.replaySystem,
        buildId,
        bars: Array.isArray(chart?.data) ? chart.data.length : 0,
        href: location.href,
      };
    });

    let sample = null;
    if (ready.hasChart && ready.hasReplay && (ready.bars || 0) >= 40) {
      sample = await sampleProductHost(chartPage, { playMs: 8_000, speed: 60 });
    } else {
      sample = {
        ok: false,
        reason: 'product chart ready but bars unavailable without session dataset',
        needSessionData: true,
        ...ready,
      };
    }

    const buildOk = ready.buildId === expected || pin.upstreamObservedBuild === expected;
    emit(buildOk ? 0 : 2, {
      ticket: 'M21-PAINTED-ENDPOINT-VALUE-Y-AUTH-PRODUCT',
      verdict: buildOk
        ? (sample?.ok
          ? 'M21-VY-AUTH-PRODUCT-CELL-SAMPLED-PRELIMINARY'
          : 'M21-VY-AUTH-PRODUCT-CELL-READY-AWAITING-SESSION-DATA')
        : 'M21-VY-AUTH-PRODUCT-BUILD-MISMATCH',
      phase: 'PREPARATION-AUTH-PRODUCT',
      poEnvOnly: ['TEST_EMAIL', 'TEST_PASSWORD', 'TEST_VPS_URL'],
      defaultsApplied: {
        M19_EXPECTED_BUILD_ID: expected,
        M19_DEPLOYED_ORIGIN: deployed,
      },
      buildPin: {
        expectedBuildId: expected,
        upstreamObservedBuild: pin.upstreamObservedBuild,
        liveChartBuildId: ready.buildId || null,
        match: buildOk,
      },
      login: { ok: true, leftLogin: true },
      productChart: ready,
      sample,
      note: 'PRELIMINARY real-product cell — does not accept RED or claim GREEN. '
        + 'Full five-MA VALUE/Y matrix remains harness evidence pending GPT-5.6 verify.',
      signature: STATUS,
    });
  } finally {
    try { await login?.page?.close(); } catch (_e) { /* */ }
    try { await browser.close(); } catch (_e) { /* */ }
  }
}

function spawnHarness() {
  return new Promise((resolve) => {
    const probe = path.join(__dirname, 'm21-painted-endpoint-value-y-red-probe.mjs');
    const env = {
      ...process.env,
      M19_EXPECTED_BUILD_ID: expected,
      M19_DEPLOYED_ORIGIN: deployed,
      TEST_EMAIL: email,
      TEST_PASSWORD: password,
      TEST_VPS_URL: vps,
      M21_VY_OUT: process.env.M21_VY_HARNESS_OUT
        || path.resolve(__dirname, '../../../../docs/plan3/evidence/W5-M21-PAINTED-ENDPOINT-VALUE-Y-b61-RED.PRELIMINARY.json'),
    };
    process.stderr.write(`[m21-vy-auth] spawning harness oracle (${STATUS})\n`);
    const child = spawn(process.execPath, [probe], {
      env,
      stdio: 'inherit',
      cwd: __dirname,
    });
    child.on('exit', (code, signal) => {
      resolve(code == null ? (signal ? 2 : 0) : code);
    });
  });
}

async function main() {
  if (!email || !password || !vps) {
    emit(4, {
      ticket: 'M21-PAINTED-ENDPOINT-VALUE-Y-AUTH-PRODUCT',
      verdict: 'BLOCKED-AUTH-FOR-REAL-PRODUCT-CELL',
      need: {
        TEST_EMAIL: 'dedicated non-admin QA account email (REQUIRED)',
        TEST_PASSWORD: 'matching password (REQUIRED)',
        TEST_VPS_URL: 'e.g. http://31.97.192.82:3000 (REQUIRED)',
      },
      defaultsOnceCredentialsSet: {
        M19_EXPECTED_BUILD_ID: DEFAULT_BUILD,
        M19_DEPLOYED_ORIGIN: '← TEST_VPS_URL',
      },
      forbidden: ['admin credentials', 'admin@talaria.io', 'any production admin session'],
      executableOnceCredentialsExported: [
        'set TEST_EMAIL=<qa-non-admin>',
        'set TEST_PASSWORD=<qa-password>',
        'set TEST_VPS_URL=http://31.97.192.82:3000',
        'node homepage/public/chart/multichart-prod/harness/m21-painted-endpoint-value-y-auth-bound-runner.mjs',
      ].join('\n'),
      note: 'PO cell needs only the three vars above. Do not substitute admin.',
    });
    return;
  }

  if (isAdminEmail(email)) {
    emit(4, {
      ticket: 'M21-PAINTED-ENDPOINT-VALUE-Y-AUTH-PRODUCT',
      verdict: 'BLOCKED-AUTH-ADMIN-FORBIDDEN',
      reason: 'Admin-looking TEST_EMAIL rejected. Use dedicated non-admin QA.',
      forbidden: ['admin@talaria.io', 'emails with admin local-part'],
    });
    return;
  }

  if (!/^\d{8}b\d+$/.test(expected)) {
    emit(2, {
      ticket: 'M21-PAINTED-ENDPOINT-VALUE-Y-AUTH-PRODUCT',
      verdict: 'M21-VY-AUTH-SETUP-FAIL',
      reason: `invalid expected build id: ${expected}`,
    });
    return;
  }

  process.stderr.write(
    `[m21-vy-auth] non-admin QA present; product cell → ${deployed} pin=${expected} (${STATUS})\n`,
  );
  await runProductCell();

  if (wantHarness) {
    const code = await spawnHarness();
    if (process.exitCode === 0 || process.exitCode == null) process.exitCode = code;
  }
}

main().catch((err) => {
  emit(2, {
    ticket: 'M21-PAINTED-ENDPOINT-VALUE-Y-AUTH-PRODUCT',
    verdict: 'M21-VY-AUTH-PRODUCT-ERROR',
    error: String(err?.stack || err),
  });
});
