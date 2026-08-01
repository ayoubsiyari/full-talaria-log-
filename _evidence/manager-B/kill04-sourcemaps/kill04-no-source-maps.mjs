#!/usr/bin/env node
/**
 * KILL-04 — no source maps in anything we serve.
 *
 * Three axes, because "no maps in the bundle today" and "maps cannot ship" are different claims and
 * only the second one is a kill:
 *
 *   1. CONFIG   every build config that emits a served bundle pins sourcemap off explicitly. Relying
 *               on a framework default means one Vite major or one forgotten debugging session ships
 *               our unminified source.
 *   2. ARTEFACT no `sourceMappingURL` and no `.map` file in the built output on disk.
 *   3. SERVED   optional, needs --url: the same two checks against what the host actually returns,
 *               because the artefact on disk is not necessarily the artefact on the wire.
 *
 * Axis 4 of PROC-3 is discriminating: a gate that cannot go RED is decoration. `--self-test` feeds
 * this gate a synthetic bundle that DOES carry a map and asserts it fails.
 *
 * Usage:
 *   node kill04-no-source-maps.mjs --repo <root> [--url http://host:3000] [--self-test]
 */
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const argOf = (n, d = null) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const REPO = argOf('--repo', process.cwd());
const URL_BASE = argOf('--url', null);
const SELF_TEST = args.includes('--self-test');

const findings = [];
const record = (axis, name, ok, detail) => {
  findings.push({ axis, name, ok, detail });
  console.log(`  ${ok ? 'GREEN' : 'RED  '}  [${axis}] ${name}${detail ? ` — ${detail}` : ''}`);
};

const MAP_URL_RE = /\/\/[#@]\s*sourceMappingURL\s*=/;
const INLINE_MAP_RE = /sourceMappingURL\s*=\s*data:application\/json/;

// ── axis 1: config ───────────────────────────────────────────────────────────────────────────────
console.log('=== axis 1: build configs pin source maps off ===');
const CONFIGS = [
  { file: 'chart v 1.4/talaria-design/vite.config.live.js', key: /sourcemap:\s*false/, why: 'emits chart/dist-v9 — the live chart shell' },
  { file: 'chart v 1.4/talaria-design/vite.config.js', key: /sourcemap:\s*false/, why: 'emits homepage/public/talaria-v8b-design' },
  { file: 'homepage/next.config.mjs', key: /productionBrowserSourceMaps:\s*false/, why: 'emits the homepage export' },
  { file: 'chart v 1.4/chart/scripts/build-chart-client-bundle.mjs', key: /sourceMap:\s*false/, why: 'emits the legacy chart/dist bundle' },
];
for (const c of CONFIGS) {
  const p = path.join(REPO, c.file);
  if (!fs.existsSync(p)) { record('CONFIG', c.file, false, 'config file not found — cannot vouch for its output'); continue; }
  const src = fs.readFileSync(p, 'utf8');
  record('CONFIG', c.file, c.key.test(src), c.key.test(src) ? c.why : `no explicit pin (${c.key}) — relying on a framework default`);
}

// ── axis 2: artefacts on disk ────────────────────────────────────────────────────────────────────
console.log('\n=== axis 2: built output on disk carries no maps ===');
const OUT_DIRS = [
  'chart v 1.4/chart/dist-v9',
  'chart v 1.4/chart/dist',
  'homepage/public/talaria-v8b-design',
];
const walk = (dir, acc = []) => {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) walk(f, acc); else acc.push(f);
  }
  return acc;
};
for (const d of OUT_DIRS) {
  const abs = path.join(REPO, d);
  if (!fs.existsSync(abs)) { console.log(`  SKIP   [ARTEFACT] ${d} — not built in this tree`); continue; }
  const files = walk(abs);
  const maps = files.filter((f) => f.endsWith('.map'));
  record('ARTEFACT', `${d}: no .map files`, maps.length === 0,
    maps.length ? `${maps.length} found: ${maps.slice(0, 3).map((m) => path.basename(m)).join(', ')}` : `${files.length} files scanned`);
  const withRef = files.filter((f) => /\.(js|css|mjs)$/.test(f))
    .filter((f) => { const s = fs.readFileSync(f, 'utf8'); return MAP_URL_RE.test(s) || INLINE_MAP_RE.test(s); });
  record('ARTEFACT', `${d}: no sourceMappingURL`, withRef.length === 0,
    withRef.length ? withRef.slice(0, 3).map((m) => path.basename(m)).join(', ') : 'none referenced');
}

