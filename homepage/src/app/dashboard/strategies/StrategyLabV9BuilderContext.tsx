"use client";

import * as React from "react";

export type StrategyLabV9OpenBuilderRegisterFn = (fn: (() => void) | null) => void;

const StrategyLabV9BuilderContext = React.createContext<StrategyLabV9OpenBuilderRegisterFn | null>(null);

export function StrategyLabV9BuilderProvider({
  register,
  children,
}: {
  register: StrategyLabV9OpenBuilderRegisterFn;
  children: React.ReactNode;
}) {
  return (
    <StrategyLabV9BuilderContext.Provider value={register}>{children}</StrategyLabV9BuilderContext.Provider>
  );
}

export function useOptionalStrategyLabV9OpenBuilderRegister(): StrategyLabV9OpenBuilderRegisterFn | null {
  return React.useContext(StrategyLabV9BuilderContext);
}
