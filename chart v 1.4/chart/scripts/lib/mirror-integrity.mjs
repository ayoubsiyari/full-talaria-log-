/**
 * PRE-CUT INTEGRITY GATE — parse-check and size sanity over both product mirrors.
 *
 * WHAT HAPPENED. Truncation hit two worktrees in one day: A lost both mirrors at 14:55, and B found nine
 * files chopped at ~521 KB with chart.js at 10,398 lines against 40,000+ in the train. Both were caught
 * by hand. Recovering twice is luck; the failure we cannot survive is SHIPPING it, because a ten-hour arm
 * against corrupt bytes does not read as a fault - it reads as a product verdict.
 *
 * WHY MIRROR PARITY CANNOT CATCH THIS, which is the whole reason this file exists. The existing layout
 * assert compares canonical against homepage byte-for-byte, but it runs AFTER build:live:chart, and
 * build:live:chart SYNCS canonical onto homepage. A truncated canonical is copied over the good mirror
 * and the two agree perfectly. Parity is a relative test and truncation is an absolute fault, so parity
 * reports green on precisely the case it looks like it should catch. This gate is absolute:
 *
 *   1. PARSE. A chopped file is almost always cut mid-statement and will not parse. This is the primary
 *      net and it needs no baseline at all.
 *   2. SIZE, against the file's own committed state. A file that parses but has lost a quarter of its
 *      lines relative to HEAD is the backstop for a truncation that happens to land on a clean boundary.
 *      HEAD is the right baseline because every truncation so far was working-tree corruption with the
 *      commit intact - which is exactly the comparison that fires here and stays silent for real edits
 *      that were committed.
 *   3. PARITY, kept anyway, because it still catches a one-sided truncation before the sync runs.
 *
 * IT MUST NEVER PASS VACUOUSLY. A gate that finds no files, checks nothing and prints PASS is worse than
 * no gate, because it converts an unchecked cut into a checked one on the record. Zero files checked is a
 * BLOCK, and so is a missing canonical mirror.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

/**
 * The canonical mirror is required; the homepage mirror is checked when present.
 *
 * Two layouts must both work. From the repo root the mirrors sit at their usual paths. Inside the
 * checkpoint image the build runs `node /build/chart/scripts/bump-chart-engine-build.mjs`, so the
 * working root IS the canonical mirror and the homepage tree is not in the context at all. A gate that
 * only understood the first layout would throw inside the very build it is meant to protect.
 */
export function resolveMirrors(repoRoot) {
  const looksLikeChartTree = (d) => fs.existsSync(path.join(d, 'chart.js')) && fs.existsSync(path.join(d, 'modules'));
  const out = [];
  const canonicalAtRepo = path.join(repoRoot, 'chart v 1.4/chart');
  if (fs.existsSync(canonicalAtRepo)) out.push({ name: 'canonical', root: 'chart v 1.4/chart', required: true });
  else if (looksLikeChartTree(repoRoot)) out.push({ name: 'canonical', root: '.', required: true });
  else out.push({ name: 'canonical', root: 'chart v 1.4/chart', required: true });   // absent: reported as missing
  if (fs.existsSync(path.join(repoRoot, 'homepage/public/chart'))) out.push({ name: 'homepage', root: 'homepage/public/chart', required: false });
  return out;
}

/**
 * Everything the browser actually loads. Not just the seven critical-path files: B found NINE chopped,
 * and a gate scoped to seven would have reported green on two of them.
 */
export const SCAN = [
  { dir: '.', pattern: /^(chart|sw|compare-overlay)\.js$/ },
  { dir: 'modules', pattern: /\.m?js$/ },
  { dir: 'multichart-prod', pattern: /\.m?js$/ },
  { dir: 'workers', pattern: /\.m?js$/ },
];

/** A shrink this large against HEAD is not an edit. Set well clear of real deletions; the observed
 *  truncation removed 75%. */
export const SHRINK_BLOCK_RATIO = 0.75;
export const SHRINK_WARN_RATIO = 0.92;

const MODULE_SYNTAX = /import statement outside a module|may appear only with 'sourceType: module'|Unexpected token 'export'|Cannot use import/i;

/**
 * Parse without executing. `node --check` treats a .js file as a classic script, and a fair number of
 * these product modules are ES modules, so a naive check would report a syntax error for every one of
 * them and the gate would be dismissed as noisy within a day. Fall back to a module parse before
 * concluding anything is wrong.
 */
