#!/usr/bin/env node
/**
 * HOST-SCOPE-01 adoption audit.
 *
 * Host scope is now taken by `puppeteer.launch` itself, via `loadPuppeteer` in
 * lib/heap-cycle-browser.mjs. That closes the hole for every instrument that gets
 * puppeteer from the shared helper — and says nothing about one that reaches around
 * it. This counts the ways around it, because the authoritative read runs with
 * Cursor closed and nobody watching, and an unknown hole then is a lost night.
 *
 * BIND-01 states, kept distinct because they need different fixes:
 *   SCOPED_VIA_LOADER      gets puppeteer from loadPuppeteer — protected
 *   BYPASSES_VIA_REQUIRE   require('puppeteer') / import puppeteer directly
 *   BYPASSES_VIA_LAUNCHER  spawns chrome.exe or a browser binary itself
 *   DECLARES_SCOPE_OFF     sets --no-host-scope or TALARIA_HOST_SCOPE_OFF in the tree
 *   NO_BROWSER            does not launch a browser, so it is not in scope at all
 *
 * A bypass is not automatically a defect: a script may have a reason. It is a hole
 * that must be NAMED, so nobody believes adoption is total when it is partial.
 *
 *   node scripts/host-scope-adoption-audit.mjs [--json]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, '..');

/** The loader is the chokepoint; it is allowed to require puppeteer directly. */
const CHOKEPOINT = 'scripts/lib/heap-cycle-browser.mjs';

export const PATTERNS = {
  loader: /\bloadPuppeteer\s*\(/,
  directRequire: /(?:require\(\s*['"]puppeteer(?:-core)?['"]\s*\)|from\s+['"]puppeteer(?:-core)?['"]|import\(\s*['"]puppeteer(?:-core)?['"]\s*\))/,
  launch: /\.launch\s*\(/,
  /**
   * The browser must be the COMMAND, not merely a word somewhere inside the call.
   * `execFileSync('powershell', [...Name='chrome.exe'...])` is a process query, and
   * counting it as a browser launch flagged run-lock.mjs — the mechanism itself — as
   * a hole in the mechanism.
   */
  spawnsBrowser: /(?:spawn|exec|execFile)(?:Sync)?\(\s*(?:['"`](?![^'"`]*(?:taskkill|pkill|killall|\bkill\b))[^'"`]*(?:chrome|chromium|msedge)[^'"`]*['"`]|[A-Za-z_$][\w$.]*(?:CHROME|BROWSER)[\w$.]*)/i,
  declaresOff: /--no-host-scope|TALARIA_HOST_SCOPE_OFF/,
  withHostScope: /\bwithHostScope\s*\(/,
};

/**
 * Comments, string literals and regex literals removed, because the first version of
 * this audit matched prose and reported 14 holes when four were real. It flagged
 * `@param {import('puppeteer').Page}` in a JSDoc line, a WMI query string that names
 * chrome.exe, and its own regex source — the exact token-grep fault I have spent the
 * day objecting to in other people's gates. A count the Director will act on cannot
 * be built by grepping for a word in a file.
 */
export function stripNonCode(text) {
  /**
   * COMMENTS ONLY. My first attempt stripped string literals too and reported zero
   * holes — because the thing being detected IS a string literal: `require('puppeteer')`
   * became `require('')` and a real bypass vanished. Removing prose is worth doing;
   * removing the operand is measuring nothing and calling it clean.
   */
  return String(text)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1 ');
}

const EXEMPT = /^[\s*#/>|-]*HOST-SCOPE-AUDIT-EXEMPT:\s*(.+)$/m;

export function classifyFile(rel, raw) {
  const exempt = EXEMPT.exec(raw);
  const text = stripNonCode(raw);
  const usesLoader = PATTERNS.loader.test(text);
  const wraps = PATTERNS.withHostScope.test(text);
  const direct = PATTERNS.directRequire.test(text);
  const launches = PATTERNS.launch.test(text);
  const spawns = PATTERNS.spawnsBrowser.test(text);

  /**
   * A direct require only bypasses anything if the file actually launches, and not
   * if it hands the module to `withHostScope` first. STATIC_ONLY_SOURCE_GATE: this
   * cannot prove that EVERY launch path in a file is wrapped, only that the file
   * wraps somewhere — a file with two launches, one wrapped, reads as scoped here.
   * The runtime guarantee is the launch binding itself, not this count.
   */
  const bypassesRequire = direct && launches && !wraps && rel !== CHOKEPOINT;
  if (!usesLoader && !wraps && !bypassesRequire && !spawns) return { rel, states: ['NO_BROWSER'] };
  if (exempt) return { rel, states: ['EXEMPT_DECLARED'], reason: exempt[1].trim() };

  const states = [];
  if (usesLoader) states.push('SCOPED_VIA_LOADER');
  if (wraps && !usesLoader) states.push('SCOPED_VIA_WRAPPER');
  if (bypassesRequire) states.push('BYPASSES_VIA_REQUIRE');
  if (spawns) states.push('BYPASSES_VIA_LAUNCHER');
  if (PATTERNS.declaresOff.test(text)) states.push('DECLARES_SCOPE_OFF');
  if (!states.length) states.push('NO_BROWSER');
  return { rel, states };
}

function walk(dir, out = []) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name === '.git' || e.name.startsWith('.')) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (/\.mjs$/.test(e.name)) out.push(full);
  }
  return out;
}

export function audit(root = REPO_ROOT) {
  const files = walk(path.join(root, 'scripts'));
  const rows = [];
  for (const full of files) {
    const rel = path.relative(root, full).replace(/\\/g, '/');
    let text = '';
    try { text = fs.readFileSync(full, 'utf8'); } catch { rows.push({ rel, states: ['SUBJECT_UNREADABLE'] }); continue; }
    const row = classifyFile(rel, text);
    if (!row.states.includes('NO_BROWSER')) rows.push(row);
  }
  const holes = rows.filter((r) => r.states.some((s) => s.startsWith('BYPASSES') || s === 'DECLARES_SCOPE_OFF'));
  return {
    signature: 'HOST-SCOPE-01-ADOPTION-AUDIT',
    chokepoint: CHOKEPOINT,
    inScope: rows.length,
    scoped: rows.filter((r) => r.states.some((s) => s.startsWith('SCOPED_VIA'))).length,
    limitation: 'STATIC_ONLY_SOURCE_GATE — this counts how files obtain puppeteer, not that every launch '
      + 'path is wrapped. The runtime guarantee is the launch binding in loadPuppeteer/withHostScope.',
    holes: holes.length,
    holeList: holes.map((h) => `${h.rel} (${h.states.join(' + ')})`),
    exempt: rows.filter((r) => r.states.includes('EXEMPT_DECLARED')).map((r) => `${r.rel}: ${r.reason}`),
    rows,
    state: holes.length ? 'HOST_SCOPE_PARTIAL' : 'HOST_SCOPE_TOTAL',
    why: holes.length
      ? `${holes.length} browser-launching script(s) can reach Chrome without the shared loader, so adoption is partial and must not be described as total`
      : 'every browser-launching script in scripts/ goes through the shared loader',
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const r = audit();
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(r, null, 2));
  } else {
    for (const row of r.rows) console.log(`  ${row.states.join(' + ').padEnd(38)} ${row.rel}`);
    console.log(`\n  [host-scope] ${r.state} — ${r.scoped}/${r.inScope} via the loader, ${r.holes} hole(s)`);
    console.log(`  ${r.why}`);
  }
  process.exitCode = r.state === 'HOST_SCOPE_TOTAL' ? 0 : 1;
}
