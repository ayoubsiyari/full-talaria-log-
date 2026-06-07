import { useCallback, useEffect, useState } from "react";
import { Button, Card } from "@heroui/react";
import { chartApi } from "@/api/chartClient";
import { journalApi } from "@/api/journalClient";
import { PageShell, PanelCard } from "@/components/PageShell";
import { SimpleTable } from "@/components/SimpleTable";
import { useToast } from "@/hooks/useToast";

export function InsightsPage() {
  const { toast } = useToast();
  const [metrics, setMetrics] = useState<Record<string, unknown> | null>(null);
  const [disk, setDisk] = useState<Record<string, unknown> | null>(null);
  const [threats, setThreats] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [m, d, t] = await Promise.allSettled([
        chartApi<Record<string, unknown>>("/api/admin/system/metrics"),
        chartApi<Record<string, unknown>>("/api/admin/system/disk-health"),
        journalApi<{ threats?: Record<string, unknown>[] }>("/journal/api/admin/monitoring/threats"),
      ]);
      if (m.status === "fulfilled") setMetrics(m.value);
      if (d.status === "fulfilled") setDisk(d.value);
      if (t.status === "fulfilled") setThreats(t.value.threats ?? []);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Load failed", "danger");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const archiveSessions = async () => {
    try {
      await chartApi("/api/admin/system/archive-stale-sessions", { method: "POST" });
      toast("Archive job started", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed", "danger");
    }
  };

  const pruneAttachments = async () => {
    try {
      await chartApi("/api/admin/system/prune-support-attachments", { method: "POST" });
      toast("Prune job started", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed", "danger");
    }
  };

  const cpu = metrics?.cpu as { percent?: number } | undefined;
  const mem = metrics?.memory as { percent?: number; used?: number; total?: number } | undefined;

  return (
    <PageShell
      title="Analytics & VPS"
      loading={loading}
      actions={
        <>
          <Button size="sm" variant="ghost" onPress={() => void archiveSessions()}>Archive sessions</Button>
          <Button size="sm" variant="ghost" onPress={() => void pruneAttachments()}>Prune attachments</Button>
          <Button size="sm" variant="secondary" onPress={() => void load()}>Refresh</Button>
        </>
      }
    >
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-4">
          <div className="text-xs text-default-500">CPU</div>
          <div className="text-2xl font-bold">{cpu?.percent != null ? `${cpu.percent}%` : "—"}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-default-500">Memory</div>
          <div className="text-2xl font-bold">{mem?.percent != null ? `${mem.percent}%` : "—"}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-default-500">Disk health</div>
          <div className="text-sm mt-1">{disk ? JSON.stringify(disk).slice(0, 120) : "—"}</div>
        </Card>
      </div>

      <PanelCard title="Security threats (journal)" className="mt-4">
        <SimpleTable
          columns={["Type", "Detail"]}
          rows={threats.map((t) => [String(t.type ?? t.kind ?? "—"), String(t.message ?? t.detail ?? JSON.stringify(t).slice(0, 80))])}
          empty="No threats reported"
        />
      </PanelCard>
    </PageShell>
  );
}
