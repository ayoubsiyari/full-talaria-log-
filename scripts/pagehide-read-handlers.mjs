#!/usr/bin/env node
/**
 * Read, not count. The scan found 11 `pagehide` references in chart.js, and a count cannot tell a
 * handler that RELEASES memory from one that WRITES state — which is the whole question RESET-01 asks.
 */
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';

const ORIGIN = String(process.env.TEST_VPS_URL || 'http://31.97.192.82:3000').replace(/\/$/, '');
const OUT = 'c:\\Users\\user\\Desktop\\talaria1\\_evidence\\manager-C\\PAGEHIDE-HANDLER-READ-20260731.json';

const get = (p) => new Promise((res) => {
  const lib = ORIGIN.startsWith('https') ? https : http;
  lib.get(ORIGIN + p, (r) => {
    let d = '';
    r.on('data', (c) => { d += c; });
    r.on('end', () => res({ code: r.statusCode, body: d }));
  }).on('error', () => res({ code: 0, body: '' }));
});

const report = {
  signature: 'PAGEHIDE-HANDLER-READ-V1',
  ruling: 'RESET-01 — read every pagehide site and classify it as RELEASE or WRITE',
  bfcacheState: 'not applicable: static read of served code',
  startedAtIso: new Date().toISOString(),
  sites: [],
};

(async () => {
  const r = await get('/chart/chart.js');
  if (r.code !== 200) { report.error = `HTTP ${r.code}`; fs.writeFileSync(OUT, JSON.stringify(report, null, 1)); process.exit(0); }
  const body = r.body;
  const lines = body.split('\n');

  const RELEASE = /\b(release|dispose|destroy|clear|purge|evict|free|null|delete|length\s*=\s*0)\b/i;
  const WRITE = /\b(flush|save|persist|store|send|beacon|post|sync)\b/i;

  lines.forEach((line, i) => {
    if (!/pagehide/.test(line)) return;
    // Only real listener registrations matter; the rest are comments explaining them.
    const isRegistration = /addEventListener\s*\(\s*['"`]pagehide/.test(line) || /onpagehide\s*=/.test(line);
    const context = lines.slice(Math.max(0, i - 3), i + 6).join('\n');
    const handlerName = (line.match(/addEventListener\s*\(\s*['"`]pagehide['"`]\s*,\s*([A-Za-z0-9_$.]+)/) || [])[1] || null;
    report.sites.push({
      line: i + 1,
      isRegistration,
      isComment: /^\s*(\/\/|\*)/.test(line),
      handlerName,
      classified: isRegistration
        ? (RELEASE.test(context) && !WRITE.test(line) ? 'RELEASE-ish' : (WRITE.test(context) ? 'WRITE' : 'UNCLEAR'))
        : 'not-a-registration',
      text: line.trim().slice(0, 200),
    });
  });

  const registrations = report.sites.filter((s) => s.isRegistration);
  report.summary = {
    totalMentions: report.sites.length,
    actualRegistrations: registrations.length,
    commentsOnly: report.sites.filter((s) => s.isComment).length,
    handlerNames: [...new Set(registrations.map((s) => s.handlerName).filter(Boolean))],
    classifications: registrations.reduce((acc, s) => { acc[s.classified] = (acc[s.classified] || 0) + 1; return acc; }, {}),
  };

  // For each named handler, find its body and judge what it actually does.
  report.handlerBodies = {};
  for (const name of report.summary.handlerNames) {
    const esc = name.replace(/[.$]/g, '\\$&');
    // Four of the five handlers are assigned as `this._x = () => {}` or `this._x = function`, which the
    // first version of this regex could not match — so it reported "not found" for the very handlers whose
    // NAMES say Release, and I nearly published "no handler releases memory" off that miss.
    const bare = name.replace(/^this\./, '');
    const defRe = new RegExp([
      `function\\s+${esc}\\s*\\(`,
      `(?:const|let|var)\\s+${esc}\\s*=\\s*(?:async\\s*)?(?:function\\s*\\(|\\([^)]*\\)\\s*=>|[A-Za-z0-9_$]+\\s*=>)`,
      `this\\.${bare.replace(/[.$]/g, '\\$&')}\\s*=\\s*(?:async\\s*)?(?:function\\s*\\(|\\([^)]*\\)\\s*=>|[A-Za-z0-9_$]+\\s*=>)`,
    ].join('|'));
    const m = body.match(defRe);
    if (!m) { report.handlerBodies[name] = { found: false, searchedAs: defRe.source.slice(0, 120) }; continue; }
    const start = body.indexOf(m[0]);
    const snippet = body.slice(start, start + 900);
    report.handlerBodies[name] = {
      found: true,
      releasesMemory: /\b(length\s*=\s*0|= *null|delete |\.clear\(\)|dispose|destroy|releaseAll|revokeObjectURL|close\(\))/.test(snippet),
      writesState: /\b(flush|localStorage|sessionStorage|fetch|sendBeacon|save|persist)/i.test(snippet),
      // The decisive question is not whether a release hook exists but WHOSE window it is attached to.
      // A hook on a panel iframe's own window fires when that iframe is removed; it says nothing about
      // the top-level document being put away by the back-forward cache.
      scopeHints: {
        mentionsPanelOrIframe: /\b(panel|iframe|contentWindow|childWindow)\b/i.test(snippet),
        mentionsOwnWindow: /\b(window\.addEventListener|self\.addEventListener)\b/.test(snippet),
      },
      snippet: snippet.slice(0, 600).replace(/\s+/g, ' '),
    };
  }

  const releasing = Object.entries(report.handlerBodies).filter(([, h]) => h.found && h.releasesMemory).map(([k]) => k);
  const notFound = Object.entries(report.handlerBodies).filter(([, h]) => !h.found).map(([k]) => k);
  report.verdict = releasing.length
    ? `RELEASE HOOKS DO EXIST on pagehide: ${JSON.stringify(releasing)}. So the answer is NOT "the document takes no action" — the hooks are there. The open question is now narrower and better: WHOSE window they are attached to, and whether they cover the heavy resources when the TOP-LEVEL document is put away rather than when a panel iframe is removed. That is decided by the heavy-session measurement, not by reading.`
    : `No release-shaped body found among ${report.summary.actualRegistrations} registrations${notFound.length ? `, but ${notFound.length} handler bodies could not be located (${JSON.stringify(notFound)}) so this is INCONCLUSIVE rather than negative` : ''}.`;
  report.handlerNamesSayRelease = report.summary.handlerNames.filter((n) => /release/i.test(n));

  fs.writeFileSync(OUT, JSON.stringify(report, null, 1));
  console.error('=== PAGEHIDE HANDLERS, READ ===');
  console.error(`mentions ${report.summary.totalMentions}, real registrations ${report.summary.actualRegistrations}, comments ${report.summary.commentsOnly}`);
  console.error(`handlers: ${JSON.stringify(report.summary.handlerNames)}`);
  for (const [k, v] of Object.entries(report.handlerBodies)) {
    console.error(`  ${k}: found=${v.found} releasesMemory=${v.releasesMemory} writesState=${v.writesState}`);
    if (v.snippet) console.error(`     ${v.snippet.slice(0, 240)}`);
  }
  console.error(`\n${report.verdict}`);
  console.error(`artifact ${OUT}`);
})();
