export const FORWARDING_MIRROR_CONTRACTS = Object.freeze({
  'modules/m20-q6-replay-lifecycle-binding.test.mjs': Object.freeze({
    contractId: 'q6-canonical-harness/homepage-forwarding-wrapper-v1',
    importTarget:
      '../../../../chart v 1.4/chart/modules/m20-q6-replay-lifecycle-binding.test.mjs',
    wrapper: [
    '// Mirrored entrypoint: execute the canonical-root Q6 lifecycle harness.',
    "import '../../../../chart v 1.4/chart/modules/m20-q6-replay-lifecycle-binding.test.mjs';",
    '',
    ].join('\n'),
  }),
});

export const HOMEPAGE_FORWARDING_CONTRACTS = Object.freeze({
  ...Object.fromEntries(
    Object.entries(FORWARDING_MIRROR_CONTRACTS)
      .map(([relativePath, contract]) => [relativePath, contract.wrapper]),
  ),
});
