/**
 * ROOT-DEPTH-01 fix — replace fixed-depth root anchors with B's root-walk.
 *
 * Applies the function B landed in `ba6a07cfe`, unchanged, rather than writing a
 * second one: two root-finders that disagree is the same class of defect as two
 * definitions of a governed path. The walk works from either mirror depth, so
 * both copies of a gate can stay byte-identical, which is what let this hide —
 * the two copies WERE identical, and identically wrong in one of the two places.
 *
 * Only touches files the audit proved broken (NEVER_RAN or ANCHOR_FAKE_RED) and
 * their mirror partners, so a currently-working gate is only rewritten when its
 * twin is dead and parity has to be kept.
 *
 *   node scripts/gate-root-depth-fix.mjs --dry
 *   node scripts/gate-root-depth-fix.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const log = (m) => console.log(`[root-depth-fix] ${m}`);

const MIRROR_TREES = [
  ['chart v 1.4/chart/modules', 'homepage/public/chart/modules'],
  ['chart v 1.4/chart/multichart-prod/harness', 'homepage/public/chart/multichart-prod/harness'],
];

/** B's root-walk, verbatim from ba6a07cfe. */
const FIND_ROOT = `
/**
 * Walk up to the repo root instead of counting directory levels.
 *
 * This file is mirrored to a tree at a DIFFERENT depth, so a fixed '../../..'
 * resolved to the wrong directory in one of the two locations and the gate there
 * died on load, or failed a cell on a path it built itself. A gate that cannot
 * reach its subject reports a red indistinguishable from a product defect.
 */
function findRoot(start) {
  let dir = start;
  for (let i = 0; i < 12; i += 1) {
    if (fs.existsSync(path.join(dir, 'chart v 1.4')) && fs.existsSync(path.join(dir, 'homepage'))) return dir;
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  throw new Error(\`ANCHOR_BROKEN: repo root not found from \${start}\`);
}
`;

/**
 * Any `path.resolve/join` off `__dirname` whose arguments are all string
 * literals. Four spellings appear in this tree and they are the same act:
 *   '../../..'                     stacked in one literal
 *   '..', '..', '..'               one per argument
 *   '../../../homepage/public'     dotdots with a suffix
 *   '..','..','..','talaria-design','src','x.jsx'
 * Matching the expression rather than a declaration line also catches the ones
 * used inline, which never had a ROOT variable to notice.
 */
/** The directory variable is a local naming choice; `HERE` climbs the same way. */
function dirVarsOf(src) {
  const names = new Set(['__dirname']);
  const re = /const\s+([A-Za-z_$][\w$]*)\s*=\s*path\.dirname\(\s*(?:fileURLToPath\(\s*import\.meta\.url\s*\)|__filename)\s*\)/g;
  let m;
  while ((m = re.exec(src))) names.add(m[1]);
  return [...names];
}
const anchorExprFor = (name) => new RegExp(String.raw`path\.(?:resolve|join)\(\s*${name}\s*,\s*((?:['"][^'"]*['"]\s*,\s*)*['"][^'"]*['"])\s*\)`, 'g');
/** `const X = path.resolve(chartRoot, '..', '..')` — anchored on an earlier anchor. */
const CHAINED_EXPR = /path\.(?:resolve|join)\(\s*([A-Za-z_$][\w$]*)\s*,\s*((?:['"][^'"]*['"]\s*,\s*)*['"][^'"]*['"])\s*\)/g;

const isRepoRoot = (dir) => fs.existsSync(path.join(dir, 'chart v 1.4')) && fs.existsSync(path.join(dir, 'homepage'));

function twinOf(rel) {
  for (const [a, b] of MIRROR_TREES) {
    if (rel.startsWith(`${a}/`)) return `${b}/${rel.slice(a.length + 1)}`;
    if (rel.startsWith(`${b}/`)) return `${a}/${rel.slice(b.length + 1)}`;
  }
  return null;
}

/**
 * Is this anchor trying to be the repo root?
 *
 * Decided by resolution rather than by how the variable is later used. Matching
 * usage textually meant chasing every way a path can be spelled — `join(R,
 * 'homepage/x')` and `join(R, 'homepage', 'x')` are the same intent and only one
 * of them matched. Resolution needs no such list: the same expression evaluated
 * from the two mirror depths lands on the repo root in exactly one of them
 * precisely when it is a root anchor counting levels. An anchor meaning
 * something else — `'..'` for the chart directory — lands on a non-root in both,
 * and is left alone.
 */
/** Flatten the argument literals into path segments. */
function segmentsOf(argsSrc) {
  return [...argsSrc.matchAll(/['"]([^'"]*)['"]/g)]
    .flatMap((m) => m[1].split(/[\\/]+/))
    .filter((s) => s.length && s !== '.');
}

function isRootAnchor(rel, dotdots, extraLevels = 0) {
  const twin = twinOf(rel);
  if (!twin) return false;
  const climb = Array(dotdots + extraLevels).fill('..');
  if (!climb.length) return false;
  const here = path.resolve(path.dirname(path.join(ROOT, rel)), ...climb);
  const there = path.resolve(path.dirname(path.join(ROOT, twin)), ...climb);
  return isRepoRoot(here) !== isRepoRoot(there);
}

