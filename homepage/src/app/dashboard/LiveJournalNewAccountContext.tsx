"use client";

import * as React from "react";
import {
  LiveJournalNewAccountModal,
  type LiveJournalNewAccountInitialState,
} from "@/app/dashboard/LiveJournalNewAccountModal";
import type { V16AccountTypeKey } from "@/app/dashboard/v16/v16SourceTypes";

export type LiveJournalNewAccountRegisterFn = (
  fn: ((opts?: LiveJournalNewAccountOpenOptions) => void) | null
) => void;

export type LiveJournalNewAccountOpenOptions = {
  accountTypeKey?: V16AccountTypeKey;
};

type LiveJournalNewAccountContextValue = {
  openNewLiveJournal: (opts?: LiveJournalNewAccountOpenOptions) => void;
  registerOnSaved: (fn: () => void) => () => void;
};

const LiveJournalNewAccountContext = React.createContext<LiveJournalNewAccountContextValue | null>(null);

export function LiveJournalNewAccountProvider({
  register,
  children,
}: {
  register: LiveJournalNewAccountRegisterFn;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const [initialState, setInitialState] = React.useState<LiveJournalNewAccountInitialState | null>(null);
  const onSavedListenersRef = React.useRef(new Set<() => void>());

  const openNewLiveJournal = React.useCallback((opts?: LiveJournalNewAccountOpenOptions) => {
    setInitialState({
      accountTypeKey: opts?.accountTypeKey === "prop" ? "prop" : "personal",
    });
    setOpen(true);
  }, []);

  React.useEffect(() => {
    register(openNewLiveJournal);
    return () => register(null);
  }, [register, openNewLiveJournal]);

  React.useEffect(() => {
    window.__TALARIA_OPEN_NEW_LIVE_JOURNAL__ = (opts?: LiveJournalNewAccountOpenOptions) => {
      openNewLiveJournal(opts);
    };
    window.__TALARIA_ACTIVATE_LIVE_JOURNAL__ = async (accountId: number) => {
      try {
        const { syncJournalTokenFromSession, JOURNAL_API_BASE } = await import("@/lib/journalApi");
        const { authHeaders } = await import("@/app/dashboard/strategies/strategyLabV9Auth");
        await syncJournalTokenFromSession();
        await fetch(`${JOURNAL_API_BASE}/journal/live-accounts/${accountId}/activate`, {
          method: "POST",
          headers: authHeaders(),
        });
      } catch {
        /* best effort */
      }
    };
    return () => {
      delete window.__TALARIA_OPEN_NEW_LIVE_JOURNAL__;
      delete window.__TALARIA_ACTIVATE_LIVE_JOURNAL__;
    };
  }, [openNewLiveJournal]);

  const registerOnSaved = React.useCallback((fn: () => void) => {
    onSavedListenersRef.current.add(fn);
    return () => {
      onSavedListenersRef.current.delete(fn);
    };
  }, []);

  const handleSaved = React.useCallback(async () => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("talaria-v16-reload-boot"));
      window.dispatchEvent(new CustomEvent("talaria-v16-close-source"));
    }
    for (const fn of onSavedListenersRef.current) {
      try {
        await fn();
      } catch {
        /* ignore listener errors */
      }
    }
  }, []);

  const handleClose = React.useCallback(() => {
    setOpen(false);
    setInitialState(null);
  }, []);

  const value = React.useMemo(
    () => ({ openNewLiveJournal, registerOnSaved }),
    [openNewLiveJournal, registerOnSaved]
  );

  return (
    <LiveJournalNewAccountContext.Provider value={value}>
      {children}
      <LiveJournalNewAccountModal
        open={open}
        onClose={handleClose}
        onSaved={handleSaved}
        initialState={initialState}
      />
    </LiveJournalNewAccountContext.Provider>
  );
}

export function useLiveJournalNewAccount(): LiveJournalNewAccountContextValue {
  const ctx = React.useContext(LiveJournalNewAccountContext);
  if (!ctx) {
    throw new Error("useLiveJournalNewAccount must be used within LiveJournalNewAccountProvider");
  }
  return ctx;
}
