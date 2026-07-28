export const B_W15_MUTATION_TARGET = {
  designed: 8,
  requiredStubMustDie: true,
};

export const B_W15_MANDATORY_MUTANTS = [
  'stub-none',
  'owner-ignored-global-key',
  'queued-write-flushed-to-current-owner',
  'tier-precedence-inverted',
  'whole-blob-clobbers-per-key',
  'unknown-keys-dropped-on-migration',
  'schema-stamped-on-read',
  'kill-switch-still-writes',
];
