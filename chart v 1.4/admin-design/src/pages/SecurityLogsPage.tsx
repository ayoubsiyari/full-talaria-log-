import { useCallback, useEffect, useState } from "react";
import { Button } from "@heroui/react";
import { journalApi } from "@/api/journalClient";
import { PageShell, PanelCard } from "@/components/PageShell";
import { SimpleTable } from "@/components/SimpleTable";
import { useToast } from "@/hooks/useToast";

type LogRow = { timestamp?: string; action?: string; details?: string };

export function SecurityLogsPage() {
  const { toast } = useToast();
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await journalApi<{ logs?: LogRow[] }>("/journal/api/admin/logs?limit=100");
      setLogs(data.logs ?? []);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Load failed", "danger");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <PageShell
      title="Security Logs"
      description="Journal admin security event log."
      loading={loading}
      actions={
        <Button size="sm" variant="secondary" onPress={() => void load()}>
          Refresh
        </Button>
      }
    >
      <PanelCard title="Recent events">
        <SimpleTable
          columns={["Timestamp", "Action", "Details"]}
          rows={logs.map((l) => [
            l.timestamp ? new Date(l.timestamp).toLocaleString() : "—",
            l.action ?? "",
            l.details ?? "",
          ])}
          empty="No security logs"
        />
      </PanelCard>
    </PageShell>
  );
}
