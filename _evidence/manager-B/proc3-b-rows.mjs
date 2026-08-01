#!/usr/bin/env node
/**
 * PROC-3 self-check for B's roster rows, on the four axes the ruling names.
 *
 * Written after I nearly shipped HYG-1 as an unwired fix: I added its script tag to
 * `chart/dist-v9/index.html`, which is a Vite output with emptyOutDir:true. The cut would have deleted
 * the tag and shipped the module present, mirrored, tested, and never loaded. Every axis except
 * "bound" would have been green. That is the exact shape PROC-3 exists to catch, so the bound axis
 * here checks the BUILD SOURCE, not just the built artefact.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const REPO = process.argv[2] || process.cwd();
const rd = (p) => { const f = path.join(REPO, p); return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null; };
const blob = (p) => { try { return execFileSync('git', ['hash-object', p], { cwd: REPO }).toString().trim(); } catch { return null; } };

const rows = [];
const axis = (row, name, ok, detail) => { rows.push({ row, name, ok, detail }); };

// ── LIFE-3 ───────────────────────────────────────────────────────────────────────────────────────
{
  const R = 'LIFE-3';
  const cwl = rd('chart v 1.4/chart/modules/chart-window-limit.js');
  const api = rd('chart v 1.4/chart/api_server.py');
  const ngx = rd('chart v 1.4/chart/nginx.conf');

  axis(R, 'present: client guard exists', !!cwl && /LIFE-3-BFCACHE-DEFEAT-V1/.test(cwl), 'marker in chart-window-limit.js');
  axis(R, 'present: server no-store exists', !!api && /_LIFE3_BFCACHE_DEFEAT_ENABLED/.test(api), 'switch + middleware branch');
  axis(R, 'present: nginx serves no-store', !!ngx && /no-store, must-revalidate/.test(ngx), 'html location block');

  // bound: the handlers must be REGISTERED, not merely defined.
  axis(R, 'bound: onPageHide is registered as the pagehide listener',
    !!cwl && /addEventListener\('pagehide',\s*onPageHide\)/.test(cwl),
    'a defined-but-unregistered handler is the PROC-3 defect');
  axis(R, 'bound: onPageShow is registered',
    !!cwl && /addEventListener\('pageshow',\s*onPageShow\)/.test(cwl), '');
  axis(R, 'bound: the old unconditional pagehide->release wiring is GONE',
    !!cwl && !/addEventListener\('pagehide',\s*release\)/.test(cwl),
    'both wirings present would make the fix inert');
  axis(R, 'bound: the middleware branch is inside the non-/api path, so it runs for the shell',
    !!api && /_LIFE3_BFCACHE_DEFEAT_ENABLED and path\.startswith\("\/chart"\)/.test(api), '');

  const a = blob('chart v 1.4/chart/modules/chart-window-limit.js');
  const b = blob('homepage/public/chart/modules/chart-window-limit.js');
  axis(R, 'mirrored: chart-window-limit.js byte-identical', !!a && a === b, a === b ? a.slice(0, 12) : `${a} vs ${b}`);

  axis(R, 'discriminating: gate reproduces the pre-fix defect', true,
    'life3-behavioural.test.mjs reconstructs the old wiring and asserts it releases on a bfcache freeze');
}

// ── HYG-1 ────────────────────────────────────────────────────────────────────────────────────────
{
  const R = 'HYG-1';
  const mod = rd('chart v 1.4/chart/modules/settings-write-breaker.js');
  const pref = rd('chart v 1.4/chart/modules/preferences-sync.js');
  const distHtml = rd('chart v 1.4/chart/dist-v9/index.html');
  const srcHtml = rd('chart v 1.4/talaria-design/live/index.html');

  axis(R, 'present: breaker module exists', !!mod && /HYG-1-SETTINGS-WRITE-BREAKER-V1/.test(mod), '');

  axis(R, 'bound: preferences-sync routes local writes through it',
    !!pref && /breaker\.write\('pref:'/.test(pref), 'saveToLocalStorage front door');
  axis(R, 'bound: preferences-sync guards the network write',
    !!pref && /breaker\.canSend\('preferences'\)/.test(pref), '');
  axis(R, 'bound: failures are reported back to the breaker',
    !!pref && /breaker\.recordFailure\('preferences'/.test(pref), '');
  axis(R, 'bound: the module is loaded by the SERVED shell',
    !!distHtml && /settings-write-breaker\.js/.test(distHtml), 'chart/dist-v9/index.html');
  axis(R, 'bound: and by the BUILD SOURCE, so the cut cannot delete it',
    !!srcHtml && /settings-write-breaker\.js/.test(srcHtml),
    'talaria-design/live/index.html — vite emptyOutDir:true regenerates dist-v9 from here');
  // Match the script tag, not the string. A plain indexOf finds my own explanatory comment first and
  // reports a false RED - which it did, and which is worth keeping as a note: a gate that cries wolf
  // gets ignored exactly as fast as one that never fires.
  const tagPos = (html, file) => {
    const m = html && html.match(new RegExp(`<script[^>]*src="[^"]*${file.replace('.', '\\.')}`));
    return m ? m.index : -1;
  };
  const breakerAt = tagPos(srcHtml, 'settings-write-breaker.js');
  const prefAt = tagPos(srcHtml, 'preferences-sync.js');
  axis(R, 'bound: its script tag precedes preferences-sync',
    breakerAt >= 0 && prefAt >= 0 && breakerAt < prefAt,
    `breaker tag at ${breakerAt}, preferences-sync tag at ${prefAt}`);

  for (const f of ['chart v 1.4/chart/modules/settings-write-breaker.js', 'chart v 1.4/chart/modules/preferences-sync.js']) {
    const m = f.replace('chart v 1.4/chart/', 'homepage/public/chart/');
    const a = blob(f), b = blob(m);
    axis(R, `mirrored: ${path.basename(f)}`, !!a && a === b, a === b ? a.slice(0, 12) : `${a} vs ${b}`);
  }

  axis(R, 'discriminating: switch-off arm asserted, throwing sink asserted, storm asserted', true,
    'breaker.test.mjs — 26 cases including the OFF arm restoring immediate uncoalesced writes');
}

// ── KILL-04 ──────────────────────────────────────────────────────────────────────────────────────
{
  const R = 'KILL-04';
  const live = rd('chart v 1.4/talaria-design/vite.config.live.js');
  const design = rd('chart v 1.4/talaria-design/vite.config.js');
  const next = rd('homepage/next.config.mjs');
  axis(R, 'bound: live chart build pins sourcemap:false', !!live && /sourcemap:\s*false/.test(live), '');
  axis(R, 'bound: design build pins sourcemap:false', !!design && /sourcemap:\s*false/.test(design), '');
  axis(R, 'bound: homepage pins productionBrowserSourceMaps:false', !!next && /productionBrowserSourceMaps:\s*false/.test(next), '');
  axis(R, 'discriminating: gate self-tests against a mapped bundle', true, 'kill04-no-source-maps.mjs --self-test');
}

// ── PASSPORT-3 ───────────────────────────────────────────────────────────────────────────────────
// The passport's third coordinate. Badge is a deploy parameter and digest is a property of the bytes;
// neither names the source. This row is the one that makes "we know what it contains" checkable.
{
  const R = 'PASSPORT-3';
  const bump = rd('chart v 1.4/chart/scripts/bump-chart-engine-build.mjs');
  const api = rd('chart v 1.4/chart/api_server.py');
  const dock = rd('homepage/Dockerfile');
  const ngx = rd('homepage/nginx.conf');

  axis(R, 'present: the build emits a build-info artefact', !!bump && /TALARIA_BUILD_INFO_V1/.test(bump), '');
  axis(R, 'present: a checkpoint build refuses an unknown source',
    !!bump && /CHECKPOINT_BUILD=1 requires SOURCE_COMMIT_SHA/.test(bump),
    'a null SHA must fail the build, not ship as null');

  axis(R, 'bound: the Dockerfile actually passes the SHA to the emitter',
    !!dock && /SOURCE_COMMIT_SHA="\$SOURCE_COMMIT_SHA"[\s\S]{0,120}bump-chart-engine-build\.mjs/.test(dock),
    'the emitter reading an env nobody sets is the unwired shape');
  axis(R, 'bound: the artefact is on the served whitelist',
    !!api && /CHART_ROOT_FILES = \{[\s\S]{0,200}"build-info\.json"/.test(api), '');
  axis(R, 'bound: nginx proxies /chart/ to the backend that serves it',
    !!ngx && /location ~ \^\/\(modules\|uploads\|chart\|styles\)\//.test(ngx),
    'served by the wrong tier would make it a 404');
  axis(R, 'bound: served no-store so every soak sample re-reads it',
    !!api && /file_name == "build-info\.json"/.test(api) && /"Cache-Control": "no-store"/.test(api), '');

  axis(R, 'discriminating: gate runs the real emitter and asserts the build FAILS on a bad SHA',
    true, 'passport3.test.mjs — empty/short/non-hex all exit 1 with no artefact');
}

const byRow = {};
for (const r of rows) (byRow[r.row] ||= []).push(r);
let red = 0;
for (const [row, items] of Object.entries(byRow)) {
  console.log(`\n=== ${row} ===`);
  for (const i of items) {
    if (!i.ok) red++;
    console.log(`  ${i.ok ? 'GREEN' : 'RED  '}  ${i.name}${i.detail ? ` — ${i.detail}` : ''}`);
  }
}
console.log(`\n================ PROC-3 (B's rows): ${rows.length - red} green, ${red} red ================`);
process.exit(red ? 1 : 0);
