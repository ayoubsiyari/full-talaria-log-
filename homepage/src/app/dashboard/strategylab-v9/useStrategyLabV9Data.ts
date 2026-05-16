"use client";

import { useCallback, useEffect, useState } from "react";
import { JOURNAL_API_BASE } from "@/lib/journalApi";
import {
  apiStrategyToBankRow,
  bankStrategyToApiBody,
  mapApiSessionToReviewRow,
  type ApiStrategyRecord,
} from "./strategyLabV9Mappers";
import { authHeaders, getToken } from "./strategyLabV9Auth";

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: "include", ...init });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

function isServerStrategyId(id: unknown): id is number {
  return typeof id === "number" && Number.isFinite(id) && id > 0;
}

export function useStrategyLabV9Data() {
  const [myStrategies, setMyStrategies] = useState<Record<string, unknown>[]>([]);
  const [strategiesLoading, setStrategiesLoading] = useState(true);
  const [strategiesError, setStrategiesError] = useState<string | null>(null);

  const [reviewSessions, setReviewSessions] = useState<Record<string, unknown>[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);

  const loadStrategies = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setMyStrategies([]);
      setStrategiesLoading(false);
      setStrategiesError(null);
      return;
    }
    setStrategiesLoading(true);
    setStrategiesError(null);
    try {
      const res = await fetch(`${JOURNAL_API_BASE}/strategies`, { headers: authHeaders() });
      const data = (await res.json()) as { success?: boolean; strategies?: ApiStrategyRecord[]; error?: string };
      if (!res.ok) {
        setStrategiesError(data.error || `HTTP ${res.status}`);
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
      const token = getToken();
      if (!token) throw new Error("Not signed in");

      const body = bankStrategyToApiBody(strat);
      const isUpdate = isServerStrategyId(editingId);
      const url = isUpdate
        ? `${JOURNAL_API_BASE}/strategies/${editingId}`
        : `${JOURNAL_API_BASE}/strategies`;
      const method = isUpdate ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: authHeaders(),
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!res.ok || data.success === false) {
        throw new Error(data.error || `Save failed (${res.status})`);
      }
      await loadStrategies();
    },
    [loadStrategies],
  );

  const deleteStrategyRemote = useCallback(
    async (id: number): Promise<void> => {
      const res = await fetch(`${JOURNAL_API_BASE}/strategies/${id}`, {
        method: "DELETE",
        headers: authHeaders(),
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
        headers: authHeaders(),
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
