/**
 * Acceptance for live-surface-probe.
 *
 * The contract under test is the three-state result, and the cell that matters
 * most is HTML-FALLBACK: a login page or index.html returned with HTTP 200 in place
 * of the module must be UNDETERMINED, never ABSENT. A probe that reports ABSENT
 * there manufactures an incident, and one that reports PRESENT hides one.
 *
 * VER-06: nothing here asserts a message string or an internal field name that only
 * this implementation would produce. Cells assert states, exit codes, and the
 * presence of a reason — not its wording.
 */
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
    ABSENT, DEFAULT_SHELLS, PRESENT, UNDETERMINED, parseArgs, probe, readOnlyFetch, redact, summarise,
} from './live-surface-probe.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TOOL = path.join(HERE, 'live-surface-probe.mjs');

// A body that passes identity: both structural anchors, comfortably over the size
// floor, and no marker unless we add one.
const REAL_MODULE_NO_FIX = `${'// filler\n'.repeat(400)}\nclass OrderManager {}\nasync function persistJournal() {}\n`;
const REAL_MODULE_WITH_FIX = `${REAL_MODULE_NO_FIX}\nconst journalVouchedFor = true;\nif (!journalVouchedFor) {}\n`;
const SPA_FALLBACK = '<!DOCTYPE html>\n<html><head><title>Sign in</title></head><body>Please sign in</body></html>\n';

function server(routes) {
    const requests = [];
    const srv = http.createServer((req, res) => {
        requests.push({ method: req.method, url: req.url });
        const pathOnly = req.url.split('?')[0];
        const route = routes[req.url] || routes[pathOnly];
        if (!route) { res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('nope'); }
        const r = typeof route === 'function' ? route(req) : route;
        if (r.hang) return; // never responds; exercises the timeout path
        let body = r.body ?? '';
        // Opt-in: append the ?v= value so dual-stamp checks see distinct bytes (effective stamp).
        if (r.varyByV) {
            const v = new URL(req.url, 'http://local.test').searchParams.get('v');
            if (v) body = `${body}\n// stamp-variant:${v}\n`;
        }
        res.writeHead(r.status ?? 200, { 'content-type': r.type ?? 'application/javascript', ...(r.headers ?? {}) });
        res.end(body);
    });
    return { srv, requests };
}

async function withServer(routes, fn) {
    const { srv, requests } = server(routes);
    await new Promise((r) => srv.listen(0, '127.0.0.1', r));
    const base = `http://127.0.0.1:${srv.address().port}`;
    try { return await fn(base, requests); } finally { srv.close(); }
}

const OPTS = (base, over = {}) => ({
    baseUrl: base,
    modules: ['/chart/modules/order-manager.js'],
    markers: ['journalVouchedFor'],
    shells: [],
    timeoutMs: 2000,
    token: null,
    // Existing cells assert marker tri-state; stamp-inert has dedicated cells.
    stampInertCheck: false,
    ...over,
});

const markerOf = (report) => Object.values(report.findings[0].markers)[0];

// ---------------------------------------------------------------------------
// The three states on the module probe
// ---------------------------------------------------------------------------

test('cell 1: identified module containing the marker is PRESENT', async () => {
    await withServer({ '/chart/modules/order-manager.js': { body: REAL_MODULE_WITH_FIX } }, async (base) => {
        const r = await probe(OPTS(base));
        assert.equal(r.findings[0].identified, true);
        assert.equal(markerOf(r).state, PRESENT);
        assert.equal(r.summary.verdict, PRESENT);
        assert.equal(r.summary.exitCode, 0);
    });
});

test('cell 2: identified module WITHOUT the marker is ABSENT — the load-bearing claim', async () => {
    await withServer({ '/chart/modules/order-manager.js': { body: REAL_MODULE_NO_FIX } }, async (base) => {
        const r = await probe(OPTS(base));
        assert.equal(r.findings[0].identified, true);
        assert.equal(markerOf(r).state, ABSENT);
        assert.equal(r.summary.exitCode, 1);
    });
});

