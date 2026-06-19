"use client";

import { useLayoutEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { fetchJson } from "../analytics/SessionAnalyticsPanel";
import { resolveSessionIdForUser, type Session } from "../analytics/sessionSelection";
import type { V16LiveBoot } from "./v16LiveGlobals";
import {
  fetchJournalTradesForSession,
  mapApiSessionToV16,
  mapJournalRowToV16Trade,
  type SessionKpis,
} from "./v16Mappers";

type BootState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; boot: V16LiveBoot };

export function useV16LiveBootstrap(): BootState {
  const searchParams = useSearchParams();
  const urlSessionId = searchParams.get("sessionId");
  const [state, setState] = useState<BootState>({ status: "loading" });

  const reloadKey = useMemo(
    () => `${urlSessionId ?? ""}:${searchParams.get("strategy") ?? ""}`,
    [searchParams, urlSessionId]
  );

  useLayoutEffect(() => {
    let cancelled = false;

    (async () => {
      setState({ status: "loading" });
      try {
        const [sessionsPayload, kpisPayload] = await Promise.all([
          fetchJson<{ sessions: Session[] }>("/api/sessions"),
          fetchJson<{ kpis_by_session_id?: Record<string, SessionKpis> }>("/api/sessions/kpis").catch(
            () => ({ kpis_by_session_id: {} })
          ),
        ]);

        const apiSessions = sessionsPayload.sessions ?? [];
        const kpisMap: Record<string, SessionKpis> = kpisPayload.kpis_by_session_id ?? {};
        const openSessionId = resolveSessionIdForUser(apiSessions, {
          urlSessionId,
          useChartStorage: false,
          kpisBySessionId: kpisMap,
        });

        const tradesBySessionId: Record<string, Record<string, unknown>[]> = {};
        const v16Sessions: Record<string, unknown>[] = [];

        await Promise.all(
          apiSessions.map(async (sess) => {
            const rawRows = await fetchJournalTradesForSession(sess.id);
            const mapped = rawRows.map((row, i) => mapJournalRowToV16Trade(row, sess as never, i));
            tradesBySessionId[String(sess.id)] = mapped;
            const kpis = kpisMap[String(sess.id)];
            v16Sessions.push(mapApiSessionToV16(sess as never, kpis, mapped));
          })
        );

        if (cancelled) return;

        const boot: V16LiveBoot = {
          sessions: v16Sessions,
          tradesBySessionId,
          openSessionId: openSessionId || ((v16Sessions[0] as { id?: number })?.id ?? null),
        };

        window.__TALARIA_V16_LIVE__ = true;
        window.__TALARIA_V16_EMBEDDED__ = true;
        window.__TALARIA_V16_BOOT__ = boot;
        window.__TALARIA_V16_TRADES__ = tradesBySessionId;

        setState({ status: "ready", boot });
      } catch (e) {
        if (cancelled) return;
        setState({
          status: "error",
          message: e instanceof Error ? e.message : String(e),
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [reloadKey, urlSessionId]);

  return state;
}
