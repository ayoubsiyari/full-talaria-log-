import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { chartApi } from "@/api/chartClient";

export type AuthUser = {
  id: number;
  name?: string | null;
  email?: string | null;
  role?: string;
};

type AdminDataContextValue = {
  user: AuthUser | null;
  allUsers: Record<string, unknown>[];
  allSessions: Record<string, unknown>[];
  subStats: Record<string, unknown> | null;
  refreshCore: () => Promise<void>;
  setAllUsers: (u: Record<string, unknown>[]) => void;
  setAllSessions: (s: Record<string, unknown>[]) => void;
  setSubStats: (s: Record<string, unknown> | null) => void;
};

const AdminDataContext = createContext<AdminDataContextValue | null>(null);

export function AdminDataProvider({
  user,
  children,
}: {
  user: AuthUser;
  children: ReactNode;
}) {
  const [allUsers, setAllUsers] = useState<Record<string, unknown>[]>([]);
  const [allSessions, setAllSessions] = useState<Record<string, unknown>[]>([]);
  const [subStats, setSubStats] = useState<Record<string, unknown> | null>(null);

  const refreshCore = useCallback(async () => {
    const [usersR, sessionsR, statsR] = await Promise.allSettled([
      chartApi<{ users?: Record<string, unknown>[] }>("/api/admin/users"),
      chartApi<{ sessions?: Record<string, unknown>[] }>("/api/admin/sessions"),
      chartApi<Record<string, unknown>>("/api/admin/subscriptions/stats"),
    ]);
    if (usersR.status === "fulfilled") setAllUsers(usersR.value.users ?? []);
    if (sessionsR.status === "fulfilled") setAllSessions(sessionsR.value.sessions ?? []);
    if (statsR.status === "fulfilled") setSubStats(statsR.value);
  }, []);

  const value = useMemo(
    () => ({
      user,
      allUsers,
      allSessions,
      subStats,
      refreshCore,
      setAllUsers,
      setAllSessions,
      setSubStats,
    }),
    [user, allUsers, allSessions, subStats, refreshCore]
  );

  return (
    <AdminDataContext.Provider value={value}>{children}</AdminDataContext.Provider>
  );
}

export function useAdminData() {
  const ctx = useContext(AdminDataContext);
  if (!ctx) throw new Error("useAdminData requires AdminDataProvider");
  return ctx;
}