test('cell 3: HTML fallback at HTTP 200 is UNDETERMINED, never ABSENT', async () => {
    // The whole point of the tool. A naive probe greps this for the marker, finds
    // nothing, and reports the fix missing from a deployment that may be correct.
    for (const type of ['text/html', 'text/html; charset=utf-8', 'application/javascript']) {
        await withServer({ '/chart/modules/order-manager.js': { body: SPA_FALLBACK, type } }, async (base) => {
            const r = await probe(OPTS(base));
            assert.equal(r.findings[0].identified, false, `content-type ${type}`);
            assert.equal(markerOf(r).state, UNDETERMINED, `content-type ${type}`);
            assert.notEqual(markerOf(r).state, ABSENT);
            assert.ok(markerOf(r).reason, 'an UNDETERMINED finding must carry a reason');
            assert.equal(r.summary.exitCode, 3);
        });
    }
});

test('cell 3b: a LARGE HTML page carrying the anchor strings is still UNDETERMINED', async () => {
    // Added because mutation showed cell 3 did not actually exercise the HTML check:
    // the small fallback page was already caught by the size floor and the anchor
    // test, so deleting the HTML check killed nothing. This is the case only the
    // content-type/doctype check can catch — a server-rendered error page big enough
    // to clear the floor that quotes the source it failed on, so the anchors appear
    // inside markup. Reporting ABSENT here would announce that production lost the
    // fix on the strength of an error page.
    const bigHtmlEchoingSource = `<!DOCTYPE html>\n<html><body><h1>500</h1><pre>\n${'x'.repeat(4000)}\n`
        + 'class OrderManager {}\nasync function persistJournal() {}\n</pre></body></html>\n';
    for (const type of ['text/html; charset=utf-8', 'application/javascript']) {
        await withServer({ '/chart/modules/order-manager.js': { body: bigHtmlEchoingSource, type } }, async (base) => {
            const r = await probe(OPTS(base));
            assert.equal(r.findings[0].identified, false,
                `a large HTML page with the anchors must not be identified as the module (${type})`);
            assert.equal(markerOf(r).state, UNDETERMINED, type);
        });
    }
});

test('cell 4: every non-2xx is UNDETERMINED and none is ABSENT', async () => {
    for (const status of [301, 400, 401, 403, 404, 418, 500, 502, 503]) {
        await withServer({ '/chart/modules/order-manager.js': { status, body: 'x' } }, async (base) => {
            const r = await probe(OPTS(base));
            assert.equal(markerOf(r).state, UNDETERMINED, `status ${status}`);
            assert.ok(markerOf(r).reason.includes(String(status)), `reason should name status ${status}`);
        });
    }
});

test('cell 5: transport failures are UNDETERMINED', async () => {
    // Connection refused: nothing listening on this port.
    const r1 = await probe(OPTS('http://127.0.0.1:9'));
    assert.equal(markerOf(r1).state, UNDETERMINED);
    assert.ok(markerOf(r1).reason);

    // Timeout: the server accepts and never answers.
    await withServer({ '/chart/modules/order-manager.js': { hang: true } }, async (base) => {
        const r2 = await probe(OPTS(base, { timeoutMs: 300 }));
        assert.equal(markerOf(r2).state, UNDETERMINED);
        assert.match(markerOf(r2).reason, /timed out/i);
    });
});

test('cell 6: 200 with the wrong body is UNDETERMINED, not ABSENT', async () => {
    const cases = {
        'too small': 'class OrderManager {} persistJournal',
        'missing an anchor': `${'// filler\n'.repeat(400)}\nclass OrderManager {}\n`,
        'unrelated js': `${'// filler\n'.repeat(400)}\nexport const unrelated = 1;\n`,
        empty: '',
    };
    for (const [label, body] of Object.entries(cases)) {
        await withServer({ '/chart/modules/order-manager.js': { body } }, async (base) => {
            const r = await probe(OPTS(base));
            assert.equal(markerOf(r).state, UNDETERMINED, label);
            assert.equal(r.findings[0].identified, false, label);
        });
    }
});

test('cell 7: identity anchors are independent of the marker', async () => {
    // If identity depended on the fix, ABSENT could never be distinguished from
    // "served something else", and cell 2 would be unreachable.
    await withServer({ '/chart/modules/order-manager.js': { body: REAL_MODULE_NO_FIX } }, async (base) => {
        const r = await probe(OPTS(base));
        assert.equal(r.findings[0].identified, true,
            'a build predating the fix must still be identified as the module');
    });
});

