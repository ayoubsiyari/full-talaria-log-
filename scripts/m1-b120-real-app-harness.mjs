#!/usr/bin/env node
process.env.M1_EXPECTED_BUILD = 'b120';
process.env.M1_OUT ||= 'docs/plan3/M1-B120-REAL-APP-HARNESS-20260731.json';
process.env.M1_EVIDENCE_OUT ||= '../_evidence/manager-D/M1-B120-REAL-APP-HARNESS-20260731.json';

const { main } = await import('./m1-b118-real-app-harness.mjs');
await main();