// ── axis 3: what the host actually serves ────────────────────────────────────────────────────────
if (URL_BASE) {
  console.log(`\n=== axis 3: served bundle at ${URL_BASE} ===`);
  const shellUrl = `${URL_BASE}/chart/dist-v9/index.html`;
  try {
    const shell = await (await fetch(shellUrl)).text();
    const srcs = [...shell.matchAll(/src="([^"]+\.js[^"]*)"/g)].map((m) => m[1]);
    record('SERVED', 'shell fetched', true, `${srcs.length} script tags`);
    let checked = 0, bad = [];
    for (const s of srcs.slice(0, 12)) {
      const u = s.startsWith('http') ? s : `${URL_BASE}${s.startsWith('/') ? '' : '/'}${s}`;
      try {
        const body = await (await fetch(u)).text();
        checked += 1;
        if (MAP_URL_RE.test(body) || INLINE_MAP_RE.test(body)) bad.push(s);
      } catch (_) { /* a 404 is not a map */ }
    }
    record('SERVED', 'no sourceMappingURL in served scripts', bad.length === 0,
      bad.length ? bad.join(', ') : `${checked} scripts fetched and scanned`);
  } catch (err) {
    record('SERVED', 'shell fetched', false, String(err.message || err));
  }
}

// ── discriminating self-test ─────────────────────────────────────────────────────────────────────
if (SELF_TEST) {
  console.log('\n=== discriminating: this gate must go RED on a bundle that DOES carry a map ===');
  const tmp = fs.mkdtempSync(path.join(process.cwd(), 'kill04-selftest-'));
  try {
    fs.writeFileSync(path.join(tmp, 'app.js'), 'console.log(1);\n//# sourceMappingURL=app.js.map\n');
    fs.writeFileSync(path.join(tmp, 'app.js.map'), '{"version":3}');
    const files = walk(tmp);
    const maps = files.filter((f) => f.endsWith('.map'));
    const refs = files.filter((f) => f.endsWith('.js')).filter((f) => MAP_URL_RE.test(fs.readFileSync(f, 'utf8')));
    const caught = maps.length > 0 && refs.length > 0;
    console.log(`  ${caught ? 'GREEN' : 'RED  '}  [SELFTEST] a mapped bundle is detected as defective`
      + ` — ${maps.length} .map, ${refs.length} referencing`);
    if (!caught) findings.push({ axis: 'SELFTEST', name: 'gate is vacuous', ok: false });

    const inline = 'console.log(1);\n//# sourceMappingURL=data:application/json;base64,eyJ2IjozfQ==\n';
    const inlineCaught = INLINE_MAP_RE.test(inline);
    console.log(`  ${inlineCaught ? 'GREEN' : 'RED  '}  [SELFTEST] an INLINE base64 map is detected as defective`);
    if (!inlineCaught) findings.push({ axis: 'SELFTEST', name: 'inline maps missed', ok: false });
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

const red = findings.filter((f) => !f.ok);
console.log(`\n================ KILL-04: ${findings.length - red.length} green, ${red.length} red ================`);
if (red.length) { console.log('RED rows:'); red.forEach((r) => console.log(`  [${r.axis}] ${r.name} — ${r.detail || ''}`)); }
process.exit(red.length ? 1 : 0);
