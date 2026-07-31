/**
 * TICK-OFF-01 — does the shipped flag CONTROL anything, or is it merely present?
 *
 * The textual marker is discriminating (absent on b116, present on b117) and that is still not
 * enough. On the window-claim P0 the marker shipped and the hang survived: the string was on the
 * wire and the behaviour was unchanged. A's own commit discloses the same gap from the other side
 * — "nothing paints, node:test cannot see a canvas, a browser must still confirm".
 *
 * So this probe asserts the thing a grep cannot: that on the LIVE b117 build the accessor returns
 * a DIFFERENT mode depending on the flag, while the user's stored preference stays untouched.
 *
 *   arm A (default, kill active)  playbackMode='tick'  -> getPlaybackMode() must be 'candle'
 *   arm B (flag set, kill lifted) playbackMode='tick'  -> getPlaybackMode() must be 'tick'
 *
 * Both arms run against the same class loaded from the live wire. If the two arms return the same
 * value, the flag is decorative and this must not be reported as shipped.
 */
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const CHROME = fs.readFileSync('/root/b-tal01891/CHROME_PATH', 'utf8').trim();
const BASE = 'http://127.0.0.1:3000';

const log = (...a) => console.log(...a);

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

try {
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));

  // Fetch the module exactly as the browser would, from the live build.
  await page.goto(`${BASE}/login/`, { waitUntil: 'domcontentloaded' });
  const src = await page.evaluate(async (BASE) => {
    const r = await fetch(`${BASE}/chart/modules/replay-system.js`, { cache: 'no-store' });
    return { ok: r.ok, status: r.status, ct: r.headers.get('content-type'), text: await r.text() };
  }, BASE);

  log('=== the module as served by b117 ===');
  log(`  http ${src.status}  ${src.ct}  ${src.text.length} bytes`);
  if (!src.ok || !/javascript/.test(src.ct || '')) {
    log('  ABORT: did not get JavaScript from the wire'); process.exit(2);
  }
  const hasFlag = src.text.includes('_isCandleOnlyPlaybackEnabled');
  log(`  contains _isCandleOnlyPlaybackEnabled: ${hasFlag}`);
  if (!hasFlag) { log('  ABORT: the payload is not in the served file'); process.exit(2); }

  // Extract the two functions under test and exercise them directly. Instantiating the whole
  // ReplaySystem needs a canvas and a data pipeline; the claim here is narrow and precise —
  // the accessor's branch — so bind exactly that and nothing else.
  const result = await page.evaluate((code) => {
    const out = {};

    // Pull getPlaybackMode() and _isCandleOnlyPlaybackEnabled() out of the class body.
    const grab = (name) => {
      const i = code.indexOf(`\n    ${name}(`);
      if (i < 0) return null;
      let d = 0, started = false, j = i;
      for (; j < code.length; j++) {
        const c = code[j];
        if (c === '{') { d++; started = true; }
        else if (c === '}') { d--; if (started && d === 0) { j++; break; } }
      }
      return code.slice(i, j);
    };

    const gpm = grab('getPlaybackMode');
    const ico = grab('_isCandleOnlyPlaybackEnabled');
    out.foundGetPlaybackMode = !!gpm;
    out.foundAccessor = !!ico;
    if (!gpm || !ico) return out;
    out.accessorSource = ico.trim().replace(/\s+/g, ' ').slice(0, 200);

    // Build a minimal object carrying just those two methods.
    const make = () => {
      const holder = new Function(`return { ${gpm.trim()}, ${ico.trim()} };`)();
      return holder;
    };

    const runArm = (flagValue) => {
      if (flagValue === undefined) delete window.__TALARIA_DISABLE_CANDLE_ONLY_PLAYBACK_V1;
      else window.__TALARIA_DISABLE_CANDLE_ONLY_PLAYBACK_V1 = flagValue;
      const o = make();
      o.playbackMode = 'tick';               // the user's stored preference, in both arms
      const mode = o.getPlaybackMode();
      return { mode, storedPreferenceAfter: o.playbackMode };
    };

    out.armDefault = runArm(undefined);      // kill active
    out.armFlagged = runArm(true);           // kill lifted by the switch
    out.armFalsy   = runArm(0);              // truthiness, not === true
    out.armString  = runArm('0');            // '0' is truthy in JS: must restore tick
    return out;
  }, src.text);

  log('');
  log('=== the accessor as shipped ===');
  log(`  found getPlaybackMode()            : ${result.foundGetPlaybackMode}`);
  log(`  found _isCandleOnlyPlaybackEnabled : ${result.foundAccessor}`);
  log(`  source: ${result.accessorSource}`);

  if (!result.foundGetPlaybackMode || !result.foundAccessor) {
    log('  ABORT: could not isolate the accessor from the served file'); process.exit(2);
  }

  log('');
  log('=== behavioural arms (identical object, identical stored preference) ===');
  const rows = [
    ['flag unset  (kill ACTIVE)',   result.armDefault, 'candle'],
    ['flag = true (kill LIFTED)',   result.armFlagged, 'tick'],
    ['flag = 0    (falsy)',         result.armFalsy,   'candle'],
    ["flag = '0'  (truthy string)", result.armString,  'tick'],
  ];
  let bad = 0;
  for (const [label, r, want] of rows) {
    const ok = r.mode === want;
    if (!ok) bad++;
    log(`  ${label.padEnd(28)} playbackMode='tick' -> getPlaybackMode()='${r.mode}'  want '${want}'  ${ok ? 'ok' : 'WRONG'}`);
  }

  log('');
  log('=== the stored preference must survive both arms ===');
  const pref = result.armDefault.storedPreferenceAfter === 'tick'
            && result.armFlagged.storedPreferenceAfter === 'tick';
  log(`  this.playbackMode still 'tick' after both arms: ${pref}`);
  log(`  (the setting returns intact when the switch is removed post-canary)`);
  if (!pref) bad++;

  log('');
  const discriminates = result.armDefault.mode !== result.armFlagged.mode;
  log(`  the two arms DIFFER: ${discriminates}`);
  log(`  a flag whose arms agree is decorative, however present the string is.`);

  if (errs.length) log(`\n  page errors: ${errs.slice(0, 3).join(' | ')}`);

  log('');
  log(bad === 0 && discriminates ? 'TICKOFF_BEHAVIOURALLY_LIVE_ON_B117' : 'TICKOFF_NOT_BEHAVIOURALLY_CONFIRMED');
  process.exit(bad === 0 && discriminates ? 0 : 1);
} finally {
  await browser.close();
}
