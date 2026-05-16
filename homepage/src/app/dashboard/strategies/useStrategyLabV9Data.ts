"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  JOURNAL_API_BASE,
  journalAuthHeaders,
  parseJournalJsonResponse,
  syncJournalTokenFromSession,
} from "@/lib/journalApi";
import {
  apiStrategyToBankRow,
  bankStrategyToApiBody,
  mapApiSessionToReviewRow,
  type ApiStrategyRecord,
} from "./strategyLabV9Mappers";
import { getToken } from "./strategyLabV9Auth";

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: "include", ...init });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

function isServerStrategyId(id: unknown): id is number {
  return typeof id === "number" && Number.isFinite(id) && id > 0;
}

const DUPLICATE_SAVE_MSG = "DUPLICATE_SAVE";

export function useStrategyLabV9Data() {
  const persistInFlightRef = useRef(false);
  const [myStrategies, setMyStrategies] = useState<Record<string, unknown>[]>([]);
  const [strategiesLoading, setStrategiesLoading] = useState(true);
  const [strategiesError, setStrategiesError] = useState<string | null>(null);

  const [reviewSessions, setReviewSessions] = useState<Record<string, unknown>[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);

  const loadStrategies = useCallback(async () => {
    await syncJournalTokenFromSession();
    const token = getToken();
    if (!token) {
      setMyStrategies([]);
      setStrategiesLoading(false);
      setStrategiesError(
        "Could not connect to the strategy API. Sign out and sign in again, or ask an admin to enable Strategy lab on your account.",
      );
      return;
    }
    setStrategiesLoading(true);
    setStrategiesError(null);
    try {
      const fetchList = () =>
        fetch(`${JOURNAL_API_BASE}/strategies`, {
          credentials: "include",
          headers: journalAuthHeaders(),
        });

      let res = await fetchList();
      if (res.status === 401) {
        await syncJournalTokenFromSession({ forceRefresh: true });
        if (getToken()) res = await fetchList();
      }

      const data = await parseJournalJsonResponse<{
        success?: boolean;
        strategies?: ApiStrategyRecord[];
        error?: string;
        action?: string;
      }>(res);
      if (!res.ok) {
        if (res.status === 502 || res.status === 503 || res.status === 504) {
          setStrategiesError(
            "Strategy API is unavailable (502). On the server run: docker compose up -d --build journal-backend",
          );
          setMyStrategies([]);
          return;
        }
        if (res.status === 403 && data.action === "subscription_required") {
          setStrategiesError(
            "Strategy lab requires access. Open Pricing to subscribe, or ask an admin to enable the Strategies section on your account."
          );
        } else if (res.status === 401) {
          setStrategiesError("Please log in again to load strategies.");
        } else {
          setStrategiesError(data.error || `Could not load strategies (HTTP ${res.status})`);
        }
        setMyStrategies([]);
        return;
      }
      if (data.success) {
        setMyStrategies((data.strategies || []).map((s) => apiStrategyToBankRow(s)));
      } else {
        setStrategiesError(data.error || "Failed to load strategies");
        setMyStrategies([]);
      }
    } catch (e) {
      setStrategiesError(e instanceof Error ? e.message : "Network error");
      setMyStrategies([]);
    } finally {
      setStrategiesLoading(false);
    }
  }, []);

  const loadSessions = useCallback(async () => {
    setSessionsLoading(true);
    try {
      const data = await fetchJson<{ sessions?: unknown[] }>("/api/sessions");
      const list = Array.isArray(data.sessions) ? data.sessions : [];
      let kpisMap: Record<number, { trades?: number; win_rate?: number | null; net_pnl?: number | null }> = {};
      try {
        const kr = await fetch("/api/sessions/kpis", { credentials: "include" });
        if (kr.ok) {
          const kd = (await kr.json()) as { kpis_by_session_id?: Record<string, unknown> };
          const raw = kd.kpis_by_session_id || {};
          Object.entries(raw).forEach(([id, k]) => {
            const n = Number(id);
            if (Number.isFinite(n) && k && typeof k === "object") {
              kpisMap[n] = k as { trades?: number; win_rate?: number | null; net_pnl?: number | null };
            }
          });
        }
      } catch {
        /* optional */
      }
      const mapped = list.map((row) => {
        const s = row as {
          id: number;
          name: string;
          symbol?: string;
          session_type?: string;
          start_balance?: number;
          start_date?: string;
          end_date?: string;
          created_at?: string;
          config?: Record<string, unknown> | null;
          replay_dashboard?: { progress_pct?: number } | null;
        };
        return mapApiSessionToReviewRow(s, kpisMap[s.id] ?? null);
      });
      setReviewSessions(mapped);
    } catch {
      setReviewSessions([]);
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStrategies();
  }, [loadStrategies]);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  const persistStrategy = useCallback(
    async (strat: Record<string, unknown>, editingId: unknown): Promise<void> => {
      if (persistInFlightRef.current) {
        throw new Error(DUPLICATE_SAVE_MSG);
      }
      persistInFlightRef.current = true;

      await syncJournalTokenFromSession();
      const token = getToken();
      if (!token) {
        persistInFlightRef.current = false;
        throw new Error(
          "Not signed in to the strategy API. Refresh the page or sign in again.",
        );
      }

      const body = bankStrategyToApiBody(strat);
      const isUpdate = isServerStrategyId(editingId);
      const url = isUpdate
        ? `${JOURNAL_API_BASE}/strategies/${editingId}`
        : `${JOURNAL_API_BASE}/strategies`;
      const method = isUpdate ? "PUT" : "POST";

      let res: Response;
      try {
        res = await fetch(url, {
          method,
          credentials: "include",
          headers: journalAuthHeaders(),
          body: JSON.stringify(body),
        });
      } catch (e) {
        persistInFlightRef.current = false;
        const msg = e instanceof Error ? e.message : String(e);
        if (/failed to fetch|network|load failed|connection/i.test(msg)) {
          throw new Error(
            "Could not save strategy — the journal API connection was reset. This often happens when screenshots or images are very large. Remove some images and try again, or confirm the journal backend is running.",
          );
        }
        throw e;
      }
      const data = await parseJournalJsonResponse<{
        success?: boolean;
        error?: string;
        action?: string;
      }>(res).catch(() => ({} as { success?: boolean; error?: string; action?: string }));
      if (!res.ok || data.success === false) {
        persistInFlightRef.current = false;
        if (res.status === 502 || res.status === 503 || res.status === 504) {
          throw new Error(
            "Strategy API is unavailable. Restart journal-backend on the server and try again.",
          );
        }
        if (res.status === 403 && data.action === "subscription_required") {
          throw new Error(
            "Strategy lab requires access. Subscribe or ask an admin to enable the Strategies section.",
          );
        }
        throw new Error(data.error || `Save failed (${res.status})`);
      }
      persistInFlightRef.current = false;
      // Refresh bank list in background so save UI can show success immediately after POST.
      void loadStrategies();
    },
    [loadStrategies],
  );

  const deleteStrategyRemote = useCallback(
    async (id: number): Promise<void> => {
      const res = await fetch(`${JOURNAL_API_BASE}/strategies/${id}`, {
        method: "DELETE",
        credentials: "include",
        headers: journalAuthHeaders(),
      });
      const data = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!res.ok || data.success === false) {
        throw new Error(data.error || `Delete failed (${res.status})`);
      }
      await loadStrategies();
    },
    [loadStrategies],
  );

  const duplicateStrategyRemote = useCallback(
    async (id: number): Promise<void> => {
      const res = await fetch(`${JOURNAL_API_BASE}/strategies/${id}/duplicate`, {
        method: "POST",
        credentials: "include",
        headers: journalAuthHeaders(),
      });
      const data = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!res.ok || data.success === false) {
        throw new Error(data.error || `Duplicate failed (${res.status})`);
      }
      await loadStrategies();
    },
    [loadStrategies],
  );

  return {
    myStrategies,
    setMyStrategies,
    strategiesLoading,
    strategiesError,
    reloadStrategies: loadStrategies,
    reviewSessions,
    sessionsLoading,
    reloadSessions: loadSessions,
    persistStrategy,
    deleteStrategyRemote,
    duplicateStrategyRemote,
  };
}