export function parseCheck(absPath) {
  const run = (target) => {
    try {
      execFileSync(process.execPath, ['--check', target], { stdio: ['ignore', 'pipe', 'pipe'] });
      return { ok: true };
    } catch (err) {
      return { ok: false, stderr: String(err.stderr || err.message || '').slice(0, 400) };
    }
  };
  const asScript = run(absPath);
  if (asScript.ok) return { ok: true, parsedAs: 'script' };
  if (!MODULE_SYNTAX.test(asScript.stderr) && !/\.mjs$/.test(absPath)) {
    return { ok: false, parsedAs: 'script', error: firstErrorLine(asScript.stderr) };
  }
  let tmp = null;
  try {
    tmp = path.join(os.tmpdir(), `precut-${process.pid}-${Math.random().toString(36).slice(2)}.mjs`);
    fs.copyFileSync(absPath, tmp);
    const asModule = run(tmp);
    if (asModule.ok) return { ok: true, parsedAs: 'module' };
    return { ok: false, parsedAs: 'module', error: firstErrorLine(asModule.stderr) };
  } catch (err) {
    return { ok: false, parsedAs: 'module', error: `parse check could not run: ${String(err).slice(0, 120)}` };
  } finally {
    if (tmp) { try { fs.unlinkSync(tmp); } catch { /* temp file */ } }
  }
}

function firstErrorLine(stderr) {
  const lines = String(stderr).split('\n').map((l) => l.trim()).filter(Boolean);
  const syn = lines.find((l) => /SyntaxError|Error:/.test(l));
  return (syn || lines[0] || 'unknown parse failure').slice(0, 220);
}

const countLines = (buf) => { let n = 0; for (let i = 0; i < buf.length; i++) if (buf[i] === 10) n++; return n + (buf.length && buf[buf.length - 1] !== 10 ? 1 : 0); };

/**
 * The committed state of a file, or null when git is unavailable or the path is untracked.
 *
 * Resolved RELATIVE TO THE FILE rather than by building a repo-relative path, because the gate runs
 * under two layouts. Asking for `HEAD:chart.js` from the repo root finds nothing when the file actually
 * lives at `chart v 1.4/chart/chart.js`, and the size net would then vanish silently while the gate
 * still printed PASSED - protection that is absent but looks present, which is worse than none.
 */
export function headBaseline(fileAbsPath) {
  try {
    const buf = execFileSync('git', ['show', `HEAD:./${path.basename(fileAbsPath)}`], {
      cwd: path.dirname(fileAbsPath), maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'],
    });
    return { bytes: buf.length, lines: countLines(buf) };
  } catch {
    return null;
  }
}

export function enumerateFiles(repoRoot, mirrorRoot) {
  const out = [];
  for (const s of SCAN) {
    const dir = path.join(repoRoot, mirrorRoot, s.dir);
    let names = [];
    try { names = fs.readdirSync(dir); } catch { continue; }
    for (const n of names) {
      if (!s.pattern.test(n)) continue;
      const abs = path.join(dir, n);
      try { if (!fs.statSync(abs).isFile()) continue; } catch { continue; }
      const relInMirror = path.posix.join(s.dir === '.' ? '' : s.dir, n).replace(/^\/+/, '');
      out.push({ abs, relInMirror, rel: path.posix.join(mirrorRoot === '.' ? '' : mirrorRoot, relInMirror).replace(/^\/+/, '') });
    }
  }
  return out.sort((a, b) => a.rel.localeCompare(b.rel));
}

/**
 * @returns {{ blocked:boolean, reasons:string[], checks:object[], summary:object }}
 */
