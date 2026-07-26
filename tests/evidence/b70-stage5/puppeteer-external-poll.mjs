export class ExternalPollTimeoutError extends Error {
  constructor(message, observations) {
    super(message);
    this.name = 'ExternalPollTimeoutError';
    this.observations = observations;
  }
}

export async function evaluateBounded(evaluate, timeoutMs, label) {
  let timer;
  try {
    return await Promise.race([
      evaluate(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} exceeded ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function pollExternally({
  evaluate,
  isTerminal,
  timeoutMs,
  intervalMs = 25,
  evaluateTimeoutMs = 2_000,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now = Date.now,
}) {
  const startedAt = now();
  const observations = [];
  let contextErrors = 0;
  while (now() - startedAt < timeoutMs) {
    try {
      const value = await evaluateBounded(evaluate, evaluateTimeoutMs, 'external observation');
      observations.push({ atMs: now() - startedAt, value });
      if (isTerminal(value)) return { terminal: true, value, observations, contextErrors };
    } catch (error) {
      const message = String(error?.message || error);
      observations.push({ atMs: now() - startedAt, error: message });
      if (/Execution context was destroyed|Cannot find context|Target closed|detached Frame/i.test(message)) {
        contextErrors++;
      }
    }
    await sleep(intervalMs);
  }
  throw new ExternalPollTimeoutError(
    `external polling exceeded ${timeoutMs}ms`,
    observations
  );
}
