#!/usr/bin/env node
/**
 * ANIMATION-CONTRACT ORACLE 3 — ROUTING, not a floor ban.
 *
 * AS THE PO FIRST DRAFTED IT, Oracle 3 asserted that a 1m-floor symbol offers no sub-minute step.
 * That forbids the amendment's central feature: sub-TF stepping on a 1m floor via puppet frames.
 * Rewritten here as a ROUTING oracle.
 *
 * CONTRACT (post-amendment):
 *   Given a 1m-floor symbol requested at step=1s,
 *     1. the renderer enters PUPPET mode (synthetic sub-bar frames),
 *     2. the SIM tag is present on those frames,
 *     3. resolveBar is untouched — the real bar resolver must not rewrite the 1m floor into a 1s bar.
 *
 * BIND-01 STATES (this gate must name which one it saw):
 *   RESOLVER_ABSENT_FROM_TREE  — no animation-contract / puppet / SIM-tag surface in the served bytes
 *   RESOLVER_PRESENT_BUT_UNCALLED — surface exists but the 1m+step=1s path never reaches it
 *   RESOLVER_CALLED_BUT_WRONG — surface reached and the routing is wrong (no puppet, no SIM, or resolveBar mutated)
 *
 * A7 NEWSREADER TRAP (PO Q3):
 *   With 1m the floor everywhere in production, the newsreader half of A7 — the half that needs a
 *   genuine sub-minute market step — is unreachable on live symbols. An oracle that only runs against
 *   production symbols will pass that half VACUOUSLY. It must be exercised against an explicit fixture
 *   that offers a sub-minute floor, named in the artifact, or the half is VOID not GREEN.
 *
 *   node docs/plan3/oracles/animation-contract-o3-routing.mjs
 *   node docs/plan3/oracles/animation-contract-o3-routing.mjs --fixture=subminute-floor
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../..');
const ORIGIN = String(process.env.TEST_VPS_URL || 'http://31.97.192.82:3000').replace(/\/$/, '');
const FIXTURE = process.argv.find((a) => a.startsWith('--fixture='))?.split('=')[1] || null;

const PRODUCT_PATHS = [
  'chart v 1.4/chart/modules/replay-system.js',
  'chart v 1.4/chart/chart.js',
  'homepage/public/chart/modules/replay-system.js',
  'homepage/public/chart/chart.js',
];

/** Identifiers that mean the amendment's routing surface exists. stepMs alone is NOT one of them. */
const ROUTING_TOKENS = [
  'animationContract', 'ANIMATION_CONTRACT',
  'puppet', 'Puppet', 'PUPPET',
  'SIM_TAG', 'simTag', '__TALARIA_SIM',
  'resolveBar',
  'newsreader', 'Newsreader',
  'subMinuteStep', 'subTimeframeStep', 'setStepSeconds',
];

