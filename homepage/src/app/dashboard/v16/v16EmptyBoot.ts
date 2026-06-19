import type { V16LiveBoot } from "./v16LiveGlobals";

/** Minimal boot payload so embedded V16 can render dashboard chrome before API data arrives. */
export function createEmptyV16Boot(): V16LiveBoot {
  const defaultAccount = {
    key: "manual-journal",
    accountNumber: "Manual",
    connection: "Manual Journal",
    connectionId: "manual-journal",
    accountIndex: 0,
    type: "Personal",
    accountTypeKey: "personal" as const,
    market: "Mixed",
  };

  return {
    sessions: [],
    tradesBySessionId: {},
    openSessionId: null,
    journal: {
      libraryTrades: [],
      accounts: [],
      accountByKey: { [defaultAccount.key]: defaultAccount },
      tradeToAccountKey: {},
      connections: [],
      connectionOptions: [],
      defaultAccount,
    },
    strategies: [],
    appliedSource: null,
  };
}

export function primeV16EmbeddedShell(): void {
  if (typeof window === "undefined") return;
  window.__TALARIA_V16_EMBEDDED__ = true;
  window.__TALARIA_V16_LIVE__ = true;
  window.__TALARIA_V16_TRADES__ = window.__TALARIA_V16_TRADES__ ?? {};
  window.__TALARIA_V16_BOOT__ = createEmptyV16Boot();
}
