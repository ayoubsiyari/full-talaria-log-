import { useCallback, useEffect, useState } from "react";
import { Button } from "@heroui/react";
import { chartApi } from "@/api/chartClient";
import { useAdminData } from "@/context/AdminDataContext";
import { PageShell, PanelCard } from "@/components/PageShell";
import { timeAgo } from "@/lib/utils";
import { useToast } from "@/hooks/useToast";

export function SessionsPage() {
  const { allSessions, setAllSessions, refreshCore } = useAdminData();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await chartApi<{ sessions?: Record<string, unknown>[] }>("/api/admin/sessions");
      setAllSessions(data.sessions ?? []);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Load failed", "danger");
    } finally {
      setLoading(false);
    }
  }, [setAllSessions, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const kill = async (sid: string) => {
    if (!confirm("Terminate this session?")) return;
    try {
      await chartApi(`/api/admin/sessions/${sid}`, { method: "DELETE" });
      toast("Session terminated", "success");
      await load();
      await refreshCore();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed", "danger");
    }
  };

  return (
    <PageShell
      title="Live Sessions"
      actions={
        <Button size="sm" variant="secondary" onPress={() => void load()}>
          Refresh
        </Button>
      }
      loading={loading}
    >
      <PanelCard title="Active connections" badge={<span className="text-xs">{allSessions.length}</span>}>
        {allSessions.length === 0 ? (
          <p className="py-8 text-center text-sm text-default-500">No active sessions</p>
        ) : (
          <div className="divide-y divide-divider">
            {allSessions.map((s, i) => {
              const diff = (Date.now() - new Date(String(s.last_active_at)).getTime()) / 1000;
              const dot =
                diff < 120 ? "bg-success" : diff < 600 ? "bg-warning" : "bg-default-400";
              return (
                <div key={i} className="flex items-center gap-3 py-3">
                  <span className={`h-2 w-2 rounded-full ${dot}`} />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-sm">{String(s.user_name || s.user_email || "Unknown")}</div>
                    <div className="text-xs text-default-500">
                      {String(s.ip_address || "—")} · {timeAgo(String(s.last_active_at))}
                    </div>
                  </div>
                  <Button size="sm" variant="danger" onPress={() => kill(String(s.id))}>
                    Kill
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </PanelCard>
    </PageShell>
  );
}