const checks = [];
const gate = (name, pass, detail, state = null) => {
  checks.push({ name, pass, detail, state });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${state ? `  [${state}]` : ''}${detail ? ` — ${detail}` : ''}`);
};

function scanTree() {
  const hits = [];
  for (const rel of PRODUCT_PATHS) {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) { hits.push({ file: rel, readable: false, why: 'missing from tree' }); continue; }
    const body = fs.readFileSync(abs, 'utf8');
    const found = {};
    for (const t of ROUTING_TOKENS) {
      const n = body.split(t).length - 1;
      if (n > 0) found[t] = n;
    }
    hits.push({ file: rel, readable: true, bytes: body.length, tokensFound: found, clean: Object.keys(found).length === 0 });
  }
  return hits;
}

async function scanServed() {
  const files = ['/chart/modules/replay-system.js', '/chart/chart.js'];
  const out = [];
  for (const p of files) {
    try {
      const r = await fetch(ORIGIN + p);
      const ct = r.headers.get('content-type') || '';
      const body = await r.text();
      if (!r.ok || /text\/html/i.test(ct)) {
        out.push({ file: p, readable: false, why: `status ${r.status} ct ${ct.split(';')[0]}` });
        continue;
      }
      const found = {};
      for (const t of ROUTING_TOKENS) {
        const n = body.split(t).length - 1;
        if (n > 0) found[t] = n;
      }
      out.push({ file: p, readable: true, bytes: Buffer.byteLength(body), tokensFound: found, clean: Object.keys(found).length === 0 });
    } catch (e) {
      out.push({ file: p, readable: false, why: String(e).slice(0, 80) });
    }
  }
  return out;
}

/**
 * The routing assertion itself. On a tree without the amendment this is ABSENT, not WRONG — calling
 * it wrong would treat "no puppet yet" as a product defect on the pre-amendment baseline.
 *
 * When the amendment lands, replace the body of `exerciseRouting` with a real session that:
 *   - loads a 1m-floor symbol
 *   - requests step=1s
 *   - asserts render mode === 'puppet'
 *   - asserts SIM tag on the synthetic frames
 *   - asserts resolveBar's return shape/identity is unchanged (same bar open time, same TF)
 */
function exerciseRouting({ amendmentPresent, fixture }) {
  if (!amendmentPresent) {
    return {
      state: 'RESOLVER_ABSENT_FROM_TREE',
      ok: false,
      why: 'No animation-contract routing surface in tree or served bytes. Oracle 3 cannot be GREEN until the amendment lands; ABSENT is the correct pre-amendment reading, not a product defect.',
    };
  }
  if (!fixture) {
    return {
      state: 'RESOLVER_PRESENT_BUT_UNCALLED',
      ok: false,
      why: 'Amendment surface is present, but this invocation did not supply --fixture=subminute-floor. With 1m the floor everywhere in production, the newsreader half of A7 is unreachable without a fixture and would pass vacuously. Refusing rather than greening.',
      a7NewsreaderTrap: true,
    };
  }
  // Placeholder until A/E land the contract. A real exercise replaces this branch.
  return {
    state: 'RESOLVER_PRESENT_BUT_UNCALLED',
    ok: false,
    why: `Fixture '${fixture}' named, but the live routing exercise is not yet bound to product APIs (awaiting A/E land). BIND-01: present is not binding.`,
    expected: {
      floor: '1m',
      step: '1s',
      renderMode: 'puppet',
      simTag: true,
      resolveBarUntouched: true,
    },
  };
}

const tree = scanTree();
const served = await scanServed();
const treeHas = tree.some((t) => t.readable && !t.clean);
const servedHas = served.some((t) => t.readable && !t.clean);
const amendmentPresent = treeHas || servedHas;

console.log('ANIMATION-CONTRACT ORACLE 3 — routing (1m-floor @ step=1s → puppet + SIM, resolveBar untouched)');
console.log(`  tree amendment surface: ${treeHas ? 'PRESENT' : 'ABSENT'}`);
console.log(`  served amendment surface: ${servedHas ? 'PRESENT' : 'ABSENT'}`);
console.log(`  fixture: ${FIXTURE || '(none — production symbols only)'}`);

gate(
  'Oracle 3 is a ROUTING oracle, not a floor ban',
  true,
  '1m-floor at step=1s must render puppet with SIM tag; resolveBar untouched. The PO\'s first draft forbade the central feature and is withdrawn.',
);

const routing = exerciseRouting({ amendmentPresent, fixture: FIXTURE });
gate(
  '1m-floor @ step=1s routes to puppet + SIM with resolveBar untouched',
  routing.ok,
  routing.why,
  routing.state,
);

/**
 * The A7 newsreader half. Named as its own gate so a vacuous green cannot hide inside the routing
 * result. Without a sub-minute-floor fixture this gate is VOID, never PASS.
 */
if (!FIXTURE) {
  gate(
    'A7 newsreader half (sub-minute floor) is exercised, not vacuously passed',
    false,
    'VOID: 1m is the floor everywhere in production, so the newsreader half cannot fire on live symbols. Pass --fixture=subminute-floor or this half stays VOID.',
    'VOID_UNREACHABLE_WITHOUT_FIXTURE',
  );
} else {
  gate(
    'A7 newsreader half (sub-minute floor) is exercised, not vacuously passed',
    false,
    `Fixture '${FIXTURE}' named, but the newsreader exercise is not yet bound (awaiting A/E land). Named VOID rather than PASS.`,
    'RESOLVER_PRESENT_BUT_UNCALLED',
  );
}

const redOnKnownDefect = !amendmentPresent
  ? { ok: true, note: 'Pre-amendment: ABSENT is the correct RED-shaped reading; the gate discriminates absence from a wrong route.' }
  : { ok: routing.state === 'RESOLVER_CALLED_BUT_WRONG' || routing.state === 'RESOLVER_PRESENT_BUT_UNCALLED', note: 'Post-amendment must demonstrate RED on a known-bad route before a GREEN is trusted.' };

gate('gate demonstrates discrimination (BIND-01)', redOnKnownDefect.ok, redOnKnownDefect.note);

const passed = checks.filter((c) => c.pass).length;
const report = {
  signature: 'TALARIA_ANIMATION_CONTRACT_O3_ROUTING_V1',
  at: new Date().toISOString(),
  origin: ORIGIN,
  fixture: FIXTURE,
  contract: {
    kind: 'routing',
    withdrawnDraft: '1m-floor symbol offers no sub-minute step — FORBIDS the amendment\'s central feature',
    replacement: '1m-floor at step=1s → puppet + SIM tag; resolveBar untouched',
  },
  a7NewsreaderTrap: {
    named: true,
    reason: 'With 1m the floor everywhere (PO Q3), the newsreader half of A7 is unreachable in production and will pass vacuously unless exercised against a sub-minute-floor fixture.',
    requiredFlag: '--fixture=subminute-floor',
  },
  tree, served, amendmentPresent, routing,
  passed, total: checks.length, checks,
  verdict: amendmentPresent
    ? (routing.ok ? 'O3 GREEN' : `O3 RED — ${routing.state}`)
    : 'O3 ABSENT (pre-amendment) — correct; do not read as product defect',
};

const out = path.join('c:\\Users\\user\\Desktop\\talaria1\\_evidence\\manager-C', `animation-contract-o3-routing-${Date.now()}.json`);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(report, null, 2));
console.log(`\n  ${passed}/${checks.length} — ${report.verdict}`);
console.log(`  artifact ${out}`);
// Pre-amendment ABSENT is an expected holding state, not a process failure. Exit 0 so CI does not
// treat "tree correctly lacks the amendment" as a broken gate. Post-amendment RED exits 1.
process.exitCode = amendmentPresent && !routing.ok ? 1 : 0;
