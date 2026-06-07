import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

type ToastType = "default" | "success" | "danger";

type ToastState = { message: string; type: ToastType } | null;

type ToastContextValue = {
  toast: (message: string, type?: ToastType) => void;
  state: ToastState;
  clear: () => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ToastState>(null);
  const toast = useCallback((message: string, type: ToastType = "default") => {
    setState({ message, type });
    window.setTimeout(() => setState(null), 3200);
  }, []);
  const clear = useCallback(() => setState(null), []);
  const value = useMemo(() => ({ toast, state, clear }), [toast, state, clear]);
  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast requires ToastProvider");
  return ctx;
}
