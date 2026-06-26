"use client";

import * as React from "react";
import {
  LiveJournalNewAccountModal,
  type LiveJournalNewAccountInitialState,
} from "@/app/dashboard/LiveJournalNewAccountModal";
import { LiveJournalLimitModal } from "@/app/dashboard/LiveJournalLimitModal";
import type { ApiLiveJournalAccount, V16AccountTypeKey } from "@/app/dashboard/v16/v16SourceTypes";
import {
  fetchLiveJournalLimits,
  isLiveJournalTypeAtLimit,
  type LiveJournalAccountTypeKey,
  type LiveJournalLimitsPayload,
} from "@/lib/liveJournalLimits";

export type LiveJournalNewAccountRegisterFn = (
  fn: ((opts?: LiveJournalNewAccountOpenOptions) => void) | null
) => void;

export type LiveJournalNewAccountOpenOptions = {
  accountTypeKey?: V16AccountTypeKey;
  /** Lock to Personal or Prop tab (no switching) when set from the New Session picker. */
  lockAccountType?: boolean;
  /** After save, switch embedded V16 to Trades and open Add Trade for the new account. */
  goToTradesAfterCreate?: boolean;
  /** After save, switch embedded V16 to Trades and open CSV import for the new account. */
  goToCsvImportAfterCreate?: boolean;
  /** Edit an existing persisted live journal account. */
  editAccount?: ApiLiveJournalAccount | null;
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
  const [journalLimits, setJournalLimits] = React.useState<LiveJournalLimitsPayload | null>(null);
  const [limitGate, setLimitGate] = React.useState<{
    type: LiveJournalAccountTypeKey;
    limits: LiveJournalLimitsPayload;
  } | null>(null);
  const onSavedListenersRef = React.useRef(new Set<() => void>());
  const pendingOpenOptionsRef = React.useRef<LiveJournalNewAccountOpenOptions | null>(null);

  const openNewLiveJournal = React.useCallback((opts?: LiveJournalNewAccountOpenOptions) => {
    pendingOpenOptionsRef.current = opts || null;
    const typeKey: V16AccountTypeKey = opts?.editAccount?.account_type === "prop" || opts?.accountTypeKey === "prop" ? "prop" : "personal";

    const launch = (limits: LiveJournalLimitsPayload | null) => {
      if (!opts?.editAccount && isLiveJournalTypeAtLimit(limits, typeKey)) {
        if (limits) setLimitGate({ type: typeKey, limits });
        return;
      }
      setJournalLimits(limits);
      setInitialState({
        accountTypeKey: typeKey,
        lockAccountType: Boolean(opts?.lockAccountType || opts?.editAccount),
        editAccount: opts?.editAccount || null,
      });
      setOpen(true);
    };

    if (opts?.editAccount) {
      launch(null);
      return;
    }

    void fetchLiveJournalLimits().then(launch);
  }, []);

  React.useEffect(() => {
    register(openNewLiveJournal);
    return () => register(null);
  }, [register, openNewLiveJournal]);

  React.useEffect(() => {
    window.__TALARIA_OPEN_NEW_LIVE_JOURNAL__ = (opts?: LiveJournalNewAccountOpenOptions) => {
      openNewLiveJournal(opts);
    };
    window.__TALARIA_EDIT_LIVE_JOURNAL__ = (opts?: { account?: ApiLiveJournalAccount | null; accountId?: number }) => {
      if (opts?.account) {
        openNewLiveJournal({ editAccount: opts.account, lockAccountType: true });
        return;
      }
      if (opts?.accountId != null) {
        void (async () => {
          try {
            const { syncJournalTokenFromSession, JOURNAL_API_BASE } = await import("@/lib/journalApi");
            const { authHeaders } = await import("@/app/dashboard/strategies/strategyLabV9Auth");
            await syncJournalTokenFromSession();
            const res = await fetch(`${JOURNAL_API_BASE}/journal/live-accounts/${opts.accountId}`, {
              headers: authHeaders(),
            });
            const data = (await res.json()) as { success?: boolean; account?: ApiLiveJournalAccount };
            if (res.ok && data.success && data.account) {
              openNewLiveJournal({ editAccount: data.account, lockAccountType: true });
            }
          } catch {
            /* ignore */
          }
        })();
      }
    };
    window.__TALARIA_DELETE_LIVE_JOURNAL__ = async (accountId: number) => {
      try {
        const { syncJournalTokenFromSession, JOURNAL_API_BASE } = await import("@/lib/journalApi");
        const { authHeaders } = await import("@/app/dashboard/strategies/strategyLabV9Auth");
        await syncJournalTokenFromSession();
        const res = await fetch(`${JOURNAL_API_BASE}/journal/live-accounts/${accountId}`, {
          method: "DELETE",
          headers: authHeaders(),
        });
        const data = (await res.json()) as { success?: boolean };
        if (!res.ok || !data.success) return false;
        window.dispatchEvent(new CustomEvent("talaria-v16-reload-boot"));
        return true;
      } catch {
        return false;
      }
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
      delete window.__TALARIA_EDIT_LIVE_JOURNAL__;
      delete window.__TALARIA_DELETE_LIVE_JOURNAL__;
      delete window.__TALARIA_ACTIVATE_LIVE_JOURNAL__;
    };
  }, [openNewLiveJournal]);

  const registerOnSaved = React.useCallback((fn: () => void) => {
    onSavedListenersRef.current.add(fn);
    return () => {
      onSavedListenersRef.current.delete(fn);
    };
  }, []);

  const handleSaved = React.useCallback(async (account?: Record<string, unknown>) => {
    const opts = pendingOpenOptionsRef.current;
    pendingOpenOptionsRef.current = null;
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("talaria-v16-reload-boot"));
      window.dispatchEvent(new CustomEvent("talaria-v16-close-source"));
      if (!opts?.editAccount && (opts?.goToTradesAfterCreate || opts?.goToCsvImportAfterCreate)) {
        window.dispatchEvent(
          new CustomEvent("talaria-v16-journal-created", {
            detail: {
              account: account || {},
              goToTradesAfterCreate: !!opts?.goToTradesAfterCreate,
              goToCsvImportAfterCreate: !!opts?.goToCsvImportAfterCreate,
            },
          })
        );
      }
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
    pendingOpenOptionsRef.current = null;
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
        journalLimits={journalLimits}
      />
      <LiveJournalLimitModal
        open={!!limitGate}
        accountType={limitGate?.type || "personal"}
        limits={limitGate?.limits || null}
        onClose={() => setLimitGate(null)}
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
