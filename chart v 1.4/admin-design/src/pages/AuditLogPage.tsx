import { useCallback, useEffect, useState } from "react";
import { Button, Input } from "@heroui/react";
import { chartApi } from "@/api/chartClient";
import { PageShell, PanelCard } from "@/components/PageShell";
import { SimpleTable } from "@/components/SimpleTable";
import { useToast } from "@/hooks/useToast";

type AuditEntry = {
  created_at?: string;
  action?: string;
  admin_email?: string;
  admin_user_id?: number;
  status?: string;
  method?: string;
  path?: string;
  target_type?: string;
  target_id?: number;
};

export function AuditLogPage() {
  const { toast } = useToast();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const limit = 50;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
      if (q.trim()) params.set("q", q.trim());
      const data = await chartApi<{ entries?: AuditEntry[]; total?: number }>(
        `/api/admin/audit-log?${params}`
      );
      setEntries(data.entries ?? []);
      setTotal(data.total ?? data.entries?.length ?? 0);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Load failed", "danger");
    } finally {
      setLoading(false);
    }
  }, [offset, q, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <PageShell
      title="Audit log"
      description="Append-only trail of mutating admin API requests."
      loading={loading}
      actions={
        <>
          <Input
            size="sm"
            placeholder="Search…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-48"
          />
          <Button size="sm" variant="secondary" onPress={() => { setOffset(0); void load(); }}>
            Refresh
          </Button>
        </>
      }
    >
      <PanelCard title="Entries" badge={<span className="text-xs text-default-500">{total} total</span>}>
        <SimpleTable
          columns={["When", "Action", "Admin", "Status", "Method", "Path", "Target"]}
          rows={entries.map((row) => [
            row.created_at ? new Date(row.created_at).toLocaleString() : "—",
            row.action ?? "",
            row.admin_email ?? (row.admin_user_id != null ? `#${row.admin_user_id}` : "—"),
            row.status ?? "",
            row.method ?? "",
            <code key="p" className="text-xs break-all">{row.path ?? ""}</code>,
            row.target_type && row.target_id ? `${row.target_type}:${row.target_id}` : "—",
          ])}
          empty="No audit entries"
        />
        <div className="mt-4 flex items-center justify-between gap-2">
          <span className="text-xs text-default-500">
            {total ? `Showing ${offset + 1}–${Math.min(offset + entries.length, total)} of ${total}` : "No rows"}
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" isDisabled={offset <= 0} onPress={() => setOffset(Math.max(0, offset - limit))}>
              Previous
            </Button>
            <Button size="sm" variant="ghost" isDisabled={offset + entries.length >= total} onPress={() => setOffset(offset + limit)}>
              Next
            </Button>
          </div>
        </div>
      </PanelCard>
    </PageShell>
  );
}
