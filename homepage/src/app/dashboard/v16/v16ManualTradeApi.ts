/** Persist dashboard manual trades to session journal SQL (chart-compatible payload). */

export async function saveManualTradeToSession(
  sessionId: string | number,
  trade: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const res = await fetch(
    `/api/sessions/${encodeURIComponent(String(sessionId))}/journal-trades`,
    {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trade }),
    }
  );
  if (!res.ok) {
    let detail = `Save failed (${res.status})`;
    try {
      const body = (await res.json()) as { detail?: unknown };
      if (typeof body.detail === "string") detail = body.detail;
      else if (body.detail != null) detail = JSON.stringify(body.detail);
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  const data = (await res.json()) as { trade?: Record<string, unknown> };
  return data.trade ?? trade;
}

export async function refreshV16SessionTrades(
  sessionId: string | number
): Promise<Record<string, unknown>[]> {
  const fetcher = window.__TALARIA_V16_FETCH_TRADES_FOR_SESSION__;
  if (typeof fetcher === "function") {
    if (window.__TALARIA_V16_TRADES__) {
      delete window.__TALARIA_V16_TRADES__[String(sessionId)];
    }
    return fetcher(sessionId);
  }
  const res = await fetch(
    `/api/sessions/${encodeURIComponent(String(sessionId))}/journal-trades`,
    { credentials: "include", cache: "no-store" }
  );
  if (!res.ok) return [];
  const data = (await res.json()) as { trades?: { payload?: Record<string, unknown> }[] };
  const items = Array.isArray(data?.trades) ? data.trades : [];
  return items.map((row) => {
    const p = row?.payload;
    return p && typeof p === "object" ? p : (row as Record<string, unknown>);
  });
}
