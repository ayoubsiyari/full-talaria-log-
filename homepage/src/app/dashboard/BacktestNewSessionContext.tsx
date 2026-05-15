"use client";

import * as React from "react";

export type BacktestNewSessionRegisterFn = (fn: (() => void) | null) => void;

const BacktestNewSessionContext = React.createContext<BacktestNewSessionRegisterFn | null>(null);

export function BacktestNewSessionProvider({
  register,
  children,
}: {
  register: BacktestNewSessionRegisterFn;
  children: React.ReactNode;
}) {
  return <BacktestNewSessionContext.Provider value={register}>{children}</BacktestNewSessionContext.Provider>;
}

export function useOptionalBacktestNewSessionRegister(): BacktestNewSessionRegisterFn | null {
  return React.useContext(BacktestNewSessionContext);
}
