"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { fetchJson } from "../analytics/SessionAnalyticsPanel";
import { resolveSessionIdForUser, isUsableDashboardSessionId, type Session } from "../analytics/sessionSelection";
import type { V16LiveBoot } from "./v16LiveGlobals";
import type { V16AppliedSource } from "./v16SourceTypes";
import {
  buildAppliedSourceForSession,
  buildJournalBootFromApi,
  buildStrategyGroups,
  fetchJournalApiData,
  type JournalApiData,
} from "./v16JournalMappers";
import { resolvePersistedAppliedSourceForBoot } from "talaria-handoff/v16AppliedSourceStorage.js";
import {
  enrichV16SessionFromStrategyBank,
  mapApiSessionToV16,
  type SessionKpis,
} from "./v16Mappers";
import { refreshV16SessionTrades, saveManualTradeToSession } from "./v16ManualTradeApi";
import {
  saveManualTradeToLiveJournal,
  type LiveJournalAddTradeSource,
} from "./v16LiveJournalManualTrade";
import {
  deleteStrategyFromJournalApi,
  parseStrategyApiId,
  saveStrategyToJournalApi,
} from "./v16StrategyApi";
import {
  cloneCommunityTemplate,
  fetchCommunityTemplates,
  submitStrategyToCommunity,
} from "./v16CommunityApi";
import { apiStrategyToBankRow } from "../strategies/strategyLabV9Mappers";
import type { ApiStrategyRecord } from "../strategies/strategyLabV9Mappers";
import { primeV16EmbeddedShell } from "./v16EmptyBoot";

type BootState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; boot: V16LiveBoot };

const EMPTY_JOURNAL_PAYLOAD: JournalApiData = {
  entries: [],
  connections: [],
  strategies: [],
  activeProfile: null,
  liveAccounts: [],
};

function buildBootFromPayloads(
  apiSessions: Session[],
  kpisMap: Record<string, SessionKpis>,
  journalPayload: JournalApiData,
  communityStrategies: Record<string, unknown>[],
  urlSessionId: string | null
): V16LiveBoot {
  const strategyBank = (journalPayload.strategies || []).map((s) =>
    apiStrategyToBankRow(s as ApiStrategyRecord)
  );

  const openSessionId = resolveSessionIdForUser(apiSessions, {
    urlSessionId,
    useChartStorage: false,
    kpisBySessionId: kpisMap,
  });

  const v16SessionsRaw = apiSessions.map((sess) => {
    const kpis = kpisMap[String(sess.id)];
    return mapApiSessionToV16(sess as never, kpis, null, { tradesLoaded: false });
  });
  const v16Sessions = v16SessionsRaw.map((sess) =>
    enrichV16SessionFromStrategyBank(sess, strategyBank)
  );

  const journal = buildJournalBootFromApi(
    journalPayload.entries,
    journalPayload.connections,
    journalPayload.activeProfile,
    journalPayload.liveAccounts
  );

  const strategies = buildStrategyGroups(
    journalPayload.strategies,
    v16Sessions,
    journal.accounts
  );

  const openV16Session = v16Sessions.find((s) => String(s.id) === String(openSessionId));
  const persistedApplied = resolvePersistedAppliedSourceForBoot({
    sessions: v16Sessions,
    journal,
    strategies,
  }) as V16AppliedSource | null;
  const firstLiveJournal =
    journal.accounts.find((a) => a?.isLiveJournalAccount) ?? journal.accounts[0];
  const appliedSource =
    persistedApplied ||
    buildAppliedSourceForSession(openV16Session) ||
    (firstLiveJournal
      ? {
          kind: "journalAccount" as const,
          id: firstLiveJournal.id,
          label: String(firstLiveJournal.name || "Journal").split(" / ")[0],
          liveAccountId: firstLiveJournal.liveAccountId,
          profileId: firstLiveJournal.profileId,
          accountTypeKey: firstLiveJournal.accountTypeKey,
        }
      : null);

  const priorTrades = window.__TALARIA_V16_TRADES__ ?? {};

  return {
    sessions: v16Sessions,
    tradesBySessionId: priorTrades,
    openSessionId: openSessionId || ((v16Sessions[0] as { id?: number })?.id ?? null),
    journal,
    strategies,
    strategyBank,
    communityStrategies,
    appliedSource,
  };
}

function publishBoot(boot: V16LiveBoot, mergeTrades = true): void {
  if (mergeTrades && window.__TALARIA_V16_TRADES__) {
    boot.tradesBySessionId = { ...window.__TALARIA_V16_TRADES__ };
  }
  window.__TALARIA_V16_BOOT__ = boot;
  window.__TALARIA_V16_TRADES__ = boot.tradesBySessionId;
  window.dispatchEvent(new CustomEvent("talaria-v16-boot-updated"));
}