function rewrite(file, rel) {
  const src = fs.readFileSync(file, 'utf8');
  if (src.includes('function findRoot(')) return { skipped: 'already root-walked' };

  const names = [];
  const replaceExpr = (whole, argsSrc, extraLevels, base, dirVar = '__dirname') => {
    const segs = segmentsOf(argsSrc);
    const dotdots = segs.findIndex((s) => s !== '..');
    const climb = dotdots === -1 ? segs.length : dotdots;
    const suffix = dotdots === -1 ? [] : segs.slice(dotdots);
    if (!isRootAnchor(rel, climb, extraLevels)) return whole;
    names.push(`${base}${'/..'.repeat(climb)}${suffix.length ? ` + ${suffix.join('/')}` : ''}`);
    // A suffix is kept as one root-relative literal, which is also what makes
    // the intent legible: the gate wants <repo>/homepage/public/chart, not four
    // levels up from wherever this copy happens to live.
    return suffix.length
      ? `path.resolve(findRoot(${dirVar}), '${suffix.join('/')}')`
      : `findRoot(${dirVar})`;
  };

  const dirVars = dirVarsOf(src);
  let out = src;
  for (const name of dirVars) {
    out = out.replace(anchorExprFor(name), (whole, argsSrc) => replaceExpr(whole, argsSrc, 0, name, name));
  }

  // Second pass for anchors chained off an earlier one. Only safe when that
  // earlier variable is itself a pure dotdot climb from __dirname, so the two
  // climbs can be added.
  out = out.replace(CHAINED_EXPR, (whole, baseName, argsSrc) => {
    if (baseName === '__dirname') return whole;
    const baseDecl = new RegExp(String.raw`const\s+${baseName}\s*=\s*path\.(?:resolve|join)\(\s*__dirname\s*,\s*((?:['"][^'"]*['"]\s*,\s*)*['"][^'"]*['"])\s*\)`).exec(src);
    if (!baseDecl) return whole;
    const baseSegs = segmentsOf(baseDecl[1]);
    if (!baseSegs.every((s) => s === '..')) return whole;
    return replaceExpr(whole, argsSrc, baseSegs.length, baseName);
  });

  if (!names.length) return { skipped: 'no root anchor (the fixed depth points at a sibling, not the root)' };

  if (!/^import fs from 'node:fs';$/m.test(out) && !/^import \* as fs from 'node:fs';$/m.test(out)) {
    if (!/^import path from 'node:path';$/m.test(out)) return { skipped: 'no anchor point for the fs import' };
    out = out.replace(/^import path from 'node:path';$/m, "import fs from 'node:fs';\nimport path from 'node:path';");
  }

  // Insert the walk after the __dirname line it depends on.
  const dirnameLine = new RegExp(String.raw`^const (?:${dirVars.join('|')}) = .*$`, 'm').exec(out);
  if (!dirnameLine) return { skipped: 'no directory-variable declaration to anchor the helper to' };
  const at = dirnameLine.index + dirnameLine[0].length;
  out = `${out.slice(0, at)}\n${FIND_ROOT}${out.slice(at)}`;

  return { out, names };
}

function main() {
  const dry = process.argv.includes('--dry');
  const auditDir = path.join(ROOT, 'docs/plan3/evidence');
  const latest = fs.readdirSync(auditDir).filter((f) => f.startsWith('root-depth-audit-')).sort().pop();
  if (!latest) throw new Error('no audit artifact — run scripts/gate-root-depth-audit.mjs first');
  const audit = JSON.parse(fs.readFileSync(path.join(auditDir, latest), 'utf8'));
  log(`audit: ${latest} (HEAD ${audit.provenance?.headSha})`);

  const broken = audit.executed
    .filter((e) => e.state === 'NEVER_RAN' || e.state === 'ANCHOR_FAKE_RED')
    .map((e) => e.file);

  // Pull in the twin of every broken file so the two copies do not diverge.
  const targets = new Set(broken);
  for (const f of broken) {
    for (const [a, b] of MIRROR_TREES) {
      if (f.startsWith(`${a}/`)) targets.add(`${b}/${f.slice(a.length + 1)}`);
      if (f.startsWith(`${b}/`)) targets.add(`${a}/${f.slice(b.length + 1)}`);
    }
  }

  let changed = 0;
  const skipped = [];
  for (const rel of [...targets].sort()) {
    const full = path.join(ROOT, rel);
    if (!fs.existsSync(full)) { skipped.push(`${rel} — no such file (unmirrored)`); continue; }
    const r = rewrite(full, rel);
    if (r.skipped) { skipped.push(`${rel} — ${r.skipped}`); continue; }
    if (!dry) fs.writeFileSync(full, r.out);
    changed += 1;
    log(`${dry ? 'would rewrite' : 'rewrote'} ${rel} (${r.names.join(', ')})`);
  }
  log('');
  for (const s of skipped) log(`skip: ${s}`);
  log(`${changed} file(s) ${dry ? 'would be ' : ''}rewritten, ${skipped.length} skipped`);
}

main();
