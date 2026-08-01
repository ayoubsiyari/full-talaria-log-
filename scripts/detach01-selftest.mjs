#!/usr/bin/env node
/**
 * Proves DETACH-01 does what it claims, including the case it exists for: a hard kill mid-write.
 * A primitive whose crash behaviour is untested is a hope, not a guarantee.
 */
import fs from 'node:fs';
import { openRun, inspectRun } from './lib/detach01.mjs';

const out = 'c:\\Users\\user\\Desktop\\talaria1\\_evidence\\manager-C\\DETACH01-SELFTEST.jsonl';
try { fs.unlinkSync(out); } catch { /* fresh */ }
try { fs.unlinkSync(out.replace(/\.jsonl$/, '.heartbeat.json')); } catch { /* fresh */ }

const r = openRun({ name: 'selftest', out, meta: { purpose: 'prove append + heartbeat + resume across a torn write' } });
r.append({ bars: 100 });
r.append({ bars: 200 });
console.log('after 2 samples : ' + JSON.stringify(inspectRun(out)));

// Simulate a hard kill during the third write.
fs.appendFileSync(out, '{"n":3,"bars":30');

const r2 = openRun({ name: 'selftest', out });
console.log(`resumed         : ${r2.resumedSamples.length} samples recovered, ${r2.tornLinesSkipped} torn line skipped`);
r2.append({ bars: 300 });
r2.finish({ ok: true });
console.log('final           : ' + JSON.stringify(inspectRun(out)));

const lines = fs.readFileSync(out, 'utf8').split('\n').filter(Boolean).length;
console.log(`file            : ${lines} lines on disk`);
console.log(`VERDICT         : ${r2.resumedSamples.length === 2 && r2.tornLinesSkipped === 1 ? 'PASS - a hard kill costs the torn sample only' : 'FAIL'}`);