// ---------------------------------------------------------------------------
// Session endpoint
// ---------------------------------------------------------------------------

test('cell 8: unauthenticated 401 is UNDETERMINED and reachable, not ABSENT', async () => {
    await withServer({ '/api/sessions/42': { status: 401, type: 'application/json', body: '{"detail":"auth"}' } }, async (base) => {
        const r = await probe(OPTS(base, { sessionId: '42' }));
        const f = r.findings.find((x) => x.kind === 'session-endpoint');
        assert.equal(f.state, UNDETERMINED);
        assert.notEqual(f.state, ABSENT);
        assert.equal(f.reachable, true, 'a 401 still proves the endpoint is there');
        assert.equal(f.credentialSupplied, false);
    });
});

test('cell 9: 200 JSON carrying .session.name is PRESENT', async () => {
    await withServer({
        '/api/sessions/42': { type: 'application/json', body: JSON.stringify({ session: { id: 42, name: 'QA-DISPOSABLE-x' } }) },
    }, async (base) => {
        const f = (await probe(OPTS(base, { sessionId: '42' }))).findings.find((x) => x.kind === 'session-endpoint');
        assert.equal(f.state, PRESENT);
        assert.equal(f.sessionName, 'QA-DISPOSABLE-x');
    });
});

test('cell 10: 200 JSON without .session.name is ABSENT — genuinely not served', async () => {
    await withServer({
        '/api/sessions/42': { type: 'application/json', body: JSON.stringify({ session: { id: 42 } }) },
    }, async (base) => {
        const f = (await probe(OPTS(base, { sessionId: '42' }))).findings.find((x) => x.kind === 'session-endpoint');
        assert.equal(f.state, ABSENT);
    });
});

test('cell 11: HTML or non-JSON at 200 on the API is UNDETERMINED', async () => {
    for (const [type, body] of [['text/html', SPA_FALLBACK], ['application/json', 'not json at all']]) {
        await withServer({ '/api/sessions/42': { type, body } }, async (base) => {
            const f = (await probe(OPTS(base, { sessionId: '42' }))).findings.find((x) => x.kind === 'session-endpoint');
            assert.equal(f.state, UNDETERMINED, type);
            assert.ok(f.reason);
        });
    }
});

// ---------------------------------------------------------------------------
// Build id
// ---------------------------------------------------------------------------

test('cell 12: build ids are read per shell and disagreement is reported', async () => {
    await withServer({
        '/a.html': { type: 'text/html', body: '<script src="/chart/modules/order-manager.js?v=20260728b81"></script>' },
        '/b.html': { type: 'text/html', body: '<script src="/chart/modules/order-manager.js?v=20260727b80"></script>' },
    }, async (base) => {
        const f = (await probe(OPTS(base, { shells: ['/a.html', '/b.html'] }))).findings.find((x) => x.kind === 'build-id');
        assert.deepEqual(f.distinctBuildIds.sort(), ['20260727b80', '20260728b81']);
        assert.equal(f.coherent, false);
        assert.ok(f.coherenceNote);
    });
});

test('cell 13: a shell with no build id is UNDETERMINED, not a build id of nothing', async () => {
    await withServer({ '/a.html': { type: 'text/html', body: '<html><body>no stamps here</body></html>' } }, async (base) => {
        const f = (await probe(OPTS(base, { shells: ['/a.html'] }))).findings.find((x) => x.kind === 'build-id');
        assert.equal(f.perShell[0].state, UNDETERMINED);
        assert.ok(f.perShell[0].reason);
    });
});

// These two cells exist because of a real false finding on 2026-07-28. The probe
// followed a 307 from /chart/index.html to /login/, read the login page, found no
// build id in it, and reported "served, but carries no recognisable build id".
// The shell was gated, not unstamped. A gate and a missing stamp need opposite
// responses, so the probe must never resolve one into the other.

