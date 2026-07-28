#!/usr/bin/env node
import { diagnosticExitCode } from './b75-po-v4-network-policy.mjs';

const [verdict = '', complete = 'false', fatal = '0'] = process.argv.slice(2);
process.exitCode = diagnosticExitCode({
  verdict,
  captureComplete: complete === 'true',
  fatalMutationCount: Number(fatal),
});
