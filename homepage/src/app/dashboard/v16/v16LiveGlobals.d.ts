export type V16LiveBoot = {
  sessions: Record<string, unknown>[];
  tradesBySessionId: Record<string, Record<string, unknown>[]>;
  openSessionId: string | number | null;
};

declare global {
  interface Window {
    __TALARIA_V16_LIVE__?: boolean;
    __TALARIA_V16_EMBEDDED__?: boolean;
    __TALARIA_V16_BOOT__?: V16LiveBoot;
    __TALARIA_V16_TRADES__?: Record<string, Record<string, unknown>[]>;
  }
}

export {};
