import { readFileSync, writeFileSync } from 'node:fs';

const a = 'chart v 1.4/chart/modules/order-manager.js';
const b = 'homepage/public/chart/modules/order-manager.js';
const src = readFileSync(a, 'utf8');
let dst = readFileSync(b, 'utf8');

const startMark = '    /**\n     * Persist / journal canonical shape: bar_* = live tail only; *_archive =';
const endMark = '    /**\n     * Consumer projection (export/modal): reconstruct archive ‖ tail into bar_*';
const i0 = src.indexOf(startMark);
const i1 = src.indexOf(endMark);
const j0 = dst.indexOf(startMark);
const j1 = dst.indexOf(endMark);
if (i0 < 0 || i1 < 0 || j0 < 0 || j1 < 0) throw new Error('assign block anchors missing');
dst = dst.slice(0, j0) + src.slice(i0, i1) + dst.slice(j1);

const cStart = '                this.tradeJournal[journalIndex].lowestPrice = position.lowestPrice;';
const cEnd = '                this._finalizeExcursionScalars(this.tradeJournal[journalIndex], position, { inTradeOnly: true });';
const s0 = src.indexOf(cStart);
const s1 = src.indexOf(cEnd, s0);
const d0 = dst.indexOf(cStart);
const d1 = dst.indexOf(cEnd, d0);
if (s0 < 0 || s1 < 0 || d0 < 0 || d1 < 0) throw new Error('completion block missing');
dst = dst.slice(0, d0) + src.slice(s0, s1) + dst.slice(d1);

if (!dst.includes('this._excursionSingleOwnerV1HardCapLiveTails(position)')) {
  const needle = '                bootstrapPostExitPeaks,\n            );\n        }\n    }\n\n    /** Planned risk distance';
  const repl = '                bootstrapPostExitPeaks,\n            );\n        }\n        // EXCURSION-SINGLE-OWNER-V1: belt-and-suspenders live-tail cap (≤256 each).\n        this._excursionSingleOwnerV1HardCapLiveTails(position);\n    }\n\n    /** Planned risk distance';
  if (!dst.includes(needle)) throw new Error('hardcap anchor missing');
  dst = dst.replace(needle, repl);
}

if (!dst.includes('_excursionSingleOwnerV1Enabled')) {
  throw new Error('flag helper missing on homepage — apply header patch first');
}

writeFileSync(b, dst);
console.log('homepage order-manager synced');