export function checkMirrors({ repoRoot, baselineManifest = null, log = () => {} } = {}) {
  const checks = [];
  const reasons = [];
  const perMirror = {};

  for (const m of resolveMirrors(repoRoot)) {
    const root = path.join(repoRoot, m.root);
    if (!fs.existsSync(root)) {
      if (m.required) reasons.push(`the ${m.name} mirror is missing entirely at ${m.root} — refusing to cut against a tree that is not there`);
      perMirror[m.name] = { present: false, files: 0 };
      continue;
    }
    const files = enumerateFiles(repoRoot, m.root);
    perMirror[m.name] = { present: true, files: files.length };
    if (m.required && files.length === 0) {
      reasons.push(`the ${m.name} mirror contains zero loadable scripts — a gate that checks nothing must not report a pass`);
    }
    log(`${m.name}: ${files.length} files`);

    for (const f of files) {
      const check = { mirror: m.name, path: f.rel, relInMirror: f.relInMirror };
      let buf;
      try { buf = fs.readFileSync(f.abs); } catch (err) {
        check.readFailed = String(err).slice(0, 120);
        reasons.push(`${f.rel} could not be read: ${check.readFailed}`);
        checks.push(check); continue;
      }
      check.bytes = buf.length;
      check.lines = countLines(buf);

      if (buf.length === 0) {
        check.blocked = 'empty file';
        reasons.push(`${f.rel} is ZERO BYTES`);
        checks.push(check); continue;
      }

      const parsed = parseCheck(f.abs);
      check.parses = parsed.ok;
      check.parsedAs = parsed.parsedAs;
      if (!parsed.ok) {
        check.parseError = parsed.error;
        check.blocked = 'does not parse';
        reasons.push(`${f.rel} DOES NOT PARSE — ${parsed.error}`);
        checks.push(check); continue;
      }

      const fromGit = headBaseline(f.abs);
      const base = fromGit || (baselineManifest && baselineManifest[f.rel]) || null;
      check.baseline = base ? { lines: base.lines, bytes: base.bytes, source: fromGit ? 'git HEAD' : 'manifest' } : null;
      if (base && base.lines > 0) {
        const ratio = check.lines / base.lines;
        check.lineRatioVsBaseline = +ratio.toFixed(4);
        if (ratio < SHRINK_BLOCK_RATIO) {
          check.blocked = 'shrank against its committed state';
          reasons.push(`${f.rel} is ${check.lines} lines against ${base.lines} committed (${(ratio * 100).toFixed(1)}%) — this is the truncation signature, not an edit`);
        } else if (ratio < SHRINK_WARN_RATIO) {
          check.warn = `down to ${(ratio * 100).toFixed(1)}% of committed lines`;
        }
      } else {
        check.baselineMissing = true;
      }
      checks.push(check);
    }
  }

  // Parity, kept because it catches a one-sided truncation BEFORE the sync copies it over the good side.
  const canonical = new Map(checks.filter((c) => c.mirror === 'canonical').map((c) => [c.relInMirror, c]));
  const homepage = checks.filter((c) => c.mirror === 'homepage');
  let comparedPairs = 0;
  const divergent = [];
  for (const h of homepage) {
    const c = canonical.get(h.relInMirror);
    if (!c || c.bytes == null || h.bytes == null) continue;
    comparedPairs += 1;
    if (c.bytes !== h.bytes) divergent.push({ file: h.relInMirror, canonicalBytes: c.bytes, homepageBytes: h.bytes });
  }

  const totalFiles = checks.length;
  const parseFailures = checks.filter((c) => c.parses === false).length;
  const shrunk = checks.filter((c) => c.blocked === 'shrank against its committed state').length;
  const empty = checks.filter((c) => c.blocked === 'empty file').length;
  const withBaseline = checks.filter((c) => c.baseline).length;

  if (totalFiles === 0) reasons.push('ZERO files were checked — the gate found nothing to inspect and must block rather than report a pass');

  return {
    blocked: reasons.length > 0,
    reasons,
    checks,
    summary: {
      totalFilesChecked: totalFiles,
      parseFailures,
      truncatedAgainstCommitted: shrunk,
      emptyFiles: empty,
      mirrors: perMirror,
      parity: {
        comparedPairs,
        divergentFiles: divergent.length,
        divergent: divergent.slice(0, 12),
        note: 'Divergence is REPORTED, not blocking: the mirrors legitimately differ between a canonical edit and the sync that follows it. Parity is not the truncation net - the sync copies canonical over homepage, so a truncated canonical makes the two agree.',
      },
      baselineSource: checks.find((c) => c.baseline)?.baseline?.source ?? 'none available',
      filesWithoutBaseline: checks.filter((c) => c.baselineMissing).length,
      /**
       * Which of the two nets is actually live. Inside a build image there may be no git history, in
       * which case the size comparison has nothing to compare against and only the parse net runs. That
       * is a real reduction in cover and it must be VISIBLE: an instrument has to state the fraction of
       * the system it can see, or a green result will be read as more protection than it is.
       */
      parseNetActive: totalFiles > 0,
      sizeNetActive: withBaseline > 0,
      sizeNetCoverage: totalFiles > 0 ? `${withBaseline}/${totalFiles} files have a committed baseline` : 'none',
      degraded: totalFiles > 0 && withBaseline === 0
        ? 'NO committed baseline was available for any file, so a truncation that still parses would NOT be caught. Only the parse net ran.'
        : null,
    },
  };
}
