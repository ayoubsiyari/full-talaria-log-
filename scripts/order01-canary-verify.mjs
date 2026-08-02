/**
 * ORDER-01 §5 and SPEED-01 §3, verified in a running canary.
 *
 * Both of these have been claimed as landed and were not, so neither closes
 * on inspection. This reads the built bundle in a browser:
 *
 *   §5  the speed selector offers 1-10 (plus REALISTIC in tick mode) and
 *       does not offer 60x, read from the rendered DOM rather than source
 *   §3  __talariaEffectiveRate reads back a finite number while replay runs,
 *       from the frame a harness would attach to
 *
 * Exits non-zero on any failure and prints exactly what it saw, because the
 * failure mode that matters here is a verification that quietly proves less
 * than it claims.
 *
 * Usage: node scripts/order01-canary-verify.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  applyDistV9LayoutViaUi,
  loadPuppeteer,
  waitForDistV9SingleReady,
} from './lib/heap-cycle-browser.mjs';
import { startServer as startHarnessServer } from '../chart v 1.4/chart/multichart-prod/harness/serve.mjs';
import {
  installBuiltProductBoot,
  reactParityUrlWithLayout,
} from '../chart v 1.4/chart/multichart-prod/harness/react-parity-lib.mjs';
import { armHeapCyclePoWorkload } from './lib/heap-cycle-po-workload.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LADDER = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const BARS_PER_SECOND = 10;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (m) => console.log(`[order01-verify] ${new Date().toISOString()} ${m}`);

const failures = [];
function check(ok, label, detail) {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (detail !== undefined) console.log(`        ${detail}`);
  if (!ok) failures.push(label);
}

/**
 * Read the speed ladder out of the rendered toolbar.
 *
 * Walks the range input the toolbar actually renders and records the label at
 * every position, rather than trusting a steps array we could equally have
 * read from source. If the control cannot be found that is a failure, not a
 * skip: a verifier that silently finds nothing is how this got claimed twice.
 */
async function readRenderedLadder(frame) {
  return frame.evaluate(async () => {
    const sleepIn = (ms) => new Promise((r) => setTimeout(r, ms));
    const inputs = [...document.querySelectorAll('input[type="range"]')];
    // The speed control is the range input whose sibling text ends in a
    // multiplier glyph; the other range inputs are the timeframe scrubber.
    const scored = inputs.map((el) => {
      const box = el.closest('div')?.parentElement;
      const text = box ? box.textContent || '' : '';
      return { el, text, isSpeed: /[x×]\s*$/.test(text.trim()) || /[x×]/.test(text) };
    });
    const target = scored.find((s) => s.isSpeed) || scored[0];
    if (!target) return { found: false };

    const el = target.el;
    const max = Number(el.max);
    const min = Number(el.min);
    const setVal = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, 'value',
    ).set;
    const labels = [];
    const original = el.value;
    for (let i = min; i <= max; i++) {
      setVal.call(el, String(i));
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      await sleepIn(40);
      const box = el.closest('div')?.parentElement;
      labels.push((box ? box.textContent || '' : '').trim());
    }
    setVal.call(el, original);
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return { found: true, min, max, labels };
  });
}

/** Pull the numbers out of the rendered labels, ignoring REALISTIC. */
function labelsToSpeeds(labels) {
  return labels.map((raw) => {
    if (/REAL/i.test(raw)) return 'REALISTIC';
    const m = raw.match(/(\d+(?:\.\d+)?)\s*[x×]/);
    return m ? Number(m[1]) : raw;
  });
}

