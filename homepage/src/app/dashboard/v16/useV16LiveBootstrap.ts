"use client";

import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { fetchJson } from "../analytics/SessionAnalyticsPanel";
import { resolveSessionIdForUser, type Session } from "../analytics/sessionSelection";
import type { V16LiveBoot } from "./v16LiveGlobals";
import {
  buildAppliedSourceForSession,
  buildJournalBootFromApi,
  buildStrategyGroups,
  fetchJournalApiData,
} from "./v16JournalMappers";
import {
  fetchAndMapTradesForSession,
  mapApiSessionToV16,
  type SessionKpis,
} from "./v16Mappers";
import { refreshV16SessionTrades, saveManualTradeToSession } from "./v16ManualTradeApi";
import { apiStrategyToBankRow } from "../strategies/strategyLabV9Mappers";
import type { ApiStrategyRecord } from "../strategies/strategyLabV9Mappers";
import { primeV16EmbeddedShell } from "./v16EmptyBoot";

type BootState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; boot: V16LiveBoot };

export function useV16LiveBootstrap(): BootState {
  const searchParams = useSearchParams();
  const urlSessionId = searchParams.get("sessionId");
  const [state, setState] = useState<BootState>({ status: "loading" });
  const [bootNonce, setBootNonce] = useState(0);

  useEffect(() => {
    const onReload = () => setBootNonce((n) => n + 1);
    window.addEventListener("talaria-v16-reload-boot", onReload);
    return () => window.removeEventListener("talaria-v16-reload-boot", onReload);
  }, []);

  const reloadKey = useMemo(
    () => `${urlSessionId ?? ""}:${searchParams.get("strategy") ?? ""}:${bootNonce}`,
    [searchParams, urlSessionId, bootNonce]
  );

  useLayoutEffect(() => {
    let cancelled = false;
    if (!window.__TALARIA_V16_BOOT__?.sessions?.length) {
      primeV16EmbeddedShell();
    }
    window.__TALARIA_V16_BOOT_LOADING__ = true;

    const fetchTradesForSession = async (sess: Session): Promise<Record<string, unknown>[]> => {
      return fetchAndMapTradesForSession(sess as never);
    };

    window.__TALARIA_V16_FETCH_TRADES_FOR_SESSION__ = async (sessionId) => {
      const sid = String(sessionId);
      const cached = window.__TALARIA_V16_TRADES__?.[sid];
      if (cached) return cached;

      const bootSessions = window.__TALARIA_V16_BOOT__?.sessions ?? [];
      const match =
        (bootSessions.find((s) => String((s as { id?: unknown }).id) === sid) as Session | undefined) ||
        ({ id: Number(sid) || sid } as Session);

      const trades = await fetchTradesForSession(match);
      if (!window.__TALARIA_V16_TRADES__) window.__TALARIA_V16_TRADES__ = {};
      window.__TALARIA_V16_TRADES__[sid] = trades;
      return trades;
    };

    window.__TALARIA_V16_SAVE_MANUAL_TRADE__ = async (sessionId, trade) => {
      const saved = await saveManualTradeToSession(sessionId, trade);
      const sid = String(sessionId);
      if (window.__TALARIA_V16_TRADES__) delete window.__TALARIA_V16_TRADES__[sid];
      const trades = await refreshV16SessionTrades(sessionId);
      if (!window.__TALARIA_V16_TRADES__) window.__TALARIA_V16_TRADES__ = {};
      window.__TALARIA_V16_TRADES__[sid] = trades;
      return saved;
    };

    (async () => {
      setState((prev) =>
        prev.status === "ready" && window.__TALARIA_V16_BOOT__?.sessions?.length
          ? prev
          : { status: "loading" }
      );
      try {
        const [sessionsPayload, kpisPayload, journalPayload] = await Promise.all([
          fetchJson<{ sessions: Session[] }>("/api/sessions"),
          fetchJson<{ kpis_by_session_id?: Record<string, SessionKpis> }>("/api/sessions/kpis").catch(
            () => ({ kpis_by_session_id: {} })
          ),
          fetchJournalApiData().catch(() => ({
            entries: [],
            connections: [],
            strategies: [],
            activeProfile: null,
          })),
        ]);

        const apiSessions = sessionsPayload.sessions ?? [];
        const kpisMap: Record<string, SessionKpis> = kpisPayload.kpis_by_session_id ?? {};
        const openSessionId = resolveSessionIdForUser(apiSessions, {
          urlSessionId,
          useChartStorage: false,
          kpisBySessionId: kpisMap,
        });

        const openSess = apiSessions.find((s) => String(s.id) === String(openSessionId));
        const tradesBySessionId: Record<string, Record<string, unknown>[]> = {};

        let openTrades: Record<string, unknown>[] = [];
        if (openSess) {
          openTrades = await fetchTradesForSession(openSess);
          tradesBySessionId[String(openSess.id)] = openTrades;
        }

        const v16Sessions = apiSessions.map((sess) => {
          const isOpen = openSess && String(sess.id) === String(openSess.id);
          const kpis = kpisMap[String(sess.id)];
          return mapApiSessionToV16(
            sess as never,
            kpis,
            isOpen ? openTrades : null,
            { tradesLoaded: !!isOpen }
          );
        });

        const journal = buildJournalBootFromApi(
          journalPayload.entries,
          journalPayload.connections,
          journalPayload.activeProfile
        );

        const strategies = buildStrategyGroups(
          journalPayload.strategies,
          v16Sessions,
          journal.accounts
        );

        const strategyBank = (journalPayload.strategies || []).map((s) =>
          apiStrategyToBankRow(s as ApiStrategyRecord)
        );

        const openV16Session = v16Sessions.find((s) => String(s.id) === String(openSessionId));
        const appliedSource =
          buildAppliedSourceForSession(openV16Session) ||
          (journal.accounts[0]
            ? {
                kind: "journalAccount" as const,
                id: journal.accounts[0].id,
                label: journal.accounts[0].name,
              }
            : null);

        if (cancelled) return;

        const boot: V16LiveBoot = {
          sessions: v16Sessions,
          tradesBySessionId,
          openSessionId: openSessionId || ((v16Sessions[0] as { id?: number })?.id ?? null),
          journal,
          strategies,
          strategyBank,
          appliedSource,
        };

        window.__TALARIA_V16_BOOT__ = boot;
        window.__TALARIA_V16_TRADES__ = tradesBySessionId;
        window.__TALARIA_V16_BOOT_LOADING__ = false;
        window.dispatchEvent(new CustomEvent("talaria-v16-boot-updated"));

        setState({ status: "ready", boot });
      } catch (e) {
        if (cancelled) return;
        window.__TALARIA_V16_BOOT_LOADING__ = false;
        setState({
          status: "error",
          message: e instanceof Error ? e.message : String(e),
        });
      }
    })();

    return () => {
      cancelled = true;
      window.__TALARIA_V16_BOOT_LOADING__ = false;
      delete window.__TALARIA_V16_FETCH_TRADES_FOR_SESSION__;
      delete window.__TALARIA_V16_SAVE_MANUAL_TRADE__;
    };
  }, [reloadKey, urlSessionId]);

  return state;
}