test('cell 13b: an auth-gated shell reports the gate, not a missing build id', async () => {
    await withServer({
        '/chart/index.html': { status: 307, headers: { location: '/login/?next=%2Fchart%2Findex.html' }, body: '' },
        '/login/': { type: 'text/html', body: '<html><body>Sign in to Talaria</body></html>' },
    }, async (base) => {
        const f = (await probe(OPTS(base, { shells: ['/chart/index.html'] }))).findings.find((x) => x.kind === 'build-id');
        const shell = f.perShell[0];
        assert.equal(shell.state, UNDETERMINED);
        assert.equal(shell.status, 307);
        assert.equal(shell.redirectedTo, '/login/?next=%2Fchart%2Findex.html');
        assert.match(shell.reason, /authentication gate/i);
        // The exact wording of the false finding must not be reachable from a redirect.
        assert.doesNotMatch(shell.reason, /no recognisable build id/i);
    });
});

test('cell 13c: the probe does not follow a redirect, so the destination is never described', async () => {
    await withServer({
        '/chart/index.html': { status: 302, headers: { location: '/login/' }, body: '' },
        '/login/': { type: 'text/html', body: '<script src="/chart/modules/order-manager.js?v=99999999b1"></script>' },
    }, async (base, requests) => {
        const f = (await probe(OPTS(base, { shells: ['/chart/index.html'] }))).findings.find((x) => x.kind === 'build-id');
        // The login page carries a stamp. If the probe followed the redirect it would
        // report that stamp as this shell's build id, which would be a lie about which
        // artifact is deployed -- worse than reporting nothing.
        assert.equal(f.distinctBuildIds.length, 0);
        assert.ok(!requests.some((r) => r.url.startsWith('/login/')), 'probe must not request the redirect destination');
    });
});

// ---------------------------------------------------------------------------
// Safety, redaction, EVID-01
// ---------------------------------------------------------------------------

test('cell 14: the probe is read-only by construction', async () => {
    await assert.rejects(() => readOnlyFetch('http://127.0.0.1:9/', { method: 'POST', timeoutMs: 100 }), /read-only/i);
    await assert.rejects(() => readOnlyFetch('http://127.0.0.1:9/', { method: 'DELETE', timeoutMs: 100 }), /read-only/i);
    await assert.rejects(() => readOnlyFetch('http://127.0.0.1:9/', { method: 'PATCH', timeoutMs: 100 }), /read-only/i);
});

test('cell 15: a full run issues only GET requests', async () => {
    await withServer({
        '/chart/modules/order-manager.js': { body: REAL_MODULE_WITH_FIX },
        '/api/sessions/42': { type: 'application/json', body: JSON.stringify({ session: { id: 42, name: 'n' } }) },
        '/a.html': { type: 'text/html', body: '<script src="/x.js?v=20260728b81"></script>' },
    }, async (base, requests) => {
        await probe(OPTS(base, { sessionId: '42', shells: ['/a.html'] }));
        assert.ok(requests.length > 0);
        assert.deepEqual([...new Set(requests.map((r) => r.method))], ['GET']);
    });
});

test('cell 16: the credential never appears in output', async () => {
    const token = 'super-secret-token-value';
    await withServer({ '/chart/modules/order-manager.js': { body: REAL_MODULE_WITH_FIX } }, async (base) => {
        const r = await probe(OPTS(base, { token }));
        assert.ok(!JSON.stringify(r).includes(token), 'token leaked into the report');
        assert.equal(r.credentialSupplied, true);
    });
    assert.ok(!redact(`Bearer ${token} here`, token).includes(token));
    assert.ok(!redact('https://user:pw@host/x', null).includes('user:pw'));
});