async function main() {
  const distIndex = path.resolve(__dirname, '../chart v 1.4/chart/dist-v9/index.html');
  if (!fs.existsSync(distIndex)) throw new Error(`candidate build missing at ${distIndex}`);

  // State the bundle's identity up front. A verification against a stale
  // bundle is the exact failure this script exists to prevent.
  const bundle = path.resolve(
    __dirname, '../chart v 1.4/chart/dist-v9/assets/talaria-v9-live.js',
  );
  if (fs.existsSync(bundle)) {
    const st = fs.statSync(bundle);
    log(`bundle ${path.basename(bundle)} ${(st.size / 1024).toFixed(1)} KB mtime=${st.mtime.toISOString()}`);
  }

  const puppeteer = await loadPuppeteer();
  const harness = await startHarnessServer(0);
  const browser = await puppeteer.launch({
    headless: true,
    protocolTimeout: 300_000,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
    defaultViewport: { width: 1440, height: 960 },
  });

  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(180_000);
    await installBuiltProductBoot(page, {});
    const url = reactParityUrlWithLayout(
      `${harness.url}/chart/dist-v9/index.html?mode=backtest`, '1',
    );
    log('booting candidate');
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180_000 });
    await waitForDistV9SingleReady(page, 180_000);
    await applyDistV9LayoutViaUi(page, 4);
    await sleep(3_000);
    log('candidate ready');

    console.log('\n--- ORDER-01 §5: the rendered selector ---');
    const candle = await readRenderedLadder(page);
    check(candle.found, 'the speed selector is present in the DOM');
    if (candle.found) {
      const speeds = labelsToSpeeds(candle.labels);
      const numeric = speeds.filter((s) => typeof s === 'number');
      check(
        JSON.stringify(numeric) === JSON.stringify(LADDER),
        'candle mode offers exactly 1-10',
        `saw ${JSON.stringify(speeds)}`,
      );
      check(!numeric.includes(60), 'candle mode does not offer 60x');
      check(
        numeric.every((n) => n <= 10),
        'nothing above 10',
        `max ${Math.max(...numeric)}`,
      );
      check(
        numeric.every((n) => Number.isInteger(n)),
        'nothing between the rungs',
      );
    }

    console.log('\n--- SPEED-01 §3: the read-back, with replay running ---');
    const workload = await armHeapCyclePoWorkload(page, {
      playHoldMs: 4_000,
      replaySpeed: BARS_PER_SECOND,
      retainIndicators: true,
    });
    check(!!workload.armed, 'replay is armed and playing',
      `playing=${workload.observedPlaying}`);
    await sleep(6_000);

    const readBack = await page.evaluate(() => {
      const probe = (w, name) => {
        try {
          return {
            realm: name,
            type: typeof w.__talariaEffectiveRate,
            value: w.__talariaEffectiveRate,
            gov: w.__talariaSpeedGov || null,
          };
        } catch (_e) {
          return { realm: name, type: 'unreachable', value: null, gov: null };
        }
      };
      const out = [probe(window, 'top')];
      for (const f of [...document.querySelectorAll('iframe')].slice(0, 4)) {
        try {
          out.push(probe(f.contentWindow, f.id || 'panel'));
        } catch (_e) {
          out.push({ realm: f.id || 'panel', type: 'cross-origin', value: null, gov: null });
        }
      }
      return out;
    });

    for (const r of readBack) {
      console.log(`        ${r.realm.padEnd(10)} type=${r.type} value=${r.value}`);
    }
    const top = readBack.find((r) => r.realm === 'top');
    check(
      top && top.type === 'number' && Number.isFinite(top.value),
      '__talariaEffectiveRate reads back a number in the frame a harness attaches to',
      top ? `type=${top.type} value=${top.value}` : 'no top realm',
    );
    check(
      top && top.value > 0,
      'the read-back is a live rate, not a zero placeholder',
      top ? String(top.value) : '',
    );
    const anyPanel = readBack.filter((r) => r.realm !== 'top' && r.type === 'number');
    check(
      readBack.length === 1 || anyPanel.length > 0,
      'panels publish too, or there are no panel frames to publish from',
      `${anyPanel.length} of ${readBack.length - 1} panel frames`,
    );

    console.log('');
    if (failures.length) {
      log(`FAILED (${failures.length}): ${failures.join('; ')}`);
      process.exitCode = 1;
    } else {
      log('both items verified in a running canary');
    }
  } finally {
    await browser.close().catch(() => {});
    await harness.close?.().catch?.(() => {});
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
