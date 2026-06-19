"use client";

import * as React from "react";
import {
  BacktestNewSessionModal,
  type BacktestNewSessionInitialState,
} from "./BacktestNewSessionModal";

export type BacktestNewSessionRegisterFn = (fn: (() => void) | null) => void;

export type BacktestNewSessionOpenOptions = {
  strategyId?: number;
  strategyName?: string;
};

type BacktestNewSessionContextValue = {
  openNewSession: (opts?: BacktestNewSessionOpenOptions) => void;
  registerOnSaved: (fn: () => void) => () => void;
};

const BacktestNewSessionContext = React.createContext<BacktestNewSessionContextValue | null>(null);

export function BacktestNewSessionProvider({
  register,
  children,
}: {
  register: BacktestNewSessionRegisterFn;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const [initialState, setInitialState] = React.useState<BacktestNewSessionInitialState | null>(null);
  const onSavedListenersRef = React.useRef(new Set<() => void>());

  const openNewSession = React.useCallback((opts?: BacktestNewSessionOpenOptions) => {
    const id = opts?.strategyId;
    const playbook =
      typeof id === "number" && Number.isFinite(id) && id > 0 ? `strategy:${id}` : "";
    const stratName = (opts?.strategyName || "").trim();
    const name = stratName ? `${stratName} Backtest` : "";
    setInitialState({
      playbook,
      sessionName: name,
    });
    setOpen(true);
  }, []);

  React.useEffect(() => {
    register(() => openNewSession());
    return () => register(null);
  }, [register, openNewSession]);

  React.useEffect(() => {
    window.__TALARIA_OPEN_NEW_SESSION__ = (opts?: BacktestNewSessionOpenOptions) => {
      openNewSession(opts);
    };
    return () => {
      delete window.__TALARIA_OPEN_NEW_SESSION__;
    };
  }, [openNewSession]);

  const registerOnSaved = React.useCallback((fn: () => void) => {
    onSavedListenersRef.current.add(fn);
    return () => {
      onSavedListenersRef.current.delete(fn);
    };
  }, []);

  const handleSaved = React.useCallback(async () => {
    for (const fn of onSavedListenersRef.current) {
      try {
        await fn();
      } catch {
        /* listener errors should not block modal close */
      }
    }
  }, []);

  const handleClose = React.useCallback(() => {
    setOpen(false);
    setInitialState(null);
  }, []);

  const value = React.useMemo(
    () => ({ openNewSession, registerOnSaved }),
    [openNewSession, registerOnSaved],
  );

  return (
    <BacktestNewSessionContext.Provider value={value}>
      {children}
      <BacktestNewSessionModal
        open={open}
        onClose={handleClose}
        onSaved={handleSaved}
        initialState={initialState}
      />
    </BacktestNewSessionContext.Provider>
  );
}

export function useBacktestNewSession(): BacktestNewSessionContextValue {
  const ctx = React.useContext(BacktestNewSessionContext);
  if (!ctx) {
    throw new Error("useBacktestNewSession must be used within BacktestNewSessionProvider");
  }
  return ctx;
}

export function useOptionalBacktestNewSession(): BacktestNewSessionContextValue | null {
  return React.useContext(BacktestNewSessionContext);
}

/** @deprecated Use useBacktestNewSession / useOptionalBacktestNewSession */
export function useOptionalBacktestNewSessionRegister(): BacktestNewSessionRegisterFn | null {
  return null;
}