test('cell 17: EVID-01 — an existing record is never overwritten', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'probe-evid-'));
    try {
        await withServer({
            '/chart/modules/order-manager.js': { body: REAL_MODULE_WITH_FIX },
            '/a.html': { type: 'text/html', body: '<script src="/chart/modules/order-manager.js?v=20260728b81"></script>' },
        }, async (base) => {
            const run = (extra = []) => new Promise((res) => execFile('node',
                [TOOL, `--base-url=${base}`, `--out=${dir}`, '--json', '--shell=/a.html',
                    '--no-stamp-inert-check', ...extra],
                (err, stdout, stderr) => res({ code: err?.code ?? 0, stdout, stderr })));

            const first = await run();
            assert.equal(first.code, 0);
            const files = fs.readdirSync(dir);
            assert.equal(files.length, 1);

            const body = fs.readFileSync(path.join(dir, files[0]), 'utf8');
            assert.ok(JSON.parse(body).findings.length > 0);

            // The record is read-only on disk; a rewrite must not silently succeed.
            assert.throws(() => fs.writeFileSync(path.join(dir, files[0]), 'tampered', { flag: 'wx' }));
        });
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

// ---------------------------------------------------------------------------
// One command, and the exit-code contract
// ---------------------------------------------------------------------------

test('cell 18: the PO runs one command, and exit codes separate the three states', async () => {
    const SHELL = { type: 'text/html', body: '<script src="/chart/modules/order-manager.js?v=20260728b81"></script>' };
    const cli = (base) => new Promise((res) => execFile('node',
        [TOOL, `--base-url=${base}`, '--shell=/a.html', '--no-stamp-inert-check'],
        (err, stdout, stderr) => res({ code: err?.code ?? 0, stdout: String(stdout), stderr: String(stderr) })));

    await withServer({ '/chart/modules/order-manager.js': { body: REAL_MODULE_WITH_FIX }, '/a.html': SHELL }, async (base) => {
        const r = await cli(base);
        assert.equal(r.code, 0);
        assert.match(r.stdout, /VERDICT: PRESENT/);
    });
    await withServer({ '/chart/modules/order-manager.js': { body: REAL_MODULE_NO_FIX }, '/a.html': SHELL }, async (base) => {
        const r = await cli(base);
        assert.equal(r.code, 1, 'ABSENT must be distinguishable from UNDETERMINED by exit code alone');
        assert.match(r.stdout, /VERDICT: ABSENT/);
    });
    await withServer({ '/chart/modules/order-manager.js': { body: SPA_FALLBACK, type: 'text/html' }, '/a.html': SHELL }, async (base) => {
        const r = await cli(base);
        assert.equal(r.code, 3);
        assert.match(r.stdout, /VERDICT: UNDETERMINED/);
    });
});

test('cell 19: summarise never promotes UNDETERMINED to a pass', async () => {
    const mixed = [{ kind: 'module', markers: { m: { state: PRESENT }, n: { state: UNDETERMINED } } }];
    assert.equal(summarise(mixed).verdict, UNDETERMINED);
    assert.notEqual(summarise(mixed).exitCode, 0);
    const withAbsent = [{ kind: 'module', markers: { m: { state: UNDETERMINED }, n: { state: ABSENT } } }];
    assert.equal(summarise(withAbsent).verdict, ABSENT, 'ABSENT outranks UNDETERMINED');
});

// ---------------------------------------------------------------------------
// Inert ?v= + deploy-gate (DEPLOY-01 teeth)
// ---------------------------------------------------------------------------

test('cell 20: inert ?v= is detected when two stamps return byte-identical bodies', async () => {
    await withServer({
        '/chart/modules/order-manager.js': { body: REAL_MODULE_WITH_FIX },
    }, async (base) => {
        const r = await probe(OPTS(base, { stampInertCheck: true, shells: [] }));
        const f = r.findings.find((x) => x.kind === 'stamp-inert');
        assert.ok(f);
        assert.equal(f.stampInert, true);
        assert.equal(f.variants[0].sha256, f.variants[1].sha256);
        // Must NOT flip the guard marker — module stays PRESENT.
        assert.equal(markerOf(r).state, PRESENT);
        assert.equal(r.findings[0].identified, true);
        assert.equal(r.summary.verdict, UNDETERMINED);
        assert.equal(r.summary.exitCode, 3);
        assert.equal(r.summary.stampInert, true);
    });
});

test('cell 20b: effective ?v= yields stampInert false when bodies differ', async () => {
    await withServer({
        '/chart/modules/order-manager.js': { body: REAL_MODULE_WITH_FIX, varyByV: true },
    }, async (base) => {
        const r = await probe(OPTS(base, { stampInertCheck: true, shells: [] }));
        const f = r.findings.find((x) => x.kind === 'stamp-inert');
        assert.equal(f.stampInert, false);
        assert.notEqual(f.variants[0].sha256, f.variants[1].sha256);
        assert.equal(markerOf(r).state, PRESENT);
        assert.equal(r.summary.exitCode, 0);
    });
});

test('cell 20c: inert stamp does not rewrite ABSENT marker to PRESENT or UNDETERMINED-as-absent', async () => {
    await withServer({
        '/chart/modules/order-manager.js': { body: REAL_MODULE_NO_FIX },
    }, async (base) => {
        const r = await probe(OPTS(base, { stampInertCheck: true, shells: [] }));
        assert.equal(markerOf(r).state, ABSENT, 'inert stamp must not touch marker state');
        assert.equal(r.summary.exitCode, 1, 'ABSENT outranks inert-stamp UNDETERMINED');
        const f = r.findings.find((x) => x.kind === 'stamp-inert');
        assert.equal(f.stampInert, true);
    });
});

test('cell 21: deploy-gate fails (exit 2) when 200 shells disagree on build id', async () => {
    await withServer({
        '/chart/modules/order-manager.js': { body: REAL_MODULE_WITH_FIX, varyByV: true },
        '/chart/dist-v9/index.html': {
            type: 'text/html',
            body: '<script src="/chart/modules/order-manager.js?v=20260728b81"></script>',
        },
        '/chart/talaria-design/live/index.html': {
            type: 'text/html',
            body: '<script src="/chart/modules/order-manager.js?v=20260723b12"></script>',
        },
    }, async (base) => {
        const r = await probe(OPTS(base, {
            stampInertCheck: true,
            deployGate: true,
            shells: ['/chart/dist-v9/index.html', '/chart/talaria-design/live/index.html'],
        }));
        const bid = r.findings.find((x) => x.kind === 'build-id');
        assert.equal(bid.coherent, false);
        assert.equal(markerOf(r).state, PRESENT);
        assert.equal(r.summary.exitCode, 2);
        assert.ok(r.summary.deployHazards.includes('incoherentShells'));
    });
});

test('cell 22: deploy-gate fails (exit 2) when stamp is inert', async () => {
    await withServer({
        '/chart/modules/order-manager.js': { body: REAL_MODULE_WITH_FIX },
        '/a.html': {
            type: 'text/html',
            body: '<script src="/chart/modules/order-manager.js?v=20260728b81"></script>',
        },
    }, async (base) => {
        const r = await probe(OPTS(base, {
            stampInertCheck: true,
            deployGate: true,
            shells: ['/a.html'],
        }));
        assert.equal(markerOf(r).state, PRESENT);
        assert.equal(r.findings.find((x) => x.kind === 'stamp-inert').stampInert, true);
        assert.equal(r.summary.exitCode, 2);
        assert.ok(r.summary.deployHazards.includes('stampInert'));
    });
});

test('cell 22b: deploy-gate passes when markers PRESENT, shells coherent, stamp effective', async () => {
    await withServer({
        '/chart/modules/order-manager.js': { body: REAL_MODULE_WITH_FIX, varyByV: true },
        '/chart/dist-v9/index.html': {
            type: 'text/html',
            body: '<script src="/chart/modules/order-manager.js?v=20260728b81"></script>',
        },
        '/chart/talaria-design/live/index.html': {
            type: 'text/html',
            body: '<script src="/chart/chart.js?v=20260728b81"></script>',
        },
    }, async (base) => {
        const r = await probe(OPTS(base, {
            stampInertCheck: true,
            deployGate: true,
            shells: ['/chart/dist-v9/index.html', '/chart/talaria-design/live/index.html'],
        }));
        assert.equal(r.summary.exitCode, 0);
        assert.equal(r.summary.verdict, PRESENT);
        assert.equal(r.summary.stampInert, false);
        assert.equal(r.findings.find((x) => x.kind === 'build-id').coherent, true);
    });
});

test('cell 23: auth-gated shell does not poison coherence under deploy-gate', async () => {
    await withServer({
        '/chart/modules/order-manager.js': { body: REAL_MODULE_WITH_FIX, varyByV: true },
        '/chart/dist-v9/index.html': {
            type: 'text/html',
            body: '<script src="/chart/modules/order-manager.js?v=20260728b81"></script>',
        },
        '/chart/index.html': { status: 307, headers: { location: '/login/?next=%2Fchart%2Findex.html' }, body: '' },
        '/chart/legacy-index.html': { status: 404, body: 'gone' },
        '/login/': { type: 'text/html', body: '<script src="/x.js?v=99999999b1"></script>' },
    }, async (base, requests) => {
        const r = await probe(OPTS(base, {
            stampInertCheck: true,
            deployGate: true,
            shells: ['/chart/dist-v9/index.html', '/chart/index.html', '/chart/legacy-index.html'],
        }));
        const bid = r.findings.find((x) => x.kind === 'build-id');
        assert.equal(bid.coherent, true, '307 + 404 must not invent a second build id');
        assert.equal(bid.presentShellCount, 1);
        assert.ok(bid.perShell.find((s) => s.shell === '/chart/index.html').ignoredForCoherence);
        assert.ok(bid.perShell.find((s) => s.shell === '/chart/legacy-index.html').ignoredForCoherence);
        assert.equal(r.summary.exitCode, 0);
        assert.ok(!requests.some((req) => req.url.startsWith('/login/')));
    });
});

test('cell 24b: deploy-gate fails when CHART_ENGINE_BUILD disagrees with shell id', async () => {
    await withServer({
        '/chart/modules/order-manager.js': { body: REAL_MODULE_WITH_FIX, varyByV: true },
        '/chart/chart.js': {
            body: "const CHART_ENGINE_BUILD = '20260720b01';\n",
        },
        '/chart/dist-v9/index.html': {
            type: 'text/html',
            body: "<script>window.__TALARIA_CHART_BUILD_ID='20260728b81'</script>"
                + '<script src="/chart/modules/order-manager.js?v=20260728b81"></script>',
        },
    }, async (base) => {
        const r = await probe(OPTS(base, {
            stampInertCheck: true,
            deployGate: true,
            engineBuildCheck: true,
            shells: ['/chart/dist-v9/index.html'],
        }));
        const eng = r.findings.find((x) => x.kind === 'engine-build');
        assert.equal(eng.engineChecked, true);
        assert.equal(eng.match, false);
        assert.equal(r.summary.exitCode, 2);
        assert.ok(r.summary.deployHazards.includes('engineShellMismatch'));
    });
});

test('cell 24c: deploy-gate passes when engine build matches shell id', async () => {
    await withServer({
        '/chart/modules/order-manager.js': { body: REAL_MODULE_WITH_FIX, varyByV: true },
        '/chart/chart.js': {
            body: "const CHART_ENGINE_BUILD = '20260728b81';\n",
        },
        '/chart/dist-v9/index.html': {
            type: 'text/html',
            body: "<script>window.__TALARIA_CHART_BUILD_ID='20260728b81'</script>"
                + '<script src="/chart/modules/order-manager.js?v=20260728b81"></script>',
        },
    }, async (base) => {
        const r = await probe(OPTS(base, {
            stampInertCheck: true,
            deployGate: true,
            engineBuildCheck: true,
            shells: ['/chart/dist-v9/index.html'],
        }));
        const eng = r.findings.find((x) => x.kind === 'engine-build');
        assert.equal(eng.match, true);
        assert.equal(r.summary.exitCode, 0);
    });
});

test('cell 24: default shells include talaria-design/live', () => {
    const opts = parseArgs(['--base-url=http://example.test']);
    assert.ok(opts.shells.includes('/chart/talaria-design/live/index.html'));
    assert.ok(DEFAULT_SHELLS.includes('/chart/talaria-design/live/index.html'));
    assert.equal(opts.deployGate, false);
    assert.equal(opts.stampInertCheck, true);
});

test('cell 25: deploy-gate CLI exits 2 on inert stamp', async () => {
    const SHELL = { type: 'text/html', body: '<script src="/chart/modules/order-manager.js?v=20260728b81"></script>' };
    await withServer({
        '/chart/modules/order-manager.js': { body: REAL_MODULE_WITH_FIX },
        '/a.html': SHELL,
    }, async (base) => {
        const r = await new Promise((res) => execFile('node',
            [TOOL, `--base-url=${base}`, '--shell=/a.html', '--deploy-gate'],
            (err, stdout, stderr) => res({ code: err?.code ?? 0, stdout: String(stdout), stderr: String(stderr) })));
        assert.equal(r.code, 2);
        assert.match(r.stdout, /stampInert|DEPLOY-GATE FAIL/i);
    });
});