export function useV16LiveBootstrap(): BootState {
  const searchParams = useSearchParams();
  const urlSessionId = searchParams.get("sessionId");
  const [state, setState] = useState<BootState>({ status: "loading" });
  const [bootNonce, setBootNonce] = useState(0);
  const enrichGenRef = useRef(0);

  useEffect(() => {
    const onReload = () => setBootNonce((n) => n + 1);
    window.addEventListener("talaria-v16-reload-boot", onReload);
    return () => window.removeEventListener("talaria-v16-reload-boot", onReload);
  }, []);

  /** Wire session/trade helpers once — not torn down on background refresh. */
  useLayoutEffect(() => {
    if (!window.__TALARIA_V16_BOOT__?.sessions?.length) {
      primeV16EmbeddedShell();
    }

    window.__TALARIA_V16_FETCH_TRADES_FOR_SESSION__ = async (sessionId) => {
      const sid = String(sessionId);
      const cached = window.__TALARIA_V16_TRADES__?.[sid];
      if (cached) return cached;

      const { fetchAndMapTradesForSession } = await import("./v16Mappers");
      const bootSessions = window.__TALARIA_V16_BOOT__?.sessions ?? [];
      const match =
        (bootSessions.find((s) => String((s as { id?: unknown }).id) === sid) as Session | undefined) ||
        ({ id: Number(sid) || sid } as Session);

      const trades = await fetchAndMapTradesForSession(match as never);
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

    window.__TALARIA_V16_SAVE_MANUAL_JOURNAL_TRADE__ = async (
      source: LiveJournalAddTradeSource,
      trade: Record<string, unknown>
    ) => saveManualTradeToLiveJournal(source, trade);

    window.__TALARIA_V16_REFRESH_STRATEGY_BANK__ = async () => {
      const journalPayload = await fetchJournalApiData({ includeEntries: true }).catch(
        () => EMPTY_JOURNAL_PAYLOAD
      );
      const strategyBank = (journalPayload.strategies || []).map((s) =>
        apiStrategyToBankRow(s as ApiStrategyRecord)
      );
      if (window.__TALARIA_V16_BOOT__) {
        window.__TALARIA_V16_BOOT__.strategyBank = strategyBank;
        window.__TALARIA_V16_BOOT__.sessions = (window.__TALARIA_V16_BOOT__.sessions || []).map(
          (sess) => enrichV16SessionFromStrategyBank(sess, strategyBank)
        );
        window.dispatchEvent(new CustomEvent("talaria-v16-boot-updated"));
      }
      return strategyBank;
    };

    window.__TALARIA_V16_SAVE_STRATEGY__ = async (strat, existingId) => {
      const apiId = existingId ?? parseStrategyApiId(strat?.id);
      const saved = await saveStrategyToJournalApi(strat, apiId);
      const refresh = window.__TALARIA_V16_REFRESH_STRATEGY_BANK__;
      if (typeof refresh === "function") {
        await refresh().catch(() => {
          if (window.__TALARIA_V16_BOOT__) {
            const bank = window.__TALARIA_V16_BOOT__.strategyBank || [];
            const idx = bank.findIndex((row) => String(row?.id) === String(saved.id));
            const next =
              idx >= 0 ? bank.map((row, i) => (i === idx ? saved : row)) : [saved, ...bank];
            window.__TALARIA_V16_BOOT__.strategyBank = next;
            window.dispatchEvent(new CustomEvent("talaria-v16-boot-updated"));
          }
        });
      }
      return saved;
    };

    window.__TALARIA_V16_DELETE_STRATEGY__ = async (strategyId) => {
      await deleteStrategyFromJournalApi(strategyId);
      const refresh = window.__TALARIA_V16_REFRESH_STRATEGY_BANK__;
      if (typeof refresh === "function") await refresh();
    };

    window.__TALARIA_V16_REFRESH_COMMUNITY__ = async () => {
      const rows = await fetchCommunityTemplates().catch(() => []);
      if (window.__TALARIA_V16_BOOT__) {
        window.__TALARIA_V16_BOOT__.communityStrategies = rows;
        window.dispatchEvent(new CustomEvent("talaria-v16-boot-updated"));
      }
      return rows;
    };

    window.__TALARIA_V16_CLONE_COMMUNITY_TEMPLATE__ = async (templateId, name) => {
      const saved = await cloneCommunityTemplate(templateId, name);
      const refreshBank = window.__TALARIA_V16_REFRESH_STRATEGY_BANK__;
      if (typeof refreshBank === "function") {
        await refreshBank().catch(() => {
          if (window.__TALARIA_V16_BOOT__) {
            const bank = window.__TALARIA_V16_BOOT__.strategyBank || [];
            const idx = bank.findIndex((row) => String(row?.id) === String(saved.id));
            const next =
              idx >= 0 ? bank.map((row, i) => (i === idx ? saved : row)) : [saved, ...bank];
            window.__TALARIA_V16_BOOT__.strategyBank = next;
            window.dispatchEvent(new CustomEvent("talaria-v16-boot-updated"));
          }
        });
      }
      const refreshCommunity = window.__TALARIA_V16_REFRESH_COMMUNITY__;
      if (typeof refreshCommunity === "function") {
        await refreshCommunity().catch(() => {});
      }
      return saved;
    };

    window.__TALARIA_V16_SUBMIT_COMMUNITY_STRATEGY__ = async (strategyId, options) => {
      const templateId = await submitStrategyToCommunity(strategyId, options as never);
      const refreshCommunity = window.__TALARIA_V16_REFRESH_COMMUNITY__;
      if (typeof refreshCommunity === "function") {
        await refreshCommunity().catch(() => {});
      }
      return templateId;
    };

    return () => {
      delete window.__TALARIA_V16_FETCH_TRADES_FOR_SESSION__;
      delete window.__TALARIA_V16_SAVE_MANUAL_TRADE__;
      delete window.__TALARIA_V16_SAVE_MANUAL_JOURNAL_TRADE__;
      delete window.__TALARIA_V16_REFRESH_STRATEGY_BANK__;
      delete window.__TALARIA_V16_SAVE_STRATEGY__;
      delete window.__TALARIA_V16_DELETE_STRATEGY__;
      delete window.__TALARIA_V16_REFRESH_COMMUNITY__;
      delete window.__TALARIA_V16_CLONE_COMMUNITY_TEMPLATE__;
      delete window.__TALARIA_V16_SUBMIT_COMMUNITY_STRATEGY__;
    };
  }, []);

  /** Fast path: sessions + journal metadata. Heavy KPIs / entries / community load in background. */
  useLayoutEffect(() => {
    let cancelled = false;
    const hadSessions = Boolean(window.__TALARIA_V16_BOOT__?.sessions?.length);

    window.__TALARIA_V16_BOOT_LOADING__ = true;
    window.__TALARIA_V16_BOOT_ENRICHING__ = true;
    window.dispatchEvent(new CustomEvent("talaria-v16-boot-updated"));

    if (!hadSessions) {
      setState({ status: "loading" });
    }

    const enrichGen = ++enrichGenRef.current;

    (async () => {
      try {
        const [sessionsPayload, journalPayload] = await Promise.all([
          fetchJson<{ sessions: Session[] }>("/api/sessions"),
          fetchJournalApiData({ includeEntries: false }).catch(() => EMPTY_JOURNAL_PAYLOAD),
        ]);

        if (cancelled) return;

        const apiSessions = sessionsPayload.sessions ?? [];
        const boot = buildBootFromPayloads(
          apiSessions,
          {},
          journalPayload,
          window.__TALARIA_V16_BOOT__?.communityStrategies ?? [],
          searchParams.get("sessionId")
        );

        window.__TALARIA_V16_BOOT_LOADING__ = false;
        publishBoot(boot);
        setState({ status: "ready", boot });
        window.dispatchEvent(new CustomEvent("talaria-v16-boot-updated"));

        void (async () => {
          try {
            const [kpisPayload, journalFull, communityStrategies] = await Promise.all([
              fetchJson<{ kpis_by_session_id?: Record<string, SessionKpis> }>(
                "/api/sessions/kpis"
              ).catch(() => ({ kpis_by_session_id: {} })),
              fetchJournalApiData({ includeEntries: true }).catch(() => EMPTY_JOURNAL_PAYLOAD),
              fetchCommunityTemplates().catch(() => [] as Record<string, unknown>[]),
            ]);

            if (cancelled || enrichGenRef.current !== enrichGen) return;

            const kpisMap: Record<string, SessionKpis> =
              kpisPayload.kpis_by_session_id ?? {};
            const enriched = buildBootFromPayloads(
              apiSessions,
              kpisMap,
              journalFull,
              communityStrategies,
              searchParams.get("sessionId")
            );

            window.__TALARIA_V16_BOOT_ENRICHING__ = false;
            publishBoot(enriched);
            setState({ status: "ready", boot: enriched });
            window.dispatchEvent(new CustomEvent("talaria-v16-boot-updated"));
          } catch (err) {
            console.warn("[V16] background boot enrich failed:", err);
            if (!cancelled && enrichGenRef.current === enrichGen) {
              window.__TALARIA_V16_BOOT_ENRICHING__ = false;
              window.dispatchEvent(new CustomEvent("talaria-v16-boot-updated"));
            }
          }
        })();
      } catch (e) {
        if (cancelled) return;
        window.__TALARIA_V16_BOOT_LOADING__ = false;
        window.__TALARIA_V16_BOOT_ENRICHING__ = false;
        window.dispatchEvent(new CustomEvent("talaria-v16-boot-updated"));
        setState({
          status: "error",
          message: e instanceof Error ? e.message : String(e),
        });
      }
    })();

    return () => {
      cancelled = true;
      window.__TALARIA_V16_BOOT_LOADING__ = false;
      window.__TALARIA_V16_BOOT_ENRICHING__ = false;
    };
  }, [bootNonce]);

  /** URL session change: update selection only — no full API refetch. */
  useEffect(() => {
    const boot = window.__TALARIA_V16_BOOT__;
    if (!boot?.sessions?.length || !urlSessionId) return;

    const key = String(urlSessionId).trim();
    if (!isUsableDashboardSessionId(key)) return;
    const allowed = boot.sessions.some((s) => String(s.id) === key);
    if (!allowed || String(boot.openSessionId) === key) return;

    boot.openSessionId = key;
    window.dispatchEvent(new CustomEvent("talaria-v16-boot-updated"));
  }, [urlSessionId]);

  return state;
}
