/**
 * Reconcile two readings of "the origin". B and the watcher both see b122 with the markers; the
 * Director sees 376 KB, no markers, and text/html. Both can be true if they are different doors.
 */
const targets = [
  ['test VPS :3000 (what I deployed, what the watcher polls)', 'http://31.97.192.82:3000'],
  ['test VPS :80', 'http://31.97.192.82'],
  ['public domain', 'https://www.talaria-log.com'],
];
const paths = ['/chart/build-info.json', '/chart/modules/replay-system.js'];
const MARKERS = ['SPEED_GOV_LADDER_BPS', '__talariaEffectiveRate', 'REALISTIC'];

for (const [label, base] of targets) {
  console.log(`\n=== ${label} — ${base} ===`);
  for (const p of paths) {
    try {
      const r = await fetch(`${base}${p}`, { redirect: 'follow', signal: AbortSignal.timeout(20000) });
      const t = await r.text();
      const ct = r.headers.get('content-type') || '?';
      const isHtml = /^\s*<(!doctype|html)/i.test(t);
      console.log(`  ${p}`);
      console.log(`    http=${r.status}  ${Math.round(t.length / 1024)} KB  content-type=${ct}${isHtml ? '   <-- HTML' : ''}`);
      if (r.url !== `${base}${p}`) console.log(`    followed to: ${r.url}`);
      if (p.endsWith('.js') && !isHtml) {
        for (const m of MARKERS) console.log(`      ${m.padEnd(24)} ${(t.match(new RegExp(m, 'g')) || []).length}`);
      }
      if (p.endsWith('.json') && !isHtml) console.log(`    body: ${t.slice(0, 160).replace(/\s+/g, ' ')}`);
    } catch (e) {
      console.log(`  ${p}\n    UNREACHABLE  ${String(e).slice(0, 90)}`);
    }
  }
}
