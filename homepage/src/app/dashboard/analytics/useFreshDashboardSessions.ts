"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { JOURNAL_API_BASE } from "@/lib/journalApi";
import { authHeaders, getToken } from "@/app/dashboard/strategies/strategyLabV9Auth";
import { fetchJson, type Session } from "./SessionAnalyticsPanel";
import {
  isUsableDashboardSessionId,
  parseStrategyFilterParam,
  resolveSessionIdForUser,
  type DashboardStrategy,
} from "./sessionSelection";

/**
 * Loads `/api/sessions` on mount, URL changes, and bfcache restore (browser Back).
 * Session: `?sessionId=` · Strategy filter: `?strategy=` (not chart localStorage).
 */
export function useFreshDashboardSessions() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlSessionId = searchParams.get("sessionId");
  const urlStrategyRaw = searchParams.get("strategy");
  const urlStrategyFilter = parseStrategyFilterParam(urlStrategyRaw);

  const [sessions, setSessions] = useState<Session[]>([]);
  const [strategies, setStrategies] = useState<DashboardStrategy[]>([]);
  const [selectedSessionId, setSelectedSessionIdState] = useState("");
  const [strategyFilter, setStrategyFilterState] = useState("ALL");
  const [listError, setListError] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);

  const replaceSearch = useCallback(
    (patch: { sessionId?: string; strategy?: string }) => {
      const params = new URLSearchParams(searchParams.toString());
      if (patch.sessionId !== undefined) {
        if (patch.sessionId) params.set("sessionId", patch.sessionId);
        else params.delete("sessionId");
      }
      if (patch.strategy !== undefined) {
        if (patch.strategy && patch.strategy !== "ALL") params.set("strategy", patch.strategy);
        else params.delete("strategy");
      }
      const q = params.toString();
      const base = pathname.endsWith("/") ? pathname : `${pathname}/`;
      router.replace(q ? `${base}?${q}` : base, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  const loadStrategies = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setStrategies([]);
      return;
    }
    try {
      const res = await fetch(`${JOURNAL_API_BASE}/strategies`, { headers: authHeaders() });
      if (!res.ok) {
        setStrategies([]);
        return;
      }
      const data = (await res.json()) as { success?: boolean; strategies?: { id: number; name: string }[] };
      const rows = (data.strategies || [])
        .filter((s) => typeof s.id === "number" && s.id > 0 && s.name)
        .map((s) => ({ id: s.id, name: String(s.name).trim() }))
        .sort((a, b) => a.name.localeCompare(b.name));
      setStrategies(rows);
    } catch {
      setStrategies([]);
    }
  }, []);

  const loadSessions = useCallback(async () => {
    const [data, kpisPayload] = await Promise.all([
      fetchJson<{ sessions: Session[] }>("/api/sessions"),
      fetchJson<{ kpis_by_session_id?: Record<string, { trades?: number }> }>("/api/sessions/kpis").catch(
        () => ({ kpis_by_session_id: {} })
      ),
    ]);
    const list = data.sessions ?? [];
    const kpisBySessionId = kpisPayload.kpis_by_session_id ?? {};
    setSessions(list);
    const resolved = resolveSessionIdForUser(list, {
      urlSessionId,
      urlStrategyFilter,
      useChartStorage: false,
      kpisBySessionId,
    });
    setSelectedSessionIdState(resolved);
    setStrategyFilterState(urlStrategyFilter);
    setListError(null);
    const urlKey = urlSessionId != null ? String(urlSessionId).trim() : "";
    if (resolved && urlKey && urlKey !== resolved && !isUsableDashboardSessionId(urlKey)) {
      replaceSearch({ sessionId: resolved });
    }
    return { list, resolved, kpisBySessionId };
  }, [urlSessionId, urlStrategyFilter, replaceSearch]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await Promise.all([loadSessions(), loadStrategies()]);
      } catch (e) {
        if (!mounted) return;
        setListError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      mounted = false;
    };
  }, [loadSessions, loadStrategies, refreshNonce]);

  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) setRefreshNonce((n) => n + 1);
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  const setSelectedSessionId = useCallback(
    (id: string) => {
      setSelectedSessionIdState(id);
      replaceSearch({ sessionId: id });
    },
    [replaceSearch]
  );

  const setStrategyFilter = useCallback(
    (filter: string) => {
      const normalized = parseStrategyFilterParam(filter === "ALL" ? null : filter);
      setStrategyFilterState(normalized);
      replaceSearch({ strategy: normalized === "ALL" ? "" : normalized });
    },
    [replaceSearch]
  );

  return {
    sessions,
    strategies,
    selectedSessionId,
    setSelectedSessionId,
    strategyFilter,
    setStrategyFilter,
    listError,
    dataReloadKey: `${refreshNonce}:${urlSessionId ?? ""}:${urlStrategyFilter}:${selectedSessionId}`,
    refresh: () => setRefreshNonce((n) => n + 1),
  };
}
